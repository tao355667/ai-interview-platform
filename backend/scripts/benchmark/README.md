# 本地并发与可靠性测试

测试入口调用项目现有组件，结果见 [REPORT.md](REPORT.md)。仅 `llm` 模式会调用付费模型；队列模式使用模拟耗时任务。

## 准备

在 `backend` 目录执行，使用与 `go.mod` 一致的工具链。Go 1.26.1 在本次环境中无法编译现有 Sonic 依赖。

```sh
GOTOOLCHAIN=go1.25.1 go build -o /tmp/interview-benchmark ./scripts/benchmark
GOTOOLCHAIN=go1.25.1 go build -o /tmp/interview-server ./cmd/server
```

使用本机 MySQL，创建单独的测试库：

```sql
CREATE DATABASE ai_interview_bench CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

将连接串放入 `BENCH_MYSQL_DSN` 环境变量，例如 `用户名:密码@unix(/tmp/mysql.sock)/ai_interview_bench?charset=utf8mb4&parseTime=True&loc=Local`。本次实测使用本机 MySQL 5.7.31 的 Unix socket，未使用 Docker MySQL。

Redis 使用独立实例，DB 0 供 HTTP 服务使用，DB 2 供组件测试使用：

```sh
docker run -d --name interview-bench-redis --cpus=1 --memory=256m \
  -p 127.0.0.1:16379:6379 redis:7.4-alpine redis-server --save '' --appendonly no
```

`queue` / `queue-failure` 会删除 DB 2 内三个固定的面试 Stream，并重新创建消费组，必须使用上述独立 Redis。数据库模式会写入测试用户、报告、订单和事件，必须使用单独的测试数据库。

## 启动与查询接口压测

复制 `config.example.yaml` 到临时运行目录并命名为 `config.yaml`，在该目录运行 `/tmp/interview-server`。服务会自动建表。示例配置固定 JWT 测试密钥，只适用于本地压测；业务限流被临时提高到 1,000,000 次/秒，用于测量查询处理能力。

在另一个终端生成 1,000 条测试记录及 JWT：

```sh
export BENCH_TOKEN_FILE=/tmp/interview-benchmark-token
/tmp/interview-benchmark -mode seed
export BENCH_TOKEN="$(cat "$BENCH_TOKEN_FILE")"
/tmp/interview-benchmark -mode http -c 50 -duration 2s \
  -urls 'http://127.0.0.1:18899/api/interview/records?page=1&page_size=10'
/tmp/interview-benchmark -mode http -c 50 -duration 10s \
  -urls 'http://127.0.0.1:18899/api/interview/records?page=1&page_size=10' \
  -expected-records 10 -expected-total 1000 \
  -out /tmp/records-c50.json
```

每轮先预热 2 秒、测量 10 秒，重复三轮。HTTP 工具采用闭环并发模型，检查 HTTP 状态、JSON `code=200` 和非空 `data`；延迟包含完整响应读取。`-expected-records` / `-expected-total` 可逐请求校验页内记录数和总数，出现错误时保存最多五个响应样本。此测试不调用模型。

后续更完整的并发性能测试报告保存在项目根目录的 `tmp/performance-report.md`，该目录被 Git 忽略。报告包括 1–500 并发、60 秒持续负载、双压测进程、连接池对照、10 万行数据分布及临时复合索引实验。原 `REPORT.md` 保留首次基线数据。

两个 HTTP 实例共享限流的复测：复制两份配置，将端口设为 18901 / 18902，`rps` / `burst` 都设为 100，且使用相同 `redis_key_prefix`。启动后执行：

```sh
/tmp/interview-benchmark -mode http -c 20 -duration 3s \
  -urls 'http://127.0.0.1:18901/api/user/profile,http://127.0.0.1:18902/api/user/profile'
```

限流以自然秒为窗口；3 秒测试可能跨越 4 个窗口，允许总数可能为 400，不应按总时长直接推断额度超发。

## 跨进程 RPM / TPM

两个独立进程各 50 并发、1,000 次请求，共享相同额度主体。`run_shared_quota.py` 设置共同启动时间并校验总放行数。每轮使用新的主体，不需要清空 Redis。

```sh
python3 scripts/benchmark/run_shared_quota.py --binary /tmp/interview-benchmark \
  --out /tmp/quota-rpm --mode rpm --rounds 6
python3 scripts/benchmark/run_shared_quota.py --binary /tmp/interview-benchmark \
  --out /tmp/quota-tpm --mode tpm --rounds 3
```

RPM 额度 100，预期合计放行 100 / 拒绝 1,900；TPM 额度 5,000，每次预占 100，预期放行 50 / 拒绝 1,950。本测试直接调用限流组件，普通 LLM 请求目前未统一接入该组件。

## 队列、幂等、熔断及连接复用

```sh
/tmp/interview-benchmark -mode queue -n 3000 -consumers 1 -delay 500ms
/tmp/interview-benchmark -mode queue -n 5000 -consumers 2 -delay 500ms
/tmp/interview-benchmark -mode queue-failure -n 1
/tmp/interview-benchmark -mode db -n 1000 -c 50
/tmp/interview-benchmark -mode webhook -n 1000 -c 50
/tmp/interview-benchmark -mode circuit
/tmp/interview-benchmark -mode reuse -n 100
```

队列的两个消费者在同一个测试进程内，实际使用 Redis Stream、消费组、ACK 和每实例 1,000 容量的 ants 池。失败任务通过 Pending 认领重试，处理期间续租，三次失败后保存到对应 Stream 的 `:dead` 队列；消费者处理逻辑仍须幂等。`queue-failure` 将重试间隔缩短为 300ms，验证三次处理后 Pending=0、死信=1；生产默认间隔为 30 秒。500ms 处理时间由 `Sleep` 模拟，不包含解析文件或模型推理。消费计时不包含预先发布消息的时间。

幂等模式验证真实 MySQL 上同键并发写入和处理结果，不能据此推断整条支付链路吞吐量。Webhook 测试不包含第三方验签。连接复用模式使用本地模型响应 mock，只测 TCP 建连次数。

进一步检查窗口规模、热点数据和会话唯一性：

```sh
/tmp/interview-benchmark -mode tpm -prefill 5000 -n 1000 -c 50 \
  -limit 10000000 -subject "benchmark-unique-subject"
/tmp/interview-benchmark -mode seed -fixture-records 100000
/tmp/interview-benchmark -mode session -n 1000 -c 100
```

TPM 预填充调用实际限流器，但预填充时间不计入测量。每次窗口测试应使用新主体，以免复用上一轮记录。`seed` 向测试用户补足指定记录数，不会删除已存在的记录；10 万条会全部属于该用户，是热点用户场景，不能等同于全平台分散的 10 万条记录。`session` 不访问数据库或模型，直接检查实际会话管理器的 ID 唯一性和覆盖情况；检测到覆盖会返回非零退出码并保留 JSON 证据。

## 真实模型

设置 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL_NAME` / `LLM_PROVIDER_NAME`，将 `BENCH_CONFIG` 指向自己的未提交配置：

```sh
export BENCH_CONFIG=/绝对路径/config.yaml
/tmp/interview-benchmark -mode llm -n 3 -out /tmp/real-llm.json
```

每次请求最多等待 45 秒，只生成短面试问题。结果记录首段可见内容与完整输出时间，不输出 Key。此次另外通过真实 HTTP 验证 SSE 首题与主动结束流程，结果在 `results/sse-smoke.json`；未验证 Milvus RAG、ASR 或完整多轮面试。

## 检查与清理

```sh
GOTOOLCHAIN=go1.25.1 go test ./pkg/ratelimiter ./pkg/circuitbreaker ./pkg/eino/callbacks \
  ./internal/service/interview/asr ./internal/payment/webhook \
  ./internal/payment/providers/stripe ./internal/payment/providers/paypal \
  ./api/handler/interview ./api/router/middleware
GOTOOLCHAIN=go1.25.1 go test -race ./pkg/ratelimiter -count=1
GOTOOLCHAIN=go1.25.1 go vet ./scripts/benchmark ./pkg/ratelimiter
docker rm -f interview-bench-redis
rm -f /tmp/interview-benchmark-token
```

停止自己启动的服务，删除含凭证的临时配置。保留测试数据库便于检查，后续可自行删除。提交结果时只保留已脱敏的 JSON，不提交 Key、DSN、JWT 或大量 SQL 日志。

## 修复后的复测

修复后的报告保存在被 Git 忽略的 `tmp/retest-report.md`，原始数据在 `tmp/retest-20261006/`。包括 UUID 会话隔离、即时回答、队列失败恢复、Token 回补窗口、分页稳定排序与大小上限，以及连接池和索引的 HTTP 对照结果。

默认 HTTP 测试包含启动时的建连开销；新增 `-http-warmup 3s` 会在同一个客户端和连接池中预热三秒，再开始计时。冷启动和预热结果应分别报告，不能只保留无错误的一组。

Redis 集成测试使用显式地址，不读取开发者私有配置：

```sh
TEST_REDIS_ADDR=127.0.0.1:16379 GOTOOLCHAIN=go1.25.1 go test -short -race ./internal/mq ./pkg/ratelimiter
GOTOOLCHAIN=go1.25.1 go test -short ./...
GOTOOLCHAIN=go1.25.1 go vet ./...
```

`-short` 明确跳过需要 Milvus/Embedding 和飞书通知的集成测试。PDF 测试使用动态生成的合成文件；本地文档分块测试不依赖 Milvus。Go 工具链沿用项目声明的 1.25.1；不据此声称 Go 1.26 兼容。
