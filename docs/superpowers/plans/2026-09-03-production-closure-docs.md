# kokoro-system Phase 1 Production Closure Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the first-stage, low-risk engineering-governance gaps in `kokoro-system` without changing runtime behavior, database schema, generated code, or another repository.

**Architecture:** Keep `kokoro-system` as the sole owner of Site, Host, Workspace, Runtime Manifest, System Config, Release, and System Policy facts. Establish one exact-case canonical documentation set, document machine-contract provenance and consumer workflow, and enforce OpenAPI governance metadata plus TypeScript strictness through repository-local tests and verification scripts.

**Tech Stack:** Markdown, OpenAPI 3.1 JSON, TypeScript 5.9, Vitest 4, ESLint 10, Buf, pnpm 11.25.0, Root Python governance audit.

## Global Constraints

- Modify only `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system`.
- Preserve all runtime behavior and `database/schema.sql` exactly.
- Never hand-edit `src/generated/`; regenerate only through `pnpm contract:check`.
- Distinguish implemented behavior, target state, and known gaps; do not invent production evidence.
- Keep the branch `codex/production-closure-docs` and create small logical commits.
- Verify from the main target checkout; do not treat worker output or historical reports as evidence.

---

### Task 1: Add repository-local governance regression tests

**Files:**
- Modify: `test/architecture/layer-boundary.test.ts`
- Modify: `test/http-contract-source.test.ts`

**Interfaces:**
- Consumes: exact-case delivery paths from the Root governance standard and the OpenAPI operation-extension contract.
- Produces: executable checks for canonical documents, ADR presence, explicit `useUnknownInCatchVariables`, contract README fields, and complete operation metadata.

- [x] **Step 1: Add a failing exact-case documentation and compiler-option test**

```ts
it("keeps the required delivery documents and strict catch variables", () => {
  for (const path of REQUIRED_DELIVERY_PATHS)
    expect(existsSync(resolve(root, path))).toBe(true);
  const tsconfig = JSON.parse(source(resolve(root, "tsconfig.json")));
  expect(tsconfig.compilerOptions.useUnknownInCatchVariables).toBe(true);
});
```

- [x] **Step 2: Add a failing OpenAPI governance metadata test**

```ts
for (const operation of openApiOperations(document)) {
  expect(operation.definition["x-kokoro-owner"]).toBe("kokoro-system");
  expect(operation.definition["x-kokoro-visibility"]).toBe("internal-owner");
  for (const key of REQUIRED_OPERATION_EXTENSIONS)
    expect(operation.definition).toHaveProperty(key);
}
```

- [x] **Step 3: Run focused tests and confirm the expected failures**

Run: `pnpm exec vitest run --no-file-parallelism test/architecture/layer-boundary.test.ts test/http-contract-source.test.ts`

Expected: failures identify missing exact-case documents, missing `contract/README.md`, missing `useUnknownInCatchVariables`, and absent OpenAPI governance extensions.

### Task 2: Establish the canonical documentation set

**Files:**
- Modify: `README.md`
- Modify: `INDEX.md`
- Create: `docs/INDEX.md`
- Create: `docs/CURRENT.md`
- Create: `docs/TECHNICAL_DESIGN.md`
- Create: `docs/API_CONTRACT.md`
- Create: `docs/DATA_MODEL.md`
- Create: `docs/SECURITY.md`
- Create: `docs/RELIABILITY.md`
- Create: `docs/ACCEPTANCE.md`
- Modify: `docs/SLO.md`
- Create: `docs/RUNBOOK.md`
- Create: `docs/ADR/INDEX.md`
- Create: `docs/ADR/0001-system-owner-and-trust-boundary.md`
- Create: `docs/ADR/0002-local-contract-authority.md`
- Create: `contract/README.md`
- Delete after content migration: `docs/README.md`, `docs/technical-plan.md`, `docs/api-contract.md`, `docs/acceptance.md`, `docs/runbook.md`, `docs/backend-web-contract-v1.md`, `docs/bff-integration.md`, `docs/risk-register.md`

**Interfaces:**
- Consumes: current source, tests, canonical schema, OpenAPI/protobuf contract, CI workflows, Dockerfile, and Root ownership rules.
- Produces: one canonical documentation graph with explicit current/target/gap labels and a contract consumer workflow.

- [x] **Step 1: Consolidate existing content into exact-case canonical documents**

Document the implemented PostgreSQL and Redis boundaries, service-auth guard, tenant/host resolution, permission checks, idempotency receipts, release state machine, readiness behavior, structured logging, shutdown deadline, CI/release gates, and generated-code workflow only where source or tests prove them.

- [x] **Step 2: Record target state and gaps separately**

Record missing production telemetry, unmeasured SLO attainment, incomplete runtime config schema validation, absent manifest cache invalidation, limited Host management surface, and any integration tests not run locally as gaps rather than implemented evidence.

- [x] **Step 3: Add contract ownership and consumer workflow**

```text
owner=kokoro-system
visibility=internal-owner
version=HTTP 1.0.0 / protobuf package v1 / provenance version 1
generation=pnpm contract:generate
breaking=buf breaking plus OpenAPI review against a pinned previous artifact
provenance=contract/provenance.json and pinned source commit/digest
```

- [x] **Step 4: Remove superseded lowercase and duplicate documents**

Run: `rg -n "docs/README|technical-plan|api-contract|acceptance\.md|runbook\.md|backend-web-contract|bff-integration|risk-register" README.md INDEX.md docs contract/README.md --glob '!docs/superpowers/**'`

Expected: no stale links or duplicate canonical entry points remain.

- [x] **Step 5: Run the focused architecture test**

Run: `pnpm exec vitest run --no-file-parallelism test/architecture/layer-boundary.test.ts`

Expected: documentation topology checks pass after all canonical files and ADRs exist.

### Task 3: Enforce OpenAPI metadata and strict catch-variable handling

**Files:**
- Modify: `contract/openapi/system.openapi.json`
- Modify: `scripts/verify-openapi-contract.ts`
- Modify: `tsconfig.json`
- Modify: `test/http-contract-source.test.ts`
- Modify: `test/architecture/layer-boundary.test.ts`

**Interfaces:**
- Consumes: every direct OpenAPI operation and the reusable release-transition Path Item.
- Produces: explicit owner, visibility, stability, idempotency, and permission metadata validated by both tests and `contract:lint`.

- [x] **Step 1: Add operation metadata without changing paths, schemas, or responses**

```json
{
  "x-kokoro-owner": "kokoro-system",
  "x-kokoro-visibility": "internal-owner",
  "x-kokoro-stability": "stable",
  "x-kokoro-idempotency": "inherent",
  "x-kokoro-permission": "system:read"
}
```

Use `not-applicable`/`none` for probes, `inherent` for reads, and `required-key` for mutations. Use `system:write` for ordinary control-plane mutations, `system:publish` for release transitions, and document the extra publish permission required by global config writes.

- [x] **Step 2: Make the verifier reject missing or invalid metadata**

Validate direct operations and referenced `components.pathItems` operations, accepted extension values, permission classification, and exact owner/visibility values.

- [x] **Step 3: Explicitly enable strict catch variables**

```json
"useUnknownInCatchVariables": true
```

- [x] **Step 4: Run focused red-to-green verification**

Run: `pnpm exec vitest run --no-file-parallelism test/architecture/layer-boundary.test.ts test/http-contract-source.test.ts && pnpm contract:lint`

Expected: focused tests and local contract lint pass.

### Task 4: Verify and commit the closure

**Files:**
- Verify all changed files only; do not modify `database/schema.sql`, runtime source, generated files, or sibling repositories.

**Interfaces:**
- Consumes: the complete branch tree.
- Produces: fresh evidence and logical commits.

- [x] **Step 1: Verify generated drift and working-tree scope**

Run: `pnpm contract:check && git status --short && git diff --check`

Expected: generated output is unchanged except for generator-produced drift, no out-of-scope file is modified, and whitespace checks pass.

- [x] **Step 2: Run all requested repository gates**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm contract:check`

Expected: every command exits zero.

- [x] **Step 3: Run the Root governance audit slice**

Run from the Root checkout: invoke `check_common`, `check_delivery`, and `check_typescript` for `kokoro-system` and assert `violation_count=0`.

- [x] **Step 4: Commit in logical units**

```bash
git commit -m "docs: close system governance documentation gaps"
git commit -m "chore: enforce system contract governance metadata"
```

- [x] **Step 5: Re-run final verification on committed HEAD**

Run the complete repository gate, Root slice, `git diff --check`, and `git status --short --branch`; report the branch, commit IDs, changed files, command results, and unresolved gaps.
