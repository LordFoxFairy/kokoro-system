import { randomUUID } from "node:crypto";
import { Code, ConnectError, type ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import type { SiteQueryService } from "../../application/system/services/site-query.service.js";
import type { TenantRequestContext } from "../../domain/runtime-manifest/models/index.js";
import { SystemDomainError } from "../../domain/system/errors/system-domain.error.js";
import { SiteService } from "../../generated/proto/kokoro/site/v1/site_pb.js";
import {
  requireBffServiceAuthHeaders,
  ServiceAuthError,
  ServiceAuthNotConfiguredError,
} from "../http/service-auth.js";

type SiteQuery = Pick<SiteQueryService, "resolveSiteByHost">;

function optionalHeader(headers: Headers, name: string): string | null {
  const value = headers.get(name)?.trim();
  return value ? value : null;
}

function requiredHeader(headers: Headers, name: string): string {
  const value = optionalHeader(headers, name);
  if (value === null)
    throw new ConnectError(`${name} is required`, Code.InvalidArgument);
  return value;
}

function requestContext(headers: Headers, requestId: string): TenantRequestContext {
  return {
    tenantId: requiredHeader(headers, "x-kokoro-tenant-id"),
    actorId: optionalHeader(headers, "x-kokoro-actor-id"),
    organizationId: optionalHeader(headers, "x-kokoro-organization-id"),
    surfaceId: null,
    permissions: [],
    correlationId: requestId,
  };
}

function connectError(error: unknown): ConnectError {
  if (error instanceof ConnectError) return error;
  if (error instanceof ServiceAuthError)
    return new ConnectError(error.message, Code.PermissionDenied);
  if (error instanceof ServiceAuthNotConfiguredError)
    return new ConnectError(error.message, Code.Unavailable);
  if (error instanceof SystemDomainError) {
    const code =
      error.status === 400
        ? Code.InvalidArgument
        : error.status === 403
          ? Code.PermissionDenied
          : error.status === 404
            ? Code.NotFound
            : error.status === 409
              ? Code.Aborted
              : Code.Unavailable;
    return new ConnectError(error.message, code);
  }
  return new ConnectError("system unavailable", Code.Unavailable);
}

export function createSiteServiceHandler(
  siteQuery: SiteQuery,
  bffServiceToken: string | null | undefined,
  onUnexpectedError?: (error: unknown, requestId: string) => void,
): ReturnType<typeof connectNodeAdapter> {
  return connectNodeAdapter({
    routes: (router: ConnectRouter) => {
      router.service(SiteService, {
        resolveSiteByHost: async (request, handlerContext) => {
          const requestId =
            optionalHeader(handlerContext.requestHeader, "x-kokoro-request-id") ??
            (request.requestId.trim() || randomUUID());
          handlerContext.responseHeader.set("x-kokoro-request-id", requestId);
          try {
            requireBffServiceAuthHeaders(
              handlerContext.requestHeader,
              bffServiceToken,
            );
            const value = await siteQuery.resolveSiteByHost(
              requestContext(handlerContext.requestHeader, requestId),
              request.host,
            );
            return {
              siteId: value.siteId,
              key: value.key,
              canonicalHost: value.canonicalHost,
              defaultLocale: value.defaultLocale,
              timezone: value.timezone,
              generation: BigInt(value.generation),
            };
          } catch (error) {
            if (
              !(error instanceof ConnectError) &&
              !(error instanceof ServiceAuthError) &&
              !(error instanceof ServiceAuthNotConfiguredError) &&
              !(error instanceof SystemDomainError)
            )
              onUnexpectedError?.(error, requestId);
            throw connectError(error);
          }
        },
      });
    },
  });
}
