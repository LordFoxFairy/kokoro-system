import { Pool, type PoolClient, type QueryResultRow } from "pg";

export interface SqlResult<Row extends QueryResultRow> {
  readonly rows: readonly Row[];
  readonly affectedRows: number;
}
export interface SqlClient {
  query<Row extends QueryResultRow>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<SqlResult<Row>>;
  release(): void;
}
export interface SqlPool {
  connect(): Promise<SqlClient>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

class Client implements SqlClient {
  public constructor(private readonly connection: PoolClient) {}
  public async query<Row extends QueryResultRow>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<SqlResult<Row>> {
    const result = await this.connection.query<Row>(sql, [...values]);
    return {
      rows: result.rows,
      affectedRows: result.rowCount ?? 0,
    };
  }
  public release(): void {
    this.connection.release();
  }
}

export class PostgresPool implements SqlPool {
  private readonly pool: Pool;
  public constructor(url: string) {
    const connectionUrl = new URL(url);
    const schema = connectionUrl.searchParams.get("schema") ?? "public";
    connectionUrl.searchParams.set("options", `-c search_path=${schema}`);
    this.pool = new Pool({
      connectionString: connectionUrl.toString(),
      max: 10,
      connectionTimeoutMillis: 1500,
      idleTimeoutMillis: 30_000,
      statement_timeout: 10_000,
      query_timeout: 15_000,
      application_name: "kokoro-system",
    });
  }
  public async connect(): Promise<SqlClient> {
    return new Client(await this.pool.connect());
  }
  public async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }
  public async close(): Promise<void> {
    await this.pool.end();
  }
}
