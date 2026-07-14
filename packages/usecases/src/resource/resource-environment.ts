import {
  decryptSecret,
  encryptSecret,
} from "@upstand/platform/crypto/secret-box";
import { z } from "zod";

export const ResourceEnvironmentVariablesSchema = z.record(
  z.string().trim().min(1).max(256),
  z.string().max(16_384),
);

type EncryptedResourceEnvironment = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

function isEncryptedResourceEnvironment(
  value: unknown,
): value is EncryptedResourceEnvironment {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.ciphertext === "string" &&
    typeof candidate.iv === "string" &&
    typeof candidate.authTag === "string" &&
    typeof candidate.keyVersion === "number"
  );
}

function parseEnvironmentObject(value: unknown): Record<string, string> {
  const parsed = ResourceEnvironmentVariablesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/**
 * Environment variables are encrypted as one authenticated document. The
 * decoder intentionally accepts legacy plaintext JSON so existing rows remain
 * deployable and are upgraded the next time they are written.
 */
export function parseResourceEnvironmentVariables(
  value: string | null | undefined,
): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isEncryptedResourceEnvironment(parsed)) {
      return parseEnvironmentObject(JSON.parse(decryptSecret(parsed)));
    }
    return parseEnvironmentObject(parsed);
  } catch {
    return {};
  }
}

export function serializeResourceEnvironmentVariables(
  value: string | Record<string, string> | null | undefined,
): string {
  let variables: Record<string, string>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isEncryptedResourceEnvironment(parsed)) return value;
      variables = parseEnvironmentObject(parsed);
    } catch {
      variables = {};
    }
  } else {
    variables = parseEnvironmentObject(value ?? {});
  }
  return JSON.stringify(encryptSecret(JSON.stringify(variables)));
}
