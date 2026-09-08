import { expect, it, vi } from "vitest";
import { HealthService } from "../../src/health/health.service.js";
import { SystemError } from "../../src/system.error.js";
import type { DatabaseService } from "../../src/database/database.service.js";
import type { CacheService } from "../../src/cache/cache.service.js";

it("keeps liveness dependency-free and reports readiness failures as the same neutral error", async () => {
  const database = {
    ready: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  };
  const cache = {
    ready: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
  };
  const service = new HealthService(
    database as unknown as DatabaseService,
    cache as unknown as CacheService,
  );
  expect(service.live()).toEqual({ service: "kokoro-system", status: "ok" });
  expect(database.ready).not.toHaveBeenCalled();
  expect(cache.ready).not.toHaveBeenCalled();
  expect(await service.ready()).toEqual({
    service: "kokoro-system",
    status: "ready",
  });
  database.ready.mockResolvedValueOnce(false);
  await expect(service.ready()).rejects.toEqual(
    new SystemError("SYSTEM_UNAVAILABLE", "Dependencies unavailable", true),
  );
  cache.ready.mockResolvedValueOnce(false);
  await expect(service.ready()).rejects.toEqual(
    new SystemError("SYSTEM_UNAVAILABLE", "Dependencies unavailable", true),
  );
});
