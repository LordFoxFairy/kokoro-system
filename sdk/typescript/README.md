# `@kokoro/system-sdk`

Server-only TypeScript client for the System Backend Web Contract v1.

The SDK intentionally owns only transport, trusted request context, timeout
handling, and response validation. It does not contain tenant data, database
access, caching, or product navigation rules.

```ts
import { createSystemClient } from "@kokoro/system-sdk";

const system = createSystemClient({
  baseUrl: process.env.KOKORO_SYSTEM_BASE_URL!,
  tenantId: process.env.KOKORO_TENANT_ID!,
  tenantHost: process.env.KOKORO_TENANT_HOST!,
  serviceToken: process.env.KOKORO_SYSTEM_BFF_SERVICE_TOKEN, // optional; enables web-bff service auth
});

const manifest = await system.getRuntimeManifest({
  productId: "admin",
  locale: "zh-CN",
  surfaceId: "admin-web",
});
```

Keep this package in server-only modules. Browser code must call the Admin
same-origin BFF, never this SDK directly, and must never receive service
tokens or tenant context controls. When `serviceToken` is present, the SDK
sends `x-kokoro-service: web-bff`, `x-kokoro-internal-secret` and the matching
`Authorization: Bearer` credential. `workloadToken` remains a compatibility
alias for `serviceToken`.
