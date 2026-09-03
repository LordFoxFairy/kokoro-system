# System Backend/Web Contract v1

状态：冻结；供 User Web、Admin Web、BFF 和后端服务使用。

## 1. 服务边界

`kokoro-system` 拥有 Tenant 作用域下的 Site、Site Host、Workspace、产品配置、站点策略、release 和 Runtime
Manifest。它不拥有 IAM 身份/权限、Payment/Credit、Model Provider、Capability、Storage 或 Session 事实；Web
不直连 System PostgreSQL/Redis。

`tenant_id` 是唯一跨仓隔离键。`site_id` 是 System 内部 Site 资源 ID，`host` 是 System 内部解析 Site 的输入。
Site 与 Host 绑定由 System 自己保存和校验，不创建 IAM Site 表，也不调用 IAM Host 接口。

## 2. Runtime Manifest API

```http
GET /v1/system/runtime-manifest?product_id=PRODUCT_ID&locale=LOCALE&surface_id=SURFACE_ID
Forwarded: host=TENANT_HOST
x-kokoro-tenant-id: TENANT_ID
x-kokoro-actor-id: ACTOR_ID       # optional
x-kokoro-request-id: REQUEST_ID
```

System 必须在读取 PostgreSQL/Redis 业务数据前确认本仓 Site Host 记录属于 `TENANT_ID`。BFF 负责生成受信上下文；
浏览器不能提交或决定 `tenant_id`。

启用 `KOKORO_SYSTEM_BFF_SERVICE_TOKEN` 后，runtime manifest、SiteService Connect 和 `/v1/system/*` 业务接口还需要：

```http
x-kokoro-service: web-bff
x-kokoro-internal-secret: BFF_SERVICE_TOKEN
# 或 Authorization: Bearer BFF_SERVICE_TOKEN
```

缺失或错误 service auth 返回 `503 service_auth_not_configured` 或 `403 service_auth_failed`；缺 tenant/host
context 返回 `400`；健康探针不受 service auth 保护。

## 3. Response

```json
{"data":{"tenantId":"TENANT_ID","productId":"PRODUCT_ID","locale":"en-US","navigation":[],"localeNamespaces":[],"theme":{},"featureFlags":[],"references":[],"configVersion":"1","releaseId":null,"digest":"SHA256"},"meta":{"request_id":"REQUEST_ID"}}
```

`product_id` 使用稳定 v1 product key。System 在 owner 内解析 active product，再读取对应 release/config；响应的
`tenantId/productId/locale` 必须与请求上下文一致。

## 4. Scope and precedence

```text
surface > tenant > product > global
精确 locale > locale NULL
current release > release NULL
config_version > id
```

`tenant_id` 是唯一隔离键，System 不创建 Site 之外的第二租户轴。列表统一返回 `{data:{items,nextCursor}}`；
mutation 要求 `Idempotency-Key`，同 tenant/key/hash 重放原响应，不同 hash 返回 409。

## 5. Storage/runtime contract

- PostgreSQL 是 release/config/Site/Host 事实源。
- Redis 只缓存完整 Runtime Manifest。
- Redis key：`<namespace>:manifest:TENANT_ID:PRODUCT_ID:LOCALE:SURFACE_OR_DEFAULT`。
- Redis failure、cache identity mismatch、PostgreSQL failure 或 Site Host mismatch 均 fail closed。
- 不使用进程内缓存或跨 tenant cache key；SQL 使用 PostgreSQL、UTC、参数化查询。

## 6. Web agent acceptance

1. 只调用 BFF/API，不直连 System PostgreSQL/Redis。
2. 不在浏览器保存或提交 `tenant_id`、BFF service token 或其他服务凭据。
3. Tenant A/B 使用相同 product/locale 时 Site、配置、cache 和 response 完全隔离。
4. 验证 Host mismatch、locale、surface、release 优先级和 digest 稳定性。
5. 验证 Redis miss、Redis failure、PostgreSQL failure 和事实不一致的 fail-closed 行为。

## 7. Control-plane BFF surface

```text
GET/POST /v1/system/sites
GET/POST /v1/system/workspaces
GET/PUT  /v1/system/sites/SITE_ID/policy
GET/POST /v1/system/config
POST     /v1/system/releases
POST     /v1/system/releases/RELEASE_ID/{validate,publish,retire}
```

BFF supplies the trusted tenant context and permission set, performs session/CSRF checks at its own boundary, sends the
System service credential, and forwards System's request id for tracing. User Web does not use administrative mutations.
