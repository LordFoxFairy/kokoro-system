import { z } from "zod";

export const requestIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u);
export const errorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string(),
    retryable: z.boolean(),
  }),
});
export const probeSchema = z.strictObject({
  service: z.literal("kokoro-system"),
  status: z.enum(["ok", "ready", "not_ready"]),
});
export const pageQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(2048).optional(),
  limit: z
    .string()
    .regex(/^(?:[1-9]|[1-9][0-9]|100)$/u)
    .optional(),
});
export function envelopeSchema<T extends z.ZodType>(data: T) {
  return z.strictObject({ data });
}
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item),
    next_cursor: z.string().nullable(),
  });
}
