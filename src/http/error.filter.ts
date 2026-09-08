import { systemErrorStatus } from "./system-error-status.js";
import { randomUUID } from "node:crypto";
import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import type { OwnerRequest } from "../access/request-context.js";
import { requestIdSchema } from "./protocol.schema.js";
import { SystemError } from "../system.error.js";
@Catch()
export class OwnerErrorFilter implements ExceptionFilter {
  public catch(error: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<OwnerRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent || response.writableEnded || response.destroyed)
      return;
    const parsed = requestIdSchema.safeParse(request.headers["x-request-id"]);
    response.setHeader(
      "x-request-id",
      request.ownerContext?.requestId ??
        (parsed.success ? parsed.data : randomUUID()),
    );
    let mapped: SystemError;
    let transportStatus: number | undefined;
    if (error instanceof SystemError) mapped = error;
    else if (error instanceof ZodError)
      mapped = new SystemError(
        "SYSTEM_UNAVAILABLE",
        "Stored representation is invalid",
        true,
      );
    else if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error.status === 400 || error.status === 413)
    )
      mapped = new SystemError(
        "INVALID_ARGUMENT",
        "Request body is invalid or too large",
      );
    else if (error instanceof HttpException) {
      transportStatus = error.getStatus();
      mapped = new SystemError(
        error.getStatus() === 404 ? "NOT_FOUND" : "INVALID_ARGUMENT",
        error.getStatus() === 404
          ? "Resource not found"
          : "Request validation failed",
      );
    } else if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    )
      mapped = new SystemError(
        "VERSION_CONFLICT",
        "Resource identity conflict",
      );
    else
      mapped = new SystemError(
        "SYSTEM_UNAVAILABLE",
        "System temporarily unavailable",
        true,
      );
    response.status(transportStatus ?? systemErrorStatus[mapped.code]).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        retryable: mapped.retryable,
      },
    });
  }
}
