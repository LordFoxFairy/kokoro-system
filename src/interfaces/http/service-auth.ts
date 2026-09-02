import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

export class ServiceAuthError extends Error {
  public readonly code = "service_auth_failed";
  public readonly status = 403;

  public constructor() {
    super("service authentication failed");
    this.name = "ServiceAuthError";
  }
}

export class ServiceAuthNotConfiguredError extends Error {
  public readonly code = "service_auth_not_configured";
  public readonly status = 503;

  public constructor() {
    super("system service authentication is not configured");
    this.name = "ServiceAuthNotConfiguredError";
  }
}

function headerValue(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function bearerToken(request: IncomingMessage): string | null {
  const authorization = headerValue(request, "authorization");
  if (authorization === null) return null;
  const match = /^Bearer[ \t]+(\S+)$/u.exec(authorization);
  return match?.[1] ?? null;
}

function sameSecret(actual: string | null, expected: string): boolean {
  if (actual === null) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

/** Enforces the System-to-BFF boundary. Health probes bypass this guard. */
export function requireBffServiceAuth(request: IncomingMessage, configuredToken: string | null | undefined): void {
  const expectedToken = configuredToken?.trim() || null;
  if (expectedToken === null) throw new ServiceAuthNotConfiguredError();
  if (headerValue(request, "x-kokoro-service") !== "web-bff") throw new ServiceAuthError();
  if (!sameSecret(headerValue(request, "x-kokoro-internal-secret"), expectedToken) && !sameSecret(bearerToken(request), expectedToken)) throw new ServiceAuthError();
}
