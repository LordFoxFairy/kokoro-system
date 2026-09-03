import type { ScopeType } from "./scope-type.js";

export type ConfigRecord = Readonly<{
  id: string;
  tenantId: string | null;
  moduleKey: string;
  scopeType: ScopeType;
  scopeId: string | null;
  productId: string | null;
  locale: string | null;
  configKey: string;
  schemaVersion: number;
  value: unknown;
  status: "active" | "deleted";
  configVersion: bigint;
  releaseId: string | null;
  digest: string;
}>;
