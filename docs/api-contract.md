# System Runtime Manifest Contract

## Request

`GET /system/runtime-manifest?product_id=PRODUCT_ID&locale=LOCALE&surface_id=SURFACE_ID`

Required server-to-server context:

```text
x-kokoro-tenant-id: TENANT_ID   # supplied by IAM tenant/domain resolution
x-kokoro-actor-id: ACTOR_ID     # optional for public configuration reads
x-kokoro-request-id: REQUEST_ID
```

`surface_id` is optional and only selects a configuration override; it is not an identity or authorization boundary.

The system resolves the request host through IAM's server-to-server
`GET /internal/iam/tenant-binding?host=HOST` contract using the
backend workload token. A local header or browser value never establishes a
tenant binding.

The browser does not call this endpoint directly and cannot choose `tenant_id`. A mismatch between
context and query is rejected before PostgreSQL or Redis reads.

## Response

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

PostgreSQL owns release/config facts. Redis caches only the assembled manifest and every key includes
`tenant_id`, product and locale. Redis failure is fail closed; there is no process-memory
fallback. The system service never becomes an owner of payment, credit, model or capability facts.

## Control-plane resources

All resource routes are server-to-server and require the IAM-derived context. Collection responses use the
same cursor page shape:

```json
{"data":{"items":[],"nextCursor":null}}
```

```text
GET  /system/sites?limit=50&cursor=CURSOR
POST /system/sites                         {site_key, hostname, display_name}
GET  /system/workspaces?limit=50&cursor=CURSOR
POST /system/workspaces                    {site_id, workspace_key, name}
GET  /system/sites/SITE_ID/policy
PUT  /system/sites/SITE_ID/policy           {default_locale, allowed_locales, allowed_products, public_manifest}
GET  /system/config?limit=50&cursor=CURSOR
POST /system/config                         {module_key, config_key, scope_type, scope_id, product_id, locale, value, schema_version, release_id}
POST /system/releases                       {release_key, digest}
POST /system/releases/RELEASE_ID/validate
POST /system/releases/RELEASE_ID/publish
POST /system/releases/RELEASE_ID/retire
```

Mutation requests require `Idempotency-Key`. Replaying the same key with the same request hash returns the
original response; reusing it with another body returns HTTP 409 and `IDEMPOTENCY_KEY_REUSED`. The release
state machine is strictly `draft → validated → published → retired`.

## RPC fixture

`POST /rpc/kokoro.system.v1.SystemService/GetRuntimeManifest` accepts the same `product_id`, `locale` and
`surface_id` fields as the HTTP manifest query. It calls the same application service and returns the same
`{"data": ...}` envelope; it is a transport fixture, not a second contract authority.

## Errors and permissions

Every response carries `x-kokoro-request-id`; if the caller does not supply a UUID request id, System creates
one. Current stable statuses are `400 INVALID_ARGUMENT`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT` or
`IDEMPOTENCY_KEY_REUSED`, `501 NOT_IMPLEMENTED`, and `503` for IAM/PostgreSQL/Redis/runtime dependency failure.
Error bodies never include credentials, connection strings, SQL, cache keys or stack traces.

`system:read` is required for resource reads, `system:write` for Site/Workspace/Config/Policy and draft Release
writes, and `system:publish` for release transitions. Permissions are consumed from IAM context for the
request only; System does not persist authorization facts. `tenant_id` is always taken from the verified IAM
context. A tenant-scoped config whose `scope_id` differs from that context is rejected.
