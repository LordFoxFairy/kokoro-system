import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { tenantScope } from "../../access/tenant-scope.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { requireVersion } from "../../http/conditional-request.js";
import { SystemError } from "../../system.error.js";
import { ApplicationRepository } from "./application.repository.js";
import { PresentationRepository } from "./presentation.repository.js";
import { presentationSchema } from "./schemas/presentation.schema.js";
import type {
  presentationInputSchema,
  presentationQuerySchema,
} from "./schemas/presentation.schema.js";
@Injectable()
export class PresentationService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(ApplicationRepository) private readonly apps: ApplicationRepository,
    @Inject(PresentationRepository)
    private readonly presentations: PresentationRepository,
  ) {}
  public get(
    context: RequestContext,
    appId: string,
    query: z.infer<typeof presentationQuerySchema>,
  ) {
    return this.database.read(async (tx) => {
      const tenant = tenantScope(context);
      await this.apps.find(tx, tenant, appId);
      const value = await this.presentations.find(
        tx,
        tenant,
        appId,
        query.locale,
        query.surface_id ?? null,
      );
      if (!value) throw new SystemError("NOT_FOUND", "Presentation not found");
      return value;
    });
  }
  public put(
    context: RequestContext,
    appId: string,
    query: z.infer<typeof presentationQuerySchema>,
    input: z.infer<typeof presentationInputSchema>,
  ) {
    return this.receipts.run(
      context,
      { query, input },
      presentationSchema,
      async (tx) => {
        const tenant = tenantScope(context);
        const snapshot = await this.apps.find(tx, tenant, appId);
        await this.apps.lockSite(tx, tenant, snapshot.site_id);
        await this.apps.lockProduct(tx, snapshot.product_id);
        await this.apps.find(tx, tenant, appId, false, true);
        await this.presentations.validateNavigation(
          tx,
          tenant,
          appId,
          input.navigation.flatMap((item) =>
            item.feature_key ? [item.feature_key] : [],
          ),
        );
        const prior = await this.presentations.find(
          tx,
          tenant,
          appId,
          query.locale,
          query.surface_id ?? null,
          true,
        );
        if (prior) requireVersion(prior.version, context.precondition);
        else if (context.precondition?.kind !== "create")
          throw new SystemError(
            "VERSION_CONFLICT",
            "Presentation does not exist",
          );
        return this.presentations.put(
          tx,
          tenant,
          appId,
          query.locale,
          query.surface_id ?? null,
          input,
        );
      },
    );
  }
}
