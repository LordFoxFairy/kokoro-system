import type { z } from "zod";
export function decodeRow<T>(
  schema: z.ZodType<T>,
  row: Record<string, unknown>,
): T {
  return schema.parse(
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date ? value.toISOString() : value,
      ]),
    ),
  );
}
