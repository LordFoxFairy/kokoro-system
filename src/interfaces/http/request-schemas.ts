import type { IncomingHttpHeaders } from "node:http";
import type { PageRequest } from "../../application/system/dto/index.js";
import type { TenantRequestContext } from "../../domain/runtime-manifest/models/index.js";
import { normalizeHost } from "../../domain/runtime-manifest/services/host-normalizer.js";

export const MAX_JSON_BODY_BYTES = 1_000_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PERMISSIONS = ["system:read", "system:write", "system:publish"] as const;
const HEADER_VALUE_MAX_LENGTH = 160;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>;
export type JsonObject = Readonly<{ [key: string]: JsonValue }>;
export type HeaderSource = IncomingHttpHeaders | Headers;
export type ParsedRuntimeManifestQuery = Readonly<{
  productId: string;
  locale: string;
  surfaceId: string | null;
}>;

export class RequestValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

function headerValue(source: HeaderSource, name: string): string | string[] | undefined {
  return source instanceof Headers ? source.get(name) ?? undefined : source[name];
}

function parseHeader(
  source: HeaderSource,
  name: string,
  required: boolean,
  maxLength = HEADER_VALUE_MAX_LENGTH,
): string | null {
  const value = headerValue(source, name);
  if (value === undefined || value === null || value === "") {
    if (required) throw new RequestValidationError(`${name} is required`);
    return null;
  }
  if (Array.isArray(value) || typeof value !== "string")
    throw new RequestValidationError(`${name} is invalid`);
  const trimmed = value.trim();
  if (!trimmed)
    throw new RequestValidationError(`${name} is required`);
  if (trimmed.length > maxLength)
    throw new RequestValidationError(`${name} is invalid`);
  return trimmed;
}

export function optionalHeader(source: HeaderSource, name: string): string | null {
  return parseHeader(source, name, false);
}

export function requiredHeader(
  source: HeaderSource,
  name: string,
  maxLength = HEADER_VALUE_MAX_LENGTH,
): string {
  return parseHeader(source, name, true, maxLength) ?? "";
}

export function parseRequestId(
  value: string | string[] | undefined,
  fallback: string,
): string {
  const candidate =
    value === undefined
      ? null
      : Array.isArray(value)
        ? (() => {
            throw new RequestValidationError("x-kokoro-request-id is invalid");
          })()
        : value.trim();
  if (candidate === null) return fallback;
  if (!UUID_PATTERN.test(candidate))
    throw new RequestValidationError("x-kokoro-request-id is invalid");
  return candidate;
}

export function parseTraceId(source: HeaderSource, fallback: string): string {
  return optionalHeader(source, "x-kokoro-trace-id") ?? fallback;
}

export function parsePermissions(source: HeaderSource): readonly string[] {
  const value = optionalHeader(source, "x-kokoro-iam-permissions");
  if (value === null) return [];
  const permissions = value.split(",").map((permission) => permission.trim());
  if (
    permissions.length === 0 ||
    permissions.some(
      (permission) =>
        !PERMISSIONS.some((knownPermission) => knownPermission === permission),
    )
  )
    throw new RequestValidationError("x-kokoro-iam-permissions is invalid");
  return permissions;
}

export function parseContext(
  source: HeaderSource,
  requestId: string,
  surfaceId: string | null = null,
): TenantRequestContext {
  return {
    tenantId: requiredHeader(source, "x-kokoro-tenant-id"),
    actorId: optionalHeader(source, "x-kokoro-actor-id"),
    organizationId: optionalHeader(source, "x-kokoro-organization-id"),
    surfaceId,
    permissions: parsePermissions(source),
    correlationId: requestId,
  };
}

function queryValues(url: URL, name: string): readonly string[] {
  const values = url.searchParams.getAll(name);
  if (values.length > 1)
    throw new RequestValidationError(`${name} must appear once`);
  return values;
}

function assertQueryFields(url: URL, allowed: readonly string[]): void {
  const allowedFields = new Set(allowed);
  for (const name of url.searchParams.keys())
    if (!allowedFields.has(name))
      throw new RequestValidationError(`${name} is not allowed`);
}

function optionalQuery(url: URL, name: string): string | null {
  const value = queryValues(url, name)[0] ?? null;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > HEADER_VALUE_MAX_LENGTH)
    throw new RequestValidationError(`${name} is invalid`);
  return trimmed;
}

function requiredQuery(url: URL, name: string): string {
  return optionalQuery(url, name) ??
    (() => {
      throw new RequestValidationError(`${name} is required`);
    })();
}

export function parseRuntimeManifestQuery(url: URL): ParsedRuntimeManifestQuery {
  assertQueryFields(url, ["product_id", "locale", "surface_id"]);
  return {
    productId: requiredQuery(url, "product_id"),
    locale: optionalQuery(url, "locale") ?? "en-US",
    surfaceId: optionalQuery(url, "surface_id"),
  };
}

export function parsePageQuery(url: URL): PageRequest {
  assertQueryFields(url, ["cursor", "limit"]);
  const cursor = optionalQuery(url, "cursor");
  const rawLimit = optionalQuery(url, "limit");
  if (rawLimit === null)
    return cursor === null ? {} : { cursor };
  if (!/^\d+$/u.test(rawLimit))
    throw new RequestValidationError("limit is invalid");
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new RequestValidationError("limit must be between 1 and 100");
  return cursor === null ? { limit } : { cursor, limit };
}

export function parsePathUuid(value: string, name: string): string {
  if (!UUID_PATTERN.test(value))
    throw new RequestValidationError(`${name} is invalid`);
  return value;
}

export function parseHost(value: string): string {
  try {
    return normalizeHost(value);
  } catch {
    throw new RequestValidationError("host is invalid");
  }
}

export function parseContentLength(
  value: string | string[] | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value) || !/^\d+$/u.test(value))
    throw new RequestValidationError("content-length is invalid");
  const length = Number(value);
  if (!Number.isSafeInteger(length))
    throw new RequestValidationError("request body is too large");
  if (length > MAX_JSON_BODY_BYTES)
    throw new RequestValidationError("request body is too large");
  return length;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonValue);
}

function asJsonObject(value: unknown): JsonObject {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !isJsonValue(value)
  )
    throw new RequestValidationError("JSON body must be an object");
  return Object.fromEntries(Object.entries(value));
}

export async function readJsonObject(
  request: AsyncIterable<Uint8Array>,
  contentLength: string | string[] | undefined,
  onValidationError?: () => void,
): Promise<JsonObject> {
  const declaredLength = (() => {
    try {
      return parseContentLength(contentLength);
    } catch (error) {
      onValidationError?.();
      throw error;
    }
  })();
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.byteLength;
      if (size > MAX_JSON_BODY_BYTES) {
        onValidationError?.();
        throw new RequestValidationError("request body is too large");
      }
      chunks.push(Buffer.from(chunk));
    }
    if (declaredLength !== undefined && size !== declaredLength) {
      onValidationError?.();
      throw new RequestValidationError("content-length is invalid");
    }
    return asJsonObject(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError("request body must be valid JSON");
  }
}
