# kokoro-system SLO

本文定义 `kokoro-system` 的生产服务等级目标（SLO）、测量口径、错误预算和告警阈值。这里的百分比与延迟均为
**目标值**，不是当前实测值。仓库尚未保存生产期 SLI 时间序列或基线报告；release smoke 只证明发布时点的可用性，
不得当作滚动窗口实测值。

故障处置、依赖排查和回滚步骤见 [`runbook.md`](./runbook.md)。Wire contract 见
[`api-contract.md`](./api-contract.md)。

## 1. Surface 分组

| 分组 | 实际 surface | 用途 |
|---|---|---|
| Runtime data plane | `GET /v1/system/runtime-manifest` | 读取租户、产品、locale、surface 对应的运行时配置 |
| Site resolution RPC | Connect `kokoro.site.v1.SiteService/ResolveSiteByHost` | 按受信 tenant context 与 host 解析 Site |
| Control plane reads | `GET /v1/system/sites`、`GET /v1/system/workspaces`、`GET /v1/system/sites/{site_id}/policy`、`GET /v1/system/config` | 读取 System-owned 资源 |
| Control plane commands | `POST /v1/system/sites`、`POST /v1/system/workspaces`、`PUT /v1/system/sites/{site_id}/policy`、`POST /v1/system/config`、`POST /v1/system/releases`、三个 release transition endpoint | 幂等创建、更新和状态迁移 |
| Probes | `GET /healthz`、`GET /readyz` | liveness 与依赖 readiness，不计入业务 availability |

旧 `/system/*` 与伪 `/rpc/*` JSON 路径不是 surface，不进入 SLI。

## 2. SLI 口径与目标

### 2.1 Availability

采用滚动 30 天请求口径：

```text
availability = good eligible requests / all eligible requests
```

| 分组 | Availability SLO | Good request |
|---|---:|---|
| Runtime data plane | 99.90% | HTTP 2xx 且响应满足 `data/meta` contract |
| Site resolution RPC | 99.90% | Connect success 且响应可由生成协议解析 |
| Control plane reads | 99.90% | HTTP 2xx 且响应满足 `data/meta` contract |
| Control plane commands | 99.50% | 契约允许的 2xx；重放返回同一业务结果也计 good |

以下请求从 availability 分母排除：调用方主动取消、已验证的客户端网络中断、`INVALID_ARGUMENT`/HTTP 400、
认证授权失败、资源不存在、幂等 key digest 冲突和业务状态冲突。服务端 `5xx`、Connect `Internal`/`Unavailable`、
超时、畸形成功响应以及 readiness 期间仍被送入的失败业务请求计 bad。排除规则必须由稳定 error code 实现，
不得按错误消息文本分类。

### 2.2 Latency

Latency 只统计 eligible requests，从服务收到请求到响应完成；超时同时计入 availability bad request。目标按滚动
30 天分别计算 p95/p99，不把 release smoke 延迟当作生产分位数。

| 分组 | p95 目标 | p99 目标 |
|---|---:|---:|
| Runtime data plane | ≤ 250 ms | ≤ 750 ms |
| Site resolution RPC | ≤ 150 ms | ≤ 500 ms |
| Control plane reads | ≤ 300 ms | ≤ 1,000 ms |
| Control plane commands | ≤ 500 ms | ≤ 1,500 ms |

Runtime Manifest 的 Redis hit/miss 应另设维度观测，但统一 SLO 不因 cache miss 放宽。命令的 PostgreSQL receipt lock
等待时间包含在端到端 latency 中。

## 3. Readiness 与依赖

- `/healthz` 是进程 liveness，只验证 HTTP 进程能响应，不访问 PostgreSQL 或 Redis。
- `/readyz` 每次真实执行 PostgreSQL ping 与 Redis `PING`；两者都成功才返回 200/`ready`。
- PostgreSQL 或 Redis 任一失败、超时或连接不可建立时，`/readyz` 返回 503，实例应从流量入口摘除。
- Runtime Manifest 依赖 PostgreSQL Site/Host 事实与 Redis cache；不使用进程内或旧快照降级。
- Control plane mutation 依赖 PostgreSQL；receipt claim、digest 比较、业务 mutation 和结果保存位于同一事务/锁边界。
- 生产镜像 `HEALTHCHECK` 调用 `/readyz`；release-image 还必须对生产镜像执行 `/healthz` 与 `/readyz` smoke。

依赖客户端指标至少按 `dependency=postgres|redis`、`operation`、`result` 统计请求数、错误数和延迟；连接串、token、
SQL 原文和 payload 不得进入标签或日志。

## 4. 错误预算

30 天按连续 43,200 分钟计算：

| Availability SLO | 最大 bad request 比例 | 等价连续不可用时间上限（仅用于直观换算） |
|---|---:|---:|
| 99.90% | 0.10% | 43 分 12 秒 |
| 99.50% | 0.50% | 3 小时 36 分 |

请求型 SLI 的正式预算按 bad request 数量消耗，不能只按探针停机时间计算。预算策略：

1. 30 天预算消耗达到 50%：暂停非必要可靠性风险变更，完成 owner 复盘。
2. 达到 75%：冻结非紧急发布，优先修复主要错误来源并验证 runbook。
3. 达到 100%：停止功能发布；只允许恢复、可靠性和安全修复，直到滚动窗口恢复或 owner 明确接受风险。

## 5. 告警阈值

告警按 surface 分组，低流量时使用事件数下限，避免单个请求产生无意义分页；具体流量下限在接入监控平台后按生产
基线配置并记录，不在本文件伪造。

| 级别 | 条件 | 动作 |
|---|---|---|
| Page | 99.90% SLO 的 1 小时 burn rate ≥ 14.4，且 5 分钟窗口同样超阈值 | 立即按 runbook 检查依赖、最近发布和错误 code |
| Page | 99.90% SLO 的 6 小时 burn rate ≥ 6，且 30 分钟窗口同样超阈值 | 当班响应并限制发布 |
| Ticket | 3 天 burn rate ≥ 1 | owner 在下一个工作日内分析预算消耗 |
| Page | 任一生产实例 `/readyz` 连续失败 5 分钟，或可用实例为 0 | 检查 PostgreSQL、Redis、连接池与部署 |
| Warning | 任一业务分组 p95 连续两个 10 分钟窗口超目标 | 检查 DB/Redis latency、lock wait 与 cache miss |
| Page | 任一业务分组 p99 连续 10 分钟超目标且达到生产流量下限 | 检查尾延迟、事务锁和依赖饱和 |
| Page | `service_auth_not_configured` 在生产出现 | 检查 secret 注入；该错误表示业务 surface fail closed |

Control plane 99.50% SLO 的 burn rate 使用其自身 0.50% 预算计算，不与 99.90% 分组共用分母。

## 6. 遥测字段与当前基线状态

每个请求和生命周期事件输出结构化 JSON，至少包含：

```text
service, operation, request_id, trace_id, result, duration_ms
```

监控后端应从同一稳定 operation 维度生成请求计数、错误计数和延迟 histogram，并从 `/readyz` 与容器 health 状态生成
依赖 readiness 信号。`request_id` 用于单次请求排查，`trace_id` 用于跨服务关联，两者不得成为指标 label。

当前状态：仓库内没有生产滚动 30 天 availability、p95、p99、错误预算消耗或告警历史，因而本文件不声明任何“当前
达到值”。上线后首个完整窗口应生成独立基线报告，并保持目标与实测值分离。
