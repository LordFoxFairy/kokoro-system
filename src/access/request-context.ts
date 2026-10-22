import type { Request } from "express";
import type { Precondition } from "../http/conditional-request.js";
export type RequestContext = Readonly<{
  tenantId: string | null;
  actorId: string;
  actorTenantId: string | null;
  service: "web-bff" | "kokoro-agent" | "system-admin" | "model-management";
  permissions: readonly string[];
  scope: "tenant" | "global";
  requestId: string;
  operation: string;
  path: string;
  idempotencyKey: string | null;
  precondition: Precondition | null;
}>;
export type OwnerRequest = Request<Record<string, string>, unknown, unknown> & {
  ownerContext?: RequestContext;
};
