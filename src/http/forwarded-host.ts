import { SystemError } from "../system.error.js";
export function forwardedHost(
  forwarded: string | undefined,
  host: string | undefined,
): string {
  if (forwarded !== undefined) {
    if (forwarded.length > 2048)
      throw new SystemError("INVALID_ARGUMENT", "Forwarded too long");
    const first = forwarded.split(",", 1)[0] ?? "";
    const match =
      /(?:^|;)\s*host=(?:"([^"\\]*(?:\\.[^"\\]*)*)"|([^;\s]+))/iu.exec(first);
    const value = match?.[1] ?? match?.[2];
    if (!value?.trim())
      throw new SystemError("INVALID_ARGUMENT", "Invalid Forwarded");
    return value;
  }
  if (!host || host.length > 255)
    throw new SystemError("INVALID_ARGUMENT", "Host required");
  return host;
}
