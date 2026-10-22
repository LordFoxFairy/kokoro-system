import dns from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { SystemError } from "../../system.error.js";
import { canonicalModelBaseUrl } from "./schemas/connection.schema.js";
const MAX_BYTES = 1024 * 1024;
const unavailable = (retryable = false) =>
  new SystemError(
    "MODEL_UNAVAILABLE",
    "Provider model discovery is unavailable",
    retryable,
  );
const denied = () =>
  new SystemError(
    "POLICY_DENIED",
    "Provider discovery address is not permitted",
  );
export function allowedDiscoveryAddress(
  address: string,
  allowLoopback: boolean,
  allowPrivate = false,
): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    if (a === 127) return allowLoopback;
    if (
      allowPrivate &&
      (a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)))
    )
      return true;
    return !(
      a === 0 ||
      a === 10 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (family !== 6) return false;
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  if (normalized === "::1") return allowLoopback;
  if (normalized === "fd00:ec2::254") return false;
  // Only global-unicast space; reject mapped, transition and special-purpose ranges.
  const first = parseInt(normalized.split(":")[0] ?? "0", 16);
  const second = parseInt(normalized.split(":")[1] || "0", 16);
  if (allowPrivate && first >= 0xfc00 && first <= 0xfdff) return true;
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x0200 || second === 0x0db8)) &&
    !(first === 0x3fff && second < 0x1000)
  );
}
export async function resolveDiscoveryAddress(
  hostname: string,
  allowLoopback: boolean,
  signal: AbortSignal,
  privateHosts: readonly string[] = [],
  protocol = "https:",
) {
  const host = hostname.replace(/^\[|\]$/gu, "");
  if (signal.aborted) throw unavailable(true);
  const allowPrivate =
    protocol === "https:" &&
    isIP(host) === 0 &&
    privateHosts.includes(hostname);
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await dns.lookup(host, { all: true, verbatim: true });
  // Keep the physical lookup attached to the service work/slot until it settles.
  if (signal.aborted) throw unavailable(true);
  if (
    addresses.length === 0 ||
    addresses.some(
      ({ address }) =>
        !allowedDiscoveryAddress(address, allowLoopback, allowPrivate),
    )
  )
    throw denied();
  return addresses[0]!;
}
function hasNextPage(raw: Record<string, unknown>): boolean {
  for (const key of ["has_more", "hasMore"])
    if (key in raw && raw[key] !== false) return true;
  for (const key of [
    "next",
    "next_page",
    "next_cursor",
    "next_page_token",
    "nextPageToken",
    "after",
  ])
    if (
      key in raw &&
      raw[key] !== null &&
      raw[key] !== "" &&
      raw[key] !== false
    )
      return true;
  for (const key of ["meta", "pagination", "links"]) {
    const value = raw[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      hasNextPage(value as Record<string, unknown>)
    )
      return true;
  }
  return false;
}
/** JSON.parse validates grammar; this second bounded walk rejects duplicate decoded keys. */
function rejectDuplicateJsonKeys(text: string): void {
  let position = 0;
  const whitespace = () => {
    while (/\s/u.test(text[position] ?? "") && position < text.length)
      position++;
  };
  const string = (): string => {
    const start = position++;
    while (position < text.length) {
      const character = text[position++];
      if (character === "\\") position++;
      else if (character === '"')
        return JSON.parse(text.slice(start, position)) as string;
    }
    throw unavailable();
  };
  const value = (depth: number): void => {
    if (depth > 128) throw unavailable();
    whitespace();
    if (text[position] === "{") {
      position++;
      whitespace();
      const keys = new Set<string>();
      while (text[position] !== "}") {
        const key = string();
        if (keys.has(key)) throw unavailable();
        keys.add(key);
        whitespace();
        position++;
        value(depth + 1);
        whitespace();
        if (text[position] !== ",") break;
        position++;
        whitespace();
      }
      position++;
      return;
    }
    if (text[position] === "[") {
      position++;
      whitespace();
      while (text[position] !== "]") {
        value(depth + 1);
        whitespace();
        if (text[position] !== ",") break;
        position++;
        whitespace();
      }
      position++;
      return;
    }
    if (text[position] === '"') {
      string();
      return;
    }
    while (position < text.length && !/[\s,}\]]/u.test(text[position]!))
      position++;
  };
  value(0);
}
export function parseDiscoveryModels(bytes: Uint8Array): { id: string }[] {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const raw: unknown = JSON.parse(text);
    rejectDuplicateJsonKeys(text);
    if (raw === null || typeof raw !== "object" || Array.isArray(raw))
      throw unavailable();
    const record = raw as Record<string, unknown>;
    if (
      !Array.isArray(record.data) ||
      record.data.length > 2000 ||
      hasNextPage(record)
    )
      throw unavailable();
    const ids = new Set<string>();
    return record.data.map((item: unknown) => {
      if (item === null || typeof item !== "object" || Array.isArray(item))
        throw unavailable();
      const id = (item as Record<string, unknown>).id;
      if (
        typeof id !== "string" ||
        id.length < 1 ||
        id.length > 255 ||
        id.trim() !== id ||
        /[\p{Cc}\p{Cs}]/u.test(id) ||
        ids.has(id)
      )
        throw unavailable();
      ids.add(id);
      return { id };
    });
  } catch {
    throw unavailable();
  }
}
/** Dedicated, no-proxy/no-redirect transport. DNS validation and socket lookup share one address. */
export async function discoverProviderModels(
  baseUrl: string,
  apiKey: string,
  allowLoopback: boolean,
  signal: AbortSignal,
  privateHosts: readonly string[] = [],
): Promise<{ id: string }[]> {
  if (!canonicalModelBaseUrl(baseUrl)) throw denied();
  const url = new URL(baseUrl);
  if (url.protocol === "http:" && !allowLoopback) throw denied();
  url.pathname = `${url.pathname.replace(/\/$/u, "")}/models`;
  let address: Awaited<ReturnType<typeof resolveDiscoveryAddress>>;
  try {
    address = await resolveDiscoveryAddress(
      url.hostname,
      allowLoopback,
      signal,
      privateHosts,
      url.protocol,
    );
  } catch (error) {
    if (error instanceof SystemError) throw error;
    throw unavailable(true);
  }
  if (signal.aborted) throw unavailable(true);
  return new Promise((resolve, reject) => {
    const fail = (retryable = false) => reject(unavailable(retryable));
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method: "GET",
        signal,
        agent: false,
        family: address.family,
        maxHeaderSize: 16 * 1024,
        lookup: (_host, _options, callback) =>
          callback(null, address.address, address.family),
        headers: {
          accept: "application/json",
          authorization: `Bearer ${apiKey}`,
          "accept-encoding": "identity",
        },
      },
      (response) => {
        const type = response.headers["content-type"]
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase();
        const encoding = response.headers["content-encoding"];
        const length = response.headers["content-length"];
        if (
          response.statusCode !== 200 ||
          type !== "application/json" ||
          (encoding !== undefined && encoding !== "identity") ||
          (length !== undefined &&
            (!/^\d+$/u.test(length) || Number(length) > MAX_BYTES))
        ) {
          response.destroy();
          fail(
            response.statusCode === 429 ||
              (response.statusCode !== undefined &&
                response.statusCode >= 500 &&
                response.statusCode <= 599),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            response.destroy();
            request.destroy();
            fail();
          } else chunks.push(chunk);
        });
        response.once("error", () => fail(true));
        response.once("aborted", () => fail(true));
        response.once("end", () => {
          if (signal.aborted) {
            fail(true);
            return;
          }
          try {
            resolve(parseDiscoveryModels(Buffer.concat(chunks)));
          } catch {
            fail();
          }
        });
      },
    );
    request.once("error", () => fail(true));
    request.end();
  });
}
