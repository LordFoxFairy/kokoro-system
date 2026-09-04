import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { RuntimeManifestService } from "../../application/runtime-manifest/services/runtime-manifest.service.js";
import { SystemDomainError } from "../../domain/system/errors/system-domain.error.js";
import type {
  ConfigInput,
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
import {
  parseContext,
  parsePageQuery,
  parseHost,
  parsePathUuid,
  parseRequestId,
  parseRuntimeManifestQuery,
  parseTraceId,
  requiredHeader,
  readJsonObject,
  RequestValidationError,
  type JsonObject,
} from "./request-schemas.js";
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
function forwardedHost(request: IncomingMessage): string {
  const forwarded = request.headers.forwarded;
  if (forwarded) {
    if (Array.isArray(forwarded))
      throw new RequestValidationError("forwarded is invalid");
    const first = forwarded.split(",", 1)[0] ?? "";
    const match =
      /(?:^|;)\s*host=(?:"([^"\\]*(?:\\.[^"\\]*)*)"|([^;\s]+))/iu.exec(first);
    const host = match?.[1] ?? match?.[2];
    if (host?.trim()) return parseHost(host);
    throw new RequestValidationError("forwarded is invalid");
  }
  const host = request.headers.host;
  if (Array.isArray(host))
    throw new RequestValidationError("host is invalid");
  if (typeof host !== "string" || !host.trim())
    throw new RequestValidationError("host is required");
  return parseHost(host);
}
function stringField(
  input: JsonObject,
  name: string,
  maxLength = 160,
): string {
  const value = input[name];
  if (typeof value !== "string" || !value.trim())
    throw new RequestValidationError(`${name} is required`);
  if (value.trim().length > maxLength)
    throw new RequestValidationError(`${name} is invalid`);
  return value.trim();
}
function idempotencyKey(request: IncomingMessage): string {
  return requiredHeader(request.headers, "idempotency-key", 128);
}
function nullableStringField(input: JsonObject, name: string): string | null {
  if (!Object.hasOwn(input, name))
    throw new RequestValidationError(`${name} is required`);
  const value = input[name];
  if (value === null) return null;
  if (typeof value !== "string")
    throw new RequestValidationError(`${name} must be a string or null`);
  if (value.length > 160)
    throw new RequestValidationError(`${name} is invalid`);
  return value;
}
function jsonValueField(input: JsonObject, name: string): JsonObject[string] {
  if (!Object.hasOwn(input, name))
    throw new RequestValidationError(`${name} is required`);
  const value = input[name];
  if (value === undefined)
    throw new RequestValidationError(`${name} is required`);
  return value;
}
function onlyFields(input: JsonObject, allowed: readonly string[]): void {
  const allowedFields = new Set(allowed);
  const unexpected = Object.keys(input).find((name) => !allowedFields.has(name));
  if (unexpected !== undefined)
    throw new RequestValidationError(`${unexpected} is not allowed`);
}
function stringArray(input: JsonObject, name: string): string[] {
  const value = input[name];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  )
    throw new RequestValidationError(`${name} must be a string array`);
  return value.map((item) => String(item).trim());
}
function booleanField(input: JsonObject, name: string): boolean {
  const value = input[name];
  if (typeof value !== "boolean")
    throw new RequestValidationError(`${name} is required`);
  return value;
}
function scopeTypeField(input: JsonObject): ConfigInput["scopeType"] {
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
    let requestId: string = randomUUID();
    let traceId = requestId;
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
      requestId = parseRequestId(request.headers["x-kokoro-request-id"], requestId);
      traceId = parseTraceId(request.headers, requestId);
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
        const { productId, locale, surfaceId } = parseRuntimeManifestQuery(url);
        const host = forwardedHost(request);
        const manifest = await service.get({
          context: parseContext(request.headers, requestId, surfaceId),
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
        parseContext(request.headers, requestId);
      }
      if (request.method === "GET" && url.pathname === "/v1/system/sites")
        return sendSuccess(
          response,
          200,
          pageToWire(
            await controlRequired(control).listSites(
              parseContext(request.headers, requestId),
              parsePageQuery(url),
            ),
            siteToWire,
          ),
          requestId,
        );
      if (request.method === "POST" && url.pathname === "/v1/system/sites") {
        const input = await readJsonObject(
          request,
          request.headers["content-length"],
          () => request.resume(),
        );
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
              parseContext(request.headers, requestId),
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
              parseContext(request.headers, requestId),
              parsePageQuery(url),
            ),
            workspaceToWire,
          ),
          requestId,
        );
      if (
        request.method === "POST" &&
        url.pathname === "/v1/system/workspaces"
      ) {
        const input = await readJsonObject(
          request,
          request.headers["content-length"],
          () => request.resume(),
        );
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
              parseContext(request.headers, requestId),
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
              parseContext(request.headers, requestId),
              parsePathUuid(policy[1] ?? "", "site_id"),
            ),
          ),
          requestId,
        );
      if (policy && request.method === "PUT") {
        const input = await readJsonObject(
          request,
          request.headers["content-length"],
          () => request.resume(),
        );
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
              parseContext(request.headers, requestId),
              parsePathUuid(policy[1] ?? "", "site_id"),
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
        const input = await readJsonObject(
          request,
          request.headers["content-length"],
          () => request.resume(),
        );
        onlyFields(input, ["release_key", "digest"]);
        const digest = stringField(input, "digest", 64);
        if (!/^[0-9a-f]{64}$/u.test(digest))
          throw new RequestValidationError("digest is invalid");
        const value: ReleaseInput = {
          releaseKey: stringField(input, "release_key", 128),
          digest,
        };
        return sendSuccess(
          response,
          201,
          releaseToWire(
            await controlRequired(control).createRelease(
              parseContext(request.headers, requestId),
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
              parseContext(request.headers, requestId),
              parsePageQuery(url),
            ),
            configToWire,
          ),
          requestId,
        );
      if (request.method === "POST" && url.pathname === "/v1/system/config") {
        const input = await readJsonObject(
          request,
          request.headers["content-length"],
          () => request.resume(),
        );
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
          value: jsonValueField(input, "value"),
          schemaVersion,
          releaseId: nullableStringField(input, "release_id"),
        };
        return sendSuccess(
          response,
          201,
          configToWire(
            await controlRequired(control).upsertConfig(
              parseContext(request.headers, requestId),
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
        const id = parsePathUuid(release[1] ?? "", "release_id");
        const key = idempotencyKey(request);
        const target = release[2];
        const value =
          target === "validate"
            ? await controlRequired(control).validateRelease(
                parseContext(request.headers, requestId),
                id,
                key,
              )
            : target === "publish"
              ? await controlRequired(control).publishRelease(
                parseContext(request.headers, requestId),
                  id,
                  key,
                )
              : await controlRequired(control).retireRelease(
                parseContext(request.headers, requestId),
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
