import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { SitesModule } from "../modules/sites/sites.module.js";
import { WorkspacesModule } from "../modules/workspaces/workspaces.module.js";
import { ProductsModule } from "../modules/products/products.module.js";
import { ModelCatalogModule } from "../modules/model-catalog/model-catalog.module.js";
import { MaintenanceService } from "./maintenance.service.js";
@Module({
  imports: [
    DatabaseModule,
    SitesModule,
    WorkspacesModule,
    ProductsModule,
    ModelCatalogModule,
  ],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
