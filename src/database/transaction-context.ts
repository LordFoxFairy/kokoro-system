import { requestBudget } from "../http/request-budget.js";
import type { PoolClient, QueryResultRow } from "pg";
export class TransactionContext {
  public constructor(private readonly connection: PoolClient) {}
  public async query<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    requestBudget()?.signal.throwIfAborted();
    return this.connection.query<T>(sql, [...values]);
  }
}
