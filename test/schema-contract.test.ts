import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8");

describe("system SQL contract", () => {
  it("uses PostgreSQL tenant scope and the repository database policy", () => {
    expect(sql).toContain("tenant_id TEXT");
    expect(sql).toContain("locale VARCHAR(32)");
    expect(sql).toContain("TIMESTAMPTZ(6)");
    expect(sql).toContain("JSONB");
    expect(sql).toContain("system_config_lookup_idx ON system_config_record (tenant_id");
    expect(sql).toContain("system_site_host");
    expect(sql).toContain("system_site_host_active_hostname_uidx");
    expect(sql).not.toMatch(/FOREIGN KEY|\bREFERENCES\b/iu);
    expect(sql).not.toContain("system_site_tenant_id_uidx");
    expect(sql).toContain("system_site_host_active_hostname_uidx");
    expect(sql).toContain("system_workspace_tenant_site_key_active_uidx");
    expect(sql).toContain("system_site_policy_active_uidx");
  });
});
