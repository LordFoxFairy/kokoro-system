import type { SqlClient, SqlPool } from "../client.js";
import { SystemDomainError } from "../../../modules/system/errors.js";
import type { Page, PageRequest } from "../../../modules/system/application/dto.js";

export type Row = Record<string, unknown>;

export abstract class PostgresRepository {
  public constructor(protected readonly pool: SqlPool) {}

  protected async withTransaction<T>(operation: (client: SqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("START TRANSACTION");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve the original database error */ }
      throw error;
    } finally { client.release(); }
  }
}

export function text(value: unknown): string { return String(value); }
export function nullable(value: unknown): string | null { return value === null || value === undefined ? null : String(value); }
export function json(value: unknown): unknown { return typeof value === "string" ? JSON.parse(value) as unknown : value; }
export function timestamp(): string { return new Date().toISOString(); }
export function cursorOffset(request: PageRequest): number {
  if (!request.cursor) return 0;
  const value = Number.parseInt(Buffer.from(request.cursor, "base64url").toString("utf8"), 10);
  if (!Number.isInteger(value) || value < 0) throw new SystemDomainError("INVALID_CURSOR", "cursor is invalid");
  return value;
}
export function toPage<T>(items: readonly T[], offset: number, total: number, limit = 50): Page<T> {
  const size = Math.min(Math.max(limit, 1), 100);
  return { items: items.slice(0, size), nextCursor: offset + items.length < total ? Buffer.from(String(offset + items.length)).toString("base64url") : null };
}
export function requireRow<T>(row: T | undefined, message: string): T { if (!row) throw new SystemDomainError("NOT_FOUND", message, 404); return row; }
