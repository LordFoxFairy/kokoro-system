import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { tenantScope } from "../../access/tenant-scope.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { requireVersion } from "../../http/conditional-request.js";
import { OwnerError } from "../../http/owner-error.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { WorkspaceRepository } from "./workspace.repository.js";
import { workspaceSchema } from "./schemas/workspace.schema.js";
import type { workspaceInputSchema } from "./schemas/workspace.schema.js";
@Injectable()
export class WorkspacesService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(WorkspaceRepository)
    private readonly workspaces: WorkspaceRepository,
  ) {}
  public list(context: RequestContext, input: PageInput) {
    const tenant = tenantScope(context);
    const query = pageQuery(input, "workspaces", tenant);
    return this.database.read(async (tx) =>
      pageResult(
        await this.workspaces.list(tx, tenant, query),
        query,
        "workspaces",
        tenant,
      ),
    );
  }
  public get(context: RequestContext, id: string) {
    return this.database.read((tx) =>
      this.workspaces.find(tx, tenantScope(context), id),
    );
  }
  public create(
    context: RequestContext,
    input: z.infer<typeof workspaceInputSchema>,
  ) {
    return this.receipts.run(context, input, workspaceSchema, async (tx) => {
      const tenant = tenantScope(context);
      await this.workspaces.lockSite(tx, tenant, input.site_id);
      return this.workspaces.create(tx, tenant, input);
    });
  }
  public update(context: RequestContext, id: string, input: { name: string }) {
    return this.receipts.run(context, input, workspaceSchema, async (tx) => {
      const tenant = tenantScope(context);
      const snapshot = await this.workspaces.find(tx, tenant, id);
      await this.workspaces.lockSite(tx, tenant, snapshot.site_id);
      const current = await this.workspaces.find(tx, tenant, id, false, true);
      requireVersion(current.version, context.precondition);
      return this.workspaces.update(tx, tenant, id, input.name);
    });
  }
  public remove(context: RequestContext, id: string) {
    return this.receipts.run(context, null, workspaceSchema, async (tx) => {
      const tenant = tenantScope(context);
      const snapshot = await this.workspaces.find(tx, tenant, id);
      await this.workspaces.lockSite(tx, tenant, snapshot.site_id, false);
      const current = await this.workspaces.find(tx, tenant, id, false, true);
      requireVersion(current.version, context.precondition);
      return this.workspaces.remove(tx, tenant, id, context.actorId);
    });
  }
  public restore(context: RequestContext, id: string) {
    return this.receipts.run(context, null, workspaceSchema, async (tx) => {
      const tenant = tenantScope(context);
      const snapshot = await this.workspaces.find(tx, tenant, id, true);
      await this.workspaces.lockSite(tx, tenant, snapshot.site_id);
      const current = await this.workspaces.find(tx, tenant, id, true, true);
      requireVersion(current.version, context.precondition);
      if (!current.deleted_at)
        throw new OwnerError("INVALID_STATE", "Workspace not deleted", 409);
      return this.workspaces.restore(tx, tenant, id);
    });
  }
}
