import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { systemEnvironmentSchema } from "./system-env.schema.js";
@Injectable()
export class SystemConfig {
  public readonly values: Readonly<z.infer<typeof systemEnvironmentSchema>>;
  public constructor(environment: NodeJS.ProcessEnv) {
    this.values = Object.freeze(systemEnvironmentSchema.parse(environment));
  }
}
