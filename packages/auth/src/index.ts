import { randomUUID } from "node:crypto";
import { apiKey } from "@better-auth/api-key";
import { sso } from "@better-auth/sso";
import { createDb } from "@upstand/db";
import * as schema from "@upstand/db/schema/auth";
import { notificationChannel } from "@upstand/db/schema/notification";
import {
  NotificationChannelSchema,
  ORGANIZATION_ROLE_STATEMENTS,
  ORGANIZATION_STATEMENT,
} from "@upstand/domain";
import { env } from "@upstand/env/server";
import { NotificationTransportRegistry } from "@upstand/infrastructure";
import { redis } from "@upstand/redis";
import { decryptNotificationConfiguration } from "@upstand/usecases";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { twoFactor } from "better-auth/plugins/two-factor";
import { and, count, eq } from "drizzle-orm";
import {
  clearStepUpVerification,
  recordStepUpVerification,
} from "./step-up-auth";

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

const organizationAccessControl = createAccessControl(ORGANIZATION_STATEMENT);
const organizationRoles = {
  owner: organizationAccessControl.newRole(ORGANIZATION_ROLE_STATEMENTS.owner),
  admin: organizationAccessControl.newRole(ORGANIZATION_ROLE_STATEMENTS.admin),
  member: organizationAccessControl.newRole(
    ORGANIZATION_ROLE_STATEMENTS.member,
  ),
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
      // The dashboard's local bootstrap and normal sign-up flow expect the
      // newly created account to receive a session immediately. Email
      // verification remains independently configurable for deployments that
      // require it.
      autoSignIn: true,
    },
    user: {
      // Admin-created members still use Better Auth's normal credential
      // account and can sign in immediately with the password they were given.
      additionalFields: {
        managed: {
          type: "boolean",
          required: false,
          defaultValue: false,
        },
      },
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
        if (
          ctx.path.endsWith("/two-factor/verify-totp") ||
          ctx.path.endsWith("/two-factor/verify-backup-code")
        ) {
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
            // A successful TOTP verification rotates the session and stores
            // that replacement in Better Auth's request context. Reading the
            // request cookie here can still resolve the pre-verification
            // session, leaving the new session without a step-up marker.
            const session =
              ctx.context.newSession ??
              (await auth.api.getSession({
                headers: ctx.request.headers,
              }));
            if (session) {
              await recordStepUpVerification(session);
            }
          }
        }
        if (
          ctx.path.endsWith("/two-factor/disable") ||
          ctx.path.endsWith("/two-factor/enable") ||
          ctx.path.endsWith("/two-factor/generate-backup-codes")
        ) {
          const session = ctx.request
            ? await auth.api.getSession({ headers: ctx.request.headers })
            : null;
          if (session) await clearStepUpVerification(session.session.id);
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
            return ctx.json(
              {
                error:
                  "This Upstand instance has already been configured. Sign in with the owner account.",
              },
              { status: 403 },
            );
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
              const metadata = JSON.parse(org.metadata) as {
                isPersonal?: boolean;
              };
              if (metadata.isPersonal) {
                return ctx.json(
                  { error: "Cannot delete personal organization" },
                  { status: 400 },
                );
              }
            } catch {
              // Ignore malformed legacy metadata; deletion authorization is
              // still enforced by the organization permission checks.
            }
          }
        }

        // Password sign-in must not become a bypass for an organization that
        // explicitly requires its verified identity provider. The
        // SSO endpoint is intentionally not blocked, and organizations with
        // no registered provider are ignored to prevent accidental lockout.
        if (ctx.path.endsWith("/sign-in/email")) {
          if (!ctx.request) return;
          const body = (await ctx.request
            .clone()
            .json()
            .catch(() => ({}))) as {
            email?: unknown;
          };
          const email = typeof body.email === "string" ? body.email.trim() : "";
          if (!email) return;

          const enforced = await db
            .select({ metadata: schema.organization.metadata })
            .from(schema.user)
            .innerJoin(schema.member, eq(schema.member.userId, schema.user.id))
            .innerJoin(
              schema.organization,
              eq(schema.organization.id, schema.member.organizationId),
            )
            .innerJoin(
              schema.ssoProvider,
              and(
                eq(schema.ssoProvider.organizationId, schema.organization.id),
                eq(schema.ssoProvider.domainVerified, true),
              ),
            )
            .where(eq(schema.user.email, email.toLowerCase()))
            .limit(20);

          const isEnforced = enforced.some((row) => {
            try {
              const metadata = row.metadata ? JSON.parse(row.metadata) : {};
              return metadata.ssoEnforced === true;
            } catch {
              return false;
            }
          });
          if (isEnforced) {
            return ctx.json(
              {
                error:
                  "This organization requires sign-in through its verified SSO provider.",
              },
              { status: 403 },
            );
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
            additionalFields: {
              permissions: memberPermissionField,
              scimActive: {
                type: "boolean",
                required: false,
                defaultValue: true,
              },
              scimExternalId: { type: "string", required: false },
            },
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
          const invitationUrl = new URL("/invitation", env.CORS_ORIGIN);
          invitationUrl.searchParams.set("token", id);
          const url = invitationUrl.toString();
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
      sso({
        domainVerification: {
          enabled: true,
          tokenPrefix: "upstand-sso",
        },
        organizationProvisioning: {
          defaultRole: "member",
        },
        provisionUserOnEveryLogin: true,
        redirectURI: "/api/auth/sso/callback",
        saml: {
          enableInResponseToValidation: true,
          allowIdpInitiated: true,
          requireTimestamps: true,
          algorithms: { onDeprecated: "reject" },
        },
        providersLimit: 10,
      }),
    ],
  });
}

export const auth = createAuth();
