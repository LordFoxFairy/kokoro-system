import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { tenantScope } from "../../access/tenant-scope.js";
import { DatabaseService } from "../../database/database.service.js";
import { CacheService } from "../../cache/cache.service.js";
import { SystemConfig } from "../../config/system-config.js";
import { commandDigest } from "../../database/command-digest.js";
import { SystemError } from "../../system.error.js";
import { ModelGenerationRepository } from "./model-generation.repository.js";
import { ResolveRepository } from "./resolve.repository.js";
import { resolveSchema } from "./schemas/resolve.schema.js";
import type { resolveInputSchema } from "./schemas/resolve.schema.js";
import { resolveCacheSchema } from "./resolve-cache.schema.js";
@Injectable()
export class ResolveService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CacheService) private readonly cache: CacheService,
    @Inject(SystemConfig) private readonly config: SystemConfig,
    @Inject(ModelGenerationRepository)
    private readonly generation: ModelGenerationRepository,
    @Inject(ResolveRepository) private readonly resolver: ResolveRepository,
  ) {}
  private generations(tenant: string) {
    return this.database.read((tx) => this.generation.read(tx, tenant));
  }
  public async resolve(
    context: RequestContext,
    input: z.infer<typeof resolveInputSchema>,
  ) {
    if (context.service !== "kokoro-agent")
      throw new SystemError("FORBIDDEN", "Agent caller required");
    const tenant = tenantScope(context);
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await this.generations(tenant),
        key = `model-resolve:${commandDigest({ tenant, feature: input.feature_key, label: input.label_key ?? null, ...before })}`;
      const cached = await this.cache.get(key);
      if (cached !== null) {
        const parsed = resolveCacheSchema.safeParse(JSON.parse(cached));
        if (!parsed.success)
          throw new SystemError(
            "SYSTEM_UNAVAILABLE",
            "Invalid route cache",
            true,
          );
        const value = parsed.data;
        const { checksum, ...payload } = value;
        if (commandDigest(payload) !== checksum)
          throw new SystemError(
            "SYSTEM_UNAVAILABLE",
            "Route cache checksum mismatch",
            true,
          );
        if (value.key !== key)
          throw new SystemError(
            "SYSTEM_UNAVAILABLE",
            "Route cache identity mismatch",
            true,
          );
        const evidence = value.kind === "route" ? value.data : value;
        if (
          evidence.generation !== before.generation ||
          evidence.tenant_generation !== before.tenant_generation
        )
          throw new SystemError(
            "SYSTEM_UNAVAILABLE",
            "Route cache fence mismatch",
            true,
          );
        if (
          value.kind === "route" &&
          (value.data.feature_key !== input.feature_key ||
            (input.label_key !== undefined &&
              value.data.label_key !== input.label_key))
        )
          throw new SystemError(
            "SYSTEM_UNAVAILABLE",
            "Route cache identity mismatch",
            true,
          );
        if (value.expires_at > Date.now()) {
          if (
            commandDigest(before) !==
            commandDigest(await this.generations(tenant))
          )
            continue;
          if (value.expires_at <= Date.now()) {
            await this.cache.remove(key);
            continue;
          }
          if (value.kind === "route") return value.data;
          throw new SystemError(
            value.code,
            "Model route unavailable",
            value.code === "MODEL_UNAVAILABLE",
          );
        }
        await this.cache.remove(key);
      }
      const value = await this.database.read(async (tx) => {
        const policy = await this.resolver.policy(
          tx,
          tenant,
          input.feature_key,
          input.label_key,
        );
        if (!policy)
          return {
            kind: "error" as const,
            key,
            code: "ROUTE_NOT_FOUND" as const,
            expires_at: Date.now() + 30000,
            ...before,
          };
        if (!policy.visible)
          return {
            kind: "error" as const,
            key,
            code: "POLICY_DENIED" as const,
            expires_at: Date.now() + 30000,
            ...before,
          };
        const candidate = await this.resolver.candidate(
          tx,
          input.feature_key,
          policy.revision_id,
          this.config.values.KOKORO_SYSTEM_MODEL_HEALTH_MAX_AGE_MS,
        );
        if (!candidate)
          return {
            kind: "error" as const,
            key,
            code: "MODEL_UNAVAILABLE" as const,
            expires_at: Date.now() + 30000,
            ...before,
          };
        const { health_valid_until, ...route } = candidate;
        return {
          kind: "route" as const,
          key,
          expires_at: Math.min(
            Date.now() + 30000,
            health_valid_until.getTime(),
          ),
          data: resolveSchema.parse({
            ...route,
            ...before,
            label_key: policy.label_key,
            feature_key: policy.feature_key,
          }),
        };
      });
      if (
        commandDigest(before) !== commandDigest(await this.generations(tenant))
      )
        continue;
      await this.cache.set(
        key,
        JSON.stringify({ ...value, checksum: commandDigest(value) }),
        Math.max(1, Math.ceil((value.expires_at - Date.now()) / 1000)),
      );
      if (
        commandDigest(before) !== commandDigest(await this.generations(tenant))
      ) {
        await this.cache.remove(key);
        continue;
      }
      if (value.kind === "route") {
        if (value.expires_at <= Date.now()) {
          await this.cache.remove(key);
          continue;
        }
        return value.data;
      }
      throw new SystemError(
        value.code,
        "Model route unavailable",
        value.code === "MODEL_UNAVAILABLE",
      );
    }
    throw new SystemError(
      "SYSTEM_UNAVAILABLE",
      "Route changed during read",
      true,
    );
  }
}
