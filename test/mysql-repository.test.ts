import { describe, expect, it } from "vitest";
import { MysqlSystemRepository } from "../src/modules/runtime-manifest/mysql-repository.js";
import type { SqlPool } from "../src/infrastructure/mysql/client.js";

describe("MysqlSystemRepository", () => {
  it("resolves surface, tenant, product, locale and release precedence deterministically", async () => {
    let released = false;
    const client = {
      query: async <Row>(sql: string): Promise<{ rows: readonly Row[]; affectedRows: number }> => {
        if (sql.includes("FROM system_release_binding")) return { rows: [{ release_id: "release-a" }] as Row[], affectedRows: 1 };
        released = true;
        return { rows: [
          { id: "global", module_key: "theme", scope_type: "global", scope_id: null, locale: null, value_json: JSON.stringify({ source: "global" }), config_version: 1, release_id: null, digest: "a" },
          { id: "product", module_key: "theme", scope_type: "product", scope_id: "product-a", locale: null, value_json: JSON.stringify({ source: "product" }), config_version: 2, release_id: null, digest: "b" },
          { id: "tenant", module_key: "theme", scope_type: "tenant", scope_id: "tenant-a", locale: "en-US", value_json: JSON.stringify({ source: "tenant" }), config_version: 3, release_id: null, digest: "c" },
          { id: "surface", module_key: "theme", scope_type: "surface", scope_id: "surface-a", locale: "en-US", value_json: JSON.stringify({ source: "surface" }), config_version: 4, release_id: "release-a", digest: "d" },
        ] as Row[], affectedRows: 4 };
      },
      release: () => undefined,
    };
    const pool = { connect: async () => client, ping: async () => undefined, close: async () => undefined } satisfies SqlPool;
    const result = await new MysqlSystemRepository(pool).getManifest({
      context: { tenantId: "tenant-a", actorId: null, organizationId: null, surfaceId: "surface-a", permissions: [], correlationId: "request-a" },
      productId: "product-a",
      locale: "en-US",
    });
    expect(released).toBe(true);
    expect(result.theme).toEqual({ source: "surface" });
    expect(result.tenantId).toBe("tenant-a");
    expect(result.releaseId).toBe("release-a");
  });
});
