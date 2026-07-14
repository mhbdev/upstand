import type { GitProvider } from "@upstand/domain";

const REDACTED = "[configured]";

const isSecretKey = (key: string): boolean =>
  /(secret|token|password|private.?key|pem|api.?key)/i.test(key);

const redactValue = (value: unknown, key?: string): unknown => {
  if (key && isSecretKey(key)) {
    if (value === null || value === undefined || value === "") return value;
    return REDACTED;
  }

  if (Array.isArray(value)) return value.map((item) => redactValue(item));

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey),
      ]),
    );
  }

  return value;
};

/**
 * Return provider metadata safe for browser/API responses. OAuth and deploy
 * paths use the repository's decrypted internal entity; this representation
 * intentionally preserves only non-secret settings and configured markers.
 */
export function redactGitProviderConfig(config: string): string {
  try {
    return JSON.stringify(redactValue(JSON.parse(config)));
  } catch {
    return JSON.stringify({});
  }
}

export function redactGitProvider(provider: GitProvider): GitProvider {
  return { ...provider, config: redactGitProviderConfig(provider.config) };
}

/** Merge a browser payload without allowing redacted markers to erase secrets. */
export function restoreGitProviderConfig(
  existingConfig: string,
  incomingConfig: string,
): string {
  try {
    const existing = JSON.parse(existingConfig) as unknown;
    const incoming = JSON.parse(incomingConfig) as unknown;
    const restore = (current: unknown, next: unknown): unknown => {
      if (next === REDACTED) return current;
      if (Array.isArray(next))
        return next.map((item) => restore(undefined, item));
      if (next && typeof next === "object") {
        const currentRecord =
          current && typeof current === "object" && !Array.isArray(current)
            ? (current as Record<string, unknown>)
            : {};
        return Object.fromEntries(
          Object.entries(next).map(([key, value]) => [
            key,
            restore(currentRecord[key], value),
          ]),
        );
      }
      return next;
    };
    return JSON.stringify(restore(existing, incoming));
  } catch {
    return incomingConfig;
  }
}
