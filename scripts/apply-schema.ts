import { readFile } from "node:fs/promises";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = await readFile(new URL("../database/schema.sql", import.meta.url), "utf8");
const connection = new Client({ connectionString: url });
try {
  await connection.connect();
  await connection.query(sql);
} finally {
  await connection.end();
}
