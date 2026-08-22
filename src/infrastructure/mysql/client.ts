import { createPool, type Pool, type PoolConnection } from "mysql2/promise";
export interface SqlResult<Row> { readonly rows: readonly Row[]; readonly affectedRows: number; }
export interface SqlClient { query<Row>(sql: string, values?: readonly unknown[]): Promise<SqlResult<Row>>; release(): void; }
export interface SqlPool { connect(): Promise<SqlClient>; ping(): Promise<void>; close(): Promise<void>; }
class Client implements SqlClient {
  public constructor(private readonly connection: PoolConnection) {}
  public async query<Row>(sql: string, values: readonly unknown[] = []): Promise<SqlResult<Row>> {
    const [raw, meta] = values.length === 0 ? await this.connection.query(sql) : await this.connection.execute(sql, values as never[]);
    const rows = Array.isArray(raw) ? raw as unknown as readonly Row[] : [];
    return { rows, affectedRows: Number((raw as { affectedRows?: number }).affectedRows ?? (meta as { affectedRows?: number } | undefined)?.affectedRows ?? 0) };
  }
  public release(): void { this.connection.release(); }
}
export class MysqlPool implements SqlPool {
  private readonly pool: Pool;
  public constructor(url: string) {
    const parsed = new URL(url);
    this.pool = createPool({ host: parsed.hostname, port: Number(parsed.port || 3306), user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), database: decodeURIComponent(parsed.pathname.slice(1)), connectionLimit: 10, timezone: "Z" });
  }
  public async connect(): Promise<SqlClient> { return new Client(await this.pool.getConnection()); }
  public async ping(): Promise<void> { await this.pool.query("SELECT 1"); }
  public async close(): Promise<void> { await this.pool.end(); }
}
