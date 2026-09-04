# kokoro-system 当前状态

状态日期：2026-09-04。本文区分当前实现、生产目标和已知缺口；本地 test/smoke 不能替代生产遥测、安全评估、
容量验证或恢复演练。

## 1. Owner 与当前 surface

**已实现**

- System 是 Site、Site Host、Workspace、Product/Profile、System Config、Config Release/Binding、Site Policy、
  Runtime Manifest 与本仓 command receipt 的事实 owner。
- HTTP 提供 `/healthz`、`/readyz`、`/v1/system/*` runtime/control-plane routes；Connect 提供
  `kokoro.site.v1.SiteService/ResolveSiteByHost`。
- PostgreSQL 是 durable fact store，并保存 tenant Runtime Manifest generation；Redis logical DB 2 缓存按 generation 隔离的完整
  Runtime Manifest，TTL 固定 30 秒。
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
| Release state | `draft -> validated -> published -> retired`，基于 version 更新；Manifest 只解析 active binding 指向的同 tenant published release；publish/retire 后按 tenant 失效缓存 | application/repository/real runtime tests |
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
- Runtime Manifest 的 active binding 联查 Config Release，只有 `release.tenant_id` 与请求 tenant 一致且状态为
  `published` 才解析 release；draft、validated、retired 和 foreign-tenant binding 都按无可见 release 处理。
- Release publish/retire 在 PostgreSQL idempotent transaction 完成后失效该 tenant 的全部 Runtime Manifest cache；若
  Redis 失效失败，请求失败，同一 idempotency key replay 会重试失效。
- publish/retire 与 tenant generation 推进属于同一 PostgreSQL transaction；cache read/fill 前后复核 generation，竞态旧填充会
  被删除并重读。不同部署 namespace 中的旧 generation key 即使残留也不会再命中。
- Redis key 对 tenant/product/locale/surface 使用 base64url 分段，null surface 有显式 sentinel；tenant invalidation 使用编码后
  的精确前缀，不受冒号或 Redis glob 字符影响。
- Config 写事务以 caller tenant 锁定 release，仅允许 `draft`/`validated`；published/retired 返回稳定 `INVALID_STATE`，foreign
  tenant 返回 `NOT_FOUND`。
- Manifest 与 control-plane 的 PostgreSQL `BIGINT` 值全部以十进制字符串穿过 row/domain/receipt/HTTP；数值比较和递增使用
  `BigInt`/数据库算术，不经过 JavaScript `number`。

完成证据必须来自当前 committed tree 上重新执行 [`ACCEPTANCE.md`](ACCEPTANCE.md) 的命令；本文不固化会过期的
“全绿”自报。

## 4. 已知实现缺口

### 发布前优先收敛

1. **Release 管理 surface 不完整**：HTTP 可创建并转换 Config Release，但没有 Product、Release Binding 管理 surface；
   publish 不自动创建 binding。当前真实 smoke 通过 fixture 写 active binding，再验证只有同 tenant published release 可见，
   且 publish/retire 会失效 tenant cache。
2. **Config 关系校验仍不完整**：release owner/可写状态已在 transaction 内校验；`product_id` 的存在、状态及与 scope 的一致性
   尚未校验，不同 idempotency key 的同一 config identity 并发写也没有数据库唯一约束兜底。
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
5. Cache 只有 release publish/retire 的 durable generation + tenant-scoped cleanup；Config/Policy 尚未主动推进 generation，
   binding 也没有 application writer。Cache identity 复核 tenant/product/locale，surface 通过无歧义 key 分隔。
6. Manifest digest 基于 `JSON.stringify`，没有跨语言 canonical JSON 规范或签名。

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

本阶段不新增 Product/Profile/Release Binding API，不修改 SDK compatibility alias、Audit owner、readyz、其他仓 contract
或部署拓扑。canonical Schema 只新增 tenant manifest generation；HTTP contract 只把 BIGINT response 收敛为十进制字符串。
上述其余缺口不是在文档中宣称已解决，而是后续由 System owner
通过 contract-first、测试先行的独立变更闭环。
