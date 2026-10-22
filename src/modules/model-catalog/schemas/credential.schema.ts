import { z } from "zod";
import { modelApiKeySchema } from "./provider.schema.js";
import { resolveInputSchema } from "./resolve.schema.js";
export const credentialReadInputSchema = resolveInputSchema.extend({
  provider_id: z.uuid(),
  revision_id: z.uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
});
export const credentialReadSchema = z.strictObject({
  feature_key: z.string().min(1).max(128),
  label_key: z.string().min(1).max(128),
  provider_id: z.uuid(),
  revision_id: z.uuid(),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
  secret_handle_ref: z.string().min(1).max(255),
  api_key: modelApiKeySchema,
});
export const providerCreationQuerySchema = z.strictObject({
  idempotency_key: z.string().min(1).max(128),
});
export const providerCreationSchema = z.strictObject({
  provider_id: z.uuid(),
  credential_status: z.enum(["stored", "erased"]),
  deleted_at: z.iso.datetime().nullable(),
});
