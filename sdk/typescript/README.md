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
  workloadToken: process.env.KOKORO_SYSTEM_WORKLOAD_TOKEN, // optional service SK
});

const manifest = await system.getRuntimeManifest({
  productId: "admin",
  locale: "zh-CN",
  surfaceId: "admin-web",
});
```

Keep this package in server-only modules. Browser code must call the Admin
same-origin BFF, never this SDK directly, and must never receive workload
tokens or tenant context controls. A deployment normally only needs the System
URL, service SK when the System gateway requires it, tenant host, and tenant ID.
