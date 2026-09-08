import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { requireVersion } from "../../http/conditional-request.js";
import { OwnerError } from "../../http/owner-error.js";
import { ProviderRepository } from "./provider.repository.js";
import { HealthRepository } from "./health.repository.js";
import { ModelGenerationRepository } from "./model-generation.repository.js";
import { healthSchema } from "./schemas/provider.schema.js";
import type { healthInputSchema } from "./schemas/provider.schema.js";
@Injectable()
export class HealthService {
  public constructor(
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(ProviderRepository) private readonly providers: ProviderRepository,
    @Inject(HealthRepository) private readonly health: HealthRepository,
    @Inject(ModelGenerationRepository)
    private readonly generation: ModelGenerationRepository,
  ) {}
  public put(
    context: RequestContext,
    id: string,
    input: z.infer<typeof healthInputSchema>,
  ) {
    return this.receipts.run(context, input, healthSchema, async (tx) => {
      await this.providers.find(tx, id, false, true);
      const prior = await this.health.find(tx, id);
      if (prior) requireVersion(prior.generation, context.precondition);
      else if (context.precondition?.kind !== "create")
        throw new OwnerError("VERSION_CONFLICT", "Health does not exist", 409);
      if (Date.parse(input.observed_at) > Date.now() + 5000)
        throw new OwnerError(
          "INVALID_ARGUMENT",
          "Health timestamp is in future",
        );
      if (
        prior &&
        Date.parse(input.observed_at) < Date.parse(prior.observed_at)
      )
        throw new OwnerError(
          "VERSION_CONFLICT",
          "Stale health observation",
          409,
        );
      await this.generation.advance(tx);
      return this.health.put(tx, id, input);
    });
  }
}
