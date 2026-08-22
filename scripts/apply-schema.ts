import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = await readFile(new URL("../database/20-system.sql", import.meta.url), "utf8");
const connection = await mysql.createConnection(url);
try {
  await connection.query(sql);
} finally {
  await connection.end();
}
