# System API 契约

状态：G1 目标 internal-owner HTTP，2026-09-07。运行时仍为旧 Node HTTP + Site Connect，新增 contract 不代表端点已上线。
Root ADR-031 取代 ADR-029 的 Proto 保留要求。唯一字段事实源 src/modules/*/**/*.schema.ts，单向生成只读
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

| owner | 路径（均 /v1/system 下） | 方法与状态 | 表 | 权限/主要错误 |
|---|---|---|---|---|
| sites | sites；sites/{site_id}；sites/{site_id}/restore | POST/GET；GET/PATCH/DELETE；POST | system_site | read/write；NOT_FOUND、HOST_CONFLICT、RESOURCE_IN_USE |
| sites | sites/{site_id}/domains；…/domains/{domain_id} | GET/POST；DELETE | system_site_host | read/write；HOST_CONFLICT、INVALID_STATE |
| sites | sites/{site_id}/policy | GET/PUT | system_site_policy | read/write；POLICY_INVALID、NOT_FOUND |
| workspaces | workspaces；workspaces/{workspace_id}；…/restore | GET/POST；GET/PATCH/DELETE；POST | system_workspace | read/write；SITE_UNAVAILABLE、RESOURCE_IN_USE |
| products | products；products/{product_id}；…/restore | GET/POST；GET/PATCH/DELETE；POST | system_product | read；global write；RESOURCE_IN_USE |
| products | applications；applications/{application_id}；…/restore | GET/POST；GET/PATCH/DELETE；POST | system_application | read/write；SITE_UNAVAILABLE、PRODUCT_UNAVAILABLE |
| products | features；features/{feature_id}；…/retire | GET/POST；GET；POST | system_feature_definition | read；global publish；IMMUTABLE_RESOURCE、RESOURCE_IN_USE |
| products | applications/{application_id}/exposures；…/{feature_id} | GET；PUT/DELETE | system_app_feature_exposure | read/write；FEATURE_UNAVAILABLE |
| products | applications/{application_id}/presentation | GET/PUT（locale+surface query） | system_presentation | read/write；INVALID_ARGUMENT |
| products | config；config/{config_id} | GET/POST；GET/PATCH/DELETE | system_config_record | read/write，global另publish；INVALID_STATE、INVALID_CONFIG_SCHEMA |
| products | releases；releases/{release_id}；…/validate、publish、retire | GET/POST；GET；POST | system_config_release | read/write/publish；INVALID_STATE、DIGEST_MISMATCH |
| products | release-bindings；release-bindings/{binding_id} | GET/POST；DELETE | system_release_binding | read/publish；INVALID_STATE、RESOURCE_IN_USE |
| runtime-manifests | runtime-manifest | GET product_id/locale/surface_id；host→site | system_runtime_manifest_generation；system_catalog_generation | service context，非public需read；POLICY_DENIED、SYSTEM_UNAVAILABLE |
| model-catalog | model-catalog/definitions、providers、labels；各/{id}；…/restore | GET/POST；GET/PATCH/DELETE；POST | model_definition/provider/label | read；global write；RESOURCE_IN_USE |
| model-catalog | model-catalog/revisions；…/{revision_id}；…/publish、retire | GET/POST；GET/PATCH（draft）；POST | model_revision | read；global publish；IMMUTABLE_RESOURCE、INVALID_STATE |
| model-catalog | model-catalog/routing-policies；…/{label_id} | GET；PUT/DELETE | model_routing_policy | read/write；NO_AVAILABLE_MODEL、LABEL_UNAVAILABLE |
| model-catalog | model-catalog/providers/{provider_id}/health | PUT | model_provider_health_state | global write；VERSION_CONFLICT |
| model-catalog | model-catalog/catalog、model-catalog/resolve | GET；POST（无写入，无幂等key） | model_* published/healthy snapshot | BFF/Agent tenant context；NO_AVAILABLE_MODEL、POLICY_DENIED |

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

BFF生产源码当前请求 /system/runtime-manifest 与 /bff/model-catalog（均缺/v1），后续Root在System contract提交后派BFF更新。
Agent当前无接线Model client，后续须真实resolve调用及owner集成测试，不以新建client文件算完成。
Site Connect仅owner测试调用；旧Model/Site Proto及generated在业务切片一次删除，G1保留尚在运行的旧handler以免提前破坏基线。
contract版本2.0.0标记v1-fresh-cutover（未发布基线），生成artifact digest和source commit由发布任务记录；不让artifact自引用未知commit。

### Agent executable route
POST /v1/system/model-catalog/resolve：caller=kokoro-agent，trusted x-kokoro-tenant-id；body feature_key必填，label_key可省。省略label按tenant/feature显式默认routing policy选择；无默认404 ROUTE_NOT_FOUND，hidden403 POLICY_DENIED，无可用published/healthy模型503 MODEL_UNAVAILABLE。只支持litellm；输出revision/digest/global及tenant generation、provider_model_name与gateway_model_name，不返回endpoint/凭据。BFF目录GET /v1/system/model-catalog/catalog返回items(key,display_name,feature_key,default_revision_id)+next_cursor，由BFF做public投影。

### Config scope / CAS补充
POST /config只创建；PATCH /config/{config_id}只更新value且If-Match必需，所有identity不可变，由存量module schema再验证value；validated release退回draft。删除软删后可重建同identity，不提供restore。
| scope_type | scope_id | product_id | site_id | stored tenant_id |
|---|---|---|---|---|
| global | null | null或Product UUID | null | null，只有admin可写 |
| tenant | 等于trusted tenant | null | null | trusted tenant |
| product | 等于product_id | 必需UUID | null | trusted tenant |
| surface | 非空surface标识 | 必需UUID | 必需Site UUID | trusted tenant |
SQL CHECK与Zod负例共同覆盖结构；tenant等值校验在可信上下文业务入口。
当前envelope替换旧JSON meta及x-kokoro-request-id为x-request-id，是明确fresh-cut breaking，不保留双轨。retryable对400/403/404/409/428为false，对瞬时503依赖/模型不可用为true；credential未配置503为false。响应资源含ID即201资源标识。

### Conditional Config scope（最终G1裁决）
operation metadata使用x-kokoro-scope=tenant/global/conditional。Config全部conditional：POST按body.scope_type，list/get/PATCH/DELETE按query.scope=tenant|global（省略tenant）。Global必须认证system-admin，不要求tenant header且忽略其值；tenant必须trusted header。写仍system:write，global不能用tenant字符串升级。Global Config强制release_id=null；release.tenant_id必需，绝无global release路径。
错误status按操作适用：GET/resolve不带CAS则无428；mutation带409；有CAS才428。PATCH value先shape校验再按存量module校验，不匹配=INVALID_CONFIG_SCHEMA。
