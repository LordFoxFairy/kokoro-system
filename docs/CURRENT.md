## 2026-10-20 MC-02A：共享模型与业务组合已通过本 owner 验证

用户批准同一已发布模型配置供多业务复用。revision 去 feature 耦合；label/routing 承业务引用与租户默认／覆盖；别名可省略或 null，未设按精确 request_model 显示原名，PATCH 缺失保留；catalog 返回实际有效修订／真实 provider 身份，空绑定不扫描其他模型。无新表、服务或依赖，原发布／CAS／幂等／health/cache与全局引用保护保留。

原代码实际合同2失败、共享业务HTTP409 RED后修复；新增仅现合同1用例＋现HTTP1用例，原风险fixture按新契约配对。最终 Node24.20／pnpm12.3.4 `pnpm verify` 全0：contract20、16文件214PASS／0SKIP、fresh33断言／22表完整canonical、format/lint/type/build。独审无确定P0–P2，85操作inventory、55非model操作递归表示、22表身份不变；资源门前后库inventory相等。

System5 artifact `a83b37269e9e4fa7fb5310a1836975e20ab9eaee965a66c83e35bb1ca1b9e5df`，provenance `97b20e57f66010ba456fac59fe1dd62d90c17325c82d3da80be455ea9d3cf747`。第一次完整门仅README摘要未更新失败；其后最终完整门通过。首个model suite中三项fixture错配（目录新字段、v5cache key、过度移除局部feature变量）均保留诊断后定向修正，不隐藏失败。

此为本地owner候选，不是远端发布或完整模型产品闭环：BFF/App/Admin/Agent尚未消费System5，正常System不重载、不执行DDL，既有System4已验链不替代新组合验收。API Key保存／读取仍为独立候选；模型、工具执行、扣费保持暂停。

## 2026-10-20 System4 消费配对与正常结构验收

在Draft源码 `dafbc66c9ab5e55b556dbd1dd71c79cef354f69c` 上重跑 Node24.20／pnpm12.3.4 完整 `verify`：格式、lint、type、build、contract全部exit0，16文件212 PASS／0SKIP；fresh schema33断言／22表完整canonical catalog匹配。BFF已本地提交 `15e4a7423ceed83dbb09d02e24e802ac78d9ed9e` Public20固定消费System4，只替换revision表示且仍四操作；App/Admin对应同一artifact正在收口，不扩provider/revision创建发布UI。

正常System经只读／冻结核实模型definition/provider/revision/label/routing/health均零行，3条命令receipt均completed。先备份恢复演练，再只重建两张空模型表及其原index／新connection guard，22表原行hash一致；受影响模型catalog与当前canonical逐对象相等，其余catalog严格保持原样。不使用trace、旧网关名或Agent全局地址推测连接，不重算旧digest，不建旧字段／旧数据兼容层。此前整库catalog比较发现其他旧CHECK表达式解析形式差异，原样保留，不扩大成其他20表重建；不据此称正常全owner已做全量canonical替换。

正常System与BFF已配对ready，retention hold保持true、原机器配置字节不变。隔离真实IAM正式管理员资格→BFF→System4/PG已验目录读取、CAS、原key回放、冲突、非法session拒绝；临时库与IAM key inventory清理前后一致。第一轮seed使用未启用的HTTP loopback被正式拒绝，改为无网络请求的HTTPS fixture元数据后通过；未放宽部署开关。Admin/Product桥和实际页面证据另记。此为管理／配置验收，不含任何模型推理、工具或扣费；Agent始终disabled。远端PR/Root组合与后继页面另验，不以本地配对冒称已merge。

## 2026-10-20 保留的 System4 源码正式进入 Draft PR

原 codex/model-connections 的既定 MC-01 实现 7f479f6 未合 main，本次完整保留该四提交历史，不把它当试验删除。隔离重跑 Node24.20 / pnpm12.3.4 完整 verify exit0，含格式、lint、type、build、契约、全部测试与 fresh schema；不修改正常资源。

暂不 merge 或更新 Root System pin：Agent main 已固定该 System4 版本，但 BFF Public19 管理 revision 仍要求 System3 的 transport/gateway_model_name，正式 System4 删除并改为 connection/request_model。须在既有模型连接方案内完成公开契约与 Admin 消费者原子配对，禁止制造旧字段 fallback。正常旧 schema/历史发布记录处置另待核实；本 Draft 不激活连接、不切正常服务、不发送模型/工具或扣费请求。

## R215 模型执行上限切片验收（2026-10-04）

实施前基线 `9a4e98eb9aed5513312090cf0e8e3f9c1d674bda` 的resolve执行上限字段为0。本切片已实现canonical两界、revision/resolve、正规3.0.0 artifact/provenance及HTTP/raw SQL/cache/contract断言。历史证据保留full-owner 199通过/1旧fixture失败、fresh同类失败，以及checksum合法关系错误cache被200接受的真实业务RED；修正后Root41905在冻结源码上已完成check/contract、16文件202通过/0失败/0跳过、fresh 23 assertions/22 tables完整canonical全绿，source/database/Redis终态一致，独审0P0/P1/P2，本切片获Root单仓验收。本地交付commit状态见Root CURRENT/progress；远端尚未push，Agent消费者未pin，3310未更新。

本切片采用现`model-catalog` immutable revision与现resolve：`context_window`是管理员核验的provider capability metadata，`max_output_tokens`是管理员每请求硬界；两者positive int32，draft可null，publish必须非null且output<=context，canonical SQL同时以published-nonnull CHECK阻止raw SQL缺界发布，并随revision digest/published immutability/generation同事务冻结。机器artifact/provenance已由正规generator升为`3.0.0`并获Root单仓验收；远端尚未push，消费者后续须按版本、commit、SHA/digest同步pin且无compat。Agent后继先用隔离真实SDK adapter→自有HTTP peer验证output cap，不绕native Billing gate；正式invoke在Billing缺席时保持0 provider，Admission正式接线后才验authorized request；不要求本地tokenizer，不猜provider限制，不把health/cache TTL当逐attempt expiry。

System不拥有pricing account/profile、费率、倍率、quote、hold、金额或结算。Billing consumer缺席时，即使技术bound通过单仓验收也仍0 provider，不fake grant、不走free fallback、不造known-zero。本地交付commit及远端发布状态以Root CURRENT/progress为准；当前尚未远端push，3310未消费、Agent未pin，正式模型调用与费用主链未闭环。

## R115 fresh验证工具切片验收（2026-10-02）

Root基线c2eebe91/System基线aa4e42e5；本切片只改既有fresh验证脚本及其测试，不变业务API、contract、canonical SQL或依赖。

- `scripts/verify-system-fresh-schema.ts`：明确保留unknown原失败，三个清理步骤全部尝试并聚合异常；显式fixture库名仅接受42字符ASCII `system_g1_`+32小写hex，连接/CREATE/URL/DROP同身份，非法输入在资源构造前拒绝。
- Root本轮原十纯门全部exit0，unit98/contract12/architecture9，共119pass/0fail/0skip，197tracked前后hash保持、owned进程组终态；manifest `/tmp/kokoro-r115b-system-pure-root.json` SHAcb0dc907c96d41023bfc4e03f381ea814e486ab05903f928ca29cfb6fd0e35ec。最初临时HOME使Corepack尝试访问registry的失败保留为验证环境问题，后续显式复用原12.3.4缓存并禁网，未改项目依赖/门禁。
- 同源码da4675b9/测试45bd5286此前E77真实PG fresh已23assertions/22tables/catalog匹配、拒绝重复安装，自有临时库独立查询已不存在；本轮核hash一致，不冒称重新执行PG。manifest `/var/folders/gn/wbk8wfbd047_wvwkwtyn331r0000gn/T/kokoro-r114-system-fresh-dlt4tpud/manifest.json` SHAcaec26bf5ee8616f654acd3e9fe0b2bcdd2d3fc9e91d18ad1f52f93db426218d。
- 独立切片审P0/P1/P2=0/0/0：`/tmp/kokoro-r115-system-release-review.md` SHA31519cb2fe5b70846c70b17ea5418ab1288d4b4fbaa99e9eebb9fa4304abc43b，runCleanup依赖已在基线tracked，不存在漏提交依赖。
- 仅此工具切片验收：业务HTTP/Redis/runtime/provider/image、全部owner同应用库组合与完整T-Q12/T-R02未验。Root组合、推送及fresh clone仍由Root台账单独记录，不以本节宣称全服务上线闭环。

## R80-W05 System 模型归属边界 D0（2026-10-02）

基线 `6ca96180749d4842c2ee0628328f372d114e320f`，本轮只允许修改 `docs/TECHNICAL_DESIGN.md`、`docs/API_CONTRACT.md`、`docs/DATA_MODEL.md`、`docs/CURRENT.md` 的新前缀；Root 独占 Git/index/commit、台账与共享资源。源码、canonical SQL、运行时 schema、OpenAPI、生成物、测试、依赖和服务均未改动或启动。

Root 当前 `ADR-033-actual-usage-and-pricing-ownership.md` 裁决已覆盖前轮把成本版本放入 System 的建议：System 只拥有技术模型/provider/revision/tenant route/健康投影与 planned resolve；Billing `Metering` 唯一拥有不可变采购费率、可配置销售倍率（当前默认精确 `7/5`）、Credit 换算/舍入及账务；Agent 唯一拥有逐实际 call/attempt usage evidence。System 不新增成本表/API、Billing service identity 或通用配置模块。

已核实当前 resolve 返回 `model_id`、`revision_id`、`revision`、revision `digest`、global/tenant generation、`provider_id`、`provider_model_name`、`gateway_model_name`、`transport`、label/feature，并以 published/non-retired、目录未删、recent healthy 与 generation fence 约束选择。该结果只能证明控制面 planned binding：gateway name 是 LiteLLM alias，System 不调用推理、不接收 provider response/receipt，不能证明 actual provider/account/model、fallback/retry、request ID、usage 或成本。

后继依赖为 Agent 正式发布绑定 planned route 与 actual gateway/usage/unknown 的逐调用契约，Billing 再发布并消费自己的费率、倍率、Credit、预占与结算契约；provider 执行前须有有效预占，fallback/retry 超出冻结集合先重新授权。缺可信实际落点时只能约束并验证固定 provider binding，否则保持 `unknown`，不把缺 usage、本地零变量成本或别名推断为真实收费。失败调用收费资格仍待业务确认；owner 边界通过不代表最终收费策略通过。

本切片只做三面及 CURRENT 对齐，没有 source/SQL/contract 实现或资源验证；不声称模型调用、费用或用户旅程已闭环。交付后冻结，待 Root 审查、提交及后继 owner-first 授权。

## R44 Root 完整 owner 门（2026-10-01）

Root在23path冻结manifest11b6f2f1上实际Node24.20.0 pnpm verify exit0：format/lint/typecheck/build、contract/lint/provenance及完整16文件176tests通过（56.47s），含原六个lifecycle用例；fresh23断言/22表/完整canonical catalog一致。日志/tmp/kokoro-system-schema-r44-root-full-verify.log。PG18.4、既有role nako/Redis14，fixture自有随机库，执行前后pg_database完整名单一致，fresh system_g1_a695b6e0defe4a3cb3c5665704128357已回收；无新共享基础设施或前缀批删。只发布本namespace/catalog切片：PG16 CI、cross-owner单库完整组合、正规用户登录/真实模型/费用浏览器链仍待验，不用176或fresh冒充整链。下方此前失败与候选证据保留历史。

# System 当前状态

## R40-WIN05 当前切片：catalog 后继候选，待 Root 完整验收

Root 已通过 R39 四文档门；真实 RED 日志为 `/tmp/kokoro-system-schema-r40-root-red.log`：R1 57 fail/10 pass，R2/R3 3 个真实 PostgreSQL fail；6 个旧 lifecycle case 因筛选 skip，不计通过。Root 报告 fixture finally 后无新 prefix 残留。源码基线仍为 main `c0a76a3a7614bf46ea6e665e523f24261862436f`。

- 本轮授权内的 parser/config/Pool ready/installer、现有 fixture 与 fresh/smoke/模板/CI 连接选址已改为显式 owner，canonical 22 表 SQL、机器/生成/provenance、业务模块、依赖与 lockfile 锁定。
- Root 已在 `/tmp/kokoro-system-schema-r40-root-core-and-catalog-red.log` 真实执行冻结核心/catalog：kernel 67/67；资源 7 fail/6 pass/6 旧例筛选 skip，七 drift 均到达真实 snapshot deep equality。原 R39 安装/选址/缺 namespace 和 view/function/type 非空各三项通过；此证据不代表全 owner 验收。
- 后继仅修改 catalog helper、fresh reference gate 与四文档 R40 当前段。helper 在 readonly repeatable-read session 快照完整结构/表达式/函数/trigger，身份归一与稳定排序，未知语义失败关闭；fresh 用随机自有 reference namespace 的同 canonical SQL 期望，原 23 行为断言保留。冻结 parser/runtime/installer、七＋三 resource 断言/fixture、SQL、机器/生成与其余核心文件不动。
- System 窗口只执行纯单进程配置、静态/契约门及资源收集；不访问 PG/Redis、不启动服务、不操作 Git。源码候选未提交，Root 组合/消费者 URL 未改；不得把此半阶段称为可发布完整 cutover。
- 核心波次纯门已通过 check/contract（83 business + 2 probes / 19 sources / 12 tests）及原 kernel 67；当前 catalog 后继再跑同一纯门，实际结果与 SHA 见本窗口冻结报告。worker 未自行访问 PG/Redis，完整 snapshot SQL 语义、13 项真实 PG、fresh 23 不变量及全 owner 门待 Root 真跑。
- 后续：Root 在冻结后继重跑真实 PG/fresh/完整 owner 门、独立审查，再提交/发布；源码候选不是已验收结果。唯一任务表仍为 Root `docs/task.md`。

## R39-WIN05 D0 当前切片：文档候选，待 Root 验收

2026-10-01。当前源码基线 `c0a76a3a7614bf46ea6e665e523f24261862436f`，分支 main。本轮只允许修改本仓 `docs/TECHNICAL_DESIGN.md`、`docs/API_CONTRACT.md`、`docs/DATA_MODEL.md`、`docs/CURRENT.md`；System 唯一 writer，Root 独占 Git/index/commit 与基础设施操作。执行任务继续记录 Root `docs/task.md`，不创建新计划。

### 已核实当前态（不是目标态）

- Config 只校验 PostgreSQL URL，未要求唯一 owner schema，也未在 URL parser 前拒绝原始控制字符。当前安装依赖 pg 合并 connectionString 参数可能覆盖显式 options；schema query 本身不自动设置 search_path。
- Pool 固定 `search_path=public,pg_catalog`，ready 仅执行 `SELECT 1 AS healthy`，未确认目标 namespace、有效 current_schema 或 UTC 路由。
- installer 固定 service 级 advisory key、检查 public 表并安装到 public；“blank database” 文案不代表检查全部数据库 namespace。fresh fixture 数 22 表并验证 23 项不变量，未覆盖完整 catalog drift。
- canonical SQL 是唯一事实源，22 个 unqualified 表、两 immutable guard 函数及 trigger 不改；无新增业务 schema/contract/依赖/role。现有业务的 tenant/权限/CAS/receipt/fence/事务及取消/drain 安全行为必须保留。

### D0 目标态与文档门

| 设计面 | 本仓文件                   | 对齐方案                                                                                                                                                  |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 技术   | `docs/TECHNICAL_DESIGN.md` | 唯一显式 selector、raw 控制字符先拒绝、URL options 禁止覆盖；纯解析配置，UTC/owner path；owner+schema 锁与事务安装，runtime 不建/fallback，ready 校验目标 |
| API    | `docs/API_CONTRACT.md`     | 现有 83 操作+2 probes、wire/error/artifact 不改；ready 在原 503 dependency 路径失败关闭；schema 不来自请求/tenant                                         |
| 数据   | `docs/DATA_MODEL.md`       | target-only 全对象空边界、原 canonical SQL；只读 owner catalog helper、Root 隔离 reference 安装生成期望，准确身份归一化；保留 23 行为断言                 |

三个面已写成同一候选方案；是否通过文档门由 Root 内容审查、四文档 SHA 与提交记录确定，不自行宣布通过。源码、新 `database-url.ts`、catalog helper、测试、SQL、machine/generated 均未实施。当前配置与安装仍为上述 public 基线，旧验收不证明 owner-schema 已可运行。

### 后续门（尚未授权/执行）

1. Root 冻结/审查 D0 后独立授权 tests-only RED：现有 `test/unit/system-kernel.test.ts` 的 R1 URL/config；现有 `test/integration/system-lifecycle.test.ts` 的 R2 public 非空而 owner 空的安装隔离、R3 owner runtime 路由/UTC/缺失 namespace readiness。不得导入不存在文件而用收集失败冒充 RED，不削减原断言。
2. RED 证据后才放行精确 GREEN 范围。源码、其余六份 integration fixture、CI、`.env.example`、source-start/smoke、Root 消费者 URL 和资源编排均等待后续授权，不因 D0 自动解锁。
3. Root 在最终冻结主工作树执行（Node 24，资源及凭据由 Root 管理）：

```bash
pnpm exec vitest run --no-file-parallelism --maxWorkers=1 test/unit/system-kernel.test.ts test/integration/system-lifecycle.test.ts
pnpm check
pnpm contract:check
pnpm test:schema:fresh
pnpm verify
```

本轮未运行上述命令，未启动/操作 PostgreSQL、Redis、服务或 Git；只交付四文档差异与保护范围哈希核验。未闭环：D0 Root 验收/commit、RED、GREEN、catalog drift 与完整资源门均待后续。后续 owner：Root 放行与集成验收，System 执行受限切片。

## 既有源码与历史验收记录

以下保留原历史记录，其中“当前/完整/已验收”仅指其注明的提交和验收波次；不作为 R39 单库 namespace 目标通过证据。本轮当前态及限制以上节为准。

2026-09-08。G1 `f5702068d4416ad90b1bd02af57d2825c32be916`、G2 `d057deb706a34129e23bec5ec1f70e235ca1d4ce`、G3 `f13bb73dfe81c3d79036852d3d3cb7a6cbb1916d`、G4 `51bc22dac4b32da86984e7147caaae5e4db6a34a` 已由Root提交验收。当前为 **完整 System 源码、消费者 HTTP 与 NestJS 工程边界均已提交验收**：G5业务代码 `d7257aa56632627fe0ba8ec4576c32c550a25c3d`，R6工程收敛 `dcfa8468446108c17cd65b32fc028af261472c99`；完整任务历史只维护 IMPLEMENTATION_PLAN。

## 当前源码事实

- 唯一正式入口main→startSystem→Nest AppModule；Node24/Nest12/Express、SQL-first pg、Redis6；五模块83业务operation+2probes均实际挂载。
- sites/workspaces/products/runtime-manifests/model-catalog完整业务已实现；跨module写表边界、tenant/scope、权限、CAS、receipt、父锁完整性、immutable快照、发布绑定和缓存fence由真实PG/Redis测试承接。
- Model resolve仅Agent、litellm，不推理、不回凭据/endpoint；明确tenant默认policy，无first-row fallback；health时效最后fence后重验。
- 正式生命周期包括三个服务token必填、部分启动失败释放、请求budget/断连PGRedis取消、HTTP deadline无late commit、未完成PG握手socket有界drain、脱敏JSON一次日志。
- Maintenance定时器已接线；7/30/90天、逐资源父锁/反查、永久identity tombstone、restore原子PG时钟30天截止、hold与orphan检测，默认每小时最多1000候选/查询与5s cycle预算。
- 旧全局四层、旧Node router、RPC/Proto/generated、SDK/相关依赖、DOM lib已删除。旧有效安全/一致性行为测试映射在任务表；没有保留alias/fallback充数。
- HTTP artifact仍2.0.0，SHA256 `f9ea76f107e1ea0fc19df20ee7c59032c0fbac66e640e9a16a1b770ab27c1f37`，R6保留原18输入并加Products public入口为第19源，源码digest真实更新，artifact字节不变。

## 验证与未闭环

G4 committed HEAD：51pass/0skip（7 focused files）；旧全量152pass/5legacyfail/8skip仅作历史，不作为当前结果。G5最新完整本仓13files/86pass/0skip；format/typecheck（含scripts）/lint/build/Redocly/drift/18source provenance/contract12pass；fresh schema23断言22表通过，详见ACCEPTANCE。Root 已在最终冻结树重跑完整 `pnpm verify`：13 files / 86 pass / 0 skip，fresh 23 断言 / 22 表；Root 已在该 committed clean HEAD 再跑相同全门通过，并完成真实消费者HTTP联调；详细日志见 Root `docs/CURRENT.md`。

Root冻结源码跨仓live已PASS：System/BFF正式pnpm dev、发布binding覆盖、catalog/default/manifest、跨tenant404/空catalog、BFF resolve403、Agent真实default/explicit+factory映射；committed HEAD 重跑已PASS，记录见 Root CURRENT。BFF consumer `1e03b87` + dev `26eec011`，Agent `e24b4aa`已提交测试；Root拥有旧Model active退出/九active拓扑，不由System复制其文件。

**镜像发布已闭环**：本机Docker Desktop故障未重启；改由tag触发GitHub Actions。`v0.1.2`绑定 `7252d50c67338842978961244e86a884daa87f5b`，release run `34222465469`与常规CI run `34222465488`均成功。测试、fresh schema、镜像build、真实image smoke、HIGH/CRITICAL Trivy门、SBOM生成与GHCR推广全部通过；`0.1.2`/`0.1`/`latest`指向digest `sha256:8fe6e701451f461b02b84c6520d76f49ad872c8f11d6ae3a8c5b80532797eb37`。user-owned private repository不支持GitHub attestation，两个attest步骤按仓库可见性明确跳过，不冒称已有attestation。长期生产SLO/容量/灾备/secret轮换仍属部署环境证据。

## R6 已提交工程收敛（`dcfa8468446108c17cd65b32fc028af261472c99`）

第一轮及移除诊断后的完整verify均15files96pass0skip+fresh23/22通过（`/tmp/r6-final-clean-verify.log`）。中间一次model afterAll10s超时未复现，三轮诊断及后续完整门通过，风险如实记录ACCEPTANCE。真正typed lint已启用并清除81条原始诊断；SystemError无HTTP status、18码映射与完整envelope保持；四public入口与最小Nest exports、Repository零HTTP依赖、唯一DI配置已实现。真实生命周期6pass，含单次配置解析与部分失败两资源关闭。新增架构实际typed规则正反、公开面/消费者/循环/禁止依赖门。

R6-guard最终提交后，Root 在 clean `dcfa8468446108c17cd65b32fc028af261472c99` 独立复跑 `pnpm verify`：16files/97pass/0skip、fresh23断言/22表，全部质量与契约门通过；跨仓 source HTTP smoke PASS 且 owned resources removed；Root结构门对System为0违规。Controller零database/cache直连（probe也无豁免），HealthService承接原ready聚合，手工Service/Repository含alias门已补。日志 `/tmp/r6-root-verify-committed.log`、`/tmp/r6-root-smoke-committed.log`。原一次非复现hook风险继续保留。

## R7 v0.1.1 发布修复（已由远端镜像门验证）

基线f487f635294c98cb8a44e638ed1ee0afa6d28feb。固定Debian12.13 runtime中libcap2需deb12u3、libgnutls30需deb12u7；按Root提供的v0.1.0扫描证据，在runtime依赖安装前执行apt-get update/upgrade并清apt lists，不降低Trivy exit-code、不加ignore/VEX。package版本0.1.1，无业务/SQL/OpenAPI/lock变更。Node24完整verify16files98pass0skip+fresh23断言22表，日志`/tmp/r7-verify.log`；v0.1.1远端Trivy已通过并完成GHCR推广，后续仅受private仓attestation平台能力影响而整单标红。

## R8 v0.1.2 tag发布闭环

Root确认v0.1.1 Actions34221703911的verify/fresh/build/image smoke/Trivy/SBOM/GHCR push全部通过，镜像已发布0.1.1/0.1/latest，digest `sha256:827bb91720fbd1bbe0fe2dab1efaae98b3905b7830c491535c5de5f0e2bf34b4`。随后provenance attestation因GitHub不支持user-owned private repositories而失败，SBOM attestation被跳过；因此镜像已发布但该workflow为红，不能写成镜像未发布或attestation成功。
R8仅为两个attestation step增加`github.event.repository.private == false`条件，private仓明确跳过，不降低测试/smoke/漏洞扫描/SBOM生成/push门。package0.1.2，Dockerfile/业务/SQL/OpenAPI/lock不变。Root提交 `7252d50c67338842978961244e86a884daa87f5b` 并推送tag `v0.1.2`；release run `34222465469`成功，常规CI run `34222465488`亦成功，发布digest为 `sha256:8fe6e701451f461b02b84c6520d76f49ad872c8f11d6ae3a8c5b80532797eb37`。
