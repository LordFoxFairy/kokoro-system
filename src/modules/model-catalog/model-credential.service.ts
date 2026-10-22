import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { SystemConfig } from "../../config/system-config.js";
import type { RequestContext } from "../../access/request-context.js";
import { tenantScope } from "../../access/tenant-scope.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { SystemError } from "../../system.error.js";
import { ProviderRepository } from "./provider.repository.js";
import { ModelGenerationRepository } from "./model-generation.repository.js";
import { ModelCredentialRepository } from "./model-credential.repository.js";
import { ModelCredentialCrypto } from "./model-credential-crypto.js";
import { providerSchema } from "./schemas/provider.schema.js";
import type { providerInputSchema } from "./schemas/provider.schema.js";
import {
  credentialReadSchema,
  providerCreationSchema,
} from "./schemas/credential.schema.js";
import type { credentialReadInputSchema } from "./schemas/credential.schema.js";
@Injectable()
export class ModelCredentialService {
  public constructor(
    @Inject(SystemConfig) private readonly config: SystemConfig,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(ProviderRepository) private readonly providers: ProviderRepository,
    @Inject(ModelGenerationRepository)
    private readonly generation: ModelGenerationRepository,
    @Inject(ModelCredentialRepository)
    private readonly credentials: ModelCredentialRepository,
    @Inject(ModelCredentialCrypto)
    private readonly crypto: ModelCredentialCrypto,
  ) {}
  private actorTenant(context: RequestContext): string {
    if (!context.actorId || !context.actorTenantId)
      throw new SystemError("FORBIDDEN", "Trusted management actor required");
    return context.actorTenantId;
  }
  public createProvider(
    context: RequestContext,
    input: z.infer<typeof providerInputSchema>,
  ) {
    const tenant = this.actorTenant(context),
      key = context.idempotencyKey;
    if (!key)
      throw new SystemError("INVALID_ARGUMENT", "Idempotency-Key required");
    // The generic receipt never receives the API key or an offline-testable bare hash.
    const requestHmac = this.crypto.requestDigest({
      input,
      actor_tenant: tenant,
    });
    return this.receipts.run(
      context,
      { credential_request_hmac: requestHmac },
      providerSchema,
      async (tx) => {
        if (await this.credentials.hasCreation(tx, key))
          throw new SystemError(
            "IDEMPOTENCY_KEY_REUSED",
            "Provider creation identity retained",
          );
        const id = randomUUID(),
          reference = "model-key:" + randomUUID();
        const { api_key, ...metadata } = input;
        const sealed = this.crypto.encrypt(id, reference, api_key);
        await this.generation.advance(tx);
        const provider = await this.providers.create(
          tx,
          { ...metadata, secret_handle_ref: reference },
          id,
        );
        await this.credentials.create(
          tx,
          id,
          reference,
          key,
          context.actorId,
          tenant,
          sealed,
        );
        return provider;
      },
    );
  }
  public creation(context: RequestContext, key: string) {
    const tenant = this.actorTenant(context);
    return this.database.read(async (tx) => {
      const current = await this.credentials.creation(
        tx,
        key,
        context.actorId,
        tenant,
      );
      if (!current)
        throw new SystemError(
          "NOT_FOUND",
          "Provider creation is not confirmed",
        );
      return providerCreationSchema.parse({
        ...current,
        deleted_at: current.deleted_at?.toISOString() ?? null,
      });
    });
  }
  public read(
    context: RequestContext,
    input: z.infer<typeof credentialReadInputSchema>,
  ) {
    if (context.service !== "kokoro-agent")
      throw new SystemError("FORBIDDEN", "Agent caller required");
    const tenant = tenantScope(context);
    return this.database.transaction(async (tx) => {
      const current = await this.credentials.currentCredential(
        tx,
        tenant,
        input,
        this.config.values.KOKORO_SYSTEM_MODEL_HEALTH_MAX_AGE_MS,
        this.config.values.KOKORO_SYSTEM_ALLOW_LOOPBACK_MODEL_URL,
      );
      if (!current)
        throw new SystemError(
          "MODEL_UNAVAILABLE",
          "Model credential route is not current",
          true,
        );
      const { nonce, auth_tag, ciphertext, ...identity } = current;
      return credentialReadSchema.parse({
        ...identity,
        api_key: this.crypto.decrypt(
          current.provider_id,
          current.secret_handle_ref,
          { nonce, auth_tag, ciphertext },
        ),
      });
    });
  }
}
