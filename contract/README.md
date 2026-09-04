# kokoro-system contract

This directory is the machine-readable wire-contract authority owned by `kokoro-system`. It is not a shared Root contract directory,
and consumers must not copy these files into another editable source of truth.

## Ownership and visibility

| Field | Value |
|---|---|
| owner | `kokoro-system` |
| visibility | `internal-owner` |
| HTTP source | `openapi/system.openapi.json` |
| protobuf source | `proto/kokoro/site/v1/site.proto` (`kokoro.site.v1`) |
| generated output | `../src/generated/proto/` (read-only) |
| consumer adapter | `../sdk/typescript/` (handwritten, server-only Runtime Manifest client) |

`/healthz` and `/readyz` are platform probes. `/v1/system/*` and `kokoro.site.v1.SiteService` are for authenticated service callers,
primarily BFF. They are not public Product API and must not be called from browser code.

## Version model

- OpenAPI `info.version`: `1.0.0`.
- HTTP route generation: `/v1/system/*`.
- Protobuf API generation: package suffix `v1`.
- npm repository/package version: `0.1.0`; this is not the wire-contract version.
- `provenance.json.version`: `1`; this versions the provenance document shape, not HTTP or protobuf compatibility.

An additive compatible update increments the owner artifact version according to release policy. A breaking HTTP change requires a new
major contract/route generation; a breaking protobuf change requires a new protobuf package generation (for example, `v2`) or an explicitly
approved wire-compatible migration. V1 clean-slate removes unshipped local aliases rather than maintaining dual contracts.

## Generation workflow

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm contract:lint
pnpm contract:generate
pnpm verify:contract-provenance
pnpm test:contract
pnpm contract:check
git diff --check
```

`contract:generate` invokes Buf with `buf.gen.yaml`, cleans and rewrites TypeScript protobuf declarations under
`src/generated/proto/`, and normalizes their final newline. Never edit generated files by hand. `test:contract-owner` rejects foreign
protobuf packages, checks the exact provenance inventory/digests, regenerates into an isolated directory, and compares checked-in output
byte for byte. OpenAPI currently has no generated server/client checked into this repository; the TypeScript SDK is a narrow handwritten
adapter and must be validated against the owner contract by tests.

When proto source changes, the owner must update `provenance.json` file digests and combined digest in the same reviewed change, regenerate,
and inspect the generated diff. The repository currently has no `provenance:update` command; digest update remains an explicit owner step and
is listed below as a gap.

## OpenAPI operation governance

Every direct operation and every reusable `components.pathItems` operation carries:

| Extension | Accepted value |
|---|---|
| `x-kokoro-owner` | `kokoro-system` |
| `x-kokoro-visibility` | `internal-owner` |
| `x-kokoro-stability` | `stable` |
| `x-kokoro-idempotency` | `not-applicable`, `inherent`, or `required-key` |
| `x-kokoro-permission` | `none`, `service-authenticated-tenant-context`, `system:read`, `system:write`, or `system:publish` |

`scripts/verify-openapi-contract.ts`, Vitest contract tests, and the Root audit validate presence/value. `upsert_config` is marked
`system:write`; runtime additionally requires `system:publish` when `scope_type=global`, as documented in `docs/API_CONTRACT.md`.

## Breaking policy

### Implemented gates

- Buf `STANDARD` lint and `FILE` breaking rule configuration in `buf.yaml`.
- OpenAPI 3.1/path/version/operation-metadata validation.
- Exact HTTP path inventory and snake_case/envelope source tests.
- Proto generation and proto-source digest verification.
- Repository typecheck, tests, runtime smoke, and consumer SDK tests in CI.

### Required release review

Before publishing a changed contract, the owner must compare proto and OpenAPI against a pinned previous owner artifact/commit, classify each
change as additive or breaking, update version/release notes, regenerate, run provider and consumer contract tests, and publish the artifact
with immutable digest/provenance. A reviewer must reject a change whose baseline is a moving branch or an unrecorded local checkout.

### Current gaps

- No package script runs `buf breaking` against a pinned prior artifact.
- No semantic OpenAPI breaking-diff tool is wired into CI.
- No published contract artifact registry/version manifest is present in this repository.
- No automated consumer matrix proves BFF compatibility before merge.

The configured breaking rules are therefore policy plus partial gates, not complete automated breaking evidence.

## Provenance

`provenance.json` currently records:

- authority and local source directory;
- provenance document version;
- ordered proto file inventory;
- SHA-256 per proto source file;
- SHA-256 over the ordered concatenated proto contents.

`scripts/verify-contract-provenance.ts` recomputes these values and fails on source drift. `test:contract-owner` also requires the
provenance inventory and digest keys to equal every canonical Proto source and verifies deterministic generated output.

Current provenance does **not** record OpenAPI digest, generated-output digest, source commit, generator/tool digest, build environment, or
published artifact digest. Those fields remain a release-governance gap; consumers must pin the current source commit/artifact digest through
their own dependency record until the owner publishes a complete provenance manifest.

## Consumer workflow

1. Select a released System contract artifact or exact source commit; record OpenAPI/protobuf version and immutable digest.
2. Confirm visibility remains `internal-owner` and call only from a server-side trusted boundary.
3. Generate protobuf types from the pinned owner artifact, or consume an owner-published generated package; never edit or vendor an independent
   canonical proto copy.
4. For Runtime Manifest only, the current server-only TypeScript SDK may be used after pinning its exact package/source version. It sends
   trusted tenant/Host/service context and validates the response, but it is not a complete control-plane client.
5. Run consumer contract tests for envelope, snake_case, error code, timeout/cancellation, service auth, tenant isolation, and any operation
   used by the consumer.
6. On upgrade, compare against the previously pinned artifact, regenerate, inspect diff, run provider + consumer tests, then update the
   recorded version/digest atomically.
7. Browser code continues to call the Web same-origin adapter/BFF; service token, tenant controls, and this SDK must not cross into browser
   bundles.

## Owner change checklist

1. Change the owner machine source first.
2. Add or update a failing contract/behavior test.
3. Run lint and the pinned breaking review.
4. Regenerate `src/generated/proto/`; do not hand-edit it.
5. Update provenance/version/release notes in the same commit.
6. Update implementation, SDK/consumer, human docs, and examples.
7. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm contract:check`, real integration, and the Root audit slice.
8. Publish only after immutable artifact/image digest and provenance evidence exist.
