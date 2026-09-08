import { z } from "zod";

export const resultContractSchema = z.strictObject({
  schema_version: z.literal(1),
  outcome_kind: z.enum(["message", "artifact", "structured"]),
  media_types: z.array(z.string().min(1).max(128)).max(32),
  required_fields: z.array(z.string().min(1).max(128)).max(64),
});
export const featureInputSchema = z.strictObject({
  global_feature_key: z.string().regex(/^[a-z][a-z0-9_.-]{0,127}$/u),
  product_id: z.uuid(),
  display_name: z.string().min(1).max(160),
  result_contract: resultContractSchema,
});
export const featureSchema = featureInputSchema.extend({
  id: z.uuid(),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  retired_at: z.iso.datetime().nullable(),
});
export const exposureInputSchema = z.strictObject({
  enabled: z.boolean(),
  display_order: z.int().min(0).max(10000),
});
export const exposureSchema = exposureInputSchema.extend({
  id: z.uuid(),
  tenant_id: z.string(),
  application_id: z.uuid(),
  feature_id: z.uuid(),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
