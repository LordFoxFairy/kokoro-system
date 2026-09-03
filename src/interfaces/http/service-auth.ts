import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

type HeaderSource = IncomingMessage | Headers;

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

function headerValue(source: HeaderSource, name: string): string | null {
  const value =
    source instanceof Headers ? source.get(name) : source.headers[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function bearerToken(source: HeaderSource): string | null {
  const authorization = headerValue(source, "authorization");
  if (authorization === null) return null;
  const match = /^Bearer[ \t]+(\S+)$/u.exec(authorization);
  return match?.[1] ?? null;
}

function sameSecret(actual: string | null, expected: string): boolean {
  if (actual === null) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

/** Enforces the System-to-BFF boundary. Health probes bypass this guard. */
export function requireBffServiceAuth(
  request: IncomingMessage,
  configuredToken: string | null | undefined,
): void {
  requireBffServiceAuthHeaders(request, configuredToken);
}

export function requireBffServiceAuthHeaders(
  headers: HeaderSource,
  configuredToken: string | null | undefined,
): void {
  const expectedToken = configuredToken?.trim() || null;
  if (expectedToken === null) throw new ServiceAuthNotConfiguredError();
  if (headerValue(headers, "x-kokoro-service") !== "web-bff")
    throw new ServiceAuthError();
  if (
    !sameSecret(
      headerValue(headers, "x-kokoro-internal-secret"),
      expectedToken,
    ) &&
    !sameSecret(bearerToken(headers), expectedToken)
  )
    throw new ServiceAuthError();
}
