import { stopOwnedProcessGroup } from "./smoke-process.js";
import { runCleanup } from "./smoke-cleanup.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { Client } from "pg";
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!adminUrl)
  throw new Error("TEST_ADMIN_DATABASE_URL required; smoke never skips");
const image = process.argv.includes("--image")
  ? process.env.SYSTEM_SMOKE_IMAGE
  : undefined;
if (process.argv.includes("--image") && !image)
  throw new Error("SYSTEM_SMOKE_IMAGE required");
const name = `system_g5_smoke_${randomUUID().replaceAll("-", "")}`;
const url = new URL(adminUrl);
url.pathname = `/${name}`;
const admin = new Client({ connectionString: adminUrl });
let created = false,
  child: ChildProcess | undefined,
  exited: Promise<number | null> | undefined;
let output = "";
const allocator = createServer();
await new Promise<void>((resolve) => allocator.listen(0, "127.0.0.1", resolve));
const address = allocator.address();
if (!address || typeof address === "string") throw new Error("No smoke port");
const port = address.port;
await new Promise<void>((resolve) => allocator.close(() => resolve()));
const env = {
  ...process.env,
  DATABASE_URL: url.href,
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/2",
  KOKORO_SYSTEM_REDIS_NAMESPACE: name,
  KOKORO_SYSTEM_PORT: String(port),
  KOKORO_SYSTEM_HOST: "127.0.0.1",
  KOKORO_SYSTEM_BFF_SERVICE_TOKEN: `bff-${randomUUID()}`,
  KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: `agent-${randomUUID()}`,
  KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: `admin-${randomUUID()}`,
  KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS: "1000",
};
const stop = async () => {
  await runCleanup([
    () => {
      if (image) {
        const removal = spawnSync("docker", ["rm", "--force", name], {
          stdio: "ignore",
          timeout: 5000,
        });
        if (removal.error || removal.status !== 0)
          throw new Error("Smoke container cleanup failed");
      }
    },
    async () => {
      if (child?.pid) await stopOwnedProcessGroup(child.pid);
    },
  ]);
};
let primaryFailure: unknown;
let launchError: Error | undefined;

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  console.log(`System smoke fixture created: ${name}`);
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query("SET search_path TO public,pg_catalog");
    await db.query(readFileSync("database/schema.sql", "utf8"));
  } finally {
    await db.end();
  }
  let command = "pnpm",
    args = ["dev"];
  if (image) {
    command = "docker";
    // CI Linux host networking shares only connectivity, never database identity or Redis keys.
    args = ["run", "--name", name, "--network", "host"];
    for (const key of Object.keys(env))
      if (
        key === "DATABASE_URL" ||
        key === "REDIS_URL" ||
        key.startsWith("KOKORO_SYSTEM_")
      )
        args.push("--env", key);
    args.push(image);
  }
  child = spawn(command, args, {
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => {
    output = (output + String(chunk)).slice(-16000);
  });
  child.stderr?.on("data", (chunk) => {
    output = (output + String(chunk)).slice(-16000);
  });
  exited = new Promise((resolve) => {
    child!.once("exit", resolve);
    child!.once("error", (error) => {
      launchError = error;
      resolve(null);
    });
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    if (child.exitCode !== null)
      throw new Error("Runtime exited before readiness");
    try {
      ready = (
        await fetch(`http://127.0.0.1:${port}/readyz`, {
          signal: AbortSignal.timeout(250),
        })
      ).ok;
    } catch {
      /* Bounded startup probe. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Readiness timeout");
  const response = await fetch(`http://127.0.0.1:${port}/v1/system/sites`, {
    signal: AbortSignal.timeout(1000),
  });
  if (response.status !== 403 || !response.headers.get("x-request-id"))
    throw new Error("Authentication/request-id boundary failed");
  if (image) {
    const stopped = spawnSync("docker", ["stop", "--time", "2", name], {
      stdio: "ignore",
      timeout: 5000,
    });
    if (stopped.error || stopped.status !== 0)
      throw new Error("Smoke container stop failed");
  } else {
    const startLine = output
      .split("\n")
      .find(
        (line) =>
          line.startsWith("{") &&
          line.includes('"operation":"service.start"') &&
          line.includes('"result":"success"'),
      );
    if (!startLine) throw new Error("Missing runtime process identity");
    const identity = z
      .object({ pid: z.number().int().positive() })
      .parse(JSON.parse(startLine));
    process.kill(identity.pid, "SIGTERM");
  }
  const code = await Promise.race([
    exited,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Runtime drain timeout")), 2500),
    ),
  ]);
  if (code !== 0) throw new Error(`Runtime exit status ${code}`);
  if (!output.includes('"operation":"service.shutdown"'))
    throw new Error("Missing shutdown evidence");
} catch (error) {
  primaryFailure = error;
} finally {
  try {
    await runCleanup([
      stop,
      async () => {
        if (created) await admin.query(`DROP DATABASE "${name}" WITH(FORCE)`);
      },
      async () => {
        await admin.end();
      },
    ]);
  } catch (error) {
    primaryFailure =
      primaryFailure === undefined
        ? error
        : new AggregateError(
            [primaryFailure, error],
            "System smoke and cleanup failed",
          );
  }
}
if (primaryFailure !== undefined)
  throw primaryFailure instanceof Error
    ? primaryFailure
    : new Error("System smoke failed", { cause: primaryFailure });
console.log(
  `System ${image ? "image" : "source"} smoke passed: fresh DB, readiness, authentication, request ID, signal drain and cleanup`,
);
