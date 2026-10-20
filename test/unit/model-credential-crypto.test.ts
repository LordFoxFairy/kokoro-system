import { afterAll, describe, expect, it } from "vitest";
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { ModelCredentialCrypto } from "../../src/modules/model-catalog/model-credential-crypto.js";

const directory = mkdtempSync(join(tmpdir(), "kokoro-model-crypto-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
function material(
  name: string,
  encryption = randomBytes(32),
  hmac = randomBytes(32),
) {
  const path = join(directory, name);
  writeFileSync(
    path,
    JSON.stringify({
      encryption_key: encryption.toString("base64"),
      idempotency_hmac_key: hmac.toString("base64"),
    }),
    { mode: 0o600 },
  );
  return path;
}
const provider = "c27261f1-f4c0-4af4-ab54-5cc5e35928b8";
const reference = "model-key:test-reference";
const apiKey = "fixture-secret-never-persist-plain";
describe("model credential cryptography (no model requests)", () => {
  it("encrypts with fresh nonces and binds both provider and opaque reference", () => {
    const crypto = new ModelCredentialCrypto(material("roundtrip"));
    const sealed = crypto.encrypt(provider, reference, apiKey);
    expect(crypto.decrypt(provider, reference, sealed)).toBe(apiKey);
    expect(crypto.encrypt(provider, reference, apiKey).nonce).not.toEqual(
      sealed.nonce,
    );
    expect(JSON.stringify({ crypto, sealed })).not.toContain(apiKey);
    for (const [id, ref] of [
      ["82fe46c8-bac6-44e9-80ae-b58d7c5bb9ce", reference],
      [provider, "model-key:other"],
    ])
      expect(() => crypto.decrypt(id!, ref!, sealed)).toThrow(
        "Model credentials unavailable",
      );
    const ciphertext = Buffer.from(sealed.ciphertext);
    ciphertext[0] = ciphertext[0]! ^ 1;
    expect(() =>
      crypto.decrypt(provider, reference, { ...sealed, ciphertext }),
    ).toThrow("Model credentials unavailable");
  });
  it("separates stable HMAC identity from encryption material and request key order", () => {
    const hmac = randomBytes(32);
    const a = new ModelCredentialCrypto(
      material("identity-a", randomBytes(32), hmac),
    );
    const b = new ModelCredentialCrypto(
      material("identity-b", randomBytes(32), hmac),
    );
    const input = { api_key: apiKey, actor_tenant: "tenant-a" };
    expect(a.requestDigest(input)).toBe(
      b.requestDigest({ actor_tenant: "tenant-a", api_key: apiKey }),
    );
    expect(a.requestDigest(input)).not.toBe(
      a.requestDigest({ ...input, actor_tenant: "tenant-b" }),
    );
    expect(() =>
      b.decrypt(provider, reference, a.encrypt(provider, reference, apiKey)),
    ).toThrow("Model credentials unavailable");
    expect(JSON.stringify(a)).toBe("{}");
  });
  it("fixes one startup snapshot and rejects unsafe or unavailable material without leaking it", () => {
    const path = material("snapshot");
    const crypto = new ModelCredentialCrypto(path);
    const sealed = crypto.encrypt(provider, reference, apiKey);
    material("snapshot");
    expect(crypto.decrypt(provider, reference, sealed)).toBe(apiKey);
    expect(() =>
      new ModelCredentialCrypto(path).decrypt(provider, reference, sealed),
    ).toThrow("Model credentials unavailable");
    const broad = material("broad");
    chmodSync(broad, 0o644);
    const link = join(directory, "link");
    symlinkSync(path, link);
    for (const value of [undefined, join(directory, "missing"), broad, link])
      expect(() =>
        new ModelCredentialCrypto(value).encrypt(provider, reference, apiKey),
      ).toThrow("Model credentials unavailable");
  });
  it("rejects malformed or shared KEK/HMAC material", () => {
    const key = randomBytes(32);
    const shared = material("shared", key, key);
    const malformed = join(directory, "malformed");
    writeFileSync(malformed, "bad-private-content", { mode: 0o600 });
    for (const path of [shared, malformed]) {
      const crypto = new ModelCredentialCrypto(path);
      expect(() => crypto.requestDigest({ api_key: apiKey })).toThrow(
        "Model credentials unavailable",
      );
      try {
        crypto.encrypt(provider, reference, apiKey);
      } catch (error) {
        expect(String(error)).not.toContain("bad-private-content");
      }
    }
  });
});
