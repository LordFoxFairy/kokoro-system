import { randomUUID } from "node:crypto";
import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";
import type { OwnerRequest } from "../access/request-context.js";
import { requestIdSchema } from "./protocol.schema.js";
import { OwnerError } from "./owner-error.js";
@Catch()
export class OwnerErrorFilter implements ExceptionFilter {
  public catch(error: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<OwnerRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const parsed = requestIdSchema.safeParse(request.headers["x-request-id"]);
    response.setHeader(
      "x-request-id",
      request.ownerContext?.requestId ??
        (parsed.success ? parsed.data : randomUUID()),
    );
    let mapped: OwnerError;
    if (error instanceof OwnerError) mapped = error;
    else if (error instanceof ZodError)
      mapped = new OwnerError(
        "SYSTEM_UNAVAILABLE",
        "Stored representation is invalid",
        503,
        true,
      );
    else if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error.status === 400 || error.status === 413)
    )
      mapped = new OwnerError(
        "INVALID_ARGUMENT",
        "Request body is invalid or too large",
      );
    else if (error instanceof HttpException)
      mapped = new OwnerError(
        error.getStatus() === 404 ? "NOT_FOUND" : "INVALID_ARGUMENT",
        error.getStatus() === 404
          ? "Resource not found"
          : "Request validation failed",
        error.getStatus(),
      );
    else if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    )
      mapped = new OwnerError(
        "VERSION_CONFLICT",
        "Resource identity conflict",
        409,
      );
    else
      mapped = new OwnerError(
        "SYSTEM_UNAVAILABLE",
        "System temporarily unavailable",
        503,
        true,
      );
    response.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        retryable: mapped.retryable,
      },
    });
  }
}
