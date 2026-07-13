import {
  createCipheriv,
  createDecipheriv,
  randomBytes as cryptoRandomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const CURRENT_KEY_VERSION = 1;

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function getMasterKey(keyVersion: number): Buffer {
  const raw = process.env[`SSH_KEY_ENCRYPTION_KEY_V${keyVersion}`];
  if (!raw) throw new Error(`Missing encryption key for version ${keyVersion}`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32)
    throw new Error("Encryption key must be 32 bytes, base64-encoded");
  return key;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = getMasterKey(CURRENT_KEY_VERSION);
  const iv = cryptoRandomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = getMasterKey(payload.keyVersion);
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
