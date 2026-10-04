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
