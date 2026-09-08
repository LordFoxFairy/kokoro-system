import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "./config/config.module.js";
import { AccessGuard } from "./access/access.guard.js";
import { HealthModule } from "./health/health.module.js";
import { SitesModule } from "./modules/sites/sites.module.js";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module.js";
import { ProductsModule } from "./modules/products/products.module.js";
import { RuntimeManifestsModule } from "./modules/runtime-manifests/runtime-manifests.module.js";
import { ModelCatalogModule } from "./modules/model-catalog/model-catalog.module.js";
@Module({})
export class AppModule {
  public static forRoot(environment: NodeJS.ProcessEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(environment),
        HealthModule,
        SitesModule,
        WorkspacesModule,
        ProductsModule,
        RuntimeManifestsModule,
        ModelCatalogModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
    };
  }
}
