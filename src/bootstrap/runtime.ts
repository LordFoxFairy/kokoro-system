import { PostgresPool } from "../infrastructure/persistence/postgres/client.js";
import { RedisCoordinator } from "../infrastructure/redis/coordinator.js";
import { PostgresSystemRepository } from "../infrastructure/repositories/runtime-manifest/postgres-system.repository.js";
import { RuntimeManifestService } from "../application/runtime-manifest/services/runtime-manifest.service.js";
import { PostgresSiteHostResolver } from "../infrastructure/repositories/system/postgres-site-host-resolver.js";
import { PostgresSystemControlRepository } from "../infrastructure/repositories/system/system-control-repository.js";
import { SystemControlService } from "../application/system/services/system-control.service.js";
import { SiteQueryService } from "../application/system/services/site-query.service.js";
export async function createSystemRuntime(
  input: Readonly<{
    databaseUrl: string;
    redisUrl: string;
    redisNamespace: string;
  }>,
) {
  const pool = new PostgresPool(input.databaseUrl);
  const redis = new RedisCoordinator(input.redisUrl, input.redisNamespace);
  await redis.assertReady();
  const siteHostResolver = new PostgresSiteHostResolver(pool);
  return {
    pool,
    redis,
    service: new RuntimeManifestService(
      new PostgresSystemRepository(pool),
      redis,
      siteHostResolver,
    ),
    siteQuery: new SiteQueryService(siteHostResolver),
    control: new SystemControlService(
      new PostgresSystemControlRepository(pool),
      redis,
    ),
  };
}
