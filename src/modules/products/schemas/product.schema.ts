import { z } from "zod";

export const productInputSchema = z.strictObject({
  product_key: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(160),
});
export const productUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
});
export const productSchema = productInputSchema.extend({
  id: z.uuid(),
  status: z.enum(["active", "archived"]),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  deleted_at: z.iso.datetime().nullable(),
});
