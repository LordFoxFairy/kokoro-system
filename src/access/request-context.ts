import type { Request } from "express";
import type { Precondition } from "../http/conditional-request.js";
export type RequestContext = Readonly<{
  tenantId: string | null;
  actorId: string;
  service: "web-bff" | "kokoro-agent" | "system-admin";
  permissions: readonly string[];
  scope: "tenant" | "global";
  requestId: string;
  operation: string;
  path: string;
  idempotencyKey: string | null;
  precondition: Precondition | null;
}>;
export type OwnerRequest = Request & { ownerContext?: RequestContext };
