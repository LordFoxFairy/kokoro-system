import { PostgresPool } from "./infrastructure/postgres/client.js";
import { RedisCoordinator } from "./infrastructure/redis/coordinator.js";
import { PostgresSystemRepository } from "./modules/runtime-manifest/postgres-repository.js";
import { RuntimeManifestService } from "./modules/runtime-manifest/service.js";
import type { TenantBindingVerifier } from "./modules/runtime-manifest/ports.js";
import { PostgresSystemControlRepository } from "./infrastructure/postgres/postgres-control-repository.js";
import { SystemControlService } from "./modules/system/service.js";
export async function createSystemRuntime(input: Readonly<{ databaseUrl: string; redisUrl: string; redisNamespace: string; binding: TenantBindingVerifier }>) {
  const pool = new PostgresPool(input.databaseUrl);
  const redis = new RedisCoordinator(input.redisUrl, input.redisNamespace);
  await redis.assertReady();
  return { pool, redis, service: new RuntimeManifestService(new PostgresSystemRepository(pool), redis, input.binding), control: new SystemControlService(new PostgresSystemControlRepository(pool)) };
}
