import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSystemOpenApi } from "../../scripts/generate-system-openapi.js";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
describe("System 6.1 additive discovery release", () => {
  it("preserves every prior operation and schema exactly against the frozen 6.0 artifact", () => {
    const baseline = JSON.parse(
      readFileSync("test/fixtures/system6-contract-baseline.json", "utf8"),
    ) as {
      operations: Record<string, string>;
      schemas: Record<string, string>;
    };
    const document = buildSystemOpenApi();
    expect(Object.keys(baseline.operations)).toHaveLength(87);
    for (const [key, expected] of Object.entries(baseline.operations)) {
      const [method, path] = key.split(" ");
      expect(hash(document.paths[path!]![method!]), key).toBe(expected);
    }
    const schemas = document.components.schemas as Record<string, unknown>;
    for (const [key, expected] of Object.entries(baseline.schemas))
      expect(hash(schemas[key]), key).toBe(expected);
  });
  it("publishes only the two management identities and required trusted context for this no-store read", () => {
    const document = buildSystemOpenApi();
    const operation = document.paths[
      "/v1/system/model-catalog/providers/{provider_id}/upstream-models"
    ]!.get as {
      parameters: {
        name: string;
        required: boolean;
        schema: { enum?: string[] };
      }[];
      responses: Record<string, { headers: Record<string, unknown> }>;
    };
    expect(
      operation.parameters.find(
        (parameter) => parameter.name === "x-kokoro-service",
      )?.schema.enum,
    ).toEqual(["model-management", "system-admin"]);
    for (const name of ["x-kokoro-actor-id", "x-kokoro-tenant-id"])
      expect(
        operation.parameters.find((parameter) => parameter.name === name)
          ?.required,
      ).toBe(true);
    expect(operation.responses["200"]?.headers).toHaveProperty("Cache-Control");
  });
});
