import { SystemError } from "../system.error.js";
export type Precondition =
  Readonly<{ kind: "match"; version: string }> | Readonly<{ kind: "create" }>;
export function parsePrecondition(
  match: string | undefined,
  none: string | undefined,
  allowCreate = false,
): Precondition {
  if (match && none)
    throw new SystemError("INVALID_ARGUMENT", "Conflicting preconditions");
  if (none === "*" && allowCreate) return { kind: "create" };
  if (match && /^"[1-9][0-9]*"$/u.test(match))
    return { kind: "match", version: match.slice(1, -1) };
  if (match || none)
    throw new SystemError("INVALID_ARGUMENT", "Invalid precondition");
  throw new SystemError(
    "PRECONDITION_REQUIRED",
    "A conditional request is required",
  );
}
export function requireVersion(
  actual: string,
  expected: Precondition | null,
): void {
  if (!expected)
    throw new SystemError(
      "PRECONDITION_REQUIRED",
      "A conditional request is required",
    );
  if (expected.kind !== "match" || expected.version !== actual)
    throw new SystemError("VERSION_CONFLICT", "Resource changed");
}
