import { z } from "zod";

export const providerInputSchema = z.strictObject({
  provider: z.string().min(1).max(128),
  provider_key: z.string().min(1).max(128),
  display_name: z.string().min(1).max(160),
  secret_handle_ref: z.string().min(1).max(255),
  transport: z.literal("litellm"),
  priority: z.int().min(0).max(100000),
});
export const providerUpdateSchema = providerInputSchema
  .omit({ provider: true, provider_key: true, transport: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "empty patch");
export const providerSchema = providerInputSchema.extend({
  id: z.uuid(),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  deleted_at: z.iso.datetime().nullable(),
});
export const healthInputSchema = z.strictObject({
  status: z.enum(["unknown", "healthy", "degraded", "down"]),
  observed_at: z.iso.datetime(),
});
export const healthSchema = healthInputSchema.extend({
  provider_id: z.uuid(),
  generation: z.string().regex(/^[1-9][0-9]*$/u),
  updated_at: z.iso.datetime(),
});
