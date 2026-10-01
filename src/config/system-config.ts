import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { systemEnvironmentSchema } from "./system-env.schema.js";
import { parseSystemDatabaseUrl } from "./database-url.js";
@Injectable()
export class SystemConfig {
  public readonly values: Readonly<z.infer<typeof systemEnvironmentSchema>>;
  public readonly database: ReturnType<typeof parseSystemDatabaseUrl>;
  public constructor(environment: NodeJS.ProcessEnv) {
    const snapshot = { ...environment };
    this.database = parseSystemDatabaseUrl(snapshot.DATABASE_URL);
    this.values = Object.freeze(systemEnvironmentSchema.parse(snapshot));
  }
}
