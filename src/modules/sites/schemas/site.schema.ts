import { z } from "zod";

export const siteInputSchema = z.strictObject({
  site_key: z.string().trim().min(1).max(128),
  hostname: z.string().trim().min(1).max(255),
  display_name: z.string().trim().min(1).max(160),
});
export const siteUpdateSchema = z
  .strictObject({
    display_name: z.string().trim().min(1).max(160).optional(),
    timezone: z.string().min(1).max(64).optional(),
    status: z.enum(["draft", "active", "suspended"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "empty patch");
export const siteSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.string(),
  site_key: z.string(),
  hostnames: z.array(z.string()),
  display_name: z.string(),
  timezone: z.string(),
  status: z.enum(["draft", "active", "suspended", "archived"]),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  deleted_at: z.iso.datetime().nullable(),
});
export const domainInputSchema = z.strictObject({
  hostname: z.string().trim().min(1).max(255),
});
export const domainSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.string(),
  site_id: z.uuid(),
  hostname: z.string(),
  status: z.enum(["active", "archived"]),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
