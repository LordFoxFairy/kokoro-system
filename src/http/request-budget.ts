import { AsyncLocalStorage } from "node:async_hooks";
const storage = new AsyncLocalStorage<
  Readonly<{ signal: AbortSignal; deadline: number }>
>();
export function requestBudget() {
  return storage.getStore();
}
export function withRequestBudget<T>(
  budget: Readonly<{ signal: AbortSignal; deadline: number }>,
  run: () => T,
): T {
  return storage.run(budget, run);
}
