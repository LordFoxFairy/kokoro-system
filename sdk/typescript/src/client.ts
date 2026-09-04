import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export type RuntimeManifest = Readonly<{
  tenantId: string;
  productId: string;
  locale: string;
  navigation: readonly unknown[];
  localeNamespaces: readonly unknown[];
  theme: Readonly<Record<string, unknown>>;
  featureFlags: readonly unknown[];
  references: readonly unknown[];
  configVersion: string;
  releaseId: string | null;
  digest: string;
}>;

export type RuntimeManifestRequest = Readonly<{
  productId: string;
  locale?: string;
  surfaceId?: string;
}>;

type RuntimeManifestWire = Readonly<{
  tenant_id: string;
  product_id: string;
  locale: string;
  navigation: readonly unknown[];
  locale_namespaces: readonly unknown[];
  theme: Readonly<Record<string, unknown>>;
  feature_flags: readonly unknown[];
  references: readonly unknown[];
  config_version: string;
  release_id: string | null;
  digest: string;
}>;

export type SystemClientOptions = Readonly<{
  baseUrl: string;
  tenantId: string;
  tenantHost: string;
  serviceToken?: string;
  workloadToken?: string;
  actorId?: string;
  requestId?: () => string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}>;

export type SystemClient = Readonly<{
  getRuntimeManifest(request: RuntimeManifestRequest): Promise<RuntimeManifest>;
}>;

export class SystemSdkError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly details: unknown;

  constructor(
    message: string,
    options: Readonly<{
      status: number;
      code: string;
      requestId: string;
      details?: unknown;
    }>,
  ) {
    super(message);
    this.name = "SystemSdkError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
  }
}

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function createSystemClient(options: SystemClientOptions): SystemClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const tenantId = requireValue("tenantId", options.tenantId);
  const tenantHost = normalizeHost(options.tenantHost);
  const workloadToken = optionalValue("workloadToken", options.workloadToken);
  const serviceToken = optionalValue("serviceToken", options.serviceToken ?? workloadToken);
  const actorId = optionalValue("actorId", options.actorId);
  const requestId = options.requestId ?? randomUUID;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const fetcher =
    options.fetch ??
    ((input: RequestInfo | URL, init?: RequestInit) =>
      requestWithHost(input, init, tenantHost));

  if (timeoutMs <= 0 || !Number.isFinite(timeoutMs))
    throw new Error("timeoutMs must be positive");
  if (typeof fetcher !== "function") throw new Error("fetch is required");

  return {
    getRuntimeManifest: (request) =>
      getRuntimeManifest({
        baseUrl,
        tenantId,
        tenantHost,
        serviceToken,
        actorId,
        requestId,
        timeoutMs,
        fetcher,
        request,
      }),
  };
}

async function getRuntimeManifest(
  options: Readonly<{
    baseUrl: string;
    tenantId: string;
    tenantHost: string;
    serviceToken: string | undefined;
    actorId: string | undefined;
    requestId: () => string;
    timeoutMs: number;
    fetcher: typeof globalThis.fetch;
    request: RuntimeManifestRequest;
  }>,
): Promise<RuntimeManifest> {
  const productId = requireValue("productId", options.request.productId);
  const requestId = requireRequestId(options.requestId());
  const url = new URL(`${options.baseUrl}/v1/system/runtime-manifest`);
  url.searchParams.set("product_id", productId);
  if (options.request.locale !== undefined)
    url.searchParams.set(
      "locale",
      requireValue("locale", options.request.locale),
    );
  if (options.request.surfaceId !== undefined)
    url.searchParams.set(
      "surface_id",
      requireValue("surfaceId", options.request.surfaceId),
    );

  const headers: Record<string, string> = {
    host: options.tenantHost,
    "x-kokoro-request-id": requestId,
    "x-kokoro-tenant-id": options.tenantId,
  };
  if (options.serviceToken !== undefined)
    Object.assign(headers, {
      authorization: `Bearer ${options.serviceToken}`,
      "x-kokoro-internal-secret": options.serviceToken,
      "x-kokoro-service": "web-bff",
    });
  if (options.actorId !== undefined)
    headers["x-kokoro-actor-id"] = options.actorId;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetcher(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new SystemSdkError(
        `System API request failed with HTTP ${response.status}`,
        {
          status: response.status,
          code: `HTTP_${response.status}`,
          requestId,
          details: sanitizeErrorDetails(body),
        },
      );
    }
    if (!isRuntimeManifestEnvelope(body)) {
      throw new SystemSdkError("runtime manifest response is invalid", {
        status: response.status,
        code: "INVALID_RESPONSE",
        requestId,
        details: sanitizeErrorDetails(body),
      });
    }
    return runtimeManifestFromWire(body.data);
  } catch (error) {
    if (error instanceof SystemSdkError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SystemSdkError("System API request timed out", {
        status: 408,
        code: "TIMEOUT",
        requestId,
      });
    }
    throw new SystemSdkError("System API request failed", {
      status: 0,
      code: "NETWORK_ERROR",
      requestId,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isRuntimeManifestEnvelope(
  value: unknown,
): value is { data: RuntimeManifestWire } {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  const data = value.data;
  return (
    typeof data.tenant_id === "string" &&
    typeof data.product_id === "string" &&
    typeof data.locale === "string" &&
    Array.isArray(data.navigation) &&
    Array.isArray(data.locale_namespaces) &&
    isRecord(data.theme) &&
    Array.isArray(data.feature_flags) &&
    Array.isArray(data.references) &&
    typeof data.config_version === "string" &&
    /^(0|[1-9][0-9]*)$/u.test(data.config_version) &&
    (data.release_id === null || typeof data.release_id === "string") &&
    typeof data.digest === "string"
  );
}

function runtimeManifestFromWire(value: RuntimeManifestWire): RuntimeManifest {
  return {
    tenantId: value.tenant_id,
    productId: value.product_id,
    locale: value.locale,
    navigation: value.navigation,
    localeNamespaces: value.locale_namespaces,
    theme: value.theme,
    featureFlags: value.feature_flags,
    references: value.references,
    configVersion: value.config_version,
    releaseId: value.release_id,
    digest: value.digest,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Error bodies are provider-owned input and must not cross the SDK boundary
 * wholesale. In particular, an upstream proxy may accidentally include a
 * bearer token, internal URL, cookie, or database diagnostic. The stable SDK
 * error code/status/requestId already carries the actionable contract data.
 */
function sanitizeErrorDetails(
  value: unknown,
): Readonly<{ code: string }> | undefined {
  if (!isRecord(value)) return undefined;
  const code = isRecord(value.error) ? value.error.code : value.code;
  return typeof code === "string" && /^[A-Z][A-Z0-9_.-]{0,63}$/u.test(code)
    ? { code }
    : undefined;
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("baseUrl must use http or https");
  return parsed.toString().replace(/\/$/u, "");
}

function normalizeHost(value: string): string {
  const host = requireValue("tenantHost", value).replace(/\/$/u, "");
  if (host.includes("/") || /\s/u.test(host))
    throw new Error("tenantHost must be a hostname or host:port");
  return host;
}

function requireValue(name: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}

function optionalValue(
  name: string,
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  return requireValue(name, value);
}

function requireRequestId(value: string): string {
  if (!requestIdPattern.test(value))
    throw new Error("requestId must be a UUID");
  return value;
}

function requestWithHost(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  tenantHost: string,
): Promise<Response> {
  const requestUrl =
    typeof input === "string"
      ? new URL(input)
      : input instanceof URL
        ? input
        : new URL(input.url);
  const headers = new Headers(init?.headers);
  headers.set("host", tenantHost);
  const requestFunction =
    requestUrl.protocol === "https:"
      ? httpsRequest
      : requestUrl.protocol === "http:"
        ? httpRequest
        : null;
  if (requestFunction === null)
    return Promise.reject(
      new Error(`unsupported protocol: ${requestUrl.protocol}`),
    );

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const signal = init?.signal;
    const abortError = () =>
      new DOMException("The operation was aborted", "AbortError");
    const request = requestFunction(
      {
        hostname: requestUrl.hostname,
        port: requestUrl.port || undefined,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        method: init?.method ?? "GET",
        headers: Object.fromEntries(headers.entries()),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          if (settled) return;
          settled = true;
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (typeof value === "string") responseHeaders.set(name, value);
            else if (Array.isArray(value))
              responseHeaders.set(name, value.join(", "));
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 0,
              statusText: response.statusMessage ?? "",
              headers: responseHeaders,
            }),
          );
        });
        response.on("error", (error) => {
          if (!settled) {
            settled = true;
            reject(error);
          }
        });
      },
    );
    const abort = (): void => {
      if (!settled) {
        settled = true;
        request.destroy();
        reject(abortError());
      }
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    request.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    request.end(typeof init?.body === "string" ? init.body : undefined);
  });
}
