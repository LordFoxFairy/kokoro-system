# kokoro-system API Contract

状态：当前 HTTP/Connect 行为说明，2026-09-03。字段级事实源是
[`../contract/openapi/system.openapi.json`](../contract/openapi/system.openapi.json) 与
[`../contract/proto/`](../contract/proto/)；本文解释 trust、permission、idempotency 和已知差异，不另建 DTO 事实源。

## 1. 可见性与版本

- Owner：`kokoro-system`。
- Visibility：`internal-owner`；浏览器不得直连。
- HTTP：显式 `/v1/system/*`；OpenAPI document version `1.0.0`。
- Connect：protobuf package `kokoro.site.v1`。
- 当前没有 System-owned event protocol。
- `/healthz` 与 `/readyz` 是内部平台 probe，不是 Product API。

所有 OpenAPI operation 使用：

| Extension | 当前值域 | 含义 |
|---|---|---|
| `x-kokoro-owner` | `kokoro-system` | 唯一 contract owner |
| `x-kokoro-visibility` | `internal-owner` | 只供受信服务/平台调用 |
| `x-kokoro-stability` | `stable` | V1 变更需执行 breaking review；不表示生产 SLO 已达标 |
| `x-kokoro-idempotency` | `not-applicable` / `inherent` / `required-key` | Probe、GET、mutation 的重试语义 |
| `x-kokoro-permission` | `none` / service context / permission key | application admission 要求 |

## 2. 受信请求上下文

业务 HTTP 与 Connect RPC 先要求：

```http
x-kokoro-service: web-bff
x-kokoro-internal-secret: SYSTEM_BFF_TOKEN
# 或 Authorization: Bearer SYSTEM_BFF_TOKEN
x-kokoro-tenant-id: TENANT_ID
```

两个 credential 形式任一匹配即可，但 service identity 必须精确为 `web-bff`。未配置
`KOKORO_SYSTEM_BFF_SERVICE_TOKEN` 返回 `503 service_auth_not_configured`；错误 identity/token 返回
`403 service_auth_failed`。Probe 不执行 service auth。

当前实现还读取：

| Header | Required | 使用方式 |
|---|---:|---|
| `x-kokoro-tenant-id` | 业务请求是 | opaque tenant isolation context；body 不能覆盖 |
| `Forwarded` 或 `Host` | Runtime Manifest 是 | 取 Forwarded 第一项 host，缺失时回退 Host；按 tenant+normalized host 验证 Site |
| `x-kokoro-iam-permissions` | Control-plane 按操作是 | 逗号分隔 snapshot；service-auth 后由 application 检查 |
| `x-kokoro-actor-id` | 否 | Config `updated_by` 与 request context |
| `x-kokoro-organization-id` | 否 | 当前进入 context，但无持久化/授权规则 |
| `x-kokoro-request-id` | 否 | 缺失时生成 UUID；response header 与 `meta.request_id` 回传 |
| `x-kokoro-trace-id` | 否 | 只进入结构化 log；缺失时使用 request id |
| `Idempotency-Key` | 所有 mutation 是 | tenant-scoped，1–128 字符；详见第 5 节 |

**安全边界**：这些业务 header 本身不是 IAM token。BFF 必须先完成 session/IAM/CSRF admission，再在受保护的
server-to-server hop 上构造它们；System 以 service token 保护这条信任边界。

## 3. Envelope 与 wire naming

HTTP JSON 使用 snake_case。

```json
{
  "data": {},
  "meta": { "request_id": "REQUEST_ID" }
}
```

```json
{
  "error": { "code": "ERROR_CODE", "message": "stable summary" },
  "meta": { "request_id": "REQUEST_ID" }
}
```

Response 同时设置 `x-kokoro-request-id`。业务异常不返回 SQL、Redis key、connection URL、credential 或 stack。
Request object 拒绝未声明字段；body 必须是 JSON object，当前最大 1,000,000 bytes。

## 4. Operation matrix

| Operation | Success | Idempotency | Admission |
|---|---:|---|---|
| `GET /healthz` | 200 | not applicable | none |
| `GET /readyz` | 200 | not applicable | none；真实 ping PostgreSQL + Redis |
| `GET /v1/system/runtime-manifest` | 200 | inherent | service-authenticated tenant + matching Host；不检查 `system:read` |
| `GET /v1/system/sites` | 200 | inherent | `system:read` |
| `POST /v1/system/sites` | 201 | required key | `system:write` |
| `GET /v1/system/workspaces` | 200 | inherent | `system:read` |
| `POST /v1/system/workspaces` | 201 | required key | `system:write` |
| `GET /v1/system/sites/{site_id}/policy` | 200 | inherent | `system:read` |
| `PUT /v1/system/sites/{site_id}/policy` | 200 | required key | `system:write` |
| `GET /v1/system/config` | 200 | inherent | `system:read` |
| `POST /v1/system/config` | 201 | required key | `system:write`；global scope 额外要求 `system:publish` |
| `POST /v1/system/releases` | 201 | required key | `system:write` |
| `POST /v1/system/releases/{release_id}/validate` | 200 | required key | `system:publish` |
| `POST /v1/system/releases/{release_id}/publish` | 200 | required key | `system:publish` |
| `POST /v1/system/releases/{release_id}/retire` | 200 | required key | `system:publish` |

OpenAPI 的三个 transition path 引用同一个 `components.pathItems.release_transition` operation，因此 metadata 由该 reusable
operation 持有；本地 verifier 会同时检查 direct 与 reusable operations。

## 5. Runtime Manifest

```http
GET /v1/system/runtime-manifest?product_id=PRODUCT_ID&locale=en-US&surface_id=SURFACE_ID
Forwarded: host=tenant.example.test
```

`product_id` 必填，可为 active Product UUID 或 product key；`locale` 默认 `en-US`；`surface_id` 可选。

```json
{
  "data": {
    "tenant_id": "TENANT_ID",
    "product_id": "PRODUCT_ID",
    "locale": "en-US",
    "navigation": [],
    "locale_namespaces": [],
    "theme": {},
    "feature_flags": [],
    "references": [],
    "config_version": "0",
    "release_id": null,
    "digest": "SHA256_HEX"
  },
  "meta": { "request_id": "REQUEST_ID" }
}
```

System 在读 Redis/config 前验证 active tenant/Site/Host。Product 不存在时返回 empty manifest，而非 404。配置 precedence
为 scope（surface > tenant > product > global）、精确 locale、active binding 的 release、config version、ID。
当前 binding/status、policy enforcement、cache invalidation 与 digest 规范缺口见 [`CURRENT.md`](CURRENT.md)。

## 6. Control-plane payload

```json
{ "site_key": "main", "hostname": "tenant.example.test", "display_name": "Main" }
```

```json
{ "site_id": "SITE_UUID", "workspace_key": "default", "name": "Default" }
```

```json
{
  "default_locale": "en-US",
  "allowed_locales": ["en-US"],
  "allowed_products": ["admin"],
  "public_manifest": false
}
```

```json
{
  "module_key": "theme",
  "config_key": "default",
  "scope_type": "tenant",
  "scope_id": "TENANT_ID",
  "product_id": null,
  "locale": "en-US",
  "value": { "mode": "dark" },
  "schema_version": 1,
  "release_id": null
}
```

```json
{ "release_key": "2026-09-03.1", "digest": "64_LOWERCASE_HEX" }
```

字段是否 required、enum、长度、response schema 以 OpenAPI 为准。当前 runtime 只对部分 text 做 160 字符 application
validation；OpenAPI 与实现边界差异必须在 contract-first 变更中收敛。

## 7. Pagination

List query 支持 `limit`（默认 50，范围 1–100）和 opaque `cursor`。当前 cursor 是上一页末尾 UUID 的 base64url；
repository 使用 `id > decoded_cursor ORDER BY id`。调用方不得解析或构造 cursor；非法值返回 `400 INVALID_CURSOR`。
Response：

```json
{
  "data": { "items": [], "next_cursor": null },
  "meta": { "request_id": "REQUEST_ID" }
}
```

## 8. Idempotency 与并发

Mutation 的 key space 是 `(tenant_id, idempotency_key)`，跨所有 operation 共用。Request digest 对
`{ operation, payload }` 做递归 key 排序后计算 SHA-256：operation 是受信 application 语义，payload 只包含规范化 wire body、
path identity 与 transition target，不包含数据库当前 version 或 Policy 的合成 status/version。JSON object field 顺序不改变
digest；array 顺序保持业务语义。调用方仍须为每个逻辑 command 生成 tenant 内全局唯一 key。

- 同 tenant/key/hash：返回首次 durable response；
- 同 tenant/key、不同 hash：`409 IDEMPOTENCY_KEY_REUSED`；
- 首次执行：receipt claim、业务 mutation、response completion 在一个 PostgreSQL transaction/row lock 中；
- Release transition 另使用 version 条件防止并发更新。

## 9. Error taxonomy

| HTTP | 已实现 code 示例 | 语义 |
|---:|---|---|
| 400 | `INVALID_ARGUMENT`、`INVALID_CURSOR`、`INVALID_STATE` | shape、header/query、cursor 或状态不合法 |
| 403 | `FORBIDDEN`、`service_auth_failed` | permission 或 service credential 不满足 |
| 404 | `NOT_FOUND` | route/resource/Site Host 不存在或不属于 tenant |
| 409 | `CONFLICT`、`IDEMPOTENCY_KEY_REUSED` | natural key、version 或 idempotency digest 冲突 |
| 501 | `NOT_IMPLEMENTED` | 仅未装配 control dependency 的测试/嵌入场景；生产 bootstrap 会装配 |
| 503 | `SYSTEM_UNAVAILABLE`、`service_auth_not_configured` | dependency、decode、cache identity 或启动配置失败 |

未知内部错误统一映射 503，并通过注入的 unexpected-error hook 记录类型，不把原异常返回调用方。

## 10. SiteService Connect RPC

```text
POST /kokoro.site.v1.SiteService/ResolveSiteByHost
request:  { host, request_id }
response: { site_id, key, canonical_host, default_locale, timezone, generation }
```

请求 message 不携带 tenant；tenant 只来自受信 header。RPC 使用与 HTTP 相同的 BFF service auth。错误映射为 Connect
`InvalidArgument`、`PermissionDenied`、`NotFound`、`Aborted` 或 `Unavailable`。字段命名在 JSON transport 中由
Connect/protobuf 映射；以 proto 为准。

## 11. 当前 contract 缺口

- OpenAPI 未声明全部受信 context headers；`x-kokoro-request-id` 的 UUID format 与 server 的“任意非空字符串”校验不一致。
- `/readyz` callback 返回 `false` 时 runtime 会给 503 success-shaped health envelope，而 OpenAPI 503 只引用 error envelope；
  production callback 当前在依赖失败时通常抛错。
- Server 没有由 OpenAPI 自动生成的 runtime validator；tests 只覆盖已列举 shape。
- TypeScript SDK 手写且只覆盖 Runtime Manifest；没有 control-plane generated client。
- 首次发布后的 OpenAPI semantic breaking baseline、source-commit/published-artifact provenance 与自动 consumer matrix 尚未
  自动化；当前 V1 fresh-cutover classification 和 source/generated digest 已进入 contract gate。详见
  [`../contract/README.md`](../contract/README.md)。
