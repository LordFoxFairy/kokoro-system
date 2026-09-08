import { z } from "zod";

export const releaseInputSchema = z.strictObject({
  release_key: z.string().trim().min(1).max(128),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
});
export const releaseSchema = releaseInputSchema.extend({
  id: z.uuid(),
  tenant_id: z.string(),
  status: z.enum(["draft", "validated", "published", "retired"]),
  published_at: z.iso.datetime().nullable(),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
export const bindingInputSchema = z
  .strictObject({
    site_id: z.uuid().nullable(),
    product_id: z.uuid(),
    scope_type: z.enum(["tenant", "product", "surface"]),
    scope_id: z.string().min(1).max(160),
    release_id: z.uuid(),
  })
  .refine(
    (v) =>
      v.scope_type === "surface"
        ? v.site_id !== null
        : v.site_id === null &&
          (v.scope_type !== "product" || v.scope_id === v.product_id),
    "invalid binding scope",
  );
export const bindingSchema = bindingInputSchema.safeExtend({
  id: z.uuid(),
  tenant_id: z.string(),
  status: z.enum(["active", "archived"]),
  version: z.string().regex(/^[1-9][0-9]*$/u),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
