import { z } from "zod";
export const providerModelDiscoverySchema = z.strictObject({
  provider_id: z.uuid(),
  items: z.array(z.strictObject({ id: z.string().min(1).max(255) })).max(2000),
});
