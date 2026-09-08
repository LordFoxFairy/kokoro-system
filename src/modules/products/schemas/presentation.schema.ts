import { z } from "zod";

export const navigationItemSchema = z.strictObject({
  key: z.string().min(1).max(128),
  label: z.string().min(1).max(160),
  href: z
    .string()
    .regex(/^\/(?!\/)[^\r\n]*$/u)
    .max(2048),
  feature_key: z.string().min(1).max(128).nullable(),
});
export const themeSchema = z.strictObject({
  mode: z.enum(["light", "dark", "system"]),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
  logo_asset_id: z.uuid().nullable(),
});
export const localeNamespaceSchema = z.strictObject({
  namespace: z.string().min(1).max(128),
  messages: z.record(z.string().min(1).max(128), z.string().max(4096)),
});
export const featureFlagSchema = z.strictObject({
  key: z.string().min(1).max(128),
  enabled: z.boolean(),
});
export const referenceSchema = z.strictObject({
  key: z.string().min(1).max(128),
  owner: z.enum(["iam", "billing", "platform", "storage", "agent"]),
  resource_id: z.string().min(1).max(255),
});
export const presentationInputSchema = z.strictObject({
  schema_version: z.literal(1),
  navigation: z.array(navigationItemSchema).max(100),
  theme: themeSchema,
  locale_namespaces: z.array(localeNamespaceSchema).max(100),
});
export const presentationSchema = presentationInputSchema.extend({
  id: z.uuid(),
  tenant_id: z.string(),
  application_id: z.uuid(),
  locale: z.string(),
  surface_id: z.string().nullable(),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

export const presentationQuerySchema = z.strictObject({
  locale: z.string().min(1).max(32),
  surface_id: z.string().min(1).max(160).optional(),
});
