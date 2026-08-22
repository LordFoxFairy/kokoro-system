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
context and query is rejected before MySQL or Redis reads.

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

MySQL owns release/config facts. Redis caches only the assembled manifest and every key includes
`tenant_id`, product and locale. Redis failure is fail closed; there is no process-memory
fallback. The system service never becomes an owner of payment, credit, model or capability facts.
