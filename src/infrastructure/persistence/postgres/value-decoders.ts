function invalid(name: string): Error {
  return new Error(`invalid PostgreSQL value for ${name}`);
}

export function decodeString(value: unknown, name: string): string {
  if (typeof value !== "string") throw invalid(name);
  return value;
}

export function decodeNullableString(
  value: unknown,
  name: string,
): string | null {
  if (value === null) return null;
  return decodeString(value, name);
}

export function decodeInteger(value: unknown, name: string): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^-?\d+$/u.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(numberValue)) throw invalid(name);
  return numberValue;
}

export function decodeIntegerString(value: unknown, name: string): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value))
    return String(value);
  if (typeof value === "string" && /^-?\d+$/u.test(value)) return value;
  throw invalid(name);
}

export function decodeTimestamp(value: unknown, name: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString();
  if (typeof value === "string") {
    const timestamp = new Date(value);
    if (!Number.isNaN(timestamp.getTime())) return timestamp.toISOString();
  }
  throw invalid(name);
}

export function decodeBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw invalid(name);
  return value;
}

export function decodeJson(value: unknown, name: string): unknown {
  if (typeof value !== "string") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    throw invalid(name);
  }
}

export function decodeObject(
  value: unknown,
  name: string,
): Readonly<Record<string, unknown>> {
  const parsed = decodeJson(value, name);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw invalid(name);
  return Object.fromEntries(Object.entries(parsed));
}

export function decodeStringArray(
  value: unknown,
  name: string,
): readonly string[] {
  const parsed = decodeJson(value, name);
  if (!Array.isArray(parsed)) throw invalid(name);
  return parsed.map((item) => decodeString(item, name));
}

function includes<T extends string>(
  choices: readonly T[],
  candidate: string,
): candidate is T {
  return choices.some((choice) => choice === candidate);
}

export function decodeEnum<T extends string>(
  value: unknown,
  name: string,
  choices: readonly T[],
): T {
  const candidate = decodeString(value, name);
  if (!includes(choices, candidate)) throw invalid(name);
  return candidate;
}
