import { z } from "zod";

export const revisionInputSchema = z.strictObject({
  model_id: z.uuid(),
  provider_id: z.uuid(),
  revision: z.int().positive(),
  provider_model_name: z.string().min(1).max(255),
  display_name: z.string().min(1).max(160),
  feature_key: z.string().min(1).max(128),
  input_modalities: z
    .array(z.enum(["text", "image", "audio", "video"]))
    .min(1)
    .max(4),
  output_modalities: z
    .array(z.enum(["text", "image", "audio", "video"]))
    .min(1)
    .max(4),
  transport: z.literal("litellm"),
  gateway_model_name: z.string().min(1).max(255),
  context_window: z.int().positive().nullable(),
  priority: z.int().min(0).max(100000),
});
export const revisionUpdateSchema = revisionInputSchema
  .omit({ model_id: true, revision: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "empty patch");
export const revisionSchema = revisionInputSchema.extend({
  id: z.uuid(),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
  published_at: z.iso.datetime().nullable(),
  retired_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
