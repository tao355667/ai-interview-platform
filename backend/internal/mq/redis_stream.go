package mq

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/panjf2000/ants/v2"
	"github.com/redis/go-redis/v9"
)

// StreamOptions controls retry and worker limits. Handlers must be idempotent:
// a process can die after committing its side effect but before acknowledging.
type StreamOptions struct {
	Workers       int
	RetryIdle     time.Duration
	PollInterval  time.Duration
	MaxDeliveries int64
}

// RedisStreamQueue uses pending entries for recovery and renewable leases to
// keep healthy, long-running handlers from being reclaimed by another consumer.
// Redis persistence remains a deployment setting, not a queue guarantee.
type RedisStreamQueue struct {
	client        *redis.Client
	mu            sync.RWMutex
	handlers      []MessageHandler
	done          chan struct{}
	closeOnce     sync.Once
	pool          *ants.Pool
	consumerGroup string
	consumerName  string
	options       StreamOptions
	active        atomic.Int64
}

func NewRedisStreamQueue(client *redis.Client, group, consumer string) *RedisStreamQueue {
	return NewRedisStreamQueueWithOptions(client, group, consumer, StreamOptions{})
}

func NewRedisStreamQueueWithOptions(client *redis.Client, group, consumer string, options StreamOptions) *RedisStreamQueue {
	if client == nil {
		panic("Redis client cannot be nil")
	}
	if group == "" {
		group = "interview-consumer-group"
	}
	if consumer == "" {
		consumer = "consumer-" + uuid.NewString()
	}
	if options.Workers <= 0 {
		options.Workers = 1000
	}
	if options.RetryIdle <= 0 {
		options.RetryIdle = 30 * time.Second
	}
	if options.PollInterval <= 0 {
		options.PollInterval = 5 * time.Second
	}
	if options.MaxDeliveries <= 0 {
		options.MaxDeliveries = 3
	}
	pool, err := ants.NewPool(options.Workers)
	if err != nil {
		panic(err)
	}
	return &RedisStreamQueue{client: client, done: make(chan struct{}), pool: pool,
		consumerGroup: group, consumerName: consumer, options: options}
}

func (q *RedisStreamQueue) Publish(ctx context.Context, message *Message) error {
	select {
	case <-q.done:
		return fmt.Errorf("message queue is closed")
	default:
	}
	if message == nil {
		return fmt.Errorf("message cannot be nil")
	}
	payload, err := json.Marshal(message.Payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}
	// MAXLEN can delete pending or unread jobs. Retention is handled separately,
	// using the oldest ID still needed by any consumer group.
	return q.client.XAdd(ctx, &redis.XAddArgs{Stream: "interview:stream:" + string(message.Type),
		Values: map[string]interface{}{"type": string(message.Type), "payload": string(payload), "timestamp": time.Now().Unix()}}).Err()
}

func (q *RedisStreamQueue) Subscribe(ctx context.Context, handler MessageHandler) error {
	if handler == nil {
		return fmt.Errorf("handler cannot be nil")
	}
	q.mu.Lock()
	q.handlers = append(q.handlers, handler)
	q.mu.Unlock()
	streams := []string{"interview:stream:" + string(MessageTypeEvaluationReport),
		"interview:stream:" + string(MessageTypeTopicEvaluation), "interview:stream:" + string(MessageTypeResumeParse)}
	for _, stream := range streams {
		if err := q.createConsumerGroup(ctx, stream); err != nil {
			return err
		}
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	go func() {
		select {
		case <-q.done:
			cancel()
		case <-ctx.Done():
		}
	}()
	go q.recoverPending(ctx, streams)
	args := append(append([]string{}, streams...), ">", ">", ">")
	for ctx.Err() == nil {
		// Do not read more work while all workers are occupied. Jobs stay unread or
		// pending instead of being ACKed when Submit reports overload.
		if q.available() == 0 {
			if !waitStream(ctx, 10*time.Millisecond) {
				break
			}
			continue
		}
		count := q.available() / len(streams)
		if count < 1 {
			count = 1
		}
		if count > 10 {
			count = 10
		}
		batches, err := q.client.XReadGroup(ctx, &redis.XReadGroupArgs{Group: q.consumerGroup,
			Consumer: q.consumerName, Streams: args, Count: int64(count), Block: time.Second}).Result()
		if err == redis.Nil {
			continue
		}
		if err != nil {
			if ctx.Err() != nil {
				break
			}
			if strings.Contains(err.Error(), "NOGROUP") {
				for _, stream := range streams {
					_ = q.createConsumerGroup(ctx, stream)
				}
			}
			log.Printf("[RedisStream] read failed: %v", err)
			if !waitStream(ctx, time.Second) {
				break
			}
			continue
		}
		for _, batch := range batches {
			for _, msg := range batch.Messages {
				q.dispatch(ctx, batch.Stream, msg.ID, &msg)
			}
		}
	}
	return ctx.Err()
}

func waitStream(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func (q *RedisStreamQueue) createConsumerGroup(ctx context.Context, stream string) error {
	err := q.client.XGroupCreateMkStream(ctx, stream, q.consumerGroup, "0").Err()
	if err != nil && strings.HasPrefix(err.Error(), "BUSYGROUP") {
		return nil
	}
	return err
}

// Taking the lease and claiming a pending delivery are atomic with respect to
// other consumers. Normal deliveries already belong to this consumer.
var claimDelivery = redis.NewScript(`
if not redis.call('SET', KEYS[2], ARGV[3], 'NX', 'PX', ARGV[4]) then return {} end
local pending = redis.call('XPENDING', KEYS[1], ARGV[1], ARGV[5], ARGV[5], 1)
if #pending == 0 then redis.call('DEL', KEYS[2]); return {} end
if ARGV[6] == '0' and pending[1][2] ~= ARGV[2] then redis.call('DEL', KEYS[2]); return {} end
if ARGV[6] == '1' then
 local result = redis.call('XCLAIM', KEYS[1], ARGV[1], ARGV[2], ARGV[7], ARGV[5])
 if #result == 0 then redis.call('DEL', KEYS[2]) end
 return result
end
return {{ARGV[5]}}
`)
var renewDelivery = redis.NewScript(`
if redis.call('GET', KEYS[2]) ~= ARGV[3] then return 0 end
redis.call('PEXPIRE', KEYS[2], ARGV[4])
redis.call('XCLAIM', KEYS[1], ARGV[1], ARGV[2], 0, ARGV[5], 'JUSTID')
return 1
`)
var finishDelivery = redis.NewScript(`
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end
if ARGV[4] == 'ack' then redis.call('XACK', KEYS[1], ARGV[2], ARGV[3]) end
if ARGV[4] == 'dead' then
 redis.call('XADD', KEYS[3], '*', 'source_stream', KEYS[1], 'source_id', ARGV[3],
  'consumer_group', ARGV[2], 'message', ARGV[5], 'error', ARGV[6])
 redis.call('XACK', KEYS[1], ARGV[2], ARGV[3])
end
redis.call('DEL', KEYS[2])
return 1
`)

func (q *RedisStreamQueue) recoverPending(ctx context.Context, streams []string) {
	for ctx.Err() == nil {
		for _, stream := range streams {
			// Scan all eligible pending IDs, not only the first page (which may consist
			// entirely of long-running, leased jobs).
			start := "-"
			for ctx.Err() == nil && q.available() > 0 {
				pending, err := q.client.XPendingExt(ctx, &redis.XPendingExtArgs{Stream: stream,
					Group: q.consumerGroup, Idle: q.options.RetryIdle, Start: start, End: "+", Count: 100}).Result()
				if err != nil || len(pending) == 0 {
					break
				}
				for _, p := range pending {
					q.dispatch(ctx, stream, p.ID, nil)
				}
				start = "(" + pending[len(pending)-1].ID
				if len(pending) < 100 {
					break
				}
			}
			if err := q.CleanupOldMessages(ctx, stream, 10000); err != nil && ctx.Err() == nil {
				log.Printf("[RedisStream] safe retention failed: %v", err)
			}
		}
		if !waitStream(ctx, q.options.PollInterval) {
			return
		}
	}
}

// ants.Free counts uncreated workers, not available processing slots: idle
// workers remain alive until expiry. Track actual in-flight jobs separately.
func (q *RedisStreamQueue) available() int {
	return q.options.Workers - int(q.active.Load())
}

func (q *RedisStreamQueue) dispatch(ctx context.Context, stream, id string, message *redis.XMessage) {
	if q.available() == 0 || ctx.Err() != nil {
		return
	}
	// Copy the delivery before scheduling. Acquire leases inside bounded workers:
	// doing a synchronous Redis round trip for every message in the reader would
	// serialize dispatch and starve an otherwise idle worker pool.
	var delivery *redis.XMessage
	if message != nil {
		copy := *message
		delivery = &copy
	}
	for {
		active := q.active.Load()
		if active >= int64(q.options.Workers) {
			return
		}
		if q.active.CompareAndSwap(active, active+1) {
			break
		}
	}
	err := q.pool.Submit(func() {
		defer q.active.Add(-1)
		lease := stream + ":lease:" + q.consumerGroup + ":" + id
		owner := uuid.NewString()
		reclaim := "0"
		if delivery == nil {
			reclaim = "1"
		}
		result, err := claimDelivery.Run(ctx, q.client, []string{stream, lease}, q.consumerGroup,
			q.consumerName, owner, q.options.RetryIdle.Milliseconds(), id, reclaim, q.options.RetryIdle.Milliseconds()).Slice()
		if err != nil || len(result) == 0 {
			return
		}
		if delivery == nil {
			messages, err := q.client.XRangeN(ctx, stream, id, id, 1).Result()
			if err != nil || len(messages) == 0 {
				q.finish(ctx, stream, id, lease, owner, "release", nil, nil)
				return
			}
			delivery = &messages[0]
		}
		q.process(ctx, stream, *delivery, lease, owner)
	})
	if err != nil {
		q.active.Add(-1)
	}
	// Submit failure leaves the entry pending; no lease was acquired and no ACK
	// was sent. Recovery will deliver it when capacity becomes available.
}

func (q *RedisStreamQueue) process(ctx context.Context, stream string, msg redis.XMessage, lease, owner string) {
	taskCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	// Heartbeats do not increment Redis's delivery counter (JUSTID).
	go func() {
		for waitStream(taskCtx, q.options.RetryIdle/3) {
			ok, err := renewDelivery.Run(taskCtx, q.client, []string{stream, lease}, q.consumerGroup,
				q.consumerName, owner, q.options.RetryIdle.Milliseconds(), msg.ID).Int()
			if err != nil || ok != 1 {
				cancel()
				return
			}
		}
	}()
	var message Message
	kind, kindOK := msg.Values["type"].(string)
	payload, payloadOK := msg.Values["payload"].(string)
	decodeErr := json.Unmarshal([]byte(payload), &message.Payload)
	if !kindOK || !payloadOK || decodeErr != nil {
		q.finish(taskCtx, stream, msg.ID, lease, owner, "dead", msg.Values, fmt.Errorf("invalid message payload"))
		return
	}
	message.Type = MessageType(kind)
	q.mu.RLock()
	handlers := append([]MessageHandler{}, q.handlers...)
	q.mu.RUnlock()
	var handlerErr error
	for _, handler := range handlers {
		if handlerErr = invokeHandler(taskCtx, handler, &message); handlerErr != nil {
			break
		}
	}
	if taskCtx.Err() != nil {
		return
	} // expired lease/cancel: leave it pending
	action := "ack"
	if handlerErr != nil {
		action = "release"
		pending, err := q.client.XPendingExt(taskCtx, &redis.XPendingExtArgs{Stream: stream,
			Group: q.consumerGroup, Start: msg.ID, End: msg.ID, Count: 1}).Result()
		if err == nil && len(pending) > 0 && pending[0].RetryCount >= q.options.MaxDeliveries {
			action = "dead"
		}
		log.Printf("[RedisStream] handler failed, ID=%s action=%s: %v", msg.ID, action, handlerErr)
	}
	q.finish(taskCtx, stream, msg.ID, lease, owner, action, msg.Values, handlerErr)
}

func invokeHandler(ctx context.Context, handler MessageHandler, message *Message) (err error) {
	defer func() {
		if value := recover(); value != nil {
			err = fmt.Errorf("handler panic: %v", value)
		}
	}()
	return handler(ctx, message)
}

func (q *RedisStreamQueue) finish(ctx context.Context, stream, id, lease, owner, action string, values map[string]interface{}, cause error) {
	body, _ := json.Marshal(values)
	reason := ""
	if cause != nil {
		reason = cause.Error()
	}
	if _, err := finishDelivery.Run(ctx, q.client, []string{stream, lease, stream + ":dead"},
		owner, q.consumerGroup, id, action, string(body), reason).Result(); err != nil {
		log.Printf("[RedisStream] finish failed, ID=%s: %v", id, err)
	}
}

func (q *RedisStreamQueue) Close() error {
	q.closeOnce.Do(func() { close(q.done); q.pool.Release() })
	return nil
}
func (q *RedisStreamQueue) GetRedisClient() *redis.Client { return q.client }

// CleanupOldMessages never trims past a pending or unread ID. maxLen is a soft
// threshold: a backlog is retained even when it exceeds the requested length.
func (q *RedisStreamQueue) CleanupOldMessages(ctx context.Context, stream string, maxLen int64) error {
	if maxLen < 0 {
		return fmt.Errorf("maxLen must be nonnegative")
	}
	length, err := q.client.XLen(ctx, stream).Result()
	if err != nil || length <= maxLen {
		return err
	}
	groups, err := q.client.XInfoGroups(ctx, stream).Result()
	if err != nil {
		return err
	}
	if len(groups) == 0 {
		return nil
	}
	// The Lua script evaluates group positions and trims in one operation, so an
	// intervening delivery cannot turn an inspected ID into a deleted pending job.
	return safeTrim.Run(ctx, q.client, []string{stream}).Err()
}

var safeTrim = redis.NewScript(`
local groups=redis.call('XINFO','GROUPS',KEYS[1])
local floor=nil
local function less(a,b)
 local am,as=string.match(a,'(%d+)%-(%d+)')
 local bm,bs=string.match(b,'(%d+)%-(%d+)')
 return tonumber(am)<tonumber(bm) or (tonumber(am)==tonumber(bm) and tonumber(as)<tonumber(bs))
end
for _,g in ipairs(groups) do
 local name,last
 for i=1,#g,2 do if g[i]=='name' then name=g[i+1] elseif g[i]=='last-delivered-id' then last=g[i+1] end end
 local p=redis.call('XPENDING',KEYS[1],name)
 if p[1]>0 and less(p[2],last) then last=p[2] end
 if not floor or less(last,floor) then floor=last end
end
if floor then return redis.call('XTRIM',KEYS[1],'MINID',floor) end
return 0
`)
