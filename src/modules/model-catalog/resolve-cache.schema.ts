import { z } from "zod";
import { resolveSchema } from "./schemas/resolve.schema.js";
// Internal Redis representation; never an HTTP contract or owner fact.
export const resolveCacheSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("route"),
    key: z.string(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/u),
    expires_at: z.number().finite(),
    data: resolveSchema,
  }),
  z.strictObject({
    kind: z.literal("error"),
    key: z.string(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/u),
    expires_at: z.number().finite(),
    generation: z.string(),
    tenant_generation: z.string(),
    code: z.enum(["ROUTE_NOT_FOUND", "POLICY_DENIED", "MODEL_UNAVAILABLE"]),
  }),
]);
