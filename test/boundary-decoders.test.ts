import { describe, expect, it } from "vitest";

import { decodeRuntimeManifestCache } from "../src/infrastructure/redis/runtime-manifest-cache-decoder.js";
import {
  mapSite,
  mapSiteResolution,
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
});
