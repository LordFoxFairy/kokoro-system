import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = new URL(
  "../contract/openapi/system.openapi.json",
  import.meta.url,
);

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
});
