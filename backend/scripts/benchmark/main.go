// Command benchmark exercises the project's actual implementations against local dependencies.
// Only the opt-in llm mode calls a paid provider. Use isolated MySQL/Redis data.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"interview-agents/internal/agents/llm"
	"interview-agents/internal/config"
	"interview-agents/internal/middleware"
	"interview-agents/internal/model"
	"interview-agents/internal/mq"
	"interview-agents/internal/payment"
	"interview-agents/internal/payment/webhook"
	"interview-agents/pkg/circuitbreaker"
	"interview-agents/pkg/ratelimiter"

	"github.com/cloudwego/eino/schema"
	"github.com/redis/go-redis/v9"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	mode            = flag.String("mode", "http", "seed, http, rpm, tpm, queue, queue-failure, db, webhook, circuit, reuse, llm, session")
	urls            = flag.String("urls", "http://127.0.0.1:18899/api/user/profile", "comma-separated URLs, round-robin")
	concurrency     = flag.Int("c", 50, "concurrent workers")
	requests        = flag.Int("n", 1000, "operations for fixed-count modes")
	httpWarmup      = flag.Duration("http-warmup", 0, "warm up using the same HTTP connections before measuring")
	duration        = flag.Duration("duration", 10*time.Second, "HTTP measurement duration")
	delay           = flag.Duration("delay", 500*time.Millisecond, "synthetic queue handler duration")
	consumers       = flag.Int("consumers", 1, "queue consumer instances")
	limit           = flag.Int("limit", 100, "shared RPM / TPM limit")
	subject         = flag.String("subject", "bench-subject", "shared quota subject")
	startAt         = flag.Int64("start-at", 0, "Unix milliseconds barrier for multiple processes")
	out             = flag.String("out", "", "JSON output file")
	redisAddr       = flag.String("redis", "127.0.0.1:16379", "disposable Redis address")
	expectedRecords = flag.Int("expected-records", -1, "validate record count on every successful response; -1 disables")
	expectedTotal   = flag.Int64("expected-total", -1, "validate total records on every successful response; -1 disables")
	prefill         = flag.Int("prefill", 0, "pre-allocate this many TPM entries before timing; use with tpm mode")
	fixtureRecords  = flag.Int("fixture-records", 1000, "total interview records to seed for fixture user 900001")
)

func main() {
	flag.Parse()
	log.SetOutput(io.Discard)
	var data map[string]any
	var err error
	switch *mode {
	case "seed":
		data, err = seed()
	case "http":
		data, err = httpLoad()
	case "rpm", "tpm":
		data, err = quota()
	case "queue", "queue-failure":
		data, err = queue()
	case "db":
		data, err = dbIdempotency()
	case "webhook":
		data, err = webhookIdempotency()
	case "circuit":
		data, err = circuit()
	case "reuse":
		data, err = reuse()
	case "llm":
		data, err = realLLM()
	case "session":
		data, err = sessionConcurrency()
	default:
		err = fmt.Errorf("unknown mode %q", *mode)
	}
	if data == nil {
		data = map[string]any{}
	}
	data["mode"] = *mode
	data["go_version"] = runtime.Version()
	data["os"] = runtime.GOOS
	data["arch"] = runtime.GOARCH
	data["gomaxprocs"] = runtime.GOMAXPROCS(0)
	data["recorded_at"] = time.Now().Format(time.RFC3339)
	if err != nil {
		data["error"] = err.Error()
	}
	payload, _ := json.MarshalIndent(data, "", "  ")
	if *out != "" {
		if e := os.WriteFile(*out, append(payload, '\n'), 0644); e != nil {
			panic(e)
		}
	}
	fmt.Println(string(payload))
	if err != nil {
		os.Exit(1)
	}
}

func database() (*gorm.DB, error) {
	dsn := os.Getenv("BENCH_MYSQL_DSN")
	if dsn == "" {
		dsn = "root:bench-local-only@tcp(127.0.0.1:13307)/interview_bench?charset=utf8mb4&parseTime=True&loc=Local"
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		return nil, err
	}
	sql, err := db.DB()
	if err != nil {
		return nil, err
	}
	sql.SetMaxOpenConns(100)
	sql.SetMaxIdleConns(10)
	model.SetDBGetter(func() *gorm.DB { return db })
	return db, nil
}
func redisClient() *redis.Client {
	return redis.NewClient(&redis.Options{Addr: *redisAddr, DB: 2, PoolSize: 100})
}
func barrier() {
	if *startAt > 0 {
		time.Sleep(time.Until(time.UnixMilli(*startAt)))
	}
}
func runWorkers(n, c int, fn func(int)) {
	var next atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < c; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				id := int(next.Add(1)) - 1
				if id >= n {
					return
				}
				fn(id)
			}
		}()
	}
	wg.Wait()
}
func percentile(values []float64, p float64) float64 {
	if len(values) == 0 {
		return 0
	}
	idx := int(math.Ceil(float64(len(values))*p)) - 1
	if idx < 0 {
		idx = 0
	}
	return values[idx]
}
func summary(lat []float64, elapsed time.Duration) map[string]any {
	sort.Float64s(lat)
	var sum float64
	for _, v := range lat {
		sum += v
	}
	mean := 0.0
	if len(lat) > 0 {
		mean = sum / float64(len(lat))
	}
	return map[string]any{"operations": len(lat), "elapsed_s": elapsed.Seconds(), "throughput_per_s": float64(len(lat)) / elapsed.Seconds(), "mean_ms": mean, "p50_ms": percentile(lat, .5), "p95_ms": percentile(lat, .95), "p99_ms": percentile(lat, .99)}
}

func seed() (map[string]any, error) {
	db, err := database()
	if err != nil {
		return nil, err
	}
	user := model.User{ID: 900001, Username: "benchmark-user", Email: "benchmark@example.invalid", PasswordHash: "not-a-login-password", Role: "user"}
	if err = db.Where("id = ?", user.ID).FirstOrCreate(&user).Error; err != nil {
		return nil, err
	}
	var count int64
	if err = db.Model(&model.InterviewRecord{}).Where("user_id = ?", user.ID).Count(&count).Error; err != nil {
		return nil, err
	}
	if count < int64(*fixtureRecords) {
		records := make([]model.InterviewRecord, int64(*fixtureRecords)-count)
		for i := range records {
			records[i] = model.InterviewRecord{UserID: user.ID, Type: "special", Domain: "Go", Difficulty: "medium", Status: "completed", Duration: 600}
		}
		if err = db.CreateInBatches(records, 100).Error; err != nil {
			return nil, err
		}
		count = int64(*fixtureRecords)
	}
	config.Global.Security.JWTSecret = "bench-only-do-not-deploy"
	config.Global.Security.JWTExpiration = "24h"
	token, err := middleware.GenerateToken(user.ID, user.Username, user.Role)
	if err != nil {
		return nil, err
	}
	tokenPath := os.Getenv("BENCH_TOKEN_FILE")
	if tokenPath != "" {
		if err = os.WriteFile(tokenPath, []byte(token), 0600); err != nil {
			return nil, err
		}
	}
	return map[string]any{"fixture_user_id": user.ID, "fixture_records": count, "token_saved": tokenPath != ""}, nil
}

func httpLoad() (map[string]any, error) {
	endpoints := strings.Split(*urls, ",")
	token := strings.TrimSpace(os.Getenv("BENCH_TOKEN"))
	tr := &http.Transport{MaxIdleConns: *concurrency * 2, MaxIdleConnsPerHost: *concurrency, MaxConnsPerHost: *concurrency}
	defer tr.CloseIdleConnections()
	client := &http.Client{Transport: tr, Timeout: 5 * time.Second}
	var mu sync.Mutex
	var lat []float64
	statuses := map[int]int{}
	var invalid int
	var errorSamples []map[string]any
	var sent atomic.Int64
	barrier()
	started := time.Now().Add(*httpWarmup)
	deadline := started.Add(*duration)
	var wg sync.WaitGroup
	for i := 0; i < *concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for time.Now().Before(deadline) {
				index := int(sent.Add(1)) - 1
				req, err := http.NewRequest("GET", endpoints[index%len(endpoints)], nil)
				if err != nil {
					panic(err)
				}
				if token != "" {
					req.Header.Set("Authorization", "Bearer "+token)
				}
				tick := time.Now()
				resp, err := client.Do(req)
				status := 0
				bad := false
				errText := ""
				if err == nil {
					status = resp.StatusCode
					body, e := io.ReadAll(resp.Body)
					resp.Body.Close()
					if e != nil {
						bad = true
					}
					if status == 200 {
						var result struct {
							Code int             `json:"code"`
							Data json.RawMessage `json:"data"`
						}
						if e = json.Unmarshal(body, &result); e != nil || result.Code != 200 || len(result.Data) == 0 || string(result.Data) == "null" {
							bad = true
						}
						if !bad && (*expectedRecords >= 0 || *expectedTotal >= 0) {
							var records struct {
								Records []json.RawMessage `json:"records"`
								Total   int64             `json:"total"`
							}
							if e = json.Unmarshal(result.Data, &records); e != nil || (*expectedRecords >= 0 && len(records.Records) != *expectedRecords) || (*expectedTotal >= 0 && records.Total != *expectedTotal) {
								bad = true
							}
						}
					}
					if status != 200 || bad {
						if len(body) > 512 {
							body = body[:512]
						}
						errText = string(body)
					}
				} else {
					errText = err.Error()
				}
				if tick.Before(started) {
					continue
				}
				elapsed := float64(time.Since(tick)) / float64(time.Millisecond)
				mu.Lock()
				lat = append(lat, elapsed)
				statuses[status]++
				if bad && status == 200 {
					invalid++
				}
				if errText != "" && len(errorSamples) < 5 {
					errorSamples = append(errorSamples, map[string]any{"status": status, "message": errText, "request_start_ms": float64(tick.Sub(started)) / float64(time.Millisecond)})
				}
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	elapsed := time.Since(started)
	data := summary(lat, elapsed)
	data["http_warmup_s"] = httpWarmup.Seconds()
	data["concurrency"] = *concurrency
	data["urls"] = endpoints
	data["status_counts"] = statuses
	data["error_samples"] = errorSamples
	data["expected_records"] = *expectedRecords
	data["expected_total"] = *expectedTotal
	data["invalid_200_bodies"] = invalid
	data["success_per_s"] = float64(statuses[200]-invalid) / elapsed.Seconds()
	data["measurement_type"] = "closed-loop, same-machine client; JWT + Redis HTTP limiter + real MySQL query"
	return data, nil
}

func quota() (map[string]any, error) {
	client := redisClient()
	defer client.Close()
	if err := client.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	cfg := ratelimiter.Config{Enabled: true, DefaultRPM: *limit, FailureMode: ratelimiter.FailureModeClosed}
	if *mode == "tpm" {
		cfg.DefaultRPM = 0
		cfg.DefaultTPM = *limit
	}
	limiter := ratelimiter.NewRedisRateLimiter(client, cfg)
	if *mode == "tpm" && *prefill > 0 {
		for i := 0; i < *prefill; i++ {
			if _, err := limiter.PreAllocateTokens(context.Background(), *subject, "bench-shared-model", 100); err != nil {
				return nil, fmt.Errorf("TPM prefill failed: %w", err)
			}
		}
	}
	var allowed, denied, failed atomic.Int64
	var mu sync.Mutex
	lat := make([]float64, 0, *requests)
	barrier()
	started := time.Now()
	runWorkers(*requests, *concurrency, func(i int) {
		tick := time.Now()
		var err error
		if *mode == "rpm" {
			err = limiter.AllowRequest(context.Background(), *subject, "bench-shared-model")
		} else {
			_, err = limiter.PreAllocateTokens(context.Background(), *subject, "bench-shared-model", 100)
		}
		if err == nil {
			allowed.Add(1)
		} else {
			var limited *ratelimiter.RateLimitError
			if errors.As(err, &limited) {
				denied.Add(1)
			} else {
				failed.Add(1)
			}
		}
		mu.Lock()
		lat = append(lat, float64(time.Since(tick))/float64(time.Millisecond))
		mu.Unlock()
	})
	data := summary(lat, time.Since(started))
	rpm, tpm, err := limiter.GetUsage(context.Background(), *subject, "bench-shared-model")
	data["allowed"] = allowed.Load()
	data["denied"] = denied.Load()
	data["dependency_errors"] = failed.Load()
	data["limit"] = *limit
	data["rpm_usage"] = rpm
	data["tpm_usage"] = tpm
	data["concurrency"] = *concurrency
	data["prefill_entries"] = *prefill
	return data, err
}

func queue() (map[string]any, error) {
	if *redisAddr != "127.0.0.1:16379" {
		return nil, errors.New("queue mode requires the documented disposable Redis at 127.0.0.1:16379")
	}
	client := redisClient()
	defer client.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	streams := []string{"interview:stream:evaluation_report", "interview:stream:topic_evaluation", "interview:stream:resume_parse"}
	keys := append(append([]string{}, streams...), streams[2]+":dead")
	if err := client.Del(ctx, keys...).Err(); err != nil {
		return nil, err
	}
	group := fmt.Sprintf("bench-%d", time.Now().UnixNano())
	producer := mq.NewRedisStreamQueue(client, group, "producer")
	defer producer.Close()
	n := *requests
	if *mode == "queue-failure" {
		n = 1
	}
	publishStart := time.Now()
	for i := 0; i < n; i++ {
		if err := producer.Publish(ctx, &mq.Message{Type: mq.MessageTypeResumeParse, Payload: map[string]any{"sequence": i}}); err != nil {
			return nil, err
		}
	}
	publishElapsed := time.Since(publishStart)
	var active, peak, processed atomic.Int64
	var mu sync.Mutex
	seen := map[int]int{}
	byConsumer := make([]int, *consumers)
	var lat []float64
	var workers []*mq.RedisStreamQueue
	started := time.Now()
	for c := 0; c < *consumers; c++ {
		idx := c
		options := mq.StreamOptions{}
		if *mode == "queue-failure" {
			options.RetryIdle = 300 * time.Millisecond
			options.PollInterval = 40 * time.Millisecond
		}
		q := mq.NewRedisStreamQueueWithOptions(client, group, fmt.Sprintf("worker-%d", idx), options)
		workers = append(workers, q)
		go q.Subscribe(ctx, func(ctx context.Context, msg *mq.Message) error {
			current := active.Add(1)
			for {
				old := peak.Load()
				if current <= old || peak.CompareAndSwap(old, current) {
					break
				}
			}
			defer active.Add(-1)
			if *mode == "queue-failure" {
				processed.Add(1)
				return errors.New("injected handler failure")
			}
			time.Sleep(*delay)
			mu.Lock()
			seen[int(msg.Payload["sequence"].(float64))]++
			byConsumer[idx]++
			lat = append(lat, float64(time.Since(started))/float64(time.Millisecond))
			mu.Unlock()
			processed.Add(1)
			return nil
		})
	}
	deadline := time.Now().Add(30 * time.Second)
	expectedAttempts := int64(n)
	if *mode == "queue-failure" {
		expectedAttempts = 3
	}
	for processed.Load() < expectedAttempts && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	completedElapsed := time.Since(started)
	var pending *redis.XPending
	for i := 0; i < 100; i++ {
		pending, _ = client.XPending(ctx, streams[2], group).Result()
		if pending != nil && pending.Count == 0 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	data := map[string]any{"published": n, "publish_elapsed_s": publishElapsed.Seconds(), "processed": processed.Load(), "unique_sequences": len(seen), "duplicates": 0, "peak_active_handlers": peak.Load(), "consumers": *consumers, "pool_capacity_per_consumer": 1000, "synthetic_handler_delay_ms": float64(*delay) / float64(time.Millisecond), "consume_elapsed_s": completedElapsed.Seconds(), "throughput_per_s": float64(processed.Load()) / completedElapsed.Seconds(), "processed_per_consumer": byConsumer}
	duplicates := 0
	for _, count := range seen {
		duplicates += count - 1
	}
	data["duplicates"] = duplicates
	if pending != nil {
		data["pending"] = pending.Count
	}
	cancel()
	for _, q := range workers {
		q.Close()
	}
	if *mode == "queue-failure" {
		data["dead_letters"] = client.XLen(context.Background(), streams[2]+":dead").Val()
		data["retry_idle_ms"] = 300
		if data["dead_letters"] != int64(1) {
			return data, errors.New("failed job missing from dead-letter stream")
		}
	}
	if processed.Load() != expectedAttempts || pending == nil || pending.Count != 0 {
		return data, errors.New("queue did not finish before timeout")
	}
	return data, nil
}

func dbIdempotency() (map[string]any, error) {
	db, err := database()
	if err != nil {
		return nil, err
	}
	report := uint64(time.Now().UnixNano())
	var failed atomic.Int64
	var mu sync.Mutex
	var lat []float64
	started := time.Now()
	runWorkers(*requests, *concurrency, func(i int) {
		tick := time.Now()
		err := model.InterviewEvaluationDao.UpsertEvaluation(&model.InterviewEvaluation{UserID: 900001, ReportID: report, Comment: fmt.Sprintf("benchmark %d", i), Score: 80, Deleted: 0})
		if err != nil {
			failed.Add(1)
		}
		mu.Lock()
		lat = append(lat, float64(time.Since(tick))/float64(time.Millisecond))
		mu.Unlock()
	})
	data := summary(lat, time.Since(started))
	var count int64
	err = db.Model(&model.InterviewEvaluation{}).Where("user_id = ? AND report_id = ?", 900001, report).Count(&count).Error
	data["rows_for_same_report"] = count
	data["errors"] = failed.Load()
	data["concurrency"] = *concurrency
	data["backend"] = "real MySQL, same-key write contention"
	return data, err
}
func webhookIdempotency() (map[string]any, error) {
	db, err := database()
	if err != nil {
		return nil, err
	}
	id := fmt.Sprintf("bench-%d", time.Now().UnixNano())
	order := &model.PaymentOrder{OrderNo: id, UserID: 900001, OrderType: model.OrderTypeOneTime, ProductCode: "bench", PriceCode: "bench", Amount: 100, Currency: "usd", Status: model.OrderStatusPendingPayment, Provider: "stripe", IdempotencyKey: id}
	if err = model.PaymentOrderDao.Create(db, order); err != nil {
		return nil, err
	}
	event := &payment.WebhookEvent{EventID: id, EventType: payment.EventPaymentSucceeded, RawType: "payment_intent.succeeded", Data: map[string]string{"order_no": id}, RawJSON: `{"benchmark":true}`}
	p := webhook.NewProcessor(db)
	var failed atomic.Int64
	started := time.Now()
	runWorkers(*requests, *concurrency, func(int) {
		if p.Process(context.Background(), payment.ProviderStripe, event) != nil {
			failed.Add(1)
		}
	})
	var count int64
	db.Model(&model.PaymentEvent{}).Where("source_event_id = ?", id).Count(&count)
	var stored model.PaymentEvent
	db.Where("source_event_id = ?", id).First(&stored)
	var storedOrder model.PaymentOrder
	db.Where("order_no = ?", id).First(&storedOrder)
	return map[string]any{"operations": *requests, "concurrency": *concurrency, "elapsed_s": time.Since(started).Seconds(), "errors": failed.Load(), "event_rows": count, "event_status": stored.Status, "order_status": storedOrder.Status, "scope": "processor + MySQL; provider signature verification not included"}, nil
}
func circuit() (map[string]any, error) {
	cb := circuitbreaker.NewCircuitBreaker("benchmark")
	calls, blocked := 0, 0
	for i := 0; i < 20; i++ {
		_, err := cb.Execute(func() (any, error) { calls++; return nil, errors.New("injected upstream failure") })
		if errors.Is(err, circuitbreaker.ErrOpen) {
			blocked++
		}
	}
	return map[string]any{"attempted": 20, "upstream_calls": calls, "fast_rejections": blocked, "scope": "failure injection into actual circuit-breaker component"}, nil
}
func reuse() (map[string]any, error) {
	var connections, calls atomic.Int64
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		io.Copy(io.Discard, r.Body)
		r.Body.Close()
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"id":"bench","object":"chat.completion","model":"bench","choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}`)
	}))
	srv.Config.ConnState = func(_ net.Conn, state http.ConnState) {
		if state == http.StateNew {
			connections.Add(1)
		}
	}
	srv.Start()
	defer srv.Close()
	config.Global.LLM = config.LLMConfig{APIKey: "benchmark-placeholder-key", BaseURL: srv.URL + "/v1", ModelName: "bench", ProviderName: "openai"}
	started := time.Now()
	for i := 0; i < *requests; i++ {
		m, err := llm.CreatOpenAiChatModel(context.Background(), 900001)
		if err != nil {
			return nil, err
		}
		resp, err := m.Generate(context.Background(), []*schema.Message{{Role: schema.User, Content: "test"}})
		if err != nil {
			return nil, err
		}
		if resp.Content != "ok" {
			return nil, errors.New("unexpected mock response")
		}
	}
	pooledConnections := connections.Load()
	pooledCalls := calls.Load()
	pooledTime := time.Since(started)
	connections.Store(0)
	calls.Store(0)
	for i := 0; i < *requests; i++ {
		tr := &http.Transport{DisableKeepAlives: true}
		client := &http.Client{Transport: tr}
		resp, err := client.Post(srv.URL+"/v1/chat/completions", "application/json", bytes.NewBufferString(`{"model":"bench","messages":[]}`))
		if err != nil {
			return nil, err
		}
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		tr.CloseIdleConnections()
	}
	return map[string]any{"requests": *requests, "pooled_requests": pooledCalls, "pooled_tcp_connections": pooledConnections, "pooled_elapsed_s": pooledTime.Seconds(), "no_keepalive_tcp_connections": connections.Load(), "scope": "sequential real project OpenAI client against local mock; no inference latency measured"}, nil
}

func realLLM() (map[string]any, error) {
	configPath := os.Getenv("BENCH_CONFIG")
	if configPath == "" {
		return nil, errors.New("BENCH_CONFIG must point to a local untracked config containing the provider credentials")
	}
	if _, err := config.LoadConfig(configPath); err != nil {
		return nil, err
	}
	results := make([]map[string]any, 0, *requests)
	for i := 0; i < *requests; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		m, err := llm.CreatOpenAiChatModel(ctx, 900001)
		if err != nil {
			cancel()
			return nil, err
		}
		started := time.Now()
		stream, err := m.Stream(ctx, []*schema.Message{{Role: schema.User, Content: "Generate a single concise English Go backend interview question about Redis sliding-window rate limiting. Output only the question, in no more than 60 words."}})
		if err != nil {
			cancel()
			return nil, err
		}
		first := time.Duration(0)
		count := 0
		chars := 0
		for {
			chunk, e := stream.Recv()
			if e == io.EOF {
				break
			}
			if e != nil {
				stream.Close()
				cancel()
				return nil, e
			}
			if chunk.Content != "" {
				if first == 0 {
					first = time.Since(started)
				}
				count++
				chars += len([]rune(chunk.Content))
			}
		}
		stream.Close()
		elapsed := time.Since(started)
		cancel()
		if first == 0 {
			return nil, errors.New("model stream had no visible content")
		}
		results = append(results, map[string]any{"sample": i + 1, "first_visible_content_ms": float64(first) / float64(time.Millisecond), "complete_ms": float64(elapsed) / float64(time.Millisecond), "visible_chunks": count, "output_characters": chars})
	}
	return map[string]any{"samples": results, "provider": config.Global.LLM.ProviderName, "model": config.Global.LLM.ModelName, "scope": "actual Eino model client + real paid upstream; sequential short question requests, not an agent/SSE capacity test"}, nil
}
