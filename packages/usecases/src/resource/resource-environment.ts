import {
  decryptSecret,
  encryptSecret,
} from "@upstand/platform/crypto/secret-box";
import yaml from "yaml";
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

export function extractAndParametrizeEnvVars(composeFile: string): {
  composeFile: string;
  envVars: Record<string, string>;
} {
  const envVars: Record<string, string> = {};
  let parsed: any;
  try {
    parsed = yaml.parse(composeFile);
  } catch {
    return { composeFile, envVars };
  }

  if (parsed && typeof parsed === "object" && parsed.services) {
    const services = parsed.services;
    for (const serviceName of Object.keys(services)) {
      const service = services[serviceName];
      if (service && typeof service === "object" && service.environment) {
        const environment = service.environment;
        if (Array.isArray(environment)) {
          const newEnvList: string[] = [];
          for (const item of environment) {
            if (typeof item === "string") {
              const index = item.indexOf("=");
              if (index > -1) {
                const key = item.slice(0, index).trim();
                const val = item.slice(index + 1).trim();
                if (key) {
                  envVars[key] = val;
                  newEnvList.push(`${key}=\${${key}}`);
                }
              } else {
                const key = item.trim();
                if (key) {
                  envVars[key] = "";
                  newEnvList.push(`${key}=\${${key}}`);
                }
              }
            } else {
              newEnvList.push(item);
            }
          }
          service.environment = newEnvList;
        } else if (typeof environment === "object") {
          const newEnvObj: Record<string, string> = {};
          for (const [key, value] of Object.entries(environment)) {
            const normalizedKey = key.trim();
            if (normalizedKey) {
              envVars[normalizedKey] =
                value !== null && value !== undefined
                  ? String(value).trim()
                  : "";
              newEnvObj[normalizedKey] = `\${${normalizedKey}}`;
            }
          }
          service.environment = newEnvObj;
        }
      }
    }
    composeFile = yaml.stringify(parsed);
  }

  return { composeFile, envVars };
}
