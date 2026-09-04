import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = new URL(
  "../contract/openapi/system.openapi.json",
  import.meta.url,
);

const operationMethods = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
] as const;

const governanceByOperation = {
  health: { idempotency: "not-applicable", permission: "none" },
  readiness: { idempotency: "not-applicable", permission: "none" },
  get_runtime_manifest: {
    idempotency: "inherent",
    permission: "service-authenticated-tenant-context",
  },
  list_sites: { idempotency: "inherent", permission: "system:read" },
  create_site: { idempotency: "required-key", permission: "system:write" },
  list_workspaces: { idempotency: "inherent", permission: "system:read" },
  create_workspace: {
    idempotency: "required-key",
    permission: "system:write",
  },
  get_site_policy: { idempotency: "inherent", permission: "system:read" },
  put_site_policy: {
    idempotency: "required-key",
    permission: "system:write",
  },
  list_config: { idempotency: "inherent", permission: "system:read" },
  upsert_config: { idempotency: "required-key", permission: "system:write" },
  create_release: {
    idempotency: "required-key",
    permission: "system:write",
  },
  transition_release: {
    idempotency: "required-key",
    permission: "system:publish",
  },
} as const;

function record(
  value: unknown,
  name: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${name} must be an object`);
  return Object.fromEntries(Object.entries(value));
}

function operationDefinitions(
  document: Readonly<Record<string, unknown>>,
): readonly Readonly<Record<string, unknown>>[] {
  const paths = record(document.paths, "OpenAPI paths");
  const components = record(document.components, "OpenAPI components");
  const pathItems = record(components.pathItems, "OpenAPI component pathItems");
  const definitions: Readonly<Record<string, unknown>>[] = [];
  for (const [groupName, group] of [
    ["paths", paths],
    ["components.pathItems", pathItems],
  ] as const) {
    for (const [path, rawPathItem] of Object.entries(group)) {
      const pathItem = record(rawPathItem, `${groupName}.${path}`);
      for (const method of operationMethods) {
        if (pathItem[method] === undefined) continue;
        definitions.push(
          record(pathItem[method], `${groupName}.${path}.${method}`),
        );
      }
    }
  }
  return definitions;
}

function schemaProperty(
  schemas: Readonly<Record<string, unknown>>,
  schemaName: string,
  propertyName: string,
): Readonly<Record<string, unknown>> {
  const schema = record(schemas[schemaName], `schema ${schemaName}`);
  const candidates = Array.isArray(schema.allOf) ? schema.allOf : [schema];
  for (const candidate of candidates) {
    const candidateRecord = record(candidate, `schema ${schemaName} member`);
    if (candidateRecord.properties === undefined) continue;
    const properties = record(
      candidateRecord.properties,
      `schema ${schemaName} properties`,
    );
    if (properties[propertyName] !== undefined)
      return record(
        properties[propertyName],
        `schema ${schemaName}.${propertyName}`,
      );
  }
  throw new Error(`missing schema property ${schemaName}.${propertyName}`);
}

describe("canonical System HTTP contract", () => {
  it("defines every production HTTP boundary under an explicit v1 path", () => {
    expect(existsSync(source)).toBe(true);
    if (!existsSync(source)) return;
    const parsed: unknown = JSON.parse(readFileSync(source, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new Error("OpenAPI document must be an object");
    const document = Object.fromEntries(Object.entries(parsed));
    const paths =
      typeof document.paths === "object" &&
      document.paths !== null &&
      !Array.isArray(document.paths)
        ? Object.fromEntries(Object.entries(document.paths))
        : {};
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(paths).sort()).toEqual(
      [
        "/healthz",
        "/readyz",
        "/v1/system/config",
        "/v1/system/releases",
        "/v1/system/releases/{release_id}/publish",
        "/v1/system/releases/{release_id}/retire",
        "/v1/system/releases/{release_id}/validate",
        "/v1/system/runtime-manifest",
        "/v1/system/sites",
        "/v1/system/sites/{site_id}/policy",
        "/v1/system/workspaces",
      ].sort(),
    );
    expect(Object.keys(paths)).not.toContain(
      "/system/runtime-manifest",
    );
    expect(JSON.stringify(document)).not.toContain(
      "/rpc/kokoro.system.v1.SystemService/GetRuntimeManifest",
    );
  });

  it("declares snake_case wire fields and the common envelopes", () => {
    expect(existsSync(source)).toBe(true);
    if (!existsSync(source)) return;
    const text = readFileSync(source, "utf8");
    for (const field of [
      "request_id",
      "tenant_id",
      "product_id",
      "locale_namespaces",
      "feature_flags",
      "config_version",
      "release_id",
      "next_cursor",
      "site_key",
      "workspace_key",
    ])
      expect(text).toContain(`"${field}"`);
    for (const field of ["tenantId", "productId", "nextCursor", "siteKey"])
      expect(text).not.toContain(`"${field}"`);
  });

  it("governs every direct and reusable OpenAPI operation", () => {
    const parsed: unknown = JSON.parse(readFileSync(source, "utf8"));
    const document = record(parsed, "OpenAPI document");
    const operations = operationDefinitions(document);
    expect(operations).toHaveLength(Object.keys(governanceByOperation).length);

    for (const operation of operations) {
      const operationId = operation.operationId;
      if (
        typeof operationId !== "string" ||
        !(operationId in governanceByOperation)
      )
        throw new Error(`unexpected OpenAPI operationId: ${String(operationId)}`);
      const expected = Object.entries(governanceByOperation).find(
        ([candidate]) => candidate === operationId,
      )?.[1];
      if (expected === undefined)
        throw new Error(`missing governance expectation: ${operationId}`);
      expect(operation["x-kokoro-owner"]).toBe("kokoro-system");
      expect(operation["x-kokoro-visibility"]).toBe("internal-owner");
      expect(operation["x-kokoro-stability"]).toBe("stable");
      expect(operation["x-kokoro-idempotency"]).toBe(expected.idempotency);
      expect(operation["x-kokoro-permission"]).toBe(expected.permission);
    }
  });

  it("represents every PostgreSQL BIGINT response as a canonical decimal string", () => {
    const parsed: unknown = JSON.parse(readFileSync(source, "utf8"));
    const document = record(parsed, "OpenAPI document");
    const components = record(document.components, "OpenAPI components");
    const schemas = record(components.schemas, "OpenAPI schemas");
    const positive = { type: "string", pattern: "^[1-9][0-9]*$" };
    for (const [schemaName, propertyName] of [
      ["site", "version"],
      ["workspace", "version"],
      ["site_policy", "version"],
      ["config", "config_version"],
      ["release", "version"],
    ] as const)
      expect(schemaProperty(schemas, schemaName, propertyName)).toEqual(
        positive,
      );
    expect(schemaProperty(schemas, "runtime_manifest", "config_version")).toEqual(
      { type: "string", pattern: "^(0|[1-9][0-9]*)$" },
    );
  });
});
