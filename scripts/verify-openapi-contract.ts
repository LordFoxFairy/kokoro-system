import { readFile } from "node:fs/promises";

const path = new URL("../contract/openapi/system.openapi.json", import.meta.url);
const source = await readFile(path, "utf8");
const value: unknown = JSON.parse(source);

type JsonRecord = Readonly<Record<string, unknown>>;
type OperationDefinition = Readonly<{
  location: string;
  definition: JsonRecord;
}>;

const operationMethods = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
]);

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

function record(input: unknown, message: string): JsonRecord {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error(message);
  return Object.fromEntries(Object.entries(input));
}

function stringValue(input: unknown, message: string): string {
  if (typeof input !== "string" || input.length === 0) throw new Error(message);
  return input;
}

function collectOperations(
  groupName: string,
  group: JsonRecord,
): readonly OperationDefinition[] {
  const operations: OperationDefinition[] = [];
  for (const [pathName, rawPathItem] of Object.entries(group)) {
    const pathItem = record(
      rawPathItem,
      `${groupName}.${pathName} must be an object`,
    );
    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!operationMethods.has(method.toLowerCase())) continue;
      operations.push({
        location: `${groupName}.${pathName}.${method.toLowerCase()}`,
        definition: record(
          rawOperation,
          `${groupName}.${pathName}.${method} must be an object`,
        ),
      });
    }
  }
  return operations;
}

const document = record(value, "OpenAPI contract must be an object");
if (document.openapi !== "3.1.0")
  throw new Error("OpenAPI contract must use version 3.1.0");

const paths = record(document.paths, "OpenAPI contract paths are required");
const pathNames = Object.keys(paths);
if (
  pathNames.some(
    (entry) => entry.startsWith("/system/") || entry.startsWith("/rpc/"),
  )
)
  throw new Error("OpenAPI contract contains a legacy or pseudo-RPC path");
if (!pathNames.includes("/v1/system/runtime-manifest"))
  throw new Error("OpenAPI contract is missing runtime manifest");

const components = record(
  document.components,
  "OpenAPI contract components are required",
);
const componentPathItems = record(
  components.pathItems,
  "OpenAPI component pathItems are required",
);

for (const [pathName, rawPathItem] of Object.entries(paths)) {
  const pathItem = record(rawPathItem, `paths.${pathName} must be an object`);
  if (pathItem.$ref === undefined) continue;
  const reference = stringValue(
    pathItem.$ref,
    `paths.${pathName} $ref must be a string`,
  );
  const prefix = "#/components/pathItems/";
  if (!reference.startsWith(prefix))
    throw new Error(`paths.${pathName} has an unsupported Path Item reference`);
  const referenceName = reference.slice(prefix.length);
  if (componentPathItems[referenceName] === undefined)
    throw new Error(`paths.${pathName} references a missing component Path Item`);
}

const operations = [
  ...collectOperations("paths", paths),
  ...collectOperations("components.pathItems", componentPathItems),
];
if (operations.length !== Object.keys(governanceByOperation).length)
  throw new Error(
    `OpenAPI contract must define ${String(Object.keys(governanceByOperation).length)} governed operations; found ${String(operations.length)}`,
  );

const seenOperationIds = new Set<string>();
for (const operation of operations) {
  const operationId = stringValue(
    operation.definition.operationId,
    `${operation.location} operationId is required`,
  );
  if (seenOperationIds.has(operationId))
    throw new Error(`OpenAPI operationId is duplicated: ${operationId}`);
  seenOperationIds.add(operationId);
  const expected = Object.entries(governanceByOperation).find(
    ([candidate]) => candidate === operationId,
  )?.[1];
  if (expected === undefined)
    throw new Error(`OpenAPI operationId is not governed: ${operationId}`);

  const metadata = {
    owner: operation.definition["x-kokoro-owner"],
    visibility: operation.definition["x-kokoro-visibility"],
    stability: operation.definition["x-kokoro-stability"],
    idempotency: operation.definition["x-kokoro-idempotency"],
    permission: operation.definition["x-kokoro-permission"],
  };
  if (metadata.owner !== "kokoro-system")
    throw new Error(`${operation.location} must be owned by kokoro-system`);
  if (metadata.visibility !== "internal-owner")
    throw new Error(`${operation.location} must be internal-owner`);
  if (metadata.stability !== "stable")
    throw new Error(`${operation.location} must have stable V1 governance`);
  if (metadata.idempotency !== expected.idempotency)
    throw new Error(`${operation.location} has incorrect idempotency metadata`);
  if (metadata.permission !== expected.permission)
    throw new Error(`${operation.location} has incorrect permission metadata`);
}

process.stdout.write(
  `verified OpenAPI contract (${String(pathNames.length)} paths, ${String(operations.length)} governed operations)\n`,
);
