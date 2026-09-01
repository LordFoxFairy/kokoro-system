import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../database/migrations/001_system.sql", import.meta.url), "utf8");

describe("system SQL contract", () => {
  it("uses PostgreSQL tenant scope and the repository database policy", () => {
    expect(sql).toContain("tenant_id UUID");
    expect(sql).toContain("locale VARCHAR(32)");
    expect(sql).toContain("TIMESTAMPTZ(6)");
    expect(sql).toContain("JSONB");
    expect(sql).toContain("system_config_lookup_idx ON system_config_record (tenant_id");
    expect(sql.toLowerCase()).not.toContain("foreign key");
    expect(sql.toLowerCase()).not.toMatch(/\bunique\s*\(/u);
  });
});
