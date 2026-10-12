package llm

import (
	"context"
	"fmt"
	"github.com/cloudwego/eino/components/model"
	arkModel "github.com/volcengine/volcengine-go-sdk/service/arkruntime/model"
	"interview-agents/internal/config"
	"strings"

	"github.com/cloudwego/eino-ext/components/model/ark"
)

func createArkModel(ctx context.Context, pc *providerConfig) (*ark.ChatModel, error) {
	cacheKey := fmt.Sprintf("ark:%s:%s", pc.modelName, pc.baseURL)
	httpClient := buildHTTPClient(cacheKey, pc.modelName)

	chatModel, err := ark.NewChatModel(ctx, &ark.ChatModelConfig{
		APIKey:     pc.apiKey,
		Model:      pc.modelName,
		BaseURL:    pc.baseURL,
		HTTPClient: httpClient,
	})
	if err != nil {
		return nil, wrapModelErr(err, "Failed to create Ark chat model")
	}

	return chatModel, nil
}

// ScoringOptions bounds reasoning latency for the known Doubao Seed family.
// This override applies only to short per-answer scoring, not interview
// generation or other providers/models whose capabilities may differ.
func ScoringOptions() []model.Option {
	cfg := config.Global.LLM
	if resolveProtocol(cfg.ProviderName) == "ark" && strings.HasPrefix(strings.ToLower(cfg.ModelName), "doubao-seed-") {
		return []model.Option{ark.WithThinking(&arkModel.Thinking{Type: arkModel.ThinkingTypeDisabled})}
	}
	return nil
}
