import type { SiteStatus } from "../enums/site-status.js";

export type Site = Readonly<{
  id: string;
  tenantId: string;
  siteKey: string;
  hostnames: readonly string[];
  displayName: string;
  status: SiteStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;
