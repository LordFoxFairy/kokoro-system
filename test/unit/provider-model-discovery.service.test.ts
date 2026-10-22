import { createServer } from "node:http";
import { once } from "node:events";
import dns from "node:dns/promises";
import { setImmediate as immediate } from "node:timers/promises";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderModelDiscoveryService } from "../../src/modules/model-catalog/provider-model-discovery.service.js";
import {
  requestBudget,
  withRequestBudget,
} from "../../src/http/request-budget.js";
import { SystemConfig } from "../../src/config/system-config.js";
import type { DatabaseService } from "../../src/database/database.service.js";
import type { TransactionContext } from "../../src/database/transaction-context.js";
import type { ModelCredentialRepository } from "../../src/modules/model-catalog/model-credential.repository.js";
import type { ModelCredentialCrypto } from "../../src/modules/model-catalog/model-credential-crypto.js";
const peers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const peer of peers.splice(0)) {
    peer.closeAllConnections();
    await new Promise<void>((resolve) => peer.close(() => resolve()));
  }
});
async function setup(
  stallFinalRead: boolean | "held" = false,
  dnsHost = false,
) {
  let sends = 0;
  const peer = createServer((_request, response) => {
    sends++;
    response.setHeader("content-type", "application/json");
    response.end('{"data":[]}');
  });
  peers.push(peer);
  peer.listen(0, "127.0.0.1");
  await once(peer, "listening");
  const address = peer.address();
  if (!address || typeof address === "string")
    throw Error("Missing fixture port");
  const budgets: ReturnType<typeof requestBudget>[] = [];
  let unblock: (() => void) | undefined;
  const database = {
    read: async <T>(
      work: (tx: TransactionContext) => Promise<T>,
    ): Promise<T> => {
      const budget = requestBudget();
      budgets.push(budget);
      if (stallFinalRead === "held" && budgets.length === 2)
        await new Promise<void>((resolve) => {
          unblock = resolve;
        });
      else if (stallFinalRead && budgets.length === 2)
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(resolve, 2000);
          budget?.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timeout);
              reject(new Error("fixture database cancelled"));
            },
            { once: true },
          );
        });
      return work({} as TransactionContext);
    },
  } as unknown as DatabaseService;
  const credentials = {
    discoveryCredential: () =>
      Promise.resolve({
        base_url: `http://${dnsHost ? "localhost" : "127.0.0.1"}:${address.port}/v1`,
        secret_handle_ref: "fixture-ref",
      }),
  } as unknown as ModelCredentialRepository;
  const crypto = {
    decrypt: () => "fixture-key",
  } as unknown as ModelCredentialCrypto;
  const config = new SystemConfig({
    DATABASE_URL: "postgresql://localhost/fixture?schema=fixture",
    REDIS_URL: "redis://localhost/6",
    KOKORO_SYSTEM_BFF_SERVICE_TOKEN: "fixture-bff-token",
    KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "fixture-agent-token",
    KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: "fixture-admin-token",
    KOKORO_SYSTEM_ALLOW_LOOPBACK_MODEL_URL: "true",
  });
  return {
    service: new ProviderModelDiscoveryService(
      database,
      config,
      credentials,
      crypto,
    ),
    budgets,
    sends: () => sends,
    unblock: () => unblock?.(),
  };
}
it("bounds both initial and final database reads to the same inner ten-second budget", async () => {
  const fixture = await setup(),
    parent = new AbortController(),
    started = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(started);
  await withRequestBudget(
    { signal: parent.signal, deadline: started + 60000 },
    () => fixture.service.list("10000000-0000-4000-8000-000000000001"),
  );
  expect(fixture.budgets).toHaveLength(2);
  for (const budget of fixture.budgets) {
    expect(budget?.deadline).toBeLessThanOrEqual(started + 10000);
    expect(budget?.signal).not.toBe(parent.signal);
  }
  expect(fixture.budgets[0]?.signal).toBe(fixture.budgets[1]?.signal);
  expect(fixture.budgets[0]?.deadline).toBe(fixture.budgets[1]?.deadline);
});
it("cancels the final database recheck at the shared deadline rather than waiting and returning late", async () => {
  const fixture = await setup(true),
    parent = new AbortController(),
    started = Date.now();
  await expect(
    withRequestBudget({ signal: parent.signal, deadline: started + 100 }, () =>
      fixture.service.list("10000000-0000-4000-8000-000000000001"),
    ),
  ).rejects.toThrow();
  expect(Date.now() - started).toBeLessThan(500);
  expect(fixture.sends()).toBe(1);
});
it("does not read credentials or send when the parent deadline has already elapsed", async () => {
  const fixture = await setup();
  await expect(
    withRequestBudget(
      { signal: new AbortController().signal, deadline: Date.now() - 1 },
      () => fixture.service.list("10000000-0000-4000-8000-000000000001"),
    ),
  ).rejects.toThrow();
  expect(fixture.budgets).toHaveLength(0);
  expect(fixture.sends()).toBe(0);
});

it("rejects on budget while a non-cancellable pool wait remains bounded by its original active slot", async () => {
  const fixture = await setup("held"),
    id = "10000000-0000-4000-8000-000000000001";
  const pending = withRequestBudget(
    { signal: new AbortController().signal, deadline: Date.now() + 100 },
    () => fixture.service.list(id),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observed = await Promise.race([
    pending.then(
      () => "returned",
      () => "deadline",
    ),
    new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve("late"), 500);
    }),
  ]);
  try {
    expect(observed).toBe("deadline");
    await expect(fixture.service.list(id)).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
      retryable: true,
    });
    expect(fixture.sends()).toBe(1);
  } finally {
    clearTimeout(timer);
    fixture.unblock();
    await pending.catch(() => undefined);
  }
});

it("keeps a cancelled provider slot until physical DNS settles, with no late socket", async () => {
  const fixture = await setup(false, true);
  const releases: ((value: Awaited<ReturnType<typeof dns.lookup>>) => void)[] =
    [];
  const resolver = vi.spyOn(dns, "lookup").mockImplementation(
    () =>
      new Promise<Awaited<ReturnType<typeof dns.lookup>>>((resolve) => {
        releases.push(resolve);
      }),
  );
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      await expect(
        withRequestBudget(
          { signal: new AbortController().signal, deadline: Date.now() + 20 },
          () => fixture.service.list("10000000-0000-4000-8000-000000000001"),
        ),
      ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE", retryable: true });
      await immediate();
    }
    expect(resolver).toHaveBeenCalledTimes(1);
  } finally {
    for (const release of releases)
      release([{ address: "127.0.0.1", family: 4 }] as unknown as Awaited<
        ReturnType<typeof dns.lookup>
      >);
    await immediate();
  }
  expect(fixture.sends()).toBe(0);
});
it("keeps at most eight physical DNS lookups across cancelled distinct providers", async () => {
  const fixture = await setup(false, true);
  const releases: ((value: Awaited<ReturnType<typeof dns.lookup>>) => void)[] =
    [];
  const resolver = vi.spyOn(dns, "lookup").mockImplementation(
    () =>
      new Promise<Awaited<ReturnType<typeof dns.lookup>>>((resolve) => {
        releases.push(resolve);
      }),
  );
  try {
    for (let attempt = 0; attempt < 12; attempt++) {
      const id = `10000000-0000-4000-8000-${String(attempt + 1).padStart(12, "0")}`;
      await expect(
        withRequestBudget(
          { signal: new AbortController().signal, deadline: Date.now() + 20 },
          () => fixture.service.list(id),
        ),
      ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE", retryable: true });
      await immediate();
    }
    expect(resolver).toHaveBeenCalledTimes(8);
  } finally {
    for (const release of releases)
      release([{ address: "127.0.0.1", family: 4 }] as unknown as Awaited<
        ReturnType<typeof dns.lookup>
      >);
    await immediate();
  }
  expect(fixture.sends()).toBe(0);
});
