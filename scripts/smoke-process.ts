import { setTimeout as delay } from "node:timers/promises";
function signalGroup(pgid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pgid, signal);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    )
      return false;
    throw error;
  }
}
/** Only call for a detached process group created by this smoke invocation. */
export async function stopOwnedProcessGroup(pgid: number): Promise<void> {
  if (!Number.isSafeInteger(pgid) || pgid <= 1)
    throw new Error("Invalid owned process group");
  if (!signalGroup(pgid, "SIGTERM")) return;
  let deadline = Date.now() + 2500;
  while (signalGroup(pgid, 0) && Date.now() < deadline) await delay(25);
  if (!signalGroup(pgid, 0)) return;
  signalGroup(pgid, "SIGKILL");
  deadline = Date.now() + 2500;
  while (signalGroup(pgid, 0) && Date.now() < deadline) await delay(25);
  if (signalGroup(pgid, 0))
    throw new Error("Owned process group did not terminate");
}
