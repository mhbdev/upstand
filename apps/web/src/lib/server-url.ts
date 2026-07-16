import { env } from "@upstand/env/web";

const PLACEHOLDER_HOST = /(?:^|\.)example\.invalid$/;

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.startsWith("127.")
  );
}

function parseConfiguredUrl(configured: string): URL | null {
  try {
    return new URL(configured);
  } catch {
    return null;
  }
}

function isConfiguredOrigin(url: URL | null): url is URL {
  return Boolean(url && !PLACEHOLDER_HOST.test(url.hostname));
}

function inferApiOrigin(protocol: string, hostname: string, port = ""): string {
  const apiHostname = hostname.startsWith("app.")
    ? `api.${hostname.slice("app.".length)}`
    : hostname;
  const apiPort = isLoopbackHost(hostname) ? "3000" : port;
  const portSuffix = apiPort ? `:${apiPort}` : "";

  return new URL(`${protocol}//${apiHostname}${portSuffix}`).origin;
}

/** Resolve the API origin at runtime for immutable self-hosted web images. */
export function getServerUrl(configured = env.NEXT_PUBLIC_SERVER_URL): string {
  const configuredUrl = parseConfiguredUrl(configured);

  if (isConfiguredOrigin(configuredUrl)) {
    return configuredUrl.origin;
  }

  if (typeof window !== "undefined") {
    return inferApiOrigin(
      window.location.protocol,
      window.location.hostname,
      window.location.port,
    );
  }

  return "http://localhost:3000";
}

/** Resolve the API origin for a dashboard request rendered on the server. */
export function getServerUrlFromHeaders(
  requestHeaders: Headers,
  configured = env.NEXT_PUBLIC_SERVER_URL,
): string {
  const configuredUrl = parseConfiguredUrl(configured);
  if (isConfiguredOrigin(configuredUrl)) {
    return configuredUrl.origin;
  }

  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = (forwardedHost || requestHeaders.get("host") || "localhost:3001")
    .split(",")[0]
    .trim();
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? `${forwardedProtocol}:`
      : isLoopbackHost(host)
        ? "http:"
        : "https:";

  try {
    const requestUrl = new URL(`${protocol}//${host}`);
    return inferApiOrigin(
      requestUrl.protocol,
      requestUrl.hostname,
      requestUrl.port,
    );
  } catch {
    return "http://localhost:3000";
  }
}

/** Build an absolute URL for an API route. */
export function getServerApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, `${getServerUrl()}/`).toString();
}
