import { Socket } from "node:net";
import { Inject, Injectable } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import { Pool } from "pg";
import { SystemConfig } from "../config/system-config.js";
import { TransactionContext } from "./transaction-context.js";
import { requestBudget } from "../http/request-budget.js";
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly pool: Pool;
  private closing = false;
  private readonly sockets = new Set<Socket>();
  private readonly connections = new Set<() => void>();
  private readonly shutdownMs: number;
  public constructor(@Inject(SystemConfig) config: SystemConfig) {
    this.shutdownMs = config.values.KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS;
    this.pool = new Pool({
      connectionString: config.values.DATABASE_URL,
      max: 10,
      stream: () => {
        const socket = new Socket();
        this.sockets.add(socket);
        socket.once("close", () => this.sockets.delete(socket));
        return socket;
      },
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      statement_timeout: 5000,
      query_timeout: 6000,
      options:
        "-c timezone=UTC -c search_path=public,pg_catalog -c lock_timeout=3000",
    });
    this.pool.on("error", () => {
      /* Sanitized request/dependency paths report the failure. */
    });
  }
  public async transaction<T>(
    work: (transaction: TransactionContext) => Promise<T>,
  ): Promise<T> {
    if (this.closing) throw new Error("Database draining");
    const budget = requestBudget();
    budget?.signal.throwIfAborted();
    const connection = await this.pool.connect();
    let released = false;
    const release = (destroy = false) => {
      if (!released) {
        released = true;
        connection.release(destroy);
      }
    };
    const cancel = () => release(true);
    this.connections.add(cancel);
    budget?.signal.addEventListener("abort", cancel, { once: true });
    try {
      if (this.closing) throw new Error("Database draining");
      budget?.signal.throwIfAborted();
      await connection.query("BEGIN");
      const result = await work(new TransactionContext(connection));
      budget?.signal.throwIfAborted();
      await connection.query("COMMIT");
      return result;
    } catch (error) {
      if (!released) await connection.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      budget?.signal.removeEventListener("abort", cancel);
      this.connections.delete(cancel);
      release();
    }
  }
  public read<T>(
    work: (transaction: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.transaction(work);
  }
  public ready(): Promise<boolean> {
    return this.read(async (tx) => {
      await tx.query("SELECT 1 AS healthy");
      return true;
    });
  }
  public forceClose(): void {
    this.closing = true;
    for (const cancel of this.connections) cancel();
    for (const socket of this.sockets)
      socket.destroy(new Error("Database drain deadline"));
  }
  public async onApplicationShutdown(): Promise<void> {
    this.closing = true;
    const timer = setTimeout(() => this.forceClose(), this.shutdownMs);
    timer.unref();
    try {
      await this.pool.end();
    } finally {
      clearTimeout(timer);
    }
  }
}
