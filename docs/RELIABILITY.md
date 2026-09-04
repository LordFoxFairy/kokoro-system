# kokoro-system 可靠性设计

状态：当前机制与目标，2026-09-03。可执行测试证明特定 failure path，不代表生产 availability、latency、capacity、
RPO 或 RTO 已测量。

## 1. Dependency model

| Dependency | 角色 | 当前失败语义 |
|---|---|---|
| PostgreSQL | Site/Host/Workspace/Product/Config/Release/Policy/receipt durable fact | Readiness 503；业务 request 统一 503；不读其他 store |
| Redis DB 2 | 完整 Runtime Manifest cache/coordination | 启动先 PING；readiness 503；manifest fail closed |
| BFF service context | service auth、tenant、permission、Host | 缺配置 503；错误 credential 403；缺字段 400 |
| Process/HTTP listener | HTTP + Connect transport | health 只检查进程响应；graceful shutdown 有总 deadline |

System 没有 in-process repository/cache fallback，也没有 stale snapshot。该设计减少事实分叉，但使 Runtime Manifest 的
availability 同时依赖 PostgreSQL 与 Redis。

## 2. Timeout 与 connection budget

**已实现**

| Boundary | 当前配置 |
|---|---|
| PostgreSQL connect | 1,500 ms |
| PostgreSQL statement | 10,000 ms |
| PostgreSQL query | 15,000 ms |
| PostgreSQL pool | max 10，idle 30,000 ms |
| TypeScript SDK overall request | 默认 15,000 ms，AbortController |
| Shutdown total | 默认 10,000 ms，可用 env 调整 |
| Redis reconnect | 第 0–2 次 delay 100–300 ms；达到 3 次返回 unavailable error |

**缺口**：Redis command/connect overall deadline 未显式固定；Node inbound HTTP 的 headers/request/keep-alive timeout、
并发上限、queue budget、response byte cap 未配置。SDK 没有 response byte cap。

## 3. Readiness、startup 与 shutdown

- `createSystemRuntime` 构造 PostgreSQL pool 后先连接并 PING Redis；Redis 不可用会阻止 startup。
- PostgreSQL 是 lazy pool，startup 不主动 ping；流量门禁必须依赖 `/readyz`。
- `/healthz` 不查依赖，只返回 process alive。
- `/readyz` 每次执行 PostgreSQL `SELECT 1` 和 Redis `PING`；异常映射 `503 SYSTEM_UNAVAILABLE`。
- Docker `HEALTHCHECK` 调用 `/readyz`；release candidate smoke 同时检查 `/healthz` 和 `/readyz`。
- SIGINT/SIGTERM 只注册一次；listener、PostgreSQL、Redis 并行关闭。超过 deadline 时强制关闭 HTTP connections并设
  `process.exitCode=1`。

部署平台必须只把 ready instance 加入业务流量，并设置 termination grace period 大于 System shutdown deadline。

## 4. Retry policy

**当前实现**

- Redis client 只做有限 reconnect；业务 use case 不自行重试 Redis command。
- PostgreSQL pool/Repositories 不做 application retry，避免在未知 commit 状态重复 mutation。
- TypeScript SDK 不重试 HTTP；timeout/network error 映射稳定 `TIMEOUT`/`NETWORK_ERROR`。
- Caller 只有在 GET 或带同一 `Idempotency-Key` 的 mutation 上才可安全重试。

**目标**：如未来引入 retry，必须按错误分类、有限次数、capped exponential backoff + jitter，并保持 cancellation 和
overall deadline；mutation 在建立 durable command identity 前不得自动重试。

## 5. Idempotency 与 transaction recovery

Receipt claim、hash compare、aggregate mutation、serialized response completion 共用一个 PostgreSQL transaction 和
`FOR UPDATE` lock。Transaction 中任一步失败都会 rollback。Completed replay 先从 JSONB 解码成对应 domain shape，
异常数据 fail closed。

并发验证脚本用同一 tenant/key 同时发起两个 Site create，并检查 Site/Host/receipt 各一条。它是局部一致性证据，不覆盖：

- 不同 key 对同一 natural identity 的全部并发组合；
- process crash/connection loss 的每个 PostgreSQL commit 边界；
- operation name 未进入 hash 的跨 operation key reuse；
- receipt retention、归档或长期 replay compatibility。

## 6. Cache consistency

Runtime Manifest key：

```text
<namespace>:manifest:<tenant>:<product>:<locale>:<surface-or-default>
```

Cache hit 复核 tenant/product/locale；decode/identity mismatch 失败为 503，不回退 PostgreSQL。Miss 从 PostgreSQL assembly
后写入 30 秒 TTL。

**缺口**

- Config/Policy/Release/Binding mutation 没有主动 invalidation；最多依赖 TTL，但 publish/binding 尚未形成完整应用流。
- Surface identity 不在 manifest value 中，只通过 key 分区。
- 没有 hit/miss/decode/digest mismatch metrics。
- 没有 stampede protection、single-flight、negative-cache policy 或 cache capacity test。

## 7. Failure mode matrix

| Failure | Observable response | 当前恢复 |
|---|---|---|
| Redis startup unavailable | process startup error | Redis 恢复后重启 process |
| Redis runtime unavailable | readiness 503；manifest 503 | Redis 恢复后 readiness 自动恢复；重新读取/填充 cache |
| PostgreSQL unavailable | readiness/业务 503 | Pool 可重新建立连接后，下一次请求从 durable facts 读取 |
| Cache malformed/identity mismatch | manifest 503 | 隔离并删除确认的 namespace key，再从 PostgreSQL 重建 |
| Site Host mismatch | 404 NOT_FOUND | 修复可信 BFF Host 或 System-owned Site/Host data |
| Permission/service auth failure | 403；未配置 token 为 503 | 修复 caller context/secret；不要绕过 guard |
| Idempotency digest conflict | 409 | Caller 检查 command identity，使用原 payload 或新 key |
| Invalid release transition | 400 INVALID_STATE | 读取当前状态，只执行下一合法 transition |
| Shutdown deadline exceeded | lifecycle error log，exit code 1 | 平台替换实例并调查 hanging closer |

详细命令见 [`RUNBOOK.md`](RUNBOOK.md)。

## 8. Observability

**已实现**：request/lifecycle JSON log 包含 `service`、`operation`、`request_id`、`trace_id`、`result`、`duration_ms`；
unexpected error 只记录 error class name，不泄漏原 payload/credential。

**缺口**：没有 metrics/tracing exporter、dependency latency、lock wait、cache、pool saturation、queue depth、release transition
或 idempotency conflict counters；没有仓内 dashboard/alert rule。SLO burn-rate 条件目前只是目标，见 [`SLO.md`](SLO.md)。

## 9. Testing and fault evidence

| Gate | 覆盖 |
|---|---|
| `pnpm test` | unit/transport/architecture/contract source、Redis/PostgreSQL decoder、simulated recovery/shutdown |
| `pnpm test:postgres-concurrency` | 真实 PostgreSQL receipt lock/atomicity |
| `pnpm test:runtime-smoke` | 隔离 database + 共享 Redis；listener/SDK/tenant/precedence/cache/errors |
| `pnpm test:runtime-real-system` | canonical schema + System Site/Host + Manifest + Connect |
| image smoke | production image non-root entry、health/readiness against dependencies |

Local passing output only applies to the tested checkout/dependencies. Current scripts do not test multi-instance load, dependency latency
injection, network partitions, disk-full, Redis eviction, PostgreSQL failover, rolling deploy drain, backup restore, or regional disaster.

## 10. Durability、backup 与 disaster recovery

PostgreSQL 是唯一 durable source，Redis 可从 PostgreSQL 重建。仓库没有 backup job、PITR configuration、restore script、
cross-region replica、RPO/RTO measurement 或恢复演练报告；这些均为外部平台前置/缺口。进入生产前应把明确 RPO/RTO、
backup retention、restore owner、演练频率和 evidence URL 纳入平台 runbook，而不是在本仓伪造数值。
