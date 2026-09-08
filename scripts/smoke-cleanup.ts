/** Cleanup failures must never suppress later independent resource cleanup. */
export async function runCleanup(
  steps: readonly (() => unknown)[],
): Promise<void> {
  const failures: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "System smoke cleanup failed");
}
