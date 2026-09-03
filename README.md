# kokoro-system

System configuration control plane for Site, Workspace, site policy, release and Runtime Manifest. The code uses explicit domain/application/infrastructure/interfaces/bootstrap layers.

Start with [`INDEX.md`](INDEX.md) and [`docs/README.md`](docs/README.md). This repository owns its
consumer-facing wire contract under `contract/` and keeps generated protobuf types under
`src/generated/`; generated files are read-only and must be regenerated from the local contract source.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

System accepts only IAM/BFF server-side tenant context. It does not store credentials or authorization facts,
and it does not call Model Provider services.

PostgreSQL is the durable system fact store. Its single V1 schema is `database/schema.sql`; timestamps use UTC-aware `TIMESTAMPTZ(3)` and all PostgreSQL parameters use `$1`, `$2`, ... and Redis is the manifest cache/coordination dependency. The service
fails readiness when either boundary is unavailable; this repository does not add another database runtime.

## Production image

The image builds the TypeScript sources and starts the compiled production entry `node dist/main.js`.
Provide `DATABASE_URL`, `REDIS_URL`, and `KOKORO_SYSTEM_BFF_SERVICE_TOKEN` at runtime. System resolves Host against its own Site records; it has no IAM Host lookup dependency. The last variable configures the required BFF service-auth boundary:

```bash
docker build -t kokoro-system:local .
docker run --rm -p 4240:4240 \
  -e DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB \
  -e REDIS_URL=redis://HOST:6379 \
  -e KOKORO_SYSTEM_BFF_SERVICE_TOKEN=TOKEN \
  kokoro-system:local
```

The BFF service token must match the value used by the BFF's upstream secret configuration. System keeps
`/healthz` and `/readyz` public, but requires `x-kokoro-service: web-bff` plus either the matching
`x-kokoro-internal-secret` or `Authorization: Bearer` credential on runtime manifest and control-plane routes.
Business routes fail closed with `service_auth_not_configured` when the token is missing; only health/readiness
probes remain public.

The image `HEALTHCHECK` probes `/readyz`. Request and lifecycle logs are JSON objects containing
`service`, `operation`, `request_id`, `trace_id`, `result`, and `duration_ms`. Graceful shutdown uses the
total deadline configured by `KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS` (default `10000`).
