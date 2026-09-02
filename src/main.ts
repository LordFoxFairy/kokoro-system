import { createSystemRuntime } from "./bootstrap.js";
import { loadEnv } from "./config/env.js";
import { createHttpServer } from "./interfaces/http/server.js";

async function start(): Promise<void> {
  const env = loadEnv();
  const runtime = await createSystemRuntime({ databaseUrl: env.databaseUrl, redisUrl: env.redisUrl, redisNamespace: env.redisNamespace });
  const server = createHttpServer(runtime.service, async () => { await runtime.pool.ping(); await runtime.redis.assertReady(); return true; }, { control: runtime.control, bffServiceToken: env.bffServiceToken });
  server.listen(env.port, env.host, () => process.stdout.write(`kokoro-system listening on http://${env.host}:${env.port}\n`));
  const shutdown = async (): Promise<void> => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await runtime.pool.close(); await runtime.redis.close(); };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

try {
  await start();
} catch {
  process.stderr.write("kokoro-system failed to start; inspect dependency readiness without exposing connection details\n");
  process.exitCode = 1;
}
