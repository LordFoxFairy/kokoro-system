import { createHash } from "node:crypto";
import { z } from "zod";
import { OwnerError } from "./owner-error.js";
const cursorSchema = z.strictObject({
  resource: z.string(),
  scope: z.string(),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});
export type PagePosition = Readonly<{ createdAt: string; id: string }>;
export type PageInput = Readonly<{ limit?: string; cursor?: string }>;
export type PageQuery = Readonly<{ limit: number; after: PagePosition | null }>;
const scopeHash = (scope: string): string =>
  createHash("sha256").update(scope).digest("hex");
export function encodeCursor(
  resource: string,
  scope: string,
  last: PagePosition,
): string {
  return Buffer.from(
    JSON.stringify({ resource, scope: scopeHash(scope), ...last }),
  ).toString("base64url");
}
export function decodeCursor(
  cursor: string,
  resource: string,
  scope: string,
): PagePosition {
  try {
    const value = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
    if (value.resource !== resource || value.scope !== scopeHash(scope))
      throw new Error("scope");
    return { createdAt: value.createdAt, id: value.id };
  } catch {
    throw new OwnerError("INVALID_CURSOR", "Invalid cursor");
  }
}
export function pageQuery(
  input: PageInput,
  resource: string,
  scope: string,
): PageQuery {
  return {
    limit: input.limit === undefined ? 50 : Number(input.limit),
    after: input.cursor ? decodeCursor(input.cursor, resource, scope) : null,
  };
}
export function pageResult<T extends { id: string; created_at: string }>(
  rows: T[],
  query: PageQuery,
  resource: string,
  scope: string,
): Readonly<{ items: T[]; next_cursor: string | null }> {
  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  return {
    items,
    next_cursor:
      rows.length > query.limit && last
        ? encodeCursor(resource, scope, {
            id: last.id,
            createdAt: last.created_at,
          })
        : null,
  };
}
