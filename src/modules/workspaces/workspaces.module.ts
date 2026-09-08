import { WorkspaceMaintenanceRepository } from "./workspace-maintenance.repository.js";
import { WorkspaceMaintenanceService } from "./workspace-maintenance.service.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { WorkspaceRepository } from "./workspace.repository.js";
import { WorkspacesService } from "./workspaces.service.js";
import { WorkspacesController } from "./workspaces.controller.js";
@Module({
  imports: [DatabaseModule],
  providers: [
    WorkspaceMaintenanceRepository,
    WorkspaceMaintenanceService,
    WorkspaceRepository,
    WorkspacesService,
  ],
  controllers: [WorkspacesController],
  exports: [WorkspaceMaintenanceService],
})
export class WorkspacesModule {}
