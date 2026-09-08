import { HttpException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { OwnerErrorFilter } from "../../src/http/error.filter.js";
import { describe, expect, it } from "vitest";
import { SystemError } from "../../src/system.error.js";
import { systemErrorStatus } from "../../src/http/system-error-status.js";

describe("frozen System error transport matrix", () => {
  it("preserves every application code/status and retryability", () => {
    const expected = {
      INVALID_ARGUMENT: 400,
      service_auth_failed: 403,
      FORBIDDEN: 403,
      IDEMPOTENCY_KEY_REUSED: 409,
      SYSTEM_UNAVAILABLE: 503,
      PRECONDITION_REQUIRED: 428,
      VERSION_CONFLICT: 409,
      INVALID_CURSOR: 400,
      NOT_FOUND: 404,
      RESOURCE_IN_USE: 409,
      INVALID_STATE: 409,
      ROUTE_NOT_FOUND: 404,
      POLICY_DENIED: 403,
      MODEL_UNAVAILABLE: 503,
      SITE_UNAVAILABLE: 409,
      INVALID_CONFIG_SCHEMA: 400,
      HOST_CONFLICT: 409,
      POLICY_INVALID: 409,
    };
    expect(systemErrorStatus).toEqual(expected);
    for (const code of Object.keys(
      systemErrorStatus,
    ) as (keyof typeof systemErrorStatus)[]) {
      const retryable =
        code === "SYSTEM_UNAVAILABLE" || code === "MODEL_UNAVAILABLE";
      const error = new SystemError(code, "frozen message", retryable);
      expect(error).toMatchObject({
        code,
        message: "frozen message",
        retryable,
      });
      expect(error).not.toHaveProperty("status");
    }
  });
});

it("keeps the complete HTTP envelope and native transport exceptions byte-compatible", () => {
  function render(error: unknown) {
    let status = 0;
    let body: unknown;
    const headers: Record<string, string> = {};
    const response = {
      headersSent: false,
      writableEnded: false,
      destroyed: false,
      setHeader(name: string, value: string) {
        headers[name] = value;
      },
      status(value: number) {
        status = value;
        return this;
      },
      json(value: unknown) {
        body = value;
      },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { "x-request-id": "frozen:error_1" } }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    new OwnerErrorFilter().catch(error, host);
    expect(headers).toEqual({ "x-request-id": "frozen:error_1" });
    return { status, body };
  }
  for (const code of Object.keys(
    systemErrorStatus,
  ) as (keyof typeof systemErrorStatus)[]) {
    const retryable =
      code === "SYSTEM_UNAVAILABLE" || code === "MODEL_UNAVAILABLE";
    expect(render(new SystemError(code, "frozen message", retryable))).toEqual({
      status: systemErrorStatus[code],
      body: { error: { code, message: "frozen message", retryable } },
    });
  }
  for (const status of [400, 401, 404, 413, 429, 500]) {
    const bodyParser = status === 400 || status === 413;
    expect(render(new HttpException("sensitive exception", status))).toEqual({
      status: bodyParser ? 400 : status,
      body: {
        error: {
          code: status === 404 ? "NOT_FOUND" : "INVALID_ARGUMENT",
          message: bodyParser
            ? "Request body is invalid or too large"
            : status === 404
              ? "Resource not found"
              : "Request validation failed",
          retryable: false,
        },
      },
    });
  }
  expect(render({ code: "23505" })).toEqual({
    status: 409,
    body: {
      error: {
        code: "VERSION_CONFLICT",
        message: "Resource identity conflict",
        retryable: false,
      },
    },
  });
  expect(render(new Error("secret"))).toEqual({
    status: 503,
    body: {
      error: {
        code: "SYSTEM_UNAVAILABLE",
        message: "System temporarily unavailable",
        retryable: true,
      },
    },
  });
});
