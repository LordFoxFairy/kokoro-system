import { SystemDomainError } from "../../../domain/system/errors/system-domain.error.js";
import type {
  ConfigRelease,
  Site,
  SitePolicy,
  SystemConfig,
  Workspace,
} from "../../../domain/system/models/index.js";

type RecordValue = Readonly<Record<string, unknown>>;

function record(value: unknown): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalidReceipt();
  return Object.fromEntries(Object.entries(value));
}

function string(value: unknown): string {
  if (typeof value !== "string") throw invalidReceipt();
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return string(value);
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw invalidReceipt();
  return value;
}

function positiveIntegerString(value: unknown): string {
  const candidate = string(value);
  if (!/^[1-9][0-9]*$/u.test(candidate)) throw invalidReceipt();
  return candidate;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidReceipt();
  return value;
}

function strings(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw invalidReceipt();
  return value.map(string);
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): T[number] {
  const candidate = string(value);
  if (!choices.includes(candidate)) throw invalidReceipt();
  return candidate;
}

function invalidReceipt(): SystemDomainError {
  return new SystemDomainError(
    "SYSTEM_UNAVAILABLE",
    "stored command receipt is invalid",
    503,
  );
}

export function parseSiteReceipt(value: unknown): Site {
  const input = record(value);
  return {
    id: string(input.id),
    tenantId: string(input.tenantId),
    siteKey: string(input.siteKey),
    hostnames: strings(input.hostnames),
    displayName: string(input.displayName),
    status: oneOf(input.status, ["draft", "active", "suspended", "archived"]),
    version: positiveIntegerString(input.version),
    createdAt: string(input.createdAt),
    updatedAt: string(input.updatedAt),
  };
}

export function parseWorkspaceReceipt(value: unknown): Workspace {
  const input = record(value);
  return {
    id: string(input.id),
    tenantId: string(input.tenantId),
    siteId: string(input.siteId),
    workspaceKey: string(input.workspaceKey),
    name: string(input.name),
    status: oneOf(input.status, ["active", "archived"]),
    version: positiveIntegerString(input.version),
    createdAt: string(input.createdAt),
    updatedAt: string(input.updatedAt),
  };
}

export function parsePolicyReceipt(value: unknown): SitePolicy {
  const input = record(value);
  return {
    id: string(input.id),
    tenantId: string(input.tenantId),
    siteId: string(input.siteId),
    version: positiveIntegerString(input.version),
    status: oneOf(input.status, ["active", "archived"]),
    defaultLocale: string(input.defaultLocale),
    allowedLocales: strings(input.allowedLocales),
    allowedProducts: strings(input.allowedProducts),
    publicManifest: boolean(input.publicManifest),
    updatedAt: string(input.updatedAt),
  };
}

export function parseReleaseReceipt(value: unknown): ConfigRelease {
  const input = record(value);
  return {
    id: string(input.id),
    tenantId: string(input.tenantId),
    releaseKey: string(input.releaseKey),
    status: oneOf(input.status, ["draft", "validated", "published", "retired"]),
    digest: string(input.digest),
    publishedAt: nullableString(input.publishedAt),
    version: positiveIntegerString(input.version),
    createdAt: string(input.createdAt),
    updatedAt: string(input.updatedAt),
  };
}

export function parseConfigReceipt(value: unknown): SystemConfig {
  const input = record(value);
  return {
    id: string(input.id),
    tenantId: nullableString(input.tenantId),
    moduleKey: string(input.moduleKey),
    configKey: string(input.configKey),
    scopeType: oneOf(input.scopeType, ["global", "tenant", "product", "surface"]),
    scopeId: nullableString(input.scopeId),
    productId: nullableString(input.productId),
    locale: nullableString(input.locale),
    value: input.value,
    schemaVersion: number(input.schemaVersion),
    status: oneOf(input.status, ["active", "deleted"]),
    configVersion: positiveIntegerString(input.configVersion),
    releaseId: nullableString(input.releaseId),
    digest: string(input.digest),
    updatedAt: string(input.updatedAt),
  };
}
