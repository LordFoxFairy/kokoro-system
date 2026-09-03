import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { createSystemRuntime } from "../../src/bootstrap/runtime.js";
import { createHttpServer } from "../../src/interfaces/http/server.js";
import { createSystemClient } from "../../sdk/typescript/src/client.js";

type ConnectionOptions = { connectionString: string };

const tenantId =
  process.env.SMOKE_TENANT_ID ?? "00000000-0000-4000-8000-000000000001";
const tenantHost = process.env.SMOKE_TENANT_HOST ?? "admin.example.test";
const productId = "00000000-0000-4000-8000-0000000000c1";
const releaseId = "00000000-0000-4000-8000-0000000000d1";
const bffServiceToken =
  process.env.KOKORO_SYSTEM_BFF_SERVICE_TOKEN ??
  process.env.SYSTEM_BFF_SERVICE_TOKEN ??
  "system-real-smoke-token";
const redisNamespace = `kokoro:system:real-smoke:${process.pid}:${Date.now()}`;

function connectionOptions(value: string, database: string): ConnectionOptions {
  const url = new URL(value);
  url.pathname = `/${database}`;
  return { connectionString: url.toString() };
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function execute(
  connection: Client,
  sql: string,
  values: readonly unknown[] = [],
): Promise<void> {
  await connection.query(sql, [...values]);
}

async function createDatabase(
  baseUrl: string,
  prefix: string,
  schema: string,
): Promise<{ databaseUrl: string; drop(): Promise<void> }> {
  const base = new URL(baseUrl);
  const database = `${prefix}_${process.pid}_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const admin = new Client(
    connectionOptions(baseUrl, decodeURIComponent(base.pathname.slice(1))),
  );
  await admin.connect();
  await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
  await admin.end();
  const databaseUrl = new URL(baseUrl);
  databaseUrl.pathname = `/${database}`;
  const schemaConnection = new Client(
    connectionOptions(databaseUrl.toString(), database),
  );
  try {
    await schemaConnection.connect();
    if (schema.trim()) await schemaConnection.query(schema);
  } finally {
    await schemaConnection.end();
  }
  return {
    databaseUrl: databaseUrl.toString(),
    async drop(): Promise<void> {
      const cleanup = new Client(
        connectionOptions(baseUrl, decodeURIComponent(base.pathname.slice(1))),
      );
      try {
        await cleanup.connect();
        await cleanup.query(
          `DROP DATABASE IF EXISTS ${quoteIdentifier(database)}`,
        );
      } finally {
        await cleanup.end();
      }
    },
  };
}

async function seedSystem(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const connection = new Client(
    connectionOptions(databaseUrl, decodeURIComponent(url.pathname.slice(1))),
  );
  try {
    await connection.connect();
    const now = new Date();
    const siteId = randomUUID();
    await execute(
      connection,
      "INSERT INTO system_site (id, tenant_id, site_key, display_name, status, version, created_at, updated_at) VALUES ($1, $2, 'main', 'Main', 'active', 1, $3, $4)",
      [siteId, tenantId, now, now],
    );
    await execute(
      connection,
      "INSERT INTO system_site_host (id, tenant_id, site_id, hostname, status, created_at, updated_at) VALUES ($1, $2, $3, $4, 'active', $5, $6)",
      [randomUUID(), tenantId, siteId, tenantHost, now, now],
    );
    await execute(
      connection,
      "INSERT INTO system_product (id, product_key, name, status, created_at, updated_at) VALUES ($1, 'admin', 'Admin', 'active', $2, $3)",
      [productId, now, now],
    );
    await execute(
      connection,
      "INSERT INTO system_config_release (id, release_key, status, digest, published_at, created_at, updated_at) VALUES ($1, 'system-smoke', 'published', $2, $3, $4, $5)",
      [releaseId, "1".repeat(64), now, now, now],
    );
    await execute(
      connection,
      "INSERT INTO system_release_binding (id, scope_type, scope_id, product_id, release_id, status, created_at, updated_at) VALUES ($1, 'tenant', $2, $3, $4, 'active', $5, $6)",
      [randomUUID(), tenantId, productId, releaseId, now, now],
    );
    await execute(
      connection,
      "INSERT INTO system_config_record (id, tenant_id, module_key, scope_type, scope_id, product_id, locale, config_key, schema_version, value_json, status, config_version, release_id, digest, created_at, updated_at) VALUES ($1, $2, 'theme', 'tenant', $3, $4, 'en-US', 'default', 1, $5, 'active', 1, $6, $7, $8, $9)",
      [
        randomUUID(),
        tenantId,
        tenantId,
        productId,
        JSON.stringify({ source: "system-contract" }),
        releaseId,
        "0".repeat(64),
        now,
        now,
      ],
    );
  } finally {
    await connection.end();
  }
}

async function main(): Promise<void> {
  const baseDatabaseUrl =
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;
  if (!baseDatabaseUrl || !redisUrl) {
    throw new Error("TEST_DATABASE_URL and TEST_REDIS_URL are required");
  }

  const systemSchema = await readFile(
    new URL("../../database/schema.sql", import.meta.url),
    "utf8",
  );
  const systemDatabase = await createDatabase(
    baseDatabaseUrl,
    "kokoro_system_real",
    systemSchema,
  );
  let system: Awaited<ReturnType<typeof createSystemRuntime>> | undefined;
  let systemServer: ReturnType<typeof createHttpServer> | undefined;
  let unexpectedServerError: unknown;
  try {
    await seedSystem(systemDatabase.databaseUrl);
    system = await createSystemRuntime({
      databaseUrl: systemDatabase.databaseUrl,
      redisUrl,
      redisNamespace,
    });
    systemServer = createHttpServer(
      system.service,
      async () => {
        await system?.pool.ping();
        await system?.redis.assertReady();
        return true;
      },
      {
        bffServiceToken,
        siteQuery: system.siteQuery,
        onUnexpectedError: (error) => {
          unexpectedServerError = error;
        },
      },
    );
    await new Promise<void>((resolve) =>
      systemServer?.listen(0, "127.0.0.1", resolve),
    );
    const address = systemServer.address();
    if (!address || typeof address === "string")
      throw new Error("System test server did not bind");
    const client = createSystemClient({
      baseUrl: `http://127.0.0.1:${String(address.port)}`,
      tenantId,
      tenantHost,
      serviceToken: bffServiceToken,
      requestId: randomUUID,
    });
    const manifest = await client
      .getRuntimeManifest({ productId, locale: "en-US" })
      .catch((error: unknown) => {
        throw unexpectedServerError ?? error;
      });
    if (
      manifest.tenantId !== tenantId ||
      manifest.productId !== productId ||
      manifest.theme.source !== "system-contract"
    )
      throw new Error("System did not accept the System Site/Host contract");
    const siteResponse = await fetch(
      `http://127.0.0.1:${String(address.port)}/kokoro.site.v1.SiteService/ResolveSiteByHost`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "connect-protocol-version": "1",
          "x-kokoro-service": "web-bff",
          "x-kokoro-internal-secret": bffServiceToken,
          "x-kokoro-tenant-id": tenantId,
          "x-kokoro-request-id": randomUUID(),
        },
        body: JSON.stringify({ host: tenantHost, requestId: randomUUID() }),
      },
    );
    const siteBody: unknown = await siteResponse.json();
    if (
      !siteResponse.ok ||
      typeof siteBody !== "object" ||
      siteBody === null ||
      !("canonicalHost" in siteBody) ||
      siteBody.canonicalHost !== tenantHost
    )
      throw new Error("generated SiteService Connect handler failed");
    console.log(
      JSON.stringify({
        status: "PASS",
        systemListener: true,
        systemSiteHostResolution: true,
        manifest: true,
        siteServiceConnect: true,
      }),
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      if (!systemServer) return resolve();
      systemServer.close((error) => (error ? reject(error) : resolve()));
    });
    await system?.pool.close();
    await system?.redis.close();
    await systemDatabase.drop();
  }
}

await main();
