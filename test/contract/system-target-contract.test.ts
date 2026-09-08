import { StandardSchemaValidationPipe } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  siteSchema,
  siteInputSchema,
} from "../../src/modules/sites/schemas/site.schema.js";
import { policyInputSchema } from "../../src/modules/sites/schemas/policy.schema.js";
import { featureInputSchema } from "../../src/modules/products/schemas/feature.schema.js";
import { configInputSchema } from "../../src/modules/products/schemas/config.schema.js";
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
    expect(operations).toHaveLength(85);
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
      "model-catalog": 30,
    });
    expect(identities.size).toBe(83);
    for (const { path, method, operation } of operations) {
      expect(operation["x-kokoro-owner"]).toBe("kokoro-system");
      expect(operation["x-kokoro-visibility"]).toBe("internal-owner");
      expect(operation["x-kokoro-stability"]).toBe("stable");
      if (
        path.startsWith("/v1/") &&
        method !== "get" &&
        !path.endsWith("/resolve")
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
});
