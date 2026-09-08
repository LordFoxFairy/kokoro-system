import { z } from "zod";

export const workspaceInputSchema = z.strictObject({
  site_id: z.uuid(),
  workspace_key: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(160),
});
export const workspaceUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
});
export const workspaceSchema = workspaceInputSchema.extend({
  id: z.uuid(),
  tenant_id: z.string(),
  status: z.enum(["active", "archived"]),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  deleted_at: z.iso.datetime().nullable(),
});
