import { readFileSync } from "node:fs";
import { buildSystemOpenApi } from "./generate-system-openapi.js";
import { systemOperations } from "./system-openapi-operations.js";
const expected = buildSystemOpenApi();
const actual = readFileSync("contract/openapi/system.openapi.json", "utf8");
if (actual !== `${JSON.stringify(expected, null, 2)}\n`)
  throw new Error("OpenAPI generated drift; run contract:generate:openapi");
const ids = new Set<string>();
for (const operation of systemOperations) {
  if (ids.has(operation.operationId))
    throw new Error(`Duplicate operation ID: ${operation.operationId}`);
  ids.add(operation.operationId);
  if (!operation.path.startsWith("/v1/system/"))
    throw new Error("Non-owner path");
  if (operation.mutation && !operation.permission.startsWith("system:"))
    throw new Error("Mutation has no permission");
  if (!operation.response) throw new Error("Untyped response");
}
console.log(
  `OpenAPI runtime schema drift and metadata verified: ${ids.size} business operations + 2 probes`,
);
