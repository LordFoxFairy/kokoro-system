import { type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { createClient } from "redis";
import { createSystemRuntime } from "../../src/bootstrap.js";
import { createHttpServer } from "../../src/interfaces/http/server.js";
import { createSystemClient, SystemSdkError, type RuntimeManifest } from "../../sdk/typescript/src/client.js";

const tenantA = "00000000-0000-4000-8000-0000000000a1";
const tenantB = "00000000-0000-4000-8000-0000000000b1";
const productId = "00000000-0000-4000-8000-0000000000c1";
const productKey = "kokoro";
const releaseId = "00000000-0000-4000-8000-0000000000d1";
const surfaceA = "00000000-0000-4000-8000-0000000000e1";
const bffServiceToken = "system-runtime-smoke-bff-service";
const redisNamespace = `kokoro:system:smoke:${process.pid}:${Date.now()}`;

type ConnectionOptions = { connectionString: string; options: string };

function connectionOptions(value: string, database: string): ConnectionOptions { const url = new URL(value); url.pathname = `/${database}`; return { connectionString: url.toString(), options: "-c search_path=public" }; }
function quoteIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function postgresSql(sql: string): string { let index = 0; return sql.replaceAll("?", () => `$${String(++index)}`); }
async function execute(connection: Client, sql: string, values: readonly unknown[] = []): Promise<void> { await connection.query(postgresSql(sql), [...values]); }

async function listen(server: Server): Promise<{ url: string; close: () => Promise<void> }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function requestStatus(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, init);
  let body: unknown;
  try { body = await response.json(); } catch { body = undefined; }
  return { status: response.status, body };
}

function client(baseUrl: string, tenantId: string, tenantHost: string) {
  return createSystemClient({ baseUrl, tenantId, tenantHost, serviceToken: bffServiceToken, requestId: randomUUID });
}

async function seed(databaseUrl: string): Promise<void> {
  const dbUrl = new URL(databaseUrl);
  const connection = new Client(connectionOptions(databaseUrl, decodeURIComponent(dbUrl.pathname.slice(1))));
  try {
    await connection.connect();
    const now = new Date();
    const insertRecord = async (input: Readonly<{ id: string; tenantId: string | null; moduleKey: string; scopeType: string; scopeId: string | null; productId: string | null; locale: string | null; configKey: string; value: unknown; version: number; releaseId: string | null }>): Promise<void> => {
      await execute(connection,
        `INSERT INTO system_config_record (id, tenant_id, module_key, scope_type, scope_id, product_id, locale, config_key, schema_version, value_json, status, config_version, release_id, digest, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'active', ?, ?, ?, ?, ?)`,
        [input.id, input.tenantId, input.moduleKey, input.scopeType, input.scopeId, input.productId, input.locale, input.configKey, JSON.stringify(input.value), input.version, input.releaseId, "0".repeat(64), now, now],
      );
    };
    await execute(connection, `INSERT INTO system_product (id, product_key, name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`, [productId, productKey, "Kokoro", now, now]);
    await execute(connection, `INSERT INTO system_site (id, tenant_id, site_key, hostnames_json, display_name, status, version, created_at, updated_at) VALUES (?, ?, ?, ?::jsonb, ?, 'active', 1, ?, ?)`, [randomUUID(), tenantA, "main-a", JSON.stringify(["tenant-a.example.test"]), "Tenant A", now, now]);
    await execute(connection, `INSERT INTO system_site (id, tenant_id, site_key, hostnames_json, display_name, status, version, created_at, updated_at) VALUES (?, ?, ?, ?::jsonb, ?, 'active', 1, ?, ?)`, [randomUUID(), tenantB, "main-b", JSON.stringify(["tenant-b.example.test"]), "Tenant B", now, now]);
    await execute(connection, `INSERT INTO system_config_release (id, release_key, status, digest, published_at, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?, ?)`, [releaseId, "smoke-release", "1".repeat(64), now, now, now]);
    await execute(connection, `INSERT INTO system_release_binding (id, scope_type, scope_id, product_id, release_id, status, created_at, updated_at) VALUES (?, 'tenant', ?, ?, ?, 'active', ?, ?)`, [randomUUID(), tenantA, productId, releaseId, now, now]);
    await execute(connection, `INSERT INTO system_release_binding (id, scope_type, scope_id, product_id, release_id, status, created_at, updated_at) VALUES (?, 'tenant', ?, ?, ?, 'active', ?, ?)`, [randomUUID(), tenantB, productId, releaseId, now, now]);
    await insertRecord({ id: randomUUID(), tenantId: null, moduleKey: "theme", scopeType: "global", scopeId: null, productId: null, locale: null, configKey: "default", value: { source: "global" }, version: 1, releaseId: null });
    await insertRecord({ id: randomUUID(), tenantId: tenantA, moduleKey: "theme", scopeType: "tenant", scopeId: tenantA, productId: null, locale: "en-US", configKey: "default", value: { source: "tenant-a" }, version: 2, releaseId: null });
    await insertRecord({ id: randomUUID(), tenantId: tenantB, moduleKey: "theme", scopeType: "tenant", scopeId: tenantB, productId: null, locale: "en-US", configKey: "default", value: { source: "tenant-b" }, version: 2, releaseId: null });
    await insertRecord({ id: randomUUID(), tenantId: tenantA, moduleKey: "theme", scopeType: "surface", scopeId: surfaceA, productId, locale: "en-US", configKey: "default", value: { source: "surface-a" }, version: 3, releaseId });
    await insertRecord({ id: randomUUID(), tenantId: tenantA, moduleKey: "navigation", scopeType: "tenant", scopeId: tenantA, productId, locale: "en-US", configKey: "main", value: [{ label: "Dashboard", href: "/" }], version: 4, releaseId });
  } finally {
    await connection.end();
  }
}

async function createDatabase(baseUrl: string): Promise<{ databaseUrl: string; drop: () => Promise<void> }> {
  const database = `kokoro_system_smoke_${process.pid}_${Date.now()}`;
  const base = new URL(baseUrl);
  const admin = new Client(connectionOptions(baseUrl, decodeURIComponent(base.pathname.slice(1))));
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
  await admin.end();
  const databaseUrl = new URL(baseUrl);
  databaseUrl.pathname = `/${database}`;
  databaseUrl.searchParams.set("schema", "public");
  databaseUrl.searchParams.set("options", "-c search_path=public");
  const schema = await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8");
  const schemaConnection = new Client(connectionOptions(databaseUrl.toString(), database));
  try { await schemaConnection.connect(); await schemaConnection.query(schema); } finally { await schemaConnection.end(); }
  return {
    databaseUrl: databaseUrl.toString(),
    drop: async () => {
      const cleanup = new Client(connectionOptions(baseUrl, decodeURIComponent(base.pathname.slice(1))));
      try { await cleanup.connect(); await cleanup.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)}`); } finally { await cleanup.end(); }
    },
  };
}

async function main(): Promise<void> {
  const baseDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  const testRedisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;
  if (!baseDatabaseUrl || !testRedisUrl) throw new Error("TEST_DATABASE_URL and TEST_REDIS_URL are required");

  const database = await createDatabase(baseDatabaseUrl);
  const redis = createClient({ url: testRedisUrl });
  await redis.connect();
  const runtime = await createSystemRuntime({ databaseUrl: database.databaseUrl, redisUrl: testRedisUrl, redisNamespace });
  const systemServer = createHttpServer(runtime.service, async () => { await runtime.pool.ping(); await runtime.redis.assertReady(); return true; }, { bffServiceToken });
  const system = await listen(systemServer);
  try {
    await seed(database.databaseUrl);
    const a = client(system.url, tenantA, "tenant-a.example.test");
    const b = client(system.url, tenantB, "tenant-b.example.test");
    const surface = await a.getRuntimeManifest({ productId: productKey, locale: "en-US", surfaceId: surfaceA });
    const cached = await a.getRuntimeManifest({ productId: productKey, locale: "en-US", surfaceId: surfaceA });
    const tenantOnly = await a.getRuntimeManifest({ productId: productKey, locale: "en-US" });
    const otherTenant = await b.getRuntimeManifest({ productId: productKey, locale: "en-US" });
    assert((surface.theme as { source?: string }).source === "surface-a", "surface precedence failed");
    assert(surface.productId === productKey, "product key response identity failed");
    assert(cached.digest === surface.digest, "cached digest changed");
    assert((tenantOnly.theme as { source?: string }).source === "tenant-a", "tenant precedence failed");
    assert((otherTenant.theme as { source?: string }).source === "tenant-b", "tenant cache isolation failed");
    assert(tenantOnly.tenantId === tenantA && otherTenant.tenantId === tenantB, "tenant response identity failed");

    const missingServiceAuth = await requestStatus(`${system.url}/system/runtime-manifest?product_id=${productKey}`, { headers: { "x-kokoro-tenant-id": tenantA } });
    assert(missingServiceAuth.status === 403, "missing service auth did not return 403");
    const missingTenant = await requestStatus(`${system.url}/system/runtime-manifest?product_id=${productKey}`, { headers: { "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": bffServiceToken } });
    assert(missingTenant.status === 400, "missing tenant header did not return 400");
    const missingProduct = await requestStatus(`${system.url}/system/runtime-manifest`, { headers: { "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": bffServiceToken, "x-kokoro-tenant-id": tenantA } });
    assert(missingProduct.status === 400, "missing product did not return 400");
    const unknownPath = await requestStatus(`${system.url}/not-found`);
    assert(unknownPath.status === 404, "unknown path did not return 404");

    const mismatch = client(system.url, tenantB, "tenant-a.example.test");
    await expectSdkStatus(() => mismatch.getRuntimeManifest({ productId: productKey, locale: "en-US" }), 503, "System Site/Host mismatch");
    await runtime.redis.set(`manifest:${tenantA}:${productKey}:en-US:default`, { ...tenantOnly, tenantId: tenantB }, 30);
    await expectSdkStatus(() => a.getRuntimeManifest({ productId: productKey, locale: "en-US" }), 503, "cache identity mismatch");
    console.log(JSON.stringify({ status: "PASS", listener: true, sdk: true, tenantIsolation: true, precedence: true, cacheIdentity: true, httpErrors: true }));
  } finally {
    await system.close();
    await runtime.pool.close();
    await runtime.redis.close();
    await redis.del(`${redisNamespace}:manifest:${tenantA}:${productKey}:en-US:surface-a`, `${redisNamespace}:manifest:${tenantA}:${productKey}:en-US:default`);
    await redis.quit();
    await database.drop();
  }
}

async function expectSdkStatus(operation: () => Promise<RuntimeManifest>, status: number, label: string): Promise<void> {
  try { await operation(); } catch (error) { if (error instanceof SystemSdkError && error.status === status) return; throw new Error(`${label} did not return HTTP ${status}`); }
  throw new Error(`${label} unexpectedly succeeded`);
}

await main();
