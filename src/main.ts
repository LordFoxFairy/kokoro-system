import { randomUUID } from "node:crypto";
import { createSystemRuntime } from "./bootstrap/runtime.js";
import { shutdownWithDeadline } from "./bootstrap/shutdown.js";
import { loadEnv } from "./config/env.js";
import { createHttpServer } from "./interfaces/http/server.js";
import { stdoutStructuredLogger } from "./interfaces/observability/structured-logger.js";

function lifecycleLog(
  operation: string,
  result: "success" | "error",
  requestId: string,
  startedAt: bigint,
  errorName?: string,
): void {
  stdoutStructuredLogger.write({
    service: "kokoro-system",
    operation,
    request_id: requestId,
    trace_id: requestId,
    result,
    duration_ms: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
    ...(errorName === undefined ? {} : { error_name: errorName }),
  });
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

async function start(): Promise<void> {
  const startupRequestId = randomUUID();
  const startupStartedAt = process.hrtime.bigint();
  const env = loadEnv();
  const runtime = await createSystemRuntime({
    databaseUrl: env.databaseUrl,
    redisUrl: env.redisUrl,
    redisNamespace: env.redisNamespace,
  });
  const server = createHttpServer(
    runtime.service,
    async () => {
      await runtime.pool.ping();
      await runtime.redis.assertReady();
      return true;
    },
    {
      control: runtime.control,
      siteQuery: runtime.siteQuery,
      bffServiceToken: env.bffServiceToken,
      logger: stdoutStructuredLogger,
      onUnexpectedError: (error, requestId) =>
        lifecycleLog(
          "http.unexpected_error",
          "error",
          requestId,
          process.hrtime.bigint(),
          errorName(error),
        ),
    },
  );
  server.listen(env.port, env.host, () =>
    lifecycleLog(
      "service.start",
      "success",
      startupRequestId,
      startupStartedAt,
    ),
  );
  let shutdownPromise: Promise<void> | null = null;
  const shutdown = async (): Promise<void> => {
    if (shutdownPromise !== null) return shutdownPromise;
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    shutdownPromise = (async () => {
      try {
        await shutdownWithDeadline(
          [
            () =>
              new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
              ),
            () => runtime.pool.close(),
            () => runtime.redis.close(),
          ],
          env.shutdownDeadlineMs,
        );
        lifecycleLog("service.shutdown", "success", requestId, startedAt);
      } catch {
        server.closeAllConnections();
        lifecycleLog("service.shutdown", "error", requestId, startedAt);
        process.exitCode = 1;
      }
    })();
    return shutdownPromise;
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

try {
  await start();
} catch (error) {
  const requestId = randomUUID();
  lifecycleLog(
    "service.start",
    "error",
    requestId,
    process.hrtime.bigint(),
    errorName(error),
  );
  process.exitCode = 1;
}
