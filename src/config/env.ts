export interface SystemEnv {
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly redisNamespace: string;
  readonly bffServiceToken: string | null;
  readonly shutdownDeadlineMs: number;
}
function required(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}
export function loadEnv(source: NodeJS.ProcessEnv = process.env): SystemEnv {
  const port = Number(source.KOKORO_SYSTEM_PORT ?? "4240");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("KOKORO_SYSTEM_PORT is invalid");
  const shutdownDeadlineMs = Number(
    source.KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS ?? "10000",
  );
  if (!Number.isSafeInteger(shutdownDeadlineMs) || shutdownDeadlineMs < 1)
    throw new Error("KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS is invalid");
  const databaseUrl = required("DATABASE_URL", source.DATABASE_URL);
  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    throw new Error("DATABASE_URL must use PostgreSQL");
  return {
    host: source.KOKORO_SYSTEM_HOST ?? "127.0.0.1",
    port,
    databaseUrl,
    redisUrl: required("REDIS_URL", source.REDIS_URL),
    redisNamespace: source.KOKORO_SYSTEM_REDIS_NAMESPACE ?? "kokoro:system",
    bffServiceToken: source.KOKORO_SYSTEM_BFF_SERVICE_TOKEN?.trim() || null,
    shutdownDeadlineMs,
  };
}
