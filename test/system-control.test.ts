import { describe, expect, it } from "vitest";
import { InMemorySystemControlRepository } from "./doubles/in-memory-system-control-repository.js";
import { SystemControlService } from "../src/application/system/services/system-control.service.js";
import type { TenantRequestContext } from "../src/domain/runtime-manifest/models/index.js";

const context = (
  tenantId: string,
  permissions: readonly string[] = [
    "system:read",
    "system:write",
    "system:publish",
  ],
): TenantRequestContext => ({
  tenantId,
  actorId: "actor-a",
  organizationId: null,
  surfaceId: null,
  permissions,
  correlationId: "00000000-0000-4000-8000-000000000001",
});

function createService(): SystemControlService {
  return new SystemControlService(new InMemorySystemControlRepository(), {
    invalidateTenant: async () => undefined,
  });
}

describe("SystemControlService", () => {
  it("keeps sites and workspaces tenant isolated", async () => {
    const service = createService();
    const site = await service.createSite(
      context("tenant-a"),
      { siteKey: "main", hostname: "a.example.test", displayName: "A" },
      "cmd-site-a",
    );
    await service.createWorkspace(
      context("tenant-a"),
      { siteId: site.id, workspaceKey: "default", name: "A workspace" },
      "cmd-workspace-a",
    );

    await expect(
      service.listWorkspaces(context("tenant-b"), {}),
    ).resolves.toMatchObject({ items: [] });
    await expect(
      service.listSites(context("tenant-b"), {}),
    ).resolves.toMatchObject({ items: [] });
  });

  it("returns the same result for a repeated idempotency key and rejects a changed command", async () => {
    const service = createService();
    const first = await service.createSite(
      context("tenant-a"),
      { siteKey: "main", hostname: "a.example.test", displayName: "A" },
      "cmd-1",
    );
    await expect(
      service.createSite(
        context("tenant-a"),
        { siteKey: "main", hostname: "a.example.test", displayName: "A" },
        "cmd-1",
      ),
    ).resolves.toEqual(first);
    await expect(
      service.createSite(
        context("tenant-a"),
        {
          siteKey: "other",
          hostname: "other.example.test",
          displayName: "Other",
        },
        "cmd-1",
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("serializes concurrent calls with the same idempotency key into one mutation", async () => {
    const service = createService();
    const input = {
      siteKey: "concurrent",
      hostname: "concurrent.example.test",
      displayName: "Concurrent",
    };

    const [first, second] = await Promise.all([
      service.createSite(context("tenant-a"), input, "cmd-concurrent"),
      service.createSite(context("tenant-a"), input, "cmd-concurrent"),
    ]);

    expect(second).toEqual(first);
    await expect(service.listSites(context("tenant-a"), {})).resolves.toMatchObject(
      { items: [first] },
    );
  });

  it("enforces write permissions and release transitions", async () => {
    const service = createService();
    await expect(
      service.createSite(
        context("tenant-a", ["system:read"]),
        { siteKey: "main", hostname: "a.example.test", displayName: "A" },
        "cmd-1",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const release = await service.createRelease(
      context("tenant-a"),
      { releaseKey: "r1", digest: "a".repeat(64) },
      "cmd-release",
    );
    await service.validateRelease(
      context("tenant-a"),
      release.id,
      "cmd-validate",
    );
    await expect(
      service.publishRelease(context("tenant-a"), release.id, "cmd-publish"),
    ).resolves.toMatchObject({ status: "published" });
    await expect(
      service.publishRelease(context("tenant-a"), release.id, "cmd-publish"),
    ).resolves.toMatchObject({ status: "published" });
    await expect(
      service.publishRelease(
        context("tenant-a"),
        release.id,
        "cmd-publish-again",
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("versions site policy and scopes configuration to the caller tenant", async () => {
    const service = createService();
    const site = await service.createSite(
      context("tenant-a"),
      { siteKey: "main", hostname: "a.example.test", displayName: "A" },
      "site",
    );
    const policy = await service.putPolicy(
      context("tenant-a"),
      site.id,
      {
        version: 1,
        status: "active",
        defaultLocale: "en-US",
        allowedLocales: ["en-US"],
        allowedProducts: ["admin"],
        publicManifest: false,
      },
      "policy",
    );
    await expect(
      service.getPolicy(context("tenant-a"), site.id),
    ).resolves.toMatchObject({ version: 1, defaultLocale: "en-US" });
    await expect(
      service.getPolicy(context("tenant-b"), site.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await service.upsertConfig(
      context("tenant-a"),
      {
        moduleKey: "theme",
        configKey: "default",
        scopeType: "tenant",
        scopeId: "tenant-a",
        productId: null,
        locale: "en-US",
        value: { mode: "dark" },
        schemaVersion: 1,
        releaseId: null,
      },
      "config",
    );
    await expect(
      service.listConfigs(context("tenant-b"), {}),
    ).resolves.toMatchObject({ items: [] });
    expect(policy.version).toBe(1);
  });
});
