import { createServer } from "node:http";
import type { RequestListener } from "node:http";
import dns from "node:dns/promises";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowedDiscoveryAddress,
  discoverProviderModels,
  parseDiscoveryModels,
  resolveDiscoveryAddress,
} from "../../src/modules/model-catalog/provider-model-discovery.transport.js";
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function peer(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw Error("missing address");
  return `http://127.0.0.1:${address.port}/custom/v1`;
}
const bytes = (input: unknown) => Buffer.from(JSON.stringify(input));
describe("provider discovery bounded dedicated transport", () => {
  it("preserves the API path, authenticates only the selected peer and returns only IDs", async () => {
    let sends = 0;
    const url = await peer((request, response) => {
      sends++;
      expect(request.url).toBe("/custom/v1/models");
      expect(request.method).toBe("GET");
      expect(request.headers.authorization).toBe("Bearer fixture-key");
      expect(request.headers.cookie).toBeUndefined();
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          data: [
            {
              id: "vendor/model",
              api_key: "never-return",
              owned_by: "ignored",
            },
          ],
          has_more: false,
        }),
      );
    });
    await expect(
      discoverProviderModels(
        url,
        "fixture-key",
        false,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(sends).toBe(0);
    expect(
      await discoverProviderModels(
        url,
        "fixture-key",
        true,
        new AbortController().signal,
      ),
    ).toEqual([{ id: "vendor/model" }]);
    expect(sends).toBe(1);
  });
  it("pins exactly the validated DNS result into the real loopback connection", async () => {
    let sends = 0;
    const url = (
      await peer((request, response) => {
        sends++;
        expect(request.headers.host).toContain("localhost:");
        response.setHeader("content-type", "application/json");
        response.end('{"data":[]}');
      })
    ).replace("127.0.0.1", "localhost");
    const resolver = vi
      .spyOn(dns, "lookup")
      .mockResolvedValue([
        { address: "127.0.0.1", family: 4 },
      ] as unknown as Awaited<ReturnType<typeof dns.lookup>>);
    expect(
      await discoverProviderModels(
        url,
        "fixture",
        true,
        new AbortController().signal,
      ),
    ).toEqual([]);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(sends).toBe(1);
    resolver.mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ] as unknown as Awaited<ReturnType<typeof dns.lookup>>);
    await expect(
      discoverProviderModels(
        url,
        "fixture",
        true,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(sends).toBe(1);
  });
  it("never opens a socket when DNS finishes after cancellation", async () => {
    let sends = 0;
    const url = (
      await peer((_request, response) => {
        sends++;
        response.end();
      })
    ).replace("127.0.0.1", "localhost");
    let release!: (value: Awaited<ReturnType<typeof dns.lookup>>) => void;
    const resolver = vi.spyOn(dns, "lookup").mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof dns.lookup>>>((resolve) => {
          release = resolve;
        }),
    );
    const abort = new AbortController();
    const result = discoverProviderModels(url, "fixture", true, abort.signal);
    abort.abort();
    release([{ address: "127.0.0.1", family: 4 }] as unknown as Awaited<
      ReturnType<typeof dns.lookup>
    >);
    await expect(result).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
      retryable: true,
    });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(sends).toBe(0);
  });
  it("does not follow a redirect or reveal a supplier error", async () => {
    let sends = 0;
    const url = await peer((_request, response) => {
      sends++;
      response.writeHead(302, {
        location: "/other",
        "content-type": "application/json",
      });
      response.end('{"error":"fixture-secret"}');
    });
    await expect(
      discoverProviderModels(
        url,
        "fixture-key",
        true,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE", retryable: false });
    expect(sends).toBe(1);
  });
  it("classifies upstream rate/temporary errors without returning supplier content or retrying", async () => {
    for (const [status, retryable] of [
      [429, true],
      [503, true],
      [401, false],
      [403, false],
      [404, false],
    ] as const) {
      let sends = 0;
      const url = await peer((_request, response) => {
        sends++;
        response.writeHead(status, { "content-type": "application/json" });
        response.end('{"error":"fixture-secret"}');
      });
      await expect(
        discoverProviderModels(
          url,
          "fixture",
          true,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({
        code: "MODEL_UNAVAILABLE",
        retryable,
        message: "Provider model discovery is unavailable",
      });
      expect(sends).toBe(1);
    }
  });
  it("cancels sockets while waiting for headers and body", async () => {
    for (const flush of [false, true]) {
      let close!: () => void;
      const closed = new Promise<void>((resolve) => {
        close = resolve;
      });
      const url = await peer((_request, response) => {
        response.once("close", close);
        if (flush) {
          response.writeHead(200, { "content-type": "application/json" });
          response.write('{"data":[');
        }
      });
      const abort = new AbortController();
      const result = discoverProviderModels(url, "fixture", true, abort.signal);
      setTimeout(() => abort.abort(), 30);
      await expect(result).rejects.toMatchObject({
        code: "MODEL_UNAVAILABLE",
        retryable: true,
      });
      await closed;
    }
  });
  it("rejects excessive headers/body without returning a partial list", async () => {
    for (const declared of [true, false]) {
      const url = await peer((_request, response) => {
        response.setHeader("content-type", "application/json");
        if (declared) response.setHeader("content-length", 1024 * 1024 + 1);
        response.end("x".repeat(1024 * 1024 + 1));
      });
      await expect(
        discoverProviderModels(
          url,
          "fixture",
          true,
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE", retryable: false });
    }
  });
  it("rejects private, reserved, transition and mapped destinations even with loopback enabled", () => {
    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "198.18.0.1",
      "192.0.2.1",
      "224.0.0.1",
      "::",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "64:ff9b::1",
      "2001:db8::1",
      "2002::1",
      "3fff::1",
    ])
      expect(allowedDiscoveryAddress(address, true), address).toBe(false);
    for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])
      expect(allowedDiscoveryAddress(address, false), address).toBe(true);
    for (const address of ["127.0.0.1", "::1"]) {
      expect(allowedDiscoveryAddress(address, false)).toBe(false);
      expect(allowedDiscoveryAddress(address, true)).toBe(true);
    }
  });
  it("rejects malformed, duplicate, controlled, oversized or explicitly paginated model lists", () => {
    for (const raw of [
      {},
      { data: null },
      { data: [{ id: " a" }] },
      { data: [{ id: "a " }] },
      { data: [{ id: "a\u0000" }] },
      { data: [{ id: "\ud800" }] },
      { data: [{ id: "a" }, { id: "a" }] },
      { data: [{ id: "a".repeat(256) }] },
      { data: Array.from({ length: 2001 }, (_, i) => ({ id: String(i) })) },
      { data: [], has_more: true },
      { data: [], next_page: "https://never-follow.invalid" },
      { data: [], links: { next: "cursor" } },
      { data: [], meta: { pagination: { next_cursor: "cursor" } } },
    ])
      expect(() => parseDiscoveryModels(bytes(raw))).toThrow();
    expect(() => parseDiscoveryModels(Uint8Array.of(0xff))).toThrow();
    expect(() => parseDiscoveryModels(Buffer.from('{"data":['))).toThrow();
    expect(
      parseDiscoveryModels(
        bytes({ data: [], has_more: false, next_page: null }),
      ),
    ).toEqual([]);
  });
});

it("rejects duplicate JSON members instead of allowing a last-value pagination override", () => {
  expect(() =>
    parseDiscoveryModels(
      Buffer.from('{"data":[],"has_more":true,"has_more":false}'),
    ),
  ).toThrow();
  expect(() =>
    parseDiscoveryModels(Buffer.from('{"data":[{"id":"a","\\u0069d":"b"}]}')),
  ).toThrow();
});

it("permits selected private DNS ranges only for an exact explicitly listed HTTPS host", async () => {
  const resolver = vi.spyOn(dns, "lookup");
  for (const address of [
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.254",
    "fc00::1",
    "fdff::1",
  ]) {
    resolver.mockResolvedValue([
      { address, family: address.includes(":") ? 6 : 4 },
    ] as unknown as Awaited<ReturnType<typeof dns.lookup>>);
    await expect(
      resolveDiscoveryAddress(
        "gateway.fixture.invalid",
        false,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
    expect(
      await resolveDiscoveryAddress(
        "gateway.fixture.invalid",
        false,
        new AbortController().signal,
        ["gateway.fixture.invalid"],
        "https:",
      ),
    ).toMatchObject({ address });
    await expect(
      resolveDiscoveryAddress(
        "similar.gateway.fixture.invalid",
        false,
        new AbortController().signal,
        ["gateway.fixture.invalid"],
        "https:",
      ),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
    await expect(
      resolveDiscoveryAddress(
        "gateway.fixture.invalid",
        false,
        new AbortController().signal,
        ["gateway.fixture.invalid"],
        "http:",
      ),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
  }
});
it("keeps dangerous addresses and IP literals denied despite explicit private-host permission", async () => {
  const resolver = vi.spyOn(dns, "lookup");
  for (const address of [
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "127.0.0.1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "::",
    "::1",
    "::ffff:10.0.0.1",
    "64:ff9b::1",
    "fe80::1",
    "2002::1",
    "2001:db8::1",
    "ff02::1",
    "fd00:ec2::254",
  ]) {
    resolver.mockResolvedValue([
      { address, family: address.includes(":") ? 6 : 4 },
    ] as unknown as Awaited<ReturnType<typeof dns.lookup>>);
    await expect(
      resolveDiscoveryAddress(
        "gateway.fixture.invalid",
        false,
        new AbortController().signal,
        ["gateway.fixture.invalid"],
        "https:",
      ),
    ).rejects.toMatchObject({ code: "POLICY_DENIED" });
  }
  await expect(
    resolveDiscoveryAddress(
      "198.18.0.1",
      false,
      new AbortController().signal,
      ["198.18.0.1"],
      "https:",
    ),
  ).rejects.toMatchObject({ code: "POLICY_DENIED" });
  resolver.mockResolvedValue([
    { address: "198.18.0.1", family: 4 },
    { address: "169.254.169.254", family: 4 },
  ] as unknown as Awaited<ReturnType<typeof dns.lookup>>);
  await expect(
    resolveDiscoveryAddress(
      "gateway.fixture.invalid",
      false,
      new AbortController().signal,
      ["gateway.fixture.invalid"],
      "https:",
    ),
  ).rejects.toMatchObject({ code: "POLICY_DENIED" });
});
