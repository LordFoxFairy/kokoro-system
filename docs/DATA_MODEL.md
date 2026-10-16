## MC-01：模型连接持久事实（2026-10-15；目标，无 DDL）

基线 `1460820eab10ade1ca62cd9fdf18b8ac700c0d7a` 的唯一 schema 仍为 `database/schema.sql`。现 provider 保存 secret_handle_ref/固定 litellm transport，revision 保存 provider/gateway 两名称且没有完整连接快照。本片不更新 Schema、共享数据或 published digest。

目标只扩现 model_provider 与 model_revision，不新增通用配置表、跨 owner 表或外键。provider 是稳定技术连接身份：协议、direct/litellm 类型、规范 API base URL、opaque credential reference；实际密钥由 Agent 的部署 secret 独占。技术字段自创建固定，换连接/账户走新 provider；原显示名/优先级、软删/恢复和管理 version 继续各自含义。

revision 保存创建时由 owner 读取的连接快照及唯一请求模型标识，与既有限额一起纳入 digest。快照是同 owner 的不可变历史证据，不是第二个可编辑配置中心；采用具名、带约束的普通列，不建任意 JSONB 配置袋。新 request_model 是唯一执行输入，provider_model_name 保留声明目标元数据；gateway 专属执行名称与 transport 固定值在新 canonical schema 中原子替换。

创建 revision、发布与 provider 生命周期继续在原事务内锁定父事实，保 CAS/幂等/generation 与 published immutable trigger。provider 元数据更新不改变技术快照，provider 级 health 不跨技术连接复用；删除/恢复和到期维护不得重写已发布 revision 快照或摘要。现删除超过 30 天后清空 provider.secret_handle_ref 的维护操作，作为已超过恢复窗口的 provider 到期脱敏例外保留；其不再有恢复/resolve 资格。revision 保留原不透明引用与摘要，不保存密钥，也不通过该历史引用恢复执行；有效服务调用仍须 provider 未删且凭据可用。

secret 轮换只替换同一不透明引用背后的同账户密钥，不把 key/hash 放进 SQL/digest/日志；账户变化需新引用与新连接。System 不持有真实账户证明、价格、用量、hold 或结算事实，原 R257 未决收费保证不由本片填补。

切换前核实际 model/provider/revision、活动消费者与缓存。新鲜隔离 schema 验证不授权清理现存应用库；旧 published revision 不猜地址、不从全局 Agent env 倒填。既有数据的明确处置与回滚资源未批准前，不对共享库执行 DDL 或破坏性操作。

---

## R257 当前技术路由保证设计门（2026-10-06；仅文档，未发布保证）

对齐Root 15:33裁决及本仓TECHNICAL_DESIGN/API_CONTRACT同名R257前缀。基线 `955bd587f46a771e43a4330d202d90a7d2d67262`；唯一canonical仍 `database/schema.sql`，本片零DDL、零新entity/table/index、零普通数据/配置写。三原正文逐字节保留，以下只是后继数据放置与生命周期提案，不冒新schema或已部署保证。

### 当前事实与owner

现model_revision只保存技术目录内容、context/output两界及published/retired状态；publish非null/关系CHECK与immutable trigger保护同一revision digest。provider目录的secret_handle_ref可独立变更且不是账户证明；generation/cache/health是控制面观察，不是gateway部署revision或execution expiry。当前没有guarantee来源、technical account/exact endpoint/profile/生效截止的持久事实；正式3.0 artifact也不提供它们。Agent已消费容量与已发布HTTP5 final evidence，不改变上述缺口。

System model-catalog唯一写技术route/证据准入与版本；Agent唯一写本方application HTTP、attempt/final body identity、bound及actual evidence；Billing唯一写商业mapping、pricing account、费率、金额、hold/settlement/ledger。System不落调用数据/商业账户，不访问别仓表；Agent/Billing不读System数据库。

计费单元须按具体正式provider/gateway合同判定：本方新HTTP发送/显式retry独立attempt与许可；若合同覆盖该API请求全部可收费总量，其内部不额外突破上界的重试不要求任意内部物理网络审计。额外独立收费/绑定漂移越出该unit即不具资格。该合同是尚待核实的前置，不由System表行、签名或admin权限变真。

### 最窄持久放置方案（待Root审阅后另授DDL）

优先随**现immutable model_revision**冻结技术描述，不建独立保证中心/通用配置表/签名entity。与runtime-manifests比较，前者已有模型revision/发布/退役/digest，后者是UI/site配置且生命周期不符，淘汰。若实际来源必须独立续签或即时撤销、不能服从revision有限窗口，先重新明确其真实生命周期与必要查询，再决定是否需要普通实体；本片不预批新表或把复杂度藏入JSONB。

后继需要明确的技术普通事实包括：exact endpoint适用范围、opaque technical account、正式来源revision/证据引用与内容摘要、核验时间、closed request/usage profile版本及digest、有效起止；仅当保证依赖特定gateway部署/路由revision时绑定该身份。字段名/SQL类型/最大长度/空值与CHECK在正式来源收敛后冻结，不以本段文字创建schema。关系是同一revision覆盖的固定tuple，不从secret_handle_ref/API key/hash/名称临时推导，不存任何credential或prompt。

有限计量关系属于具名profile，不存一份可任意解释的收费JSON：I<=context、O<=Agent实际final cap、total=I+O、cache-read⊆I、reasoning⊆O必须有来源支撑；准确allowed body/nested content/tools/tier/category集合尚未核定。未知/未支持维度拒绝授权，不填0。System只存所发布的技术依据与约束，Agent最终cap/request digest和逐attempt期限不复制为System调用行；Billing按自身tariff对联合约束求金额上界。

拟扩现revision时继续同一receipt/publish事务、父事实锁、generation advance、digest与immutable trigger；新增技术事实进入revisionContent/digest，缺依据/歧义/非法有效窗口不得发布。证据更新、profile/账户/endpoint改变必须新revision，旧已发布行不能补写成有保证；发布状态和当前源证据判定共同决定是否具paid-bound资格，现3.0历史published不被追认为已保证。

### 生效、退休与bounded撤销

最窄提案为保证承诺覆盖完整固定有效窗口。时间瞬时点UTC，保证生效/截止必须来源明确、有限且前者早于后者；禁止以健康TTL、应用时钟延长或猜永久期限代替。System publish/resolve后继按本仓DB时钟核有效性，cache expiry不得晚于保证截止；原generation重核保持。现retire继续是终止后续resolve选择的唯一控制面变更，推进generation并保留原immutable内容，不另建撤销ledger。

Agent候选bound expiry=min(floor(lease_expiry), floor(guarantee_expiry))，同DB clock生成sealed_at且严格早于截止；seal/read/dispatch各核绑定与有限时效，续租不更新旧bound。这些逐attempt事实由Agent自己的事务实现，System不写Agent lease/attempt。

retire阻止新解析不等于瞬时撤销已经签发的bound：上述方案接受其最多到原固定截止的窗口，前提是正式来源在窗口内仍承担已声明约束。若产品要求即时撤销或来源可能即时撤回承诺，则需要该具体route可执行的最新状态/拒绝与竞态语义并另过Root门；否则路线仍无资格。再次GET、短TTL或事务外重核都不证明跨服务原子撤销，不跨网络持有PG锁。已started的调用仍按原evidence/Billing恢复规则处理，不因退休/期限到达伪造未调用/整笔释放。

Root须确认该有限窗口提案与真实来源的承诺能力；本片不自行改变Agent原R252 lease-only expiry或Billing永久snapshot重放代码。读取过期bound阻止**新**准入，不抹除已成立Admission和账务证据。

### 后继数据文件、验证与保护

若Root批准现revision方案，canonical候选仅 `database/schema.sql`；读写/digest候选仅 `src/modules/model-catalog/revision.repository.ts`、`revision.service.ts`、`revision-content.ts`、`schemas/revision.schema.ts`，resolve/缓存对应 `resolve.repository.ts`、`resolve.service.ts`、`resolve-cache.schema.ts`、`schemas/resolve.schema.ts`。不预增索引：先有实际新增查询才论证；现revision点读/候选排序/retire路径继续用现访问方式，不建无查询理由的账户/profile索引族。生成链与machine版本门见API_CONTRACT，不手改派生物。

测试候选为现 `test/integration/system-target-model.test.ts`、`test/integration/system-lifecycle.test.ts`、`test/contract/system-target-contract.test.ts`；`scripts/verify-system-fresh-schema.ts`仅确需catalog/行为断言时另准。必须覆盖缺依据/过期/未生效/绑定或profile漂移拒绝且receipt/generation零副作用、published不可变、首次/cache返回一致、边界时间与retire/cache竞态、同事务rollback/replay。新合同正规生成与原owner全门同跑；仅D0不具备以上PASS。

正常已有revision/历史数据如何进入新required语义须Root另裁有数据演进，不以fresh installer/reset、伪造来源回填、nullable兼容成功或旧profile fallback解决。旧有效目录读能力与未具paid-bound资格分别表达，不能为门禁假造guarantee。无本次删除/清库/资金写。

当前可先做Agent现零send、取消/rollback/ACKunknown、重复claim保护，以及Root批准后的closed-profile合法负控；不需要等全部provider证据才做这些研发。真正positive producer/reader与B1必须等正式保证来源/机器发布；不直接INSERT假bound。

尚待Root确认与另两D0完全相同的四项：实际首个来源及exact route/account；closed请求/计量全集；有限窗口撤销提案及执行可行性；对应普通列/机器版本和正常现存数据方案。本轮只文档，未核provider合同、未运行任何资源测试，未宣称新功能完成。

---

# System 数据模型

## R215 模型执行上限切片验收（2026-10-04）

实施前基线 `9a4e98eb9aed5513312090cf0e8e3f9c1d674bda` 尚无可发布的完整有限界。本切片已在现`model_revision`加入nullable draft `max_output_tokens`与published闭集CHECK；Root保留两个旧published fixture缺界导致full-owner 199通过/1失败及fresh失败，修正后完成16文件202测试和fresh 23 assertions/22 tables完整canonical全绿并通过独审。cache checksum不替代数据库事实，共享`resolveSchema`重验两值关系。本地交付commit状态见Root CURRENT/progress；远端尚未push，消费者未pin。

目标仍只扩现 `model_revision`：保留`context_window`作为positive int32 provider capability metadata，新增nullable draft `max_output_tokens INTEGER`作为每物理请求output hard bound。canonical CHECK分别覆盖null或positive int32、两值同时存在时`max_output_tokens <= context_window`，并以 `published_at IS NULL OR (context_window IS NOT NULL AND max_output_tokens IS NOT NULL)` 保证raw SQL不能发布缺界revision；service `publish()`在现事务内仍进一步要求二者均非null。retired状态必先published，因而继续满足同一边界。这样draft可分步编辑，而任一成功published revision必有合法、immutable、digest-covered两值。不得把publish完整性只留给HTTP body，也不得用弱CHECK接受非法直接SQL状态。

revision create/update receipt、parent locks、generation advance、publish/retire与immutable trigger保持现顺序和原子性；`revisionContent()`及`digest`加入新字段。resolve candidate读取两值并只返回合法published事实，现generation double-read/cache checksum防止identity/limit混搭。无新表、索引、FK、跨owner SQL、runtime-manifest JSON副本、兼容列或双写。

`health_valid_until`、健康`observed_at`与cache TTL仍是可变控制面投影，不持久成execution expiry。Agent以后用受信Run lease/正式授权生成逐attempt有限有效期；System数据库不保存call、attempt、dispatch、actual usage或费用。Billing独占pricing account/profile、费率、倍率、quote、hold、金额、rounding、settlement/ledger，canonical System SQL不增加这些字段。

Fresh/schema验收必须覆盖：列类型/nullability；positive/关系/published-nonnull CHECK正文及validated状态；draft null；service与raw SQL publish缺值均失败且零写；合法publish后的immutability；revision digest漂移；resolve/cache/generation一致；catalog mutation fail-closed。缺正式System DDL与生成artifact时Agent consumer不得先GREEN，更不得以nullable context、字符数、Run budget或recursion limit替代。


## R80-W05 当前数据裁决：技术目录不承载成本事实

2026-10-02，canonical 基线 `6ca96180749d4842c2ee0628328f372d114e320f`，对齐 Root `ADR-033-actual-usage-and-pricing-ownership.md` 当前裁决。System 的 22 张表和 `database/schema.sql` 保持不变；此前建议新增 `model_cost_revision` 或向 `model_revision` 添加价格字段的方案取消。

现有模型数据只表达技术控制面：

- `model_provider` 保存 System provider 目录身份、transport、优先级与 secret handle 引用；目录记录不是一次运行所用的底层 provider account 凭据。
- `model_revision` 保存声明的 `provider_id`、`provider_model_name`、`gateway_model_name`、modalities、context window、priority 及技术内容 `digest`；published 后不可变，但不可变只证明声明未被改写，不证明网关按声明执行。
- `model_routing_policy` 保存 tenant/feature/label 的 planned 选择；`model_provider_health_state` 保存带 `observed_at` 的健康投影；`model_cache_generation` 与 tenant generation 提供 resolve fence。它们均不保存 call、attempt、provider response、usage、采购费率或用户收费。

因此 canonical schema 不新增货币、费率、倍率、Credit conversion、rounding、quote、hold、settlement 或 ledger 字段/表，也不把这些事实塞入 JSONB 配置。采购费率版本、默认精确 `7/5` 的可配置销售倍率、Credit 换算与舍入由 Billing `Metering` 的 canonical 数据模型唯一拥有；System 不创建其镜像、缓存权威或跨 owner SQL。

实际调用证据由 Agent 持久化并发布严格契约：每个 call/attempt 要绑定 run/lease 身份、System 返回的完整 model/revision/digest/generation/provider/gateway planned binding，以及网关实际 provider/model/request identity、usage profile 与分类 counters、receipt/digest 和明确的 known/unknown 状态。网关 alias、System 目录声明、健康投影或缺失 usage 都不能转换为 actual 事实；未核实零成本与 `unknown` 分开。

后继先由 Agent 与 Billing owner 收敛机器契约及各自 canonical schema，再由消费者固定发布版本。Billing 的成本计价目标将替代现有固定 Feature `quantity=1` 作为唯一模型收费路径；旧实现只在 Billing 完整承接授权、幂等、事务和恢复后删除，不保留两套默认实现。System 本轮没有数据迁移、表数变化、约束/索引变化、删除项、兼容表或双写；SQL、schema catalog/fresh 门及所有运行测试保持原样。

## R40 实施候选：完整 catalog 快照，待 Root 资源验收

Root 已通过 R39 文档门及真实 R2/R3 RED。当前 installer 候选在 owner+schema advisory transaction lock 下创建缺失目标，按目标 namespace 查询 class/proc/type/extension 与 namespace membership metadata 检查为空，同事务 UTC/path + 原 canonical SQL；失败 rollback，不要求 public/其他 owner 为空。22 表 canonical 字节未改，单库/单 role 与业务不变量保持。

Root 已真实执行同 22 表的七个语义漂移 RED（deep equality 失败），原三 owner 路由/安装及三个非表非空例通过；资源结果 7 fail/6 pass/6 旧例筛选 skip。后继 `scripts/system-schema-catalog.ts` 已替换表清单基线为完整只读快照候选；真实 GREEN/fresh/全门仍由 Root 验证。

快照按 namespace OID 锁定归属，table/column/type/collation/routine/index/constraint 身份用 owner 或原 pg_catalog/外部 namespace 的 name/signature 表示；字段顺序与对象排序保留，无物理 OID、创建顺序或部署 owner/ACL 比较。保存 typmod/null/default/identity/generated、constraint definition、index key/include/collation/opclass/排序/predicate/有效性、函数参数/返回/语言/安全/volatility/parallel/cost/源文/配置、trigger enabled/type/args/列/transition tables 与完整重建定义。

default/constraint/index component 使用相同非 pretty deparse；trigger 在已 SET LOCAL 目标 path 的 session 使用 `pg_get_triggerdef(..., true)`：PG 16 源码明确 visible table 不加 namespace，条件、参数及事件仍由原生 deparser 保留，另以 metadata 核实表及函数归属。没有对 SQL 字面量、JSON 或函数 body 做替换。[PG 16 对象重建函数](https://www.postgresql.org/docs/16/functions-info.html)、[官方 ruleutils trigger deparser](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/utils/adt/ruleutils.c) 是工具语义证据，不是本仓资源验收。

当前 canonical 是 ordinary tables、自动 row/array types、内建 defaults 和两 PL/pgSQL guards。超出已批准覆盖的 view/sequence/foreign relation、自定义 domain/enum/base type、aggregate/pre-parsed SQL body/function search_path、rule/policy/extension、跨 namespace trigger function 或 schema-bound default dependency明确报 unsupported；不删掉语义后假装匹配。fresh 在自有临时数据库随机 reference namespace 执行同 canonical SQL/UTC，比较上述完整快照；原 23 项行为断言保留，无第二可编辑 expected 清单、运行时 reference DDL 或角色变化。基线 `c0a76a3a7614bf46ea6e665e523f24261862436f`，未提交/未资源验收。

## R39 D0：owner namespace 与 fresh catalog（待 Root 文档门验收）

2026-10-01，源码基线 `c0a76a3a7614bf46ea6e665e523f24261862436f`。唯一 canonical schema 仍是 `database/schema.sql`，现有 22 个 unqualified 表及业务约束不改。本节规定目标安装/验收边界，不声称现行 public installer 已切换。

### 数据归属、锁与空边界

本地/CI 应用共享一个 PostgreSQL 实例、数据库与应用 role，每 owner 使用独立 schema 和指向它的 URL；System 不读写其他 owner 业务事实。URL selector、控制字符/options 拒绝和 UTC 规则由 TECHNICAL_DESIGN 定义。runtime 不创建 namespace、不执行 reference DDL、不 fallback public。

安装在一个 client/事务内先取得 `kokoro-system:canonical-schema:<schema>` advisory transaction lock；锁天然受当前数据库隔离，不误用仅 service 级全局 key。锁后只创建缺失的目标 namespace、检查目标为空、设置 UTC 与目标 search_path、执行原 canonical SQL。若目标已有 owner 对象则拒绝；不把整个数据库或 public 为空作为条件。失败 rollback，不删除已有 namespace/数据；其他 owner/public sentinel 的结构与数据必须保持不变。

“空”是目标 namespace 无任何已存在的 schema-bound 用户对象，不只是无普通表：包含所有 relation kinds（表、分区、视图、materialized view、sequence、foreign table、index）、函数/过程、类型及其他 namespace-bound 对象。以目标 `pg_namespace.oid` 为边界，检查 namespace membership metadata（相关 catalog 的 namespace 字段及 `pg_depend` 指向该 namespace 的对象身份）；不得只查 `pg_tables`、按对象名前缀猜归属，或把外国对象对本 schema 的引用当成其归属。扩展绑定等非 canonical 对象也不视为空。引用 metadata 不是跨 owner 业务查询。

### fresh 期望与只读快照

未来 `scripts/system-schema-catalog.ts` 只快照指定 owner metadata，不安装、不删除、不重置、不承载第二份可编辑 schema/catalog。Root-owned fresh fixture 在自己的隔离数据库里创建随机 reference namespace，使用同一 canonical SQL 与同一安装 session 规则构建期望；actual/reference 使用同一快照实现比较。reference DDL/setup/cleanup 不进入正常 runtime、readiness 或 installer。既有 23 项行为不变量继续保留，catalog 比对补充而非替换它们。

快照必须覆盖对象集合及语义，而不是只满足 22 表计数：table relation kind；column 顺序、类型/typmod、nullability、default、identity/generated、collation；constraint 名称/类型/列序/表达式/validated/deferrability；index 名称、method、unique、keys/includes、表达式、排序/nulls、predicate、有效性；函数与触发器。当前 canonical 无自定义 enum/domain/sequence，无外键；两函数 `model_revision_immutable_guard`、`system_feature_identity_guard` 及对应 immutable trigger 都必须比较。种子数据及业务运行语义由保留的行为断言验证，不拿 metadata 替代。

### schema identity 规范化

1. 先解析目标 namespace OID，只枚举归属匹配的对象；用结构化逻辑身份 `{ namespace: owner, name, signature }` 代替 actual/reference 的 schema 名和 OID。`pg_catalog` 内建依赖保留其内建身份；外部 schema 引用不能被抹成 owner。以逻辑 key 稳定排序，不比较 OID、创建顺序或本轮不涉及的部署 role/ACL。
2. 函数比较相对名称、参数/返回类型身份、language、security、volatility、strictness、配置和 canonical `prosrc`。当前两段 PL/pgSQL body 无 schema literal，应保持原文相等；namespace/owner OID 只在已核实的 metadata 身份位置归一化，不整体替换 `pg_get_functiondef` 文本，不省略 body。
3. 触发器按所属表的 `relnamespace` 及函数的 `pronamespace` 核实 owner，比较表/trigger 名称、事件与时机/type、enabled 状态、参数、函数逻辑身份及条件表达式；只去掉物理 OID。disabled trigger、改绑函数或改变事件均为 drift。
4. default/constraint/index 表达式在各自事务中使用同样的 `SET LOCAL search_path=<target>,pg_catalog`，以相同非 pretty deparse 规则读取；其依赖身份按 owner-local 或 pg_catalog 结构化处理。当前 defaults 为内建时间、数值、布尔、字符串/JSONB，不含 owner-bound regclass/sequence；无需任意字符串替换。不得替换 literal、JSON payload 或函数 body 中恰与 schema 同名的字符串。
5. 新增 schema-qualified/default dependency 超出当前已验证规范化范围时，应明确报 unsupported/drift，直到扩展实现及测试；不通过删掉限定符、默认表达式或外部依赖来放宽比较。列类型、null/default、index 或 immutable trigger 任一改变，即使仍为 22 表也必须失败。

### 执行门与未决项

方案无新 owner、role、迁移双轨或机器契约。D0 只改四文档，canonical SQL/catalog helper/源码/测试锁定。Root 审核后另行授权现有 kernel 与 lifecycle 两测试的 R1/R2/R3 RED；参考 fixture、完整 catalog 实现、其余 integration fixture/CI/smoke 只能在后续 GREEN 精确授权内实施。尚待 Root 提供隔离资源、实际 RED/完整 fresh/catalog/行为与契约门输出；本文设计不是这些运行证据。

## 既有业务数据设计与历史证据

以下 22 表及生命周期设计继续有效；历史安装/验收仅针对当时基线，不证明上述 namespace/catalog 目标已实现。

状态：2026-09-08，五模块业务writer已实现；G5维护/生命周期工作树等待最终验收。唯一 canonical schema：database/schema.sql；SQL-first + pg，禁止 Prisma/第二schema/历史 migrations。
基线7dde8e7；保留已有真实 Site/Workspace/Policy/Config/Release/Binding/Receipt/fence 表，增补产品与Model业务结构，不迁移开发数据。

## 表、索引、约束与生命周期

| 表                                 | owner / writer       | 主查询与索引                                                        | 约束理由 / 生命周期                                                                                                                       |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| system_site                        | sites                | tenant+status+id；tenant+created_at DESC+id DESC                    | 活跃tenant/site_key唯一；version>0；软删30天，仍有活引用拒绝清理                                                                          |
| system_site_host                   | sites                | tenant/site+hostname；global hostname                               | active域名全局唯一防跨tenant接管；关联无恢复，删除archived，30天物理清理                                                                  |
| system_site_policy                 | sites                | tenant/site active                                                  | 一站一active；version CAS；allowed locale/product版本化数组用于装配不作查询条件，64KiB；默认语言必须允许；随Site清理                      |
| system_workspace                   | workspaces           | tenant/site/status/id及tenant/created_at/id                         | tenant/site/key活跃唯一；site不可变；软删30天                                                                                             |
| system_product                     | products/global      | product_key；created_at/id                                          | 产品键永久不复用；version CAS；软删30天可恢复，期满保留ID/key tombstone，不物理删除身份                                                   |
| system_application                 | products/tenant      | tenant/site/created_at/id；product反向检查                          | tenant/site/app_key活跃唯一；product/site不可变；软删30天，先删除关联                                                                     |
| system_feature_definition          | products/global      | global_feature_key；product/created_at/id                           | global key永久唯一、不可变结果契约；retired_at生命周期，无软删；永久保留身份，32KiB schema_version1结果契约                               |
| system_app_feature_exposure        | products/tenant      | tenant/application/feature                                          | 每App/Feature唯一；无恢复语义关系，删除物理，generation同事务；enabled独立boolean                                                         |
| system_presentation                | products/tenant      | tenant/application/locale/surface                                   | 身份唯一；version CAS；navigation/theme/i18n typed schema_version1 JSON≤64KiB；App清理时物理清理                                          |
| system_config_record               | products             | tenant/locale/module/scope/product；release引用检查                 | active完整identity唯一（tenant/site/module/key/scope/product/locale/release）；schema_version>0；普通配置软删30天；release快照随retention |
| system_config_release              | products             | tenant/status/id；tenant/created_at/id                              | tenant非空、tenant/release_key未retired唯一；digest64hex/version>0；draft→validated→published→retired；retired无binding后保留90天         |
| system_release_binding             | products             | tenant/site/product/scope；release反向影响                          | active完整scope唯一；tenant必需，site可空表示tenant默认；归属同tenant published release；archived30天物理清理                             |
| system_runtime_manifest_generation | runtime-manifests    | tenant PK                                                           | 正BIGINT；每tenant写同事务增加，tenant注销时随owner清理                                                                                   |
| system_catalog_generation          | products             | singleton scope PK                                                  | global配置写fence；常驻一行，不是业务config KV                                                                                            |
| system_command_receipt             | 各写用例内部         | scope_kind/scope_id/key；expires_at                                 | scope_kind/scope_id/key唯一+hash+completion一致性；operation/actor进入digest；完成7天后分批物理清理；pending只在事务内不持久泄漏          |
| model_definition                   | model-catalog        | model_key；created_at/id                                            | 全局key永久唯一；version>0；软删30天可恢复，期满保留ID/key tombstone                                                                      |
| model_provider                     | model-catalog        | provider/provider_key；created_at/id                                | provider/key永久唯一；只存secret_handle_ref不存secret；软删30天可恢复，期满保留ID/key tombstone                                           |
| model_label                        | model-catalog        | label_key；feature_key/created_at/id                                | label_key永久唯一；feature_key引用产品Feature，default_revision同feature；软删30天可恢复，期满保留ID/key tombstone                        |
| model_revision                     | model-catalog        | model/revision；feature/published/retired/priority/id；provider反向 | model+revision唯一；draft可编辑，published/retired内容immutable，无通用delete；永久保留revision引用                                       |
| model_routing_policy               | model-catalog/tenant | tenant/label                                                        | tenant/label唯一，tenant/feature WHERE is_default唯一；指定revision须published且feature匹配；删除物理；version CAS                        |
| model_provider_health_state        | model-catalog        | provider PK                                                         | 唯一health权威投影，不在provider复制health字段；generation CAS；observed_at UTC，provider删除后清理                                       |
| model_cache_generation             | model-catalog        | resolve singleton                                                   | global模型写推进，tenant routing另推进tenant fence；常驻                                                                                  |

SQL-only system_product_profile 从无production writer，删除；system_audit_event 无writer且Audit归IAM，删除。不存在新Profile/Audit兼容表。
Model旧Prisma schema只在独立旧仓，G1不复制其访问层/enum/receipt；合入模型统一System receipt，避免旧operation+key缺tenant的冲突范围。
旧Model TEXT资源ID fresh-cut统一UUID（外部model_key/provider_key仍TEXT）；这是明确breaking，与旧数据不做迁移兼容。

## 关系完整性与锁

无外键：每条引用写与父删除共享TECHNICAL_DESIGN锁序；先tenant身份再父行FOR UPDATE，锁内校验deleted/status/tenant，后写关系。
Site→Host/Workspace/App/Policy；Product→App/Feature/Config/Binding；App→Exposure/Presentation；Feature→Exposure/Label/Revision；Release→Config/Binding；Model/Provider→Revision；Label→Routing；Revision→Label默认/Routing。
跨tenant父ID统一NOT_FOUND，活依赖删除RESOURCE_IN_USE；Provider unhealthy仅影响resolve不影响基础CRUD。恢复重新校验自然键与所有父引用；冲突409不抢占其他资源。
全局Feature/Provider/Model删除或retire与tenant引用新增共锁同global父行，防跨tenant竞态。

Reconciliation（已接MaintenanceModule定时器，默认每小时，各查询上限1000行）由各module owner执行显式列LEFT JOIN/NOT EXISTS：

```sql
SELECT w.id, w.tenant_id, w.site_id FROM system_workspace w
WHERE w.deleted_at IS NULL AND NOT EXISTS
 (SELECT 1 FROM system_site s WHERE s.id=w.site_id AND s.tenant_id=w.tenant_id AND s.deleted_at IS NULL);
SELECT e.id, e.tenant_id, e.application_id FROM system_app_feature_exposure e
WHERE NOT EXISTS (SELECT 1 FROM system_application a WHERE a.id=e.application_id AND a.tenant_id=e.tenant_id AND a.deleted_at IS NULL);
SELECT r.id, r.model_id, r.provider_id FROM model_revision r
WHERE NOT EXISTS (SELECT 1 FROM model_definition m WHERE m.id=r.model_id)
   OR NOT EXISTS (SELECT 1 FROM model_provider p WHERE p.id=r.provider_id);
```

其余关系采用同样tenant复合谓词，真实PG按各关系逐项插入orphan并验证检测；发现orphan写结构化错误/告警，投影fail-closed，不自动删除不可变快照。
GC以expires_at或deleted_at批量索引查询，SKIP LOCKED限制批次，父清理重新检查引用，7/30/90天由真实PG年龄种子验证，含hold、近期child阻止父清理、timer实际触发。法律留存不归本仓自动决策，有hold请求时暂停对应purge。

## 验证门

G1：schema静态owner/no-FK检查、唯一约束负例、PG fresh安装/重装拒绝；目标隔离数据库 system_g1_<random>，禁止重置共享数据。
G2后：真实双连接父删除/关系创建竞态、CAS、receipt replay、跨tenant、global+tenant fence、immutable revision、retention，以及EXPLAIN(ANALYZE,BUFFERS)真实查询plan。
空库安装不能证明业务事务/权限已实现；所有尚未运行行为测试在任务表显式待验。

Receipt scope_kind固定global/tenant；global scope_id空串、tenant非空由SQL CHECK约束，不能用tenant magic string碰撞global。Config结构矩阵见API_CONTRACT与ck_system_config_scope_fields；关系scope指向的资源在同事务父锁内重验。

### 快照技术约束

model_revision_immutable_guard承接旧Model数据库安全不变量，拒绝所有DELETE、identity修改；published后只允许retired_at/version/updated_at，published_at/digest/内容不可改，retirement不可撤销。system_feature_identity_guard永久保护Feature key/结果契约与身份，仅可retire/version；两者不编排业务、不隐藏写入，例外依据ADR0002与Root批准的immutable快照要求。真实SQL负例验证其行为。
Binding不提供global release/API；tenant scope要求scope_id=tenant、site空，product scope要求scope_id=product UUID、site空，surface要求site+非空surface；均必需product，服务端同tenant校验published release。全局普通Config仍支持，无global release发布路径。

Global Config release_id强制NULL；system_config_release.tenant_id NOT NULL；Config读写conditional scope的认证、查询选择见API_CONTRACT，不能用COALESCE回退全局release。

### G5实际维护查询

新增8个retention部分索引匹配deleted_at/updated_at、scope父ID和id；receipt使用既有expires_at部分索引。真实EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON)检查执行计划可用，微量fixture下planner可选seq scan，不把此当容量证明。
Site/Workspace/Products每候选独立事务；Site物理清理反查所有仍保留的Workspace/App/Config/Binding（含未满30天softdeleted），不留下悬空历史身份。Release仅已retired满90天且无任何binding，连自身config快照清理；Feature/ModelRevision SQL guard与Product/Model自然keytombstone永不删除。Provider满30天只擦除secret_handle_ref。hold为进程级保守暂停所有自动purge；不阻止业务创建但过期receipt key仍占用。
