import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { CommandReceipt } from "../../src/database/command-receipt.js";
import type { RequestContext } from "../../src/access/request-context.js";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../../src/app.module.js";
import { configureHttp } from "../../src/http/configure-http.js";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!adminUrl)
  throw new Error(
    "TEST_ADMIN_DATABASE_URL required for real System target integration",
  );
const databaseName = `system_g2_${randomUUID().replaceAll("-", "")}`;
const admin = new Client({ connectionString: adminUrl });
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
let app: NestExpressApplication;
let base: string;
const token = "system-test-bff-credential";
const actor = "actor-opaque";
function headers(tenant = "tenant-a", extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-kokoro-service": "web-bff",
    authorization: `Bearer ${token}`,
    "x-kokoro-tenant-id": tenant,
    "x-kokoro-actor-id": actor,
    "x-kokoro-iam-permissions": "system:read,system:write,system:publish",
    "x-request-id": "integration:opaque-request",
    "idempotency-key": randomUUID(),
    ...extra,
  };
}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
  tenant = "tenant-a",
) {
  const response = await fetch(`${base}/v1/system/${path}`, {
    method,
    headers: headers(tenant, extra),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await response.json()) as {
    data?: Record<string, unknown>;
    error?: { code: string; retryable: boolean };
  };
  expect(response.headers.get("x-request-id")).toBe(
    "integration:opaque-request",
  );
  expect(json).not.toHaveProperty("meta");
  return { response, json };
}
beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const schema = new Client({ connectionString: databaseUrl.href });
  await schema.connect();
  try {
    await schema.query("SET search_path TO public,pg_catalog");
    await schema.query(readFileSync("database/schema.sql", "utf8"));
  } finally {
    await schema.end();
  }
  app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot({
      DATABASE_URL: databaseUrl.href,
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/2",
      KOKORO_SYSTEM_REDIS_NAMESPACE: databaseName,
      KOKORO_SYSTEM_BFF_SERVICE_TOKEN: token,
      KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "system-test-agent-credential",
      KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: "system-test-admin-credential",
    }),
    { logger: false },
  );
  configureHttp(app);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
}, 30000);
afterAll(async () => {
  if (app) await app.close();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});
describe("real Nest Sites/Workspace control", () => {
  it("enforces auth, request schema, idempotency, CAS, references and soft deletion", async () => {
    const unauthorized = await request("sites", "GET", undefined, {
      authorization: "Bearer wrong",
    });
    expect(unauthorized.response.status).toBe(403);
    const forbidden = await request("sites", "GET", undefined, {
      "x-kokoro-iam-permissions": "system:publish",
    });
    expect(forbidden.response.status).toBe(403);
    const input = {
      site_key: "main",
      hostname: "main.example.test",
      display_name: "Main",
    };
    const key = randomUUID();
    const created = await request("sites", "POST", input, {
      "idempotency-key": key,
    });
    expect(created.response.status).toBe(201);
    const site = created.json.data!;
    expect(
      (await request("sites", "POST", input, { "idempotency-key": key })).json
        .data,
    ).toEqual(site);
    expect(
      (
        await request(
          "sites",
          "POST",
          { ...input, display_name: "Other" },
          { "idempotency-key": key },
        )
      ).response.status,
    ).toBe(409);
    expect(
      (await request(`sites/${site.id}`, "GET", undefined, {}, "other-tenant"))
        .response.status,
    ).toBe(404);
    expect(
      (await request(`sites/${site.id}`, "PATCH", { display_name: "Changed" }))
        .response.status,
    ).toBe(428);
    const updated = await request(
      `sites/${site.id}`,
      "PATCH",
      { display_name: "Changed" },
      { "if-match": `"${site.version}"` },
    );
    expect(updated.response.status).toBe(200);
    expect(
      (
        await request(
          `sites/${site.id}`,
          "PATCH",
          { display_name: "Race" },
          { "if-match": `"${site.version}"` },
        )
      ).response.status,
    ).toBe(409);
    const workspace = await request("workspaces", "POST", {
      site_id: site.id,
      workspace_key: "default",
      name: "Default",
    });
    expect(workspace.response.status).toBe(201);
    expect(
      (
        await request(`sites/${site.id}`, "DELETE", undefined, {
          "if-match": `"${updated.json.data!.version}"`,
        })
      ).json.error?.code,
    ).toBe("RESOURCE_IN_USE");
    const workspaceId = workspace.json.data!.id;
    expect(
      (
        await request(
          `workspaces/${workspaceId}`,
          "PATCH",
          { name: "Renamed" },
          { "if-match": '"1"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(`workspaces/${workspaceId}`, "DELETE", undefined, {
          "if-match": '"2"',
        })
      ).response.status,
    ).toBe(200);
    expect(
      (await request(`workspaces/${workspaceId}`, "GET")).response.status,
    ).toBe(404);
    expect(
      (
        await request(`workspaces/${workspaceId}/restore`, "POST", undefined, {
          "if-match": '"3"',
        })
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(`workspaces/${workspaceId}`, "DELETE", undefined, {
          "if-match": '"4"',
        })
      ).response.status,
    ).toBe(200);
    const deleted = await request(`sites/${site.id}`, "DELETE", undefined, {
      "if-match": `"${updated.json.data!.version}"`,
    });
    expect(deleted.response.status).toBe(200);
    expect((await request(`sites/${site.id}`, "GET")).response.status).toBe(
      404,
    );
    expect(
      (
        await request(`sites/${site.id}/restore`, "POST", undefined, {
          "if-match": `"${deleted.json.data!.version}"`,
        })
      ).response.status,
    ).toBe(200);
  });

  it("serializes duplicate commands, separates tenant scopes and rolls back rejected policy", async () => {
    const key = randomUUID();
    const input = {
      site_key: "concurrent",
      hostname: "concurrent.example.test",
      display_name: "Concurrent",
    };
    const results = await Promise.all([
      request("sites", "POST", input, { "idempotency-key": key }),
      request("sites", "POST", input, { "idempotency-key": key }),
    ]);
    expect(results.map((result) => result.response.status)).toEqual([201, 201]);
    expect(results[0]!.json.data).toEqual(results[1]!.json.data);
    expect(
      (
        await request("sites", "POST", input, {
          "idempotency-key": key,
          "x-kokoro-actor-id": "different",
        })
      ).response.status,
    ).toBe(409);
    expect(
      (
        await request(
          "sites",
          "POST",
          { ...input, hostname: "other-tenant.example.test" },
          { "idempotency-key": key },
          "tenant-b",
        )
      ).response.status,
    ).toBe(201);
    const siteId = results[0]!.json.data!.id;
    const failedKey = randomUUID();
    const denied = await request(
      `sites/${siteId}/policy`,
      "PUT",
      {
        default_locale: "en",
        allowed_locales: ["en"],
        allowed_products: ["missing-product"],
        public_manifest: false,
      },
      { "idempotency-key": failedKey, "if-none-match": "*" },
    );
    expect(denied.json.error?.code).toBe("POLICY_INVALID");
    const db = new Client({ connectionString: databaseUrl.href });
    await db.connect();
    try {
      const receipt = await db.query(
        "SELECT COUNT(*)::int AS count FROM public.system_command_receipt WHERE idempotency_key=$1",
        [failedKey],
      );
      expect(receipt.rows[0].count).toBe(0);
      const policy = await db.query(
        "SELECT COUNT(*)::int AS count FROM public.system_site_policy WHERE site_id=$1",
        [siteId],
      );
      expect(policy.rows[0].count).toBe(0);
    } finally {
      await db.end();
    }
  });
  it("preserves global and tenant receipt separation without a magic tenant value", async () => {
    const receipts = app.get(CommandReceipt);
    const key = randomUUID();
    const context: RequestContext = {
      tenantId: null,
      actorId: "admin",
      service: "system-admin",
      permissions: ["system:write"],
      scope: "global",
      requestId: "receipt:test",
      operation: "receipt-isolation-test",
      path: "/test",
      idempotencyKey: key,
      precondition: null,
    };
    const schema = z.strictObject({ owner: z.string() });
    expect(
      await receipts.run(context, {}, schema, async () => ({
        owner: "global",
      })),
    ).toEqual({ owner: "global" });
    expect(
      await receipts.run(
        { ...context, tenantId: "global", scope: "tenant" },
        {},
        schema,
        async () => ({ owner: "tenant" }),
      ),
    ).toEqual({ owner: "tenant" });
    expect(
      await receipts.run(context, {}, schema, async () => {
        throw new Error("replay executed");
      }),
    ).toEqual({ owner: "global" });
  });
  it("rejects malformed payloads, privilege forgery and cross-resource cursors", async () => {
    expect(
      (
        await request("sites", "POST", {
          site_key: "bad",
          hostname: "bad.test",
          display_name: "Bad",
          tenant_id: "forged",
        })
      ).response.status,
    ).toBe(400);
    expect((await request("sites/not-a-uuid")).response.status).toBe(400);
    expect(
      (
        await request(
          "sites/00000000-0000-4000-8000-000000000001?unexpected=true",
        )
      ).response.status,
    ).toBe(400);
    const malformed = await fetch(`${base}/v1/system/sites`, {
      method: "POST",
      headers: headers(),
      body: "{",
    });
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get("x-request-id")).toBe(
      "integration:opaque-request",
    );
    const tooLarge = await fetch(`${base}/v1/system/sites`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ payload: "x".repeat(1_000_001) }),
    });
    expect(tooLarge.status).toBe(400);
    expect((await request("sites?limit=101")).response.status).toBe(400);
    expect((await request("sites?limit=1&limit=2")).response.status).toBe(400);
    expect(
      (
        await request("sites", "GET", undefined, {
          "x-kokoro-service": "kokoro-agent",
          authorization: "Bearer system-test-agent-credential",
        })
      ).response.status,
    ).toBe(403);
    const page = await request("sites?limit=1");
    const cursor = page.json.data!.next_cursor;
    expect(typeof cursor).toBe("string");
    expect(
      (await request(`workspaces?cursor=${cursor}`)).json.error?.code,
    ).toBe("INVALID_CURSOR");
    expect(
      (
        await request(
          `sites?cursor=${cursor}`,
          "GET",
          undefined,
          {},
          "other-tenant",
        )
      ).json.error?.code,
    ).toBe("INVALID_CURSOR");
  });
  it("uses the same parent row lock for child create and parent delete in both orderings", async () => {
    for (const parentDeletesFirst of [true, false]) {
      const suffix = randomUUID();
      const created = await request("sites", "POST", {
        site_key: suffix,
        hostname: `${suffix}.test`,
        display_name: "Race",
      });
      const site = created.json.data!;
      const first = new Client({ connectionString: databaseUrl.href });
      await first.connect();
      await first.query("BEGIN");
      await first.query(
        "SELECT id FROM public.system_site WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        ["tenant-a", site.id],
      );
      let responseDone = false;
      const waiting = (
        parentDeletesFirst
          ? request("workspaces", "POST", {
              site_id: site.id,
              workspace_key: "race",
              name: "Race",
            })
          : request(`sites/${site.id}`, "DELETE", undefined, {
              "if-match": '"1"',
            })
      ).then((result) => {
        responseDone = true;
        return result;
      });
      let blocked = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        const result = await admin.query(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND cardinality(pg_blocking_pids(pid))>0) AS blocked",
          [databaseName],
        );
        if (result.rows[0].blocked) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      expect(responseDone).toBe(false);
      if (parentDeletesFirst)
        await first.query(
          "UPDATE public.system_site SET deleted_at=CURRENT_TIMESTAMP(3),status='archived',version=version+1 WHERE id=$1",
          [site.id],
        );
      else
        await first.query(
          "INSERT INTO public.system_workspace (id,tenant_id,site_id,workspace_key,name,status) VALUES ($1,'tenant-a',$2,'race','Race','active')",
          [randomUUID(), site.id],
        );
      await first.query("COMMIT");
      await first.end();
      const result = await waiting;
      expect(result.response.status).toBe(parentDeletesFirst ? 404 : 409);
      if (!parentDeletesFirst)
        expect(result.json.error?.code).toBe("RESOURCE_IN_USE");
    }
  });
  it("keeps exact database BIGINT versions and denies missing permission snapshots", async () => {
    const created = await request("sites", "POST", {
      site_key: "bigint",
      hostname: "bigint.test",
      display_name: "Bigint",
    });
    const id = created.json.data!.id;
    const db = new Client({ connectionString: databaseUrl.href });
    await db.connect();
    try {
      await db.query("UPDATE public.system_site SET version=$1 WHERE id=$2", [
        "9007199254740993123",
        id,
      ]);
    } finally {
      await db.end();
    }
    expect((await request(`sites/${id}`)).json.data!.version).toBe(
      "9007199254740993123",
    );
    const updated = await request(
      `sites/${id}`,
      "PATCH",
      { display_name: "Exact" },
      { "if-match": '"9007199254740993123"' },
    );
    expect(updated.json.data!.version).toBe("9007199254740993124");
    const denied = await fetch(`${base}/v1/system/sites`, {
      headers: {
        "x-kokoro-service": "web-bff",
        authorization: `Bearer ${token}`,
        "x-kokoro-tenant-id": "tenant-a",
      },
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("x-request-id")).toBeTruthy();
  });
  it("supports domains, policy creation/CAS and real readiness", async () => {
    const created = await request("sites", "POST", {
      site_key: "policy",
      hostname: "policy.example.test",
      display_name: "Policy",
    });
    const site = created.json.data!;
    const domain = await request(`sites/${site.id}/domains`, "POST", {
      hostname: "second.example.test",
    });
    expect(domain.response.status).toBe(201);
    expect((await request(`sites/${site.id}/domains`)).response.status).toBe(
      200,
    );
    expect(
      (
        await request(
          `sites/${site.id}/domains/${domain.json.data!.id}`,
          "DELETE",
          undefined,
          { "if-match": '"1"' },
        )
      ).response.status,
    ).toBe(200);
    const policy = {
      default_locale: "en",
      allowed_locales: ["en"],
      allowed_products: [],
      public_manifest: true,
    };
    expect(
      (
        await request(`sites/${site.id}/policy`, "PUT", policy, {
          "if-none-match": "*",
        })
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(`sites/${site.id}/policy`, "PUT", policy, {
          "if-none-match": "*",
        })
      ).response.status,
    ).toBe(409);
    expect(
      (
        await request(
          `sites/${site.id}/policy`,
          "PUT",
          { ...policy, public_manifest: false },
          { "if-match": '"1"' },
        )
      ).response.status,
    ).toBe(200);
    const ready = await fetch(`${base}/readyz`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({
      data: { service: "kokoro-system", status: "ready" },
    });
  });
});
