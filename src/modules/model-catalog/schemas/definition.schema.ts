import { z } from "zod";

export const definitionInputSchema = z.strictObject({
  model_key: z.string().min(1).max(128),
  display_name: z.string().min(1).max(160),
});
export const definitionUpdateSchema = z.strictObject({
  display_name: z.string().min(1).max(160),
});
export const definitionSchema = definitionInputSchema.extend({
  id: z.uuid(),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  deleted_at: z.iso.datetime().nullable(),
});
