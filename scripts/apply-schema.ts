import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { parseSystemDatabaseUrl } from "../src/config/database-url.js";

const database = parseSystemDatabaseUrl(process.env.DATABASE_URL);
const sql = await readFile(
  new URL("../database/schema.sql", import.meta.url),
  "utf8",
);
const connection = new Client(database);
try {
  await connection.connect();
  await connection.query("BEGIN");
  await connection.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
    [`kokoro-system:canonical-schema:${database.schema}`],
  );
  await connection.query(`CREATE SCHEMA IF NOT EXISTS "${database.schema}"`);
  const objects = await connection.query<{ present: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace=n.oid
      UNION ALL SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace=n.oid
      UNION ALL SELECT 1 FROM pg_catalog.pg_type WHERE typnamespace=n.oid
      UNION ALL SELECT 1 FROM pg_catalog.pg_extension WHERE extnamespace=n.oid
      UNION ALL
      SELECT 1 FROM pg_catalog.pg_depend d
      CROSS JOIN LATERAL pg_catalog.pg_identify_object(d.classid,d.objid,d.objsubid) AS identity
      WHERE d.refclassid='pg_catalog.pg_namespace'::regclass AND d.refobjid=n.oid
        AND identity.schema=$1
    ) AS present
    FROM pg_catalog.pg_namespace n WHERE n.nspname=$1
  `,
    [database.schema],
  );
  if (objects.rows[0]?.present !== false)
    throw new Error("db:apply-schema requires an empty owner schema");
  await connection.query(
    `SET LOCAL search_path TO "${database.schema}", pg_catalog`,
  );
  await connection.query("SET LOCAL TIME ZONE 'UTC'");
  await connection.query(sql);
  await connection.query("COMMIT");
} catch (error) {
  await connection.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await connection.end();
}
