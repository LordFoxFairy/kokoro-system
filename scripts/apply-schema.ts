import { readFile } from "node:fs/promises";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = await readFile(
  new URL("../database/schema.sql", import.meta.url),
  "utf8",
);
const connection = new Client({ connectionString: url });
try {
  await connection.connect();
  await connection.query("BEGIN");
  await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["kokoro-system:canonical-schema"]);
  const tables = await connection.query<Record<string, unknown>>(`
    SELECT tablename AS table_name
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  if (tables.rows.length > 0) {
    const tableNames = tables.rows.map((table) => {
      if (typeof table.table_name !== "string")
        throw new Error(
          "db:apply-schema received an invalid PostgreSQL table name",
        );
      return table.table_name;
    });
    throw new Error(`db:apply-schema requires a blank database; found tables: ${tableNames.join(", ")}`);
  }
  await connection.query("SET LOCAL search_path TO public, pg_catalog");
  await connection.query(sql);
  await connection.query("COMMIT");
} catch (error) {
  await connection.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await connection.end();
}
