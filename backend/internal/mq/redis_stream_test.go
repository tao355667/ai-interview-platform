package mq

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Uses a disposable Redis. Each test uses its own Stream and group, and never
// FLUSHDBs or touches application streams.
func queueFixture(t *testing.T, workers int) (*RedisStreamQueue, context.Context, string) {
	t.Helper()
	addr := os.Getenv("TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("set TEST_REDIS_ADDR to run Redis Stream integration tests")
	}
	client := redis.NewClient(&redis.Options{Addr: addr, DB: 2})
	ctx, cancel := context.WithCancel(context.Background())
	if err := client.Ping(ctx).Err(); err != nil {
		t.Fatal(err)
	}
	stream := "test:stream:" + uuid.NewString()
	q := NewRedisStreamQueueWithOptions(client, "test-group", "test-consumer", StreamOptions{
		Workers: workers, RetryIdle: 300 * time.Millisecond, PollInterval: 40 * time.Millisecond, MaxDeliveries: 3})
	if err := q.createConsumerGroup(ctx, stream); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cancel(); q.Close(); client.Del(context.Background(), stream, stream+":dead"); client.Close() })
	return q, ctx, stream
}

func addDelivery(t *testing.T, q *RedisStreamQueue, ctx context.Context, stream string) redis.XMessage {
	t.Helper()
	id, err := q.client.XAdd(ctx, &redis.XAddArgs{Stream: stream, Values: map[string]interface{}{"type": "resume_parse", "payload": "{\"user_id\":1}"}}).Result()
	if err != nil {
		t.Fatal(err)
	}
	batches, err := q.client.XReadGroup(ctx, &redis.XReadGroupArgs{Group: q.consumerGroup, Consumer: q.consumerName,
		Streams: []string{stream, ">"}, Count: 1}).Result()
	if err != nil {
		t.Fatal(err)
	}
	msg := batches[0].Messages[0]
	if msg.ID != id {
		t.Fatal("wrong delivery")
	}
	return msg
}
func eventually(t *testing.T, check func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition not satisfied within 5 seconds")
}
func pendingCount(q *RedisStreamQueue, ctx context.Context, stream string) int64 {
	p, err := q.client.XPending(ctx, stream, q.consumerGroup).Result()
	if err != nil {
		return -1
	}
	return p.Count
}

func TestStreamTransientFailureRetries(t *testing.T) {
	q, ctx, stream := queueFixture(t, 2)
	var calls atomic.Int64
	q.handlers = []MessageHandler{func(context.Context, *Message) error {
		if calls.Add(1) < 3 {
			return errors.New("transient")
		}
		return nil
	}}
	msg := addDelivery(t, q, ctx, stream)
	go q.recoverPending(ctx, []string{stream})
	q.dispatch(ctx, stream, msg.ID, &msg)
	eventually(t, func() bool { return calls.Load() == 3 && pendingCount(q, ctx, stream) == 0 })
	if q.client.XLen(ctx, stream+":dead").Val() != 0 {
		t.Fatal("successful retry dead-lettered")
	}
}
func TestStreamPermanentFailureAndPanicDeadLetter(t *testing.T) {
	for _, panicHandler := range []bool{false, true} {
		t.Run(fmt.Sprint(panicHandler), func(t *testing.T) {
			q, ctx, stream := queueFixture(t, 2)
			var calls atomic.Int64
			q.handlers = []MessageHandler{func(context.Context, *Message) error {
				calls.Add(1)
				if panicHandler {
					panic("injected")
				}
				return errors.New("permanent")
			}}
			msg := addDelivery(t, q, ctx, stream)
			go q.recoverPending(ctx, []string{stream})
			q.dispatch(ctx, stream, msg.ID, &msg)
			eventually(t, func() bool { return q.client.XLen(ctx, stream+":dead").Val() == 1 && pendingCount(q, ctx, stream) == 0 })
			if calls.Load() != 3 {
				t.Fatalf("expected 3 attempts, got %d", calls.Load())
			}
			dead := q.client.XRange(ctx, stream+":dead", "-", "+").Val()
			if dead[0].Values["source_id"] != msg.ID || dead[0].Values["message"] == "null" {
				t.Fatal("dead letter lost original message")
			}
		})
	}
}
func TestStreamAbandonedDeliveryRecovered(t *testing.T) {
	q, ctx, stream := queueFixture(t, 2)
	var calls atomic.Int64
	q.handlers = []MessageHandler{func(context.Context, *Message) error { calls.Add(1); return nil }}
	_ = addDelivery(t, q, ctx, stream) // simulate reader crash before dispatch
	q.consumerName = "replacement-consumer"
	go q.recoverPending(ctx, []string{stream})
	eventually(t, func() bool { return calls.Load() == 1 && pendingCount(q, ctx, stream) == 0 })
}
func TestStreamLeaseProtectsSlowHandler(t *testing.T) {
	q, ctx, stream := queueFixture(t, 2)
	var calls atomic.Int64
	q.handlers = []MessageHandler{func(context.Context, *Message) error { calls.Add(1); time.Sleep(1200 * time.Millisecond); return nil }}
	second := NewRedisStreamQueueWithOptions(q.client, q.consumerGroup, "second", q.options)
	second.handlers = q.handlers
	t.Cleanup(func() { second.Close() })
	msg := addDelivery(t, q, ctx, stream)
	q.dispatch(ctx, stream, msg.ID, &msg)
	go second.recoverPending(ctx, []string{stream})
	eventually(t, func() bool { return pendingCount(q, ctx, stream) == 0 })
	if calls.Load() != 1 {
		t.Fatalf("slow handler duplicated: %d", calls.Load())
	}
}
func TestStreamOverloadKeepsPending(t *testing.T) {
	q, ctx, stream := queueFixture(t, 1)
	var calls atomic.Int64
	release := make(chan struct{})
	q.handlers = []MessageHandler{func(ctx context.Context, _ *Message) error {
		calls.Add(1)
		select {
		case <-release:
			return nil
		case <-ctx.Done():
			return ctx.Err()
		}
	}}
	first := addDelivery(t, q, ctx, stream)
	q.dispatch(ctx, stream, first.ID, &first)
	eventually(t, func() bool { return calls.Load() == 1 })
	second := addDelivery(t, q, ctx, stream)
	q.dispatch(ctx, stream, second.ID, &second)
	if pendingCount(q, ctx, stream) != 2 {
		t.Fatal("overloaded delivery was ACKed")
	}
	close(release)
	go q.recoverPending(ctx, []string{stream})
	eventually(t, func() bool { return calls.Load() == 2 && pendingCount(q, ctx, stream) == 0 })
}
func TestStreamAllHandlersMustSucceed(t *testing.T) {
	q, ctx, stream := queueFixture(t, 2)
	var calls atomic.Int64
	q.handlers = []MessageHandler{func(context.Context, *Message) error { return nil }, func(context.Context, *Message) error { calls.Add(1); return errors.New("second failed") }}
	msg := addDelivery(t, q, ctx, stream)
	q.dispatch(ctx, stream, msg.ID, &msg)
	eventually(t, func() bool { return calls.Load() == 1 })
	if pendingCount(q, ctx, stream) != 1 {
		t.Fatal("early handler ACKed failed delivery")
	}
}
func TestStreamCleanupPreservesPendingAndUnread(t *testing.T) {
	q, ctx, stream := queueFixture(t, 1)
	first := addDelivery(t, q, ctx, stream)
	unread := q.client.XAdd(ctx, &redis.XAddArgs{Stream: stream, Values: map[string]interface{}{"type": "resume_parse", "payload": "{}"}}).Val()
	if err := q.CleanupOldMessages(ctx, stream, 0); err != nil {
		t.Fatal(err)
	}
	if q.client.XLen(ctx, stream).Val() != 2 {
		t.Fatal("cleanup deleted needed jobs")
	}
	q.client.XAck(ctx, stream, q.consumerGroup, first.ID)
	q.client.XReadGroup(ctx, &redis.XReadGroupArgs{Group: q.consumerGroup, Consumer: q.consumerName, Streams: []string{stream, ">"}, Count: 1})
	if err := q.CleanupOldMessages(ctx, stream, 0); err != nil {
		t.Fatal(err)
	}
	rows := q.client.XRange(ctx, stream, "-", "+").Val()
	if len(rows) != 1 || rows[0].ID != unread {
		t.Fatalf("incorrect safe trim: %v", rows)
	}
	q.Close()
	q.Close() // idempotent shutdown
}

func TestStreamMalformedDeliveryIsPreservedInDeadLetter(t *testing.T) {
	q, ctx, stream := queueFixture(t, 1)
	id := q.client.XAdd(ctx, &redis.XAddArgs{Stream: stream, Values: map[string]interface{}{"payload": "not-json"}}).Val()
	batches, err := q.client.XReadGroup(ctx, &redis.XReadGroupArgs{Group: q.consumerGroup, Consumer: q.consumerName, Streams: []string{stream, ">"}, Count: 1}).Result()
	if err != nil {
		t.Fatal(err)
	}
	msg := batches[0].Messages[0]
	q.dispatch(ctx, stream, id, &msg)
	eventually(t, func() bool { return pendingCount(q, ctx, stream) == 0 && q.client.XLen(ctx, stream+":dead").Val() == 1 })
	dead := q.client.XRange(ctx, stream+":dead", "-", "+").Val()
	if dead[0].Values["source_id"] != id {
		t.Fatal("malformed job lost")
	}
}

func TestStreamExpiredLeaseRecoveredByNewConsumer(t *testing.T) {
	q, ctx, stream := queueFixture(t, 1)
	msg := addDelivery(t, q, ctx, stream)
	lease := stream + ":lease:" + q.consumerGroup + ":" + msg.ID
	if err := q.client.Set(ctx, lease, "dead-process", 400*time.Millisecond).Err(); err != nil {
		t.Fatal(err)
	}
	var calls atomic.Int64
	q.handlers = []MessageHandler{func(context.Context, *Message) error { calls.Add(1); return nil }}
	q.consumerName = "new-process"
	go q.recoverPending(ctx, []string{stream})
	time.Sleep(200 * time.Millisecond)
	if calls.Load() != 0 {
		t.Fatal("delivery stolen before lease expiry")
	}
	eventually(t, func() bool { return calls.Load() == 1 && pendingCount(q, ctx, stream) == 0 })
}

func TestStreamIdleWorkersCanAcceptNewJobs(t *testing.T) {
	q, ctx, stream := queueFixture(t, 1)
	var calls atomic.Int64
	q.handlers = []MessageHandler{func(context.Context, *Message) error { calls.Add(1); return nil }}
	for i := int64(1); i <= 3; i++ {
		msg := addDelivery(t, q, ctx, stream)
		q.dispatch(ctx, stream, msg.ID, &msg)
		eventually(t, func() bool { return calls.Load() == i && pendingCount(q, ctx, stream) == 0 })
	}
}
