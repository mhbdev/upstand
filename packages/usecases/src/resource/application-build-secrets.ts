import type { Resource } from "@upstand/domain";
import {
  decryptSecret,
  type EncryptedPayload,
} from "@upstand/platform/crypto/secret-box";

export function getApplicationBuildSecrets(
  resource: Resource,
): Record<string, string> {
  if (!resource.buildSecrets) return {};
  try {
    const payload = JSON.parse(resource.buildSecrets) as Record<
      string,
      unknown
    >;
    const serialized =
      typeof payload.ciphertext === "string" &&
      typeof payload.iv === "string" &&
      typeof payload.authTag === "string"
        ? decryptSecret(payload as unknown as EncryptedPayload)
        : resource.buildSecrets;
    const parsed = JSON.parse(serialized) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "string"),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}
