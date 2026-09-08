import { Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "./config/config.module.js";
import { AccessGuard } from "./access/access.guard.js";
import { HealthModule } from "./health/health.module.js";
import { SitesModule } from "./modules/sites/sites.module.js";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module.js";
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
      ],
      providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
    };
  }
}
