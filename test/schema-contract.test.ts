import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../database/schema.sql", import.meta.url),
  "utf8",
);

describe("system SQL contract", () => {
  it("uses PostgreSQL tenant scope and the repository database policy", () => {
    expect(sql).toContain("tenant_id TEXT");
    expect(sql).toContain("locale VARCHAR(32)");
    expect(sql).toContain("TIMESTAMPTZ(3)");
    expect(sql).not.toContain("TIMESTAMPTZ(6)");
    expect(sql).not.toMatch(/\bTIMESTAMP(?!TZ)/iu);
    expect(sql).toContain("CURRENT_TIMESTAMP(3)");
    expect(sql).toContain("JSONB");
    expect(sql).toContain("uq_system_product_key_active");
    expect(sql).toContain("uq_system_config_release_tenant_key");
    expect(sql).toContain("uq_system_release_binding_active");
    expect(sql).toContain(
      "ix_system_config_record_lookup ON system_config_record (tenant_id",
    );
    expect(sql).toContain("system_site_host");
    expect(sql).toContain("uq_system_site_host_active_hostname");
    expect(sql).not.toMatch(/FOREIGN KEY|\bREFERENCES\b/iu);
    expect(sql).not.toContain("system_site_tenant_id_uidx");
    expect(sql).toContain("uq_system_site_host_active_hostname");
    expect(sql).toContain("uq_system_workspace_tenant_site_key_active");
    expect(sql).toContain("uq_system_site_policy_active");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS system_site\s*\(/u);
    expect(sql).toMatch(/system_site\s*\([\s\S]*tenant_id TEXT NOT NULL/u);
  });
});
