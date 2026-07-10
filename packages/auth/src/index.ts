import { randomUUID } from "node:crypto";
import { createDb } from "@upstand/db";
import * as schema from "@upstand/db/schema/auth";
import { env } from "@upstand/env/server";
import { redis } from "@upstand/redis";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { twoFactor } from "better-auth/plugins/two-factor";
import { eq } from "drizzle-orm";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
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
    advanced: {
      defaultCookieAttributes: {
        sameSite: env.NODE_ENV === "production" ? "none" : "lax",
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
          const isSuccess =
            !res || (res instanceof Response ? res.ok : !(res as any).error);
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
      organization(),
      twoFactor({
        issuer: "Upstand",
        allowPasswordless: true,
      }),
    ],
  });
}

export const auth = createAuth();
