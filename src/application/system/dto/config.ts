import type { ConfigScopeType } from "../../../domain/system/enums/config-scope-type.js";

export type ConfigInput = Readonly<{
  moduleKey: string;
  configKey: string;
  scopeType: ConfigScopeType;
  scopeId: string | null;
  productId: string | null;
  locale: string | null;
  value: unknown;
  schemaVersion: number;
  releaseId: string | null;
}>;
