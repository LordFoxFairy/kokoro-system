# kokoro-system local map

| Path | Responsibility |
|---|---|
| `src/interfaces/http/server.ts` | health/readiness, HTTP and JSON RPC transport |
| `src/modules/runtime-manifest/` | manifest assembly, IAM binding and cache port |
| `src/modules/system/` | Site, Workspace, Policy, Config, Release domain/application |
| `src/infrastructure/postgres/` | PostgreSQL pool and control-plane persistence adapter |
| `src/infrastructure/redis/` | complete-manifest cache adapter |
| `sdk/typescript/` | server-only BFF manifest client |
| `database/migrations/001_system.sql` | PostgreSQL tables and indexes; no cross-service foreign keys |
| `docs/` | local API, technical plan, BFF, runbook, acceptance and risks |

The public application exports are in `src/index.ts`. New System features belong under `src/modules/system/`
and should expose a repository port before adding a transport route. Do not import IAM persistence, Agent runtime,
Session projection, Model Provider, or browser code into this repository.
