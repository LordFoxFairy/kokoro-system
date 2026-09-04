import { describe, expect, it } from "vitest";
import { PostgresConfigRepository } from "../src/infrastructure/repositories/system/config-repository.js";
import type { SqlPool } from "../src/infrastructure/persistence/postgres/client.js";

const context = {
  tenantId: "tenant-a",
  actorId: "00000000-0000-4000-8000-000000000001",
  organizationId: null,
  surfaceId: null,
  permissions: ["system:write"],
  correlationId: "request-a",
} as const;

const input = (releaseId: string) => ({
  moduleKey: "theme",
  configKey: "default",
  scopeType: "tenant" as const,
  scopeId: "tenant-a",
  productId: null,
  locale: "en-US",
  value: { mode: "dark" },
  schemaVersion: 1,
  releaseId,
});

function poolForRelease(
  status: "draft" | "validated" | "published" | "retired",
  owner = "tenant-a",
): Readonly<{
  pool: SqlPool;
  queries: Array<{ sql: string; values: readonly unknown[] }>;
}> {
  const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
  const client = {
    query: async <Row>(
      sql: string,
      values: readonly unknown[] = [],
    ): Promise<{ rows: readonly Row[]; affectedRows: number }> => {
      queries.push({ sql, values });
      if (sql.includes("FROM system_config_release")) {
        const visible = values[1] === owner;
        return {
          rows: visible ? ([{ status }] as Row[]) : [],
          affectedRows: visible ? 1 : 0,
        };
      }
      return { rows: [] as Row[], affectedRows: 1 };
    },
    release: () => undefined,
  };
  return {
    pool: {
      connect: async () => client,
      ping: async () => undefined,
      close: async () => undefined,
    },
    queries,
  };
}

describe("PostgresConfigRepository release guard", () => {
  it.each(["draft", "validated"] as const)(
    "locks and accepts a same-tenant %s release",
    async (status) => {
      const fixture = poolForRelease(status);
      await expect(
        new PostgresConfigRepository(fixture.pool).upsert(
          context,
          input("00000000-0000-4000-8000-000000000010"),
        ),
      ).resolves.toMatchObject({ configVersion: "1" });
      const releaseQuery = fixture.queries.find(({ sql }) =>
        sql.includes("FROM system_config_release"),
      );
      expect(releaseQuery?.sql).toContain("FOR UPDATE");
      expect(releaseQuery?.values).toEqual([
        "00000000-0000-4000-8000-000000000010",
        "tenant-a",
      ]);
    },
  );

  it.each(["published", "retired"] as const)(
    "rejects a %s release before writing config",
    async (status) => {
      const fixture = poolForRelease(status);
      await expect(
        new PostgresConfigRepository(fixture.pool).upsert(
          context,
          input("00000000-0000-4000-8000-000000000010"),
        ),
      ).rejects.toMatchObject({
        code: "INVALID_STATE",
        status: 400,
        message: "release is not writable",
      });
      expect(
        fixture.queries.some(
          ({ sql }) =>
            sql.startsWith("INSERT INTO system_config_record") ||
            sql.startsWith("UPDATE system_config_record"),
        ),
      ).toBe(false);
    },
  );

  it("does not expose a foreign-tenant release", async () => {
    const fixture = poolForRelease("draft", "tenant-b");
    await expect(
      new PostgresConfigRepository(fixture.pool).upsert(
        context,
        input("00000000-0000-4000-8000-000000000010"),
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      message: "release not found",
    });
  });

  it("increments a config BIGINT without converting it through number", async () => {
    const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
    const client = {
      query: async <Row>(
        sql: string,
        values: readonly unknown[] = [],
      ): Promise<{ rows: readonly Row[]; affectedRows: number }> => {
        queries.push({ sql, values });
        if (sql.includes("SELECT id, config_version"))
          return {
            rows: [
              {
                id: "00000000-0000-4000-8000-000000000020",
                config_version: "9007199254740993",
              },
            ] as Row[],
            affectedRows: 1,
          };
        return { rows: [] as Row[], affectedRows: 1 };
      },
      release: () => undefined,
    };
    const pool = {
      connect: async () => client,
      ping: async () => undefined,
      close: async () => undefined,
    } satisfies SqlPool;

    await expect(
      new PostgresConfigRepository(pool).upsert(context, {
        ...input("00000000-0000-4000-8000-000000000010"),
        releaseId: null,
      }),
    ).resolves.toMatchObject({ configVersion: "9007199254740994" });
    expect(
      queries.find(({ sql }) => sql.startsWith("UPDATE system_config_record"))
        ?.values[2],
    ).toBe("9007199254740994");
  });
});
