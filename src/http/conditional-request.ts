import { OwnerError } from "./owner-error.js";
export type Precondition =
  Readonly<{ kind: "match"; version: string }> | Readonly<{ kind: "create" }>;
export function parsePrecondition(
  match: string | undefined,
  none: string | undefined,
  allowCreate = false,
): Precondition {
  if (match && none)
    throw new OwnerError("INVALID_ARGUMENT", "Conflicting preconditions");
  if (none === "*" && allowCreate) return { kind: "create" };
  if (match && /^"[1-9][0-9]*"$/u.test(match))
    return { kind: "match", version: match.slice(1, -1) };
  if (match || none)
    throw new OwnerError("INVALID_ARGUMENT", "Invalid precondition");
  throw new OwnerError(
    "PRECONDITION_REQUIRED",
    "A conditional request is required",
    428,
  );
}
export function requireVersion(
  actual: string,
  expected: Precondition | null,
): void {
  if (!expected)
    throw new OwnerError(
      "PRECONDITION_REQUIRED",
      "A conditional request is required",
      428,
    );
  if (expected.kind !== "match" || expected.version !== actual)
    throw new OwnerError("VERSION_CONFLICT", "Resource changed", 409);
}
