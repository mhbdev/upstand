import { randomUUID } from "node:crypto";
import { AI_PROVIDERS } from "@upstand/domain";
import { encryptSecret } from "@upstand/domain/crypto/secret-box";
import { AIRepositoryToken } from "@upstand/repositories";
import { z } from "zod";
import { ensureOrganizationAccess } from "../access-control";
import {
  getConversationForUser,
  listConversations,
  listProviderModels,
  testUpGalProvider,
} from "../ai/upgal";
import { protectedProcedure, router } from "../index";

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
    .input(
      organizationInput.extend({
        provider: z.enum(AI_PROVIDERS).optional(),
        model: z.string().min(1).max(160).optional(),
        baseUrl: z.url().optional().or(z.literal("")),
        apiKey: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ensureOrganizationAccess(
        ctx.session.user.id,
        input.organizationId,
        ["owner", "admin"],
      );
      return testUpGalProvider(input.organizationId, ctx.scope, {
        provider: input.provider,
        model: input.model,
        baseUrl: input.baseUrl,
        apiKey: input.apiKey,
      });
    }),

  listModels: protectedProcedure
    .input(
      organizationInput.extend({
        provider: z.enum(AI_PROVIDERS),
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
      return listProviderModels(input.organizationId, ctx.scope, {
        provider: input.provider,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
      });
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
});
