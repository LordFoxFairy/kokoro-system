import { z } from "zod";

export const policyInputSchema = z
  .strictObject({
    default_locale: z.string().min(1).max(32),
    allowed_locales: z.array(z.string().min(1).max(32)).min(1).max(100),
    allowed_products: z.array(z.string().min(1).max(128)).max(100),
    public_manifest: z.boolean(),
  })
  .refine(
    (v) => v.allowed_locales.includes(v.default_locale),
    "default locale must be allowed",
  );
export const policySchema = policyInputSchema.safeExtend({
  id: z.uuid(),
  tenant_id: z.string(),
  site_id: z.uuid(),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  status: z.enum(["active", "archived"]),
  updated_at: z.iso.datetime(),
});
