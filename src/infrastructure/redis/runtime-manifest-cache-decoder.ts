import type { RuntimeManifest } from "../../domain/runtime-manifest/models/index.js";

type RecordValue = Readonly<Record<string, unknown>>;

function invalid(): Error {
  return new Error("runtime manifest cache entry is invalid");
}

function record(value: unknown): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalid();
  return Object.fromEntries(Object.entries(value));
}

function string(value: unknown): string {
  if (typeof value !== "string") throw invalid();
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return string(value);
}

function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw invalid();
  return [...value];
}

export function decodeRuntimeManifestCache(value: string): RuntimeManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalid();
  }
  const input = record(parsed);
  return {
    tenantId: string(input.tenantId),
    productId: string(input.productId),
    locale: string(input.locale),
    navigation: array(input.navigation),
    localeNamespaces: array(input.localeNamespaces),
    theme: record(input.theme),
    featureFlags: array(input.featureFlags),
    references: array(input.references),
    configVersion: string(input.configVersion),
    releaseId: nullableString(input.releaseId),
    digest: string(input.digest),
  };
}
