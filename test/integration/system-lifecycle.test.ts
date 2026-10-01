import { CacheService } from "../../src/cache/cache.service.js";
import { createServer, Socket } from "node:net";
import { SystemConfig } from "../../src/config/system-config.js";
import { parseSystemDatabaseUrl } from "../../src/config/database-url.js";
import { snapshotSystemSchemaCatalog } from "../../scripts/system-schema-catalog.js";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
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
url.searchParams.set("schema", "system_fixture");
const admin = new Client({ connectionString: adminUrl });
let adminConnected = false;
let databaseCreated = false;
beforeAll(async () => {
  await admin.connect();
  adminConnected = true;
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  databaseCreated = true;
  const db = new Client(parseSystemDatabaseUrl(url.href));
  await db.connect();
  try {
    await db.query("CREATE SCHEMA system_fixture");
    await db.query("SET search_path TO system_fixture,pg_catalog");
    await db.query(readFileSync("database/schema.sql", "utf8"));
  } finally {
    await db.end();
  }
});
afterAll(async () => {
  try {
    if (databaseCreated)
      await admin.query(`DROP DATABASE "${databaseName}" WITH(FORCE)`);
  } finally {
    if (adminConnected) await admin.end();
  }
});

// Collection executes no resource work. Root alone runs these owned fixtures.
async function withOwnerNamespaceDatabase(
  work: (
    db: Client,
    databaseUrl: URL,
    owner: string,
    neighbor: string,
  ) => Promise<void>,
  publicSentinel = true,
): Promise<void> {
  const name = `system_r39_${randomUUID().replaceAll("-", "")}`;
  const owner = "system_r39_owner";
  const neighbor = "system_r39_neighbor";
  const databaseUrl = new URL(url);
  databaseUrl.pathname = `/${name}`;
  databaseUrl.searchParams.delete("schema");
  databaseUrl.searchParams.delete("options");
  const adminSocket = new Socket();
  const databaseSocket = new Socket();
  const resourceAdmin = new Client({
    connectionString: adminUrl,
    connectionTimeoutMillis: 3000,
    query_timeout: 6000,
    statement_timeout: 5000,
    stream: () => adminSocket,
  });
  const db = new Client({
    connectionString: databaseUrl.href,
    connectionTimeoutMillis: 3000,
    query_timeout: 6000,
    statement_timeout: 5000,
    stream: () => databaseSocket,
    options:
      "-c timezone=UTC -c search_path=public,pg_catalog -c lock_timeout=3000",
  });
  let created = false;
  try {
    await resourceAdmin.connect();
    await resourceAdmin.query(`CREATE DATABASE "${name}"`);
    created = true;
    await db.connect();
    await db.query("SET search_path TO public,pg_catalog");
    if (publicSentinel)
      await db.query(readFileSync("database/schema.sql", "utf8"));
    await db.query(`CREATE SCHEMA "${owner}"; CREATE SCHEMA "${neighbor}"`);
    if (publicSentinel)
      await db.query(
        "CREATE TABLE public.system_r39_marker (value text NOT NULL); INSERT INTO public.system_r39_marker VALUES ('public-sentinel')",
      );
    await db.query(`
      CREATE TABLE "${neighbor}".system_r39_marker (value text NOT NULL);
      INSERT INTO "${neighbor}".system_r39_marker VALUES ('neighbor-sentinel');
    `);
    await work(db, databaseUrl, owner, neighbor);
  } finally {
    try {
      await closeOwnedClient(db, databaseSocket);
    } finally {
      try {
        if (created)
          await resourceAdmin.query(`DROP DATABASE "${name}" WITH(FORCE)`);
      } finally {
        await closeOwnedClient(resourceAdmin, adminSocket);
      }
    }
  }
}

async function closeOwnedClient(client: Client, socket: Socket): Promise<void> {
  const timer = setTimeout(() => socket.destroy(), 300);
  try {
    await client.end();
  } finally {
    clearTimeout(timer);
    socket.destroy();
  }
}

async function externalNamespaceSnapshot(
  db: Client,
  neighbor: string,
  publicSentinel = true,
) {
  const namespaces = ["public", neighbor];
  const relations = await db.query<Record<string, unknown>>(
    `
    SELECT n.nspname,c.relname,c.relkind,c.relpersistence
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=ANY($1::text[]) ORDER BY n.nspname,c.relname
  `,
    [namespaces],
  );
  const columns = await db.query<Record<string, unknown>>(
    `
    SELECT n.nspname,c.relname,a.attnum,a.attname,a.atttypid,a.atttypmod,
           a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,
           pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS default_expression
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
    ORDER BY n.nspname,c.relname,a.attnum
  `,
    [namespaces],
  );
  const constraints = await db.query<Record<string, unknown>>(
    `
    SELECT n.nspname,c.conname,c.contype,c.convalidated,
           pg_catalog.pg_get_constraintdef(c.oid) AS definition
    FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace
    WHERE n.nspname=ANY($1::text[]) ORDER BY n.nspname,c.conname
  `,
    [namespaces],
  );
  const indexes = await db.query<Record<string, unknown>>(
    `
    SELECT schemaname,tablename,indexname,indexdef FROM pg_catalog.pg_indexes
    WHERE schemaname=ANY($1::text[]) ORDER BY schemaname,indexname
  `,
    [namespaces],
  );
  const functions = await db.query<Record<string, unknown>>(
    `
    SELECT n.nspname,p.proname,pg_catalog.pg_get_functiondef(p.oid) AS definition
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname=ANY($1::text[]) AND p.prokind='f' ORDER BY n.nspname,p.proname,p.oid
  `,
    [namespaces],
  );
  const triggers = await db.query<Record<string, unknown>>(
    `
    SELECT n.nspname,c.relname,t.tgname,t.tgenabled,
           pg_catalog.pg_get_triggerdef(t.oid) AS definition
    FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=ANY($1::text[]) AND NOT t.tgisinternal
    ORDER BY n.nspname,c.relname,t.tgname
  `,
    [namespaces],
  );
  const markers = await db.query<Record<string, unknown>>(
    `${publicSentinel ? "SELECT 'public' AS namespace,value FROM public.system_r39_marker UNION ALL " : ""}
    SELECT $1 AS namespace,value FROM "${neighbor}".system_r39_marker
    ORDER BY namespace,value
  `,
    [neighbor],
  );
  const data: {
    namespace: string;
    table: string;
    rows: { value: unknown }[];
  }[] = [];
  for (const relation of relations.rows) {
    if (relation.relkind !== "r" && relation.relkind !== "p") continue;
    if (
      typeof relation.nspname !== "string" ||
      typeof relation.relname !== "string"
    )
      throw new Error("Invalid owned fixture relation metadata");
    const namespace = relation.nspname.replaceAll('"', '""');
    const table = relation.relname.replaceAll('"', '""');
    const rows = await db.query<{ value: unknown }>(
      `SELECT to_jsonb(entry) AS value FROM "${namespace}"."${table}" AS entry ORDER BY to_jsonb(entry)::text`,
    );
    data.push({
      namespace: relation.nspname,
      table: relation.relname,
      rows: rows.rows,
    });
  }
  return {
    relations: relations.rows,
    columns: columns.rows,
    constraints: constraints.rows,
    indexes: indexes.rows,
    functions: functions.rows,
    triggers: triggers.rows,
    markers: markers.rows,
    data,
  };
}

async function runOwnerInstaller(databaseUrl: URL) {
  return new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/apply-schema.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl.href },
        stdio: ["ignore", "ignore", "pipe"],
        timeout: 10000,
        killSignal: "SIGKILL",
      },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-16384);
    });
    child.once("error", reject);
    child.once("close", (code, signal) =>
      resolve({
        code,
        signal,
        stderr: adminUrl
          ? stderr
              .replaceAll(databaseUrl.href, "[DATABASE_URL]")
              .replaceAll(adminUrl, "[TEST_ADMIN_DATABASE_URL]")
          : stderr.replaceAll(databaseUrl.href, "[DATABASE_URL]"),
      }),
    );
  });
}

describe("R39 owner namespace production boundaries", () => {
  it("R2 installs only empty owner while public and neighbor remain nonempty and unchanged", async () => {
    await withOwnerNamespaceDatabase(
      async (db, databaseUrl, owner, neighbor) => {
        const before = await externalNamespaceSnapshot(db, neighbor);
        expect(
          (
            await db.query(
              "SELECT count(*)::int AS count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1",
              [owner],
            )
          ).rows[0],
        ).toEqual({ count: 0 });
        databaseUrl.searchParams.set("schema", owner);
        let result: Awaited<ReturnType<typeof runOwnerInstaller>>;
        try {
          result = await runOwnerInstaller(databaseUrl);
        } finally {
          expect(await externalNamespaceSnapshot(db, neighbor)).toEqual(before);
        }
        expect(result.signal).toBeNull();
        expect(result.code, result.stderr).toBe(0);
        expect(
          (
            await db.query(
              "SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname=$1",
              [owner],
            )
          ).rows[0],
        ).toEqual({ count: 22 });
        const repeated = await runOwnerInstaller(databaseUrl);
        expect(repeated.signal).toBeNull();
        expect(repeated.code).not.toBe(0);
        expect(repeated.stderr).toMatch(
          /(?:nonempty|non-empty|not empty|requires.*(?:blank|empty))/iu,
        );
        expect(await externalNamespaceSnapshot(db, neighbor)).toEqual(before);
      },
    );
  }, 30000);

  it("R3 routes real DatabaseService reads and writes to owner with UTC and no neighbor access", async () => {
    await withOwnerNamespaceDatabase(
      async (db, databaseUrl, owner, neighbor) => {
        await db.query(`SET search_path TO "${owner}",pg_catalog`);
        await db.query(readFileSync("database/schema.sql", "utf8"));
        await db.query(
          `CREATE TABLE "${owner}".system_r39_marker (value text NOT NULL); INSERT INTO "${owner}".system_r39_marker VALUES ('owner-sentinel')`,
        );
        await db.query("SET search_path TO public,pg_catalog");
        const before = await externalNamespaceSnapshot(db, neighbor);
        databaseUrl.searchParams.set("schema", owner);
        const runtime = new DatabaseService(
          new SystemConfig({ ...env, DATABASE_URL: databaseUrl.href }),
        );
        try {
          expect(await runtime.ready()).toBe(true);
          const selected = await runtime.read((tx) =>
            tx.query(
              "SELECT current_schema() AS schema,current_setting('TimeZone') AS timezone,value FROM system_r39_marker",
            ),
          );
          expect(selected.rows).toEqual([
            { schema: owner, timezone: "UTC", value: "owner-sentinel" },
          ]);
          await runtime.transaction((tx) =>
            tx.query("UPDATE system_r39_marker SET value='owner-updated'"),
          );
          expect(
            (await db.query(`SELECT value FROM "${owner}".system_r39_marker`))
              .rows,
          ).toEqual([{ value: "owner-updated" }]);
        } finally {
          try {
            await runtime.onApplicationShutdown();
          } finally {
            expect(await externalNamespaceSnapshot(db, neighbor)).toEqual(
              before,
            );
          }
        }
      },
    );
  }, 30000);

  it("R3 missing namespace is not ready and runtime never creates it or falls back", async () => {
    await withOwnerNamespaceDatabase(
      async (db, databaseUrl, _owner, neighbor) => {
        const missing = "system_r39_missing";
        const before = await externalNamespaceSnapshot(db, neighbor);
        const exists = async () =>
          (
            await db.query<{ present: boolean }>(
              "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname=$1) AS present",
              [missing],
            )
          ).rows[0];
        expect(await exists()).toEqual({ present: false });
        databaseUrl.searchParams.set("schema", missing);
        const runtime = new DatabaseService(
          new SystemConfig({ ...env, DATABASE_URL: databaseUrl.href }),
        );
        try {
          expect(await runtime.ready().catch(() => false)).toBe(false);
        } finally {
          try {
            await runtime.onApplicationShutdown();
          } finally {
            expect(await exists()).toEqual({ present: false });
            expect(await externalNamespaceSnapshot(db, neighbor)).toEqual(
              before,
            );
          }
        }
      },
    );
  }, 30000);
});

describe("R40 owner catalog semantic drift", () => {
  it.each([
    ["column type", "ALTER TABLE system_product ALTER COLUMN name TYPE text"],
    [
      "column nullability",
      "ALTER TABLE system_product ALTER COLUMN name DROP NOT NULL",
    ],
    [
      "column default",
      "ALTER TABLE system_product ALTER COLUMN version SET DEFAULT 2",
    ],
    ["index", "DROP INDEX ix_system_product_status"],
    [
      "function body",
      "CREATE OR REPLACE FUNCTION model_revision_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$",
    ],
    [
      "trigger enabled state",
      "ALTER TABLE model_revision DISABLE TRIGGER trg_model_revision_immutable_guard",
    ],
    [
      "trigger event",
      "DROP TRIGGER trg_model_revision_immutable_guard ON model_revision; CREATE TRIGGER trg_model_revision_immutable_guard BEFORE UPDATE ON model_revision FOR EACH ROW EXECUTE FUNCTION model_revision_immutable_guard()",
    ],
  ])(
    "detects %s drift even with the same 22 owner tables",
    async (_name, mutation) => {
      await withOwnerNamespaceDatabase(
        async (db, _databaseUrl, owner, neighbor) => {
          const before = await externalNamespaceSnapshot(db, neighbor);
          const reference = "system_r40_reference";
          for (const namespace of [owner, reference]) {
            if (namespace === reference)
              await db.query(`CREATE SCHEMA "${reference}"`);
            await db.query(`SET search_path TO "${namespace}",pg_catalog`);
            await db.query(readFileSync("database/schema.sql", "utf8"));
          }
          const expected = await snapshotSystemSchemaCatalog(db, reference);
          expect(await snapshotSystemSchemaCatalog(db, owner)).toEqual(
            expected,
          );
          try {
            await db.query(`SET search_path TO "${owner}",pg_catalog`);
            await db.query(mutation);
            expect(
              (
                await db.query(
                  "SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname=$1",
                  [owner],
                )
              ).rows[0],
            ).toEqual({ count: 22 });
            expect(await snapshotSystemSchemaCatalog(db, owner)).not.toEqual(
              expected,
            );
          } finally {
            await db.query("SET search_path TO public,pg_catalog");
            expect(await externalNamespaceSnapshot(db, neighbor)).toEqual(
              before,
            );
          }
        },
      );
    },
    30000,
  );

  it.each([
    ["view", "CREATE VIEW owner_existing AS SELECT 1 AS value"],
    [
      "function",
      "CREATE FUNCTION owner_existing() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$",
    ],
    ["type", "CREATE TYPE owner_existing AS ENUM ('existing')"],
  ])(
    "installer rejects owner containing only a %s without changing neighbors",
    async (_name, ddl) => {
      await withOwnerNamespaceDatabase(
        async (db, databaseUrl, owner, neighbor) => {
          await db.query(`SET search_path TO "${owner}",pg_catalog`);
          await db.query(ddl);
          await db.query("SET search_path TO public,pg_catalog");
          const before = await externalNamespaceSnapshot(db, neighbor, false);
          databaseUrl.searchParams.set("schema", owner);
          try {
            const result = await runOwnerInstaller(databaseUrl);
            expect(result.signal).toBeNull();
            expect(result.code).not.toBe(0);
            expect(result.stderr).toContain("requires an empty owner schema");
            expect(
              (
                await db.query(
                  "SELECT count(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname=$1",
                  [owner],
                )
              ).rows[0],
            ).toEqual({ count: 0 });
          } finally {
            expect(
              await externalNamespaceSnapshot(db, neighbor, false),
            ).toEqual(before);
          }
        },
        false,
      );
    },
    30000,
  );
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
    const lock = new Client(parseSystemDatabaseUrl(url.href));
    await lock.connect();
    await lock.query("SET search_path TO system_fixture,pg_catalog");
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
        DATABASE_URL: `postgresql://nako@127.0.0.1:${address.port}/fixture?schema=system_fixture`,
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
