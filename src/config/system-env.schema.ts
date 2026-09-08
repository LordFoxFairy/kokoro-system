import { z } from "zod";
export const systemEnvironmentSchema = z.object({
  KOKORO_SYSTEM_MAINTENANCE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(86400000)
    .default(3600000),
  KOKORO_SYSTEM_RETENTION_HOLD: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:/u.test(value)),
  REDIS_URL: z.url().refine((value) => /^rediss?:/u.test(value)),
  KOKORO_SYSTEM_REDIS_NAMESPACE: z.string().min(1).default("kokoro:system"),
  KOKORO_SYSTEM_BFF_SERVICE_TOKEN: z.string().min(16),
  KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: z.string().min(16),
  KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: z.string().min(16),
  KOKORO_SYSTEM_MODEL_HEALTH_MAX_AGE_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(300000)
    .default(60000),
  KOKORO_SYSTEM_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60000)
    .default(10000),
  KOKORO_SYSTEM_HOST: z.string().default("127.0.0.1"),
  KOKORO_SYSTEM_PORT: z.coerce.number().int().min(0).max(65535).default(4240),
  KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60000)
    .default(10000),
});
