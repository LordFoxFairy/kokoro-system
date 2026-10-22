import { describe, expect, it } from "vitest";
import { parsePrecondition } from "../../src/http/conditional-request.js";
import { encodeCursor, decodeCursor } from "../../src/http/pagination.js";
import { commandDigest } from "../../src/database/command-digest.js";
import { SystemConfig } from "../../src/config/system-config.js";

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

describe("R39 R1 owner database URL configuration", () => {
  const base = "postgresql://fixture:fixture-password@127.0.0.1:5432/fixture";
  const environment = {
    DATABASE_URL: `${base}?schema=system_r39`,
    REDIS_URL: "redis://127.0.0.1:6379/2",
    KOKORO_SYSTEM_BFF_SERVICE_TOKEN: "r39-bff-fixture-token",
    KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "r39-agent-fixture-token",
    KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: "r39-admin-fixture-token",
  };

  it.each([
    ["missing selector", ""],
    ["empty selector", "?schema="],
    ["duplicate equal selector", "?schema=system_r39&schema=system_r39"],
    ["duplicate different selector", "?schema=system_r39&schema=neighbor"],
    ["decoded duplicate key", "?schema=system_r39&%73chema=neighbor"],
    ["schema list", "?schema=system_r39,neighbor"],
    ["decoded schema list", "?schema=system_r39%2Cneighbor"],
    ["public namespace", "?schema=public"],
    ["pg_catalog namespace", "?schema=pg_catalog"],
    ["pg_ namespace prefix", "?schema=pg_fixture"],
    ["uppercase", "?schema=System"],
    ["numeric first character", "?schema=1system"],
    ["quoted identifier", "?schema=%22system%22"],
    ["non ASCII identifier", "?schema=syst%C3%A8me"],
    ["decoded whitespace", "?schema=system%20r39"],
    ["decoded control character", "?schema=system%0Ar39"],
    ["identifier over 63 bytes", `?schema=${"s".repeat(64)}`],
    ["session options", "?schema=system_r39&options=-c%20search_path%3Dpublic"],
    ["empty options", "?schema=system_r39&options="],
    ["decoded options key", "?schema=system_r39&%6Fptions=-c%20timezone%3DPST"],
    ["duplicate options", "?schema=system_r39&options=&options="],
  ])("rejects %s before resource creation", (_name, suffix) => {
    expect(
      () => new SystemConfig({ ...environment, DATABASE_URL: base + suffix }),
    ).toThrow();
  });

  it.each([...Array.from({ length: 32 }, (_, code) => code), 127])(
    "rejects raw ASCII control code %i before URL parser normalization",
    (code) => {
      const raw = `${base}${String.fromCharCode(code)}?schema=system_r39`;
      expect(
        () => new SystemConfig({ ...environment, DATABASE_URL: raw }),
      ).toThrow();
    },
  );

  it.each(["\t", "\n", "\r"])(
    "rejects leading/trailing parser-trimmed control %j",
    (control) => {
      expect(
        () =>
          new SystemConfig({
            ...environment,
            DATABASE_URL: `${control}${environment.DATABASE_URL}${control}`,
          }),
      ).toThrow();
    },
  );

  it.each(["system_r39", "s".repeat(63)])(
    "preserves ordinary PostgreSQL/TLS parameters with valid schema %s",
    (schema) => {
      const databaseUrl = `${base}?schema=${schema}&sslmode=verify-full&sslrootcert=%2Ffixture%2Froot.crt&application_name=system-r39&connect_timeout=3`;
      const config = new SystemConfig({
        ...environment,
        DATABASE_URL: databaseUrl,
      });
      expect(config.values.DATABASE_URL).toBe(databaseUrl);
      expect(config.values.KOKORO_SYSTEM_REQUEST_TIMEOUT_MS).toBe(10000);
      expect(config.values.KOKORO_SYSTEM_RETENTION_HOLD).toBe(false);
      expect(Object.isFrozen(config.values)).toBe(true);
    },
  );

  it("reads DATABASE_URL once while preserving validated environment defaults", () => {
    let reads = 0;
    const config = new SystemConfig({
      ...environment,
      get DATABASE_URL() {
        reads++;
        return environment.DATABASE_URL;
      },
    });
    expect(reads).toBe(1);
    expect(config.values.DATABASE_URL).toBe(environment.DATABASE_URL);
    expect(config.values.KOKORO_SYSTEM_MODEL_HEALTH_MAX_AGE_MS).toBe(60000);
    expect(config.values.KOKORO_SYSTEM_PORT).toBe(4240);
  });

  it.each([
    { KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "" },
    { REDIS_URL: "https://127.0.0.1" },
    { KOKORO_SYSTEM_PORT: "65536" },
    { KOKORO_SYSTEM_REQUEST_TIMEOUT_MS: "99" },
  ])("retains existing rejection for other configuration: %j", (invalid) => {
    expect(() => new SystemConfig({ ...environment, ...invalid })).toThrow();
  });
});

it("defaults provider discovery private-host permission to an empty immutable deployment list", () => {
  const config = new SystemConfig({
    DATABASE_URL: "postgresql://localhost/fixture?schema=fixture",
    REDIS_URL: "redis://localhost/6",
    KOKORO_SYSTEM_BFF_SERVICE_TOKEN: "fixture-bff-token",
    KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "fixture-agent-token",
    KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: "fixture-admin-token",
  });
  expect(config.values).toHaveProperty(
    "KOKORO_SYSTEM_MODEL_DISCOVERY_PRIVATE_HOSTS",
    [],
  );
  expect(
    Object.isFrozen(config.values.KOKORO_SYSTEM_MODEL_DISCOVERY_PRIVATE_HOSTS),
  ).toBe(true);
});
it("accepts only bounded exact canonical DNS names for deployment private-host permission", () => {
  const env = {
    DATABASE_URL: "postgresql://localhost/fixture?schema=fixture",
    REDIS_URL: "redis://localhost/6",
    KOKORO_SYSTEM_BFF_SERVICE_TOKEN: "fixture-bff-token",
    KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "fixture-agent-token",
    KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: "fixture-admin-token",
  };
  const valid = new SystemConfig({
    ...env,
    KOKORO_SYSTEM_MODEL_DISCOVERY_PRIVATE_HOSTS:
      "gateway.fixture.invalid,model.internal",
  });
  expect(valid.values).toHaveProperty(
    "KOKORO_SYSTEM_MODEL_DISCOVERY_PRIVATE_HOSTS",
    ["gateway.fixture.invalid", "model.internal"],
  );
  const boundary = [
    "a".repeat(63),
    "b".repeat(63),
    "c".repeat(63),
    "d".repeat(61),
  ].join(".");
  expect(
    new SystemConfig({
      ...env,
      KOKORO_SYSTEM_MODEL_DISCOVERY_PRIVATE_HOSTS: boundary,
    }).values.KOKORO_SYSTEM_MODEL_DISCOVERY_PRIVATE_HOSTS,
  ).toEqual([boundary]);
  expect(
    new SystemConfig({
      ...env,
      KOKORO_SYSTEM_MODEL_DISCOVERY_PRIVATE_HOSTS: Array.from(
        { length: 32 },
        (_, index) => `a${index}.invalid`,
      ).join(","),
    }).values.KOKORO_SYSTEM_MODEL_DISCOVERY_PRIVATE_HOSTS,
  ).toHaveLength(32);
  for (const value of [
    "127.0.0.1",
    "198.18.0.1",
    "[::1]",
    "::1",
    "https://gateway.fixture.invalid",
    "gateway.fixture.invalid:443",
    "gateway.fixture.invalid/path",
    "user@gateway.fixture.invalid",
    "*.fixture.invalid",
    "Gateway.fixture.invalid",
    ".fixture.invalid",
    "fixture.invalid.",
    " gateway.fixture.invalid",
    "gateway.fixture.invalid ",
    "a,,b",
    "a,",
    ",a",
    "a,a",
    "-a.invalid",
    "a-.invalid",
    "a_b.invalid",
    "a".repeat(64) + ".invalid",
    "a.".repeat(127) + "a",
    Array.from({ length: 33 }, (_, index) => `a${index}.invalid`).join(","),
  ])
    expect(
      () =>
        new SystemConfig({
          ...env,
          KOKORO_SYSTEM_MODEL_DISCOVERY_PRIVATE_HOSTS: value,
        }),
      value,
    ).toThrow();
});
