import { describe, expect, it } from "vitest";

import { decodeRuntimeManifestCache } from "../src/infrastructure/redis/runtime-manifest-cache-decoder.js";
import { parseReleaseReceipt } from "../src/application/system/mappers/receipt-result.js";
import {
  mapConfig,
  mapPolicy,
  mapRelease,
  mapSite,
  mapSiteResolution,
  mapWorkspace,
} from "../src/infrastructure/repositories/system/mappers.js";

describe("boundary runtime decoders", () => {
  it("rejects malformed Redis runtime manifests", () => {
    expect(() => decodeRuntimeManifestCache("not-json")).toThrow(
      "runtime manifest cache entry is invalid",
    );
    expect(() =>
      decodeRuntimeManifestCache(
        JSON.stringify({
          tenantId: "tenant-a",
          productId: "product-a",
          locale: "en-US",
          navigation: "not-an-array",
          localeNamespaces: [],
          theme: {},
          featureFlags: [],
          references: [],
          configVersion: "1",
          releaseId: null,
          digest: "digest",
        }),
      ),
    ).toThrow("runtime manifest cache entry is invalid");
  });

  it("rejects malformed PostgreSQL enums and JSON records", () => {
    const row: Record<string, unknown> = {
      id: "site-a",
      tenant_id: "tenant-a",
      site_key: "site-a",
      hostnames_json: ["site.example.test"],
      display_name: "Site A",
      status: "corrupt",
      version: 1,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      updated_at: new Date("2026-01-01T00:00:00.000Z"),
    };
    expect(() => mapSite(row)).toThrow(
      "invalid PostgreSQL value for system_site.status",
    );
    expect(() => mapSite({ ...row, status: "active", hostnames_json: {} })).toThrow(
      "invalid PostgreSQL value for system_site.hostnames",
    );
  });

  it("rejects malformed PostgreSQL SiteService resolution values", () => {
    expect(() =>
      mapSiteResolution({
        id: "site-a",
        site_key: "site-a",
        hostname: "site.example.test",
        default_locale: "en-US",
        timezone: "UTC",
        version: "not-an-integer",
      }),
    ).toThrow("invalid PostgreSQL value for system_site.version");
  });

  it("preserves BIGINT control-plane values beyond Number.MAX_SAFE_INTEGER", () => {
    const version = "9007199254740993";
    const timestamp = new Date("2026-01-01T00:00:00.000Z");
    expect(
      mapSite({
        id: "site-a",
        tenant_id: "tenant-a",
        site_key: "site-a",
        hostnames_json: ["site.example.test"],
        display_name: "Site A",
        status: "active",
        version,
        created_at: timestamp,
        updated_at: timestamp,
      }).version,
    ).toBe(version);
    expect(
      mapSiteResolution({
        id: "site-a",
        site_key: "site-a",
        hostname: "site.example.test",
        default_locale: "en-US",
        timezone: "UTC",
        version,
      }).generation,
    ).toBe(version);
    expect(
      mapWorkspace({
        id: "workspace-a",
        tenant_id: "tenant-a",
        site_id: "site-a",
        workspace_key: "default",
        name: "Default",
        status: "active",
        version,
        created_at: timestamp,
        updated_at: timestamp,
      }).version,
    ).toBe(version);
    expect(
      mapPolicy({
        id: "policy-a",
        tenant_id: "tenant-a",
        site_id: "site-a",
        version,
        status: "active",
        default_locale: "en-US",
        allowed_locales_json: ["en-US"],
        allowed_products_json: ["admin"],
        public_manifest: false,
        updated_at: timestamp,
      }).version,
    ).toBe(version);
    expect(
      mapConfig({
        id: "config-a",
        tenant_id: "tenant-a",
        module_key: "theme",
        config_key: "default",
        scope_type: "tenant",
        scope_id: "tenant-a",
        product_id: null,
        locale: "en-US",
        value_json: {},
        schema_version: 1,
        status: "active",
        config_version: version,
        release_id: null,
        digest: "a".repeat(64),
        updated_at: timestamp,
      }).configVersion,
    ).toBe(version);
    expect(
      mapRelease({
        id: "release-a",
        tenant_id: "tenant-a",
        release_key: "r1",
        status: "draft",
        digest: "a".repeat(64),
        published_at: null,
        version,
        created_at: timestamp,
        updated_at: timestamp,
      }).version,
    ).toBe(version);
    expect(
      parseReleaseReceipt({
        id: "release-a",
        tenantId: "tenant-a",
        releaseKey: "r1",
        status: "draft",
        digest: "a".repeat(64),
        publishedAt: null,
        version,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
      }).version,
    ).toBe(version);
  });
});
