## MODEL-1 上游模型候选读取（2026-10-22，实施设计）

新增 `GET /v1/system/model-catalog/providers/{provider_id}/upstream-models`，operation `listModelProviderUpstreamModels`，global `system:write`，仅 `model-management`／`system-admin`。无body/query、无CAS／幂等回执；成功沿标准envelope，data只含`provider_id`和`items:[{id}]`，运行时字段约束唯一来源为后继Zod schema，不在此复制机器定义。所有结果no-store，浏览器不得直接访问owner。

已删除／擦除的provider为NOT_FOUND；无效或失败的上游读取为既有MODEL_UNAVAILABLE，响应不含上游正文／Key／敏感URL。未发送到许可地址为POLICY_DENIED；缺密钥材料沿原SYSTEM_UNAVAILABLE。非成功不伪造空列表。现有Agent-only凭据读取认证和路由约束不变。

BFF后继为平台管理员专用`GET /v1/admin/model-providers/{provider_id}/upstream-models`，再经App同源桥到Admin；先固定System6.1发布物，不允许通用URL代理。Admin显式刷新候选与现“刷新本地目录”分开，选择候选后仍使用现创建/发布命令。无推理／充值／扣费副作用，读取不自动修改已发布事实。 非公网解析仅可由System部署侧精确主机清单显式许可；该清单不进入本API输入／输出，不允许客户端自报豁免，也不改变元数据／危险地址拒绝与原loopback开关。

## MC-02 实施授权已确认（2026-10-20）

用户已明确选择“采用 System 现有模块方案”：现 model-catalog 加密保存 API Key，后台只写不回显；Agent 按当前业务路由与精确修订受控领取，删除旧手工密钥文件读取，不新增服务。下方 MC-02 密钥候选的 owner／隔离边界据此进入实施；历史“待确认”文字不覆盖此次确认，实际完成仍以源码／正式生成物与验收为准。模型请求、工具执行和扣费继续暂停；只在隔离 worktree／自有测试资源验收，不切换正常服务或写入正常密钥。

首个正式实现改 provider 创建输入为 api_key，由服务端生成 opaque ref；原非秘密 provider 投影保留。敏感创建将完整请求（含可信发起租户）经独立 HMAC 保护后交原 receipt 同事务处理，永久创建标记只限该用例，不另建通用命令框架。新增脱敏创建结果 GET 与 Agent-only 凭据读取 POST（只读事务、no-store、无重试）；全局资源 scope 不变，另保可信 actor tenant。独立 model-management 身份仅准模型目录／业务引用写和业务定义读取，拒绝密钥领取与其他 System 模块。私有材料固定启动加载，AES-256-GCM／独立HMAC；丢失或不匹配时敏感操作失败而普通目录仍可读。

## MC-02A 业务模型配置：已确认实施边界（2026-10-20）

共享 revision 不再输入／返回 feature_key；resolve 保留受权业务 feature_key。label 管理的 display_name 改为 nullable 可选别名：创建缺失默认 null，更新缺失不改、null 清空；普通业务 catalog 的 display_name 仍为必填有效名称，由别名或精确目标 request_model 得到。

catalog 继续按可信 tenant 和可选业务 feature 分页，但返回显式 model_id/provider_id/provider/request_model/revision_id，revision_id 是 tenant override 或 label default 的有效目标，不再用全局 default_revision_id 冒充当前选择。key 仅为稳定业务选择标识，不解析成 provider。未绑定／未发布／退休／失效 provider 不进入可选目录；resolve 不对空绑定任意扫描模型。临时健康仍在执行解析时检查，目录存在不宣称能立即调用。

本破坏性后继由原 Zod→生成器发布 System5，83业务／2probes 和认证入口不扩张；消费者后继配对，旧字段不以 alias/fallback 保留。当前正常服务和已固定 System4 消费者在配对前不切换。Key 保存／读取方案仍是另一步待确认候选，不由本节放行推理或资金。

---

## MC-02 最新产品语义（2026-10-20，设计待收敛）

用户澄清：统一 Provider 配置，多模型复用；业务方领取自身组合的模型列表／默认项，可选别名默认原模型名。既有 catalog 可按 tenant＋可选 feature_key 过滤，resolve 输入 feature_key＋可选 label_key；这不自行证明各业务入口完整配对。后继先核这条正式消费链与列表／选择身份，不把密钥写入候选当已获批准的完整模型契约。

展示别名不替换上游 request_model，不作为资源唯一身份；前端列表不含 Key，受控业务运行方才解析适用执行配置。现 display_name 必填且无默认原名语义是待补缺口，不伪装为已支持。具体 optional alias／默认投影与业务选择引用只在 owner 正式机器契约收敛后生成，不在此复制 DTO。

## MC-02 API Key 配置：契约设计候选（2026-10-20，待确认）

对应 TECHNICAL_DESIGN 的 MC-02，本密钥候选没有改变生产契约或操作；当前唯一最新业务配置机器契约为 MC-02A 的 System5候选，不含 Key 写入／领取。密钥后继另需正规发布 breaking artifact；具体字段／状态码只在运行时 Zod 与原生成器维护，消费者固定版本、commit、digest 后升级，不手改 generated。

- 连接创建改为只写 API Key 输入，由 owner 生成 `secret_handle_ref`；普通响应只含非秘密连接元数据及凭据可用性，不回显原 Key、密文、Key hash 或可逆掩码。API Key 不限制为 `sk-` 前缀，并有明确字节／header 合法性边界。
- provider/revision/label 等全局写仍是平台管理员操作；租户策略使用 BFF 受信 tenant 自动隔离。所有 body 严格拒绝自报 tenant／actor／service identity，不把默认租户变成写全局目录的许可。
- 新的敏感输入只能通过正式 BFF 管理操作及模型专用机器身份到达；不让普通 `web-bff` token 获得站点／产品等全局写。需要的 definition/provider/revision/publish/label 管理操作逐项声明，不用万能代理端点。
- 正式凭据明文读取仅允许 Agent 身份，按受信 tenant/feature/label 重核现 policy 与有效候选，要求精确 provider/revision/digest 相等，并核发布／退役、provider、健康与部署 URL 条件；不一致拒绝、不自动改选。沿 ADR-035 信任 Agent 的服务委托上下文，不冒充人类授权／Billing permit。普通目录、resolve、Admin 详情及通用后台转发不返回明文。读取响应强制 `Cache-Control: no-store`，不缓存／不自动重试。
- 密钥创建沿 owner 幂等事务；脱敏结果查询核原 actor、发起 tenant、原命令标记，与全局资源 scope 分开。窗口内仅显式按原 key/body 重放；刷新丢 Key 后只能查询。7 日 receipt 外拒绝敏感命令重新创建，保留的创建标记仍可回读关联 provider 当前脱敏状态；未命中／失败保持 unknown，不是已撤销或可换 key 重建的证明。恢复决策以 TECHNICAL_DESIGN 表为准，既不缓存 Key，也不复制另一份完整 ACK。
- 同源 CSRF、现 CAS、稳定错误及 request-id 继续；验证错误不回显原请求或原 Zod 输入，日志不采集敏感正文。地址／Key 保存和发布不调用外部模型、`/models` 探测或健康验证。

首片 Key 随 provider/ref 固定，任意换 Key 均新连接／修订，不开放原位轮换接口。provider 软删立即拒领取，30 日内合法恢复用原密文，过期原子擦除并拒恢复。主密钥使用固定启动快照，未配或不匹配拒敏感操作；不提供在线 KEK／摘要密钥轮换。新增 System 保存与 Agent 读取边界仍待用户确认，确认前不实现敏感 API 或切换正常配置。

---

## MC-01：模型连接契约（2026-10-16；System4候选已生成）

用户批准默认direct、可选LiteLLM；本工作树已由原Zod生成链生成4.0.0/OpenAPI与provenance，83业务operation/2probes及/v1不变。技术方案及生命周期以TECHNICAL_DESIGN同名MC-01为准，消费者和正常运行切换尚未完成。

目标继续使用既有 provider/revision CRUD 与 `POST /v1/system/model-catalog/resolve`，caller、tenant、错误 envelope、限额和 generation fence 不变。协议与 direct/litellm 类型独立；连接由完整 API base URL、唯一请求模型标识与不透明凭据引用绑定，provider_id 作为稳定连接身份。

resolve 的目标表示包含与同一 revision/digest 绑定的具名连接快照；管理输入、响应及快照采用同一运行时 Zod 事实源。目标 System artifact major 为 4.0.0，HTTP 路径仍 `/v1`；连接快照使用协议、direct/litellm 类型、完整 API base URL、credential reference 与 request_model 的明确语义。provider_model_name 保留声明目标元数据，不作为执行输入；旧 transport 固定标签及 gateway 专属执行名称退出新 route，不建立字段 alias 或缺字段 fallback。字段类型/长度只在后继运行时 Zod 中维护并由原生成器产生机器约束，本段不是第二份 JSON Schema。

只有受认证 Agent resolve 与有权的内部管理操作看到适用的连接元数据/credential reference；公开 catalog、runtime manifest 和普通 BFF 用户投影不因此获得上游 URL 或 secret handle。实际 API key 在所有 System wire 中均禁止。已有公开模型列表只返回原有选择投影。

provider 技术连接字段创建后固定，技术字段变更走新 provider 与新 model revision；显示名/优先级等 CAS 更新保留。任何新字段都不表示供应商实际执行归属、技术账户证明、价格或已获资金授权。健康 TTL 也不是执行许可有效期。

发布顺序：System 运行时 Zod/SQL/HTTP 与真实资源门 → 正规 OpenAPI/provenance breaking 发布 → Agent 固定消费者/模型调用与 usage planned binding 正规发布 → Billing/BFF 等受影响消费者 pin → 隔离组合切换。旧模型使用记录、活动 Run 和缓存的处置先由对应 owner 核定，不把旧 published revision 补写成具有新连接保证；不手改 generated 文件，不保留第二执行协议。

本片当前机器为4.0.0，consumer pin尚未升级；字段以正式runtime Zod/生成物唯一决定。provider创建使用Zod input导出，connection_type可省略并默认direct；输出类型必填，revision请求拒绝connection，response/resolve中的connection来自owner快照。URL完整规范化谓词、跨字段关系和部署HTTP许可仍由runtime校验，不能将生成pattern/长度检查当全部语义。request_model唯一执行名，旧transport/gateway_model_name无alias。完整contract19测试与资源门已通过；正常服务未启动新版本、未执行应用库DDL、模型发送0。未完成的收费保证来源与撤权/资金链仍按原设计门处理。

---

## R257 当前技术路由保证设计门（2026-10-06；仅文档，未发布保证）

对齐Root 15:33 owner/计费单位裁决与本仓TECHNICAL_DESIGN同名R257前缀。System基线 `955bd587f46a771e43a4330d202d90a7d2d67262`；现唯一机器仍3.0.0、SHA256 `94ed91655741cbba66ce80a4c41717b9179cc509cb6858534e0b78aa3e6dc059`。本片没有改Zod/OpenAPI/provenance/version、operation、认证、Schema或运行配置；以下语义是后继准入方案，尚不能被消费者当新机器pin。

### 当前公开能力与不成立的推论

现 `POST /v1/system/model-catalog/resolve` 由受认证kokoro-agent与受信tenant读取，input仍为feature_key/可选label_key；返回既有model/provider/revision/digest/global及tenant generation、gateway alias、context/output两界。Agent已严格消费两界，HTTP5 final evidence亦已发布；下方“消费者未pin”等仅描述历史时点。

现response没有exact endpoint、technical account、正式计费语义/profile保证、生效截止或撤销承诺；generation不是gateway routing revision，secret handle也不证明账户。System3只证明不可变目录内容；Agent最终body摘要只证明请求身份；strict usage1保留partial/unknown。三者都不是完整收费上界或预占许可。

### 目标语义闭集（尚未指定机器字段/版本）

本阶段不新增endpoint/operation或第二可编辑schema；优先在现revision发布与resolve结果扩具名技术描述。实际wire字段、类型、版本及是否需要现operation以外的能力，必须在下列四项未决收敛后由Root另准；禁止把本段语义表直接当JSON正控。

| 技术语义 | 必须成立的边界 |
|---|---|
| 唯一技术owner | System model-catalog发布；Agent从固定version/commit/artifact/provenance严格消费并生成逐attempt bound；Billing只读Agent正式bound后做自己的commercial mapping/金额。 |
| route binding | 同一published revision的provider/model/gateway alias、exact canonical endpoint（scheme/authority/path、POST、无userinfo/query/fragment）、opaque technical account、适用正式来源revision/digest；保证依赖具体gateway deployment/routing revision时才必需该可核身份，不能让浮动alias替代它。 |
| 证据来源 | 具体route正式provider/gateway计费/执行合同，固定证据引用、内容摘要、核验时间、适用API/账户/模型与有效范围；无credential、API key散列、原prompt、商业pricing account或金额。签名/admin权限仅证明来源/写权限，不自证内容。 |
| billable API unit | 应用每个新HTTP发送独立attempt/许可；若正式合同完整覆盖一个API请求的全部计费类别/数量，包括不额外突破上界的内部retry，无须审计任意远端内部网络。独立新增收费尝试或额外费用突破既定unit则不具资格；不把logical Run作为unit。 |
| closed profile | 同一具名version/digest规定最终body字段和nested content/tools/stream等允许集与计量关系；I<=context、O<=final cap、total=I+O、cache-read⊆I、reasoning⊆O均须来源支持。未知category、cache-write、音视频/图像、未知tier或未证subset在授权前拒绝，不推断零。准确允许集仍待真实来源与Agent合法SDK向量核定。 |
| 有限时效 | 保证有明确生效、截止与当前发布状态；健康TTL不代替。Agent候选bound expiry=min(floored lease expiry, floored guarantee expiry)，seal/read/dispatch分别重核；续租不延长原bound。 |
| 撤销语义 | 最窄提案为承诺覆盖固定有效窗口；现retire+generation阻止新resolve，旧bound最迟固定截止失效，不声称瞬时撤销。来源若可即时撤回，须先有该具体route可执行的当前状态/拒绝及竞态语义，否则不具资格。再次GET不证明跨服务原子性；已started保持原证据/财务恢复语义。 |

System不返回dispatch permit、不编造实际provider归属；Agent final evidence是独立后置事实。技术账户与商业账户只由Billing显式版本化映射关联，不混用名称。post-call才发现unknown不替代pre-dispatch限制；正式合同中的上界必须标注为外部前置，不能宣传成本地执行证明。

### 发布、错误与消费者顺序

当前尚无经核实的来源与合法positive guarantee，因此零positive bound/paid send保持。后继发布须拒绝缺来源、绑定歧义、计量类别不闭合、过期/尚未生效或撤销语义未成立的route；source/digest/profile有变即新immutable revision，不就地补写旧发布内容。不自行发明新error code，最终由既有System错误语义与生成器可表达约束统一冻结；不加宽unknown字段、alias或缺字段fallback。

依赖顺序：Root确认来源/生命周期/闭集 → System原Zod正规生成并固定breaking artifact → Agent pin、真实producer/reader → Billing pin B1 → Agent A2。Agent当前HTTP5 final usage reader不改名或复用为prebound；System不复制其schema。新required字段变动需消费者同步切换，不让现3.0目录谎称含保证。

机器后继准确范围：现 `src/modules/model-catalog/schemas/revision.schema.ts`、`schemas/resolve.schema.ts`；现 `scripts/generate-system-openapi.ts`、`scripts/update-system-openapi-provenance.ts`；正规派生 `contract/openapi/system.openapi.json`、`contract/provenance.json`；`contract/README.md`。本阶段均未授权编辑。生产、SQL与测试范围见TECHNICAL_DESIGN同名前缀，不在契约文档复制第二可编辑DTO。

### 验证与未决

Root后继在冻结源码执行 `pnpm check`、`pnpm contract:check`、现model HTTP/cache/generation/发布负例与真实PG/fresh；Agent自行验证final profile/零send、producer/reader和状态机，锁定SDK→自有peer仅证明本方HTTP不冒provider收费。正式route成本保证必须另有适用合同证据；本轮测试0，文档不是PASS。

待Root确认仅四项：首个真实来源及exact route/account；closed请求/计量全集；固定窗口撤销提案与来源执行能力；由此确定的wire版本/字段及正常已有数据处理。当前未批准新增entity/table/API，保证持续有效直到退休或永久有效均不作默认。

---

# System API 契约

## R215 模型执行上限切片验收（2026-10-04）

实施前基线 `9a4e98eb9aed5513312090cf0e8e3f9c1d674bda` 的唯一模型选择操作 `POST /v1/system/model-catalog/resolve` 执行上限字段为0。本切片已由正规generator产出`3.0.0` artifact/provenance，resolve严格包含两项required positive int32，并获Root check/contract、202项owner测试、fresh完整canonical及独审0P0/P1/P2单仓验收。本地交付commit状态见Root CURRENT/progress；远端尚未push，消费者仍未pin，3310运行副本也未更新。

现 operation、认证、tenant header、请求 `feature_key`/可选 `label_key`、错误 envelope 与 operation inventory均不变。成功response在现完整 planned binding 上新增两个 **required positive int32**：

```text
context_window, max_output_tokens
```

`context_window` 是 System 管理员核验的 provider revision capability metadata；`max_output_tokens` 是每个物理请求的管理员硬界并必须小于等于前者。两值属于 published immutable revision content并受同一revision `digest`、global/tenant generation fence与cache checksum保护。positive int32由生成OpenAPI逐字段表达；`max_output_tokens <= context_window`是跨字段关系，由HTTP首读与cache replay共用的运行时`resolveSchema`严格验证，机器artifact不伪造JSON Schema无法表达的关系关键字。它们不是 actual usage、provider receipt、价格、account/profile、费率、倍率、quote、hold或结算。

Draft revision CRUD目标允许两值暂时为null；publish必须拒绝null/非法/关系错误，因此成功resolve永远返回非null。System不新增URI、错误码、compat alias或旧response fallback；strict Agent consumer必须在System owner通过`generate-system-openapi.ts`与`update-system-openapi-provenance.ts`正规生成/发布后，同时pin `3.0.0`、commit、artifact SHA-256与provenance/source digest并同步升级，不保留`2.0.0`兼容响应。缺字段、畸形字段、digest/identity漂移或SDK不能硬性执行output参数时Agent须0 provider失败关闭。

目标正式route仍固定`transport=litellm`，Agent将`max_output_tokens`映射到锁定OpenAI-compatible SDK的真实请求参数；先由隔离SDK adapter→自有HTTP peer正控观察wire而不绕native Billing gate，正式native invoke在Billing缺席时仍必须0 provider，真实authorized请求只能在正式Admission接线后验证；`context_window`不要求本地tokenizer，也不声称Agent能精确预分词。System的`health_valid_until`/cache TTL不进入response，不是execution expiry；逐attempt有效期由Agent受信lease/正式授权冻结。

机器事实继续由Zod schema单向生成 `contract/openapi/system.openapi.json` 并更新 `contract/provenance.json`；本切片已同步 `contract/README.md` 第3行version、第19行breaking/pin说明、两generator与artifact为`3.0.0`并获Root单仓验收。禁止手写第二份DTO/schema。System contract/HTTP/generation测试证明新字段required、缓存重放逐值一致且关系非法失败关闭；远端尚未push，Billing consumer尚未发布，字段齐全也不构成Admission或dispatch许可，现0-provider gate保持。

只读版本入口核查所得非历史实施路径闭集为：System `scripts/generate-system-openapi.ts`、`scripts/update-system-openapi-provenance.ts`、`contract/openapi/system.openapi.json`、`contract/provenance.json`、`contract/README.md`；Agent严格消费者 `src/kokoro_agent/clients/system.py`、`contract/provenance.json`及相邻client/contract tests。BFF `contract/README.md` 仍记录整个System owner artifact的`2.0.0` pin，虽不消费本resolve字段，正式breaking artifact发布任务仍须由其owner核验并更新pin说明；其 vendored Agent provenance只能随Agent owner正规artifact更新，System不得跨仓手改。`docs/ADR/0002-local-contract-authority.md`与旧D0/验收段是历史证据，不做全仓字符串替换。


## R80-W05 当前契约边界：planned resolve，不新增成本 API

2026-10-02，源码基线 `6ca96180749d4842c2ee0628328f372d114e320f`，对齐 Root `ADR-033-actual-usage-and-pricing-ownership.md` 当前裁决。采购费率、销售倍率、Credit 换算与结算统一归 Billing `Metering`；逐实际 call/attempt usage evidence 归 Agent。此前建议的 System cost revision、成本查询端点和 Billing→System 成本读取身份全部取消。

现有唯一模型选择操作保持 `POST /v1/system/model-catalog/resolve`：caller 必须是 `kokoro-agent`，tenant 来自受信 header；输入仍仅为必填 `feature_key` 与可选 `label_key`。成功响应继续严格包含：

```text
model_id, revision_id, revision, digest,
generation, tenant_generation,
provider_id, provider_model_name,
transport, gateway_model_name,
label_key, feature_key
```

这些字段是 System published catalog 与 tenant policy 在 generation fence 下选出的 **planned binding**。`digest` 绑定技术 revision 内容，`generation`/`tenant_generation` 绑定目录与 tenant route 观察点，健康筛选要求当前投影仍在新鲜窗口内。现有 `ROUTE_NOT_FOUND`、`POLICY_DENIED`、`MODEL_UNAVAILABLE` 与 `SYSTEM_UNAVAILABLE` 行为保持，不新增“缺价格等于零”或成本 fallback。

该响应不包含 endpoint、secret、采购费率、倍率、Credit 金额、usage、provider receipt 或结算身份，也不声明 `provider_model_name`/`gateway_model_name` 就是网关实际执行结果。LiteLLM 可以在 System 返回之后执行底层选择、fallback 或 retry；System 没有 provider request/response，因此机器契约不能把 planned route 表述为 actual gateway evidence。

后继契约顺序为：Agent owner 先发布逐 call/attempt evidence，完整携带 System binding 以及可信网关实际身份、usage 分类、receipt/digest 和 unknown 状态；Billing owner 再发布不可变采购费率、精确倍率、Credit 换算/舍入、quote/admission/settlement 契约并消费 Agent evidence。provider 调用前须有有效预占；fallback/retry 超出冻结集合先重新授权。Billing 根据冻结费率与严格用量重新计算，不信任 caller 自报最终金额；供应商最终 invoice 另由 reconciliation 核对。跨仓只固定 owner 发布的版本、commit 与 digest，不复制可编辑 schema，也不让 BFF、Agent 或 System 自算 Billing 价格。失败调用是否向用户收费仍待业务确认，不把任一策略写成已批准。

本节不改变 83 个业务 operation、2 个 probe、运行时 Zod→只读 OpenAPI 的单向生成、artifact 版本或三种现有服务身份；不新增 System 表、路径、错误码、服务 credential、alias 或兼容双轨。相关源码、机器契约、生成物和测试在本 R80 切片中全部只读。

## R40 实施候选：wire 不变，资源验收未完成

Root 已通过下文 R39 文档门并取得真实配置/安装/路由 RED。当前候选改动只涉及连接与 probe 内部依赖判断：统一 owner selector 与 UTC，拒绝 options/应用驱动覆盖，缺失或错路由使用既有 readiness 503 路径；无新 HTTP 字段、错误码、操作、schema/provenance 输入或 artifact 版本。schema 不来自 tenant/header/body，运行时没有建 schema 或参考 DDL 接口。

Root 已真实执行 catalog RED（7 fail/6 pass/6 旧例筛选 skip），后继候选已补只读完整 snapshot 与 fresh 隔离 reference gate；这些不是 HTTP 新操作，不进入 runtime/probe，也不改变 wire 或认证。候选尚待 Root 真实 PG/fresh/全 owner 门，本段不是资源门、消费者或发布验收。基线 `c0a76a3a7614bf46ea6e665e523f24261862436f`，Root 独占资源及最终提交。

## R39 D0：连接边界与 readiness（待 Root 文档门验收）

2026-10-01，源码基线 `c0a76a3a7614bf46ea6e665e523f24261862436f`。本轮只收敛部署连接语义，不新增或复制机器契约：83 业务操作、2 probes、internal-owner `/v1`、运行时 Zod→只读 OpenAPI 的单向生成保持不变；无 HTTP 字段、错误码或 artifact 版本变化。

- 启动 `DATABASE_URL` 必须显式包含唯一 schema selector；原始控制字符在 URL parser 前拒绝，任意 URL options 拒绝。规则、规范化输出和受控 UTC/search_path 见 TECHNICAL_DESIGN；不将 schema 暴露为业务 query/body/header，不按 tenant 动态切换 namespace。
- `/healthz` 保持进程存活语义；`/readyz` 的既有响应形状、成功/失败状态及 retryable dependency-unavailable 错误语义不变。目标 readiness 要在同一数据库 session 确认配置 namespace 存在、`current_schema()` 与之相同、timezone 为 UTC；缺失或错路由走既有 503 依赖失败路径。仅 `SELECT 1` 的现行实现不满足该目标。
- 配置非法在资源启动前失败，日志/错误不回显 DATABASE_URL 或凭据。运行时没有建 schema、参考 DDL、public fallback 或自动修复接口；完整 catalog drift 属于隔离 fresh 验收，而非每次 probe。
- 受信 tenant/actor/service identity、权限、CAS、幂等 receipt、分页、cursor、缓存 fence 及业务失败恢复保持原语义；同库 namespace 不授权跨 owner SQL、JOIN 或访问其他 owner 数据。
- D0 仅文档候选；机器契约、生成物、源码和测试尚未修改。Root 文档门后，两份既有测试的 RED 仍需单独授权；GREEN、fixtures/CI/消费者连接更新也须后续授权。现有 contract 验证与真实 readiness smoke 由 Root 在冻结切片上执行。

## 既有 wire 契约与历史证据

以下 wire 规则继续有效；历史验收不证明 R39 的部署连接/readiness 目标已实现。

状态：2026-09-08，当前唯一Nest internal-owner HTTP，83业务操作+2probes；G5提交/环境验收见CURRENT。
Root ADR-031 取代 ADR-029 的 Proto 保留要求。唯一字段事实源 src/modules/_/schemas/\**/_.schema.ts，单向生成只读
contract/openapi/system.openapi.json；操作 inventory 位于 scripts/system-openapi-operations.ts；无第二手写 DTO/JSON schema。

## 边界

- /healthz、/readyz 是无凭据 probes。业务路径全部 /v1；统一 success `{data}`，error `{error:{code,message,retryable}}`。
- 服务认证支持 Authorization Bearer 或 x-kokoro-internal-secret，并校验 x-kokoro-service；每 caller 独立 secret。
- x-kokoro-tenant-id、x-kokoro-actor-id、x-kokoro-iam-permissions 只在通过 service auth 后可信；tenant 不出现在 command body。
- x-request-id安全opaque 1..128字符[A-Za-z0-9._:-]，可省略生成UUID，非法400；所有响应（含probe/error）仅在x-request-id回传，不放JSON；trace_id 可省略；Forwarded/Host 用于 Manifest，经规范化后强制匹配 tenant 下 Site。
- system:read/write/publish 是当前权限 vocabulary；全局产品/Feature/model 控制额外要求服务配置认定 global admin。Agent 无 mutation 权限。
- 所有 mutation 要求 Idempotency-Key 1..128；scope_kind+scope_id+key；tenant scope_id来自trusted tenant，global scope_id固定空串仅admin构造，tenant header不能改变global scope；digest=operation+actor+path+body+CAS，canonical JSON 排序键；相同 key/digest 重放原响应，不同 digest=409 IDEMPOTENCY_KEY_REUSED。
- 更新/删除/恢复及生命周期转换要求 If-Match: "<decimal-version>"；缺失428 PRECONDITION_REQUIRED，旧版本409 VERSION_CONFLICT；upsert 用 If-None-Match:* 创建或 If-Match 更新，禁止同时出现。
- 列表 limit 1..100 默认50；opaque cursor 绑定 resource、tenant、filters，排序 created_at DESC,id DESC；Model resolve priority ASC,id ASC。无 offset API。
- 严格 body/query schema；body 最大1,000,000 bytes，presentation JSON最大64KiB，result contract最大32KiB；错误不回显 SQL/secret/payload。

## 完整 scope 映射

| owner             | 路径（均 /v1/system 下）                                         | 方法与状态                                  | 表                                                            | 权限/主要错误                                                      |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| sites             | sites；sites/{site_id}；sites/{site_id}/restore                  | POST/GET；GET/PATCH/DELETE；POST            | system_site                                                   | read/write；NOT_FOUND、HOST_CONFLICT、RESOURCE_IN_USE              |
| sites             | sites/{site_id}/domains；…/domains/{domain_id}                   | GET/POST；DELETE                            | system_site_host                                              | read/write；HOST_CONFLICT、INVALID_STATE                           |
| sites             | sites/{site_id}/policy                                           | GET/PUT                                     | system_site_policy                                            | read/write；POLICY_INVALID、NOT_FOUND                              |
| workspaces        | workspaces；workspaces/{workspace_id}；…/restore                 | GET/POST；GET/PATCH/DELETE；POST            | system_workspace                                              | read/write；SITE_UNAVAILABLE、RESOURCE_IN_USE                      |
| products          | products；products/{product_id}；…/restore                       | GET/POST；GET/PATCH/DELETE；POST            | system_product                                                | read；global write；RESOURCE_IN_USE                                |
| products          | applications；applications/{application_id}；…/restore           | GET/POST；GET/PATCH/DELETE；POST            | system_application                                            | read/write；SITE_UNAVAILABLE、PRODUCT_UNAVAILABLE                  |
| products          | features；features/{feature_id}；…/retire                        | GET/POST；GET；POST                         | system_feature_definition                                     | read；global publish；IMMUTABLE_RESOURCE、RESOURCE_IN_USE          |
| products          | applications/{application_id}/exposures；…/{feature_id}          | GET；PUT/DELETE                             | system_app_feature_exposure                                   | read/write；FEATURE_UNAVAILABLE                                    |
| products          | applications/{application_id}/presentation                       | GET/PUT（locale+surface query）             | system_presentation                                           | read/write；INVALID_ARGUMENT                                       |
| products          | config；config/{config_id}                                       | GET/POST；GET/PATCH/DELETE                  | system_config_record                                          | read/write，global另publish；INVALID_STATE、INVALID_CONFIG_SCHEMA  |
| products          | releases；releases/{release_id}；…/validate、publish、retire     | GET/POST；GET；POST                         | system_config_release                                         | read/write/publish；INVALID_STATE、DIGEST_MISMATCH                 |
| products          | release-bindings；release-bindings/{binding_id}                  | GET/POST；DELETE                            | system_release_binding                                        | read/publish；INVALID_STATE、RESOURCE_IN_USE                       |
| runtime-manifests | runtime-manifest                                                 | GET product_id/locale/surface_id；host→site | system_runtime_manifest_generation；system_catalog_generation | service context，非public需read；POLICY_DENIED、SYSTEM_UNAVAILABLE |
| model-catalog     | model-catalog/definitions、providers、labels；各/{id}；…/restore | GET/POST；GET/PATCH/DELETE；POST            | model_definition/provider/label                               | read；global write；RESOURCE_IN_USE                                |
| model-catalog     | model-catalog/revisions；…/{revision_id}；…/publish、retire      | GET/POST；GET/PATCH（draft）；POST          | model_revision                                                | read；global publish；IMMUTABLE_RESOURCE、INVALID_STATE            |
| model-catalog     | model-catalog/routing-policies；…/{label_id}                     | GET；PUT/DELETE                             | model_routing_policy                                          | read/write；NO_AVAILABLE_MODEL、LABEL_UNAVAILABLE                  |
| model-catalog     | model-catalog/providers/{provider_id}/health                     | PUT                                         | model_provider_health_state                                   | global write；VERSION_CONFLICT                                     |
| model-catalog     | model-catalog/catalog、model-catalog/resolve                     | GET；POST（无写入，无幂等key）              | model_* published/healthy snapshot                            | BFF/Agent tenant context；NO_AVAILABLE_MODEL、POLICY_DENIED        |

具体 request/response、parameter、permission 和 idempotency metadata 在生成 artifact；文档表为业务映射而非字段副本。
共通错误：400 INVALID_ARGUMENT/INVALID_CURSOR，403 service_auth_failed/FORBIDDEN，404 NOT_FOUND，409 VERSION_CONFLICT/IDEMPOTENCY_KEY_REUSED/RESOURCE_IN_USE/INVALID_STATE，428 PRECONDITION_REQUIRED，503 service_auth_not_configured/SYSTEM_UNAVAILABLE。
领域错误稳定名由对应模块 schema/实现测试承接，拒绝以通用500吞掉约束冲突。

## Fresh-cut breaking review

保留全部旧 /v1/system HTTP 路径、snake_case 输出主要字段、BIGINT decimal string、release状态和幂等结果；G1 contract 测试逐路径核对。
主动收紧：Site/Workspace key遵循SQL128字符、UUID引用、CAS必需、Config只接受navigation/theme/i18n/feature_flags/references已注册模块与version1，Policy参与Manifest准入，Manifest新增site_id/surface_id。
旧Config任意JSON写入不是目标能力；合法旧模块字段由typed schema承接，未知module/config schema返回INVALID_CONFIG_SCHEMA。旧不完整policy/config allOf + additionalProperties冲突改为单一可验证对象。
Model旧ensure/admin/resolve路径统一替换为model-catalog资源化HTTP，保留draft/publish/retire/soft-delete/restore/health/tenant routing语义，删除全局无tenant preview；不保留旧endpoint alias。
旧Model错误namespace不作为新System API承诺；Root消费者任务一次性更新code/path与服务身份，未经核对的外部artifact仍是发布阻断，不声明无外部消费者。

## 消费者与 cutover

BFF consumer已提交1e03b87、source runner修复26eec011，固定G1 artifact；真实live由Root G6验证。
Agent consumer已提交e24b4aa，System resolve已接入真实factory/worker；live由Root G6验证。
旧Site Connect/Proto/generated/SDK已删除，所有调用使用唯一HTTP；没有兼容alias。
contract版本2.0.0标记v1-fresh-cutover（未发布基线），生成artifact digest和source commit由发布任务记录；不让artifact自引用未知commit。

### Agent executable route

POST /v1/system/model-catalog/resolve：caller=kokoro-agent，trusted x-kokoro-tenant-id；body feature_key必填，label_key可省。省略label按tenant/feature显式默认routing policy选择；无默认404 ROUTE_NOT_FOUND，hidden403 POLICY_DENIED，无可用published/healthy模型503 MODEL_UNAVAILABLE。只支持litellm；输出revision/digest/global及tenant generation、provider_model_name与gateway_model_name，不返回endpoint/凭据。BFF目录GET /v1/system/model-catalog/catalog返回items(key,display_name,feature_key,default_revision_id)+next_cursor，由BFF做public投影。

### Config scope / CAS补充

POST /config只创建；PATCH /config/{config_id}只更新value且If-Match必需，所有identity不可变，由存量module schema再验证value；validated release退回draft。删除软删后可重建同identity，不提供restore。

| scope_type                                                                                                                                                                                                                             | scope_id           | product_id         | site_id       | stored tenant_id    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------ | ------------- | ------------------- |
| global                                                                                                                                                                                                                                 | null               | null或Product UUID | null          | null，只有admin可写 |
| tenant                                                                                                                                                                                                                                 | 等于trusted tenant | null               | null          | trusted tenant      |
| product                                                                                                                                                                                                                                | 等于product_id     | 必需UUID           | null          | trusted tenant      |
| surface                                                                                                                                                                                                                                | 非空surface标识    | 必需UUID           | 必需Site UUID | trusted tenant      |
| SQL CHECK与Zod负例共同覆盖结构；tenant等值校验在可信上下文业务入口。                                                                                                                                                                   |
| 当前envelope替换旧JSON meta及x-kokoro-request-id为x-request-id，是明确fresh-cut breaking，不保留双轨。retryable对400/403/404/409/428为false，对瞬时503依赖/模型不可用为true；credential未配置在启动时失败。响应资源含ID即201资源标识。 |

### Conditional Config scope（最终G1裁决）

operation metadata使用x-kokoro-scope=tenant/global/conditional。Config全部conditional：POST按body.scope_type，list/get/PATCH/DELETE按query.scope=tenant|global（省略tenant）。Global必须认证system-admin，不要求tenant header且忽略其值；tenant必须trusted header。写仍system:write，global不能用tenant字符串升级。Global Config强制release_id=null；release.tenant_id必需，绝无global release路径。
错误status按操作适用：GET/resolve不带CAS则无428；mutation带409；有CAS才428。PATCH value先shape校验再按存量module校验，不匹配=INVALID_CONFIG_SCHEMA。

运维hold下已有过期receipt key复用返回409 IDEMPOTENCY_KEY_REUSED并保留原receipt；解除hold后恢复7天到期复用。无新wire字段/错误码。
