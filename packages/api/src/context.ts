import type { ServiceScope } from "@circulo-ai/di";
import type { Context as HonoContext } from "hono";
import {
  type ApiKeyPrincipal,
  authenticateApiKey,
  setApiKeyRateLimitHeaders,
} from "./api-key-auth";
import { auth } from "./auth";

export type SessionActor = {
  kind: "session";
  userId: string;
};

export type Actor = SessionActor | ApiKeyPrincipal;

export type CreateContextOptions = {
  context: HonoContext<{
    Bindings: {
      server?: {
        requestIP(request: Request): { address: string } | null;
      };
    };
    Variables: { scope: ServiceScope };
  }>;
};

export type ApiBindings = NonNullable<CreateContextOptions["context"]["env"]>;

export async function createContext({ context }: CreateContextOptions) {
  const authenticatedSession = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  const apiKey = authenticatedSession
    ? null
    : await authenticateApiKey(context.req.raw.headers);
  const actor = authenticatedSession
    ? ({
        kind: "session",
        userId: authenticatedSession.user.id,
      } satisfies SessionActor)
    : apiKey;
  if (apiKey) {
    setApiKeyRateLimitHeaders(apiKey, (name, value) =>
      context.header(name, value),
    );
  }

  // Existing application procedures consume session.user.id for audit and
  // ownership. This compatibility principal is deliberately not a Better
  // Auth session and is only created after API-key verification. Session-only
  // procedures reject it in twoFactorVerifiedProcedure.
  const session =
    authenticatedSession ??
    (apiKey
      ? {
          user: {
            id: apiKey.userId,
            name: apiKey.name || "API key",
            email: "api-key@upstand.invalid",
            emailVerified: true,
            image: null,
            createdAt: new Date(0),
            updatedAt: new Date(0),
            twoFactorEnabled: false,
          },
          session: {
            id: `api-key:${apiKey.keyId}`,
            userId: apiKey.userId,
            token: "api-key",
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            updatedAt: new Date(),
            ipAddress: null,
            userAgent: null,
          },
        }
      : null);

  // Retrieve request-scoped container from Hono context
  const scope = context.get("scope");

  return {
    auth: null,
    session,
    actor,
    scope,
    honoContext: context,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
