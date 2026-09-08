import { CacheService } from "../../src/cache/cache.service.js";
import type { Socket } from "node:net";
import { createServer } from "node:net";
import { SystemConfig } from "../../src/config/system-config.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startSystem } from "../../src/start-system.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { withRequestBudget } from "../../src/http/request-budget.js";
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!adminUrl)
  throw new Error("TEST_ADMIN_DATABASE_URL required for lifecycle integration");
const databaseName = `system_g5_lifecycle_${randomUUID().replaceAll("-", "")}`;
const url = new URL(adminUrl);
url.pathname = `/${databaseName}`;
const admin = new Client({ connectionString: adminUrl });
beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const db = new Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query("SET search_path TO public,pg_catalog");
    await db.query(readFileSync("database/schema.sql", "utf8"));
  } finally {
    await db.end();
  }
});
afterAll(async () => {
  await admin.query(`DROP DATABASE "${databaseName}" WITH(FORCE)`);
  await admin.end();
});
const env = {
  DATABASE_URL: url.href,
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/2",
  KOKORO_SYSTEM_REDIS_NAMESPACE: databaseName,
  KOKORO_SYSTEM_BFF_SERVICE_TOKEN: "lifecycle-bff-credential",
  KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "lifecycle-agent-credential",
  KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: "lifecycle-admin-credential",
  KOKORO_SYSTEM_PORT: "0",
  KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS: "300",
  KOKORO_SYSTEM_REQUEST_TIMEOUT_MS: "200",
};
describe("production Nest lifecycle", () => {
  it("constructs one validated config shared by bootstrap and Nest providers", async () => {
    let reads = 0;
    const environment = {
      ...env,
      get DATABASE_URL() {
        reads++;
        return env.DATABASE_URL;
      },
    };
    const running = await startSystem(environment);
    try {
      expect(reads).toBe(1);
      expect(running.app.get(SystemConfig)).toBe(running.app.get(SystemConfig));
      expect(running.app.get(SystemConfig).values.DATABASE_URL).toBe(
        env.DATABASE_URL,
      );
    } finally {
      await running.close();
    }
  });
  it("starts full owner, cancels active SQL and closes within drain deadline", async () => {
    const running = await startSystem(env);
    try {
      expect((await fetch(`${running.url}/readyz`)).status).toBe(200);
      expect(
        (
          await fetch(`${running.url}/healthz`, {
            headers: { "x-request-id": "bad/request" },
          })
        ).status,
      ).toBe(400);
      const controller = new AbortController();
      const db = running.app.get(DatabaseService);
      const query = withRequestBudget(
        { signal: controller.signal, deadline: Date.now() + 1000 },
        () => db.transaction((tx) => tx.query("SELECT pg_sleep(5)")),
      );
      setTimeout(() => controller.abort(), 50);
      await expect(query).rejects.toThrow();
      const started = Date.now();
      await running.close();
      expect(Date.now() - started).toBeLessThan(1500);
    } finally {
      await running.close();
    }
  });
  it("cancels blocked HTTP mutations at deadline without late commits", async () => {
    const running = await startSystem(env);
    const lock = new Client({ connectionString: url.href });
    await lock.connect();
    await lock.query("SET search_path TO public,pg_catalog");
    const id = randomUUID();
    const headers = {
      "x-kokoro-service": "web-bff",
      authorization: `Bearer ${env.KOKORO_SYSTEM_BFF_SERVICE_TOKEN}`,
      "x-kokoro-tenant-id": "deadline-tenant",
      "x-kokoro-actor-id": "actor",
      "x-kokoro-iam-permissions": "system:write,system:read",
      "idempotency-key": randomUUID(),
      "if-match": '"1"',
      "content-type": "application/json",
    };
    try {
      await lock.query(
        "INSERT INTO system_site(id,tenant_id,site_key,display_name,status) VALUES($1,'deadline-tenant',$2,'Original','active')",
        [id, id],
      );
      await lock.query("BEGIN");
      await lock.query("SELECT id FROM system_site WHERE id=$1 FOR UPDATE", [
        id,
      ]);
      const response = await fetch(`${running.url}/v1/system/sites/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ display_name: "Late mutation" }),
      });
      expect(response.status).toBe(503);
      expect(response.headers.get("x-request-id")).toBeTruthy();
      expect(await response.json()).toMatchObject({
        error: { code: "SYSTEM_UNAVAILABLE", retryable: true },
      });
      await lock.query("ROLLBACK");
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(
        (
          await lock.query(
            "SELECT display_name,version::text FROM system_site WHERE id=$1",
            [id],
          )
        ).rows[0],
      ).toEqual({ display_name: "Original", version: "1" });
    } finally {
      await lock.query("ROLLBACK");
      await lock.end();
      await running.close();
    }
  });
  it("bounds drain while PostgreSQL handshake is stalled", async () => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No listener");
    const db = new DatabaseService(
      new SystemConfig({
        ...env,
        DATABASE_URL: `postgresql://nako@127.0.0.1:${address.port}/fixture`,
      }),
    );
    const work = db.ready().catch(() => false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const began = Date.now();
    try {
      await db.onApplicationShutdown();
      expect(Date.now() - began).toBeLessThan(800);
      expect(await work).toBe(false);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("enforces restore deadline without waiting for maintenance", async () => {
    const running = await startSystem(env);
    try {
      const id = randomUUID();
      await running.app
        .get(DatabaseService)
        .transaction((tx) =>
          tx.query(
            "INSERT INTO system_product(id,product_key,name,status,deleted_at) VALUES($1,$2,'Expired','archived',CURRENT_TIMESTAMP-INTERVAL '31 days')",
            [id, id],
          ),
        );
      const response = await fetch(
        `${running.url}/v1/system/products/${id}/restore`,
        {
          method: "POST",
          headers: {
            "x-kokoro-service": "system-admin",
            authorization: `Bearer ${env.KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN}`,
            "x-kokoro-actor-id": "maintenance-test",
            "x-kokoro-iam-permissions": "system:write",
            "idempotency-key": randomUUID(),
            "if-match": '"1"',
          },
        },
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: "INVALID_STATE" },
      });
    } finally {
      await running.close();
    }
  });
  it("rejects invalid configuration and releases partial startup on database failure", async () => {
    await expect(
      startSystem({ ...env, KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "" }),
    ).rejects.toThrow();
    const missing = new URL(url);
    missing.pathname = `/system_g5_missing_${randomUUID().replaceAll("-", "")}`;
    const cacheClose = vi.spyOn(
      CacheService.prototype,
      "onApplicationShutdown",
    );
    const databaseClose = vi.spyOn(
      DatabaseService.prototype,
      "onApplicationShutdown",
    );
    try {
      await expect(
        startSystem({ ...env, DATABASE_URL: missing.href }),
      ).rejects.toThrow();
      expect(cacheClose).toHaveBeenCalledOnce();
      expect(databaseClose).toHaveBeenCalledOnce();
    } finally {
      cacheClose.mockRestore();
      databaseClose.mockRestore();
    }
  });
});
