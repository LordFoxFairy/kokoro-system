# System API Contract v1

## Request

`GET /v1/system/runtime-manifest?product_id=PRODUCT_ID&locale=LOCALE&surface_id=SURFACE_ID`

内部请求必须携带受信上下文：

```text
Forwarded: host=TENANT_HOST
x-kokoro-tenant-id: TENANT_ID
x-kokoro-actor-id: ACTOR_ID       # optional
x-kokoro-request-id: REQUEST_ID
```

System 使用自己的 `system_site_host` Host 绑定校验 `TENANT_ID + TENANT_HOST`。`site_id` 只在 System 内部资源路径和
持久化中使用，不作为跨仓隔离键；不存在 `iam_site` 或 IAM Host lookup。

启用 service auth 时还需要：

```text
x-kokoro-service: web-bff
x-kokoro-internal-secret: BFF_SERVICE_TOKEN
# 或 Authorization: Bearer BFF_SERVICE_TOKEN
```

浏览器不直连该接口，也不能选择 `tenant_id`。缺失上下文、Host 不匹配或 Site 不存在时，在读取 PostgreSQL/Redis
业务数据前失败。

## Response

```json
{"data":{"tenant_id":"TENANT_ID","product_id":"PRODUCT_ID","locale":"en-US","navigation":[],"locale_namespaces":[],"theme":{},"feature_flags":[],"references":[],"config_version":"1","release_id":null,"digest":"SHA256"},"meta":{"request_id":"REQUEST_ID"}}
```

PostgreSQL 是 release/config 事实源。Redis key 必须包含 `tenant_id`、product、locale、surface/default；缓存命中
仍校验响应身份。

## Control-plane resources

```text
GET  /v1/system/sites?limit=50&cursor=CURSOR
POST /v1/system/sites                         {site_key, hostname, display_name}
GET  /v1/system/workspaces?limit=50&cursor=CURSOR
POST /v1/system/workspaces                    {site_id, workspace_key, name}
GET  /v1/system/sites/SITE_ID/policy
PUT  /v1/system/sites/SITE_ID/policy           {default_locale, allowed_locales, allowed_products, public_manifest}
GET  /v1/system/config?limit=50&cursor=CURSOR
POST /v1/system/config                         {module_key, config_key, scope_type, scope_id, product_id, locale, value, schema_version, release_id}
POST /v1/system/releases                       {release_key, digest}
POST /v1/system/releases/RELEASE_ID/{validate,publish,retire}
```

列表统一返回 `{data:{items,next_cursor},meta:{request_id}}`。Mutation 必须带 `Idempotency-Key`，同一
`tenant_id + key + request_hash` 重放原响应，不同 hash 返回 `409 IDEMPOTENCY_KEY_REUSED`。Release 状态机为
`draft → validated → published → retired`。

## Errors and permissions

稳定错误：`400 INVALID_ARGUMENT/INVALID_CURSOR`、`403 FORBIDDEN/service_auth_failed`、`404 NOT_FOUND`、
`409 CONFLICT/IDEMPOTENCY_KEY_REUSED`、`501 NOT_IMPLEMENTED`、`503 SYSTEM_UNAVAILABLE`。
错误响应统一为 `{"error":{"code":"ERROR_CODE","message":"..."},"meta":{"request_id":"REQUEST_ID"}}`，
不泄露 SQL、Redis key、凭据、连接串或堆栈。

`system:read` 用于读取，`system:write` 用于 Site/Workspace/Config/Policy 和草稿 Release，`system:publish` 用于
发布状态变更。权限只来自受信请求上下文，不在 System 形成 IAM 事实。

## SiteService Connect RPC

`POST /kokoro.site.v1.SiteService/ResolveSiteByHost` 由
`contract/proto/kokoro/site/v1/site.proto` 唯一定义，并由生成的 `SiteService` descriptor 注册 Connect handler。
租户身份只来自 `x-kokoro-tenant-id` 受信 header；request message 只携带 `host` 与 `request_id`。旧
`/rpc/kokoro.system.v1.SystemService/GetRuntimeManifest` JSON 路径不存在。
