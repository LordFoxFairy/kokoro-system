import { z } from "zod";

import {
  navigationItemSchema,
  themeSchema,
  localeNamespaceSchema,
  featureFlagSchema,
  referenceSchema,
} from "../../products/products.public.js";
export const manifestQuerySchema = z.strictObject({
  product_id: z.string().min(1).max(128),
  locale: z.string().min(1).max(32).optional(),
  surface_id: z.string().min(1).max(160).optional(),
});
export const manifestSchema = z.strictObject({
  tenant_id: z.string(),
  site_id: z.uuid(),
  product_id: z.string(),
  locale: z.string(),
  surface_id: z.string().nullable(),
  navigation: z.array(navigationItemSchema),
  locale_namespaces: z.array(localeNamespaceSchema),
  theme: themeSchema,
  feature_flags: z.array(featureFlagSchema),
  references: z.array(referenceSchema),
  config_version: z.string().regex(/^(0|[1-9][0-9]*)$/u),
  generation: z.string().regex(/^[1-9][0-9]*$/u),
  catalog_generation: z.string().regex(/^[1-9][0-9]*$/u),
  release_id: z.uuid().nullable(),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
});
