import { env } from "@upstand/env/web";

const PLACEHOLDER_HOSTS = new Set(["api.example.invalid", "example.invalid"]);

/** Resolve the API origin at runtime for immutable self-hosted web images. */
export function getServerUrl(configured = env.NEXT_PUBLIC_SERVER_URL): string {
  const normalized = configured.replace(/\/$/, "");
  let configuredUrl: URL | null = null;
  try {
    configuredUrl = new URL(normalized);
  } catch {
    // The validated build-time value should be a URL; keep the browser fallback robust.
  }

  if (
    configuredUrl &&
    !PLACEHOLDER_HOSTS.has(configuredUrl.hostname) &&
    !configuredUrl.hostname.endsWith(".example.invalid")
  ) {
    return normalized;
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const apiHost = host.startsWith("app.") ? `api.${host.slice(4)}` : host;
    return `${window.location.protocol}//${apiHost}`;
  }

  return configuredUrl?.hostname === "localhost" ||
    configuredUrl?.hostname === "127.0.0.1"
    ? normalized
    : "http://localhost:3000";
}
