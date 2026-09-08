import { timingSafeEqual, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants.js";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum.js";
import { Reflector } from "@nestjs/core";
import { SystemConfig } from "../config/system-config.js";
import { SystemError } from "../system.error.js";
import { parsePrecondition } from "../http/conditional-request.js";
import { requestIdSchema } from "../http/protocol.schema.js";
import { ACCESS_RULE } from "./access.decorator.js";
import type { AccessRule } from "./access.decorator.js";
import type { OwnerRequest, RequestContext } from "./request-context.js";
function header(request: OwnerRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value))
    throw new SystemError("INVALID_ARGUMENT", `Duplicate ${name}`);
  if (value === undefined) return undefined;
  if (!value.trim() || value.length > 2048)
    throw new SystemError("INVALID_ARGUMENT", `Invalid ${name}`);
  return value.trim();
}
function matches(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
@Injectable()
export class AccessGuard implements CanActivate {
  public constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SystemConfig) private readonly config: SystemConfig,
  ) {}
  public canActivate(execution: ExecutionContext): boolean {
    const rule = this.reflector.get<AccessRule | undefined>(
      ACCESS_RULE,
      execution.getHandler(),
    );
    if (!rule) return true;
    const request = execution.switchToHttp().getRequest<OwnerRequest>();
    const requestId = requestIdSchema.safeParse(
      header(request, "x-request-id") ?? randomUUID(),
    );
    if (!requestId.success)
      throw new SystemError("INVALID_ARGUMENT", "Invalid x-request-id");
    const service = header(request, "x-kokoro-service");
    const secret =
      service === "web-bff"
        ? this.config.values.KOKORO_SYSTEM_BFF_SERVICE_TOKEN
        : service === "kokoro-agent"
          ? this.config.values.KOKORO_SYSTEM_AGENT_SERVICE_TOKEN
          : service === "system-admin"
            ? this.config.values.KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN
            : null;
    if (
      !secret ||
      !(
        matches(
          header(request, "authorization")?.replace(/^Bearer /u, ""),
          secret,
        ) || matches(header(request, "x-kokoro-internal-secret"), secret)
      )
    )
      throw new SystemError(
        "service_auth_failed",
        "Service authentication failed",
      );
    const caller = service as RequestContext["service"];
    if (
      caller === "kokoro-agent" &&
      !["getModelCatalog", "resolveModel"].includes(rule.operation)
    )
      throw new SystemError("FORBIDDEN", "Agent operation denied");
    let scope = rule.scope ?? "tenant";
    if (scope === "conditional") {
      if (request.method === "POST")
        scope =
          typeof request.body === "object" &&
          request.body !== null &&
          "scope_type" in request.body &&
          request.body.scope_type === "global"
            ? "global"
            : "tenant";
      else {
        const selected = request.query.scope;
        if (
          selected !== undefined &&
          selected !== "tenant" &&
          selected !== "global"
        )
          throw new SystemError("INVALID_ARGUMENT", "Invalid scope");
        scope = selected === "global" ? "global" : "tenant";
      }
    }
    if (scope === "global" && caller !== "system-admin")
      throw new SystemError("FORBIDDEN", "Global operator required");
    const tenantId =
      scope === "global" ? null : header(request, "x-kokoro-tenant-id");
    if (scope === "tenant" && (!tenantId || tenantId.length > 160))
      throw new SystemError("INVALID_ARGUMENT", "Trusted tenant required");
    const permissions = (header(request, "x-kokoro-iam-permissions") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      permissions.some(
        (value) =>
          !["system:read", "system:write", "system:publish"].includes(value),
      )
    )
      throw new SystemError("INVALID_ARGUMENT", "Invalid permission snapshot");
    if (
      rule.permission.startsWith("system:") &&
      (!permissions.includes(rule.permission) || caller === "kokoro-agent")
    )
      throw new SystemError("FORBIDDEN", "Permission denied");
    const argumentsMetadata: unknown =
      Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        execution.getClass(),
        execution.getHandler().name,
      ) ?? {};
    const argumentKinds =
      typeof argumentsMetadata === "object" && argumentsMetadata !== null
        ? Object.keys(argumentsMetadata)
        : [];
    if (
      !argumentKinds.some((key) =>
        key.startsWith(`${RouteParamtypes.QUERY}:`),
      ) &&
      Object.keys(request.query).length > 0
    )
      throw new SystemError("INVALID_ARGUMENT", "Query fields are not allowed");
    if (
      !argumentKinds.some((key) =>
        key.startsWith(`${RouteParamtypes.BODY}:`),
      ) &&
      request.body !== undefined &&
      (typeof request.body !== "object" ||
        request.body === null ||
        Array.isArray(request.body) ||
        Object.keys(request.body).length > 0)
    )
      throw new SystemError("INVALID_ARGUMENT", "Request body is not allowed");
    const mutation = rule.mutation ?? request.method !== "GET";
    const actorId = header(request, "x-kokoro-actor-id") ?? "";
    const key = mutation ? header(request, "idempotency-key") : null;
    if (
      mutation &&
      (!actorId || actorId.length > 160 || !key || key.length > 128)
    )
      throw new SystemError(
        "INVALID_ARGUMENT",
        "Actor and Idempotency-Key required",
      );
    request.ownerContext = {
      tenantId: tenantId ?? null,
      actorId,
      service: caller,
      permissions,
      scope,
      requestId: requestId.data,
      operation: rule.operation,
      path: request.path,
      idempotencyKey: key ?? null,
      precondition: rule.cas
        ? parsePrecondition(
            header(request, "if-match"),
            header(request, "if-none-match"),
            rule.cas === "upsert",
          )
        : null,
    };
    return true;
  }
}
