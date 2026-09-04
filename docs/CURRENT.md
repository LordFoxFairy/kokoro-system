# kokoro-system 当前状态

状态日期：2026-09-03。本文区分当前实现、生产目标和已知缺口；本地 test/smoke 不能替代生产遥测、安全评估、
容量验证或恢复演练。

## 1. Owner 与当前 surface

**已实现**

- System 是 Site、Site Host、Workspace、Product/Profile、System Config、Config Release/Binding、Site Policy、
  Runtime Manifest 与本仓 command receipt 的事实 owner。
- HTTP 提供 `/healthz`、`/readyz`、`/v1/system/*` runtime/control-plane routes；Connect 提供
  `kokoro.site.v1.SiteService/ResolveSiteByHost`。
- PostgreSQL 是 durable fact store；Redis logical DB 2 缓存完整 Runtime Manifest，TTL 固定 30 秒。
- 生产组合根只装配 PostgreSQL repository 与 Redis cache，不装配 InMemory/Fake。
- canonical schema 只有 `database/schema.sql`，`db:apply-schema` 只接受空 database；不存在 migration 目录与外键。
- HTTP wire 使用 snake_case 和统一 `data|error + meta.request_id` envelope。
- Proto 只声明 System 使用的 `kokoro.site.v1`；generated TypeScript 位于 `src/generated/proto/`，由本仓
  `contract/proto/` 清理后重生成。

**外部前置**

- BFF 完成浏览器 session、CSRF、IAM admission，构造可信 tenant/actor/organization/permission/Host 上下文并持有
  System service token。
- 部署平台提供 TLS、网络隔离、secret 分发/轮换、PostgreSQL/Redis 可用性、备份恢复与遥测后端。

## 2. 已落地控制

| 范围 | 当前实现 | 可定位证据 |
|---|---|---|
| Service auth | `x-kokoro-service: web-bff` + internal secret 或 Bearer；常量时间 token 比较；业务 route fail closed | `src/interfaces/http/service-auth.ts`、HTTP/RPC tests |
| Tenant/Host | Manifest 和 SiteService 在本仓按 active `tenant_id + normalized hostname` 解析 Site | `postgres-site-host-resolver.ts`、tenant/Connect tests |
| Permission | Control reads=`system:read`；普通 mutation=`system:write`；release transition=`system:publish`；global config 还要求 publish | `system-control.service.ts` |
| Idempotency | tenant + key receipt、request hash、row lock、mutation 与 response completion 同事务 | `receipt-repository.ts`、PostgreSQL concurrency script |
| Release state | `draft -> validated -> published -> retired`，基于 version 更新 | application/repository tests |
| Boundary decoding | Redis cache 与 PostgreSQL rows 从 `unknown` 做运行时 shape/enum/time 解码 | value/cache decoder tests |
| Availability gate | `/readyz` 同时 ping PostgreSQL/Redis；镜像 HEALTHCHECK 使用 readiness | bootstrap、Dockerfile、smoke tests |
| Shutdown | SIGINT/SIGTERM 并发关闭 HTTP/PostgreSQL/Redis，默认总 deadline 10 秒 | `shutdown.ts`、tests |
| Supply chain | Action SHA 固定、fs/image 阻断扫描、候选镜像 smoke、SBOM/provenance/attestation 配置 | `.github/workflows/` |
| 工程治理 | 分层、SQL boundary、generated boundary、canonical docs、OpenAPI metadata 与严格 TS 有本地门禁 | `test/architecture/`、contract tests |

## 3. 本阶段治理闭环

**已实现于本分支**

- 建立精确大小写的 README/INDEX/CURRENT/TECHNICAL_DESIGN/API_CONTRACT/DATA_MODEL/SECURITY/RELIABILITY/
  ACCEPTANCE/SLO/RUNBOOK 与 ADR 文档图。
- 合并并删除大小写混合或内容重复的旧文档，不保留 compatibility link。
- 增加 `contract/README.md`，明确 owner、visibility、version、generation、breaking、provenance 和 consumer workflow。
- 为直接 OpenAPI operation 与 reusable Path Item operation 增加 owner/visibility/stability/idempotency/permission metadata。
- 本地 verifier 和 Vitest 同时检查 metadata；顶层 tsconfig 显式启用 `useUnknownInCatchVariables`。
- 删除未使用且跨 owner 的 `kokoro.common.v1` source/generated/provenance；owner test 禁止其回归，并核对完整
  Proto provenance inventory/digest 与隔离重生成物。

完成证据必须来自当前 committed tree 上重新执行 [`ACCEPTANCE.md`](ACCEPTANCE.md) 的命令；本文不固化会过期的
“全绿”自报。

## 4. 已知实现缺口

### 发布前优先收敛

1. **Release 闭环不完整**：HTTP 可创建并转换 Config Release，但没有 Product、Release Binding 管理 surface；
   publish 不建立 active binding，也不失效相关 Redis manifest。当前真实 smoke 通过 fixture 直接写 binding。
2. **Config 关系校验不足**：`POST /v1/system/config` 接收 `product_id`、`release_id`，repository 未验证它们存在、
   tenant/状态一致；不同 idempotency key 的同一 config identity 并发写也没有数据库唯一约束兜底。
3. **Schema validation 未实现**：`schema_version` 被保存，但 `value` 没有按 module/schema 注册表做运行时校验。
4. **Policy enforcement 未闭环**：manifest assembly 尚未执行 Site Policy 的 allowed product/locale/public rules。
5. **生产 service credential**：当前只有一个静态共享 token，无 key id、双 key 轮换窗口、mTLS/workload identity；
   TLS 与网络限制完全依赖外部平台。

### 可观测性与可靠性缺口

1. 仓库只输出结构化 stdout log；没有 metrics exporter、distributed tracing exporter、dashboard、告警 rule artifact 或
   生产 30 天 SLI 数据，因此 [`SLO.md`](SLO.md) 全部是目标值。
2. Redis 有 reconnect strategy，但没有显式 command/overall timeout；Node HTTP server 没有显式 headers/request/
   keep-alive timeout、并发上限或 load shedding。
3. 1 MB body 限制在 body 全部读入内存后检查，不是 streaming early-reject；SDK 读取响应也没有 byte 上限。
4. Runtime Manifest 依赖 Redis 并 fail closed；没有经批准的 stale snapshot/degraded mode。该行为是当前取舍，
   生产容量与依赖预算尚未用数据验证。
5. Cache 只有 30 秒 TTL，没有 mutation-driven invalidation；cache identity 复核 tenant/product/locale，surface 只靠 key 隔离。
6. `configVersion` 从数据库 bigint string 集合用字符串排序选最大值；两位数后可能不符合数值顺序。
7. Manifest digest 基于 `JSON.stringify`，没有跨语言 canonical JSON 规范或签名。

### Contract 与代码健康缺口

1. OpenAPI 尚未完整声明实现读取的 `Forwarded`/Host、actor、organization、permissions、trace headers；其
   `x-kokoro-request-id` 声明 UUID，但服务端接受任意非空字符串。
2. OpenAPI breaking comparison、generated artifact digest/source commit、OpenAPI provenance 尚未自动化；
   `contract/provenance.json` 当前只验证 proto source digest。
3. TypeScript SDK 是手写且只覆盖 Runtime Manifest；`workloadToken` compatibility alias 仍在 SDK public options。
4. `src/interfaces/http/server.ts` 超过 400 行评审线，需按 context/header/body/router/error mapping 职责拆分；
   本阶段不触碰 runtime。
5. Schema 中 `system_product_profile` 与 release-binding lifecycle 尚无 production application writer；
   `system_audit_event` 也未接入且需和 IAM 的 Audit owner 边界重新确认。Retention/GC policy 未实现。

## 5. 非目标

本阶段删除 System 未使用的跨 owner Proto 与对应 generator output/provenance，只修改本仓 contract 治理；业务运行时、
数据库 Schema、其他仓 contract 与部署拓扑不变。上述其余缺口不是在文档中宣称已解决，而是后续由 System owner
通过 contract-first、测试先行的独立变更闭环。
