import { CacheService } from "../../src/cache/cache.service.js";
import { systemOperations } from "../../scripts/system-openapi-operations.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../../src/app.module.js";
import { configureHttp } from "../../src/http/configure-http.js";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!adminUrl)
  throw new Error(
    "TEST_ADMIN_DATABASE_URL required for real System target integration",
  );
const databaseName = `system_g3_${randomUUID().replaceAll("-", "")}`;
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
    headers: Object.fromEntries(
      Object.entries(headers(tenant, extra)).filter(
        ([, value]) => value !== "",
      ),
    ),
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
describe("real Nest Product control", () => {
  it("requires global administrator mutations and retains immutable keys across lifecycle", async () => {
    const input = { product_key: "assistant", name: "Assistant" };
    expect((await request("products", "POST", input)).response.status).toBe(
      403,
    );
    const adminHeaders = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const created = await request("products", "POST", input, adminHeaders);
    expect(created.response.status).toBe(201);
    const id = String(created.json.data?.id);
    expect((await request(`products/${id}`)).response.status).toBe(200);
    expect(
      (
        await request(
          `products/${id}`,
          "PATCH",
          { name: "Changed" },
          adminHeaders,
        )
      ).response.status,
    ).toBe(428);
    const changed = await request(
      `products/${id}`,
      "PATCH",
      { name: "Changed" },
      { ...adminHeaders, "if-match": '"1"' },
    );
    expect(changed.json.data?.version).toBe("2");
    expect(
      (
        await request(`products/${id}`, "DELETE", undefined, {
          ...adminHeaders,
          "if-match": '"1"',
        })
      ).response.status,
    ).toBe(409);
    const removed = await request(`products/${id}`, "DELETE", undefined, {
      ...adminHeaders,
      "if-match": '"2"',
    });
    expect(removed.response.status).toBe(200);
    expect(removed.json.data?.deleted_at).toEqual(expect.any(String));
    expect((await request(`products/${id}`)).response.status).toBe(404);
    expect(
      (await request("products", "POST", input, adminHeaders)).response.status,
    ).toBe(409);
    const restored = await request(
      `products/${id}/restore`,
      "POST",
      undefined,
      { ...adminHeaders, "if-match": '"3"' },
    );
    expect(restored.json.data?.version).toBe("4");
    expect(restored.json.data?.deleted_at).toBeNull();
  });
  it("locks both application parents and isolates tenant ownership", async () => {
    const adminHeaders = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const product = await request(
      "products",
      "POST",
      { product_key: "app-product", name: "App Product" },
      adminHeaders,
    );
    const site = await request("sites", "POST", {
      site_key: "app-site",
      hostname: "app.example.test",
      display_name: "App Site",
    });
    const input = {
      site_id: site.json.data?.id,
      product_id: product.json.data?.id,
      app_key: "main",
      display_name: "Main",
    };
    expect(
      (await request("applications", "POST", input, {}, "other-tenant"))
        .response.status,
    ).toBe(404);
    const created = await request("applications", "POST", input);
    expect(created.response.status).toBe(201);
    const id = String(created.json.data?.id);
    expect(
      (
        await request(
          `applications/${id}`,
          "GET",
          undefined,
          {},
          "other-tenant",
        )
      ).response.status,
    ).toBe(404);
    expect(
      (
        await request(`products/${input.product_id}`, "DELETE", undefined, {
          ...adminHeaders,
          "if-match": '"1"',
        })
      ).json.error?.code,
    ).toBe("RESOURCE_IN_USE");
    const updated = await request(
      `applications/${id}`,
      "PATCH",
      { display_name: "Updated" },
      { "if-match": '"1"' },
    );
    expect(updated.json.data?.version).toBe("2");
    const removed = await request(`applications/${id}`, "DELETE", undefined, {
      "if-match": '"2"',
    });
    expect(removed.response.status).toBe(200);
    expect(
      (
        await request(`applications/${id}/restore`, "POST", undefined, {
          "if-match": '"3"',
        })
      ).json.data?.version,
    ).toBe("4");
  });
  it("keeps global feature identity and result contracts immutable", async () => {
    const adminHeaders = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const product = await request(
      "products",
      "POST",
      { product_key: "feature-product", name: "Features" },
      adminHeaders,
    );
    const input = {
      global_feature_key: "chat.send",
      product_id: product.json.data?.id,
      display_name: "Send",
      result_contract: {
        schema_version: 1,
        outcome_kind: "message",
        media_types: ["text/plain"],
        required_fields: ["text"],
      },
    };
    const created = await request("features", "POST", input, adminHeaders);
    expect(created.response.status).toBe(201);
    const id = String(created.json.data?.id);
    expect(
      (await request(`features/${id}`)).json.data?.result_contract,
    ).toEqual(input.result_contract);
    expect(
      (
        await request(`features/${id}/retire`, "POST", undefined, {
          ...adminHeaders,
          "if-match": '"1"',
        })
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(`features/${id}/retire`, "POST", undefined, {
          ...adminHeaders,
          "if-match": '"2"',
        })
      ).json.error?.code,
    ).toBe("INVALID_STATE");
    expect(
      (await request("features", "POST", input, adminHeaders)).response.status,
    ).toBe(409);
  });
  it("validates exposures against App product and applies presentation CAS", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const product = await request(
      "products",
      "POST",
      { product_key: "present", name: "Present" },
      ah,
    );
    const site = await request("sites", "POST", {
      site_key: "present",
      hostname: "present.example.test",
      display_name: "Present",
    });
    const application = await request("applications", "POST", {
      site_id: site.json.data?.id,
      product_id: product.json.data?.id,
      app_key: "present",
      display_name: "Present",
    });
    const feature = await request(
      "features",
      "POST",
      {
        global_feature_key: "present.send",
        product_id: product.json.data?.id,
        display_name: "Send",
        result_contract: {
          schema_version: 1,
          outcome_kind: "message",
          media_types: [],
          required_fields: [],
        },
      },
      ah,
    );
    const appId = String(application.json.data?.id),
      featureId = String(feature.json.data?.id);
    const path = `applications/${appId}/exposures/${featureId}`;
    expect(
      (
        await request(
          path,
          "PUT",
          { enabled: true, display_order: 0 },
          { "if-none-match": "*" },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(`features/${featureId}/retire`, "POST", undefined, {
          ...ah,
          "if-match": '"1"',
        })
      ).json.error?.code,
    ).toBe("RESOURCE_IN_USE");
    const body = {
      schema_version: 1,
      navigation: [
        {
          key: "send",
          label: "Send",
          href: "/send",
          feature_key: "present.send",
        },
      ],
      theme: { mode: "system", accent_color: "#123456", logo_asset_id: null },
      locale_namespaces: [],
    };
    const pp = `applications/${appId}/presentation?locale=en`;
    expect(
      (await request(pp, "PUT", body, { "if-none-match": "*" })).response
        .status,
    ).toBe(200);
    expect((await request(pp)).json.data?.navigation).toEqual(body.navigation);
    expect(
      (await request(pp, "PUT", body, { "if-none-match": "*" })).response
        .status,
    ).toBe(409);
    expect(
      (await request(path, "DELETE", undefined, { "if-match": '"1"' })).response
        .status,
    ).toBe(200);
  });
  it("keeps conditional Config global/tenant scopes isolated with module-specific CAS validation", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const input = {
      config_key: "theme",
      scope_type: "global",
      scope_id: null,
      product_id: null,
      site_id: null,
      locale: null,
      schema_version: 1,
      release_id: null,
      module_key: "theme",
      value: { mode: "light", accent_color: "#abcdef", logo_asset_id: null },
    };
    expect((await request("config", "POST", input)).response.status).toBe(403);
    const created = await request("config", "POST", input, ah);
    expect(created.response.status).toBe(201);
    const id = String(created.json.data?.id);
    expect((await request(`config/${id}`)).response.status).toBe(404);
    expect(
      (await request(`config/${id}?scope=global`, "GET", undefined, ah))
        .response.status,
    ).toBe(200);
    expect(
      (
        await request(
          `config/${id}?scope=global`,
          "PATCH",
          { value: [] },
          { ...ah, "if-match": '"1"' },
        )
      ).json.error?.code,
    ).toBe("INVALID_CONFIG_SCHEMA");
    const updated = await request(
      `config/${id}?scope=global`,
      "PATCH",
      { value: { ...input.value, mode: "dark" } },
      { ...ah, "if-match": '"1"' },
    );
    expect(updated.json.data?.config_version).toBe("2");
    expect(
      (
        await request(`config/${id}?scope=global`, "DELETE", undefined, {
          ...ah,
          "if-match": '"2"',
        })
      ).response.status,
    ).toBe(200);
    expect((await request("config", "POST", input, ah)).response.status).toBe(
      201,
    );
  });
  it("publishes immutable releases and retires their bindings atomically", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const product = await request(
      "products",
      "POST",
      { product_key: "released", name: "Released" },
      ah,
    );
    const release = await request("releases", "POST", {
      release_key: "first",
      digest: "0".repeat(64),
    });
    expect(release.response.status).toBe(201);
    const rid = String(release.json.data?.id);
    const cfg = await request("config", "POST", {
      config_key: "release-theme",
      scope_type: "product",
      scope_id: product.json.data?.id,
      product_id: product.json.data?.id,
      site_id: null,
      locale: null,
      schema_version: 1,
      release_id: rid,
      module_key: "theme",
      value: { mode: "dark", accent_color: "#112233", logo_asset_id: null },
    });
    expect(cfg.response.status).toBe(201);
    const validated = await request(
      `releases/${rid}/validate`,
      "POST",
      undefined,
      { "if-match": '"2"' },
    );
    expect(validated.response.status).toBe(200);
    expect(validated.json.data?.digest).not.toBe("0".repeat(64));
    const published = await request(
      `releases/${rid}/publish`,
      "POST",
      undefined,
      { "if-match": '"3"' },
    );
    expect(published.response.status).toBe(200);
    expect(
      (
        await request(`config/${cfg.json.data?.id}`, "DELETE", undefined, {
          "if-match": '"1"',
        })
      ).json.error?.code,
    ).toBe("INVALID_STATE");
    const binding = await request("release-bindings", "POST", {
      site_id: null,
      product_id: product.json.data?.id,
      scope_type: "product",
      scope_id: product.json.data?.id,
      release_id: rid,
    });
    expect(binding.response.status).toBe(201);
    expect(
      (
        await request(`releases/${rid}/retire`, "POST", undefined, {
          "if-match": '"4"',
        })
      ).response.status,
    ).toBe(200);
    const bindings = await request("release-bindings");
    expect(bindings.response.status).toBe(200);
    expect(bindings.json.data?.items).toEqual([]);
  });
  it("enforces Site policy and both tenant/global manifest generation fences", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const product = await request(
      "products",
      "POST",
      { product_key: "manifest", name: "Manifest" },
      ah,
    );
    const site = await request("sites", "POST", {
      site_key: "manifest",
      hostname: "manifest.example.test",
      display_name: "Manifest",
    });
    const sid = String(site.json.data?.id),
      pid = String(product.json.data?.id);
    const policy = {
      default_locale: "en",
      allowed_locales: ["en", "zh"],
      allowed_products: ["manifest"],
      public_manifest: true,
    };
    expect(
      (
        await request(`sites/${sid}/policy`, "PUT", policy, {
          "if-none-match": "*",
        })
      ).response.status,
    ).toBe(200);
    const hdr = {
      forwarded: 'host="manifest.example.test"',
      "x-kokoro-iam-permissions": "",
    };
    const path = `runtime-manifest?product_id=${pid}`;
    const first = await request(path, "GET", undefined, hdr);
    expect(first.response.status, JSON.stringify(first.json)).toBe(200);
    expect(first.json.data?.site_id).toBe(sid);
    expect(
      (await request(path, "GET", undefined, hdr, "other-tenant")).response
        .status,
    ).toBe(404);
    const config = await request(
      "config",
      "POST",
      {
        config_key: "manifest-theme",
        scope_type: "global",
        scope_id: null,
        product_id: pid,
        site_id: null,
        locale: null,
        schema_version: 1,
        release_id: null,
        module_key: "theme",
        value: { mode: "dark", accent_color: "#998877", logo_asset_id: null },
      },
      ah,
    );
    expect(config.response.status).toBe(201);
    const second = await request(path, "GET", undefined, hdr);
    expect(second.json.data?.catalog_generation).not.toBe(
      first.json.data?.catalog_generation,
    );
    expect(second.json.data?.theme).toEqual({
      mode: "dark",
      accent_color: "#998877",
      logo_asset_id: null,
    });
    expect(
      (
        await request(
          `sites/${sid}/policy`,
          "PUT",
          { ...policy, public_manifest: false },
          { "if-match": '"1"' },
        )
      ).response.status,
    ).toBe(200);
    expect((await request(path, "GET", undefined, hdr)).response.status).toBe(
      403,
    );
  });
  it("dispatches every G3 method/path through real Nest authentication before schema parsing", async () => {
    const operations = systemOperations.filter((op) =>
      ["products", "runtime-manifests"].includes(op.module),
    );
    expect(operations).toHaveLength(36);
    for (const operation of operations) {
      const path = operation.path
        .replace("/v1/system/", "")
        .replace(/\{[^}]+\}/gu, () => randomUUID());
      const result = await request(
        path,
        operation.method.toUpperCase(),
        undefined,
        { authorization: "Bearer wrong" },
      );
      expect(result.response.status, operation.operationId).toBe(403);
      expect(result.json.error?.code).toBe("service_auth_failed");
    }
  });

  it("serializes global Product deletion with tenant App creation in both lock orderings", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    for (const parentFirst of [true, false]) {
      const suffix = randomUUID();
      const product = await request(
        "products",
        "POST",
        { product_key: suffix, name: "Race" },
        ah,
      );
      const site = await request("sites", "POST", {
        site_key: suffix,
        hostname: `${suffix}.test`,
        display_name: "Race",
      });
      const pid = String(product.json.data?.id),
        sid = String(site.json.data?.id);
      const lock = new Client({ connectionString: databaseUrl.href });
      await lock.connect();
      await lock.query("BEGIN");
      try {
        await lock.query(
          "SELECT id FROM public.system_product WHERE id=$1 FOR UPDATE",
          [pid],
        );
        const waiting = parentFirst
          ? request("applications", "POST", {
              site_id: sid,
              product_id: pid,
              app_key: "race",
              display_name: "Race",
            })
          : request(`products/${pid}`, "DELETE", undefined, {
              ...ah,
              "if-match": '"1"',
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
        if (parentFirst)
          await lock.query(
            "UPDATE public.system_product SET deleted_at=CURRENT_TIMESTAMP(3),status='archived',version=version+1 WHERE id=$1",
            [pid],
          );
        else
          await lock.query(
            "INSERT INTO public.system_application(id,tenant_id,site_id,product_id,app_key,display_name) VALUES($1,'tenant-a',$2,$3,'race','Race')",
            [randomUUID(), sid, pid],
          );
        await lock.query("COMMIT");
        const result = await waiting;
        expect(result.response.status).toBe(parentFirst ? 404 : 409);
      } finally {
        await lock.query("ROLLBACK");
        await lock.end();
      }
    }
  });

  it("gives bound published configuration precedence regardless of UUID ordering", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    for (const publishedFirst of [true, false]) {
      const suffix = randomUUID(),
        product = await request(
          "products",
          "POST",
          { product_key: suffix, name: "Priority" },
          ah,
        ),
        pid = String(product.json.data?.id);
      const site = await request("sites", "POST", {
          site_key: suffix,
          hostname: `${suffix}.test`,
          display_name: "Priority",
        }),
        sid = String(site.json.data?.id);
      await request(
        `sites/${sid}/policy`,
        "PUT",
        {
          default_locale: "en",
          allowed_locales: ["en"],
          allowed_products: [suffix],
          public_manifest: true,
        },
        { "if-none-match": "*" },
      );
      const release = await request("releases", "POST", {
          release_key: suffix,
          digest: "0".repeat(64),
        }),
        rid = String(release.json.data?.id);
      const input = {
        config_key: "same",
        scope_type: "product",
        scope_id: pid,
        product_id: pid,
        site_id: null,
        locale: null,
        schema_version: 1,
        release_id: rid,
        module_key: "theme",
        value: { mode: "dark", accent_color: "#101010", logo_asset_id: null },
      };
      const published = await request("config", "POST", input),
        ordinary = await request("config", "POST", {
          ...input,
          release_id: null,
          value: { ...input.value, mode: "light" },
        });
      const db = new Client({ connectionString: databaseUrl.href });
      await db.connect();
      try {
        await db.query(
          "UPDATE public.system_config_record SET id=$1 WHERE id=$2",
          [
            publishedFirst
              ? "00000000-0000-4000-8000-000000000001"
              : "ffffffff-ffff-4fff-8fff-ffffffffffff",
            published.json.data?.id,
          ],
        );
        await db.query(
          "UPDATE public.system_config_record SET id=$1 WHERE id=$2",
          [
            publishedFirst
              ? "ffffffff-ffff-4fff-8fff-fffffffffffe"
              : "00000000-0000-4000-8000-000000000002",
            ordinary.json.data?.id,
          ],
        );
      } finally {
        await db.end();
      }
      expect(
        (
          await request(`releases/${rid}/validate`, "POST", undefined, {
            "if-match": '"2"',
          })
        ).response.status,
      ).toBe(200);
      expect(
        (
          await request(`releases/${rid}/publish`, "POST", undefined, {
            "if-match": '"3"',
          })
        ).response.status,
      ).toBe(200);
      await request("release-bindings", "POST", {
        site_id: null,
        product_id: pid,
        scope_type: "product",
        scope_id: pid,
        release_id: rid,
      });
      const manifest = await request(
        `runtime-manifest?product_id=${pid}`,
        "GET",
        undefined,
        { forwarded: `host="${suffix}.test"` },
      );
      expect(manifest.response.status).toBe(200);
      expect(manifest.json.data?.theme).toEqual(input.value);
    }
  });

  it("cleans surface Config, Binding and Exposure while Site is suspended", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const product = await request(
        "products",
        "POST",
        { product_key: "cleanup", name: "Cleanup" },
        ah,
      ),
      pid = String(product.json.data?.id);
    const site = await request("sites", "POST", {
        site_key: "cleanup",
        hostname: "cleanup.test",
        display_name: "Cleanup",
      }),
      sid = String(site.json.data?.id);
    const application = await request("applications", "POST", {
        site_id: sid,
        product_id: pid,
        app_key: "cleanup",
        display_name: "Cleanup",
      }),
      aid = String(application.json.data?.id);
    const feature = await request(
        "features",
        "POST",
        {
          global_feature_key: "cleanup",
          product_id: pid,
          display_name: "Cleanup",
          result_contract: {
            schema_version: 1,
            outcome_kind: "message",
            media_types: [],
            required_fields: [],
          },
        },
        ah,
      ),
      fid = String(feature.json.data?.id);
    await request(
      `applications/${aid}/exposures/${fid}`,
      "PUT",
      { enabled: true, display_order: 0 },
      { "if-none-match": "*" },
    );
    const input = {
      config_key: "cleanup",
      scope_type: "surface",
      scope_id: "main",
      product_id: pid,
      site_id: sid,
      locale: null,
      schema_version: 1,
      release_id: null,
      module_key: "theme",
      value: { mode: "light", accent_color: "#123456", logo_asset_id: null },
    };
    const config = await request("config", "POST", input);
    const release = await request("releases", "POST", {
        release_key: "cleanup",
        digest: "0".repeat(64),
      }),
      rid = String(release.json.data?.id);
    await request("config", "POST", {
      ...input,
      scope_type: "product",
      scope_id: pid,
      site_id: null,
      release_id: rid,
    });
    await request(`releases/${rid}/validate`, "POST", undefined, {
      "if-match": '"2"',
    });
    await request(`releases/${rid}/publish`, "POST", undefined, {
      "if-match": '"3"',
    });
    const binding = await request("release-bindings", "POST", {
      site_id: sid,
      product_id: pid,
      scope_type: "surface",
      scope_id: "main",
      release_id: rid,
    });
    expect(binding.response.status).toBe(201);
    expect(
      (
        await request(
          `sites/${sid}`,
          "PATCH",
          { status: "suspended" },
          { "if-match": '"1"' },
        )
      ).response.status,
    ).toBe(200);
    for (const path of [
      `config/${config.json.data?.id}`,
      `release-bindings/${binding.json.data?.id}`,
      `applications/${aid}/exposures/${fid}`,
      `applications/${aid}`,
    ])
      expect(
        (await request(path, "DELETE", undefined, { "if-match": '"1"' }))
          .response.status,
        path,
      ).toBe(200);
    expect(
      (
        await request(`sites/${sid}`, "DELETE", undefined, {
          "if-match": '"2"',
        })
      ).response.status,
    ).toBe(200);
  });

  it("shares Site row locking for surface Config creation and Site deletion", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    for (const parentFirst of [true, false]) {
      const suffix = randomUUID(),
        product = await request(
          "products",
          "POST",
          { product_key: suffix, name: "Config Race" },
          ah,
        ),
        pid = String(product.json.data?.id);
      const site = await request("sites", "POST", {
          site_key: suffix,
          hostname: `${suffix}.test`,
          display_name: "Config Race",
        }),
        sid = String(site.json.data?.id);
      const value = {
        mode: "light",
        accent_color: "#123456",
        logo_asset_id: null,
      };
      const input = {
        config_key: "race",
        scope_type: "surface",
        scope_id: "main",
        product_id: pid,
        site_id: sid,
        locale: null,
        schema_version: 1,
        release_id: null,
        module_key: "theme",
        value,
      };
      const lock = new Client({ connectionString: databaseUrl.href });
      await lock.connect();
      await lock.query("BEGIN");
      try {
        await lock.query(
          "SELECT id FROM public.system_site WHERE id=$1 AND tenant_id='tenant-a' FOR UPDATE",
          [sid],
        );
        const waiting = parentFirst
          ? request("config", "POST", input)
          : request(`sites/${sid}`, "DELETE", undefined, { "if-match": '"1"' });
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
        if (parentFirst)
          await lock.query(
            "UPDATE public.system_site SET deleted_at=CURRENT_TIMESTAMP(3),status='archived',version=version+1 WHERE id=$1",
            [sid],
          );
        else
          await lock.query(
            "INSERT INTO public.system_config_record(id,tenant_id,site_id,product_id,scope_type,scope_id,module_key,config_key,schema_version,value_json,status,digest) VALUES($1,'tenant-a',$2,$3,'surface','main','theme','race',1,$4,'active',$5)",
            [randomUUID(), sid, pid, JSON.stringify(value), "0".repeat(64)],
          );
        await lock.query("COMMIT");
        const result = await waiting;
        expect(result.response.status).toBe(parentFirst ? 404 : 409);
        if (!parentFirst)
          expect(result.json.error?.code).toBe("RESOURCE_IN_USE");
      } finally {
        await lock.query("ROLLBACK");
        await lock.end();
      }
    }
  });
  it("rechecks both fences after Redis SET and rejects poisoned cache and Redis loss", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const product = await request(
      "products",
      "POST",
      { product_key: "fence", name: "Fence" },
      ah,
    );
    const site = await request("sites", "POST", {
      site_key: "fence",
      hostname: "fence.example.test",
      display_name: "Fence",
    });
    const sid = String(site.json.data?.id),
      pid = String(product.json.data?.id);
    const policy = {
      default_locale: "en",
      allowed_locales: ["en"],
      allowed_products: ["fence"],
      public_manifest: true,
    };
    await request(`sites/${sid}/policy`, "PUT", policy, {
      "if-none-match": "*",
    });
    const cache = app.get(CacheService),
      originalSet = cache.set.bind(cache);
    const config = {
      config_key: "fenced",
      scope_type: "global",
      scope_id: null,
      product_id: pid,
      site_id: null,
      locale: null,
      schema_version: 1,
      release_id: null,
      module_key: "theme",
      value: { mode: "dark", accent_color: "#aabbcc", logo_asset_id: null },
    };
    const set = vi
      .spyOn(cache, "set")
      .mockImplementationOnce(async (key, value, seconds) => {
        await originalSet(key, value, seconds);
        expect(
          (await request("config", "POST", config, ah)).response.status,
        ).toBe(201);
      });
    const path = `runtime-manifest?product_id=${pid}`,
      hdr = {
        forwarded: 'host="fence.example.test"',
        "x-kokoro-iam-permissions": "",
      };
    const fenced = await request(path, "GET", undefined, hdr);
    expect(fenced.response.status).toBe(200);
    expect(fenced.json.data?.theme).toEqual(config.value);
    set.mockRestore();
    const get = vi.spyOn(cache, "get").mockResolvedValueOnce("{broken");
    expect((await request(path, "GET", undefined, hdr)).response.status).toBe(
      503,
    );
    get.mockRestore();
    const secondSet = vi
      .spyOn(cache, "set")
      .mockImplementationOnce(async (key, value, seconds) => {
        await originalSet(key, value, seconds);
        expect(
          (
            await request(
              `sites/${sid}/policy`,
              "PUT",
              { ...policy, public_manifest: false },
              { "if-match": '"1"' },
            )
          ).response.status,
        ).toBe(200);
      });
    // A distinct surface forces cache miss and a tenant-policy mutation during SET.
    expect(
      (await request(path + "&surface_id=second", "GET", undefined, hdr))
        .response.status,
    ).toBe(403);
    secondSet.mockRestore();
    await cache.onApplicationShutdown();
    expect(
      (
        await request(path, "GET", undefined, {
          forwarded: 'host="fence.example.test"',
        })
      ).response.status,
    ).toBe(503);
  });
});
