package interview

import (
	"bytes"
	"context"
	"fmt"
	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/app/server"
	"github.com/cloudwego/hertz/pkg/common/ut"
	core "interview-agents/internal/service/interview/engine"
	"net/http"
	"testing"
	"time"
)

func TestSessionEndpointsEnforceOwnership(t *testing.T) {
	sm := core.GetGlobalSessionManager()
	s := sm.CreateSession(7, 1, 0, false, "", "special", "Go", "medium")
	defer sm.DeleteSession(s.SessionID)
	for _, user := range []uint{7, 8} {
		t.Run(fmt.Sprint(user), func(t *testing.T) {
			h := server.Default()
			h.Use(func(ctx context.Context, c *app.RequestContext) { c.Set("user_id", user); c.Next(ctx) })
			h.GET("/session", GetSession)
			h.POST("/answer", SubmitInterviewAnswer)
			response := ut.PerformRequest(h.Engine, http.MethodGet, "/session?session_id="+s.SessionID, nil).Result()
			want := http.StatusOK
			if user != 7 {
				want = http.StatusUnauthorized
			}
			if response.StatusCode() != want {
				t.Fatalf("session HTTP %d, want %d", response.StatusCode(), want)
			}
			body := fmt.Sprintf(`{"session_id":%q,"answer":"test"}`, s.SessionID)
			response = ut.PerformRequest(h.Engine, http.MethodPost, "/answer", &ut.Body{Body: bytes.NewBufferString(body), Len: len(body)}, ut.Header{Key: "Content-Type", Value: "application/json"}).Result()
			if response.StatusCode() != want {
				t.Fatalf("answer HTTP %d, want %d", response.StatusCode(), want)
			}
		})
	}
	answer, ok := sm.GetAnswer(s.SessionID, time.Second)
	if !ok || answer != "test" {
		t.Fatal("authorized answer lost")
	}
	if err := sm.SubmitAnswer(s.SessionID, "first"); err != nil {
		t.Fatal(err)
	}
}
