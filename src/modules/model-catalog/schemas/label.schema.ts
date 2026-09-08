import { z } from "zod";

export const labelInputSchema = z.strictObject({
  label_key: z.string().min(1).max(128),
  display_name: z.string().min(1).max(160),
  feature_key: z.string().min(1).max(128),
  default_revision_id: z.uuid().nullable(),
});
export const labelUpdateSchema = labelInputSchema
  .omit({ label_key: true, feature_key: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "empty patch");
export const labelSchema = labelInputSchema.extend({
  id: z.uuid(),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  deleted_at: z.iso.datetime().nullable(),
});
export const routingInputSchema = z.strictObject({
  model_revision_id: z.uuid().nullable(),
  visible: z.boolean(),
  is_default: z.boolean(),
  priority: z.int().min(0).max(100000),
});
export const routingSchema = routingInputSchema.extend({
  id: z.uuid(),
  tenant_id: z.string(),
  label_id: z.uuid(),
  feature_key: z.string(),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
