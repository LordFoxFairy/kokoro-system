# kokoro-system 技术设计

## G0：NestJS 与业务能力设计准备（2026-09-07）

**状态：设计准备，尚未通过目标实现文档门。** 下方第 1–9 节记录当前源码行为，旧全局四层不是后续实现模板。
当前有效任务表见 [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md)。本轮只改文档，不改代码、机器契约或 schema。

### G0.1 已确定的业务边界

System 是站点、产品与运行配置控制面；ADR-029 已决定将 Model Catalog 合入 System，但物理 cutover 尚未执行。

| 能力 | 当前事实 | 目标归属与约束 |
|---|---|---|
| Site/Host/Policy | 创建/列表/域名解析与 Policy 读写；Policy 尚未完整参与 Manifest 准入 | sites；域名与站点策略属于内部子能力，Host 不是执行机器 |
| Product/App/Feature exposure | Product 仅被读取，Profile 仅表；FeatureDefinition/AppFeatureExposure 未实现 | products；产品注册、应用入口、全局 FeatureKey/产品结果契约、tenant/App exposure、展示配置 |
| 配置发布 | 已有 release 状态转换、receipt、generation；binding 依赖外部预置 | 先作为 products 内部发布用例；独立 releases 一级模块未获需求裁决，不预建 |
| Runtime Manifest | 已有读取/缓存 fence；未用解析所得 Site 身份装配站点差异 | runtime-manifests；只读投影，不拥有配置编辑或 Agent 执行事实 |
| Workspace | tenant/site 下身份、名称、状态与 create/list；真实消费者尚未确认 | workspaces 保留当前 owner；扩展用例待定，不复制 IAM 成员或 BFF Project |
| Model Catalog | 仍位于独立 kokoro-model | model-catalog；模型定义/标签、供应方、revision、选用规则；不执行推理 |
| Runtime profile | 当前只有 Manifest，没有独立 profile/执行环境管理实现 | 待消费者、生命周期和契约明确后设计；不预建 runtimes/机器/调度目录 |

IAM 最新映射是 Better Auth Organization.id == tenant_id；System 不新增 Tenant 下第二层 Organization。
IAM 拥有身份/权限/Audit；BFF 拥有 Project/Conversation/ScheduledTask；Agent 拥有 Run/Lease/Checkpoint/执行编排；
Billing 拥有价格/额度/账本；Platform 拥有 Skill/MCP；Storage 拥有对象生命周期。System 只保存必要的 owner reference。

产品结果契约里的成本/权限配置仅表达引用和产品展示约束，不复制 Billing 价格或 IAM 权限事实。
模型配置只输出 route decision metadata；调用 provider、推理流和执行恢复不在 System。
产品配置发布与模型 revision 发布是不同生命周期，产品发布不得修改、发布或回滚模型 revision。

### G0.2 技术栈候选与决定状态

| 项目 | 当前 | 推荐目标 | 状态/证据门 |
|---|---|---|---|
| 运行时/框架 | Node 22 范围、原生 HTTP、手动装配 | Node 24 LTS、NestJS 12、Express adapter | 方向已讨论；精确版本、peer、ESM/装饰器/测试编译组合待核验 |
| HTTP schema | 手写 OpenAPI + 手写 parser | Zod + Nest Standard Schema；运行时 schema 单向生成 OpenAPI | 推荐；须更新本仓 ADR-0002 并验证错误/序列化/响应 parity |
| RPC | Site Connect + Proto；Model 也有 RPC | 依真实消费者作去留裁决 | 未定；IAM 删除 Proto 不等于全仓删除；不预设 generated/proto |
| 数据访问 | System pg；Model 生产路径 Prisma，pg 仅用于 schema 安装 | 推荐 SQL-first + pg，保留显式锁/索引语义 | 未锁定；需比较 Prisma-first、记录 adapter 重写成本与 ADR |
| Redis | System redis；Model ioredis | 合入后同一客户端与连接生命周期 | 精确包/版本待定；业务 namespace/fence 各归所属模块 |
| 工程门禁 | tsc/ESLint/Vitest/Buf | strict TS、typed lint、format、Nest Testing、真实 PG/Redis | 不复制 IAM 未验证的依赖组合 |

候选比较：SQL-first + pg 直接承接 System 的锁、部分/表达式索引与 canonical SQL，但要重写 Model adapter/测试；
Prisma-first 可统一 IAM 的 ORM 经验，但须重新验证全部约束/锁并切换唯一 schema 事实源。
NestJS 并不强制 Prisma。G0 不安装任一候选，不引入双生产数据访问栈。

官方语义核验入口（2026-09-07 查阅，非本仓兼容性验收）：
[Nest Modules](https://docs.nestjs.com/modules)、
[Standard Schema validation](https://docs.nestjs.com/techniques/validation)、
[Nest HTTP adapter](https://docs.nestjs.com/techniques/performance)、
[Node releases](https://nodejs.org/en/about/previous-releases)、
[pg transactions](https://node-postgres.com/features/transactions)。

### G0.3 目标目录与放置设计

下面是职责地图，不是批准创建的空目录清单。新文件在实现任务卡中逐项列出。

~~~text
src/
  main.ts
  app.module.ts
  config/                 已校验启动配置
  database/               唯一数据库连接/事务生命周期
  cache/                  Redis 连接，不放业务 cache 规则
  access/                 服务身份验证、IAM client、受信上下文
  http/                   全局传输边界、错误/envelope 映射
  health/                 probes
  observability/          日志/指标/trace 接线
  modules/
    sites/                域名、站点 policy 随真实文件聚合
    products/             applications/features/exposures/presentation 按切片建立
    runtime-manifests/    只读装配与本模块缓存
    model-catalog/        catalog/providers/revisions/routing 按合入切片建立
    workspaces/           先承接当前最小用例，不扩张未知语义
~~~

不预建顶层 generated、独立 releases、configs、policies、执行 runtimes 或 availability 空目录。
availability 的业务边界继续服从 ADR-029；当前只有 provider health projection，G0 不创建空目录。
Root ARCHITECTURE_STANDARD §2.2 将模块树说明为候选能力地图，不机械全建；本草案中的 providers 收纳方案只是待评审的物理粒度，
不是取消 availability 能力。G1-B 须明确与 ADR-029 一致的最终放置；若改变其已接受边界，先修订 ADR 后采用。
若协议或 ORM 最终需要生成 client，再按生成器和消费边界决定输出位置；Prisma Client、RPC client 与 Redis client 不是同一概念。

| 设计项 | 结论 |
|---|---|
| Owner/writer | System 各业务模块拥有自己的写入口；本轮 Root 仅写文档，其他 Agent 只读 |
| 当前事实 | 966cabe；旧四层/Node HTTP/pg/Redis/Site Proto/SQL，当前完整入口见 INDEX 与 API/DATA 文档 |
| 目标职责 | sites/products/runtime-manifests/model-catalog/workspaces；公开 provider 明确，禁止万能 SystemService |
| 目录比较 | src/<feature> 可行；采用 src/modules/<feature>，因为已有稳定技术目录和多个业务域；不再保留双业务根 |
| 粒度 | Module/Controller/Service 起步；Repository、Model、Mapper 按实际事务/规则需要引入 |
| 依赖 | 模块通过 Nest imports/exports 交互；不 deep-import 对方 Repository，不跨模块查询 model_* 表 |
| 数据/API | 每个 owner 唯一 schema/contract；具体版本、字段、状态、事务与消费者切换需 G1 文档门 |
| 删除项 | 实施时删除被承接的旧路径、失效 Config/Profile/Audit/alias；先证明无用途或已有承接，不按名字删功能 |
| 验证 | G0 文档链接/范围/现有门禁；G1 契约/schema 验证；实现阶段 unit/integration/contract/architecture/build/smoke |

### G0.4 必须保留或补齐的业务不变量

- 保留当前 receipt + mutation 同事务、release/config 共锁、BIGINT 十进制字符串、PG generation cache fence 的行为测试。
- 产品编辑与生效读取分离；发布需求先裁决。若保留发布，用服务端内容 digest 绑定校验结果，编辑后失效旧校验，
  原子切换 binding + generation + receipt，不依赖手工 fixture 使配置生效。
- Manifest 使用受信 tenant 与解析所得 Site；先做当前站点/产品准入，再读取生效配置。cache identity 纳入所有影响结果的维度；
  Site/Policy/配置/绑定变更的 revision 与失效路径须逐项定义，缓存命中不跳过必要 admission。
- 全局目录管理与 tenant-owned 操作的身份、权限、幂等 scope 分开；body 不自报受信主体。
- 跨 owner 验证在事务外完成并绑定明确版本/证据；提交时校验本仓 CAS/版本，不承诺跨库原子性。
- Model provider/resolve 故障不阻断 Site/Workspace 基础读；模块级 timeout、readiness 与缓存故障策略需测试。
- 审计若需可靠投递，由本仓业务事务保存投递事实，IAM 保存 Audit 权威事实；不恢复未接入的第二套 System Audit。

### G0.5 实现放行条件

TECHNICAL_DESIGN、API_CONTRACT、DATA_MODEL 的 G0 未决项全部有结论并与唯一机器 contract/schema 一致后，
才形成 G1 文档门通过报告。通过报告必须包含绝对文档路径、实际验证、当前 commit 和未决项；
本轮设计准备提交不代表 G1 通过，不授权批量移动目录或重写业务。



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
5. 从 PostgreSQL 读取 tenant generation；Redis key 为
   `<namespace>:manifest:v2:tenant:<base64url>:generation:<decimal>:product:<base64url>:locale:<base64url>:surface:<none|value:base64url>`；
   hit 后复核 tenant/product/locale identity。
6. Cache miss 时，repository 将 product key/UUID 解析成 active Product；active tenant+product binding 必须联查到
   `release.tenant_id = request tenant` 且 release 状态为 `published`，否则按无可见 release 处理，再读取 active Config records。
7. 对相同 `module_key + config_key` 按 `surface > tenant > product > global`、精确 locale、绑定 release、
   config version、ID 决定优先级，投影 navigation/localization/theme/feature flags/references。
8. `config_version` 以 PostgreSQL BIGINT 对应的 `BigInt` 数值顺序求最大值；使用
   SHA-256(`JSON.stringify(manifest-with-empty-digest)`) 生成 digest，写 Redis 30 秒。
9. cache hit 后再次读取 PostgreSQL generation；miss 在 fill 前后都复核 generation。若已变化，跳过旧写入或删除已写入的
   旧 generation key 并重试，最多三次后 fail closed。因 generation 与 publish/retire 同事务提交，commit 后进程即使在
   Redis cleanup 前退出，旧 key 也不再可寻址。

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

Receipt key space 是整个 tenant。Request digest 包含受信 operation name 与递归 key-sorted wire payload；path identity 和
transition target 属于 payload，数据库当前 version 与 repository 合成字段不属于 payload。相同 tenant/key/hash 即使数据库
状态随后变化也重放已保存的 domain result；相同 key 不同 hash 返回 409。Operation 抛错时整个事务回滚，不留下成功
response。PostgreSQL 并发脚本验证同 key 的两个并发 Site 命令只生成一个 Site、Host 与 completed receipt。

普通 mutation 需要 `system:write`；release transition 需要 `system:publish`；global config upsert 先要求 write，再额外要求
publish。Site 创建把 Site 与初始 Host 放在同一事务；Workspace/Policy 先按 tenant 检查 Site。Config upsert 若携带
`release_id`，会以 `id + caller tenant` 对 release 执行 `FOR UPDATE`，仅 `draft`/`validated` 可继续写；该锁与 publish/retire
共用 release row，避免状态检查后再被发布的窗口。Product 关系缺口见 [`CURRENT.md`](CURRENT.md)。

Publish/retire 的 release update、receipt 与 tenant manifest generation 推进位于同一 PostgreSQL transaction。提交后
application 通过 cache invalidation port 清理该 tenant 当前 namespace 的 Runtime Manifest keys；Redis 失败时 command 返回
dependency failure，相同 idempotency key replay 不重复状态转换或 generation 推进，但会再次清理。Redis cleanup 是容量与快速
收敛机制，不是正确性前提；validate 不改变 release 可见性或 generation。

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

所有 BIGINT 序号在 Domain/Application/receipt/HTTP 中是 canonical decimal string；仅 `schema_version INT` 保持 JavaScript
number。Repository 使用 PostgreSQL 算术或 `BigInt` 做递增/排序，Connect `uint64 generation` 只在 wire mapper 处转换为 bigint。

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
- 真实 PostgreSQL/Redis integration 覆盖 cleanup 后真实 Redis `SET` 到写后 generation fence 的 barrier、旧部署 namespace
  重启、冒号 tenant 精确失效、null/literal-default surface 分隔，以及两个独立 PostgreSQL backend 的 Config-first、
  publish-first、retire-first row-lock 顺序与 `9007199254740993` 边界。
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
5. 首次 V1 发布后自动化 OpenAPI breaking comparison、source-commit/artifact provenance 与 consumer matrix。
