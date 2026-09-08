import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { tenantScope } from "../../access/tenant-scope.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { requireVersion } from "../../http/conditional-request.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { ApplicationRepository } from "./application.repository.js";
import { applicationSchema } from "./schemas/application.schema.js";
import type { applicationInputSchema } from "./schemas/application.schema.js";
@Injectable()
export class ApplicationService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(ApplicationRepository)
    private readonly applications: ApplicationRepository,
  ) {}
  public list(context: RequestContext, input: PageInput) {
    const tenant = tenantScope(context);
    const query = pageQuery(input, "applications", tenant);
    return this.database.read(async (tx) =>
      pageResult(
        await this.applications.list(tx, tenant, query),
        query,
        "applications",
        tenant,
      ),
    );
  }
  public get(context: RequestContext, id: string) {
    return this.database.read((tx) =>
      this.applications.find(tx, tenantScope(context), id),
    );
  }
  public create(
    context: RequestContext,
    input: z.infer<typeof applicationInputSchema>,
  ) {
    return this.receipts.run(context, input, applicationSchema, async (tx) => {
      const tenant = tenantScope(context);
      await this.applications.lockSite(tx, tenant, input.site_id);
      await this.applications.lockProduct(tx, input.product_id);
      return this.applications.create(tx, tenant, input);
    });
  }
  public update(
    context: RequestContext,
    id: string,
    input: { display_name: string },
  ) {
    return this.receipts.run(context, input, applicationSchema, async (tx) => {
      const tenant = tenantScope(context);
      const snapshot = await this.applications.find(tx, tenant, id);
      await this.applications.lockSite(tx, tenant, snapshot.site_id);
      await this.applications.lockProduct(tx, snapshot.product_id);
      const current = await this.applications.find(tx, tenant, id, false, true);
      requireVersion(current.version, context.precondition);
      return this.applications.update(tx, tenant, id, input.display_name);
    });
  }
  public remove(context: RequestContext, id: string) {
    return this.receipts.run(context, null, applicationSchema, async (tx) => {
      const tenant = tenantScope(context);
      const snapshot = await this.applications.find(tx, tenant, id);
      await this.applications.lockSite(tx, tenant, snapshot.site_id, false);
      await this.applications.lockProduct(tx, snapshot.product_id);
      const current = await this.applications.find(tx, tenant, id, false, true);
      requireVersion(current.version, context.precondition);
      return this.applications.remove(tx, tenant, id, context.actorId);
    });
  }
  public restore(context: RequestContext, id: string) {
    return this.receipts.run(context, null, applicationSchema, async (tx) => {
      const tenant = tenantScope(context);
      const snapshot = await this.applications.find(tx, tenant, id, true);
      await this.applications.lockSite(tx, tenant, snapshot.site_id);
      await this.applications.lockProduct(tx, snapshot.product_id);
      const current = await this.applications.find(tx, tenant, id, true, true);
      requireVersion(current.version, context.precondition);
      return this.applications.restore(tx, tenant, id);
    });
  }
}
