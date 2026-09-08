import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleInit, OnApplicationShutdown } from "@nestjs/common";
import { createClient } from "redis";
import { SystemConfig } from "../config/system-config.js";
@Injectable()
export class CacheService implements OnModuleInit, OnApplicationShutdown {
  private readonly client: ReturnType<typeof createClient>;
  public readonly namespace: string;
  public constructor(@Inject(SystemConfig) config: SystemConfig) {
    this.namespace = config.values.KOKORO_SYSTEM_REDIS_NAMESPACE;
    this.client = createClient({
      url: config.values.REDIS_URL,
      socket: {
        connectTimeout: 3000,
        reconnectStrategy: (attempts) =>
          attempts < 3 ? Math.min(100 * 2 ** attempts, 1000) : false,
      },
    });
    this.client.on("error", () => {
      /* dependency operations expose sanitized failures */
    });
  }
  public async onModuleInit(): Promise<void> {
    await this.client.connect();
  }
  public async ready(): Promise<boolean> {
    return (
      (await this.client
        .withCommandOptions({ abortSignal: AbortSignal.timeout(2000) })
        .ping()) === "PONG"
    );
  }
  public async get(key: string): Promise<string | null> {
    return this.client
      .withCommandOptions({ abortSignal: AbortSignal.timeout(2000) })
      .get(`${this.namespace}:${key}`);
  }
  public async set(key: string, value: string, seconds = 30): Promise<void> {
    await this.client
      .withCommandOptions({ abortSignal: AbortSignal.timeout(2000) })
      .set(`${this.namespace}:${key}`, value, { EX: seconds });
  }
  public async remove(key: string): Promise<void> {
    await this.client
      .withCommandOptions({ abortSignal: AbortSignal.timeout(2000) })
      .del(`${this.namespace}:${key}`);
  }
  public async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) this.client.destroy();
  }
}
