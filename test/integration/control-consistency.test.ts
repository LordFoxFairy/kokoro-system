import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SystemControlService } from "../../src/application/system/services/system-control.service.js";
import type { TenantRequestContext } from "../../src/domain/runtime-manifest/models/index.js";
import { PostgresSystemControlRepository } from "../../src/infrastructure/repositories/system/system-control-repository.js";
import { createHttpServer } from "../../src/interfaces/http/server.js";
import {
  createRealSystemFixture,
  type RealSystemFixture,
} from "./real-system-fixture.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;
const real = databaseUrl !== undefined && redisUrl !== undefined;
const describeReal = real ? describe : describe.skip;

function context(
  tenantId: string,
  permissions: readonly string[] = [
    "system:read",
    "system:write",
    "system:publish",
  ],
): TenantRequestContext {
  return {
    tenantId,
    actorId: randomUUID(),
    organizationId: null,
    surfaceId: null,
    permissions,
    correlationId: randomUUID(),
  };
}

async function insertRelease(
  fixture: RealSystemFixture,
  tenantId: string,
  status: "draft" | "validated" | "published" | "retired",
  version = "1",
): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await fixture.query(
    "INSERT INTO system_config_release (id, tenant_id, release_key, status, digest, published_at, version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [
      id,
      tenantId,
      `release-${randomUUID()}`,
      status,
      "a".repeat(64),
      status === "published" || status === "retired" ? now : null,
      version,
      now,
      now,
    ],
  );
  return id;
}

describeReal("real PostgreSQL control-plane consistency", () => {
  let fixture: RealSystemFixture;
  let control: SystemControlService;

  beforeAll(async () => {
    if (databaseUrl === undefined || redisUrl === undefined)
      throw new Error("real integration URLs are required");
    fixture = await createRealSystemFixture(databaseUrl, redisUrl);
    control = new SystemControlService(
      new PostgresSystemControlRepository(fixture.pool),
      fixture.cache("control"),
    );
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("accepts draft/validated config releases and rejects immutable or foreign releases", async () => {
    const tenantId = `tenant:config:${randomUUID()}`;
    const draft = await insertRelease(fixture, tenantId, "draft");
    const validated = await insertRelease(fixture, tenantId, "validated");
    const published = await insertRelease(fixture, tenantId, "published");
    const retired = await insertRelease(fixture, tenantId, "retired");
    const foreign = await insertRelease(
      fixture,
      `tenant:foreign:${randomUUID()}`,
      "draft",
    );
    const writeContext = context(tenantId, ["system:write"]);
    const input = (releaseId: string, configKey: string) => ({
      moduleKey: "theme",
      configKey,
      scopeType: "tenant" as const,
      scopeId: tenantId,
      productId: null,
      locale: "en-US",
      value: { mode: "dark" },
      schemaVersion: 1,
      releaseId,
    });

    await expect(
      control.upsertConfig(
        writeContext,
        input(draft, "draft"),
        randomUUID(),
      ),
    ).resolves.toMatchObject({ releaseId: draft, configVersion: "1" });
    await expect(
      control.upsertConfig(
        writeContext,
        input(validated, "validated"),
        randomUUID(),
      ),
    ).resolves.toMatchObject({ releaseId: validated, configVersion: "1" });
    for (const releaseId of [published, retired])
      await expect(
        control.upsertConfig(
          writeContext,
          input(releaseId, `immutable-${releaseId}`),
          randomUUID(),
        ),
      ).rejects.toMatchObject({
        code: "INVALID_STATE",
        status: 400,
        message: "release is not writable",
      });
    await expect(
      control.upsertConfig(
        writeContext,
        input(foreign, "foreign"),
        randomUUID(),
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      message: "release not found",
    });
    const rejected = await fixture.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM system_config_record WHERE release_id = ANY($1::uuid[])",
      [[published, retired, foreign]],
    );
    expect(rejected[0]?.count).toBe("0");
  });

  it("preserves and orders BIGINT versions beyond Number.MAX_SAFE_INTEGER", async () => {
    const tenantId = `tenant:bigint:${randomUUID()}`;
    const releaseId = await insertRelease(
      fixture,
      tenantId,
      "draft",
      "9007199254740993",
    );
    await expect(
      control.validateRelease(context(tenantId), releaseId, randomUUID()),
    ).resolves.toMatchObject({ version: "9007199254740994" });

    const siteId = randomUUID();
    const now = new Date();
    await fixture.query(
      "INSERT INTO system_site (id, tenant_id, site_key, display_name, status, version, created_at, updated_at) VALUES ($1, $2, 'bigint', 'Bigint', 'active', $3, $4, $5)",
      [siteId, tenantId, "9007199254740993", now, now],
    );
    await expect(
      control.listSites(context(tenantId, ["system:read"]), {}),
    ).resolves.toMatchObject({
      items: [{ id: siteId, version: "9007199254740993" }],
    });
    const server = createHttpServer(
      {
        get: async () => {
          throw new Error("runtime manifest is not used by this test");
        },
      },
      async () => true,
      { control, bffServiceToken: "integration-service-token" },
    );
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (address === null || typeof address === "string")
        throw new Error("integration HTTP server did not bind");
      const response = await fetch(
        `http://127.0.0.1:${address.port}/v1/system/sites`,
        {
          headers: {
            "x-kokoro-tenant-id": tenantId,
            "x-kokoro-service": "web-bff",
            "x-kokoro-internal-secret": "integration-service-token",
            "x-kokoro-iam-permissions": "system:read",
          },
        },
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        data: { items: [{ id: siteId, version: "9007199254740993" }] },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }

    const configId = randomUUID();
    await fixture.query(
      "INSERT INTO system_config_record (id, tenant_id, module_key, scope_type, scope_id, product_id, locale, config_key, schema_version, value_json, status, config_version, release_id, digest, created_at, updated_at) VALUES ($1, $2, 'theme', 'tenant', $3, NULL, 'en-US', 'bigint', 1, $4, 'active', $5, NULL, $6, $7, $8)",
      [
        configId,
        tenantId,
        tenantId,
        JSON.stringify({ revision: 1 }),
        "9007199254740993",
        "b".repeat(64),
        now,
        now,
      ],
    );
    await expect(
      control.upsertConfig(
        context(tenantId, ["system:write"]),
        {
          moduleKey: "theme",
          configKey: "bigint",
          scopeType: "tenant",
          scopeId: tenantId,
          productId: null,
          locale: "en-US",
          value: { revision: 2 },
          schemaVersion: 1,
          releaseId: null,
        },
        randomUUID(),
      ),
    ).resolves.toMatchObject({
      id: configId,
      configVersion: "9007199254740994",
    });
  });
});
