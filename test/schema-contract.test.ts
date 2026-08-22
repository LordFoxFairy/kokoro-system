import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../database/20-system.sql", import.meta.url), "utf8");

describe("system SQL contract", () => {
  it("uses tenant scope and the repository database policy", () => {
    expect(sql).toContain("tenant_id CHAR(36)");
    expect(sql).toContain("locale VARCHAR(32)");
    expect(sql).toContain("system_config_lookup_idx (tenant_id");
    expect(sql.toLowerCase()).not.toContain("foreign key");
    expect(sql.toLowerCase()).not.toMatch(/\bunique\s*\(/u);
  });
});
