package main

import (
	"errors"
	"sync"
	"time"

	core "interview-agents/internal/service/interview/engine"
)

// Exercise the real session manager without paying for model calls.
func sessionConcurrency() (map[string]any, error) {
	sm := core.GetGlobalSessionManager()
	created := make([]*core.InterviewSession, *requests)
	var mu sync.Mutex
	ids := make(map[string]int)
	started := time.Now()
	runWorkers(*requests, *concurrency, func(i int) {
		s := sm.CreateSession(uint(i+1), uint64(i+1), 0, false, "", "专项面试", "Go", "校招")
		created[i] = s
		mu.Lock()
		ids[s.SessionID]++
		mu.Unlock()
	})
	lost := 0
	for _, s := range created {
		if stored := sm.GetSession(s.SessionID); stored == nil || stored.RecordID != s.RecordID || stored.UserID != s.UserID {
			lost++
		}
	}
	data := map[string]any{"created": *requests, "concurrency": *concurrency, "unique_ids": len(ids), "overwritten_sessions": lost, "elapsed_ms": float64(time.Since(started)) / float64(time.Millisecond), "scope": "actual in-memory session manager; no database, model inference or network calls"}
	for id := range ids {
		sm.DeleteSession(id)
	}
	if lost > 0 {
		return data, errors.New("session ID collisions overwrite existing sessions")
	}
	return data, nil
}
