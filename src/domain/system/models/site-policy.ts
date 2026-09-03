import type { SitePolicyStatus } from "../enums/site-policy-status.js";

export type SitePolicy = Readonly<{
  id: string;
  tenantId: string;
  siteId: string;
  version: number;
  status: SitePolicyStatus;
  defaultLocale: string;
  allowedLocales: readonly string[];
  allowedProducts: readonly string[];
  publicManifest: boolean;
  updatedAt: string;
}>;
