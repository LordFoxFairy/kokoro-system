import { describe, expect, it } from "vitest";

import { loadEnv } from "../src/config/env.js";

const baseEnv = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/system",
  REDIS_URL: "redis://localhost:6379",
  KOKORO_IAM_BASE_URL: "http://iam.test",
  KOKORO_IAM_BACKEND_TOKEN: "iam-token",
};

describe("System environment", () => {
  it("normalizes the required BFF service token", () => {
    expect(loadEnv({ ...baseEnv, KOKORO_SYSTEM_BFF_SERVICE_TOKEN: "  bff-token  " }).bffServiceToken).toBe("bff-token");
    expect(loadEnv(baseEnv).bffServiceToken).toBeNull();
  });
});
