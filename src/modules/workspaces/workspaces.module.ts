import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { WorkspaceRepository } from "./workspace.repository.js";
import { WorkspacesService } from "./workspaces.service.js";
import { WorkspacesController } from "./workspaces.controller.js";
@Module({
  imports: [DatabaseModule],
  providers: [WorkspaceRepository, WorkspacesService],
  controllers: [WorkspacesController],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
