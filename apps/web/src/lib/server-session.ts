import { env } from "@upstand/env/web";
import { headers } from "next/headers";
import type { authClient } from "@/lib/auth-client";

const PLACEHOLDER_HOST = /(?:^|\.)example\.invalid$/;

function resolveApiOrigin(requestHeaders: Headers): string {
  let configured: URL | undefined;
  try {
    configured = new URL(env.NEXT_PUBLIC_SERVER_URL);
  } catch {
    // The web environment is validated in production; keep this helper safe
    // during a partially configured local start.
  }

  if (configured && !PLACEHOLDER_HOST.test(configured.hostname)) {
    return configured.origin;
  }

  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = (forwardedHost || requestHeaders.get("host") || "localhost:3001")
    .split(",")[0]
    .trim();
  const hostname = host.replace(/:\d+$/, "");
  const apiHost = hostname.startsWith("app.")
    ? `api.${hostname.slice("app.".length)}`
    : hostname;
  const forwardedProto = requestHeaders.get("x-forwarded-proto")?.split(",")[0];
  const protocol =
    forwardedProto ||
    (hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https");
  const port =
    hostname === "localhost" || hostname === "127.0.0.1" ? ":3000" : "";
  return `${protocol}://${apiHost}${port}`;
}

/**
 * Fetch the current session from the API while rendering a dashboard route.
 *
 * The dashboard and API are sibling hosts in self-hosted installs. A module
 * level Better Auth client cannot know the incoming dashboard host during SSR,
 * so it would otherwise fall back to the build-time placeholder/localhost and
 * incorrectly redirect authenticated users to /login.
 */
export async function getServerSession(): Promise<
  typeof authClient.$Infer.Session | null
> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");
  const response = await fetch(
    `${resolveApiOrigin(requestHeaders)}/api/auth/get-session`,
    {
      headers: {
        ...(cookie ? { cookie } : {}),
        accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Session request failed with HTTP ${response.status}`);
  }

  return (await response.json()) as typeof authClient.$Infer.Session | null;
}
