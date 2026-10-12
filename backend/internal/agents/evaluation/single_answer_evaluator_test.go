package evaluation

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/cloudwego/eino/components/model"
	"github.com/cloudwego/eino/schema"
	"interview-agents/internal/config"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestParseEvaluationResponse 校验 LLM 输出解析（12.3.1 单元测试策略）
func TestParseEvaluationResponse(t *testing.T) {
	validJSON := `{
  "scores": {
    "correctness": 7,
    "depth": 6,
    "completeness": 8,
    "practicality": 5
  },
  "overall": 6.5,
  "covered_topics": ["goroutine", "channel"],
  "next_action": "continue",
  "reason": "理解正确，可继续追问"
}`
	res, err := parseEvaluationResponse(validJSON)
	if err != nil {
		t.Fatalf("parseEvaluationResponse(valid): %v", err)
	}
	if res.Scores.Correctness != 7 || res.Overall != 6.5 || res.NextAction != ActionContinue {
		t.Errorf("parseEvaluationResponse: scores/overall/next_action 解析不符")
	}
	if len(res.CoveredTopics) != 2 || res.Reason == "" {
		t.Errorf("parseEvaluationResponse: covered_topics 或 reason 解析不符")
	}
}

func TestParseEvaluationResponse_WithMarkdownBlock(t *testing.T) {
	wrapped := "```json\n{\"scores\":{\"correctness\":5,\"depth\":5,\"completeness\":5,\"practicality\":5},\"overall\":5,\"covered_topics\":[],\"next_action\":\"continue\",\"reason\":\"一般\"}\n```"
	res, err := parseEvaluationResponse(wrapped)
	if err != nil {
		t.Fatalf("parseEvaluationResponse(markdown): %v", err)
	}
	if res.Overall != 5 {
		t.Errorf("parseEvaluationResponse(markdown): overall 应为 5, got %v", res.Overall)
	}
}

func TestParseEvaluationResponse_InvalidJSON(t *testing.T) {
	_, err := parseEvaluationResponse("not json at all")
	if err == nil {
		t.Error("parseEvaluationResponse(invalid): 期望返回错误")
	}
}

type deadlineModel struct{ model.ToolCallingChatModel }

func (m *deadlineModel) Generate(ctx context.Context, _ []*schema.Message, _ ...model.Option) (*schema.Message, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func TestEvaluationDeadlineDoesNotPolluteHistory(t *testing.T) {
	cfg := DefaultEvaluatorConfig()
	cfg.Timeout = 20 * time.Millisecond
	ev := &Evaluator{model: &deadlineModel{}, config: cfg}
	history := &ScoreHistory{}
	started := time.Now()
	_, err := ev.EvaluateWithHistory(context.Background(), &EvaluationRequest{Question: "q", Answer: "a"}, history)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline, got %v", err)
	}
	if time.Since(started) > time.Second {
		t.Fatal("evaluation deadline not respected")
	}
	if len(history.Scores) != 0 {
		t.Fatal("failed evaluation recorded as a zero score")
	}
}

func TestEvaluationRespectsCallerCancellation(t *testing.T) {
	ev := &Evaluator{model: &deadlineModel{}, config: DefaultEvaluatorConfig()}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := ev.Evaluate(ctx, &EvaluationRequest{Question: "q", Answer: "a"})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancellation, got %v", err)
	}
}

func TestSeedScoringUsesBoundedNonThinkingRequest(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			MaxTokens int `json:"max_tokens"`
			Thinking  struct {
				Type string `json:"type"`
			} `json:"thinking"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body.Thinking.Type != "disabled" || body.MaxTokens != 2048 {
			t.Errorf("unexpected scoring options: %+v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"id": "test", "object": "chat.completion", "model": "doubao-seed-test", "choices": []any{map[string]any{"index": 0, "finish_reason": "stop", "message": map[string]any{"role": "assistant", "content": `{"scores":{"correctness":7,"depth":7,"completeness":7,"practicality":7},"overall":7,"next_action":"continue","reason":"valid"}`}}}})
	}))
	defer server.Close()
	old := config.Global.LLM
	defer func() { config.Global.LLM = old }()
	config.Global.LLM = config.LLMConfig{APIKey: "synthetic-test-key", BaseURL: server.URL, ModelName: "doubao-seed-test", ProviderName: "ark"}
	ev, err := NewEvaluator(context.Background(), 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	result, err := ev.Evaluate(context.Background(), &EvaluationRequest{Question: "q", Answer: "a"})
	if err != nil || result == nil || result.Overall != 7 {
		t.Fatalf("scoring response failed: %+v %v", result, err)
	}
}
