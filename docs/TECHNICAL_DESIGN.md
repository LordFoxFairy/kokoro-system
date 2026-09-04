# kokoro-system 技术设计

状态：当前实现设计，2026-09-04。带“目标/缺口”的段落不是现有能力声明。Machine-readable wire source 位于
[`../contract/`](../contract/README.md)，数据定义位于 [`../database/schema.sql`](../database/schema.sql)。

## 1. 业务边界

```text
Browser
  -> Web same-origin adapter
  -> BFF (session, CSRF, IAM admission, trusted context)
  -> kokoro-system (Site/Host/Workspace/Config/Release/Policy/Manifest facts)
       -> PostgreSQL (durable facts)
       -> Redis DB 2 (complete-manifest cache only)
```

System 不拥有 Tenant/Identity/Permission 本体，也不读取其他 owner 的数据库。`tenant_id` 是 BFF 在 service-authenticated
请求中提供的 opaque isolation context；`site_id` 是 System 内部资源 ID。Manifest 中跨 owner 数据只保存 reference，
不复制对方事实。

## 2. 分层与依赖

```text
interfaces -> application -> domain
bootstrap  -> application + infrastructure + interfaces
infrastructure -> application/domain ports
```

- **Domain**：model、state vocabulary、Host normalization、domain error；不导入 transport/database/generated。
- **Application**：Runtime Manifest query、control command/query、permission、idempotency 与 release transition。
- **Infrastructure**：PostgreSQL repository/row mapper、Redis manifest cache、connection timeout。
- **Interfaces**：HTTP/Connect parsing、service auth、wire mapper、envelope、error mapping、structured log。
- **Bootstrap/config**：从环境装配真实依赖并处理 lifecycle；生产路径没有 InMemory fallback。

`src/index.ts` 只暴露 application service、domain model 和 port；具体 PostgreSQL/Redis/HTTP/bootstrap 实现留在服务内部。

## 3. Runtime Manifest 读取流

**已实现**

1. HTTP route 先验证 `web-bff` service identity 与 token。
2. 解析 `x-kokoro-tenant-id`、可选 actor/organization/surface/request id，以及 `Forwarded` 第一项的 `host`；
   没有 Forwarded 时退回 `Host`。
3. `normalizeHost` 拒绝空值、控制字符、userinfo、path/query/fragment、wildcard，转小写并移除尾随点。
4. PostgreSQL `SiteHostResolver` 以 tenant + active Site + active Host 查询，且在 cache/database manifest 读取前执行。
5. Redis key 为 `<namespace>:manifest:<tenant>:<product>:<locale>:<surface-or-default>`；hit 后复核
   tenant/product/locale identity。
6. Cache miss 时，repository 将 product key/UUID 解析成 active Product；active tenant+product binding 必须联查到
   `release.tenant_id = request tenant` 且 release 状态为 `published`，否则按无可见 release 处理，再读取 active Config records。
7. 对相同 `module_key + config_key` 按 `surface > tenant > product > global`、精确 locale、绑定 release、
   config version、ID 决定优先级，投影 navigation/localization/theme/feature flags/references。
8. `config_version` 以 PostgreSQL BIGINT 对应的 `BigInt` 数值顺序求最大值；使用
   SHA-256(`JSON.stringify(manifest-with-empty-digest)`) 生成 digest，写 Redis 30 秒后返回 snake_case wire。

Product 不存在时当前返回 identity-preserving empty manifest（`config_version="0"`、`release_id=null`），不是 404。
Redis、PostgreSQL、cache decode/identity 任一失败都映射为 `503 SYSTEM_UNAVAILABLE`；不存在进程内或 stale snapshot 降级。

**缺口**：publish 不创建 binding，Product/Profile/Binding 尚无管理 surface；Site Policy allow-list 尚未进入 assembly；
digest 尚无 canonical JSON/signature 规范。

## 4. Control-plane query 与 mutation

### Query

List Site/Workspace/Config 与 Get Policy 先执行 `system:read` permission。列表默认 limit 50、最大 100；cursor 是
最后一条 UUID 的 base64url，repository 使用 `id > cursor ORDER BY id`。Site 列表在同一 System owner 内以 tenant 条件
LEFT JOIN active Host，其他 query 均显式 tenant predicate；global Config 与 caller tenant Config 一起返回。

### Mutation

```text
service auth
-> trusted tenant/permission context
-> body and application validation
-> require Idempotency-Key
-> BEGIN
-> INSERT receipt ON CONFLICT + SELECT ... FOR UPDATE
-> compare request hash
-> execute aggregate repository operation
-> persist completed response
-> COMMIT
```

Receipt key space 是整个 tenant，不包含 operation name。相同 tenant/key/hash 重放已保存的 domain result；相同 key 不同
hash 返回 409。Operation 抛错时整个事务回滚，不留下成功 response。PostgreSQL 并发脚本验证同 key 的两个并发 Site
命令只生成一个 Site、Host 与 completed receipt。

普通 mutation 需要 `system:write`；release transition 需要 `system:publish`；global config upsert 先要求 write，再额外要求
publish。Site 创建把 Site 与初始 Host 放在同一事务；Workspace/Policy 先按 tenant 检查 Site。Config/Release 的关系缺口
见 [`CURRENT.md`](CURRENT.md)。

Publish/retire 的 PostgreSQL mutation 与 receipt 先提交，再由 application 通过 cache invalidation port 删除该 tenant 的
Runtime Manifest keys。Redis 失效失败时 command 返回 dependency failure；相同 idempotency key replay 不重复状态转换，
但会再次执行失效，使 committed release 状态最终与 cache 可见性收敛。Validate 不改变 release 可见性，因此不失效 cache。

## 5. 状态与并发

| Aggregate | Schema vocabulary | 当前可达 transition |
|---|---|---|
| Site | `draft/active/suspended/archived` | HTTP 只创建 `active`；无状态管理 surface |
| Site Host | `active/archived` | HTTP 只随 Site 创建 `active` |
| Workspace | `active/archived` | HTTP 只创建 `active` |
| Site Policy | `active/archived` | PUT 原位 version + 1，保持 `active` |
| Config | `active/deleted` | POST create/update active record；无 delete surface |
| Config Release | `draft/validated/published/retired` | application 强制顺序前进；version compare + row lock |
| Command Receipt | `pending/completed` | 同事务 claim -> complete；失败回滚 |

V1 不使用数据库 foreign key。关系完整性由 tenant predicate、存在性查询、同事务写入、固定 row lock、CHECK 与有业务
语义的 UNIQUE 维护。尚未完整维护的关系必须作为缺口而不是依赖文档假设，详见 [`DATA_MODEL.md`](DATA_MODEL.md)。

## 6. Runtime、timeout 与 lifecycle

- PostgreSQL pool：max 10、connect 1.5 秒、idle 30 秒、statement 10 秒、query 15 秒。
- Redis：启动组合根先 `PING`；最多 3 次 reconnect strategy，delay 100–500 ms；未设置显式 command deadline。
- `/healthz` 只证明进程响应；`/readyz` 每次 ping PostgreSQL 与 Redis，任一失败返回 503。
- HTTP request body 上限声明为 1,000,000 bytes，但当前在完整缓冲后检查。
- SIGINT/SIGTERM 并行关闭 listener、pool、Redis；默认总 deadline 10 秒，超时后关闭连接并设置非零 exit code。
- 结构化 request/lifecycle log 字段为 `service/operation/request_id/trace_id/result/duration_ms`；没有 metrics/tracing exporter。

## 7. Contract 与 SDK

OpenAPI 3.1 描述 HTTP；proto 描述 SiteService。每个 OpenAPI operation 带 owner、visibility、stability、idempotency、
permission metadata。`src/generated/proto` 来自 Buf；server-only TypeScript SDK 是手写 transport，当前只实现
Runtime Manifest，不等同于 OpenAPI generated client。

System Protobuf 只声明本仓使用的 `kokoro.site.v1`。Contract gate 拒绝 `kokoro.common.v1` 等 foreign package，要求
provenance inventory 完整覆盖 canonical source，并以隔离重生成结果校验 checked-in generated output。

Contract generation、breaking 与 provenance 的当前能力/缺口见 [`../contract/README.md`](../contract/README.md)。

## 8. 测试与交付

- Vitest 覆盖 domain/application、HTTP/Connect、tenant isolation、boundary decoder、failure recovery、shutdown、
  architecture 与 contract source。
- PostgreSQL concurrency script 覆盖真实 row lock/receipt；runtime smoke 创建隔离 database、复用共享 Redis namespace，
  验证 listener/SDK/Site Host/precedence/cache isolation、draft/retired/foreign-tenant release fail-closed、publish/retire
  cache invalidation 与 BIGINT version 顺序。
- CI 安装空 schema 后运行 contract/check/unit/real integration、阻断式 fs scan，并构建镜像。
- Tag release 在 push 前 build/smoke/scan 本地 production candidate，再请求 SBOM/provenance/attestation。

这些是可执行门禁定义，不是生产流量、容量或 SLO 达标证据。

## 9. 后续目标（未实现）

1. Contract-first 补 Product/Profile/Release Binding 管理生命周期及 Config/Policy/Binding mutation cache invalidation。
2. 为 Config relationship/schema validation 写失败测试并补事务不变量。
3. 拆分超过 400 行的 HTTP server，同时保持 wire 行为不变。
4. 增加 bounded inbound timeout/streaming size guard、Redis command deadline、metrics/tracing 与 production alert artifacts。
5. 自动化 OpenAPI breaking comparison、全 contract/generated provenance 与 consumer artifact 发布。
