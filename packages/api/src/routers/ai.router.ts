import { createHash, randomBytes, randomUUID } from "node:crypto";
import { encryptSecret } from "@upstand/domain/crypto/secret-box";
import { AI_PROVIDERS, AIRepositoryToken } from "@upstand/domain";
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
      const row = await ctx.scope
        .resolve(AIRepositoryToken)
        .findProviderConfig(input.organizationId);
      return row
        ? {
            provider: row.provider,
            model: row.model,
            baseUrl: row.baseUrl,
            enabled: row.enabled,
            configured: Boolean(row.apiKeyCiphertext),
          }
        : null;
    }),

  saveSettings: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        provider: z.enum(AI_PROVIDERS),
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
      const encrypted = input.apiKey ? encryptSecret(input.apiKey) : null;
      await ctx.scope.resolve(AIRepositoryToken).saveProviderConfig({
        organizationId: input.organizationId,
        provider: input.provider,
        model: input.model,
        baseUrl: input.baseUrl || null,
        secret: encrypted,
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
      await ctx.scope
        .resolve(AIRepositoryToken)
        .deleteProviderConfig(input.organizationId);
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
      return testUpGalProvider(input.organizationId, ctx.scope);
    }),

  conversations: protectedProcedure
    .input(organizationInput)
    .query(async ({ ctx, input }) => {
      await ensureOrganizationAccess(ctx.session.user.id, input.organizationId);
      return listConversations(
        input.organizationId,
        ctx.session.user.id,
        ctx.scope.resolve(AIRepositoryToken),
      );
    }),

  createConversation: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        context: z.record(z.string(), z.json()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureOrganizationAccess(ctx.session.user.id, input.organizationId);
      const id = randomUUID();
      await ctx.scope.resolve(AIRepositoryToken).createConversation({
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
        ctx.scope.resolve(AIRepositoryToken),
      );
      if (!conversation) return null;
      const messages = await ctx.scope
        .resolve(AIRepositoryToken)
        .listMessages(conversation.id);
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
      return ctx.scope
        .resolve(AIRepositoryToken)
        .listExternalApiKeys(input.organizationId);
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
      await ctx.scope.resolve(AIRepositoryToken).createExternalApiKey({
        id: randomUUID(),
        organizationId: input.organizationId,
        createdBy: ctx.session.user.id,
        name: input.name,
        prefix,
        secretHash: createHash("sha256").update(secret).digest("hex"),
        scopes: input.scopes,
        expiresAt: input.expiresAt ?? null,
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
      await ctx.scope
        .resolve(AIRepositoryToken)
        .revokeExternalApiKey(input.organizationId, input.id);
      return { revoked: true };
    }),
});
