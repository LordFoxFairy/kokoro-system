import { afterEach, describe, expect, it, vi } from "vitest";

import { IamTenantBindingClient } from "../src/infrastructure/iam/tenant-binding-client.js";

describe("IamTenantBindingClient", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the v1 snake_case response and propagates standard request context", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      data: { host: "app.example.test", tenant_id: "tenant-a", status: "active", binding_revision: "7" },
      meta: { request_id: "request-a" },
    }), { status: 200 }));

    await expect(new IamTenantBindingClient("http://iam.test", "TOKEN").verify({
      context: { tenantId: "tenant-a", actorId: "actor-a", organizationId: null, surfaceId: null, permissions: [], correlationId: "request-a" },
      host: "App.Example.Test:4240",
    })).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://iam.test/internal/iam/tenant-binding?host=app.example.test");
    expect(new Headers((init as RequestInit | undefined)?.headers).get("authorization")).toBe("Bearer TOKEN");
    expect(new Headers((init as RequestInit | undefined)?.headers).get("x-kokoro-request-id")).toBe("request-a");
    expect(new Headers((init as RequestInit | undefined)?.headers).get("forwarded")).toBe("host=app.example.test");
  });

  it("rejects a missing or disabled binding instead of accepting a tenant-only response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      data: { host: "app.example.test", tenant_id: "tenant-a", status: "disabled", binding_revision: "8" },
    }), { status: 200 }));

    await expect(new IamTenantBindingClient("http://iam.test", "TOKEN").verify({
      context: { tenantId: "tenant-a", actorId: null, organizationId: null, surfaceId: null, permissions: [], correlationId: "request-b" },
      host: "app.example.test",
    })).rejects.toThrow("IAM tenant binding rejected");
  });
});
