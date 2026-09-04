import type { ReleaseStatus } from "../enums/release-status.js";

export type ConfigRelease = Readonly<{
  id: string;
  tenantId: string;
  releaseKey: string;
  status: ReleaseStatus;
  digest: string;
  publishedAt: string | null;
  version: string;
  createdAt: string;
  updatedAt: string;
}>;
