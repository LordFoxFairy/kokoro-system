import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { requestIdSchema } from "./protocol.schema.js";
import { withRequestBudget } from "./request-budget.js";
import { lifecycleLog } from "./structured-logger.js";
import type { OwnerRequest } from "../access/request-context.js";
export function requestLifecycle(timeoutMs: number) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const started = Date.now();
    if (request.headers["x-request-id"] === undefined)
      request.headers["x-request-id"] = randomUUID();
    const parsed = requestIdSchema.safeParse(request.headers["x-request-id"]);
    const id = parsed.success ? parsed.data : randomUUID();
    response.setHeader("x-request-id", id);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error("Request deadline"));
      if (!response.headersSent)
        response.status(503).json({
          error: {
            code: "SYSTEM_UNAVAILABLE",
            message: "Request deadline exceeded",
            retryable: true,
          },
        });
      else if (!response.writableEnded) response.destroy();
    }, timeoutMs);
    timer.unref();
    const aborted = () => controller.abort(new Error("Request disconnected"));
    request.once("aborted", aborted);
    let logged = false;
    const finish = (result: string) => {
      if (logged) return;
      logged = true;
      clearTimeout(timer);
      request.off("aborted", aborted);
      const owner = (request as OwnerRequest).ownerContext;
      const trace = requestIdSchema.safeParse(
        request.headers["x-kokoro-trace-id"],
      );
      lifecycleLog({
        operation:
          owner?.operation ??
          (request.path === "/readyz"
            ? "readiness"
            : request.path === "/healthz"
              ? "liveness"
              : "http.unmatched"),
        requestId: String(response.getHeader("x-request-id") ?? id),
        traceId: trace.success ? trace.data : id,
        result,
        durationMs: Date.now() - started,
      });
    };
    response.once("close", () => {
      if (!response.writableFinished) {
        aborted();
        finish("cancelled");
      }
    });
    response.once("finish", () =>
      finish(response.statusCode < 400 ? "success" : "error"),
    );
    if (!parsed.success) {
      response.status(400).json({
        error: {
          code: "INVALID_ARGUMENT",
          message: "Invalid x-request-id",
          retryable: false,
        },
      });
      return;
    }
    withRequestBudget(
      { signal: controller.signal, deadline: started + timeoutMs },
      next,
    );
  };
}
