import { z } from "zod";

/** Structural URL validation only; HTTP loopback still needs deployment permission. */
export function canonicalModelBaseUrl(value: string): boolean {
  if (/[\s\\?#]/u.test(value) || /%(?:2e|2f|5c)/iu.test(value)) return false;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.hostname.endsWith(".") ||
      /\/\//u.test(url.pathname)
    )
      return false;
    if (
      url.href !== value &&
      !(url.pathname === "/" && url.href === `${value}/`)
    )
      return false;
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    );
  } catch {
    return false;
  }
}
export const connectionSchema = z.strictObject({
  protocol: z.literal("openai_chat_completions"),
  connection_type: z.enum(["direct", "litellm"]),
  base_url: z
    .string()
    .min(1)
    .max(2048)
    .regex(/^https?:\/\/[^\s\\?#]+$/u)
    .refine(
      canonicalModelBaseUrl,
      "Canonical HTTPS API base URL or explicitly permitted HTTP loopback required",
    ),
  secret_handle_ref: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u),
});
