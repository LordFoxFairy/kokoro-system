import { Inject, Injectable } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import { Pool } from "pg";
import { SystemConfig } from "../config/system-config.js";
import { TransactionContext } from "./transaction-context.js";
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  private closing = false;
  public constructor(@Inject(SystemConfig) config: SystemConfig) {
    this.pool = new Pool({
      connectionString: config.values.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      statement_timeout: 5000,
      query_timeout: 6000,
      options:
        "-c timezone=UTC -c search_path=public,pg_catalog -c lock_timeout=3000",
    });
    this.pool.on("error", () => {
      /* read/query paths report dependency failure without exposing connection details */
    });
  }
  public async transaction<T>(
    work: (transaction: TransactionContext) => Promise<T>,
  ): Promise<T> {
    if (this.closing) throw new Error("Database draining");
    const connection = await this.pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await work(new TransactionContext(connection));
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }
  public async read<T>(
    work: (transaction: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.transaction(work);
  }
  public async ready(): Promise<boolean> {
    return this.read(async (tx) => {
      await tx.query("SELECT 1 AS healthy");
      return true;
    });
  }
  public async onApplicationShutdown(): Promise<void> {
    this.closing = true;
    await this.pool.end();
  }
}
