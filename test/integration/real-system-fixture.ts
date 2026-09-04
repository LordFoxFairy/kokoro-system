import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { createClient } from "redis";
import { PostgresPool } from "../../src/infrastructure/persistence/postgres/client.js";
import { RedisCoordinator } from "../../src/infrastructure/redis/coordinator.js";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export type RealSystemFixture = Readonly<{
  pool: PostgresPool;
  redis: Readonly<{ exists(key: string): Promise<number> }>;
  query<Row extends Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<readonly Row[]>;
  cache(suffix: string): RedisCoordinator;
  namespace(suffix: string): string;
  close(): Promise<void>;
}>;

export async function createRealSystemFixture(
  databaseUrl: string,
  redisUrl: string,
): Promise<RealSystemFixture> {
  const schema = `system_review_${process.pid}_${Date.now()}_${randomUUID().replaceAll("-", "")}`;
  const namespacePrefix = `kokoro:system:review:${process.pid}:${Date.now()}:${randomUUID()}`;
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);

  const connection = new Client({ connectionString: databaseUrl });
  await connection.connect();
  await connection.query(`SET search_path TO ${quoteIdentifier(schema)}`);
  const canonicalSchema = await readFile(
    new URL("../../database/schema.sql", import.meta.url),
    "utf8",
  );
  await connection.query(canonicalSchema);

  const scopedUrl = new URL(databaseUrl);
  scopedUrl.searchParams.set("schema", schema);
  const pool = new PostgresPool(scopedUrl.toString());
  const redis = createClient({ url: redisUrl });
  await redis.connect();
  const caches: RedisCoordinator[] = [];
  const namespace = (suffix: string): string => `${namespacePrefix}:${suffix}`;

  return {
    pool,
    redis,
    query: async <Row extends Record<string, unknown>>(
      sql: string,
      values: readonly unknown[] = [],
    ): Promise<readonly Row[]> => {
      const result = await connection.query<Row>(sql, [...values]);
      return result.rows;
    },
    cache: (suffix: string) => {
      const value = new RedisCoordinator(redisUrl, namespace(suffix));
      caches.push(value);
      return value;
    },
    namespace,
    close: async () => {
      await Promise.allSettled(caches.map(async (cache) => cache.close()));
      for await (const keys of redis.scanIterator({
        MATCH: `${namespacePrefix}:*`,
        COUNT: 100,
      }))
        if (keys.length > 0) await redis.del(keys);
      await redis.quit();
      await pool.close();
      await connection.end();
      await admin.query(`DROP SCHEMA ${quoteIdentifier(schema)} CASCADE`);
      await admin.end();
    },
  };
}
