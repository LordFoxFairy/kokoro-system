# kokoro-system local architecture map

## Runtime layers

| Path                                       | Responsibility                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/interfaces/http/`                     | Health/readiness, BFF service authentication and HTTP/JSON transport               |
| `src/application/runtime-manifest/`        | Runtime manifest use case, cache/repository ports and orchestration                |
| `src/application/system/`                  | System control commands/queries, DTOs and repository ports                         |
| `src/domain/runtime-manifest/`             | Tenant context, manifest model and host validation                                 |
| `src/domain/system/`                       | Site, Workspace, Policy, Config and Release models, enums and errors               |
| `src/infrastructure/repositories/`         | PostgreSQL repository implementations and Row-to-domain mapping                    |
| `src/infrastructure/persistence/postgres/` | PostgreSQL pool/client and transaction boundary                                    |
| `src/infrastructure/redis/`                | Complete-manifest cache adapter                                                    |
| `src/bootstrap/`                           | Production dependency composition; PostgreSQL is the only control-plane repository |
| `src/config/`                              | Environment parsing and runtime configuration                                      |
| `src/generated/`                           | Contract-generated protobuf types; never hand-edit                                 |
| `test/`                                    | Unit, contract, architecture and infrastructure smoke tests                        |
| `database/schema.sql`                      | The sole current V1 canonical schema                                               |
| `docs/SLO.md`                              | Production SLI/SLO targets, error budget, alerts and runbook linkage               |

## Dependency direction

```text
interfaces -> application -> domain
bootstrap -> application + concrete infrastructure
infrastructure -> application/domain ports
```

Domain and application code must not import PostgreSQL, Redis or HTTP frameworks. Test doubles are kept under
`test/doubles/` and are never exported by production `src/index.ts` or composed by `src/bootstrap/`.

## Data and time ownership

System owns Site, Host, Workspace, Runtime Manifest, System Policy and configuration release facts. It accepts a
trusted tenant context from the BFF and never reads IAM persistence directly. PostgreSQL stores instants as
`TIMESTAMPTZ(3)`; API timestamps are RFC 3339 UTC. A host lookup must constrain both tenant and active host.

The schema intentionally has no database foreign-key clauses in V1. Cross-record invariants are enforced by the
application transaction, repository query, fixed-order locking and local `UNIQUE`/`CHECK` constraints.

## Public exports

`src/index.ts` exposes application services, domain types and application ports only. Concrete PostgreSQL adapters,
Redis adapters, bootstrap wiring and test doubles stay internal to the service runtime.
