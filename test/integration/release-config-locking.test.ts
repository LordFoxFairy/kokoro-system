import { randomUUID } from "node:crypto";
import type { QueryResultRow } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TenantRequestContext } from "../../src/domain/runtime-manifest/models/index.js";
import { SystemControlService } from "../../src/application/system/services/system-control.service.js";
import type {
  SqlClient,
  SqlPool,
  SqlResult,
} from "../../src/infrastructure/persistence/postgres/client.js";
import { PostgresSystemControlRepository } from "../../src/infrastructure/repositories/system/system-control-repository.js";
import {
  createRealSystemFixture,
  type RealSystemFixture,
} from "./real-system-fixture.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;
const real = databaseUrl !== undefined && redisUrl !== undefined;
const describeReal = real ? describe : describe.skip;

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
}>;

function deferred<T>(): Deferred<T> {
  let resolver: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (resolver === undefined) throw new Error("deferred is not initialized");
      resolver(value);
    },
  };
}

class ObservedClient implements SqlClient {
  public constructor(
    private readonly delegate: SqlClient,
    private readonly afterQuery: (sql: string) => Promise<void>,
  ) {}

  public async query<Row extends QueryResultRow>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<SqlResult<Row>> {
    const result = await this.delegate.query<Row>(sql, values);
    await this.afterQuery(sql);
    return result;
  }

  public release(): void {
    this.delegate.release();
  }
}

type ObservedPool = Readonly<{
  pool: SqlPool;
  connected: Promise<number>;
  queryCompleted: Promise<void>;
  resume(): void;
}>;

function observePool(
  delegate: SqlPool,
  barrierQuery: (sql: string) => boolean = () => false,
): ObservedPool {
  const connected = deferred<number>();
  const queryCompleted = deferred<void>();
  const resume = deferred<void>();
  let barrierUsed = false;
  return {
    connected: connected.promise,
    queryCompleted: queryCompleted.promise,
    resume: () => resume.resolve(undefined),
    pool: {
      connect: async () => {
        const client = await delegate.connect();
        const pid = await client.query<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        );
        const backendPid = pid.rows[0]?.pid;
        if (backendPid === undefined)
          throw new Error("PostgreSQL backend pid is unavailable");
        connected.resolve(backendPid);
        return new ObservedClient(client, async (sql) => {
          if (!barrierUsed && barrierQuery(sql)) {
            barrierUsed = true;
            queryCompleted.resolve(undefined);
            await resume.promise;
          }
        });
      },
      ping: () => delegate.ping(),
      close: async () => undefined,
    },
  };
}

function context(tenantId: string): TenantRequestContext {
  return {
    tenantId,
    actorId: randomUUID(),
    organizationId: null,
    surfaceId: null,
    permissions: ["system:write", "system:publish"],
    correlationId: randomUUID(),
  };
}

async function insertRelease(
  fixture: RealSystemFixture,
  tenantId: string,
  status: "validated" | "published",
): Promise<string> {
  const releaseId = randomUUID();
  const now = new Date();
  await fixture.query(
    "INSERT INTO system_config_release (id, tenant_id, release_key, status, digest, published_at, version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8)",
    [
      releaseId,
      tenantId,
      `release-${randomUUID()}`,
      status,
      "a".repeat(64),
      status === "published" ? now : null,
      now,
      now,
    ],
  );
  return releaseId;
}

function configInput(tenantId: string, releaseId: string, configKey: string) {
  return {
    moduleKey: "theme",
    configKey,
    scopeType: "tenant" as const,
    scopeId: tenantId,
    productId: null,
    locale: "en-US",
    value: { mode: "dark" },
    schemaVersion: 1,
    releaseId,
  };
}

async function waitForRowLock(
  fixture: RealSystemFixture,
  waitingPid: number,
  blockingPid: number,
): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const rows = await fixture.query<{ blocking_pids: number[] }>(
      "SELECT pg_blocking_pids($1) AS blocking_pids",
      [waitingPid],
    );
    if (rows[0]?.blocking_pids.includes(blockingPid)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("expected PostgreSQL row-lock wait was not observed");
}

describeReal("real PostgreSQL release/config row locking", () => {
  let fixture: RealSystemFixture;

  beforeAll(async () => {
    if (databaseUrl === undefined || redisUrl === undefined)
      throw new Error("real integration URLs are required");
    fixture = await createRealSystemFixture(databaseUrl, redisUrl);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it.each([
    ["publish", "validated", "published"],
    ["retire", "published", "retired"],
  ] as const)(
    "makes a config write wait for %s and reject the committed immutable state",
    async (operation, initialStatus, finalStatus) => {
      const tenantId = `tenant:transition-first:${operation}:${randomUUID()}`;
      const releaseId = await insertRelease(fixture, tenantId, initialStatus);
      const transitionPool = observePool(
        fixture.pool,
        (sql) =>
          sql.includes("FROM system_config_release") &&
          sql.includes("FOR UPDATE"),
      );
      const transitionControl = new SystemControlService(
        new PostgresSystemControlRepository(transitionPool.pool),
        fixture.cache(`transition-first-${operation}`),
      );
      const transition =
        operation === "publish"
          ? transitionControl.publishRelease(
              context(tenantId),
              releaseId,
              randomUUID(),
            )
          : transitionControl.retireRelease(
              context(tenantId),
              releaseId,
              randomUUID(),
            );
      await transitionPool.queryCompleted;
      const blockingPid = await transitionPool.connected;

      const configPool = observePool(fixture.pool);
      const configControl = new SystemControlService(
        new PostgresSystemControlRepository(configPool.pool),
        fixture.cache(`config-waiter-${operation}`),
      );
      const configOutcome = configControl
        .upsertConfig(
          context(tenantId),
          configInput(tenantId, releaseId, `blocked-${operation}`),
          randomUUID(),
        )
        .then(
          (value) => ({ kind: "resolved", value }) as const,
          (error: unknown) => ({ kind: "rejected", error }) as const,
        );
      try {
        await waitForRowLock(
          fixture,
          await configPool.connected,
          blockingPid,
        );
      } finally {
        transitionPool.resume();
      }
      await expect(transition).resolves.toMatchObject({ status: finalStatus });
      await expect(configOutcome).resolves.toMatchObject({
        kind: "rejected",
        error: {
          code: "INVALID_STATE",
          message: "release is not writable",
        },
      });
      const rows = await fixture.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM system_config_record WHERE tenant_id = $1 AND release_id = $2",
        [tenantId, releaseId],
      );
      expect(rows[0]?.count).toBe("0");
    },
  );

  it("serializes config first, then publishes on a second PostgreSQL connection", async () => {
    const tenantId = `tenant:config-first:${randomUUID()}`;
    const releaseId = await insertRelease(fixture, tenantId, "validated");
    const configPool = observePool(
      fixture.pool,
      (sql) =>
        sql.includes("SELECT status FROM system_config_release") &&
        sql.includes("FOR UPDATE"),
    );
    const configControl = new SystemControlService(
      new PostgresSystemControlRepository(configPool.pool),
      fixture.cache("config-first-writer"),
    );
    const config = configControl.upsertConfig(
      context(tenantId),
      configInput(tenantId, releaseId, "before-publish"),
      randomUUID(),
    );
    await configPool.queryCompleted;
    const blockingPid = await configPool.connected;

    const publishPool = observePool(fixture.pool);
    const publishControl = new SystemControlService(
      new PostgresSystemControlRepository(publishPool.pool),
      fixture.cache("config-first-publisher"),
    );
    const publish = publishControl.publishRelease(
      context(tenantId),
      releaseId,
      randomUUID(),
    );
    try {
      await waitForRowLock(
        fixture,
        await publishPool.connected,
        blockingPid,
      );
    } finally {
      configPool.resume();
    }
    await expect(config).resolves.toMatchObject({
      releaseId,
      configVersion: "1",
    });
    await expect(publish).resolves.toMatchObject({ status: "published" });
    await expect(
      configControl.upsertConfig(
        context(tenantId),
        configInput(tenantId, releaseId, "after-publish"),
        randomUUID(),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_STATE",
      message: "release is not writable",
    });
  });
});
