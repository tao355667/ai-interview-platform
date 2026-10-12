package core

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestConcurrentSessionsRemainIsolated(t *testing.T) {
	sm := &SessionManager{sessions: make(map[string]*InterviewSession)}
	const count = 1000
	sessions := make([]*InterviewSession, count)
	var wg sync.WaitGroup
	for i := range sessions {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			sessions[i] = sm.CreateSession(uint(i+1), uint64(i+1), 0, false, "", "专项面试", "Go", "校招")
		}(i)
	}
	wg.Wait()
	ids := make(map[string]bool)
	for i, s := range sessions {
		if ids[s.SessionID] {
			t.Fatalf("duplicate session ID %s", s.SessionID)
		}
		ids[s.SessionID] = true
		if sm.GetSession(s.SessionID) != s {
			t.Fatal("session overwritten")
		}
		if err := sm.SubmitAnswer(s.SessionID, fmt.Sprint(i)); err != nil {
			t.Fatal(err)
		}
	}
	for i, s := range sessions {
		if answer, ok := sm.GetAnswer(s.SessionID, time.Second); !ok || answer != fmt.Sprint(i) {
			t.Fatalf("answer crossed session boundary: %q", answer)
		}
		sm.DeleteSession(s.SessionID)
		if sm.GetSession(s.SessionID) != nil {
			t.Fatal("deleted session remains")
		}
	}
}

func TestConcurrentSessionState(t *testing.T) {
	sm := &SessionManager{sessions: make(map[string]*InterviewSession)}
	s := sm.CreateSession(1, 1, 0, false, "", "", "", "")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			s.SetCancel(cancel)
			s.Touch()
			s.SetQuestionCount(int32(i))
			s.SetStatus("active", time.Now())
			s.State()
			_ = sm.SubmitAnswer(s.SessionID, "answer")
			sm.ClearAnswer(s.SessionID)
			s.Cancel()
		}(i)
	}
	wg.Wait()
	if ctx.Err() != context.Canceled {
		t.Fatal("cancel not called")
	}
}

func TestPendingAnswerIsNotSilentlyDropped(t *testing.T) {
	sm := &SessionManager{sessions: make(map[string]*InterviewSession)}
	s := sm.CreateSession(1, 1, 0, false, "", "", "", "")
	if err := sm.SubmitAnswer(s.SessionID, "first"); err != nil {
		t.Fatal(err)
	}
	if err := sm.SubmitAnswer(s.SessionID, "second"); err != ErrAnswerPending {
		t.Fatalf("expected pending error, got %v", err)
	}
	if answer, ok := sm.GetAnswer(s.SessionID, time.Second); !ok || answer != "first" {
		t.Fatal("pending answer replaced")
	}
}

type onReadyWriter struct {
	submit func()
	once   sync.Once
}

func (w *onReadyWriter) Write(p []byte) (int, error) { w.once.Do(w.submit); return len(p), nil }

func TestAnswerSubmittedAtReadyEventIsRetained(t *testing.T) {
	sm := &SessionManager{sessions: make(map[string]*InterviewSession)}
	session := sm.CreateSession(1, 1, 0, false, "", "", "", "")
	writer := &onReadyWriter{submit: func() {
		if err := sm.SubmitAnswer(session.SessionID, "immediate answer"); err != nil {
			t.Error(err)
		}
	}}
	state := &InterviewState{Session: session, SessionManager: sm, Writer: writer, QuestionIndex: 1, MaxQuestions: 3,
		AnswerTimeout: 200 * time.Millisecond, HeartbeatInterval: 50 * time.Millisecond}
	result, err := waitAnswerNode(context.Background(), state)
	if err != nil || result.ShouldStop || result.Answer != "immediate answer" {
		t.Fatalf("ready event answer lost: %q %v", result.Answer, err)
	}
}

func TestMessageIDsAreUnique(t *testing.T) {
	ids := make(map[string]bool)
	for i := 0; i < 1000; i++ {
		id := generateMessageID()
		if ids[id] {
			t.Fatal("duplicate message ID")
		}
		ids[id] = true
	}
}
