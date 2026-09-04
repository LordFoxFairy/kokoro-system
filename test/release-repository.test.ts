import { describe, expect, it } from "vitest";
import type { SqlPool } from "../src/infrastructure/persistence/postgres/client.js";
import { PostgresReleaseRepository } from "../src/infrastructure/repositories/system/release-repository.js";

const context = {
  tenantId: "tenant-a",
  actorId: "actor-a",
  organizationId: null,
  surfaceId: null,
  permissions: ["system:publish"],
  correlationId: "request-a",
} as const;

function fixture(status: "draft" | "validated" | "published") {
  const queries: Array<{ sql: string; values: readonly unknown[] }> = [];
  const client = {
    query: async <Row>(
      sql: string,
      values: readonly unknown[] = [],
    ): Promise<{ rows: readonly Row[]; affectedRows: number }> => {
      queries.push({ sql, values });
      if (sql.includes("FROM system_config_release"))
        return {
          rows: [
            {
              id: "00000000-0000-4000-8000-000000000010",
              tenant_id: "tenant-a",
              release_key: "r1",
              status,
              digest: "a".repeat(64),
              published_at: status === "published" ? new Date() : null,
              version: "9007199254740993",
              created_at: new Date("2026-01-01T00:00:00.000Z"),
              updated_at: new Date("2026-01-01T00:00:00.000Z"),
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
  return { pool, queries };
}

describe("PostgresReleaseRepository generation transaction", () => {
  it.each([
    ["published", "validated"],
    ["retired", "published"],
  ] as const)(
    "advances the durable manifest generation when transitioning to %s",
    async (next, current) => {
      const value = fixture(current);
      await expect(
        new PostgresReleaseRepository(value.pool).update(
          context,
          "00000000-0000-4000-8000-000000000010",
          next,
          "9007199254740993",
        ),
      ).resolves.toMatchObject({
        status: next,
        version: "9007199254740994",
      });
      const releaseUpdate = value.queries.findIndex(({ sql }) =>
        sql.startsWith("UPDATE system_config_release"),
      );
      const generationUpdate = value.queries.findIndex(({ sql }) =>
        sql.startsWith("INSERT INTO system_runtime_manifest_generation"),
      );
      const commit = value.queries.findIndex(({ sql }) => sql === "COMMIT");
      expect(generationUpdate).toBeGreaterThan(releaseUpdate);
      expect(commit).toBeGreaterThan(generationUpdate);
      expect(value.queries[generationUpdate]?.values[0]).toBe("tenant-a");
    },
  );

  it("does not advance manifest generation for validation", async () => {
    const value = fixture("draft");
    await new PostgresReleaseRepository(value.pool).update(
      context,
      "00000000-0000-4000-8000-000000000010",
      "validated",
      "9007199254740993",
    );
    expect(
      value.queries.some(({ sql }) =>
        sql.includes("system_runtime_manifest_generation"),
      ),
    ).toBe(false);
  });
});
