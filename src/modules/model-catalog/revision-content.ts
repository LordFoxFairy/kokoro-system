import type { z } from "zod";
import type {
  revisionSchema,
  revisionContentSchema,
} from "./schemas/revision.schema.js";
export function revisionContent(
  value: z.infer<typeof revisionSchema>,
): z.infer<typeof revisionContentSchema> {
  return {
    model_id: value.model_id,
    provider_id: value.provider_id,
    revision: value.revision,
    provider_model_name: value.provider_model_name,
    display_name: value.display_name,
    input_modalities: value.input_modalities,
    output_modalities: value.output_modalities,
    request_model: value.request_model,
    connection: value.connection,
    context_window: value.context_window,
    max_output_tokens: value.max_output_tokens,
    priority: value.priority,
  };
}
