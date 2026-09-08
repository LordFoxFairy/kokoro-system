import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { tenantScope } from "../../access/tenant-scope.js";
import { CacheService } from "../../cache/cache.service.js";
import { commandDigest } from "../../database/command-digest.js";
import { SystemError } from "../../system.error.js";
import { SitesService } from "../sites/sites.public.js";
import { ProductProjectionService } from "../products/products.public.js";
import { RuntimeManifestRepository } from "./runtime-manifest.repository.js";
import { manifestSchema } from "./schemas/manifest.schema.js";
import type { manifestQuerySchema } from "./schemas/manifest.schema.js";
@Injectable()
export class RuntimeManifestService {
  public constructor(
    @Inject(SitesService) private readonly sites: SitesService,
    @Inject(ProductProjectionService)
    private readonly products: ProductProjectionService,
    @Inject(RuntimeManifestRepository)
    private readonly repository: RuntimeManifestRepository,
    @Inject(CacheService) private readonly cache: CacheService,
  ) {}
  public async get(
    context: RequestContext,
    host: string,
    query: z.infer<typeof manifestQuerySchema>,
  ) {
    const tenant = tenantScope(context);
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await this.repository.generations(tenant);
      const { site, policy } = await this.sites.resolveManifestSite(
        context,
        host,
      );
      const product = await this.products.product(query.product_id);
      const locale = query.locale ?? policy.default_locale;
      if (
        !policy.allowed_products.includes(product.product_key) ||
        !policy.allowed_locales.includes(locale) ||
        (!policy.public_manifest &&
          !context.permissions.includes("system:read"))
      )
        throw new SystemError("POLICY_DENIED", "Manifest policy denied");
      const surface = query.surface_id ?? null;
      const identity = {
        tenant_id: tenant,
        site_id: site.id,
        product_id: query.product_id,
        locale,
        surface_id: surface,
        ...before,
      };
      const key = `manifest:${commandDigest(identity)}`;
      const cached = await this.cache.get(key);
      if (cached !== null) {
        const parsed = manifestSchema.safeParse(JSON.parse(cached));
        if (!parsed.success)
          throw new SystemError(
            "SYSTEM_UNAVAILABLE",
            "Cached manifest is invalid",
            true,
          );
        const after = await this.repository.generations(tenant);
        if (commandDigest(before) !== commandDigest(after)) continue;
        const value = parsed.data;
        const { digest, ...payload } = value;
        if (commandDigest(payload) !== digest)
          throw new SystemError(
            "SYSTEM_UNAVAILABLE",
            "Cached manifest digest is invalid",
            true,
          );
        if (
          value.tenant_id !== tenant ||
          value.site_id !== site.id ||
          value.product_id !== query.product_id ||
          value.locale !== locale ||
          value.surface_id !== surface ||
          value.generation !== before.generation ||
          value.catalog_generation !== before.catalog_generation
        )
          throw new SystemError(
            "SYSTEM_UNAVAILABLE",
            "Cached manifest identity is invalid",
            true,
          );
        return value;
      }
      const projection = await this.products.resolve(
        tenant,
        site.id,
        product.id,
        locale,
        surface,
      );
      const payload = { ...identity, ...projection };
      const value = manifestSchema.parse({
        ...payload,
        digest: commandDigest(payload),
      });
      if (
        commandDigest(before) !==
        commandDigest(await this.repository.generations(tenant))
      )
        continue;
      await this.cache.set(key, JSON.stringify(value));
      if (
        commandDigest(before) !==
        commandDigest(await this.repository.generations(tenant))
      ) {
        await this.cache.remove(key);
        continue;
      }
      return value;
    }
    throw new SystemError(
      "SYSTEM_UNAVAILABLE",
      "Manifest changed during read",
      true,
    );
  }
}
