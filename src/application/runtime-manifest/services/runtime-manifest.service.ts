import { createHash } from "node:crypto";
import type {
  ManifestCache,
  SiteHostResolver,
  SystemRepository,
} from "../ports/index.js";
import type {
  RuntimeManifest,
  TenantRequestContext,
} from "../../../domain/runtime-manifest/models/index.js";

function cacheKey(
  context: TenantRequestContext,
  productId: string,
  locale: string,
): string {
  return `manifest:${context.tenantId}:${productId}:${locale}:${context.surfaceId ?? "default"}`;
}
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
    const key = cacheKey(input.context, input.productId, input.locale);
    const cached = await this.cache.get(key);
    if (cached !== null) {
      if (
        cached.tenantId !== input.context.tenantId ||
        cached.productId !== input.productId ||
        cached.locale !== input.locale
      )
        throw new Error("runtime manifest cache identity mismatch");
      return cached;
    }
    const manifest = await this.repository.getManifest({
      context: input.context,
      productId: input.productId,
      locale: input.locale,
    });
    await this.cache.set(key, manifest, 30);
    return manifest;
  }
}
export function manifestDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
