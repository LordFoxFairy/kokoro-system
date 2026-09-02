import type { ConfigScopeType } from "../domain/enums.js";

export type PageRequest = Readonly<{ cursor?: string; limit?: number }>;
export type Page<T> = Readonly<{ items: readonly T[]; nextCursor: string | null }>;
export type SiteInput = Readonly<{ siteKey: string; hostname: string; displayName: string }>;
export type WorkspaceInput = Readonly<{ siteId: string; workspaceKey: string; name: string }>;
export type ReleaseInput = Readonly<{ releaseKey: string; digest: string }>;
export type ConfigInput = Readonly<{ moduleKey: string; configKey: string; scopeType: ConfigScopeType; scopeId: string | null; productId: string | null; locale: string | null; value: unknown; schemaVersion: number; releaseId: string | null }>;
