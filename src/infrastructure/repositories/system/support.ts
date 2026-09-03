import type { SqlClient, SqlPool } from "../../persistence/postgres/client.js";
import { SystemDomainError } from "../../../domain/system/errors/system-domain.error.js";
import type {
  Page,
  PageRequest,
} from "../../../application/system/dto/index.js";

export type Row = Record<string, unknown>;

export abstract class PostgresRepository {
  public constructor(
    protected readonly pool: SqlPool,
    private readonly transactionClient: SqlClient | null = null,
  ) {}

  protected async withTransaction<T>(
    operation: (client: SqlClient) => Promise<T>,
  ): Promise<T> {
    if (this.transactionClient !== null)
      return operation(this.transactionClient);
    return withTransaction(this.pool, operation);
  }
}

export async function withTransaction<T>(
  pool: SqlPool,
  operation: (client: SqlClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("START TRANSACTION");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* preserve the original database error */
    }
    throw error;
  } finally {
    client.release();
  }
}

export function utcTimestamp(): string {
  return new Date().toISOString();
}
export function pageLimit(request: PageRequest): number {
  return Math.min(Math.max(request.limit ?? 50, 1), 100);
}
export function cursorId(request: PageRequest): string | null {
  if (!request.cursor) return null;
  const value = Buffer.from(request.cursor, "base64url").toString("utf8");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    throw new SystemDomainError("INVALID_CURSOR", "cursor is invalid");
  return value;
}
export function toPage<T extends Readonly<{ id: string }>>(
  items: readonly T[],
  limit = 50,
): Page<T> {
  const size = Math.min(Math.max(limit, 1), 100);
  const pageItems = items.slice(0, size);
  const last = pageItems.at(-1);
  return {
    items: pageItems,
    nextCursor:
      items.length > size && last
        ? Buffer.from(last.id).toString("base64url")
        : null,
  };
}
export function requireRow<T>(row: T | undefined, message: string): T {
  if (!row) throw new SystemDomainError("NOT_FOUND", message, 404);
  return row;
}
