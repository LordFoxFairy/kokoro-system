export type StructuredLogEntry = Readonly<{
  service: "kokoro-system";
  operation: string;
  request_id: string;
  trace_id: string;
  result: "success" | "error";
  duration_ms: number;
  error_name?: string;
}>;

export interface StructuredLogger {
  write(entry: StructuredLogEntry): void;
}

export const stdoutStructuredLogger: StructuredLogger = {
  write(entry): void {
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  },
};
