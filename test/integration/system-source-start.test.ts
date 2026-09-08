import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
it("starts the actual pnpm dev entry and drains on SIGTERM in isolated storage", async () => {
  const result = await promisify(execFile)(
    process.execPath,
    ["--import", "tsx", "scripts/system-runtime-smoke.ts"],
    { env: process.env, timeout: 20000 },
  );
  expect(result.stdout).toContain("source smoke passed");
}, 25000);
it("drops its registered database even when the runtime executable is missing", async () => {
  const { Client } = await import("pg");
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
  if (!adminUrl) throw new Error("TEST_ADMIN_DATABASE_URL required");
  let failure: unknown;
  try {
    await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "scripts/system-runtime-smoke.ts"],
      {
        env: { ...process.env, PATH: "/system-smoke-no-executables" },
        timeout: 20000,
      },
    );
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeDefined();
  if (typeof failure !== "object" || failure === null || !("stdout" in failure))
    throw new Error("Missing smoke output");
  const output = String(failure.stdout);
  expect(output).not.toContain("smoke passed");
  const name = output.match(
    /System smoke fixture created: (system_g5_smoke_[a-f0-9]+)/u,
  )?.[1];
  expect(name).toBeDefined();
  const db = new Client({ connectionString: adminUrl });
  await db.connect();
  try {
    expect(
      (
        await db.query("SELECT datname FROM pg_database WHERE datname=$1", [
          name,
        ])
      ).rowCount,
    ).toBe(0);
  } finally {
    await db.end();
  }
}, 25000);
it("still drops its database when docker removal returns an error status", async () => {
  const { mkdtemp, writeFile, chmod, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { Client } = await import("pg");
  const directory = await mkdtemp(join(tmpdir(), "system-smoke-docker-"));
  let failure: unknown;
  try {
    const executable = join(directory, "docker");
    await writeFile(executable, "#!/bin/sh\nexit 73\n");
    await chmod(executable, 0o700);
    try {
      await promisify(execFile)(
        process.execPath,
        ["--import", "tsx", "scripts/system-runtime-smoke.ts", "--image"],
        {
          env: {
            ...process.env,
            PATH: directory,
            SYSTEM_SMOKE_IMAGE: "local-fixture",
          },
          timeout: 20000,
        },
      );
    } catch (error) {
      failure = error;
    }
    if (
      typeof failure !== "object" ||
      failure === null ||
      !("stdout" in failure) ||
      !("stderr" in failure)
    )
      throw new Error("Expected failed image smoke");
    const output = String(failure.stdout);
    expect(output).not.toContain("smoke passed");
    expect(String(failure.stderr)).toContain("Smoke container cleanup failed");
    const name = output.match(
      /System smoke fixture created: (system_g5_smoke_[a-f0-9]+)/u,
    )?.[1];
    expect(name).toBeDefined();
    const db = new Client({
      connectionString: process.env.TEST_ADMIN_DATABASE_URL,
    });
    await db.connect();
    try {
      expect(
        (
          await db.query("SELECT datname FROM pg_database WHERE datname=$1", [
            name,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      await db.end();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 25000);
