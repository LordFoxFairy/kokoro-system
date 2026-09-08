import type { z } from "zod";
import type {
  revisionSchema,
  revisionInputSchema,
} from "./schemas/revision.schema.js";
export function revisionContent(
  value: z.infer<typeof revisionSchema>,
): z.infer<typeof revisionInputSchema> {
  return {
    model_id: value.model_id,
    provider_id: value.provider_id,
    revision: value.revision,
    provider_model_name: value.provider_model_name,
    display_name: value.display_name,
    feature_key: value.feature_key,
    input_modalities: value.input_modalities,
    output_modalities: value.output_modalities,
    transport: value.transport,
    gateway_model_name: value.gateway_model_name,
    context_window: value.context_window,
    priority: value.priority,
  };
}
