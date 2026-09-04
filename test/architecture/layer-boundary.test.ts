import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

const requiredDeliveryPaths = [
  "README.md",
  "INDEX.md",
  "docs/INDEX.md",
  "docs/CURRENT.md",
  "docs/TECHNICAL_DESIGN.md",
  "docs/API_CONTRACT.md",
  "docs/DATA_MODEL.md",
  "docs/SECURITY.md",
  "docs/RELIABILITY.md",
  "docs/ACCEPTANCE.md",
  "docs/SLO.md",
  "docs/RUNBOOK.md",
  "docs/ADR",
  "contract/README.md",
] as const;

const supersededDeliveryPaths = [
  "docs/README.md",
  "docs/technical-plan.md",
  "docs/api-contract.md",
  "docs/acceptance.md",
  "docs/runbook.md",
  "docs/backend-web-contract-v1.md",
  "docs/bff-integration.md",
  "docs/risk-register.md",
] as const;

function files(relative: string): string[] {
  const directory = resolve(root, relative);
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory()
      ? files(`${relative}/${entry}`)
      : [path];
  });
}

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function hasExactRelativePath(relative: string): boolean {
  let current = root;
  for (const part of relative.split("/")) {
    if (!existsSync(current) || !statSync(current).isDirectory()) return false;
    if (!readdirSync(current).includes(part)) return false;
    current = resolve(current, part);
  }
  return existsSync(current);
}

function record(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${name} must be an object`);
  return Object.fromEntries(Object.entries(value));
}

function stringLiterals(text: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < text.length; ) {
    const quote = text[index];
    if (quote !== '"' && quote !== "'" && quote !== "`") {
      index += 1;
      continue;
    }
    const start = index;
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\") {
        index += 2;
        continue;
      }
      if (text[index] === quote) {
        index += 1;
        result.push(text.slice(start, index));
        break;
      }
      index += 1;
    }
  }
  return result;
}

describe("System layer architecture", () => {
  it("uses one explicit top-level architecture", () => {
    for (const layer of [
      "domain",
      "application",
      "infrastructure",
      "interfaces",
      "config",
      "bootstrap",
    ])
      expect(existsSync(resolve(root, "src", layer))).toBe(true);
    for (const removed of [
      "src/modules",
      "src/adapters",
      "src/common",
      "src/utils",
    ])
      expect(existsSync(resolve(root, removed))).toBe(false);
  });

  it("keeps domain and application independent from infrastructure", () => {
    for (const file of files("src/domain")) {
      const text = source(file);
      expect(text).not.toMatch(/infrastructure|from ["']node:/u);
      expect(text).not.toMatch(/\b(pg|redis|fastify|express)\b/iu);
    }
    for (const file of files("src/application")) {
      const text = source(file);
      expect(text).not.toMatch(/infrastructure\//u);
      expect(text).not.toMatch(/\b(pg|redis|fastify|express)\b/iu);
    }
  });

  it("keeps production test doubles out of src and documents the public layout", () => {
    expect(
      existsSync(
        resolve(root, "test/doubles/in-memory-system-control-repository.ts"),
      ),
    ).toBe(true);
    expect(
      files("src").some((file) => /in-memory|fixture|fake/iu.test(file)),
    ).toBe(false);
    expect(
      existsSync(resolve(root, "src/application/system/dto/index.ts")),
    ).toBe(true);
    expect(
      existsSync(
        resolve(
          root,
          "src/application/system/ports/system-control-repository.ts",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolve(
          root,
          "src/application/system/services/system-control.service.ts",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolve(
          root,
          "src/infrastructure/repositories/system/system-control-repository.ts",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolve(root, "src/infrastructure/persistence/postgres/client.ts"),
      ),
    ).toBe(true);
  });

  it("keeps one exact-case delivery documentation set and local contract provenance", () => {
    const missing = requiredDeliveryPaths.filter(
      (path) => !hasExactRelativePath(path),
    );
    const superseded = supersededDeliveryPaths.filter((path) =>
      hasExactRelativePath(path),
    );
    expect(missing).toEqual([]);
    expect(superseded).toEqual([]);

    const adrDirectory = resolve(root, "docs/ADR");
    const adrFiles = existsSync(adrDirectory)
      ? readdirSync(adrDirectory).filter((entry) => /^\d{4}-.+\.md$/u.test(entry))
      : [];
    expect(adrFiles.length).toBeGreaterThan(0);

    const contractReadmePath = resolve(root, "contract/README.md");
    const contractReadme = existsSync(contractReadmePath)
      ? source(contractReadmePath).toLowerCase()
      : "";
    for (const field of [
      "owner",
      "visibility",
      "version",
      "generation",
      "breaking",
      "provenance",
      "consumer",
    ])
      expect(contractReadme).toContain(field);
  });

  it("enables strict catch variables explicitly", () => {
    const parsed: unknown = JSON.parse(source(resolve(root, "tsconfig.json")));
    const config = record(parsed, "tsconfig");
    const compilerOptions = record(
      config.compilerOptions,
      "tsconfig.compilerOptions",
    );
    expect(compilerOptions.useUnknownInCatchVariables).toBe(true);
  });

  it("keeps PostgreSQL parameter binding explicit", () => {
    const repositorySource = files("src/infrastructure/repositories")
      .map(source)
      .join("\n");
    const sqlLiterals = stringLiterals(repositorySource).filter((value) =>
      /\b(SELECT|INSERT|UPDATE|DELETE)\b/iu.test(value),
    );
    expect(sqlLiterals.some((value) => value.includes("?"))).toBe(false);
    expect(repositorySource).toContain("$1");
  });

  it("makes CI and release use the canonical schema and real runtime gates", () => {
    const ci = source(resolve(root, ".github/workflows/ci.yml"));
    const release = source(resolve(root, ".github/workflows/release-image.yml"));
    for (const workflow of [ci, release]) {
      expect(workflow).toContain("postgres:");
      expect(workflow).toContain("redis:");
      expect(workflow).toContain("pnpm db:apply-schema");
      expect(workflow).not.toMatch(/pnpm db:apply(?:\s|$)/u);
    }
    expect(release).toContain("pnpm test:runtime-real-system");
    expect(release).toContain("pnpm test:integration");
    expect(release).toContain("production-image-smoke.sh");
    expect(release).toContain("sbom: true");
    expect(release).toContain("provenance: mode=max");
    expect(release).toMatch(/trivy|vulnerability/iu);
    expect(source(resolve(root, "Dockerfile"))).toMatch(
      /HEALTHCHECK[^\n]*\/readyz/iu,
    );
  });

  it("keeps unvalidated assertions out of external, Redis, and DB boundaries", () => {
    const boundaryFiles = [
      "src/infrastructure/redis/coordinator.ts",
      "src/infrastructure/redis/runtime-manifest-cache-decoder.ts",
      "src/infrastructure/repositories/runtime-manifest/postgres-system.repository.ts",
      "src/infrastructure/repositories/system/config-repository.ts",
      "src/infrastructure/repositories/system/mappers.ts",
      "src/infrastructure/repositories/system/policy-repository.ts",
      "src/infrastructure/repositories/system/postgres-site-host-resolver.ts",
      "src/interfaces/http/server.ts",
      "scripts/apply-schema.ts",
      "scripts/test/postgres-idempotency-concurrency.ts",
      "scripts/verify-contract-provenance.ts",
      "scripts/verify-openapi-contract.ts",
    ];
    const text = boundaryFiles.map((file) => source(resolve(root, file))).join("\n");
    expect(text).not.toMatch(/JSON\.parse\([^\n;]+\)\s+as\s+/u);
    expect(text).not.toMatch(/\bas\s+(RuntimeManifest|Provenance|Record<)/u);
    expect(text).not.toMatch(/scopeType\s+as\s+/u);
    expect(text).not.toMatch(/\.query<\s*\{/u);
    expect(text).not.toMatch(/\b(?:String|Number|Boolean)\([^\n]*(?:row|rows\[)/u);
  });
});
