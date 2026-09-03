import { describe, expect, it } from "vitest";

import { loadEnv } from "../src/config/env.js";

const baseEnv = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/system",
  REDIS_URL: "redis://localhost:6379",
};

describe("System environment", () => {
  it("normalizes the required BFF service token", () => {
    expect(
      loadEnv({ ...baseEnv, KOKORO_SYSTEM_BFF_SERVICE_TOKEN: "  bff-token  " })
        .bffServiceToken,
    ).toBe("bff-token");
    expect(loadEnv(baseEnv).bffServiceToken).toBeNull();
  });

  it("validates the total shutdown deadline", () => {
    expect(
      loadEnv({
        ...baseEnv,
        KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS: "2500",
      }).shutdownDeadlineMs,
    ).toBe(2500);
    expect(() =>
      loadEnv({ ...baseEnv, KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS: "0" }),
    ).toThrow("KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS is invalid");
  });
});
