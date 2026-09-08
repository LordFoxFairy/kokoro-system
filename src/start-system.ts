import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module.js";
import { SystemConfig } from "./config/system-config.js";
import { DatabaseService } from "./database/database.service.js";
import { configureHttp } from "./http/configure-http.js";
import { lifecycleLog } from "./http/structured-logger.js";
export async function startSystem(environment: NodeJS.ProcessEnv) {
  const started = Date.now(),
    requestId = randomUUID();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot(environment),
    { logger: false, abortOnError: false },
  );
  const config = app.get(SystemConfig);
  try {
    configureHttp(app);
    await app.init();
    await app.get(DatabaseService).ready();
    await app.listen(
      config.values.KOKORO_SYSTEM_PORT,
      config.values.KOKORO_SYSTEM_HOST,
    );
  } catch (error) {
    await app.close().catch(() => undefined);
    lifecycleLog({
      operation: "service.start",
      requestId,
      result: "error",
      durationMs: Date.now() - started,
    });
    throw error;
  }
  lifecycleLog({
    operation: "service.start",
    requestId,
    result: "success",
    durationMs: Date.now() - started,
  });
  let closing: Promise<Readonly<{ forced: boolean }>> | undefined;
  const close = (): Promise<Readonly<{ forced: boolean }>> => {
    if (closing) return closing;
    closing = (async () => {
      const began = Date.now();
      let forced = false;
      const server: Server = app.getHttpServer();
      const timer = setTimeout(() => {
        forced = true;
        server.closeAllConnections();
        app.get(DatabaseService).forceClose();
      }, config.values.KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS);
      timer.unref();
      try {
        await app.close();
        return { forced };
      } finally {
        clearTimeout(timer);
        lifecycleLog({
          operation: "service.shutdown",
          requestId: randomUUID(),
          result: forced ? "forced" : "success",
          durationMs: Date.now() - began,
        });
      }
    })();
    return closing;
  };
  return { app, url: await app.getUrl(), close };
}
