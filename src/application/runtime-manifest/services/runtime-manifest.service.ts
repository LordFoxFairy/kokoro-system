import { createHash } from "node:crypto";
import type {
  ManifestCacheIdentity,
  ManifestCache,
  SiteHostResolver,
  SystemRepository,
} from "../ports/index.js";
import type {
  RuntimeManifest,
  TenantRequestContext,
} from "../../../domain/runtime-manifest/models/index.js";

function cacheIdentity(
  context: TenantRequestContext,
  productId: string,
  locale: string,
  generation: string,
): ManifestCacheIdentity {
  return {
    tenantId: context.tenantId,
    productId,
    locale,
    surfaceId: context.surfaceId,
    generation,
  };
}

const MAX_GENERATION_FENCE_ATTEMPTS = 3;

export class RuntimeManifestService {
  public constructor(
    private readonly repository: SystemRepository,
    private readonly cache: ManifestCache,
    private readonly hostResolver: SiteHostResolver,
  ) {}
  public async get(
    input: Readonly<{
      context: TenantRequestContext;
      productId: string;
      locale: string;
      host: string;
    }>,
  ): Promise<RuntimeManifest> {
    await this.hostResolver.resolve({
      context: input.context,
      host: input.host,
    });
    for (let attempt = 0; attempt < MAX_GENERATION_FENCE_ATTEMPTS; attempt += 1) {
      const generation = await this.repository.getManifestGeneration(
        input.context.tenantId,
      );
      const identity = cacheIdentity(
        input.context,
        input.productId,
        input.locale,
        generation,
      );
      const cached = await this.cache.get(identity);
      if (cached !== null) {
        this.assertCacheIdentity(cached, input);
        if (await this.generationIsCurrent(input.context.tenantId, generation))
          return cached;
        await this.cache.delete(identity);
        continue;
      }
      const manifest = await this.repository.getManifest({
        context: input.context,
        productId: input.productId,
        locale: input.locale,
      });
      if (!(await this.generationIsCurrent(input.context.tenantId, generation)))
        continue;
      await this.cache.set(identity, manifest, 30);
      if (await this.generationIsCurrent(input.context.tenantId, generation))
        return manifest;
      await this.cache.delete(identity);
    }
    throw new Error("runtime manifest generation changed repeatedly");
  }

  private async generationIsCurrent(
    tenantId: string,
    generation: string,
  ): Promise<boolean> {
    return (
      (await this.repository.getManifestGeneration(tenantId)) === generation
    );
  }

  private assertCacheIdentity(
    cached: RuntimeManifest,
    input: Readonly<{
      context: TenantRequestContext;
      productId: string;
      locale: string;
    }>,
  ): void {
    if (
      cached.tenantId !== input.context.tenantId ||
      cached.productId !== input.productId ||
      cached.locale !== input.locale
    )
      throw new Error("runtime manifest cache identity mismatch");
  }
}
export function manifestDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
