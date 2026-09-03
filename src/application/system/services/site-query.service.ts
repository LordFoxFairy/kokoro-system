import type { SiteHostResolver } from "../../runtime-manifest/ports/index.js";
import type { TenantRequestContext } from "../../../domain/runtime-manifest/models/index.js";
import type { SiteResolution } from "../../../domain/system/models/index.js";
import { SystemDomainError } from "../../../domain/system/errors/system-domain.error.js";

/** Application query used by the generated SiteService RPC implementation. */
export class SiteQueryService {
  public constructor(private readonly resolver: SiteHostResolver) {}

  public async resolveSiteByHost(
    context: TenantRequestContext,
    host: string,
  ): Promise<SiteResolution> {
    if (!host.trim())
      throw new SystemDomainError("INVALID_ARGUMENT", "host is required");
    return this.resolver.resolve({ context, host });
  }
}
