# System 代码地图

| 入口 | 单一职责 |
| --- | --- |
| `src/main.ts`, `src/start-system.ts`, `src/app.module.ts` | 正式 Nest 启动、依赖失败清理、信号 drain、组合根 |
| `src/modules/sites` | Site/Host/Policy、父删除引用保护与维护 |
| `src/modules/workspaces` | tenant/Site Workspace 身份、恢复与维护 |
| `src/modules/products` | Product/App/immutable Feature、exposure/presentation、类型化配置、release/binding、投影与维护 |
| `src/modules/runtime-manifests` | Policy admission、完整维度隔离、双 generation fence 与 Redis TTL |
| `src/modules/model-catalog` | catalog/definition/provider/label/revision/routing/health/resolve 与维护 |
| `src/system.error.ts`, `src/http/system-error-status.ts` | 中性业务错误与独立HTTP穷尽映射 |
| `src/modules/*/*.public.ts` | 四个owner显式公开Module/投影/维护provider及投影schema |
| `src/database/page-query.ts` | Repository已解析keyset查询类型，不依赖HTTP codec |
| `src/access`, `src/http` | 可信 service/tenant/permission、schema transport、request budget/日志/envelope |
| `src/config`, `src/database`, `src/cache`, `src/health` | 配置/pg事务receipt/Redis连接/probe 技术支持 |
| `src/health/health.service.ts` | readiness技术依赖聚合；Controller仅委托，liveness不调用依赖 |
| `src/maintenance` | 有界定时调度 owner 维护；不写跨模块业务表 |
| `database/schema.sql` | 唯一 22 表 SQL 事实源、索引与 immutable guards |
| `src/modules/*/schemas`, `src/http/protocol.schema.ts` | 运行时 HTTP wire Zod 事实源 |
| `scripts/generate-system-openapi.ts`, `system-openapi-operations.ts` | 单向 OpenAPI 生成与操作 metadata |
| `scripts/update-system-openapi-provenance.ts`, `verify-openapi-contract.ts` | 原18个HTTP输入 + Products公开schema入口，共19个source digest与drift |
| `scripts/verify-system-fresh-schema.ts`, `system-runtime-smoke.ts` | 隔离 fresh schema/source/image 验证 |
| `test/unit`, `test/contract`, `test/architecture`, `test/integration` | 纯规则、wire、83 原生 route/写表边界、真实 PG/Redis/生命周期/维护 |

依赖：Controller → 同模块 Service → 同模块 Repository；跨模块业务投影通过公开 Service；同库完整性只读 SQL 遵循统一父锁顺序。旧全局层/RPC/generated/SDK 不再存在。文档见 [docs/INDEX](docs/INDEX.md)。
