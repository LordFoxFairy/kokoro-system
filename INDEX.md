# kokoro-system 代码与边界地图

状态：当前实现地图，2026-09-03。规范性机器事实源优先级为 `contract/` 与 `database/schema.sql`；本文只解释入口，
不复制字段定义。

## 运行时依赖方向

```text
interfaces -> application -> domain
bootstrap  -> application + concrete infrastructure + interfaces
infrastructure -> domain/application ports
domain -> no HTTP, PostgreSQL, Redis, generated wire or Node runtime imports
```

## 源码目录

| 路径 | 当前职责 |
|---|---|
| `src/domain/runtime-manifest/models/` | Tenant request context、config record 与 manifest 领域数据 |
| `src/domain/runtime-manifest/services/` | Host 规范化纯规则 |
| `src/domain/system/models/` | Site、Workspace、Policy、Config、Release 与 Site resolution 模型 |
| `src/domain/system/enums/` | 有限状态与 config scope 类型 |
| `src/domain/system/errors/` | 稳定 application/domain error carrier |
| `src/application/runtime-manifest/ports/` | Manifest repository、cache、Site Host resolver ports |
| `src/application/runtime-manifest/services/` | 先验证 Site/Host、再读缓存/事实源的 manifest 用例 |
| `src/application/system/dto/` | Control-plane command/query DTO 与 opaque cursor page |
| `src/application/system/mappers/` | Durable receipt replay 的 unknown-to-domain decoder |
| `src/application/system/ports/` | System control repository 与 permission vocabulary |
| `src/application/system/services/` | Permission、idempotency、release state machine 与 Site query 编排 |
| `src/infrastructure/persistence/postgres/` | Pool、transaction client、timeout 与 row value decoder |
| `src/infrastructure/repositories/runtime-manifest/` | Product/release/config 查询、precedence 与 manifest projection |
| `src/infrastructure/repositories/system/` | Site、Host、Workspace、Policy、Config、Release、receipt repositories |
| `src/infrastructure/redis/` | 完整 Runtime Manifest cache、TTL、解码与 readiness |
| `src/interfaces/http/` | Node HTTP router、JSON envelope、body/header validation、BFF service auth |
| `src/interfaces/rpc/` | 由 generated descriptor 注册的 Connect SiteService handler |
| `src/interfaces/observability/` | 结构化日志接口与 stdout 实现 |
| `src/config/` | 环境变量解析与启动配置 |
| `src/bootstrap/` | PostgreSQL/Redis/application/transport 组合与 shutdown deadline |
| `src/generated/proto/` | 从本仓 proto 生成的只读 TypeScript；禁止手改 |
| `src/main.ts` | Production process entry、listen、signal 与 lifecycle logging |
| `src/index.ts` | Runtime-neutral application/domain/port exports；不导出具体 adapter |

## Contract、持久化与 SDK

| 路径 | 当前职责 |
|---|---|
| `contract/openapi/system.openapi.json` | HTTP OpenAPI 3.1 machine contract 与 operation governance metadata |
| `contract/proto/kokoro/site/v1/site.proto` | SiteService Connect RPC source |
| `contract/provenance.json` | Proto source file digest inventory；覆盖范围和缺口见 `contract/README.md` |
| `database/schema.sql` | 唯一 V1 canonical schema；无 migration、无 foreign key |
| `scripts/apply-schema.ts` | advisory-lock 下向空 database 安装 canonical schema |
| `scripts/verify-openapi-contract.ts` | OpenAPI version/path/governance metadata gate |
| `scripts/verify-contract-provenance.ts` | Proto source digest drift gate |
| `sdk/typescript/src/` | 手写 server-only Runtime Manifest client；不是 OpenAPI generated SDK |
| `test/architecture/`、`test/contract/` | 分层、文档拓扑、contract owner/provenance/generated drift 与 CI/release 门禁 |
| `scripts/test/` | PostgreSQL/Redis/runtime/production-image smoke 与幂等并发验证 |

## HTTP 与 RPC surface

- Probes：`GET /healthz`、`GET /readyz`。
- Runtime：`GET /v1/system/runtime-manifest`。
- Control-plane：Site、Workspace、Site Policy、Config、Config Release 创建/读取与 release transition。
- RPC：Connect `kokoro.site.v1.SiteService/ResolveSiteByHost`。

路径、header、权限、错误码和 envelope 见 [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)；字段级定义以
machine contract 为准。

## 数据所有权

System 拥有 Site、Host、Workspace、Product/Profile、Config、Release/Binding、Policy 与 System command receipt。
`tenant_id` 是跨仓 opaque isolation context；`site_id` 只在 System 内部作为资源标识。System 不保存 IAM 权限事实，
只消费通过 BFF service-auth boundary 的 permission snapshot。表、自然键、关系维护与 retention 缺口见
[`docs/DATA_MODEL.md`](docs/DATA_MODEL.md)。

## 文档地图

从 [`docs/INDEX.md`](docs/INDEX.md) 开始。特别关注：

- [`docs/CURRENT.md`](docs/CURRENT.md)：已实现、目标与缺口；
- [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md)：执行流、事务和依赖边界；
- [`docs/SECURITY.md`](docs/SECURITY.md) / [`docs/RELIABILITY.md`](docs/RELIABILITY.md)：控制与未闭环项；
- [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)：可执行验收矩阵；
- [`docs/RUNBOOK.md`](docs/RUNBOOK.md)：启动、诊断、恢复与回滚。

## 当前结构性审查点

`src/interfaces/http/server.ts` 已超过普通源码 400 行评审线但未超过 800 行阻断线；拆分属于后续 runtime refactor，
不在本阶段文档/治理闭环内。其他当前手写 TypeScript 文件未超过 400 行评审线。具体优先级见
[`docs/CURRENT.md`](docs/CURRENT.md)。
