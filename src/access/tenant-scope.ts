import type { RequestContext } from "./request-context.js";
import { OwnerError } from "../http/owner-error.js";
export function tenantScope(context: RequestContext): string {
  if (!context.tenantId || context.scope !== "tenant")
    throw new OwnerError("FORBIDDEN", "Tenant scope required", 403);
  return context.tenantId;
}
