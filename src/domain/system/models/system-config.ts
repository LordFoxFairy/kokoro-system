import type { ConfigScopeType } from "../enums/config-scope-type.js";
import type { ConfigStatus } from "../enums/config-status.js";

export type SystemConfig = Readonly<{
  id: string;
  tenantId: string | null;
  moduleKey: string;
  scopeType: ConfigScopeType;
  scopeId: string | null;
  productId: string | null;
  locale: string | null;
  configKey: string;
  schemaVersion: number;
  value: unknown;
  status: ConfigStatus;
  configVersion: number;
  releaseId: string | null;
  digest: string;
  updatedAt: string;
}>;
