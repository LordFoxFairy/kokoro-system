import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";
import { stopOwnedProcessGroup } from "../../scripts/smoke-process.js";
import { runCleanup } from "../../scripts/smoke-cleanup.js";
it("reaps its owned group even after the launcher exited", async () => {
  const leader = spawn(
    process.execPath,
    [
      "-e",
      `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});child.unref();console.log(child.pid);setTimeout(()=>process.exit(0),50);`,
    ],
    { detached: true, stdio: ["ignore", "pipe", "ignore"] },
  );
  let output = "";
  leader.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  await once(leader, "exit");
  const descendant = Number(output.trim());
  expect(leader.exitCode).toBe(0);
  expect(Number.isInteger(descendant)).toBe(true);
  try {
    expect(() => process.kill(descendant, 0)).not.toThrow();
    await stopOwnedProcessGroup(leader.pid!);
    expect(() => process.kill(descendant, 0)).toThrow();
  } finally {
    try {
      process.kill(-leader.pid!, "SIGKILL");
    } catch {
      /* Gone. */
    }
  }
}, 10000);
it("continues all resource cleanup and aggregates failures", async () => {
  const done: string[] = [];
  await expect(
    runCleanup([
      () => {
        throw new Error("process failed");
      },
      () => {
        done.push("drop");
        throw new Error("drop failed");
      },
      () => {
        done.push("close");
      },
    ]),
  ).rejects.toBeInstanceOf(AggregateError);
  expect(done).toEqual(["drop", "close"]);
});
it("promotes exactly the tested local image rather than rebuilding on a second runner", async () => {
  const { readFileSync } = await import("node:fs");
  const workflow = readFileSync(".github/workflows/release-image.yml", "utf8");
  expect(workflow).not.toContain("\n  publish:");
  expect(workflow).not.toContain("docker/build-push-action");
  expect(workflow.match(/docker build --tag/gu)).toHaveLength(1);
  expect(workflow).toContain('docker tag kokoro-system:release-smoke "$tag"');
  expect(workflow.indexOf("Smoke local production candidate")).toBeLessThan(
    workflow.indexOf("Promote tested production candidate"),
  );
  expect(workflow.indexOf("Scan production image")).toBeLessThan(
    workflow.indexOf("Promote tested production candidate"),
  );
});

it("refreshes runtime OS packages before installing dependencies without weakening the image scan", async () => {
  const { readFileSync } = await import("node:fs");
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const runtime = dockerfile.split(/FROM[^\n]+ AS runtime\n/u)[1];
  expect(runtime).toBeDefined();
  const source = runtime ?? "";
  expect(source).toMatch(
    /RUN apt-get update\s*\\?\s*&& apt-get upgrade -y\s*\\?\s*&& rm -rf \/var\/lib\/apt\/lists\/\*/u,
  );
  expect(source.indexOf("RUN apt-get update")).toBeLessThan(
    source.indexOf("RUN npm install"),
  );
  expect(source.indexOf("apt-get upgrade -y")).toBeLessThan(
    source.indexOf("RUN pnpm install"),
  );
  const release = readFileSync(".github/workflows/release-image.yml", "utf8");
  expect(release).toMatch(/exit-code:\s*['"]?1/u);
  expect(release).not.toMatch(/trivyignores:|ignore-policy:|vex:/u);
});

it("gates only attestations on repository visibility while keeping release gates mandatory", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(".github/workflows/release-image.yml", "utf8");
  const steps = source.split(/^ {6}- /mu).slice(1);
  const attestations = steps.filter((step) =>
    /uses: actions\/attest/u.test(step),
  );
  expect(attestations).toHaveLength(2);
  for (const step of attestations)
    expect(step).toContain(
      "if: ${{ github.event.repository.private == false }}",
    );
  for (const step of steps.filter((step) => !attestations.includes(step))) {
    expect(step).not.toMatch(/^\s*if:/mu);
    expect(step).not.toContain("continue-on-error");
  }
  expect(source).not.toContain("continue-on-error");
  for (const marker of [
    "pnpm check",
    "pnpm contract:check",
    "pnpm test",
    "pnpm test:schema:fresh",
    "Smoke local production candidate",
    "Scan production image",
    "Generate tested image SBOM",
    "docker push",
  ])
    expect(source).toContain(marker);
});

import { vi } from "vitest";

type FreshSchemaScenario = Readonly<{
  freshDatabaseName?: string;
  createFailure?: Error;
  execFailure?: Error;
  queryFailure?: Error;
  rejectQueryWith?: unknown;
  databaseEndFailure?: Error;
  dropFailure?: Error;
  adminEndFailure?: Error;
}>;

function createClientDouble() {
  return {
    connect: vi.fn(() => Promise.resolve()),
    query: vi.fn((sql: string) => {
      void sql;
      return Promise.resolve({ rows: [] });
    }),
    end: vi.fn(() => Promise.resolve()),
  };
}

type ClientDouble = ReturnType<typeof createClientDouble>;

function failureMessages(value: unknown): string[] {
  if (value instanceof AggregateError) {
    const errors = value.errors as unknown[];
    return [value.message, ...errors.flatMap(failureMessages)];
  }
  return [value instanceof Error ? value.message : String(value)];
}

function failureObjects(value: unknown): unknown[] {
  if (value instanceof AggregateError) {
    const errors = value.errors as unknown[];
    return [value, ...errors.flatMap(failureObjects)];
  }
  return [value];
}

async function executeFreshSchemaEntry(scenario: FreshSchemaScenario) {
  const admin = createClientDouble();
  const database = createClientDouble();
  admin.query.mockImplementation((sql: string) => {
    if (sql.startsWith("CREATE DATABASE") && scenario.createFailure)
      return Promise.reject(scenario.createFailure);
    if (sql.startsWith("DROP DATABASE") && scenario.dropFailure)
      return Promise.reject(scenario.dropFailure);
    return Promise.resolve({ rows: [] });
  });
  database.query.mockImplementation(() => {
    if ("rejectQueryWith" in scenario) {
      // Deliberately model JavaScript allowing a rejected promise with undefined.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      return Promise.reject(scenario.rejectQueryWith);
    }
    if (scenario.queryFailure) return Promise.reject(scenario.queryFailure);
    return Promise.resolve({ rows: [] });
  });
  database.end.mockImplementation(() => {
    if (scenario.databaseEndFailure)
      return Promise.reject(scenario.databaseEndFailure);
    return Promise.resolve();
  });
  admin.end.mockImplementation(() => {
    if (scenario.adminEndFailure)
      return Promise.reject(scenario.adminEndFailure);
    return Promise.resolve();
  });
  const clients: ClientDouble[] = [admin, database];
  const Client = vi.fn(function Client(): ClientDouble {
    const client = clients.shift();
    if (!client) throw new Error("Unexpected PostgreSQL client construction");
    return client;
  });
  const execFileSync = vi.fn(() => {
    if (scenario.execFailure) throw scenario.execFailure;
    return Buffer.from("");
  });
  const spawnSync = vi.fn(() => ({
    status: 1,
    stderr: "db:apply-schema requires an empty owner schema",
  }));
  const previousAdminUrl = process.env.TEST_ADMIN_DATABASE_URL;
  const previousFreshDatabaseName = process.env.TEST_SYSTEM_FRESH_DATABASE_NAME;
  process.env.TEST_ADMIN_DATABASE_URL =
    "postgresql://fixture:fixture@127.0.0.1:1/postgres";
  if ("freshDatabaseName" in scenario) {
    const freshDatabaseName = scenario.freshDatabaseName;
    if (freshDatabaseName === undefined)
      throw new Error("Fresh database name scenario must be a string");
    process.env.TEST_SYSTEM_FRESH_DATABASE_NAME = freshDatabaseName;
  } else {
    delete process.env.TEST_SYSTEM_FRESH_DATABASE_NAME;
  }
  vi.resetModules();
  vi.doMock("pg", () => ({ Client }));
  vi.doMock("node:child_process", () => ({ execFileSync, spawnSync }));
  let caught = false;
  let failure: unknown;
  try {
    await import("../../scripts/verify-system-fresh-schema.js");
  } catch (error) {
    caught = true;
    failure = error;
  } finally {
    if (previousAdminUrl === undefined)
      delete process.env.TEST_ADMIN_DATABASE_URL;
    else process.env.TEST_ADMIN_DATABASE_URL = previousAdminUrl;
    if (previousFreshDatabaseName === undefined)
      delete process.env.TEST_SYSTEM_FRESH_DATABASE_NAME;
    else
      process.env.TEST_SYSTEM_FRESH_DATABASE_NAME = previousFreshDatabaseName;
    vi.doUnmock("pg");
    vi.doUnmock("node:child_process");
    vi.resetModules();
  }
  return {
    admin,
    database,
    Client,
    execFileSync,
    spawnSync,
    caught,
    failure,
  };
}

it("continues fresh-schema cleanup after database end and drop failures while preserving every cause", async () => {
  const setupFailure = new Error("fresh setup query failed");
  const databaseEndFailure = new Error("fresh database end failed");
  const dropFailure = new Error("fresh database drop failed");
  const adminEndFailure = new Error("fresh admin end failed");
  const result = await executeFreshSchemaEntry({
    queryFailure: setupFailure,
    databaseEndFailure,
    dropFailure,
    adminEndFailure,
  });
  const adminSql = result.admin.query.mock.calls.map(([sql]) => sql);
  const createdName = /^CREATE DATABASE "(system_g1_[a-f0-9]{32})"$/u.exec(
    adminSql[0] ?? "",
  )?.[1];
  expect(createdName).toBeDefined();
  expect(result.database.connect).toHaveBeenCalledOnce();
  expect(result.database.end).toHaveBeenCalledOnce();
  expect
    .soft(adminSql)
    .toContain(`DROP DATABASE "${createdName}" WITH (FORCE)`);
  expect.soft(result.admin.end).toHaveBeenCalledOnce();
  expect.soft(result.failure).toBeInstanceOf(AggregateError);
  expect
    .soft(failureMessages(result.failure))
    .toEqual(
      expect.arrayContaining([
        setupFailure.message,
        databaseEndFailure.message,
        dropFailure.message,
      ]),
    );
  expect
    .soft(failureMessages(result.failure))
    .toContain(adminEndFailure.message);
  const failures = failureObjects(result.failure);
  for (const failure of [
    setupFailure,
    databaseEndFailure,
    dropFailure,
    adminEndFailure,
  ])
    expect.soft(failures).toContain(failure);
});

it("preserves a fresh-schema setup failure when exact cleanup succeeds", async () => {
  const setupFailure = new Error("fresh schema child setup failed");
  const result = await executeFreshSchemaEntry({ execFailure: setupFailure });
  const adminSql = result.admin.query.mock.calls.map(([sql]) => sql);
  const createdName = /^CREATE DATABASE "(system_g1_[a-f0-9]{32})"$/u.exec(
    adminSql[0] ?? "",
  )?.[1];
  expect(createdName).toBeDefined();
  expect(result.failure).toBe(setupFailure);
  expect(result.execFileSync).toHaveBeenCalledOnce();
  expect(result.spawnSync).not.toHaveBeenCalled();
  expect(result.database.connect).not.toHaveBeenCalled();
  expect(result.database.end).not.toHaveBeenCalled();
  expect(adminSql).toContain(`DROP DATABASE "${createdName}" WITH (FORCE)`);
  expect(result.admin.end).toHaveBeenCalledOnce();
});

it("does not drop an uncreated fresh-schema database and still closes admin", async () => {
  const createFailure = new Error("fresh database create failed");
  const result = await executeFreshSchemaEntry({ createFailure });
  const adminSql = result.admin.query.mock.calls.map(([sql]) => sql);
  expect(result.failure).toBe(createFailure);
  expect(adminSql).toHaveLength(1);
  expect(adminSql[0]).toMatch(/^CREATE DATABASE "system_g1_[a-f0-9]{32}"$/u);
  expect(adminSql.some((sql) => sql.startsWith("DROP DATABASE"))).toBe(false);
  expect(result.execFileSync).not.toHaveBeenCalled();
  expect(result.database.connect).not.toHaveBeenCalled();
  expect(result.database.end).not.toHaveBeenCalled();
  expect(result.admin.end).toHaveBeenCalledOnce();
});

it.each(["database.end", "DROP DATABASE", "admin.end"] as const)(
  "continues every exact fresh cleanup step when only %s fails and retains both error objects",
  async (cleanupPoint) => {
    const setupFailure = new Error(`fresh setup before ${cleanupPoint}`);
    const cleanupFailure = new Error(`${cleanupPoint} cleanup failed`);
    const scenario: FreshSchemaScenario = {
      queryFailure: setupFailure,
      ...(cleanupPoint === "database.end"
        ? { databaseEndFailure: cleanupFailure }
        : {}),
      ...(cleanupPoint === "DROP DATABASE"
        ? { dropFailure: cleanupFailure }
        : {}),
      ...(cleanupPoint === "admin.end"
        ? { adminEndFailure: cleanupFailure }
        : {}),
    };
    const result = await executeFreshSchemaEntry(scenario);
    const adminSql = result.admin.query.mock.calls.map(([sql]) => sql);
    const createdName = /^CREATE DATABASE "(system_g1_[a-f0-9]{32})"$/u.exec(
      adminSql[0] ?? "",
    )?.[1];
    expect(createdName).toBeDefined();
    expect(result.database.end).toHaveBeenCalledOnce();
    expect
      .soft(adminSql.filter((sql) => sql.startsWith("DROP DATABASE")))
      .toEqual([`DROP DATABASE "${createdName}" WITH (FORCE)`]);
    expect.soft(result.admin.end).toHaveBeenCalledOnce();
    expect.soft(result.failure).toBeInstanceOf(AggregateError);
    const failures = failureObjects(result.failure);
    expect.soft(failures).toContain(setupFailure);
    expect.soft(failures).toContain(cleanupFailure);
  },
);

it("retains create and admin cleanup errors without dropping an uncreated fresh database", async () => {
  const createFailure = new Error("fresh database create primary failed");
  const adminEndFailure = new Error("fresh admin cleanup after create failed");
  const result = await executeFreshSchemaEntry({
    createFailure,
    adminEndFailure,
  });
  const adminSql = result.admin.query.mock.calls.map(([sql]) => sql);
  expect(adminSql).toHaveLength(1);
  expect(adminSql[0]).toMatch(/^CREATE DATABASE "system_g1_[a-f0-9]{32}"$/u);
  expect(adminSql.some((sql) => sql.startsWith("DROP DATABASE"))).toBe(false);
  expect(result.execFileSync).not.toHaveBeenCalled();
  expect(result.database.connect).not.toHaveBeenCalled();
  expect(result.database.end).not.toHaveBeenCalled();
  expect(result.admin.end).toHaveBeenCalledOnce();
  expect(result.failure).toBeInstanceOf(AggregateError);
  const failures = failureObjects(result.failure);
  expect(failures).toContain(createFailure);
  expect(failures).toContain(adminEndFailure);
});

it("rejects when fresh-schema query rejects undefined and cleanup succeeds", async () => {
  const result = await executeFreshSchemaEntry({ rejectQueryWith: undefined });
  const adminSql = result.admin.query.mock.calls.map(([sql]) => sql);
  const createdName = /^CREATE DATABASE "(system_g1_[a-f0-9]{32})"$/u.exec(
    adminSql[0] ?? "",
  )?.[1];
  expect(createdName).toBeDefined();
  expect(result.database.end).toHaveBeenCalledOnce();
  expect(adminSql).toContain(`DROP DATABASE "${createdName}" WITH (FORCE)`);
  expect(result.admin.end).toHaveBeenCalledOnce();
  expect(result.caught).toBe(true);
  expect(result.failure).toBeInstanceOf(Error);
  if (result.failure instanceof Error) {
    expect(Object.hasOwn(result.failure, "cause")).toBe(true);
    expect(result.failure.cause).toBeUndefined();
  }
});

it("retains undefined fresh-schema primary when cleanup also fails", async () => {
  const cleanupFailure = new Error(
    "fresh cleanup with undefined primary failed",
  );
  const result = await executeFreshSchemaEntry({
    rejectQueryWith: undefined,
    dropFailure: cleanupFailure,
  });
  const adminSql = result.admin.query.mock.calls.map(([sql]) => sql);
  const createdName = /^CREATE DATABASE "(system_g1_[a-f0-9]{32})"$/u.exec(
    adminSql[0] ?? "",
  )?.[1];
  expect(createdName).toBeDefined();
  expect(result.database.end).toHaveBeenCalledOnce();
  expect(adminSql).toContain(`DROP DATABASE "${createdName}" WITH (FORCE)`);
  expect(result.admin.end).toHaveBeenCalledOnce();
  expect(result.caught).toBe(true);
  expect(result.failure).toBeInstanceOf(AggregateError);
  const failures = failureObjects(result.failure);
  expect(failures).toContain(undefined);
  expect(failures).toContain(cleanupFailure);
});

const explicitFreshDatabaseName = "system_g1_0123456789abcdef0123456789abcdef";

it("uses an explicit valid fresh database name for exact create and cleanup", async () => {
  const setupFailure = new Error("explicit fresh database setup failed");
  const result = await executeFreshSchemaEntry({
    freshDatabaseName: explicitFreshDatabaseName,
    queryFailure: setupFailure,
  });
  const adminSql = result.admin.query.mock.calls.map(([sql]) => sql);
  expect(result.failure).toBe(setupFailure);
  expect(result.Client).toHaveBeenCalledTimes(2);
  expect.soft(result.Client).toHaveBeenNthCalledWith(2, {
    connectionString: `postgresql://fixture:fixture@127.0.0.1:1/${explicitFreshDatabaseName}`,
    schema: "system_fresh",
    options:
      "-c timezone=UTC -c search_path=system_fresh,pg_catalog -c lock_timeout=3000",
  });
  expect(result.admin.connect).toHaveBeenCalledOnce();
  expect(result.execFileSync).toHaveBeenCalledOnce();
  expect(result.spawnSync).toHaveBeenCalledOnce();
  expect(result.database.connect).toHaveBeenCalledOnce();
  expect(adminSql).toContain(`CREATE DATABASE "${explicitFreshDatabaseName}"`);
  expect(adminSql).toContain(
    `DROP DATABASE "${explicitFreshDatabaseName}" WITH (FORCE)`,
  );
});

it.each([
  ["empty", ""],
  ["leading whitespace", ` ${explicitFreshDatabaseName}`],
  ["trailing whitespace", `${explicitFreshDatabaseName} `],
  ["uppercase hex", "system_g1_0123456789ABCDEF0123456789abcdef"],
  ["wrong prefix", "system_g2_0123456789abcdef0123456789abcdef"],
  ["31 lowercase hex characters", `system_g1_${"a".repeat(31)}`],
  ["33 lowercase hex characters", `system_g1_${"a".repeat(33)}`],
  ["quote injection", `${explicitFreshDatabaseName}";SELECT 1;--`],
  ["Unicode", `system_g1_${"a".repeat(31)}é`],
  ["LF suffix", `${explicitFreshDatabaseName}\n`],
  ["CRLF suffix", `${explicitFreshDatabaseName}\r\n`],
] as const)(
  "rejects invalid explicit fresh database name: %s before constructing resources",
  async (_caseName, freshDatabaseName) => {
    const result = await executeFreshSchemaEntry({
      freshDatabaseName,
      queryFailure: new Error("invalid name reached database setup"),
    });
    expect.soft(result.caught).toBe(true);
    expect.soft(result.failure).toBeInstanceOf(Error);
    expect.soft(result.Client.mock.calls.length).toBe(0);
    expect.soft(result.admin.connect.mock.calls.length).toBe(0);
    expect.soft(result.admin.query.mock.calls.length).toBe(0);
    expect.soft(result.admin.end.mock.calls.length).toBe(0);
    expect.soft(result.database.connect.mock.calls.length).toBe(0);
    expect.soft(result.database.query.mock.calls.length).toBe(0);
    expect.soft(result.database.end.mock.calls.length).toBe(0);
    expect.soft(result.execFileSync.mock.calls.length).toBe(0);
    expect.soft(result.spawnSync.mock.calls.length).toBe(0);
  },
);

it("keeps the random UUID fresh database name when no explicit name is provided", async () => {
  const setupFailure = new Error("default random fresh database setup failed");
  const result = await executeFreshSchemaEntry({ queryFailure: setupFailure });
  const adminSql = result.admin.query.mock.calls.map(([sql]) => sql);
  const createdName = /^CREATE DATABASE "(system_g1_[a-f0-9]{32})"$/u.exec(
    adminSql[0] ?? "",
  )?.[1];
  expect(createdName).toBeDefined();
  expect(result.failure).toBe(setupFailure);
  expect(result.Client).toHaveBeenCalledTimes(2);
  expect(result.admin.connect).toHaveBeenCalledOnce();
  expect(result.execFileSync).toHaveBeenCalledOnce();
  expect(result.spawnSync).toHaveBeenCalledOnce();
  expect(result.database.connect).toHaveBeenCalledOnce();
  expect(adminSql).toContain(`DROP DATABASE "${createdName}" WITH (FORCE)`);
});
