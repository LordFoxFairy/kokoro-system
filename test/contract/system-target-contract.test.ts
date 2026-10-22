import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
import { StandardSchemaValidationPipe } from "@nestjs/common";
import { readFileSync, globSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  siteSchema,
  siteInputSchema,
} from "../../src/modules/sites/schemas/site.schema.js";
import { policyInputSchema } from "../../src/modules/sites/schemas/policy.schema.js";
import { featureInputSchema } from "../../src/modules/products/schemas/feature.schema.js";
import { configInputSchema } from "../../src/modules/products/schemas/config.schema.js";
import {
  providerInputSchema,
  providerUpdateSchema,
} from "../../src/modules/model-catalog/schemas/provider.schema.js";
import {
  revisionInputSchema,
  revisionContentSchema,
} from "../../src/modules/model-catalog/schemas/revision.schema.js";
import { connectionSchema } from "../../src/modules/model-catalog/schemas/connection.schema.js";
import {
  labelInputSchema,
  labelUpdateSchema,
} from "../../src/modules/model-catalog/schemas/label.schema.js";
import { commandDigest } from "../../src/database/command-digest.js";
import { resolveInputSchema } from "../../src/modules/model-catalog/schemas/resolve.schema.js";
import {
  requestIdSchema,
  errorEnvelopeSchema,
  envelopeSchema,
  probeSchema,
} from "../../src/http/protocol.schema.js";
import { systemOperations } from "../../scripts/system-openapi-operations.js";
import { buildSystemOpenApi } from "../../scripts/generate-system-openapi.js";

describe("complete System target contract (not runtime acceptance)", () => {
  it("accepts a write-only API key and rejects caller-chosen credential handles", () => {
    const input = {
      provider: "openai-compatible",
      provider_key: "shared-connection",
      display_name: "Shared connection",
      protocol: "openai_chat_completions",
      base_url: "https://models.example/v1",
      priority: 0,
      api_key: "opaque-test-api-key",
    };
    expect(providerInputSchema.safeParse(input).success).toBe(true);
    expect(
      providerInputSchema.safeParse({
        ...input,
        secret_handle_ref: "caller:chosen",
      }).success,
    ).toBe(false);
    for (const api_key of [
      "",
      "leading space",
      "line\nbreak",
      "a".repeat(4097),
    ])
      expect(providerInputSchema.safeParse({ ...input, api_key }).success).toBe(
        false,
      );
  });

  it("defaults optional business aliases and distinguishes clearing from an omitted patch", () => {
    const label = {
      label_key: "chat/fast",
      feature_key: "chat",
      default_revision_id: null,
    };
    expect(labelInputSchema.parse(label).display_name).toBeNull();
    expect(labelUpdateSchema.parse({ display_name: null })).toEqual({
      display_name: null,
    });
    expect(labelUpdateSchema.parse({ default_revision_id: null })).toEqual({
      default_revision_id: null,
    });
  });
  it("runs the pinned Nest 12 Standard Schema pipe against the same runtime schema", async () => {
    const pipe = new StandardSchemaValidationPipe();
    const metadata = { type: "body" as const, schema: resolveInputSchema };
    await expect(
      pipe.transform({ feature_key: "chat" }, metadata),
    ).resolves.toEqual({ feature_key: "chat" });
    await expect(
      pipe.transform({ feature_key: "chat", tenant_id: "forged" }, metadata),
    ).rejects.toThrow();
  });
  it("preserves BIGINT precision and independently fixes all scope metadata", () => {
    expect(
      siteSchema.shape.version.safeParse("900719925474099312345").success,
    ).toBe(true);
    expect(siteSchema.shape.version.safeParse(9007199254740992).success).toBe(
      false,
    );
    const document = buildSystemOpenApi();
    const operations = Object.entries(document.paths).flatMap(
      ([path, methods]) =>
        Object.entries(methods).map(([method, operation]) => ({
          path,
          method,
          operation: operation as Record<string, unknown>,
        })),
    );
    expect(operations).toHaveLength(88);
    const counts: Record<string, number> = {};
    const identities = new Set<string>();
    for (const item of systemOperations) {
      counts[item.module] = (counts[item.module] ?? 0) + 1;
      identities.add(`${item.method} ${item.path}`);
      if (item.method === "patch" || item.method === "delete")
        expect(item.cas).toBe("required");
      if (item.path.includes("/config")) expect(item.scope).toBe("conditional");
      if (item.scope === "global") expect(item.permission).toMatch(/^system:/u);
      if (item.method === "get") expect(item.mutation).toBe(false);
    }
    expect(counts).toEqual({
      sites: 11,
      workspaces: 6,
      products: 35,
      "runtime-manifests": 1,
      "model-catalog": 33,
    });
    expect(identities.size).toBe(86);
    for (const { path, method, operation } of operations) {
      expect(operation["x-kokoro-owner"]).toBe("kokoro-system");
      expect(operation["x-kokoro-visibility"]).toBe("internal-owner");
      expect(operation["x-kokoro-stability"]).toBe("stable");
      if (
        path.startsWith("/v1/") &&
        method !== "get" &&
        !path.endsWith("/resolve") &&
        !path.endsWith("/credentials/read")
      ) {
        expect(operation["x-kokoro-idempotency"]).toBe("required-key");
        expect(operation["x-kokoro-permission"]).toMatch(
          /^system:(write|publish)$/u,
        );
      }
    }
    expect(JSON.stringify(document)).not.toContain('"meta"');
    expect(JSON.stringify(document)).not.toContain('"x-kokoro-request-id"');
  });
  it("uses current header-only request ID and retryable error wire", () => {
    expect(requestIdSchema.safeParse("bff-request:abc_01").success).toBe(true);
    expect(requestIdSchema.safeParse("a\r\nb").success).toBe(false);
    expect(requestIdSchema.safeParse("x".repeat(129)).success).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({
        error: {
          code: "INVALID_ARGUMENT",
          message: "invalid",
          retryable: false,
        },
      }).success,
    ).toBe(true);
    expect(
      errorEnvelopeSchema.safeParse({
        error: { code: "INVALID_ARGUMENT", message: "invalid" },
      }).success,
    ).toBe(false);
    expect(
      envelopeSchema(probeSchema).safeParse({
        data: { service: "kokoro-system", status: "ok" },
        meta: { request_id: "bad" },
      }).success,
    ).toBe(false);
  });
  it("rejects self-reported tenant and oversized business keys", () => {
    const site = {
      site_key: "site",
      hostname: "example.test",
      display_name: "Example",
    };
    expect(siteInputSchema.safeParse(site).success).toBe(true);
    expect(
      siteInputSchema.safeParse({ ...site, tenant_id: "other" }).success,
    ).toBe(false);
    expect(
      siteInputSchema.safeParse({ ...site, site_key: "x".repeat(129) }).success,
    ).toBe(false);
  });
  it("validates policy default membership and structured feature outcomes", () => {
    expect(
      policyInputSchema.safeParse({
        default_locale: "en",
        allowed_locales: ["fr"],
        allowed_products: [],
        public_manifest: false,
      }).success,
    ).toBe(false);
    expect(
      featureInputSchema.safeParse({
        global_feature_key: "test",
        product_id: "not-uuid",
        display_name: "Test",
        result_contract: {},
      }).success,
    ).toBe(false);
  });
  it("rejects generic config bags and tenant injection into model resolution", () => {
    expect(
      configInputSchema.safeParse({ module_key: "anything", value: {} })
        .success,
    ).toBe(false);
    expect(
      resolveInputSchema.safeParse({
        label_key: "fast",
        feature_key: "chat",
        tenant_id: "other",
      }).success,
    ).toBe(false);
    expect(
      resolveInputSchema.safeParse({ label_key: "fast", feature_key: "chat" })
        .success,
    ).toBe(true);
  });
  it("validates scope matrix and only explicit tenant default routing", () => {
    const value = {
      module_key: "theme",
      config_key: "theme",
      scope_type: "global",
      scope_id: null,
      product_id: null,
      locale: null,
      schema_version: 1,
      release_id: null,
      value: { mode: "system", accent_color: "#112233", logo_asset_id: null },
    };
    expect(configInputSchema.safeParse(value).success).toBe(true);
    expect(
      configInputSchema.safeParse({
        ...value,
        release_id: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
    // A PATCH array may match another registered module, but stored theme revalidation must reject it as INVALID_CONFIG_SCHEMA.
    expect(configInputSchema.safeParse({ ...value, value: [] }).success).toBe(
      false,
    );
    expect(
      configInputSchema.safeParse({ ...value, scope_id: "tenant" }).success,
    ).toBe(false);
    expect(
      configInputSchema.safeParse({
        ...value,
        scope_type: "surface",
        scope_id: "web",
      }).success,
    ).toBe(false);
    expect(resolveInputSchema.safeParse({ feature_key: "chat" }).success).toBe(
      true,
    );
  });
  it("generates all five business surfaces and preserves old control paths", () => {
    const doc = buildSystemOpenApi();
    for (const path of [
      "sites",
      "workspaces",
      "config",
      "releases",
      "runtime-manifest",
      "products",
      "applications",
      "features",
      "release-bindings",
      "model-catalog/catalog",
      "model-catalog/resolve",
    ])
      expect(doc.paths).toHaveProperty(`/v1/system/${path}`);
    expect(doc.paths).toHaveProperty("/v1/system/sites/{site_id}/policy");
    for (const transition of ["validate", "publish", "retire"])
      expect(doc.paths).toHaveProperty(
        `/v1/system/releases/{release_id}/${transition}`,
      );
    expect(JSON.stringify(doc)).not.toContain('/v1/resolve"');
    expect(JSON.stringify(doc)).toContain('"site_id"');
    expect(readFileSync("contract/openapi/system.openapi.json", "utf8")).toBe(
      `${JSON.stringify(doc, null, 2)}\n`,
    );
  });
  it("preserves the 6.0 write-only credential boundary alongside explicit discovery", () => {
    const artifact = JSON.parse(
      readFileSync("contract/openapi/system.openapi.json", "utf8"),
    ) as {
      info: { version: string };
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    expect(artifact.info.version).toBe("6.1.0");
    expect(systemOperations).toHaveLength(86);
    expect(
      Object.values(artifact.paths).flatMap((methods) => Object.keys(methods)),
    ).toHaveLength(88);
    const findResolveShape = (
      value: unknown,
    ):
      | { properties: Record<string, unknown>; required: unknown }
      | undefined => {
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = findResolveShape(item);
          if (found) return found;
        }
        return undefined;
      }
      const object = z.record(z.string(), z.unknown()).safeParse(value);
      if (!object.success) return undefined;
      const properties = z
        .record(z.string(), z.unknown())
        .safeParse(object.data["properties"]);
      if (
        properties.success &&
        "revision_id" in properties.data &&
        "connection" in properties.data
      )
        return {
          properties: properties.data,
          required: object.data["required"],
        };
      for (const child of Object.values(object.data)) {
        const found = findResolveShape(child);
        if (found) return found;
      }
      return undefined;
    };
    const resolveShape = findResolveShape(artifact);
    expect(resolveShape?.properties?.["context_window"]).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 2147483647,
    });
    expect(resolveShape?.properties?.["max_output_tokens"]).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 2147483647,
    });
    expect(resolveShape?.required).toEqual(
      expect.arrayContaining(["context_window", "max_output_tokens"]),
    );
  });
  it("describes the implemented 6.1 owner routes without claiming consumer validation", () => {
    const artifact = z
      .object({
        info: z.object({ version: z.string(), description: z.string() }),
      })
      .parse(
        JSON.parse(
          readFileSync("contract/openapi/system.openapi.json", "utf8"),
        ),
      );
    expect(artifact.info.version).toBe("6.1.0");
    expect(artifact.info.description.length).toBeGreaterThan(0);
    expect(artifact.info.description).not.toMatch(
      /target|not implemented|consumer.*(?:verified|validated)/iu,
    );
  });
  it("records the Agent consumer as requiring the protected credential contract pin", () => {
    const provenance = z
      .object({
        releaseClassification: z.object({
          contractVersion: z.string(),
          baseline: z.string(),
        }),
        consumers: z.array(
          z.object({
            consumer: z.string(),
            surface: z.string(),
            disposition: z.string(),
          }),
        ),
      })
      .parse(JSON.parse(readFileSync("contract/provenance.json", "utf8")));
    expect(provenance.releaseClassification).toMatchObject({
      contractVersion: "6.1.0",
      baseline: "6.0.0",
    });
    expect(
      provenance.consumers.filter(
        ({ consumer }) => consumer === "kokoro-agent",
      ),
    ).toEqual([
      {
        consumer: "kokoro-agent",
        surface: "model-catalog/resolve",
        disposition: "6.0.0-pin-required-before-runtime-consumption",
      },
    ]);
  });
  it("publishes the exact OpenAPI and provenance digests in the contract README", () => {
    const sha256 = (path: string): string =>
      createHash("sha256").update(readFileSync(path)).digest("hex");
    const readme = readFileSync("contract/README.md", "utf8");
    expect(readme).toContain(
      `artifact SHA256 \`${sha256("contract/openapi/system.openapi.json")}\``,
    );
    expect(readme).toContain(
      `provenance SHA256 \`${sha256("contract/provenance.json")}\``,
    );
  });
  it("has one SQL authority with useful resources and no phantom profile/audit", () => {
    const sql = readFileSync("database/schema.sql", "utf8");
    for (const table of [
      "system_application",
      "system_feature_definition",
      "system_app_feature_exposure",
      "system_presentation",
      "model_definition",
      "model_provider",
      "model_label",
      "model_revision",
      "model_routing_policy",
      "model_provider_health_state",
    ])
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table} (`);
    expect(sql).not.toMatch(
      /CREATE TABLE IF NOT EXISTS system_(product_profile|audit_event)/u,
    );
    expect(sql).not.toMatch(/\b(?:FOREIGN KEY|REFERENCES)\b/u);
    expect(sql).toContain("uq_system_config_record_identity");
    expect(sql).toContain("uq_model_revision_number");
  });
  it("tracks every HTTP wire schema but excludes internal Redis cache representation", () => {
    const provenance = z
      .object({
        openapi: z.object({ sourceSha256: z.record(z.string(), z.string()) }),
      })
      .parse(JSON.parse(readFileSync("contract/provenance.json", "utf8")));
    const expected = [
      ...globSync("src/modules/*/schemas/**/*.schema.ts"),
      "src/modules/products/products.public.ts",
      "src/http/protocol.schema.ts",
      "src/access/access.guard.ts",
      "scripts/generate-system-openapi.ts",
      "scripts/system-openapi-operations.ts",
    ].sort();
    expect(expected).toHaveLength(23);
    expect(
      expected.filter((path) => !path.endsWith("products.public.ts")),
    ).toHaveLength(22);
    expect(Object.keys(provenance.openapi.sourceSha256).sort()).toEqual(
      expected,
    );
    expect(
      existsSync("src/modules/model-catalog/resolve-cache.schema.ts"),
    ).toBe(true);
    expect(provenance.openapi.sourceSha256).not.toHaveProperty(
      "src/modules/model-catalog/resolve-cache.schema.ts",
    );
    expect(
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "scripts/update-system-openapi-provenance.ts",
          "--check",
        ],
        { encoding: "utf8" },
      ),
    ).toContain("23 sources");
  });
});

describe("versioned direct and optional LiteLLM connections", () => {
  const connection = {
    protocol: "openai_chat_completions",
    connection_type: "direct",
    base_url: "https://model.example/v1",
    secret_handle_ref: "vault:account-a",
  };
  const provider = {
    provider: "vendor",
    provider_key: "account-a",
    display_name: "A",
    priority: 1,
    ...connection,
    api_key: "fixture-provider-key",
  };
  const providerInput = (() => {
    const { secret_handle_ref, ...input } = provider;
    void secret_handle_ref;
    return input;
  })();
  it("defaults creation to direct, keeps LiteLLM explicit, and rejects technical patches", () => {
    const { connection_type, ...implicit } = providerInput;
    expect(connection_type).toBe("direct");
    expect(providerInputSchema.parse(implicit).connection_type).toBe("direct");
    const doc = buildSystemOpenApi();
    const schemas = doc.components["schemas"] as Record<
      string,
      { required: string[] }
    >;
    const post = doc.paths["/v1/system/model-catalog/providers"]!["post"] as {
      requestBody: {
        content: { "application/json": { schema: { $ref: string } } };
      };
    };
    const ref = post.requestBody.content["application/json"].schema.$ref
      .split("/")
      .at(-1)!;
    expect(schemas[ref]!.required).not.toContain("connection_type");
    expect(schemas[ref]!.required).toEqual(
      expect.arrayContaining(["protocol", "base_url", "api_key"]),
    );

    expect(
      providerInputSchema.parse({
        ...providerInput,
        connection_type: "litellm",
      }).connection_type,
    ).toBe("litellm");
    expect(
      providerUpdateSchema.parse({ display_name: "B", priority: 2 }),
    ).toEqual({ display_name: "B", priority: 2 });
    for (const field of [
      "protocol",
      "connection_type",
      "base_url",
      "secret_handle_ref",
      "provider",
      "provider_key",
    ]) {
      expect(
        providerUpdateSchema.safeParse({
          [field]: provider[field as keyof typeof provider],
        }).success,
      ).toBe(false);
    }
    expect(
      providerInputSchema.safeParse({ ...provider, transport: "litellm" })
        .success,
    ).toBe(false);
  });
  it("accepts exact API prefixes and only structurally explicit loopback HTTP; rejects ambiguous URLs", () => {
    for (const base_url of [
      "https://model.example/custom/v1",
      "https://model.example/v1/",
      "http://127.0.0.1:1234/v1",
      "http://[::1]:1234/api",
      "http://localhost:1234",
    ]) {
      expect(connectionSchema.parse({ ...connection, base_url }).base_url).toBe(
        base_url,
      );
    }
    for (const base_url of [
      "http://model.example/v1",
      "https://user:pass@model.example/v1",
      "https://model.example/v1?key=x",
      "https://model.example/v1?",
      "https://model.example/v1#",
      "https://model.example/a/../v1",
      "https://model.example/a%2fb",
      "https://MODEL.example/v1",
      "https://model.example/v1\\other",
      " https://model.example/v1",
      "https://model.example./v1",
      "http://127.1/v1",
    ]) {
      expect(
        connectionSchema.safeParse({ ...connection, base_url }).success,
        base_url,
      ).toBe(false);
    }
  });
  it("keeps external revision input separate from the digest-covered owner snapshot", () => {
    const input = {
      model_id: "10000000-0000-4000-8000-000000000001",
      provider_id: "10000000-0000-4000-8000-000000000002",
      revision: 1,
      provider_model_name: "declared-vendor-model",
      request_model: "request-model",
      display_name: "A",
      input_modalities: ["text"],
      output_modalities: ["text"],
      context_window: 8192,
      max_output_tokens: 2048,
      priority: 1,
    };
    expect(revisionInputSchema.safeParse(input).success).toBe(true);
    expect(
      revisionInputSchema.safeParse({ ...input, feature_key: "chat" }).success,
    ).toBe(false);
    expect(
      revisionInputSchema.safeParse({ ...input, connection }).success,
    ).toBe(false);
    expect(
      revisionInputSchema.safeParse({ ...input, gateway_model_name: "old" })
        .success,
    ).toBe(false);
    const content = revisionContentSchema.parse({ ...input, connection });
    const digest = commandDigest(content);
    for (const patch of [
      { base_url: "https://other.example/v1" },
      { secret_handle_ref: "vault:account-b" },
      { connection_type: "litellm" },
    ]) {
      expect(
        commandDigest({ ...content, connection: { ...connection, ...patch } }),
      ).not.toBe(digest);
    }
    expect(commandDigest({ ...content, request_model: "other" })).not.toBe(
      digest,
    );
  });
});
