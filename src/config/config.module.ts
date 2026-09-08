import { Global, Module } from "@nestjs/common";
import type { DynamicModule } from "@nestjs/common";
import { SystemConfig } from "./system-config.js";
@Global()
@Module({})
export class ConfigModule {
  public static forRoot(environment: NodeJS.ProcessEnv): DynamicModule {
    return {
      module: ConfigModule,
      providers: [
        { provide: SystemConfig, useValue: new SystemConfig(environment) },
      ],
      exports: [SystemConfig],
    };
  }
}
