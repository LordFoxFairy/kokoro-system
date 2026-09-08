import { randomUUID } from "node:crypto";
import { startSystem } from "./start-system.js";
import { lifecycleLog } from "./http/structured-logger.js";
try {
  const running = await startSystem(process.env);
  const shutdown = (): void => {
    void running
      .close()
      .then((result) => {
        if (result.forced) process.exitCode = 1;
      })
      .catch(() => {
        process.exitCode = 1;
      });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch {
  lifecycleLog({
    operation: "service.start",
    requestId: randomUUID(),
    result: "error",
    durationMs: 0,
  });
  process.exitCode = 1;
}
