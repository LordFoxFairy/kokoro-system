export function normalizeHost(value: string): string {
  const candidate = value.trim();
  if (
    !candidate ||
    [...candidate].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x20 || code === 0x7f;
    }) ||
    /[/?#@\\]/u.test(candidate)
  )
    throw new Error("host is invalid");
  let parsed: URL;
  try {
    parsed = new URL(`http://${candidate}`);
  } catch {
    throw new Error("host is invalid");
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("host is invalid");
  const host = parsed.hostname.toLowerCase().replace(/\.$/u, "");
  if (!host || host === "*") throw new Error("host is invalid");
  return host;
}
