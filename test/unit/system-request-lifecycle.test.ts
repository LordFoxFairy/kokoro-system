import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { expect, it, vi } from "vitest";
import { requestLifecycle } from "../../src/http/request-lifecycle.middleware.js";
it("logs disconnected requests once without credentials or payload", () => {
  const write = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  try {
    const request = Object.assign(new EventEmitter(), {
      headers: { "x-request-id": "cancel-test", authorization: "secret-token" },
      path: "/private",
      body: { secret: "payload" },
    });
    const headers = new Map<string, unknown>();
    const response = Object.assign(new EventEmitter(), {
      writableFinished: false,
      statusCode: 200,
      setHeader: (key: string, value: unknown) => headers.set(key, value),
      getHeader: (key: string) => headers.get(key),
    });
    requestLifecycle(1000)(
      request as unknown as Request,
      response as unknown as Response,
      () => undefined,
    );
    response.emit("close");
    response.emit("finish");
    expect(write).toHaveBeenCalledTimes(1);
    const logged = String(write.mock.calls[0]?.[0]);
    expect(JSON.parse(logged)).toMatchObject({
      request_id: "cancel-test",
      result: "cancelled",
    });
    expect(logged).not.toContain("secret");
    expect(logged).not.toContain("payload");
  } finally {
    write.mockRestore();
  }
});
