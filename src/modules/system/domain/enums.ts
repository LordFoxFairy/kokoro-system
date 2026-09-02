/** Closed state vocabulary owned by the System domain. */
export type SiteStatus = "draft" | "active" | "suspended" | "archived";
export type WorkspaceStatus = "active" | "archived";
export type ConfigStatus = "active" | "deleted";
export type ReleaseStatus = "draft" | "validated" | "published" | "retired";
export type SitePolicyStatus = "active" | "archived";
export type ConfigScopeType = "global" | "tenant" | "product" | "surface";
