import { Inject, Injectable } from "@nestjs/common";
import type { RequestContext } from "../../access/request-context.js";
import { tenantScope } from "../../access/tenant-scope.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { requireVersion } from "../../http/conditional-request.js";
import { OwnerError } from "../../http/owner-error.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { ReleaseRepository } from "./release.repository.js";
import { releaseSchema } from "./schemas/release.schema.js";
@Injectable()
export class ReleaseService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(ReleaseRepository) private readonly releases: ReleaseRepository,
  ) {}
  public list(context: RequestContext, input: PageInput) {
    const tenant = tenantScope(context),
      query = pageQuery(input, "releases", tenant);
    return this.database.read(async (tx) =>
      pageResult(
        await this.releases.list(tx, tenant, query),
        query,
        "releases",
        tenant,
      ),
    );
  }
  public get(context: RequestContext, id: string) {
    return this.database.read((tx) =>
      this.releases.find(tx, tenantScope(context), id),
    );
  }
  public create(
    context: RequestContext,
    input: { release_key: string; digest: string },
  ) {
    return this.receipts.run(context, input, releaseSchema, (tx) =>
      this.releases.create(tx, tenantScope(context), input),
    );
  }
  public validate(context: RequestContext, id: string) {
    return this.receipts.run(context, null, releaseSchema, async (tx) => {
      const tenant = tenantScope(context),
        current = await this.releases.find(tx, tenant, id, true);
      requireVersion(current.version, context.precondition);
      if (current.status !== "draft" && current.status !== "validated")
        throw new OwnerError(
          "INVALID_STATE",
          "Release cannot be validated",
          409,
        );
      return this.releases.validate(
        tx,
        tenant,
        id,
        await this.releases.contentDigest(tx, tenant, id),
      );
    });
  }
  public publish(context: RequestContext, id: string) {
    return this.receipts.run(context, null, releaseSchema, async (tx) => {
      const tenant = tenantScope(context),
        current = await this.releases.find(tx, tenant, id, true);
      requireVersion(current.version, context.precondition);
      if (current.status !== "validated")
        throw new OwnerError("INVALID_STATE", "Release must be validated", 409);
      if (
        current.digest !== (await this.releases.contentDigest(tx, tenant, id))
      )
        throw new OwnerError(
          "VERSION_CONFLICT",
          "Release content changed",
          409,
        );
      return this.releases.publish(tx, tenant, id);
    });
  }
  public retire(context: RequestContext, id: string) {
    return this.receipts.run(context, null, releaseSchema, async (tx) => {
      const tenant = tenantScope(context),
        current = await this.releases.find(tx, tenant, id, true);
      requireVersion(current.version, context.precondition);
      if (current.status !== "published")
        throw new OwnerError(
          "INVALID_STATE",
          "Only published release can retire",
          409,
        );
      return this.releases.retire(tx, tenant, id);
    });
  }
}
