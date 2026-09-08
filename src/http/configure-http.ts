import { SystemConfig } from "../config/system-config.js";
import { requestLifecycle } from "./request-lifecycle.middleware.js";
import { StandardSchemaValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Server } from "node:http";
import { OwnerErrorFilter } from "./error.filter.js";
import { ResponseInterceptor } from "./response.interceptor.js";
import { OwnerError } from "./owner-error.js";
export function configureHttp(app: NestExpressApplication): void {
  app.use(
    requestLifecycle(
      app.get(SystemConfig).values.KOKORO_SYSTEM_REQUEST_TIMEOUT_MS,
    ),
  );
  app.useBodyParser("json", { limit: 1_000_000, strict: true });
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      exceptionFactory: () =>
        new OwnerError("INVALID_ARGUMENT", "Request validation failed"),
    }),
  );
  app.useGlobalFilters(new OwnerErrorFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  const server = app.getHttpServer() as Server;
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
}
