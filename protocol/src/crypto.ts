import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";
import type { EncryptedEnvelope } from "./schema.js";

function b64url(input: Buffer): string { return input.toString("base64url"); }
function fromB64url(input: string): Buffer { return Buffer.from(input, "base64url"); }

export function createEd25519Identity(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: b64url(publicKey.export({ type: "spki", format: "der" }) as Buffer),
    privateKey: b64url(privateKey.export({ type: "pkcs8", format: "der" }) as Buffer),
  };
}

export function signWithEd25519(privateKey: string, message: Uint8Array | string): string {
  const key = createPrivateKey({ key: fromB64url(privateKey), type: "pkcs8", format: "der" });
  const data = typeof message === "string" ? Buffer.from(message, "utf8") : Buffer.from(message);
  return b64url(nodeSign(null, data, key));
}

export function verifyWithEd25519(publicKey: string, message: Uint8Array | string, signature: string): boolean {
  const key = createPublicKey({ key: fromB64url(publicKey), type: "spki", format: "der" });
  const data = typeof message === "string" ? Buffer.from(message, "utf8") : Buffer.from(message);
  return nodeVerify(null, data, key, fromB64url(signature));
}

export function encryptJson(value: unknown, passphrase: string): EncryptedEnvelope {
  if (passphrase.length < 8) throw new Error("Passphrase must be at least 8 characters.");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  key.fill(0);
  return { algorithm: "aes-256-gcm", kdf: "scrypt", salt: b64url(salt), iv: b64url(iv), tag: b64url(tag), ciphertext: b64url(ciphertext) };
}

export function decryptJson<T>(envelope: EncryptedEnvelope, passphrase: string): T {
  try {
    const key = scryptSync(passphrase, fromB64url(envelope.salt), 32);
    const decipher = createDecipheriv("aes-256-gcm", key, fromB64url(envelope.iv));
    decipher.setAuthTag(fromB64url(envelope.tag));
    const plaintext = Buffer.concat([decipher.update(fromB64url(envelope.ciphertext)), decipher.final()]);
    key.fill(0);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    throw new Error("Unable to decrypt SSA capsule. The passphrase may be wrong or the capsule may be corrupted.");
  }
}
