export type Closer = () => Promise<void>;

export async function shutdownWithDeadline(
  closers: readonly Closer[],
  deadlineMs: number,
): Promise<void> {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1)
    throw new Error("shutdown deadline must be a positive integer");

  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("shutdown deadline exceeded")),
      deadlineMs,
    );
    timer.unref();
  });

  try {
    await Promise.race([
      Promise.all(closers.map(async (close) => close())),
      deadline,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
