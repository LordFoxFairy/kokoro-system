# System 技术设计

状态：2026-09-08，G1–G4 已提交验收，G5 当前工作树已切唯一 Nest HTTP 入口；最终 commit/门禁与外部阻断见 CURRENT/ACCEPTANCE。
Root ADR-031 冻结本设计；五模块、83业务操作及2probes已实现，不保留旧Node router/RPC。
唯一任务表：[IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md)。完整 System 为交付范围，Site 不是最终范围。

## 放置门

| 项 | 决定 |
|---|---|
| Owner | System；sites、workspaces、products、runtime-manifests、model-catalog；本轮 system_owner 唯一 writer，Root 提交 |
| 当前事实 | G4基线51bc22d；main→start-system→AppModule，五业务模块及access/http/database/cache/maintenance技术支持；83业务HTTP+2probes，SQL-first唯一22表；Root负责旧Model active退出 |
| 目标职责 | 五个业务模块的 HTTP 控制面与配置投影；模型不推理、价格不归本仓、Workspace 不复制 IAM 组织/BFF Project |
| 目录比较 | src/<feature> 可行；采用 src/modules/<feature> 配合已有 config 与后续 database/access/http，避免业务/技术入口混杂；拒绝全局四层与独立 releases/configs |
| 粒度 | 每个能力的运行时 wire schema 位于 schemas/；Root追加批准src/http/protocol.schema.ts仅承载共享HTTP envelope/error/request-id/probe/page schema，generator与运行时共同消费，无I/O；一个文件只定义同一资源 wire schema；schema 集合按 schemas/ 聚合。scripts 只做契约/隔离验证；同模块Controller/Service/Repository按变化原因分开 |
| 依赖 | schema 只依赖 Zod；模块公开 Service 通过 Nest imports/exports 调用；禁止跨模块 Repository/Row deep-import及跨仓源码/ORM import；进程只持一个 pg Pool 和一种 redis client |
| 数据/API | SQL-first 唯一 database/schema.sql；运行时 Zod 单向生成 contract/openapi/system.openapi.json；HTTP internal-owner /v1，公开产品 API 留 BFF |
| 删除 | 已删除旧全局四层、RPC/Proto/generated、手写 parser/SDK alias；G1 删除无 writer 的 profile/audit SQL，不删除旧业务安全实现；Model 退出由 Root 跨仓集成 |
| 验证 | pnpm verify：format/lint/typecheck/build/contract/unit/真实integration/architecture/fresh-schema/source smoke；镜像RC单独门 |

## 业务与模块公开面

| 模块 | 资源与用例 | 依赖/公开能力 |
|---|---|---|
| sites | Site create/list/get/update/delete/restore；Domain list/add/remove；Policy get/put；Site draft/active/suspended/archived 生命周期 | resolveActiveSite(tenant,host)、getPolicy(tenant,site)；删除须无活 Workspace/App/binding |
| workspaces | tenant/site 工作空间身份 create/list/get/update/delete/restore；无成员、项目或执行环境 | 仅调用 sites 存在性/锁协议；site_id 创建后不可变 |
| products | 全局 Product CRUD/restore；tenant/site App CRUD/restore；全局 immutable FeatureKey 和结果契约定义、退役；App exposure put/delete/list；presentation get/put；原 Config/Release 与 Binding 用例 | resolvePresentation/exposures；不承载 IAM 授权事实、Billing 价格；不提供任意配置 module/key |
| runtime-manifests | tenant+site+product+locale+surface 的保存后生效投影 | 调用 sites/products 公开查询；先验证 host 与 policy，后缓存；不拥有 Agent Runtime |
| model-catalog | definitions/labels/providers CRUD/restore、revision draft 编辑/publish/retire、tenant routing put/delete、health 写投影、catalog/resolve | model_* 独立数据边界；provider 只存 secret handle；输出不可变 revision 与 routing metadata，不调用推理 |

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
