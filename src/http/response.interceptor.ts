import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import type { Response } from "express";
import { map } from "rxjs";
import type { Observable } from "rxjs";
import type { OwnerRequest } from "../access/request-context.js";
import { requestIdSchema } from "./protocol.schema.js";
import { OwnerError } from "./owner-error.js";
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = context.switchToHttp().getRequest<OwnerRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const id = requestIdSchema.safeParse(
      request.headers["x-request-id"] ?? randomUUID(),
    );
    if (!id.success)
      throw new OwnerError("INVALID_ARGUMENT", "Invalid x-request-id");
    response.setHeader(
      "x-request-id",
      request.ownerContext?.requestId ?? id.data,
    );
    return next.handle().pipe(
      map((data: unknown) => {
        if (
          data !== null &&
          typeof data === "object" &&
          "version" in data &&
          typeof data.version === "string"
        )
          response.setHeader("etag", `"${data.version}"`);
        if (
          data !== null &&
          typeof data === "object" &&
          "config_version" in data &&
          typeof data.config_version === "string"
        )
          response.setHeader("etag", `"${data.config_version}"`);
        if (
          data !== null &&
          typeof data === "object" &&
          "observed_at" in data &&
          "generation" in data &&
          typeof data.generation === "string"
        )
          response.setHeader("etag", `"${data.generation}"`);
        return { data };
      }),
    );
  }
}
