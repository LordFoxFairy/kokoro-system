import { describe, expect, it, vi } from "vitest";

import { shutdownWithDeadline } from "../src/bootstrap/shutdown.js";

describe("shutdown deadline", () => {
  it("starts every closer and rejects within the total deadline when one hangs", async () => {
    const completed = vi.fn();
    const hanging = vi.fn(() => new Promise<void>(() => undefined));
    const startedAt = Date.now();

    await expect(
      shutdownWithDeadline(
        [
          async () => {
            completed();
          },
          hanging,
        ],
        20,
      ),
    ).rejects.toThrow("shutdown deadline exceeded");

    expect(completed).toHaveBeenCalledOnce();
    expect(hanging).toHaveBeenCalledOnce();
    expect(Date.now() - startedAt).toBeLessThan(250);
  });

  it("waits for every closer when they finish before the deadline", async () => {
    const order: string[] = [];
    await shutdownWithDeadline(
      [
        async () => {
          order.push("pool");
        },
        async () => {
          order.push("redis");
        },
      ],
      100,
    );
    expect(order.sort()).toEqual(["pool", "redis"]);
  });
});
