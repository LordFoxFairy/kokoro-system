import { PostgresPool } from "./infrastructure/postgres/client.js";
import { RedisCoordinator } from "./infrastructure/redis/coordinator.js";
import { PostgresSystemRepository } from "./modules/runtime-manifest/postgres-repository.js";
import { RuntimeManifestService } from "./modules/runtime-manifest/service.js";
import { PostgresSiteHostResolver } from "./infrastructure/postgres/site-host-resolver.js";
import { PostgresSystemControlRepository } from "./infrastructure/postgres/repositories/system-control-repository.js";
import { SystemControlService } from "./modules/system/application/service.js";
export async function createSystemRuntime(input: Readonly<{ databaseUrl: string; redisUrl: string; redisNamespace: string }>) {
  const pool = new PostgresPool(input.databaseUrl);
  const redis = new RedisCoordinator(input.redisUrl, input.redisNamespace);
  await redis.assertReady();
  return { pool, redis, service: new RuntimeManifestService(new PostgresSystemRepository(pool), redis, new PostgresSiteHostResolver(pool)), control: new SystemControlService(new PostgresSystemControlRepository(pool)) };
}
