import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { AccessGuard } from "../../src/access/access.guard.js";
import { ACCESS_RULE } from "../../src/access/access.decorator.js";
import type { AccessRule } from "../../src/access/access.decorator.js";
import { SystemConfig } from "../../src/config/system-config.js";
import type { OwnerRequest } from "../../src/access/request-context.js";

const environment = {
  DATABASE_URL: "postgresql://localhost/fixture?schema=system_fixture",
  REDIS_URL: "redis://localhost:6379/6",
  KOKORO_SYSTEM_BFF_SERVICE_TOKEN: "fixture-bff-token",
  KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "fixture-agent-token",
  KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: "fixture-admin-token",
  KOKORO_SYSTEM_MODEL_MANAGEMENT_SERVICE_TOKEN:
    "fixture-model-management-token",
};
function admit(
  rule: AccessRule,
  service = "model-management",
  token = environment.KOKORO_SYSTEM_MODEL_MANAGEMENT_SERVICE_TOKEN,
) {
  const handler = () => undefined;
  Reflect.defineMetadata(ACCESS_RULE, rule, handler);
  class Controller {}
  const request = {
    method: "GET",
    path: "/fixture",
    query: {},
    headers: {
      "x-kokoro-service": service,
      authorization: `Bearer ${token}`,
      "x-kokoro-tenant-id": "tenant-a",
      "x-kokoro-actor-id": "actor-a",
      "x-kokoro-iam-permissions": "system:read,system:write,system:publish",
    },
  } as unknown as OwnerRequest;
  const context = {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader: () => undefined }),
    }),
  } as unknown as ExecutionContext;
  return {
    run: () =>
      new AccessGuard(
        new Reflector(),
        new SystemConfig(environment),
      ).canActivate(context),
    request,
  };
}
describe("narrow model-management machine identity", () => {
  it("allows only declared model operations and preserves actor tenant apart from global resource scope", () => {
    const { run, request } = admit({
      operation: "createModelLabel",
      scope: "global",
      permission: "system:write",
      mutation: false,
    });
    expect(run()).toBe(true);
    expect(request.ownerContext).toMatchObject({
      scope: "global",
      tenantId: null,
      actorTenantId: "tenant-a",
    });
    expect(
      admit({ operation: "listFeature", permission: "system:read" }).run(),
    ).toBe(true);
    for (const operation of [
      "createSite",
      "listSite",
      "createFeature",
      "readModelCredential",
      "resolveModel",
    ])
      expect(() =>
        admit({ operation, permission: "service-context" }).run(),
      ).toThrow();
  });
  it("keeps credential reading Agent-only and rejects a reused management token", () => {
    expect(
      admit(
        {
          operation: "readModelCredential",
          permission: "service-context",
          mutation: false,
        },
        "kokoro-agent",
        environment.KOKORO_SYSTEM_AGENT_SERVICE_TOKEN,
      ).run(),
    ).toBe(true);
    expect(() =>
      admit(
        {
          operation: "createModelProvider",
          scope: "global",
          permission: "system:write",
          mutation: false,
        },
        "web-bff",
        environment.KOKORO_SYSTEM_BFF_SERVICE_TOKEN,
      ).run(),
    ).toThrow();
    expect(
      () =>
        new SystemConfig({
          ...environment,
          KOKORO_SYSTEM_MODEL_MANAGEMENT_SERVICE_TOKEN:
            environment.KOKORO_SYSTEM_BFF_SERVICE_TOKEN,
        }),
    ).toThrow();
  });
});

it("admits only the explicit global-write provider discovery read with trusted actor context", () => {
  const rule: AccessRule = {
    operation: "listModelProviderUpstreamModels",
    permission: "system:write",
    scope: "global",
    mutation: false,
  };
  const { run } = admit(rule);
  expect(run()).toBe(true);
  for (const service of ["web-bff", "kokoro-agent"] as const) {
    const token =
      service === "web-bff"
        ? environment.KOKORO_SYSTEM_BFF_SERVICE_TOKEN
        : environment.KOKORO_SYSTEM_AGENT_SERVICE_TOKEN;
    expect(() => admit(rule, service, token).run()).toThrow();
  }
  for (const name of [
    "idempotency-key",
    "if-match",
    "if-none-match",
    "content-length",
    "transfer-encoding",
    "content-type",
  ]) {
    const attempt = admit(rule);
    attempt.request.headers[name] = name === "content-length" ? "0" : "fixture";
    expect(() => attempt.run()).toThrow();
  }
  for (const name of ["x-kokoro-actor-id", "x-kokoro-tenant-id"]) {
    const attempt = admit(rule);
    delete attempt.request.headers[name];
    expect(() => attempt.run()).toThrow();
  }
  const readOnly = admit(rule);
  readOnly.request.headers["x-kokoro-iam-permissions"] = "system:read";
  expect(() => readOnly.run()).toThrow();
  const body = admit(rule);
  body.request.body = {};
  expect(() => body.run()).toThrow();
});

it("rejects discovery actor IDs above the declared 160-character boundary", () => {
  const attempt = admit({
    operation: "listModelProviderUpstreamModels",
    permission: "system:write",
    scope: "global",
    mutation: false,
  });
  attempt.request.headers["x-kokoro-actor-id"] = "a".repeat(161);
  expect(() => attempt.run()).toThrow();
});
