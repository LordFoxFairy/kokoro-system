import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { commandDigest } from "../../database/command-digest.js";
import { SystemError } from "../../system.error.js";

export type SealedModelCredential = {
  nonce: Buffer;
  auth_tag: Buffer;
  ciphertext: Buffer;
};
const unavailable = () =>
  new SystemError("SYSTEM_UNAVAILABLE", "Model credentials unavailable", true);
const materialSchema = z.strictObject({
  encryption_key: z.string(),
  idempotency_hmac_key: z.string(),
});
function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value)
    throw unavailable();
  return key;
}
function readMaterial(path: string): { encryption: Buffer; hmac: Buffer } {
  if (!isAbsolute(path)) throw unavailable();
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.nlink !== 1 ||
      before.uid !== process.getuid?.() ||
      ![0o400, 0o600].includes(before.mode & 0o777) ||
      before.size < 1 ||
      before.size > 4096
    )
      throw unavailable();
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      bytes.length !== before.size ||
      [
        "dev",
        "ino",
        "uid",
        "gid",
        "nlink",
        "mode",
        "size",
        "mtimeMs",
        "ctimeMs",
      ].some(
        (key) =>
          before[key as keyof typeof before] !==
          after[key as keyof typeof after],
      )
    )
      throw unavailable();
    const input = materialSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    const encryption = decodeKey(input.encryption_key),
      hmac = decodeKey(input.idempotency_hmac_key);
    if (timingSafeEqual(encryption, hmac)) throw unavailable();
    return { encryption, hmac };
  } finally {
    closeSync(descriptor);
  }
}
/** Fixed startup snapshot. No secret material is enumerable or returned by a diagnostic. */
export class ModelCredentialCrypto {
  readonly #material: { encryption: Buffer; hmac: Buffer } | null;
  public constructor(path?: string) {
    try {
      this.#material = path === undefined ? null : readMaterial(path);
    } catch {
      this.#material = null;
    }
  }
  public requestDigest(input: unknown): string {
    if (this.#material === null) throw unavailable();
    return createHmac("sha256", this.#material.hmac)
      .update("kokoro:model-provider:create:v1\0")
      .update(commandDigest(input))
      .digest("hex");
  }
  public encrypt(
    provider: string,
    reference: string,
    apiKey: string,
  ): SealedModelCredential {
    if (this.#material === null) throw unavailable();
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.#material.encryption, nonce);
    cipher.setAAD(
      Buffer.from(JSON.stringify(["kokoro:model-key:v1", provider, reference])),
    );
    const ciphertext = Buffer.concat([
      cipher.update(apiKey, "utf8"),
      cipher.final(),
    ]);
    return { nonce, auth_tag: cipher.getAuthTag(), ciphertext };
  }
  public decrypt(
    provider: string,
    reference: string,
    sealed: SealedModelCredential,
  ): string {
    if (this.#material === null) throw unavailable();
    try {
      if (
        sealed.nonce.length !== 12 ||
        sealed.auth_tag.length !== 16 ||
        sealed.ciphertext.length < 1 ||
        sealed.ciphertext.length > 4096
      )
        throw unavailable();
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.#material.encryption,
        sealed.nonce,
      );
      decipher.setAAD(
        Buffer.from(
          JSON.stringify(["kokoro:model-key:v1", provider, reference]),
        ),
      );
      decipher.setAuthTag(sealed.auth_tag);
      return new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]),
      );
    } catch {
      throw unavailable();
    }
  }
}
