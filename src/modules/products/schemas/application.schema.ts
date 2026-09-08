import { z } from "zod";

export const applicationInputSchema = z.strictObject({
  site_id: z.uuid(),
  product_id: z.uuid(),
  app_key: z.string().trim().min(1).max(128),
  display_name: z.string().trim().min(1).max(160),
});
export const applicationUpdateSchema = z.strictObject({
  display_name: z.string().trim().min(1).max(160),
});
export const applicationSchema = applicationInputSchema.extend({
  id: z.uuid(),
  tenant_id: z.string(),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  deleted_at: z.iso.datetime().nullable(),
});
