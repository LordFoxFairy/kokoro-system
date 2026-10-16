## MC-01：默认直连、LiteLLM 可选的连接设计（2026-10-15；目标，未实施）

用户已确定 Agent 默认直连配置地址，LiteLLM 是受支持的可选网关而非部署前置。当前源码基线为 `1460820eab10ade1ca62cd9fdf18b8ac700c0d7a`；provider/revision/resolve 的 Zod、SQL CHECK 与 Agent 消费者仍只允许 `litellm`。本节只推进设计门，不代表新机器契约、数据库或运行时已经启用。下方 R257 中计费保证的未决事项继续有效；连通模型不构成 Billing 许可。

### Owner、范围与方案

System model-catalog 只发布技术连接与模型选择；Agent 执行请求、取消及用量观察；Billing 保有资金授权和结算。IAM 不代理推理，BFF 不新增模型转发入口。复用现有 provider、revision、resolve 与管理操作，不增加顶层模块、独立代理进程或通用配置中心。

采用现 `model_provider` 作为稳定连接身份，现 `model_revision` 保存可重现的连接快照。比较：新建连接中心/CRUD 会重复已有目录生命周期；继续 Agent 单一全局地址会丢失多连接选择并继续把直连叫作 LiteLLM。前者暂不引入，后者删除。

协议和连接类型分开：本片正式执行协议为既有 Chat Completions 的 OpenAI-compatible；连接类型为 direct 或 litellm。两类均由 Agent 的同一协议适配器执行，区别只在显式选中的上游。未配置 LiteLLM 不影响 direct；配置了 LiteLLM 才允许选择对应连接。其他 API/原生协议的已有非正式构造不删除，但不因连接类型改变就被冒称正式可执行；后继按各自实际协议和能力声明接入。

### 连接身份与发布

- 同一 path 可出现在不同连接；选择依据是 provider 身份、完整上游 base URL、请求模型标识及凭据引用，不以 path 或模型显示名猜测。direct 仅描述本方连接拓扑，不证明远端没有代理。
- 连接的协议、类型、base URL 和凭据引用在 provider 创建后固定；更改地址、协议或供应商账户创建新 provider，再发布新 model revision。显示名、优先级等管理元数据保持原 CAS 更新。这样既有 provider 级 health 不会被新地址挪用，历史 revision 也不会随 provider 编辑漂移。
- revision 创建时由 owner 读取并保存具体连接快照；请求模型标识由该 revision 明确给出。快照与既有 context/output 限额均纳入同一 digest。客户端不重复提交 provider 连接字段覆盖快照。
- base URL 保存用户配置的完整 API 前缀，包括其已有路径；不自动再加 `/v1`。当前协议适配器只追加其明确的资源路径，最终实际 method/endpoint/model/body 继续在 Agent 发送前核对。
- URI 拒绝 userinfo、query、fragment、控制字符和歧义形式；正式远程连接使用 HTTPS。本地 HTTP 仅由部署显式允许 loopback 的测试配置启用，不由浏览器参数切换。Agent 不跟随重定向，也不经环境代理悄悄改变上游。
- System 保存和发送的是不透明 credential reference，不保存或发送实际密钥。Agent 只从部署 secret 解析引用；引用缺失、provider 绑定错误或凭据不可读均在发送前失败。同一账户的密钥轮换不改变引用；更换账户使用新引用/新 provider。引用不是远端实际账户或计费保证的证明。

### 失败与恢复

保留 tenant policy、健康新鲜度、generation fence、bounded cache、CAS、幂等及发布/退役语义。direct 与 litellm 均保持取消、超时、输出硬限和未获授权零发送；不因网关错误自动直连、换 key、换模型或在 SDK 内隐藏重试。显式新发送/重试仍属于独立 attempt，按正式授权流程处理。

### 依赖、删除与验收

先完成本仓三面文档/唯一任务表，发布运行时 Zod 正规生成的 breaking artifact，再由 Agent 固定 version/commit/digest 消费；BFF/Admin 只更新受影响的契约 pin 与管理字段，不新增转发代理。删除新生产路径中 `transport=litellm` 的总入口限制，以 `request_model` 作为唯一执行模型标识；`provider_model_name` 保留既有声明目标元数据，不作为第二执行输入、不证明 actual attribution。旧 gateway 专属必填名称不再冒充 direct 请求模型；历史记录不重写为新含义。

System 后继写区为现 model-catalog schemas、provider/revision/resolve repositories/services、revision-content、cache schema、canonical SQL 及原生成器/测试。Agent 的 usage planned binding 也含旧名称：其版本化发布与历史读取必须先通过 Agent 设计门，禁止只改 factory 或只改环境变量。

验收必须覆盖两种显式连接、同 path/同名不同地址及账户、连接快照/发布不可变、provider 编辑限制、缓存重放、非法 URL/缺 secret/错 provider/过期 health、旧新 artifact 错配失败。真实收费调用另依赖未完成的 Billing 链；自有 HTTP peer 只证明本方 wire。纯文档阶段不运行服务或 SQL，不报业务 PASS。

---

## R257 当前技术路由保证设计门（2026-10-06；仅文档，未发布保证）

依据 Root `docs/task.md` 15:33 裁决与15:40任务卡；System源码基线 `955bd587f46a771e43a4330d202d90a7d2d67262`。本节、API_CONTRACT与DATA_MODEL的同名R257前缀共同描述当前方案，覆盖下方历史时点的“消费者未pin”等叙述，不改写原正文。只读依据为 Root `var/dev/r255-preserve/r257-system-guarantee-source-review.md`，SHA256 `dd9904cb41ded83ff487fb9e65bc0220f238646e637d0abd86f8a94c567cf75a`。本片只改三份现文档；没有源码、机器、Schema、配置、运行或provider验收。

### 当前事实与目标

System唯一机器仍是3.0.0，artifact SHA256 `94ed91655741cbba66ce80a4c41717b9179cc509cb6858534e0b78aa3e6dc059`。现resolve返回immutable model/provider/revision、目录generation、gateway alias及`context_window/max_output_tokens`；两界由SQL/publish/digest闭合。Agent当前已严格消费两界，最终HTTPX hook校endpoint/Host、n=1、最终output cap并冻结请求摘要，SDK无retry、HTTPX无redirect；缺Billing consumer仍拒绝发送。Agent HTTP5 final usage evidence已发布，但它是调用后证据，不是pre-dispatch bound。

当前System未发布technical account、exact endpoint适用范围、正式计费语义/closed profile、保证生效与截止；目录generation也不是gateway部署revision。provider目录ID/secret handle不证明实际凭据账户；容量、strict usage、健康TTL、签名或管理员声明均不独立证明金额上界。当前没有经本任务核实的正式provider/gateway合同，也没有合法positive bound。目标是在既有model-catalog中发布**有正式依据的具名技术路由/执行语义**，供Agent形成逐attempt bound，而非新建保证中心。

### 唯一owner与计费单元

- System `model-catalog` 唯一写技术route、技术账户绑定、执行/计量语义的证据准入与版本发布；不写调用、预占或金额。
- Agent唯一写本方HTTP dispatch、单claim/无retry/redirect、attempt状态、最终request profile/cap和逐attempt bound；实际usage/归属仍通过final evidence发布。
- Billing唯一写commercial mapping、pricing account、rate/policy、quote、金额、hold/settlement/ledger；技术账户opaque ref不是Billing商业账户。

**application HTTP request** 指Agent向已绑定API endpoint实际发送的一次请求。一次本方新发送、显式retry/fallback必须新的attempt与财务许可；不能把logical Run当一次请求。**billable API unit** 指适用该具体route/账户的正式provider或gateway合同定义的计费单元。如果该合同完整限定一个API请求的所有收费类别及数量上界，内部不另突破上界的重试不要求Kokoro审计任意内部网络实现；这是合同前置，不是本地代码已验证的事实。若内部额外收费、route/account漂移或多次收费可突破已界定单元，该路线不具paid-bound资格。

该区分不默许隐藏多次收费；Billing历史“真实provider retry/fallback新attempt”仍适用于新的独立收费尝试。跨仓后继须同步同一术语，不能由System替Billing扩大许可。当前只固定owner与准入原则，不宣称真实合同满足它。

### 最窄来源、身份与生命周期方案

1. **来源**：仅使用具体受支持route的正式provider/gateway计费及执行合同，固定其版本、适用模型/账户/API范围、证据引用与内容摘要；记录核验时间、有效起止和明确支持的计量profile。SDK/自有HTTP peer证据只证明本方发送行为。需要自有gateway实施的限界才核该具体部署/route实现，不一律要求任意远端源码透明。admin权限只授权发布经核证事实，不产生真实性；不新增签名中心、通用证明服务或浮动网页运行时抓取。
2. **身份**：同一published model revision绑定provider/model、gateway alias、exact canonical endpoint（scheme/authority/path、固定POST、无userinfo/query/fragment）、opaque technical account及正式来源revision/digest。只在执行保证依赖特定gateway部署/路由配置时，再要求其可核定revision；若合同直接稳定覆盖该endpoint/账户/模型，不机械增加部署ID。身份匹配失败拒绝，不从API key、alias或secret handle推导账户。credentials、原请求与商业价格不进入保证。
3. **profile**：首个候选仍为Agent R252 token联合约束：I<=context、O<=最终cap、total=I+O、cache-read为I子集、reasoning为O子集；每条关系均需正式来源支持，不额外猜I+O<=context。最终body须有具名closed字段与nested content/tools规则；支持文本、stream和现有效工具声明的范围须逐项核定。cache-write、音视频/图像、未知service tier/category及无法证明的关系在授权前拒绝，不等响应后发现未知再补许可。准确允许集尚待来源核验与Agent现合法SDK向量对照，未核定前无正控schema。
4. **持久生命周期建议**：最小形态随现immutable model revision冻结技术保证内容和有限生效窗口，不先建独立entity/table/端点；新的来源/profile/账户/endpoint必须新revision，不能修改已发布历史。现retire+generation/cache fence可立即停止后续成功resolve，但不承诺瞬时撤销已发出的不可变快照。Agent bound候选期限取`min(floor(lease_expiry), floor(guarantee_expiry))`，seal/reader/dispatch分别核时间与绑定，续租不延长原bound。
5. **有效撤销的限制**：首版建议只准正式来源允许其承诺覆盖整个已签发有限窗口的route；retire阻止新解析，既有未dispatch bound最多存活至其固定截止。dispatch前的再次读取可缩短观察滞后，但不是跨服务原子撤销保证。如果实际来源可即时取消承诺，必须先有该具体route可执行的最新状态/拒绝机制及竞态语义，或保持不具资格；不以小TTL、一次GET或PG锁跨网络冒即时撤销。已started的调用不因退休/到期改成未调用或自动释放资金。

第4–5项是提交Root审阅的最窄期限/撤销提案；Root须确认是否接受有限窗口内旧bound继续有效，以及证据来源能否支持它。未确认前不授producer成功实现，不默认永久有效。

### §8 放置与依赖门

| 项 | 本片结论 |
|---|---|
| Owner / writer | System model-catalog技术发布；本片唯一writer只编辑这三D0，Root独占Git与资源；Agent/Billing各自实现事实不越界。 |
| 当前事实 | 现revision/resolve、SQL与3.0机器如上；无technical guarantee数据或已核合同。三原正文SHA在交付报告逐一保留。 |
| 目标职责 | 判断具体route能否支持有限billable unit约束，并发布可固定消费的技术身份/依据；不是资金许可。 |
| 位置比较 | 采用现model-catalog revision/resolve，同业务词汇与发布生命周期；淘汰runtime-manifests（UI配置生命周期不同）、Agent自证下游、Billing制造技术事实、新配置/签名服务。 |
| 粒度 | 先三D0前缀；后继扩现schema/content/repository/service，不预建目录/实体。复杂度若超出revision生命周期，先重新过设计门。 |
| 依赖 | System固定发布物→Agent严格消费/producer/reader→Billing B1→Agent A2；无跨仓源码import/SQL、无免费/旧整笔capture兼容。 |
| 数据/API | 本片零变更。后继技术字段须普通列/明确约束并进入revision digest；现Zod单向生成，版本和字段另冻结，不在本片发明机器URI。 |
| 删除项 | 不新增alias/fallback；保A1 final evidence、现零send/取消/恢复。保证缺失不保兼容成功轨。 |
| 验证 | 本片仅三面一致/后缀逐字节/hash；后继真实合同准入、负控、HTTP/cache、PG原子性/撤销/期限与原owner工程门，均未本轮运行。 |

### 后继精确候选范围与停止线

System若采用上述revision生命周期，手写候选仅 `src/modules/model-catalog/schemas/revision.schema.ts`、`schemas/resolve.schema.ts`、`revision-content.ts`、`revision.repository.ts`、`revision.service.ts`、`resolve.repository.ts`、`resolve.service.ts`、`resolve-cache.schema.ts` 与 `database/schema.sql`；普通技术schema确需独立职责时另报现schemas内单文件，不先创建。provider schema/service、runtime-manifests、config及其它模块不预授权。

机器链仅现 `scripts/generate-system-openapi.ts`、`scripts/update-system-openapi-provenance.ts` → `contract/openapi/system.openapi.json`、`contract/provenance.json`，以及 `contract/README.md`；新breaking版本、字段名/类型与required规则在来源/生命周期确认后冻结，禁止手改生成物。测试候选仅现 `test/integration/system-target-model.test.ts`、`test/contract/system-target-contract.test.ts`、`test/integration/system-lifecycle.test.ts`；fresh/catalog入口仅有确切断言需要时另准。正常现存revision/数据演进另由Root评审，不用fresh installer/reset/伪证据回填。

立即可独立推进：Agent既有零send/重复claim/取消/rollback/ACKunknown状态机保护；Root批准closed-profile后用合法JSON和真实现guard构造新增费用字段拒绝RED；System整理本三D0与来源清单；Billing原三D0收口商业mapping/expiry。没有正式保证时，不造positive bound，也不把未来import失败或无前置404当合法admission RED。

未决项限于：(a) 实际首个provider/gateway正式来源及技术账户/endpoint适用绑定；(b) closed字段/计量全集；(c) 有限窗口撤销提案及该route的执行可行性；(d) 因上述结果决定的机器字段/版本、普通列和正常已有数据处理。已裁owner/费用政策不重问。Root确认三面后另授源码；本节不是新功能PASS。

---

# System 技术设计

## R215 模型执行上限切片验收（2026-10-04）

实施前基线 `9a4e98eb9aed5513312090cf0e8e3f9c1d674bda` 的resolve执行上限字段为0。本切片已实现canonical SQL、revision/resolve两项required有限界、3.0.0正规artifact与本仓测试，并获Root单仓验收。Root保留full-owner 199通过/1 fixture失败及fresh fixture失败、checksum合法关系错误cache被200接受的真实业务RED；修正后在同冻结源码上完成check/contract、16文件202测试、fresh 23 assertions/22 tables完整canonical全绿，独审0P0/P1/P2。本地交付commit及远端发布状态见Root CURRENT/progress；当前尚未远端push，Agent消费者未pin，3310未更新，SDK实际消费、正式模型调用及费用链尚未闭环。

### Owner 与目标语义

System `model-catalog` 是 technical model/provider/revision、provider capability metadata、管理员执行硬界与 planned route 的唯一 writer；Agent 是逐 call/attempt execution-bound artifact、dispatch、provider response 与 usage evidence 的唯一 writer；Billing 是 pricing account/profile、费率、倍率、quote、预占、金额、结算和账本的唯一 writer。System 不新增任何 Billing 字段，也不把 `runtime-manifests` 变成任意模型配置容器。

目标 published revision 同时冻结两个 positive int32：

- `context_window`：管理员核验的 provider/revision 总上下文 capability metadata。它不是价格、实际 usage 或本地精确分词结果；不要求 Agent 为所有 provider 安装 tokenizer，也不猜未知 provider 限制。
- `max_output_tokens`：Kokoro 对该 revision 每次物理模型请求的管理员硬上限，必须 `<= context_window`。Agent 消费正式 resolve 后将它显式传入当前 LiteLLM/OpenAI-compatible SDK 请求，由请求参数形成真实 output hard cap；SDK/route不能执行该参数时必须失败关闭，不静默忽略。

Draft 可暂存 `NULL` 以允许管理流程分步完成；canonical SQL 必须以 `published_at IS NULL OR (context_window IS NOT NULL AND max_output_tokens IS NOT NULL)` 闭合集合，并另有正值/关系 CHECK，使 raw SQL 也不能发布缺界 revision。`publish` 仍须在同一现有 revision 事务、父事实锁与 generation advance 内拒绝任一缺失、非正 int32 或关系非法。retired revision 仍先是 published revision，因此服从同一非NULL边界。published revision 保持 immutable，revision digest 必须覆盖两值。resolve 只选择合法 published revision，并在现 generation double-check/cache checksum 中严格返回两值；不新增 URI、模块、服务、alias、fallback 或第二配置轨。

System 内部 `health_valid_until`/cache TTL 只控制健康读取和缓存，绝不发布或推断为逐 attempt execution-bound expiry。Agent 后继从受信 Run lease/正式授权冻结有限 `valid_until`；缺 Billing consumer 时即使 System 两值齐全仍保持现有 typed dependency failure、0 provider，不制造 fake grant、免费路径或 known-zero evidence。

### §8 放置与实施闭集

| 项       | R210 决定                                                                                                                                                                                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner    | System `src/modules/model-catalog` 唯一写 revision capability/limit 与 resolve；Agent/Billing边界如上。                                                                                                                                                                                                                                         |
| 实施前事实 | `context_window INTEGER NULL` 已进 revision digest/CRUD但 resolve 不返回；`max_output_tokens` 不存在；Agent SDK不发送output cap。                                                                                                                                                                                                             |
| 目标职责 | published revision冻结非NULL context capability与request output硬界；现resolve严格发布，Agent固定消费。                                                                                                                                                                                                                                         |
| 位置方案 | **采用**现 immutable `model-catalog` revision + 现 resolve，生命周期、digest、publish/retire、generation一致。**淘汰** `runtime-manifests`：其owner是site/product UI manifest，生命周期不同且会制造第二事实源。                                                                                                                                 |
| 粒度     | 扩既有 schema/repository/service/content/resolve 与唯一canonical SQL；不建新目录、模块、endpoint、进程或通用config。                                                                                                                                                                                                                            |
| 依赖     | System不import Agent/Billing；Agent只pin System owner生成artifact；Billing只读Agent正式artifact，不直信resolve body/ref。                                                                                                                                                                                                                       |
| 数据/API | `context_window`、`max_output_tokens`均positive int32；draft nullable，publish时均非NULL且output<=context；published immutable、digest/generation同事务。现resolve response新增两个required字段，artifact版本为`3.0.0`并已获Root单仓验收；远端尚未push且消费者尚未pin，属于strict consumer必须同步pin的breaking机器变化。 |
| 删除项   | 删除把nullable context、health TTL、Run总budget、recursion limit、字符数冒充逐attempt bound的路径；无兼容alias/双轨。                                                                                                                                                                                                                           |
| 验证     | canonical SQL CHECK/catalog drift/fresh；publish缺失及关系负例零写；HTTP首次/cache replay与generation竞态；OpenAPI generate/provenance；隔离SDK adapter→owned HTTP peer观察exact output cap；正式native invoke在Billing缺席时仍验证0 provider。                                                                                                 |

### 后继精确文件集与顺序

本次System切片触及：`database/schema.sql`；`src/modules/model-catalog/{schemas/revision.schema.ts,revision-content.ts,revision.repository.ts,revision.service.ts,schemas/resolve.schema.ts,resolve.repository.ts,resolve.service.ts,resolve-cache.schema.ts}`（后两者仅类型/strict cache确需时）；现 `scripts/generate-system-openapi.ts`、`scripts/update-system-openapi-provenance.ts` 已将artifact正规升为`3.0.0`并产出 `contract/openapi/system.openapi.json`、`contract/provenance.json`；现 `contract/README.md` 第3行version及第19行breaking/pin策略也已同步，model integration、contract、schema installation/catalog drift tests已随切片更新。本切片已获Root单仓验收，本地交付commit状态见Root CURRENT/progress；远端尚未push且Agent消费者尚未pin。不得手改生成物绕generator或把单仓验收冒充消费者已发布。

System owner提交正式`3.0.0`机器artifact后，Agent依序：(1) 同时pin commit、artifact SHA-256与source/provenance digest并strict decode required两字段，不保compat；(2) loopback证明 `max_output_tokens` 真进入单次SDK请求，缺失/非法/不支持均0 provider；(3) 冻结自己的execution-bound artifact及lease-derived有效期；(4) 等正式Billing Admission owner reader/runtime后才准唯一dispatch；(5) 仅provider实际响应后append strict usage evidence。`context_window` 可作为保守technical upper-bound输入，但费用数量与金额换算仍由Billing正式rate/policy裁决。

### 系统验收矩阵

- Fresh PG：draft null可管理；缺任一值、0/负/超int32、output>context均无法publish且revision/generation/receipt无业务副作用；合法publish后两值及digest不可变。
- 真实System HTTP：健康route首次与cache replay逐值返回同一revision/digest/generation/limits；generation并发变化不混合旧identity与新limit；DB列/digest漂移失败关闭。
- Contract：不增operation/URI，resolve strict required字段与Zod单向生成一致，provenance/contract drift为0。
- SDK适配器隔离正控：不绕过或放宽native Billing gate，只以真实锁定SDK→自有loopback HTTP peer证明合法output cap进入exact一次请求；不冒充正式invoke。
- 正式native invoke：缺失/畸形/不支持字段，或Billing consumer缺席，均0 provider；只有正式Admission授权接线后才验真实authorized runtime请求。两门都不等于真实付费模型或用户收费闭环。

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
