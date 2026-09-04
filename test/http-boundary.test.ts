import { describe, expect, it } from "vitest";
import {
  MAX_JSON_BODY_BYTES,
  parseContentLength,
  parsePageQuery,
  parsePathUuid,
  parseRequestId,
  parseRuntimeManifestQuery,
  readJsonObject,
} from "../src/interfaces/http/request-schemas.js";

describe("HTTP boundary schemas", () => {
  it("rejects malformed and oversized Content-Length values consistently", () => {
    expect(() => parseContentLength("not-a-number")).toThrow(
      "content-length is invalid",
    );
    expect(() => parseContentLength("1000001")).toThrow(
      "request body is too large",
    );
    expect(() => parseContentLength(["1", "2"])).toThrow(
      "content-length is invalid",
    );
  });

  it("stops consuming a body as soon as the hard byte limit is exceeded", async () => {
    let yielded = 0;
    async function* chunks(): AsyncGenerator<Buffer> {
      yielded += 1;
      yield Buffer.alloc(MAX_JSON_BODY_BYTES - 1, 0x61);
      yielded += 1;
      yield Buffer.from("xx");
      yielded += 1;
      yield Buffer.from("this chunk must not be consumed");
    }

    await expect(readJsonObject(chunks(), undefined)).rejects.toThrow(
      "request body is too large",
    );
    expect(yielded).toBe(2);
  });

  it("parses a bounded JSON object only after streaming validation", async () => {
    await expect(
      readJsonObject(
        (async function* (): AsyncGenerator<Buffer> {
          yield Buffer.from('{"enabled":true}');
        })(),
        "16",
      ),
    ).resolves.toEqual({ enabled: true });
  });

  it("rejects a body whose received bytes do not match Content-Length", async () => {
    await expect(
      readJsonObject(
        (async function* (): AsyncGenerator<Buffer> {
          yield Buffer.from("{}");
        })(),
        "3",
      ),
    ).rejects.toThrow("content-length is invalid");
  });

  it("strictly parses query, path and request-id inputs", () => {
    expect(() => parsePageQuery(new URL("http://localhost/sites?limit=nope"))).toThrow(
      "limit is invalid",
    );
    expect(() => parsePageQuery(new URL("http://localhost/sites?limit=1&limit=2"))).toThrow(
      "limit must appear once",
    );
    expect(() => parseRuntimeManifestQuery(new URL("http://localhost/manifest?product_id=p&extra=x"))).toThrow(
      "extra is not allowed",
    );
    expect(() => parsePathUuid("site-a", "site_id")).toThrow(
      "site_id is invalid",
    );
    expect(() => parseRequestId("request-a", "fallback")).toThrow(
      "x-kokoro-request-id is invalid",
    );
  });
});
