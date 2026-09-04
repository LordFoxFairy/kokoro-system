# kokoro-system SLO

状态：**目标**，2026-09-03。仓库没有生产期 SLI 时间序列、完整窗口报告、dashboard 或告警执行记录；下列百分比、
延迟和错误预算不是当前实测值。Release/local smoke 只证明执行时点的路径可用，不能替代滚动窗口数据。

故障处置见 [`RUNBOOK.md`](RUNBOOK.md)，可靠性机制/缺口见 [`RELIABILITY.md`](RELIABILITY.md)，surface 见
[`API_CONTRACT.md`](API_CONTRACT.md)。

## 1. Owner 与窗口

- Service owner：System team（具体 on-call roster 由部署平台登记，仓库当前未保存个人信息）。
- 统计窗口：rolling 30 days。
- Eligible traffic：经 service auth 并进入业务 handler 的生产请求；probe 单独监控，不进入业务 availability SLI。
- 维度：`surface_group`、`operation`、`result`、`dependency`；禁止把 tenant/request/trace/token 作为 metrics label。

## 2. Surface groups

| Group | Operations |
|---|---|
| Runtime data plane | `GET /v1/system/runtime-manifest` |
| Site resolution RPC | Connect `kokoro.site.v1.SiteService/ResolveSiteByHost` |
| Control-plane reads | Site/Workspace/Policy/Config GET |
| Control-plane commands | Site/Workspace/Policy/Config/Release mutation 与 transition |
| Probes | `/healthz`、`/readyz`；单独告警，不计业务 SLO |

## 3. Availability target

```text
availability = good eligible requests / all eligible requests
```

| Group | 30-day target | Good request |
|---|---:|---|
| Runtime data plane | 99.90% | 2xx 且 response 满足 contract |
| Site resolution RPC | 99.90% | Connect success 且 generated type 可解析 |
| Control-plane reads | 99.90% | 2xx 且 response 满足 contract |
| Control-plane commands | 99.50% | Contract 允许的 2xx；idempotent replay 返回首次结果也计 good |

排除：caller 主动取消、确认的 caller network failure、400 validation/cursor/state、403 auth/permission、404 resource、409
business/idempotency conflict。计 bad：服务端 5xx、Connect Internal/Unavailable、deadline、malformed success、ready instance
仍接收并失败的业务流量。分类只能使用稳定 status/code，不按 message 文本。

**目标缺口**：当前没有 metrics exporter，因而还不能按上述规则生成生产分子/分母。

## 4. Latency target

Latency 从服务收到 request 到 response 完成，按 eligible request 的 rolling 30-day p95/p99；deadline 同时计 availability bad。

| Group | p95 | p99 |
|---|---:|---:|
| Runtime data plane | <= 250 ms | <= 750 ms |
| Site resolution RPC | <= 150 ms | <= 500 ms |
| Control-plane reads | <= 300 ms | <= 1,000 ms |
| Control-plane commands | <= 500 ms | <= 1,500 ms |

Manifest 应按 Redis hit/miss 分维度，但 cache miss 不放宽整体目标；command lock wait 包含在端到端 latency。当前 structured
log 有 `duration_ms`，但没有 histogram/exporter 或生产分位数聚合。

## 5. Dependency/readiness objective

- `/healthz` 只检查 process liveness。
- `/readyz` 每次真实 ping PostgreSQL 与 Redis；任一失败实例应从流量入口移除。
- Runtime Manifest 不使用 stale/in-process fallback；依赖失败按 503 计入 availability。
- 目标：可用实例数为 0 的持续时间不得被 probe 正常掩盖；deployment 必须以 `/readyz` 做 admission。

生产监控应至少采集 dependency operation count/error/latency、pool saturation、Redis reconnect、cache hit/miss/decode mismatch、
receipt lock wait/idempotency conflict、release transition 和 process restart。当前这些 metrics 未实现。

## 6. Error budget

30 天按 43,200 分钟仅作直观换算；请求型 SLI 的正式预算按 bad request 数消耗。

| Target | 最大 bad ratio | 等价连续不可用时间 |
|---|---:|---:|
| 99.90% | 0.10% | 43 分 12 秒 |
| 99.50% | 0.50% | 3 小时 36 分 |

目标政策：

1. 消耗 50%：暂停非必要可靠性风险变更，owner 复盘主要错误来源。
2. 消耗 75%：冻结非紧急发布，执行 runbook/failure drill。
3. 消耗 100%：只允许恢复、可靠性和安全变更，直到 rolling window 恢复或风险被书面接受。

该政策尚无自动 enforcement 或生产预算数据。

## 7. Alert objectives

| Severity | Target condition | Action |
|---|---|---|
| Page | 99.90% SLO：1h burn >=14.4 且 5m 同时超阈值 | 立即查依赖、发布、error code |
| Page | 99.90% SLO：6h burn >=6 且 30m 同时超阈值 | 当班响应并限制发布 |
| Ticket | 3d burn >=1 | 下一个工作日分析预算 |
| Page | ready instance 为 0，或单实例 `/readyz` 连续失败 5m | 查 PostgreSQL/Redis/pool/deploy |
| Warning | 任一业务组 p95 连续两个 10m window 超目标 | 查 DB/Redis/cache/lock |
| Page | 任一业务组 p99 连续 10m 超目标且达到流量下限 | 查 tail latency/saturation |
| Page | 生产出现 `service_auth_not_configured` | 查 secret 注入/部署配置 |
| Page | cross-tenant/cache identity mismatch > 0 | 隔离实例并按安全事件处理 |

低流量事件数下限、具体 query、dashboard 和 routing 尚未配置，不能把本表视为已部署告警。

## 8. Evidence required after launch

每个完整窗口应保存：commit/image digest、deployment interval、eligible/bad counts、p50/p95/p99、budget burn、dependency/cache
breakdown、incident/release annotations、missing-data rate 和 query/version。首次完整窗口建立 baseline，但不修改本文件的目标
来掩盖不足；实测报告应独立保存并链接到受控 observability system。
