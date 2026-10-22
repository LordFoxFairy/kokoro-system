import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { SystemConfig } from "../../config/system-config.js";
import { requestBudget, withRequestBudget } from "../../http/request-budget.js";
import { SystemError } from "../../system.error.js";
import { ModelCredentialRepository } from "./model-credential.repository.js";
import { ModelCredentialCrypto } from "./model-credential-crypto.js";
import { discoverProviderModels } from "./provider-model-discovery.transport.js";
import { providerModelDiscoverySchema } from "./schemas/provider-model-discovery.schema.js";
@Injectable()
export class ProviderModelDiscoveryService {
  private readonly active = new Set<string>();
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SystemConfig) private readonly config: SystemConfig,
    @Inject(ModelCredentialRepository)
    private readonly credentials: ModelCredentialRepository,
    @Inject(ModelCredentialCrypto)
    private readonly crypto: ModelCredentialCrypto,
  ) {}
  public async list(providerId: string) {
    if (this.active.size >= 8 || this.active.has(providerId))
      throw new SystemError(
        "MODEL_UNAVAILABLE",
        "Provider model discovery is busy",
        true,
      );
    const parent = requestBudget();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const deadline = Math.min(parent?.deadline ?? Infinity, Date.now() + 10000);
    const timeout = setTimeout(cancel, Math.max(0, deadline - Date.now()));
    timeout.unref();
    parent?.signal.addEventListener("abort", cancel, { once: true });
    this.active.add(providerId);
    let running = false;
    try {
      if (parent?.signal.aborted || Date.now() >= deadline) cancel();
      if (controller.signal.aborted)
        throw new SystemError(
          "MODEL_UNAVAILABLE",
          "Provider discovery cancelled",
          true,
        );
      const task = withRequestBudget(
        { signal: controller.signal, deadline },
        async () => {
          const snapshot = await this.database.read((tx) =>
            this.credentials.discoveryCredential(tx, providerId),
          );
          if (!snapshot)
            throw new SystemError("NOT_FOUND", "Provider not found");
          const key = this.crypto.decrypt(
            providerId,
            snapshot.secret_handle_ref,
            snapshot,
          );
          const items = await discoverProviderModels(
            snapshot.base_url,
            key,
            this.config.values.KOKORO_SYSTEM_ALLOW_LOOPBACK_MODEL_URL,
            controller.signal,
            this.config.values.KOKORO_SYSTEM_MODEL_DISCOVERY_PRIVATE_HOSTS,
          );
          const current = await this.database.read((tx) =>
            this.credentials.discoveryCredential(tx, providerId),
          );
          if (!current)
            throw new SystemError("NOT_FOUND", "Provider not found");
          if (controller.signal.aborted)
            throw new SystemError(
              "MODEL_UNAVAILABLE",
              "Provider discovery cancelled",
              true,
            );
          return providerModelDiscoverySchema.parse({
            provider_id: providerId,
            items,
          });
        },
      );
      running = true;
      // A pool acquisition can finish after cancellation. Reject the caller now,
      // but retain its bounded slot until the original task actually settles.
      return await new Promise<Awaited<typeof task>>((resolve, reject) => {
        const abort = () =>
          reject(
            new SystemError(
              "MODEL_UNAVAILABLE",
              "Provider discovery cancelled",
              true,
            ),
          );
        const finish = () => {
          controller.signal.removeEventListener("abort", abort);
          this.active.delete(providerId);
        };
        controller.signal.addEventListener("abort", abort, { once: true });
        void task.then(
          (value) => {
            finish();
            resolve(value);
          },
          (error: unknown) => {
            finish();
            reject(
              error instanceof Error
                ? error
                : new SystemError(
                    "MODEL_UNAVAILABLE",
                    "Provider discovery unavailable",
                    true,
                  ),
            );
          },
        );
        if (controller.signal.aborted) abort();
      });
    } finally {
      clearTimeout(timeout);
      parent?.signal.removeEventListener("abort", cancel);
      if (!running) this.active.delete(providerId);
    }
  }
}
