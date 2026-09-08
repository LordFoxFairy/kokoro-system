import { z } from "zod";

export const resolveInputSchema = z.strictObject({
  label_key: z.string().min(1).max(128).optional(),
  feature_key: z.string().min(1).max(128),
});
export const resolveSchema = z.strictObject({
  model_id: z.uuid(),
  revision_id: z.uuid(),
  revision: z.int().positive(),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
  generation: z.string().regex(/^[1-9][0-9]*$/u),
  tenant_generation: z.string().regex(/^[1-9][0-9]*$/u),
  provider_id: z.uuid(),
  provider_model_name: z.string(),
  transport: z.literal("litellm"),
  gateway_model_name: z.string(),
  label_key: z.string(),
  feature_key: z.string(),
});
export const catalogQuerySchema = z.strictObject({
  feature_key: z.string().min(1).max(128).optional(),
  cursor: z.string().min(1).max(2048).optional(),
  limit: z
    .string()
    .regex(/^(?:[1-9]|[1-9][0-9]|100)$/u)
    .optional(),
});
export const catalogItemSchema = z.strictObject({
  key: z.string(),
  display_name: z.string(),
  is_default: z.boolean(),
  feature_key: z.string(),
  default_revision_id: z.uuid().nullable(),
});
