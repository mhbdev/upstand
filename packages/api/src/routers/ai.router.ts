import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  aiConversation,
  aiMessage,
  aiProviderConfig,
  externalApiKey,
} from "@upstand/db";
import { createDb } from "@upstand/db";
import { encryptSecret } from "@upstand/domain/crypto/secret-box";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { ensureOrganizationAccess } from "../access-control";
import { protectedProcedure, router } from "../index";
import {
  getConversationForUser,
  listConversations,
  testUpGalProvider,
} from "../ai/upgal";

const organizationInput = z.object({ organizationId: z.string().min(1) });

export const aiRouter = router({
  settings: protectedProcedure
    .input(organizationInput)
    .query(async ({ ctx, input }) => {
      await ensureOrganizationAccess(ctx.session.user.id, input.organizationId);
      const row = await createDb()
        .select()
        .from(aiProviderConfig)
        .where(eq(aiProviderConfig.organizationId, input.organizationId))
        .limit(1)
        .then((rows) => rows[0]);
      return row
        ? {
            provider: row.provider,
            model: row.model,
            baseUrl: row.baseUrl,
            enabled: row.enabled === 1,
            configured: Boolean(row.apiKeyCiphertext),
          }
        : null;
    }),

  saveSettings: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        provider: z.enum(["openai", "anthropic", "google", "gateway"]),
        model: z.string().min(1).max(160),
        apiKey: z.string().min(1).optional(),
        baseUrl: z.url().optional().or(z.literal("")),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureOrganizationAccess(
        ctx.session.user.id,
        input.organizationId,
        ["owner", "admin"],
      );
      const db = createDb();
      const existing = await db
        .select()
        .from(aiProviderConfig)
        .where(eq(aiProviderConfig.organizationId, input.organizationId))
        .limit(1)
        .then((rows) => rows[0]);
      const encrypted = input.apiKey ? encryptSecret(input.apiKey) : null;
      const patch = {
        provider: input.provider,
        model: input.model,
        baseUrl: input.baseUrl || null,
        ...(encrypted
          ? {
              apiKeyCiphertext: encrypted.ciphertext,
              apiKeyIv: encrypted.iv,
              apiKeyAuthTag: encrypted.authTag,
              apiKeyVersion: encrypted.keyVersion,
            }
          : {}),
        enabled: 1,
        updatedAt: new Date(),
      };
      if (existing)
        await db
          .update(aiProviderConfig)
          .set(patch)
          .where(eq(aiProviderConfig.id, existing.id));
      else
        await db
          .insert(aiProviderConfig)
          .values({
            id: randomUUID(),
            organizationId: input.organizationId,
            ...patch,
            apiKeyCiphertext: encrypted?.ciphertext ?? null,
            apiKeyIv: encrypted?.iv ?? null,
            apiKeyAuthTag: encrypted?.authTag ?? null,
            apiKeyVersion: encrypted?.keyVersion ?? null,
          });
      return { saved: true };
    }),

  removeSettings: protectedProcedure
    .input(organizationInput)
    .mutation(async ({ ctx, input }) => {
      await ensureOrganizationAccess(
        ctx.session.user.id,
        input.organizationId,
        ["owner", "admin"],
      );
      await createDb()
        .delete(aiProviderConfig)
        .where(eq(aiProviderConfig.organizationId, input.organizationId));
      return { removed: true };
    }),

  testSettings: protectedProcedure
    .input(organizationInput)
    .mutation(async ({ ctx, input }) => {
      await ensureOrganizationAccess(
        ctx.session.user.id,
        input.organizationId,
        ["owner", "admin"],
      );
      return testUpGalProvider(input.organizationId);
    }),

  conversations: protectedProcedure
    .input(organizationInput)
    .query(async ({ ctx, input }) => {
      await ensureOrganizationAccess(ctx.session.user.id, input.organizationId);
      return listConversations(input.organizationId, ctx.session.user.id);
    }),

  createConversation: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        context: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureOrganizationAccess(ctx.session.user.id, input.organizationId);
      const id = randomUUID();
      await createDb()
        .insert(aiConversation)
        .values({
          id,
          organizationId: input.organizationId,
          userId: ctx.session.user.id,
          context: input.context ?? {},
        });
      return { id };
    }),

  getConversation: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        conversationId: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      await ensureOrganizationAccess(ctx.session.user.id, input.organizationId);
      const conversation = await getConversationForUser(
        input.conversationId,
        input.organizationId,
        ctx.session.user.id,
      );
      if (!conversation) return null;
      const messages = await createDb()
        .select()
        .from(aiMessage)
        .where(eq(aiMessage.conversationId, conversation.id))
        .orderBy(desc(aiMessage.createdAt));
      return { conversation, messages: messages.reverse() };
    }),

  apiKeys: protectedProcedure
    .input(organizationInput)
    .query(async ({ ctx, input }) => {
      await ensureOrganizationAccess(
        ctx.session.user.id,
        input.organizationId,
        ["owner", "admin"],
      );
      return createDb()
        .select({
          id: externalApiKey.id,
          name: externalApiKey.name,
          prefix: externalApiKey.prefix,
          scopes: externalApiKey.scopes,
          expiresAt: externalApiKey.expiresAt,
          lastUsedAt: externalApiKey.lastUsedAt,
          revokedAt: externalApiKey.revokedAt,
          createdAt: externalApiKey.createdAt,
        })
        .from(externalApiKey)
        .where(eq(externalApiKey.organizationId, input.organizationId))
        .orderBy(desc(externalApiKey.createdAt));
    }),

  createApiKey: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        name: z.string().min(1).max(80),
        scopes: z.array(z.string().min(1)).min(1),
        expiresAt: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureOrganizationAccess(
        ctx.session.user.id,
        input.organizationId,
        ["owner", "admin"],
      );
      const secret = `upg_${randomBytes(24).toString("hex")}`;
      const prefix = secret.slice(0, 12);
      await createDb()
        .insert(externalApiKey)
        .values({
          id: randomUUID(),
          organizationId: input.organizationId,
          createdBy: ctx.session.user.id,
          name: input.name,
          prefix,
          secretHash: createHash("sha256").update(secret).digest("hex"),
          scopes: input.scopes,
          expiresAt: input.expiresAt,
        });
      return { secret, prefix };
    }),

  revokeApiKey: protectedProcedure
    .input(
      z.object({ organizationId: z.string().min(1), id: z.string().min(1) }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureOrganizationAccess(
        ctx.session.user.id,
        input.organizationId,
        ["owner", "admin"],
      );
      await createDb()
        .update(externalApiKey)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(externalApiKey.id, input.id),
            eq(externalApiKey.organizationId, input.organizationId),
            isNull(externalApiKey.revokedAt),
          ),
        );
      return { revoked: true };
    }),
});
