# System Backend/Web Contract v1

状态：冻结；供 User Web、Admin Web、BFF 和后端 agent 使用。

## 1. 服务边界

`kokoro-system` 拥有 Product/Application、Navigation、Localization、Theme、Feature Flag、通用配置、Assignment reference 和 Runtime Manifest。

它不拥有 IAM 身份/权限、Payment、Credit、Model、Hub 或 Session 事实；Web 不直连 System PostgreSQL/Redis。

## 2. Runtime Manifest API

```http
GET /system/runtime-manifest?product_id=PRODUCT_ID&locale=LOCALE&surface_id=SURFACE_ID
Host: TENANT_HOST
x-kokoro-tenant-id: TENANT_ID
x-kokoro-actor-id: ACTOR_ID       # optional
x-kokoro-request-id: REQUEST_ID
```

`surface_id` 可选，只是配置覆盖选择器，不是身份或授权边界。`x-kokoro-tenant-id` 只允许由受信 BFF/server-side context 传入；浏览器不能提交或决定它。

System 的部署可配置 `KOKORO_SYSTEM_BFF_SERVICE_TOKEN` 启用 BFF service-auth。启用后，runtime manifest、RPC
manifest 和全部 `/system/*` 业务接口必须同时满足：

```http
x-kokoro-service: web-bff
x-kokoro-internal-secret: BFF_SERVICE_TOKEN
Authorization: Bearer BFF_SERVICE_TOKEN   # 与上一行二选一；BFF 可同时发送两者
x-kokoro-tenant-id: TENANT_ID
```

`x-kokoro-service-token` 不属于本契约；服务凭据不是用户 Bearer。缺失或错误 service-auth 返回
`403 service_auth_failed`，缺 tenant context 返回 `400`。`/healthz` 和 `/readyz` 不受 service-auth 保护。
未配置 `KOKORO_SYSTEM_BFF_SERVICE_TOKEN` 时，既有本地 fixture 兼容模式保持有效。

System 必须调用 IAM：

```http
GET IAM_BASE_URL/internal/iam/tenant-binding?host=TENANT_HOST
Authorization: Bearer BACKEND_WORKLOAD_TOKEN
```

IAM 返回的 tenant 必须等于请求 context 的 tenant；不一致、未知或禁用 Host 直接失败，且不得读取 PostgreSQL/Redis 业务数据。

## 3. Response

`product_id` 使用 v1 product key（例如 `kokoro`）。System 在 owner 内通过 active `system_product.product_key`
解析 PostgreSQL UUID，再读取 UUID-backed release/config 记录；解析不到的 product key 返回该 key 对应的空
manifest，不把外部 key 直接绑定到 UUID 列。响应始终回显请求的 v1 product key。

```json
{
  "data": {
    "tenantId": "TENANT_ID",
    "productId": "PRODUCT_ID",
    "locale": "en-US",
    "navigation": [],
    "localeNamespaces": [],
    "theme": {},
    "featureFlags": [],
    "references": [],
    "configVersion": "1",
    "releaseId": null,
    "digest": "SHA256"
  }
}
```

`tenantId/productId/locale` 必须与请求解析结果一致。`digest` 是服务端组装结果的 SHA-256；客户端不自行拼装配置。

## 4. Scope and precedence

配置表为软删除、无外键、无业务 UNIQUE 索引。配置读取只接受以下 scope：

```text
surface > tenant > product > global
精确 locale > locale NULL
当前 release > release NULL
config_version > id
```

每个 `(module_key, config_key)` 只选择一个最高优先级记录。`tenant_id` 是唯一数据隔离键；System 不创建 Site 隔离轴。

## 5. Storage/runtime contract

- PostgreSQL 是 release/config 最终事实。
- Redis 只缓存完整 Runtime Manifest。
- Redis key：`<namespace>:manifest:TENANT_ID:PRODUCT_ID:LOCALE:SURFACE_OR_DEFAULT`；其中
  `SURFACE_OR_DEFAULT` 为 `surface_id`，缺省请求使用固定值 `default`。这条扩展是为了保证
  同一租户、产品和 locale 下的 surface 覆盖不会复用错误的完整 Manifest。
- Redis failure、cache identity mismatch 或 IAM binding failure：fail closed。
- 不使用进程内缓存或跨 tenant cache key。
- SQL 使用 PostgreSQL、UTC、软删除、应用层冲突处理、显式 scope 过滤。

## 6. HTTP error contract

```text
400  product_id/header/query 缺失或格式错误
403  service_auth_failed：配置 service token 后缺失或错误的 BFF service 身份/凭据
404 未知路径
503 IAM、PostgreSQL、Redis 或 manifest 读取不可用
```

响应不得泄露 SQL、Redis key、workload token、内部堆栈或其他服务私有事实。

## 7. Web agent acceptance

1. 只调用 BFF/API，不直连 System PostgreSQL/Redis。
2. 不在浏览器保存或提交 `tenant_id`、workload token 或 IAM backend token。
3. Tenant A/B 使用相同 product/locale 时 cache 和 response 完全隔离。
4. 验证 tenant、locale、surface、release 的覆盖优先级和 digest 稳定性。
5. 验证 Redis miss、Redis failure、IAM mismatch、PostgreSQL failure 的 fail-closed 行为。

## 8. Control-plane BFF surface

Admin BFF may expose the following server-side actions without exposing System storage:

```text
GET/POST /system/sites
GET/POST /system/workspaces
GET/PUT  /system/sites/SITE_ID/policy
GET/POST /system/config
POST     /system/releases
POST     /system/releases/RELEASE_ID/{validate,publish,retire}
```

List endpoints use `{data:{items,nextCursor}}`; mutations require `Idempotency-Key`. BFF supplies the IAM
derived tenant context and permission set, performs CSRF/session checks at its own boundary, sends
`x-kokoro-service: web-bff` plus the configured internal secret or service Bearer, and forwards the System
`x-kokoro-request-id` for tracing. User Web does not use these administrative mutations.
