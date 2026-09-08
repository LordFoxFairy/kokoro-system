export function lifecycleLog(
  input: Readonly<{
    operation: string;
    requestId: string;
    traceId?: string;
    result: string;
    durationMs: number;
    count?: number;
  }>,
): void {
  process.stdout.write(
    `${JSON.stringify({ service: "kokoro-system", pid: process.pid, operation: input.operation, request_id: input.requestId, trace_id: input.traceId ?? input.requestId, result: input.result, duration_ms: Math.max(0, input.durationMs), ...(input.count === undefined ? {} : { count: input.count }) })}\n`,
  );
}
