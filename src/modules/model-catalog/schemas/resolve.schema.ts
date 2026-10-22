import { z } from "zod";
import { connectionSchema } from "./connection.schema.js";

export const resolveInputSchema = z.strictObject({
  label_key: z.string().min(1).max(128).optional(),
  feature_key: z.string().min(1).max(128),
});
export const resolveSchema = z
  .strictObject({
    model_id: z.uuid(),
    revision_id: z.uuid(),
    revision: z.int().positive(),
    context_window: z.int().min(1).max(2147483647),
    max_output_tokens: z.int().min(1).max(2147483647),
    digest: z.string().regex(/^[a-f0-9]{64}$/u),
    generation: z.string().regex(/^[1-9][0-9]*$/u),
    tenant_generation: z.string().regex(/^[1-9][0-9]*$/u),
    provider_id: z.uuid(),
    provider_model_name: z.string(),
    request_model: z.string().min(1).max(255),
    connection: connectionSchema,
    label_key: z.string(),
    feature_key: z.string(),
  })
  .refine((value) => value.max_output_tokens <= value.context_window, {
    message: "max_output_tokens must be less than or equal to context_window",
    path: ["max_output_tokens"],
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
  model_id: z.uuid(),
  revision_id: z.uuid(),
  provider_id: z.uuid(),
  provider: z.string().min(1).max(128),
  request_model: z.string().min(1).max(255),
});
