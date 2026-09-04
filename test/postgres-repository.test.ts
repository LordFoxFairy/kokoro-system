import { describe, expect, it } from "vitest";
import { PostgresSystemRepository } from "../src/infrastructure/repositories/runtime-manifest/postgres-system.repository.js";
import type { SqlPool } from "../src/infrastructure/persistence/postgres/client.js";

describe("PostgresSystemRepository", () => {
  it("resolves surface, tenant, product, locale and release precedence deterministically", async () => {
    let released = false;
    const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
    const client = {
      query: async <Row>(
        sql: string,
        values: readonly unknown[] = [],
      ): Promise<{ rows: readonly Row[]; affectedRows: number }> => {
        queries.push({ sql, values });
        if (sql.includes("FROM system_product"))
          return {
            rows: [{ id: "product-uuid", product_key: "product-a" }] as Row[],
            affectedRows: 1,
          };
        if (sql.includes("FROM system_release_binding"))
          return {
            rows: [{ release_id: "release-a" }] as Row[],
            affectedRows: 1,
          };
        released = true;
        return {
          rows: [
            {
              id: "global",
              module_key: "theme",
              config_key: "theme",
              scope_type: "global",
              scope_id: null,
              locale: null,
              value_json: JSON.stringify({ source: "global" }),
              config_version: 1,
              release_id: null,
              digest: "a",
            },
            {
              id: "product",
              module_key: "theme",
              config_key: "theme",
              scope_type: "product",
              scope_id: "product-a",
              locale: null,
              value_json: JSON.stringify({ source: "product" }),
              config_version: 2,
              release_id: null,
              digest: "b",
            },
            {
              id: "tenant",
              module_key: "theme",
              config_key: "theme",
              scope_type: "tenant",
              scope_id: "tenant-a",
              locale: "en-US",
              value_json: JSON.stringify({ source: "tenant" }),
              config_version: 3,
              release_id: null,
              digest: "c",
            },
            {
              id: "surface",
              module_key: "theme",
              config_key: "theme",
              scope_type: "surface",
              scope_id: "surface-a",
              locale: "en-US",
              value_json: JSON.stringify({ source: "surface" }),
              config_version: 4,
              release_id: "release-a",
              digest: "d",
            },
          ] as Row[],
          affectedRows: 4,
        };
      },
      release: () => undefined,
    };
    const pool = {
      connect: async () => client,
      ping: async () => undefined,
      close: async () => undefined,
    } satisfies SqlPool;
    const result = await new PostgresSystemRepository(pool).getManifest({
      context: {
        tenantId: "tenant-a",
        actorId: null,
        organizationId: null,
        surfaceId: "surface-a",
        permissions: [],
        correlationId: "request-a",
      },
      productId: "product-a",
      locale: "en-US",
    });
    expect(released).toBe(true);
    expect(result.theme).toEqual({ source: "surface" });
    expect(result.tenantId).toBe("tenant-a");
    expect(result.releaseId).toBe("release-a");
    expect(queries.every(({ sql }) => !sql.includes("?"))).toBe(true);
    expect(
      queries.every(
        ({ sql }) => !/\b(SELECT|INSERT|UPDATE|DELETE)\b[^$]*\?/iu.test(sql),
      ),
    ).toBe(true);
    expect(
      queries.find(({ sql }) => sql.includes("FROM system_release_binding"))
        ?.values,
    ).toEqual(["tenant-a", "product-uuid"]);
    const bindingQuery = queries.find(({ sql }) =>
      sql.includes("FROM system_release_binding"),
    )?.sql;
    expect(bindingQuery).toContain("JOIN system_config_release");
    expect(bindingQuery).toContain("release.tenant_id = $1");
    expect(bindingQuery).toContain("release.status = 'published'");
    expect(
      queries.find(({ sql }) => sql.includes("FROM system_config_record"))
        ?.values,
    ).toContain("product-uuid");
  });

  it("accepts a v1 product key without sending it to UUID columns", async () => {
    const client = {
      query: async <Row>(
        sql: string,
      ): Promise<{ rows: readonly Row[]; affectedRows: number }> => {
        if (sql.includes("FROM system_product"))
          return { rows: [] as Row[], affectedRows: 0 };
        throw new Error(`unexpected product-dependent query: ${sql}`);
      },
      release: () => undefined,
    };
    const pool = {
      connect: async () => client,
      ping: async () => undefined,
      close: async () => undefined,
    } satisfies SqlPool;
    await expect(
      new PostgresSystemRepository(pool).getManifest({
        context: {
          tenantId: "tenant-a",
          actorId: null,
          organizationId: null,
          surfaceId: "surface-a",
          permissions: [],
          correlationId: "request-a",
        },
        productId: "kokoro",
        locale: "en-US",
      }),
    ).resolves.toMatchObject({
      tenantId: "tenant-a",
      productId: "kokoro",
      locale: "en-US",
      navigation: [],
      localeNamespaces: [],
      theme: {},
      featureFlags: [],
      references: [],
      configVersion: "0",
      releaseId: null,
    });
  });

  it.each([
    { label: "draft", tenantId: "tenant-a", status: "draft" },
    { label: "retired", tenantId: "tenant-a", status: "retired" },
    { label: "foreign tenant", tenantId: "tenant-b", status: "published" },
  ])("fails closed for a $label release binding", async (release) => {
    const client = {
      query: async <Row>(
        sql: string,
      ): Promise<{ rows: readonly Row[]; affectedRows: number }> => {
        if (sql.includes("FROM system_product"))
          return {
            rows: [{ id: "product-uuid" }] as Row[],
            affectedRows: 1,
          };
        if (sql.includes("FROM system_release_binding")) {
          const enforcesTenant = sql.includes("release.tenant_id = $1");
          const enforcesPublished = sql.includes("release.status = 'published'");
          const visible =
            (!enforcesTenant || release.tenantId === "tenant-a") &&
            (!enforcesPublished || release.status === "published");
          return {
            rows: visible ? ([{ release_id: "release-a" }] as Row[]) : [],
            affectedRows: visible ? 1 : 0,
          };
        }
        return { rows: [] as Row[], affectedRows: 0 };
      },
      release: () => undefined,
    };
    const pool = {
      connect: async () => client,
      ping: async () => undefined,
      close: async () => undefined,
    } satisfies SqlPool;

    await expect(
      new PostgresSystemRepository(pool).getManifest({
        context: {
          tenantId: "tenant-a",
          actorId: null,
          organizationId: null,
          surfaceId: null,
          permissions: [],
          correlationId: "request-a",
        },
        productId: "product-a",
        locale: "en-US",
      }),
    ).resolves.toMatchObject({ releaseId: null, configVersion: "0" });
  });

  it("reports the greatest config_version using BIGINT numeric ordering", async () => {
    const client = {
      query: async <Row>(
        sql: string,
      ): Promise<{ rows: readonly Row[]; affectedRows: number }> => {
        if (sql.includes("FROM system_product"))
          return {
            rows: [{ id: "product-uuid" }] as Row[],
            affectedRows: 1,
          };
        if (sql.includes("FROM system_release_binding"))
          return { rows: [] as Row[], affectedRows: 0 };
        return {
          rows: [
            {
              id: "version-nine",
              module_key: "navigation",
              config_key: "nine",
              scope_type: "global",
              scope_id: null,
              locale: null,
              value_json: [],
              config_version: "9",
              release_id: null,
              digest: "a",
            },
            {
              id: "version-ten",
              module_key: "navigation",
              config_key: "ten",
              scope_type: "global",
              scope_id: null,
              locale: null,
              value_json: [],
              config_version: "10",
              release_id: null,
              digest: "b",
            },
          ] as Row[],
          affectedRows: 2,
        };
      },
      release: () => undefined,
    };
    const pool = {
      connect: async () => client,
      ping: async () => undefined,
      close: async () => undefined,
    } satisfies SqlPool;

    await expect(
      new PostgresSystemRepository(pool).getManifest({
        context: {
          tenantId: "tenant-a",
          actorId: null,
          organizationId: null,
          surfaceId: null,
          permissions: [],
          correlationId: "request-a",
        },
        productId: "product-a",
        locale: "en-US",
      }),
    ).resolves.toMatchObject({ configVersion: "10" });
  });
});
