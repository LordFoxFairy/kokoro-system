import { createParamDecorator } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { OwnerRequest, RequestContext } from "./request-context.js";
import { OwnerError } from "../http/owner-error.js";
export const Context = createParamDecorator(
  (_data: unknown, execution: ExecutionContext): RequestContext => {
    const context = execution
      .switchToHttp()
      .getRequest<OwnerRequest>().ownerContext;
    if (!context)
      throw new OwnerError("FORBIDDEN", "Trusted context required", 403);
    return context;
  },
);
