import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { RuntimeManifestService } from "../../application/runtime-manifest/services/runtime-manifest.service.js";
import type { TenantRequestContext } from "../../domain/runtime-manifest/models/index.js";
import { SystemDomainError } from "../../domain/system/errors/system-domain.error.js";
import type {
  ConfigInput,
  PageRequest,
  ReleaseInput,
  SiteInput,
  WorkspaceInput,
} from "../../application/system/dto/index.js";
import type { SystemControlService } from "../../application/system/services/system-control.service.js";
import type { SiteQueryService } from "../../application/system/services/site-query.service.js";
import {
  requireBffServiceAuth,
  ServiceAuthError,
  ServiceAuthNotConfiguredError,
} from "./service-auth.js";
import {
  configToWire,
  pageToWire,
  releaseToWire,
  runtimeManifestToWire,
  sitePolicyToWire,
  siteToWire,
  workspaceToWire,
} from "./wire-mappers.js";
import { createSiteServiceHandler } from "../rpc/site-service.js";
import type { StructuredLogger } from "../observability/structured-logger.js";

class RequestValidationError extends Error {}
type JsonRecord = Readonly<Record<string, unknown>>;
type HttpOptions = Readonly<{
  control?: SystemControlService;
  siteQuery?: Pick<SiteQueryService, "resolveSiteByHost">;
  bffServiceToken?: string | null;
  onUnexpectedError?: (error: unknown, requestId: string) => void;
  logger?: StructuredLogger;
}>;

function operation(method: string | undefined, path: string): string {
  const verb = method ?? "UNKNOWN";
  if (path === "/kokoro.site.v1.SiteService/ResolveSiteByHost")
    return "rpc.SiteService.ResolveSiteByHost";
  if (/^\/v1\/system\/sites\/[^/]+\/policy$/u.test(path))
    return `http.${verb}.v1.system.site_policy`;
  const transition =
    /^\/v1\/system\/releases\/[^/]+\/(validate|publish|retire)$/u.exec(path);
  if (transition)
    return `http.${verb}.v1.system.release.${transition[1] ?? "transition"}`;
  const route = path
    .split("/")
    .filter(Boolean)
    .join(".");
  return `http.${verb}.${route || "root"}`;
}

function durationMs(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function send(
  response: ServerResponse,
  status: number,
  value: unknown,
  requestId: string,
): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("x-kokoro-request-id", requestId);
  response.end(JSON.stringify(value));
}
function sendSuccess(
  response: ServerResponse,
  status: number,
  data: unknown,
  requestId: string,
): void {
  send(response, status, { data, meta: { request_id: requestId } }, requestId);
}
function sendError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
  requestId: string,
): void {
  send(
    response,
    status,
    { error: { code, message }, meta: { request_id: requestId } },
    requestId,
  );
}
function requiredHeader(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  if (typeof value !== "string" || value.trim() === "")
    throw new RequestValidationError(`${name} is required`);
  return value.trim();
}
function optionalHeader(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function forwardedHost(request: IncomingMessage): string {
  const forwarded = optionalHeader(request, "forwarded");
  if (forwarded) {
    const first = forwarded.split(",", 1)[0] ?? "";
    const match =
      /(?:^|;)\s*host=(?:"([^"\\]*(?:\\.[^"\\]*)*)"|([^;\s]+))/iu.exec(first);
    const host = match?.[1] ?? match?.[2];
    if (host) return host;
  }
  return optionalHeader(request, "host") ?? "";
}
function requiredQuery(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value?.trim()) throw new RequestValidationError(`${name} is required`);
  return value.trim();
}
function context(
  request: IncomingMessage,
  requestId: string,
  surfaceId: string | null = null,
): TenantRequestContext {
  const permissionHeader = optionalHeader(request, "x-kokoro-iam-permissions");
  return {
    tenantId: requiredHeader(request, "x-kokoro-tenant-id"),
    actorId: optionalHeader(request, "x-kokoro-actor-id"),
    organizationId: optionalHeader(request, "x-kokoro-organization-id"),
    surfaceId,
    permissions: permissionHeader
      ? permissionHeader
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [],
    correlationId: requestId,
  };
}
function idempotencyKey(request: IncomingMessage): string {
  return requiredHeader(request, "idempotency-key");
}
function jsonRecord(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new RequestValidationError("JSON body must be an object");
  return Object.fromEntries(Object.entries(value));
}
async function body(request: IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = [];
  for await (const chunk of request)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  const raw = Buffer.concat(chunks);
  if (raw.length > 1_000_000)
    throw new RequestValidationError("request body is too large");
  try {
    return jsonRecord(JSON.parse(raw.toString("utf8")));
  } catch (error) {
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError("request body must be valid JSON");
  }
}
function stringField(input: JsonRecord, name: string): string {
  const value = input[name];
  if (typeof value !== "string" || !value.trim())
    throw new RequestValidationError(`${name} is required`);
  return value.trim();
}
function nullableStringField(input: JsonRecord, name: string): string | null {
  if (!Object.hasOwn(input, name))
    throw new RequestValidationError(`${name} is required`);
  const value = input[name];
  if (value === null) return null;
  if (typeof value !== "string")
    throw new RequestValidationError(`${name} must be a string or null`);
  return value;
}
function unknownField(input: JsonRecord, name: string): unknown {
  if (!Object.hasOwn(input, name))
    throw new RequestValidationError(`${name} is required`);
  return input[name];
}
function onlyFields(input: JsonRecord, allowed: readonly string[]): void {
  const allowedFields = new Set(allowed);
  const unexpected = Object.keys(input).find((name) => !allowedFields.has(name));
  if (unexpected !== undefined)
    throw new RequestValidationError(`${unexpected} is not allowed`);
}
function stringArray(input: JsonRecord, name: string): string[] {
  const value = input[name];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  )
    throw new RequestValidationError(`${name} must be a string array`);
  return value.map((item) => String(item).trim());
}
function booleanField(input: JsonRecord, name: string): boolean {
  const value = input[name];
  if (typeof value !== "boolean")
    throw new RequestValidationError(`${name} is required`);
  return value;
}
function scopeTypeField(input: JsonRecord): ConfigInput["scopeType"] {
  const value = stringField(input, "scope_type");
  switch (value) {
    case "global":
    case "tenant":
    case "product":
    case "surface":
      return value;
    default:
      throw new RequestValidationError("scope_type is invalid");
  }
}
function pageQuery(url: URL): PageRequest {
  const cursor = url.searchParams.get("cursor");
  const limit = url.searchParams.get("limit");
  return {
    ...(cursor === null ? {} : { cursor }),
    ...(limit === null ? {} : { limit: Number(limit) }),
  };
}
function controlRequired(
  control: SystemControlService | undefined,
): SystemControlService {
  if (!control)
    throw new SystemDomainError(
      "NOT_IMPLEMENTED",
      "system control plane is not configured",
      501,
    );
  return control;
}

export function createHttpServer(
  service: Pick<RuntimeManifestService, "get">,
  readiness: () => Promise<boolean>,
  options: HttpOptions = {},
): Server {
  const siteServiceHandler = options.siteQuery
    ? createSiteServiceHandler(
        options.siteQuery,
        options.bffServiceToken,
        options.onUnexpectedError,
      )
    : null;
  return createServer(async (request, response) => {
    const requestPath = new URL(request.url ?? "/", "http://localhost").pathname;
    const requestId =
      optionalHeader(request, "x-kokoro-request-id") ?? randomUUID();
    const traceId = optionalHeader(request, "x-kokoro-trace-id") ?? requestId;
    const startedAt = process.hrtime.bigint();
    response.once("finish", () => {
      if (!options.logger) return;
      const responseRequestId = response.getHeader("x-kokoro-request-id");
      try {
        options.logger.write({
          service: "kokoro-system",
          operation: operation(request.method, requestPath),
          request_id:
            typeof responseRequestId === "string"
              ? responseRequestId
              : requestId,
          trace_id: traceId,
          result: response.statusCode < 400 ? "success" : "error",
          duration_ms: durationMs(startedAt),
        });
      } catch {
        // Observability must never change the request outcome.
      }
    });
    if (
      siteServiceHandler !== null &&
      requestPath === "/kokoro.site.v1.SiteService/ResolveSiteByHost"
    )
      return siteServiceHandler(request, response);
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/healthz")
        return sendSuccess(
          response,
          200,
          { status: "ok", service: "kokoro-system" },
          requestId,
        );
      if (request.method === "GET" && url.pathname === "/readyz") {
        try {
          const ready = await readiness();
          return sendSuccess(
            response,
            ready ? 200 : 503,
            { status: ready ? "ready" : "not_ready", service: "kokoro-system" },
            requestId,
          );
        } catch {
          return sendError(
            response,
            503,
            "SYSTEM_UNAVAILABLE",
            "system unavailable",
            requestId,
          );
        }
      }
      const manifestRoute = url.pathname === "/v1/system/runtime-manifest";
      if (url.pathname.startsWith("/v1/system/"))
        requireBffServiceAuth(request, options.bffServiceToken);
      if (request.method === "GET" && manifestRoute) {
        const productId = requiredQuery(url, "product_id");
        const locale = url.searchParams.get("locale") ?? "en-US";
        const surfaceId = url.searchParams.get("surface_id") ?? null;
        const host = forwardedHost(request);
        const manifest = await service.get({
          context: context(request, requestId, surfaceId),
          productId,
          locale,
          host,
        });
        return sendSuccess(
          response,
          200,
          runtimeManifestToWire(manifest),
          requestId,
        );
      }
      const control = options.control;
      if (
        control &&
        url.pathname.startsWith("/v1/system/") &&
        url.pathname !== "/v1/system/runtime-manifest"
      ) {
        context(request, requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/system/sites")
        return sendSuccess(
          response,
          200,
          pageToWire(
            await controlRequired(control).listSites(
              context(request, requestId),
              pageQuery(url),
            ),
            siteToWire,
          ),
          requestId,
        );
      if (request.method === "POST" && url.pathname === "/v1/system/sites") {
        const input = await body(request);
        onlyFields(input, ["site_key", "hostname", "display_name"]);
        const value: SiteInput = {
          siteKey: stringField(input, "site_key"),
          hostname: stringField(input, "hostname"),
          displayName: stringField(input, "display_name"),
        };
        return sendSuccess(
          response,
          201,
          siteToWire(
            await controlRequired(control).createSite(
              context(request, requestId),
              value,
              idempotencyKey(request),
            ),
          ),
          requestId,
        );
      }
      if (
        request.method === "GET" &&
        url.pathname === "/v1/system/workspaces"
      )
        return sendSuccess(
          response,
          200,
          pageToWire(
            await controlRequired(control).listWorkspaces(
              context(request, requestId),
              pageQuery(url),
            ),
            workspaceToWire,
          ),
          requestId,
        );
      if (
        request.method === "POST" &&
        url.pathname === "/v1/system/workspaces"
      ) {
        const input = await body(request);
        onlyFields(input, ["site_id", "workspace_key", "name"]);
        const value: WorkspaceInput = {
          siteId: stringField(input, "site_id"),
          workspaceKey: stringField(input, "workspace_key"),
          name: stringField(input, "name"),
        };
        return sendSuccess(
          response,
          201,
          workspaceToWire(
            await controlRequired(control).createWorkspace(
              context(request, requestId),
              value,
              idempotencyKey(request),
            ),
          ),
          requestId,
        );
      }
      const policy = /^\/v1\/system\/sites\/([^/]+)\/policy$/u.exec(
        url.pathname,
      );
      if (policy && request.method === "GET")
        return sendSuccess(
          response,
          200,
          sitePolicyToWire(
            await controlRequired(control).getPolicy(
              context(request, requestId),
              policy[1] ?? "",
            ),
          ),
          requestId,
        );
      if (policy && request.method === "PUT") {
        const input = await body(request);
        onlyFields(input, [
          "default_locale",
          "allowed_locales",
          "allowed_products",
          "public_manifest",
        ]);
        const value = {
          version: 1,
          status: "active" as const,
          defaultLocale: stringField(input, "default_locale"),
          allowedLocales: stringArray(input, "allowed_locales"),
          allowedProducts: stringArray(input, "allowed_products"),
          publicManifest: booleanField(input, "public_manifest"),
        };
        return sendSuccess(
          response,
          200,
          sitePolicyToWire(
            await controlRequired(control).putPolicy(
              context(request, requestId),
              policy[1] ?? "",
              value,
              idempotencyKey(request),
            ),
          ),
          requestId,
        );
      }
      if (
        request.method === "POST" &&
        url.pathname === "/v1/system/releases"
      ) {
        const input = await body(request);
        onlyFields(input, ["release_key", "digest"]);
        const value: ReleaseInput = {
          releaseKey: stringField(input, "release_key"),
          digest: stringField(input, "digest"),
        };
        return sendSuccess(
          response,
          201,
          releaseToWire(
            await controlRequired(control).createRelease(
              context(request, requestId),
              value,
              idempotencyKey(request),
            ),
          ),
          requestId,
        );
      }
      if (request.method === "GET" && url.pathname === "/v1/system/config")
        return sendSuccess(
          response,
          200,
          pageToWire(
            await controlRequired(control).listConfigs(
              context(request, requestId),
              pageQuery(url),
            ),
            configToWire,
          ),
          requestId,
        );
      if (request.method === "POST" && url.pathname === "/v1/system/config") {
        const input = await body(request);
        onlyFields(input, [
          "module_key",
          "config_key",
          "scope_type",
          "scope_id",
          "product_id",
          "locale",
          "value",
          "schema_version",
          "release_id",
        ]);
        const scopeType = scopeTypeField(input);
        const schemaVersion = input.schema_version;
        if (
          typeof schemaVersion !== "number" ||
          !Number.isInteger(schemaVersion) ||
          schemaVersion < 1
        )
          throw new RequestValidationError("schema_version is invalid");
        const value: ConfigInput = {
          moduleKey: stringField(input, "module_key"),
          configKey: stringField(input, "config_key"),
          scopeType,
          scopeId: nullableStringField(input, "scope_id"),
          productId: nullableStringField(input, "product_id"),
          locale: nullableStringField(input, "locale"),
          value: unknownField(input, "value"),
          schemaVersion,
          releaseId: nullableStringField(input, "release_id"),
        };
        return sendSuccess(
          response,
          201,
          configToWire(
            await controlRequired(control).upsertConfig(
              context(request, requestId),
              value,
              idempotencyKey(request),
            ),
          ),
          requestId,
        );
      }
      const release =
        /^\/v1\/system\/releases\/([^/]+)\/(validate|publish|retire)$/u.exec(
          url.pathname,
        );
      if (release && request.method === "POST") {
        const id = release[1] ?? "";
        const key = idempotencyKey(request);
        const target = release[2];
        const value =
          target === "validate"
            ? await controlRequired(control).validateRelease(
                context(request, requestId),
                id,
                key,
              )
            : target === "publish"
              ? await controlRequired(control).publishRelease(
                  context(request, requestId),
                  id,
                  key,
                )
              : await controlRequired(control).retireRelease(
                  context(request, requestId),
                  id,
                  key,
                );
        return sendSuccess(response, 200, releaseToWire(value), requestId);
      }
      return sendError(response, 404, "NOT_FOUND", "not found", requestId);
    } catch (error) {
      if (error instanceof RequestValidationError)
        return sendError(
          response,
          400,
          "INVALID_ARGUMENT",
          error.message,
          requestId,
        );
      if (error instanceof ServiceAuthNotConfiguredError)
        return sendError(
          response,
          error.status,
          error.code,
          error.message,
          requestId,
        );
      if (error instanceof ServiceAuthError)
        return sendError(
          response,
          error.status,
          error.code,
          error.message,
          requestId,
        );
      if (error instanceof SystemDomainError)
        return sendError(
          response,
          error.status,
          error.code,
          error.message,
          requestId,
        );
      options.onUnexpectedError?.(error, requestId);
      return sendError(
        response,
        503,
        "SYSTEM_UNAVAILABLE",
        "system unavailable",
        requestId,
      );
    }
  });
}
