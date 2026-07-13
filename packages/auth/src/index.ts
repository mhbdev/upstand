import { randomUUID } from "node:crypto";
import { apiKey } from "@better-auth/api-key";
import { createDb } from "@upstand/db";
import * as schema from "@upstand/db/schema/auth";
import { notificationChannel } from "@upstand/db/schema/notification";
import { NotificationChannelSchema } from "@upstand/domain";
import { env } from "@upstand/env/server";
import { redis } from "@upstand/redis";
import {
  decryptNotificationConfiguration,
  NotificationTransportRegistry,
} from "@upstand/usecases";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { twoFactor } from "better-auth/plugins/two-factor";
import { count, eq } from "drizzle-orm";

const memberPermissionField = {
  type: "string",
  required: false,
} as const;

function getSharedCookieDomain(): string | undefined {
  const dashboardHost = new URL(env.CORS_ORIGIN).hostname;
  const apiHost = new URL(env.BETTER_AUTH_URL).hostname;
  if (dashboardHost === apiHost) return undefined;

  // Protected pages are rendered by the dashboard hostname while sessions are
  // issued by the API hostname. Only sibling subdomains may share a cookie.
  const domain = dashboardHost.split(".").slice(1).join(".");
  return domain && apiHost.endsWith(`.${domain}`) ? domain : undefined;
}

const organizationStatement = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
  apiKey: ["create", "read", "update", "delete"],
} as const;

const organizationAccessControl = createAccessControl(organizationStatement);
const organizationRoles = {
  owner: organizationAccessControl.newRole({
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    team: ["create", "update", "delete"],
    ac: ["create", "read", "update", "delete"],
    apiKey: ["create", "read", "update", "delete"],
  }),
  admin: organizationAccessControl.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    team: ["create", "update", "delete"],
    ac: ["create", "read", "update", "delete"],
    apiKey: ["create", "read", "update", "delete"],
  }),
  member: organizationAccessControl.newRole({
    organization: [],
    member: [],
    invitation: [],
    team: [],
    ac: ["read"],
    apiKey: [],
  }),
};

export function createAuth() {
  const db = createDb();
  const sharedCookieDomain = getSharedCookieDomain();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN, env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
    },
    user: {
      // Admin-created members still use Better Auth's normal credential
      // account and can sign in immediately with the password they were given.
      additionalFields: {},
    },
    socialProviders: {
      google:
        env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
          ? {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            }
          : undefined,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    session: {
      // Keep sessions short-lived and rotate the token on a daily activity
      // boundary. Database persistence provides recovery if Redis is rebuilt.
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      storeSessionInDatabase: true,
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      crossSubDomainCookies: sharedCookieDomain
        ? {
            enabled: true,
            domain: sharedCookieDomain,
          }
        : undefined,
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        httpOnly: true,
      },
    },
    rateLimit: {
      enabled: true,
      window: 10,
      max: 100,
      storage: "secondary-storage",
    },
    secondaryStorage: {
      get: async (key: string) => {
        return (await redis.get(key)) || null;
      },
      set: async (key: string, value: string, ttl?: number) => {
        if (ttl) {
          await redis.set(key, value, "EX", ttl);
        } else {
          await redis.set(key, value);
        }
      },
      delete: async (key: string) => {
        await redis.del(key);
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            const orgId = randomUUID();
            const slug = `personal-${user.id.slice(0, 8)}`;

            await db.transaction(async (tx) => {
              // 1. Create the Personal Organization
              await tx.insert(schema.organization).values({
                id: orgId,
                name: "Personal Organization",
                slug: slug,
                createdAt: new Date(),
                metadata: JSON.stringify({ isPersonal: true }),
              });

              // 2. Assign the user as the owner of the organization
              await tx.insert(schema.member).values({
                id: randomUUID(),
                organizationId: orgId,
                userId: user.id,
                role: "owner",
                createdAt: new Date(),
              });
            });
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path.endsWith("/two-factor/verify-totp")) {
          if (!ctx.request) return;
          const res = ctx.context.returned;
          const hasReturnedError =
            typeof res === "object" &&
            res !== null &&
            "error" in res &&
            Boolean((res as { error?: unknown }).error);
          const isSuccess =
            !res || (res instanceof Response ? res.ok : !hasReturnedError);
          if (isSuccess) {
            const session = await auth.api.getSession({
              headers: ctx.request.headers,
            });
            if (session) {
              await redis.set(
                `2fa-verified:${session.session.id}`,
                "true",
                "EX",
                60 * 60 * 24 * 30, // 30 days
              );
            }
          }
        }
      }),
      before: createAuthMiddleware(async (ctx) => {
        // A fresh self-hosted installation has no external identity provider to
        // bootstrap an administrator. Permit exactly that first email/password
        // account, then make the instance sign-in only. The database trigger in
        // migration 0015 is the race-safe enforcement; this hook returns a
        // useful API error before the database has to reject the request.
        if (ctx.path.endsWith("/sign-up/email")) {
          const result = await db.select({ value: count() }).from(schema.user);
          const userCount = result[0]?.value ?? 0;

          if (userCount > 0) {
            return {
              response: new Response(
                JSON.stringify({
                  error:
                    "This Upstand instance has already been configured. Sign in with the owner account.",
                }),
                {
                  status: 403,
                  headers: { "content-type": "application/json" },
                },
              ),
            };
          }
        }

        if (ctx.path.startsWith("/organization/delete")) {
          if (!ctx.request) return;
          const body = (await ctx.request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >;
          const organizationId = body.organizationId as string | undefined;
          if (!organizationId) return;

          const org = await db
            .select()
            .from(schema.organization)
            .where(eq(schema.organization.id, organizationId))
            .limit(1)
            .then((r) => r[0]);

          if (org?.metadata) {
            try {
              const metadata = JSON.parse(org.metadata);
              if (metadata.isPersonal) {
                return {
                  response: new Response(
                    JSON.stringify({
                      error: "Cannot delete personal organization",
                    }),
                    {
                      status: 400,
                      headers: { "content-type": "application/json" },
                    },
                  ),
                };
              }
            } catch (_) {}
          }
        }
      }),
    },
    plugins: [
      admin(),
      organization({
        ac: organizationAccessControl,
        roles: organizationRoles,
        schema: {
          member: {
            additionalFields: { permissions: memberPermissionField },
          },
          invitation: {
            additionalFields: {
              permissions: memberPermissionField,
              emailChannelId: { type: "string", required: false },
            },
          },
        },
        sendInvitationEmail: async ({
          id,
          email,
          role,
          organization,
          invitation,
        }) => {
          const channelId = (invitation as Record<string, unknown>)
            .emailChannelId as string | undefined;
          if (!channelId) return;
          const channel = await db
            .select()
            .from(notificationChannel)
            .where(eq(notificationChannel.id, channelId))
            .limit(1)
            .then((rows) => rows[0]);
          if (!channel || channel.organizationId !== organization.id) {
            throw new Error("Invitation email provider was not found");
          }
          if (channel.provider !== "email" && channel.provider !== "resend") {
            throw new Error(
              "Invitation email provider must be Email or Resend",
            );
          }
          const configuration = decryptNotificationConfiguration(
            NotificationChannelSchema.parse(channel),
          );
          const recipientConfiguration =
            configuration.type === "email" || configuration.type === "resend"
              ? { ...configuration, toAddresses: [email] }
              : configuration;
          const url = `${env.CORS_ORIGIN}/invitation?token=${encodeURIComponent(id)}`;
          await new NotificationTransportRegistry().send(
            recipientConfiguration,
            {
              title: `Invitation to join ${organization.name}`,
              message: `You have been invited to join ${organization.name} as ${role}.\n\nAccept your invitation: ${url}`,
            },
          );
        },
        organizationHooks: {
          afterAcceptInvitation: async ({ invitation, member }) => {
            if (invitation.permissions) {
              await db
                .update(schema.member)
                .set({ permissions: invitation.permissions })
                .where(eq(schema.member.id, member.id));
            }
          },
        },
      }),
      apiKey({
        configId: "upstand",
        references: "organization",
        defaultPrefix: "upk_",
        defaultKeyLength: 48,
        requireName: true,
        minimumNameLength: 1,
        maximumNameLength: 120,
        startingCharactersConfig: {
          shouldStore: true,
          charactersLength: 12,
        },
        enableMetadata: true,
        keyExpiration: {
          defaultExpiresIn: 90 * 24 * 60 * 60 * 1000,
          minExpiresIn: 1,
          maxExpiresIn: 365,
        },
        rateLimit: {
          enabled: true,
          timeWindow: 60 * 60 * 1000,
          maxRequests: 1_000,
        },
        storage: "secondary-storage",
        fallbackToDatabase: true,
        customAPIKeyGetter: (ctx) => {
          if (!ctx.request) return null;
          const explicit = ctx.request.headers.get("x-api-key")?.trim();
          if (explicit) return explicit;
          const authorization = ctx.request.headers.get("authorization") || "";
          return authorization.startsWith("Bearer ")
            ? authorization.slice("Bearer ".length).trim() || null
            : null;
        },
      }),
      twoFactor({
        issuer: "Upstand",
        allowPasswordless: true,
      }),
    ],
  });
}

export const auth = createAuth();
