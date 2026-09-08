import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { SitesModule } from "../modules/sites/sites.public.js";
import { WorkspacesModule } from "../modules/workspaces/workspaces.public.js";
import { ProductsModule } from "../modules/products/products.public.js";
import { ModelCatalogModule } from "../modules/model-catalog/model-catalog.public.js";
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
