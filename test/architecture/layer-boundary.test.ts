import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const source = (relative: string): string => readFileSync(resolve(root, relative), "utf8");

describe("System layer architecture", () => {
  it("keeps domain/application independent from infrastructure", () => {
    const domainFiles = readdirSync(resolve(root, "src/modules/system/domain")).filter((name) => name.endsWith(".ts"));
    const applicationFiles = readdirSync(resolve(root, "src/modules/system/application")).filter((name) => name.endsWith(".ts"));
    for (const file of domainFiles) expect(source(`src/modules/system/domain/${file}`)).not.toMatch(/infrastructure|node:/u);
    for (const file of applicationFiles) expect(source(`src/modules/system/application/${file}`)).not.toContain("infrastructure/");
  });

  it("keeps DTOs, ports, service and persistence adapters in explicit locations", () => {
    expect(existsSync(resolve(root, "src/modules/system/application/dto.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/modules/system/application/ports.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/modules/system/application/service.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/infrastructure/postgres/repositories/system-control-repository.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/infrastructure/persistence/in-memory-system-control-repository.ts"))).toBe(true);
    expect(existsSync(resolve(root, "src/modules/system/model.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/modules/system/service.ts"))).toBe(false);
    expect(existsSync(resolve(root, "src/infrastructure/postgres/postgres-control-repository.ts"))).toBe(false);
  });
});
