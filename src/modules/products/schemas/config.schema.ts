import { z } from "zod";
import { pageQuerySchema } from "../../../http/protocol.schema.js";

import {
  navigationItemSchema,
  themeSchema,
  localeNamespaceSchema,
  featureFlagSchema,
  referenceSchema,
} from "./presentation.schema.js";
const configIdentity = {
  config_key: z.string().min(1).max(160),
  scope_type: z.enum(["global", "tenant", "product", "surface"]),
  scope_id: z.string().min(1).max(160).nullable(),
  product_id: z.uuid().nullable(),
  site_id: z.uuid().nullable().optional(),
  locale: z.string().min(1).max(32).nullable(),
  schema_version: z.literal(1),
  release_id: z.uuid().nullable(),
};
const configVariants = z.discriminatedUnion("module_key", [
  z.strictObject({
    ...configIdentity,
    module_key: z.literal("navigation"),
    value: z.array(navigationItemSchema).max(100),
  }),
  z.strictObject({
    ...configIdentity,
    module_key: z.literal("theme"),
    value: themeSchema,
  }),
  z.strictObject({
    ...configIdentity,
    module_key: z.literal("i18n"),
    value: z.array(localeNamespaceSchema).max(100),
  }),
  z.strictObject({
    ...configIdentity,
    module_key: z.literal("feature_flags"),
    value: z.array(featureFlagSchema).max(100),
  }),
  z.strictObject({
    ...configIdentity,
    module_key: z.literal("references"),
    value: z.array(referenceSchema).max(100),
  }),
]);
export const configInputSchema = configVariants.refine((v) => {
  if (v.scope_type === "global")
    return (
      v.scope_id === null &&
      (v.site_id ?? null) === null &&
      v.release_id === null
    );
  if (v.scope_type === "tenant")
    return (
      v.scope_id !== null &&
      v.product_id === null &&
      (v.site_id ?? null) === null
    );
  if (v.scope_type === "product")
    return (
      v.product_id !== null &&
      v.scope_id === v.product_id &&
      (v.site_id ?? null) === null
    );
  return v.scope_id !== null && v.product_id !== null && v.site_id != null;
}, "scope fields do not match scope_type");
export const configUpdateSchema = z.strictObject({
  value: z.union([
    z.array(navigationItemSchema).max(100),
    themeSchema,
    z.array(localeNamespaceSchema).max(100),
    z.array(featureFlagSchema).max(100),
    z.array(referenceSchema).max(100),
  ]),
});
const configRecordFields = {
  id: z.uuid(),
  tenant_id: z.string().nullable(),
  status: z.enum(["active", "deleted"]),
  config_version: z.string().regex(/^[1-9][0-9]*$/u),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
  updated_at: z.iso.datetime(),
};
export const configSchema = z.union(
  configVariants.options.map((option) => option.extend(configRecordFields)),
);

export const configScopeQuerySchema = z.strictObject({
  scope: z.enum(["tenant", "global"]).optional(),
});
export const configListQuerySchema = pageQuerySchema.extend({
  scope: z.enum(["tenant", "global"]).optional(),
});
