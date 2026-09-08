import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { CacheModule } from "../../cache/cache.module.js";
import { SitesModule } from "../sites/sites.module.js";
import { ProductsModule } from "../products/products.module.js";
import { RuntimeManifestRepository } from "./runtime-manifest.repository.js";
import { RuntimeManifestService } from "./runtime-manifest.service.js";
import { RuntimeManifestController } from "./runtime-manifest.controller.js";
@Module({
  imports: [DatabaseModule, CacheModule, SitesModule, ProductsModule],
  providers: [RuntimeManifestRepository, RuntimeManifestService],
  controllers: [RuntimeManifestController],
})
export class RuntimeManifestsModule {}
