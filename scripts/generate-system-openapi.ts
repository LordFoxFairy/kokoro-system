import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  envelopeSchema,
  errorEnvelopeSchema,
  probeSchema,
  requestIdSchema,
} from "../src/http/protocol.schema.js";
import { systemOperations } from "./system-openapi-operations.js";

type JsonObject = Record<string, unknown>;
function json(schema: z.ZodType): JsonObject {
  const result = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "throw",
  });
  delete result.$schema;
  return result;
}
function parameter(
  name: string,
  location: string,
  required: boolean,
  schema: JsonObject,
): JsonObject {
  return { name, in: location, required, schema };
}
const requestIdHeader = {
  "x-request-id": {
    required: true,
    schema: json(requestIdSchema),
  },
};
function component(schema: z.ZodType, schemas: JsonObject): JsonObject {
  const value = json(schema);
  const key = `schema_${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16)}`;
  schemas[key] = value;
  return { $ref: `#/components/schemas/${key}` };
}
function response(schema: z.ZodType, schemas: JsonObject): JsonObject {
  return {
    description: "Success",
    headers: requestIdHeader,
    content: {
      "application/json": {
        schema: component(envelopeSchema(schema), schemas),
      },
    },
  };
}
export function buildSystemOpenApi(): Readonly<{
  openapi: string;
  info: JsonObject;
  servers: readonly JsonObject[];
  paths: Record<string, JsonObject>;
  components: JsonObject;
}> {
  const paths: Record<string, JsonObject> = {};
  const schemas: JsonObject = {};
  const error = {
    description:
      "Stable owner error; retryable only for transient dependency/availability failure",
    headers: requestIdHeader,
    content: {
      "application/json": {
        schema: json(errorEnvelopeSchema),
      },
    },
  };
  for (const operation of systemOperations) {
    const parameters: JsonObject[] = [
      parameter("x-kokoro-service", "header", true, {
        type: "string",
        enum: ["web-bff", "kokoro-agent", "system-admin"],
      }),
      parameter("x-kokoro-tenant-id", "header", operation.scope === "tenant", {
        type: "string",
        minLength: 1,
        maxLength: 160,
      }),
      parameter("x-kokoro-actor-id", "header", operation.mutation, {
        type: "string",
        minLength: 1,
        maxLength: 160,
      }),
      parameter(
        "x-kokoro-iam-permissions",
        "header",
        operation.permission.startsWith("system:"),
        { type: "string", maxLength: 160 },
      ),
      parameter("x-request-id", "header", false, json(requestIdSchema)),
      parameter("x-kokoro-trace-id", "header", false, {
        type: "string",
        maxLength: 160,
      }),
    ];
    if (operation.path.endsWith("runtime-manifest")) {
      parameters.push(
        parameter("Forwarded", "header", false, {
          type: "string",
          maxLength: 2048,
        }),
      );
      parameters.push(
        parameter("Host", "header", false, { type: "string", maxLength: 255 }),
      );
    }
    for (const match of operation.path.matchAll(/\{([^}]+)\}/gu))
      parameters.push(
        parameter(match[1] ?? "id", "path", true, {
          type: "string",
          format: "uuid",
        }),
      );
    if (operation.mutation)
      parameters.push(
        parameter("Idempotency-Key", "header", true, {
          type: "string",
          minLength: 1,
          maxLength: 128,
        }),
      );
    if (operation.cas !== "none")
      parameters.push(
        parameter("If-Match", "header", operation.cas === "required", {
          type: "string",
          pattern: '^"[1-9][0-9]*"$',
        }),
      );
    if (operation.cas === "upsert")
      parameters.push(
        parameter("If-None-Match", "header", false, {
          type: "string",
          const: "*",
        }),
      );
    if (operation.query) {
      const query = json(operation.query);
      const properties = query.properties as Record<string, JsonObject>;
      const required = (query.required ?? []) as string[];
      for (const [name, schema] of Object.entries(properties))
        parameters.push(
          parameter(name, "query", required.includes(name), schema),
        );
    }
    const responses: JsonObject = {
      [String(operation.status)]: response(operation.response, schemas),
    };
    const errorStatuses = [400, 403, 404, 503];
    if (operation.mutation) errorStatuses.push(409);
    if (operation.cas !== "none") errorStatuses.push(428);
    for (const status of errorStatuses)
      responses[String(status)] = { $ref: "#/components/responses/OwnerError" };
    const item: JsonObject = {
      operationId: operation.operationId,
      tags: [operation.module],
      summary: operation.operationId,
      "x-kokoro-owner": "kokoro-system",
      "x-kokoro-visibility": "internal-owner",
      "x-kokoro-stability": "stable",
      "x-kokoro-idempotency": operation.mutation ? "required-key" : "inherent",
      "x-kokoro-permission": operation.permission,
      "x-kokoro-scope": operation.scope,
      description:
        operation.scope === "conditional"
          ? "Config POST uses body.scope_type; other Config operations use query.scope (default tenant). Global scope requires authenticated system-admin, ignores tenant header and writes no tenant identity. Tenant scope requires trusted tenant header. Global Config has no release."
          : `${operation.scope} scope; global requires authenticated system-admin`,
      "x-kokoro-precondition": operation.cas,
      security: [{ serviceBearer: [] }, { serviceSecret: [] }],
      parameters,
      responses,
    };
    if (operation.body)
      item.requestBody = {
        required: true,
        content: {
          "application/json": { schema: component(operation.body, schemas) },
        },
      };
    paths[operation.path] ??= {};
    paths[operation.path]![operation.method] = item;
  }
  for (const probe of ["healthz", "readyz"])
    paths[`/${probe}`] = {
      get: {
        operationId: probe,
        summary: probe,
        "x-kokoro-owner": "kokoro-system",
        "x-kokoro-visibility": "internal-owner",
        "x-kokoro-stability": "stable",
        "x-kokoro-idempotency": "not-applicable",
        "x-kokoro-permission": "none",
        security: [],
        responses: {
          "200": response(probeSchema, schemas),
          "503": { $ref: "#/components/responses/OwnerError" },
        },
      },
    };
  return {
    openapi: "3.1.0",
    servers: [{ url: "/", description: "Same internal-owner origin" }],
    info: {
      title: "Kokoro System internal owner",
      version: "2.0.0",
      "x-kokoro-release-classification": "v1-fresh-cutover",
      description:
        "Generated from runtime Zod schemas; G1 target artifact, not implemented routes.",
    },
    paths,
    components: {
      schemas,
      responses: { OwnerError: error },
      securitySchemes: {
        serviceBearer: { type: "http", scheme: "bearer" },
        serviceSecret: {
          type: "apiKey",
          in: "header",
          name: "x-kokoro-internal-secret",
        },
      },
    },
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  writeFileSync(
    "contract/openapi/system.openapi.json",
    `${JSON.stringify(buildSystemOpenApi(), null, 2)}\n`,
  );
