import { z } from "zod";
import { connectionSchema } from "./connection.schema.js";

const providerContentSchema = connectionSchema.extend({
  provider: z.string().min(1).max(128),
  provider_key: z.string().min(1).max(128),
  display_name: z.string().min(1).max(160),
  priority: z.int().min(0).max(100000),
});
export const modelApiKeySchema = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[\x21-\x7e]+$/u);
export const providerInputSchema = providerContentSchema
  .omit({ secret_handle_ref: true })
  .extend({
    api_key: modelApiKeySchema.meta({ writeOnly: true }),
    connection_type: connectionSchema.shape.connection_type.default("direct"),
  });
export const providerUpdateSchema = providerContentSchema
  .pick({ display_name: true, priority: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "empty patch");
export const providerSchema = providerContentSchema.extend({
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
