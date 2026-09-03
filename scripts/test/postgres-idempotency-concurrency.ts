import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { SystemControlService } from "../../src/application/system/services/system-control.service.js";
import { PostgresPool } from "../../src/infrastructure/persistence/postgres/client.js";
import { PostgresSystemControlRepository } from "../../src/infrastructure/repositories/system/system-control-repository.js";
import type { TenantRequestContext } from "../../src/domain/runtime-manifest/models/index.js";
import { decodeInteger } from "../../src/infrastructure/persistence/postgres/value-decoders.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL or DATABASE_URL is required");

const tenantId = `receipt-concurrency-${randomUUID()}`;
const key = `site-${randomUUID()}`;
const hostname = `${randomUUID()}.example.test`;
const context: TenantRequestContext = {
  tenantId,
  actorId: null,
  organizationId: null,
  surfaceId: null,
  permissions: ["system:read", "system:write"],
  correlationId: randomUUID(),
};

const pool = new PostgresPool(databaseUrl);
const service = new SystemControlService(
  new PostgresSystemControlRepository(pool),
);
const inspection = new Client({ connectionString: databaseUrl });
let inspectionConnected = false;

try {
  await inspection.connect();
  inspectionConnected = true;
  const input = {
    siteKey: `site-${randomUUID()}`,
    hostname,
    displayName: "Concurrent Site",
  };
  const [first, second] = await Promise.all([
    service.createSite(context, input, key),
    service.createSite(context, input, key),
  ]);
  if (first.id !== second.id)
    throw new Error("concurrent idempotent commands returned different sites");

  const counts = await inspection.query<Record<string, unknown>>(
    `SELECT
       (SELECT count(*) FROM system_site WHERE tenant_id = $1) AS site_count,
       (SELECT count(*) FROM system_site_host WHERE tenant_id = $1) AS host_count,
       (SELECT count(*) FROM system_command_receipt WHERE tenant_id = $1) AS receipt_count,
       (SELECT count(*) FROM system_command_receipt WHERE tenant_id = $1 AND status = 'completed' AND response_json IS NOT NULL AND completed_at IS NOT NULL) AS completed_count`,
    [tenantId],
  );
  const row = counts.rows[0];
  if (
    !row ||
    decodeInteger(row.site_count, "site_count") !== 1 ||
    decodeInteger(row.host_count, "host_count") !== 1 ||
    decodeInteger(row.receipt_count, "receipt_count") !== 1 ||
    decodeInteger(row.completed_count, "completed_count") !== 1
  )
    throw new Error("idempotent claim, mutation, and completion were not atomic");

  let digestMismatch = false;
  try {
    await service.createSite(
      context,
      {
        ...input,
        siteKey: `${input.siteKey}-different`,
        hostname: `different-${hostname}`,
      },
      key,
    );
  } catch (error) {
    digestMismatch =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "IDEMPOTENCY_KEY_REUSED";
  }
  if (!digestMismatch)
    throw new Error("idempotency digest mismatch was not rejected");

  process.stdout.write(
    `${JSON.stringify({ status: "PASS", concurrent_calls: 2, mutations: 1, receipts: 1 })}\n`,
  );
} finally {
  if (inspectionConnected) {
    await inspection.query("DELETE FROM system_command_receipt WHERE tenant_id = $1", [
      tenantId,
    ]);
    await inspection.query("DELETE FROM system_site_host WHERE tenant_id = $1", [
      tenantId,
    ]);
    await inspection.query("DELETE FROM system_site WHERE tenant_id = $1", [
      tenantId,
    ]);
    await inspection.end();
  }
  await pool.close();
}
