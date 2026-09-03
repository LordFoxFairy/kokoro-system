import type { WorkspaceStatus } from "../enums/workspace-status.js";

export type Workspace = Readonly<{
  id: string;
  tenantId: string;
  siteId: string;
  workspaceKey: string;
  name: string;
  status: WorkspaceStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;
