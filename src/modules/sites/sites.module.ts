import { SiteMaintenanceRepository } from "./site-maintenance.repository.js";
import { SiteMaintenanceService } from "./site-maintenance.service.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { SiteRepository } from "./site.repository.js";
import { DomainRepository } from "./domain.repository.js";
import { PolicyRepository } from "./policy.repository.js";
import { SitesService } from "./sites.service.js";
import { SitesController } from "./sites.controller.js";
@Module({
  imports: [DatabaseModule],
  providers: [
    SiteMaintenanceRepository,
    SiteMaintenanceService,
    SiteRepository,
    DomainRepository,
    PolicyRepository,
    SitesService,
  ],
  controllers: [SitesController],
  exports: [SiteMaintenanceService, SitesService],
})
export class SitesModule {}
