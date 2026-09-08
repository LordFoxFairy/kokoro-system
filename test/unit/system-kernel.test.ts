import { describe, expect, it } from "vitest";
import { parsePrecondition } from "../../src/http/conditional-request.js";
import { encodeCursor, decodeCursor } from "../../src/http/pagination.js";
import { commandDigest } from "../../src/database/command-digest.js";

describe("System target atomic HTTP kernel", () => {
  it("rejects absent/conflicting/unsafe CAS and preserves BIGINT", () => {
    expect(() => parsePrecondition(undefined, undefined)).toThrow();
    expect(() => parsePrecondition('"1"', "*")).toThrow();
    expect(parsePrecondition('"9007199254740993123"', undefined)).toEqual({
      kind: "match",
      version: "9007199254740993123",
    });
    expect(parsePrecondition(undefined, "*", true)).toEqual({ kind: "create" });
  });
  it("binds opaque keyset cursors to tenant and filters", () => {
    const last = {
      createdAt: "2026-09-08T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000001",
    };
    const cursor = encodeCursor("sites", "tenant-a", last);
    expect(decodeCursor(cursor, "sites", "tenant-a")).toEqual(last);
    expect(() => decodeCursor(cursor, "sites", "tenant-b")).toThrow();
    expect(() => decodeCursor(cursor, "workspaces", "tenant-a")).toThrow();
  });
  it("canonicalizes bodies and binds actor, operation, path and CAS", () => {
    const a = {
      operation: "createSite",
      actor: "actor",
      path: "/sites",
      body: { b: 2, a: 1 },
      precondition: null,
    };
    expect(commandDigest(a)).toBe(
      commandDigest({ ...a, body: { a: 1, b: 2 } }),
    );
    expect(commandDigest(a)).not.toBe(commandDigest({ ...a, actor: "other" }));
    expect(commandDigest(a)).not.toBe(
      commandDigest({ ...a, precondition: '"1"' }),
    );
  });
});
