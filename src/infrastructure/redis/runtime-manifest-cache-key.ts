import type { ManifestCacheIdentity } from "../../application/runtime-manifest/ports/index.js";

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function generation(value: string): string {
  if (!/^(0|[1-9][0-9]*)$/u.test(value))
    throw new Error("runtime manifest cache generation is invalid");
  return value;
}

export function runtimeManifestTenantPrefix(
  namespace: string,
  tenantId: string,
): string {
  return `${namespace}:manifest:v2:tenant:${encode(tenantId)}:`;
}

export function runtimeManifestTenantPattern(
  namespace: string,
  tenantId: string,
): string {
  return `${runtimeManifestTenantPrefix(namespace, tenantId)}*`;
}

export function runtimeManifestCacheKey(
  namespace: string,
  identity: ManifestCacheIdentity,
): string {
  const surface =
    identity.surfaceId === null
      ? "none"
      : `value:${encode(identity.surfaceId)}`;
  return `${runtimeManifestTenantPrefix(namespace, identity.tenantId)}generation:${generation(identity.generation)}:product:${encode(identity.productId)}:locale:${encode(identity.locale)}:surface:${surface}`;
}
