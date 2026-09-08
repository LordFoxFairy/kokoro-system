import type { RequestContext } from "./request-context.js";
import { SystemError } from "../system.error.js";
export function tenantScope(context: RequestContext): string {
  if (!context.tenantId || context.scope !== "tenant")
    throw new SystemError("FORBIDDEN", "Tenant scope required");
  return context.tenantId;
}
