# System 技术设计

## R80-W05 当前裁决：System 仅拥有计划技术路由

2026-10-02，源码基线 `6ca96180749d4842c2ee0628328f372d114e320f`。本节对齐 Root `ADR-033-actual-usage-and-pricing-ownership.md` 当前裁决，覆盖此前把采购成本版本放入 System 的建议；既有业务设计正文保留作历史与当前实现说明，不据此恢复成本方案。ADR 的跨仓 owner/目标路径已接受，严格契约与实现、失败收费资格仍未完成。

### Owner 与放置边界

- System `model-catalog` 只拥有技术模型、provider 目录、published revision、tenant routing policy、健康投影与 resolve 结果；不拥有采购费率、销售倍率、Credit 换算、舍入、预占、结算或账本。
- Billing `Metering` 是采购费率和用户计价的唯一 owner，后续承载不可变费率版本、可配置销售倍率（当前 Root 裁决默认精确 `7/5`）、Credit 换算与舍入。System 不新增成本表、成本 API、Billing 服务身份或任意 `configs` 容器。
- Agent 是实际模型调用、attempt、网关响应与 usage evidence 的唯一 owner。System 不写逐调用事实，Billing 不从 System 路由结果推断实际调用。

该边界沿用现有 `src/modules/model-catalog`，不新增一级模块或进程。把采购费率放入 `model_revision` 或另建 System pricing/config 模块会让独立生命周期耦合并形成第二计价权威，均淘汰；现有 22 表、83 个业务操作、2 个 probe 和三种 System 服务身份保持不变。

### 当前 resolve 能证明的 planned binding

`POST /v1/system/model-catalog/resolve` 只接受已认证 `kokoro-agent` 与受信 tenant。一次成功结果证明：在该次解析的 generation fence 内，显式 tenant/feature/label policy 选择了仍 published、未 retired 的 immutable revision；关联 model/provider 未删除；provider 健康投影在配置的新鲜度窗口内为 `healthy`；transport 为 `litellm`。返回绑定字段为 `model_id`、`revision_id`、`revision`、revision `digest`、global/tenant `generation`、`provider_id`、`provider_model_name`、`gateway_model_name`、`transport`、`label_key`、`feature_key`。

revision `digest` 只覆盖 System 保存的技术 revision 内容；generation 只防止目录/tenant policy 在读缓存和返回期间漂移；健康投影只证明其 `observed_at` 时刻的控制面观察。三者共同构成 planned route 的可复核绑定，不是 provider 执行或费用凭据。

### actual gateway 与真实来源限制

System 不发起推理，也不接收网关响应。`gateway_model_name` 是 Agent 交给 LiteLLM 的路由别名；`provider_id` 是 System 目录行身份；`provider_model_name` 是发布 revision 中声明的目标。这些字段不能单独证明网关最终选择的底层 provider、provider account、实际模型/版本、fallback、重试 attempt、provider request ID、token 分类、收费金额或调用是否发生。`model_provider_health_state` 是可变健康投影，不能替代单次调用 receipt。

后继先由 Agent 发布严格的逐 call/attempt evidence contract，将上述完整 planned binding 与网关返回的实际身份、usage 分类、receipt/digest、lease/attempt 和 `known_zero`、`known_nonzero`、`unknown` 状态绑定；再由 Billing 发布并消费其版本化费率、倍率和结算契约。provider 执行前须有有效 Billing 预占；fallback/retry/新模型超出冻结费率或预算时先重新授权。没有可信实际落点时只能验证并约束固定 provider binding，否则保持 `unknown` 且不按推测费率结算；不把 alias、目录声明、缺 usage 或本地模型零变量成本推断成真实收费事实。

本 R80 切片只修改四份既有文档的新前缀。源码、SQL、运行时 schema、OpenAPI artifact、服务凭据、测试和依赖均冻结；没有兼容 API、双读、fallback 或删除项。后继实现与资源验证由 Root 在 Agent/Billing owner 契约发布后另行授权。

## R40 实施候选：catalog 后继，待 Root 资源验收

Root 已通过 R39 四文档门，并真实复验 R1（57 fail/10 pass）及 R2/R3（3 个真实 PostgreSQL fail；6 个旧例因筛选 skip）。基线仍为 `c0a76a3a7614bf46ea6e665e523f24261862436f`；以下为未提交候选，不是资源验收或发布结果。

- `src/config/database-url.ts` 在任何 URL/Zod 规范化前拒绝 raw 控制字符，要求唯一安全 owner schema；仅允许普通 transport/TLS 参数，拒绝 options、stream、应用 timeout/pool 等驱动覆盖。SystemConfig 一次快照读取，保留原 values 并派生只读连接配置。
- Pool 使用同一配置，ready 在同 session 校验 namespace 存在/current_schema/UTC，保留取消、事务与 drain。installer 使用 owner+schema 锁、同事务创建、全 namespace-bound 对象空检查与原 canonical SQL；runtime 无 DDL/fallback。
- 现有 integration fixture、fresh、source/image smoke、启动模板与 CI URL 已统一显式 owner 选址；管理员 URL 仍是资源维护连接，不强加业务 selector。source-start 与 health 单元测试无旧业务 URL，不需改动。
- Root 已真实执行核心与 catalog RED：原 kernel 67/67；资源 7 fail/6 pass/6 旧例筛选 skip，七个同为 22 表的 drift 均到达 snapshot deep equality。日志 `/tmp/kokoro-system-schema-r40-root-core-and-catalog-red.log`；此结果不代表全 owner 验收。
- 后继只读 helper 在单 client 的 repeatable-read/read-only 事务中按目标 namespace 快照 table/column/type/default/constraint/index/function/trigger；身份 OID 只作 lookup，逻辑 namespace/name/signature 归一并排序。表达式、函数源文与配置、trigger 完整条件/事件/参数保留；未知 namespace-bound 语义明确失败，不放宽为忽略或盲替字符串。
- fresh 在自有临时数据库创建随机 reference namespace，由同 canonical SQL 生成期望并比较完整快照，原 23 项行为不变量不减。reference DDL 只在该测试入口；runtime/ready/installer 不 import catalog helper，不自动安装参考对象或修复。当前源候选仍待 Root 13 项真实 PG、fresh 和全 owner 门，不切换 Root 组合 URL 或发布半切片。

## R39 D0：单库 owner namespace 设计（待 Root 文档门验收）

2026-10-01，审计基线 `c0a76a3a7614bf46ea6e665e523f24261862436f`。本节是本轮连接与安装边界的唯一目标方案；尚未实现，不把下文历史门禁当作 R39 通过证据。业务 owner、五模块、事务及 HTTP 契约保持不变。唯一执行任务表为 Root 的 `docs/task.md`；不新增本仓计划中心。

### 放置门

| 项       | R39 决定                                                                                                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner    | System 拥有自己的 namespace 及 22 表；安装脚本是 schema DDL 唯一 writer，运行时只执行业务读写；本轮 System 单 writer、Root 管理 Git 与资源验收                                                                             |
| 当前事实 | `SystemConfig` 只验证 PostgreSQL URL；Pool 固定 `public,pg_catalog`；installer 固定检查/安装 public；ready 仅 `SELECT 1`；fresh 门只数表和行为断言，未比对完整 catalog；基线盘点为 195 tracked 文件、工作树对 index 无差异 |
| 目标职责 | 显式选择唯一 owner schema，统一 UTC 与安装/运行连接语义；安装隔离及 catalog drift 验证，不改变业务模型                                                                                                                     |
| 目录方案 | 纯解析放既有 `src/config/database-url.ts`，不塞入 Nest/Pool 生命周期文件；只读 catalog 快照放既有 `scripts/system-schema-catalog.ts`，不放 `src/database/`，避免测试参考 DDL 进入运行时。两文件均属后续独立授权，D0 不创建 |
| 粒度     | 每个新文件只有 URL 解析或 catalog 快照一种变化原因，复用现有目录；不新增模块、进程、通用数据库抽象或共享 contract                                                                                                          |
| 依赖     | URL helper 无 I/O、process.env、Nest 或 Pool；SystemConfig 派生配置供 Pool 消费，installer 消费同一解析规则；catalog helper 仅 scripts/测试可用，运行源码禁止 import                                                       |
| 数据/API | 同实例、同应用数据库、同本地/CI role，按 owner schema 隔离；SQL-first 唯一 `database/schema.sql` 不改；无新环境变量、依赖、HTTP 字段、错误码或 artifact 版本                                                               |
| 删除项   | GREEN 替换硬编码 public、裸 URL options 覆盖与 blank-database 判断；不建立 public fallback、双轨安装、重复 catalog 或 reference DDL 运行路径                                                                               |
| 验证     | Root 在冻结交付上执行现有 `pnpm check`、`pnpm contract:check`、`pnpm test:schema:fresh`、`pnpm verify`；R1/R2/R3 先由独立授权的两份现有测试证明 RED，不以文档或收集成功代替                                                |

### 唯一 URL 与 session 配置

`DATABASE_URL` 必须是 PostgreSQL URL，包含且仅包含一个解码后的 `schema` 参数。schema 使用 `[a-z][a-z0-9_]{0,62}`，最多 63 ASCII 字节；拒绝缺失、空值、重复、多 schema 列表、引号、`public`、`pg_` 前缀及非法字符。先检查原始字符串中的 ASCII 控制字符 `U+0000..U+001F`、`U+007F`，再调用 URL parser；不得让 parser 的 trim/控制字符清洗把非法输入变为有效输入。百分号解码后的 key/value 同样参与唯一性及合法性检查。

任意解码后名为 `options` 的 URL 参数（包括空值、重复或编码 key）都拒绝。当前安装的 pg 在解析 connectionString 时可能覆盖显式 options，因此不能只向 Pool 另传 options 就宣称安全。普通 PostgreSQL/TLS 参数保持原语义，不去掉 TLS 配置；异常消息不回显连接 URL、密码或 token。

纯 helper 返回只读 `{ connectionString, schema, options }`：connectionString 消费并删除 schema selector；options 只由代码构造，固定 UTC、`search_path=<schema>,pg_catalog`、现有 lock timeout。没有 `public`、`$user` 或缺失时默认值。SystemConfig 保留 `values.DATABASE_URL` 字符串及一次环境读取行为，从已解析值派生只读连接配置；配置失败发生在创建 Pool/Redis 等资源之前。schema 来自启动配置，不来自 tenant、请求 body 或 HTTP header。

Pool 使用规范化 connectionString 和受控 options，保留现有连接/statement/query timeout、请求取消、事务、drain 与资源释放。运行时不创建 schema、表、参考 namespace 或任何安装 DDL。ready 在同一 checked-out session 验证目标 namespace 存在、有效 `current_schema()` 精确等于配置值、timezone 为 UTC；仅连通性的 `SELECT 1` 不足。缺失/错路由通过既有 dependency-unavailable readiness 结果失败关闭，不 fallback 或隐式修复；完整 catalog 比对不放入每次 readiness。

### 安装与参考 catalog 的责任边界

installer 使用单 client/事务，取得数据库内的 owner+schema advisory transaction lock，逻辑 key 为 `kokoro-system:canonical-schema:<schema>`，再处理目标 namespace。锁内仅创建缺失的目标 namespace；所有动态 identifier 经过上述验证及 SQL identifier quoting。空边界、SET LOCAL、原 canonical SQL、提交都在同一事务；UTC 与 `search_path=<schema>,pg_catalog` 明确设置。空边界及 catalog 细节以 DATA_MODEL 本轮章节为准。

安装失败 rollback，包括本事务新建的 namespace/对象；重复安装拒绝已有 owner 对象。其他 owner/public 的对象和数据不影响安装，且不读写、删除或重置它们；不增加应用数据库、role、GRANT/REVOKE 或部署方案。测试临时数据库只是 Root 资源隔离。

未来 catalog helper 只读取指定 owner 的 metadata 快照，不包含 CREATE/DROP/ALTER。Root-owned fresh fixture 在自己隔离资源内，用同一 `database/schema.sql` 安装随机 reference namespace；actual 与 reference 经同一快照/规范化后比较。期望值来自该 canonical SQL 的实际安装，不维护第二份可编辑对象清单。reference DDL 只属于测试 setup/cleanup，不进入启动、ready 或正常安装路径。

### 切片与冻结边界

当前 D0 只允许四份文档；Root 确认内容及 SHA 后才另行放行 RED：R1 在现有 `test/unit/system-kernel.test.ts` 经 SystemConfig 断言 URL 规则；R2 在现有 `test/integration/system-lifecycle.test.ts` 断言 public 非空时空 owner 安装成功、外部 sentinel 不变；R3 在同文件用不同 namespace marker 断言运行读 owner、UTC/path 及缺失 owner 时 ready 失败。测试不导入尚不存在的 helper，不改原断言/原 public fixture 来制造通过，资源由 Root 管理。

RED 不授权 GREEN。源码、新 helper、canonical SQL、machine/generated、其余六份 integration fixture、CI、`.env.example`、source-start/smoke 和 Root 消费者 URL 均锁定，等待后续明确范围。Root 保留 Git/index/提交/资源与最终主仓验证责任。

## 既有业务设计与历史工程证据

以下业务设计继续有效；既有日期、提交与验收只描述当时基线，不证明上述 owner-schema 目标已实现。本轮连接/安装方案以 R39 D0 为准。

状态：2026-09-08，G1–G5 已提交验收；R6 typed lint/中性错误/模块公开面已提交为 `dcfa8468446108c17cd65b32fc028af261472c99` 并由Root在clean HEAD复验；外部阻断见 CURRENT/ACCEPTANCE。
Root ADR-031 冻结本设计；五模块、83业务操作及2probes已实现，不保留旧Node router/RPC。
唯一任务表：[IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md)。完整 System 为交付范围，Site 不是最终范围。

## 放置门

| 项       | 决定                                                                                                                                                                                                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner    | System；sites、workspaces、products、runtime-manifests、model-catalog；本轮 system_owner 唯一 writer，Root 提交                                                                                                                                                                                                                |
| 当前事实 | R6交付dcfa846；main→start-system→AppModule，五业务模块及access/http/database/cache/maintenance技术支持；83业务HTTP+2probes，SQL-first唯一22表；Root负责旧Model active退出                                                                                                                                                      |
| 目标职责 | 五个业务模块的 HTTP 控制面与配置投影；模型不推理、价格不归本仓、Workspace 不复制 IAM 组织/BFF Project                                                                                                                                                                                                                          |
| 目录比较 | src/<feature> 可行；采用 src/modules/<feature> 配合已有 config 与后续 database/access/http，避免业务/技术入口混杂；拒绝全局四层与独立 releases/configs                                                                                                                                                                         |
| 粒度     | 每个能力的运行时 wire schema 位于 schemas/；Root追加批准src/http/protocol.schema.ts仅承载共享HTTP envelope/error/request-id/probe/page schema，generator与运行时共同消费，无I/O；一个文件只定义同一资源 wire schema；schema 集合按 schemas/ 聚合。scripts 只做契约/隔离验证；同模块Controller/Service/Repository按变化原因分开 |
| 依赖     | schema 只依赖 Zod；模块公开 Service 通过 Nest imports/exports 调用；禁止跨模块 Repository/Row deep-import及跨仓源码/ORM import；进程只持一个 pg Pool 和一种 redis client                                                                                                                                                       |
| 数据/API | SQL-first 唯一 database/schema.sql；运行时 Zod 单向生成 contract/openapi/system.openapi.json；HTTP internal-owner /v1，公开产品 API 留 BFF                                                                                                                                                                                     |
| 删除     | 已删除旧全局四层、RPC/Proto/generated、手写 parser/SDK alias；G1 删除无 writer 的 profile/audit SQL，不删除旧业务安全实现；Model 退出由 Root 跨仓集成                                                                                                                                                                          |
| 验证     | pnpm verify：format/lint/typecheck/build/contract/unit/真实integration/architecture/fresh-schema/source smoke；镜像RC单独门                                                                                                                                                                                                    |

## 业务与模块公开面

| 模块              | 资源与用例                                                                                                                                                                                     | 依赖/公开能力                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| sites             | Site create/list/get/update/delete/restore；Domain list/add/remove；Policy get/put；Site draft/active/suspended/archived 生命周期                                                              | resolveActiveSite(tenant,host)、getPolicy(tenant,site)；删除须无活 Workspace/App/binding               |
| workspaces        | tenant/site 工作空间身份 create/list/get/update/delete/restore；无成员、项目或执行环境                                                                                                         | 仅调用 sites 存在性/锁协议；site_id 创建后不可变                                                       |
| products          | 全局 Product CRUD/restore；tenant/site App CRUD/restore；全局 immutable FeatureKey 和结果契约定义、退役；App exposure put/delete/list；presentation get/put；原 Config/Release 与 Binding 用例 | resolvePresentation/exposures；不承载 IAM 授权事实、Billing 价格；不提供任意配置 module/key            |
| runtime-manifests | tenant+site+product+locale+surface 的保存后生效投影                                                                                                                                            | 调用 sites/products 公开查询；先验证 host 与 policy，后缓存；不拥有 Agent Runtime                      |
| model-catalog     | definitions/labels/providers CRUD/restore、revision draft 编辑/publish/retire、tenant routing put/delete、health 写投影、catalog/resolve                                                       | model_* 独立数据边界；provider 只存 secret handle；输出不可变 revision 与 routing metadata，不调用推理 |

## 状态、事务和失败恢复

- 可变资源 version 为正十进制 BIGINT string；更新/删除/恢复携带 If-Match，丢失=428，过期=409 VERSION_CONFLICT。创建不用 CAS；Policy/exposure/presentation 初建用 If-None-Match: *，更新用 If-Match；不允许无条件覆盖。
- 可恢复资源使用 deleted_at，不把删除复制成另一 status。Site 的 draft/active/suspended 为独立可用性，archived 仅保留旧 wire 行为并在删除事务同时置位；Workspace/Product 原 archived 同理，后续不产生第二删除路径。
- Feature global_feature_key 永不复用；结果契约与 identity 创建后不可变，改动创建新 Feature；只有退役转换。Model revision draft 可改；published/retired 快照不可变且不硬删，不把 revision 伪装普通 CRUD。
- Product release 保留 draft→validated→published→retired；Config 修改 validated release 时退回 draft；validate 重新计算 canonical payload digest 并验证引用。publish 需 digest 匹配及 CAS；binding 仅允许同 tenant published release；retire 与 binding 失效在同事务。
- 普通 presentation/exposure/无 release config 保存即生效；带 release 的配置只在 published binding 生效。优先级 global→tenant→product→site/surface；相同层 identity 唯一，禁止 nondeterministic last row wins。
- 事务使用一个 checked-out pg client。锁序：幂等 advisory key → global catalog generation（仅全局写）→ tenant generation → Site UUID 排序 → Product UUID 排序 → App/Workspace → release → config/binding → model definition/provider/label/revision 按类别及 ID 排序 → receipt completion。删除/关联创建使用相同父锁并锁内重验。
- 幂等 receipt scope=scope_kind+scope_id+key，digest 含 operation、actor、path、canonical body、CAS；全局 admin 使用服务认证生成的 scope_kind=global,scope_id为空串；tenant用scope_kind=tenant,scope_id=受信tenant，绝不接受 body 自报。业务写、version、generation 和 receipt 同事务；重放先校验 digest，返回原响应，不重复写。
- 全局 Product/Feature/Model 元数据写推进全局 fence；tenant Site/Policy/App/presentation/exposure/config/binding 写推进 tenant fence。Manifest key 包含 global+tenant generation 及 tenant/site/product/locale/surface；读缓存和 SET 前后均复核两个 fence；TTL 30s。缓存失效不是 PG 一致性前提；Redis 错误按现有 fail-closed，receipt replay 可重试清理。
- 无外键完整性：关系写与父删除共锁；删除有活引用返回 RESOURCE_IN_USE；orphan reconciliation 定期报告并隔离投影，不隐式级联删除别的 owner。详见 DATA_MODEL。
- 事务不执行网络调用；有限 deadlock/serialization retry 只重试有幂等身份的整个事务（3 次，指数退避+jitter）；超时/取消不留下 pending receipt。启动/关闭、request/body 限额、日志字段与依赖超时按 Root 手册落测试。

## 身份与权限

BFF/Agent/admin 各独立配置服务 credential，常量时间验证；只有 admin credential 的服务配置可授予 global operator 身份，不能以 tenant header="global" 升级权限。
BFF 受信 tenant/actor/permissions 是当前边界，保留 system:read/write/publish；Agent 仅 catalog/resolve，admin 才可全局定义/provider/Feature mutation。
所有 tenant-owned 操作从受信 header 获取 tenant。缺 credential fail closed；IAM 尚无已交付 internal AuthZ SDK，不伪造连接。
Model 的业务故障不能使 Site/Workspace read 做 provider health 网络探测。readyz 只探基础依赖，model provider down 是解析业务错误。

## 栈与来源

Node 24.13.0 LTS；NestJS 12.0.1 + Express；Zod 运行时 schema（不维护 class DTO 副本）；pg SQL-first，Redis node-redis。
SQL-first 保留已验锁/表达式唯一索引；Prisma-first 会要求重写 System 锁与 schema，因此不采用。Model能力已由model-catalog pg实现，不留第二生产写栈。
G1 使用 Zod 自带 toJSONSchema 生成 OpenAPI schema；生成器仅编排 path/operation metadata，不写另一份字段结构。Controller 直接引用同一 schema，用 Nest StandardSchemaValidationPipe；route inventory 测试校验 Nest routes 与 contract 完整对应。
精确 dependency/peer/license/install/compile 证据写在 IMPLEMENTATION_PLAN；安装成功不是 Nest 业务验收。

### 默认模型路由

resolve label_key可省、feature_key必填。省略时仅查询tenant/feature下is_default=true的routing policy（数据库partial unique）；它确定default label，不猜第一个模型。无默认ROUTE_NOT_FOUND；hidden POLICY_DENIED；无published且healthy provider候选MODEL_UNAVAILABLE。候选按policy指定revision或label默认revision，缺失时按同feature的published revision priority ASC,id ASC；default label不回退。执行transport仅litellm，direct/internal明确未支持，不返回endpoint/secret。

### 同数据库完整性边界（Root G1裁决）

五模块是同一System数据库内writer边界，不是独立数据库。用例Repository可在同checked-out client对其他System模块表执行具名参数化只读完整性SQL：父SELECT FOR UPDATE并重验tenant/status/deleted，反向SELECT EXISTS；只返回bool/ID，不映射对方对象。禁止跨module INSERT/UPDATE/DELETE以及Repository/Row deep-import。子创建与父删除共锁同一父，无需循环Nest import或通用coordinator。Manifest业务投影仍走公开Service；架构测试固定写表owner矩阵，两种父删除/子创建先锁顺序均用真实双连接测试。

### 当前HTTP envelope

成功仅{data}，错误{error:{code,message,retryable}}；request ID只在所有响应x-request-id，不写JSON。请求x-request-id允许安全opaque 1..128字符[A-Za-z0-9._:-]，缺省UUID，非法400。Root当前API手册§2优先于旧基线；G2删除旧meta及x-kokoro-request-id，无alias。

## 运行职责与维护边界

main调用startSystem：配置先验、Nest DI初始化、PG/Redis readiness后listen；失败释放已构造资源。request-lifecycle将10s请求预算与断连传播至PG/Redis，日志只写结构化白名单；强制drain覆盖未完成PG握手socket。正式源码子进程/HTTP锁超时无late commit/黑洞握手取消有真实测试。

MaintenanceModule仅定时调用各owner公开维护Service，默认每小时；单cycle最多5s（不超过shutdown配置），禁止重叠，shutdown取消并等待。每种候选查询上限1000；Site/Workspace/Products逐资源独立事务，先固定父锁顺序、锁内重验年龄/状态与所有保留引用，再删自身表；不会将前一候选的父锁带入下一候选。Model自然key与immutable revision身份永久保留，仅清过期Provider credential handle。Receipt7天、普通软删30天、无binding退役release90天；每次restore以PG clock_timestamp原子UPDATE谓词检查30天截止。hold暂停维护purge且阻止过期receipt key复用删除（409现有码），不延长恢复时间。异常cycle结构化报告并由下一周期重试，不自动修复immutable orphan。

## R6 工程边界（当前方案）

- `src/system.error.ts` 是本进程有限业务错误码与中性 Error 的唯一入口，不包含 HTTP status；`src/http/system-error-status.ts` 用 `satisfies Record<SystemErrorCode, number>` 穷尽映射，filter 保留 native HttpException 的既有纯传输行为。18码/status/retryable及完整错误envelope测试冻结，不把旧OwnerError搬到新目录保留别名。
- Repository 不引用任何 `src/http/**`。内部已解析 keyset 查询类型在 `src/database/page-query.ts`，HTTP cursor codec 与 PageInput 仍属 HTTP；Service/Repository/技术故障使用中性 SystemError。
- sites/products/workspaces/model-catalog 各有显式 `<feature>.public.ts`。跨feature和maintenance组合层只从public入口读取；AppModule直接组合Module为唯一例外。Products Nest exports仅 ProductProjectionService/ProductMaintenanceService；Workspaces仅WorkspaceMaintenanceService；Sites与Model仅实际投影/维护消费者需要的provider。没有export*、Repository公开出口或额外业务API。
- Manifest五个投影schema从Products public入口读取。provenance保留全部原18输入并新增products.public.ts第19输入，HTTP生成artifact与83operation保持不变；源码digest按当前真实文件更新，消费者已提交HTTP验证状态不继续标pending。
- startSystem只读取`app.get(SystemConfig)`；ConfigModule仍在建资源前唯一校验环境，bootstrap不再手工重复构造配置。无效配置fail-fast；部分初始化失败关闭已构造PG/Redis资源。
- ESLint recommendedTypeChecked+projectService作用于src/test/scripts，显式启用unsafe assignment/argument/call/member/return、floating/misused promise与固定穷尽switch规则。没有disable或规则降级；未知HTTP测试identifier先Zod验证、PG结果按查询真实列声明类型，不把unknown直接插入URL。architecture实际执行ESLint正反例，扫描public-only/精确消费者和Nest exports、类型import循环、Repository HTTP、Controller driver、业务Service express/driver、forwardRef/ModuleRef/manual Service。

R6-guard：Controller同时禁止直接driver和解析到`src/database/**`/`src/cache/**`的相对import，没有HealthController豁免。既有health目录的HealthService只聚合技术ready检查，Controller委托，live不检查依赖；HealthModule负责DI注册。手工实例化Service/Repository（含import alias）由同一架构门禁止。

R7 runtime镜像策略：保留固定Node24基础digest，但runtime在安装应用工具/依赖前从Debian仓库刷新安全更新（apt-get update、apt-get upgrade -y，同层清/var/lib/apt/lists）。该层包版本取构建时仓库状态，最终交付身份由构建产物digest/SBOM记录，而非宣称基础digest足以冻结所有OS包。既有同一镜像smoke→Trivy→SBOM→正式tag推广顺序不变，不以忽略漏洞代替修复。v0.1.1与v0.1.2远端Trivy均已实际通过。

R8 attestation平台边界：user-owned private repository当前GitHub能力不支持artifact attestation，两个attest步骤根据可信GitHub event repository.private布尔值只对非private仓执行。public仓继续执行provenance与SBOM attest，private仓不伪称已签attestation；镜像仍必须经历全部验证、smoke、Trivy、SBOM生成后push同一产物。该条件不是continue-on-error或忽略扫描，不改变容器构建/运行职责。
