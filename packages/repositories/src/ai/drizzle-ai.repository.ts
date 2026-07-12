import {
  aiConversation,
  aiMessage,
  aiProviderConfig,
  aiRun,
  externalApiKey,
} from "@upstand/db";
import { randomUUID } from "node:crypto";
import type {
  AIConversationRecord,
  AIExternalApiKeyRecord,
  AIMessageRecord,
  AIProviderConfigRecord,
  CreateAIConversation,
  CreateAIExternalApiKey,
  CreateAIRun,
  IAIRepository,
  JsonValue,
  SaveAIProviderConfig,
} from "@upstand/domain";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Executor } from "../shared/types";

export class DrizzleAIRepository implements IAIRepository {
  constructor(private readonly executor: Executor) {}

  async findProviderConfig(
    organizationId: string,
  ): Promise<AIProviderConfigRecord | null> {
    const row = await this.executor
      .select()
      .from(aiProviderConfig)
      .where(eq(aiProviderConfig.organizationId, organizationId))
      .limit(1)
      .then((rows) => rows[0]);
    return row ? { ...row, enabled: row.enabled === 1 } : null;
  }

  async saveProviderConfig(input: SaveAIProviderConfig): Promise<void> {
    const existing = await this.executor
      .select({ id: aiProviderConfig.id })
      .from(aiProviderConfig)
      .where(eq(aiProviderConfig.organizationId, input.organizationId))
      .limit(1)
      .then((rows) => rows[0]);
    const patch = {
      provider: input.provider,
      model: input.model,
      baseUrl: input.baseUrl,
      enabled: 1,
      updatedAt: new Date(),
      ...(input.secret
        ? {
            apiKeyCiphertext: input.secret.ciphertext,
            apiKeyIv: input.secret.iv,
            apiKeyAuthTag: input.secret.authTag,
            apiKeyVersion: input.secret.keyVersion,
          }
        : {}),
    };
    if (existing) {
      await this.executor
        .update(aiProviderConfig)
        .set(patch)
        .where(eq(aiProviderConfig.id, existing.id));
      return;
    }
    await this.executor.insert(aiProviderConfig).values({
      id: randomUUID(),
      organizationId: input.organizationId,
      ...patch,
      apiKeyCiphertext: input.secret?.ciphertext ?? null,
      apiKeyIv: input.secret?.iv ?? null,
      apiKeyAuthTag: input.secret?.authTag ?? null,
      apiKeyVersion: input.secret?.keyVersion ?? null,
    });
  }

  async deleteProviderConfig(organizationId: string): Promise<void> {
    await this.executor
      .delete(aiProviderConfig)
      .where(eq(aiProviderConfig.organizationId, organizationId));
  }

  async createConversation(
    input: CreateAIConversation,
  ): Promise<AIConversationRecord> {
    const [row] = await this.executor
      .insert(aiConversation)
      .values(input)
      .returning();
    if (!row) throw new Error("AI conversation insert returned no row.");
    return row;
  }

  async findConversation(
    conversationId: string,
    organizationId: string,
    userId: string,
  ): Promise<AIConversationRecord | null> {
    const row = await this.executor
      .select()
      .from(aiConversation)
      .where(
        and(
          eq(aiConversation.id, conversationId),
          eq(aiConversation.organizationId, organizationId),
          eq(aiConversation.userId, userId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
    return row ?? null;
  }

  async listConversations(
    organizationId: string,
    userId: string,
  ): Promise<AIConversationRecord[]> {
    return this.executor
      .select()
      .from(aiConversation)
      .where(
        and(
          eq(aiConversation.organizationId, organizationId),
          eq(aiConversation.userId, userId),
        ),
      )
      .orderBy(desc(aiConversation.updatedAt))
      .limit(50);
  }

  async listMessages(conversationId: string): Promise<AIMessageRecord[]> {
    return this.executor
      .select()
      .from(aiMessage)
      .where(eq(aiMessage.conversationId, conversationId))
      .orderBy(aiMessage.createdAt);
  }

  async saveMessages(
    conversationId: string,
    messages: readonly AIMessageRecord[],
  ): Promise<void> {
    if (messages.length > 0) {
      await this.executor
        .insert(aiMessage)
        .values(
          messages.map((message) => ({
            id: message.id,
            conversationId,
            role: message.role,
            parts: message.parts as JsonValue[],
            createdAt: message.createdAt,
          })),
        )
        .onConflictDoNothing();
    }
    await this.executor
      .update(aiConversation)
      .set({ updatedAt: new Date() })
      .where(eq(aiConversation.id, conversationId));
  }

  async createRun(input: CreateAIRun): Promise<void> {
    await this.executor.insert(aiRun).values(input);
  }

  async updateRun(
    runId: string,
    patch: { stepCount?: number; status?: string; finishedAt?: Date },
  ): Promise<void> {
    await this.executor.update(aiRun).set(patch).where(eq(aiRun.id, runId));
  }

  async listExternalApiKeys(
    organizationId: string,
  ): Promise<AIExternalApiKeyRecord[]> {
    return this.executor
      .select({
        id: externalApiKey.id,
        organizationId: externalApiKey.organizationId,
        createdBy: externalApiKey.createdBy,
        name: externalApiKey.name,
        prefix: externalApiKey.prefix,
        scopes: externalApiKey.scopes,
        expiresAt: externalApiKey.expiresAt,
        lastUsedAt: externalApiKey.lastUsedAt,
        revokedAt: externalApiKey.revokedAt,
        createdAt: externalApiKey.createdAt,
      })
      .from(externalApiKey)
      .where(eq(externalApiKey.organizationId, organizationId))
      .orderBy(desc(externalApiKey.createdAt));
  }

  async createExternalApiKey(input: CreateAIExternalApiKey): Promise<void> {
    await this.executor.insert(externalApiKey).values(input);
  }

  async revokeExternalApiKey(organizationId: string, id: string): Promise<void> {
    await this.executor
      .update(externalApiKey)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(externalApiKey.id, id),
          eq(externalApiKey.organizationId, organizationId),
          isNull(externalApiKey.revokedAt),
        ),
      );
  }

  async findActiveExternalApiKey(
    secretHash: string,
    now: Date,
  ): Promise<AIExternalApiKeyRecord | null> {
    const row = await this.executor
      .select({
        id: externalApiKey.id,
        organizationId: externalApiKey.organizationId,
        createdBy: externalApiKey.createdBy,
        name: externalApiKey.name,
        prefix: externalApiKey.prefix,
        scopes: externalApiKey.scopes,
        expiresAt: externalApiKey.expiresAt,
        lastUsedAt: externalApiKey.lastUsedAt,
        revokedAt: externalApiKey.revokedAt,
        createdAt: externalApiKey.createdAt,
      })
      .from(externalApiKey)
      .where(
        and(
          eq(externalApiKey.secretHash, secretHash),
          isNull(externalApiKey.revokedAt),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
    if (!row || (row.expiresAt !== null && row.expiresAt < now)) return null;
    return row;
  }

  async markExternalApiKeyUsed(id: string, usedAt: Date): Promise<void> {
    await this.executor
      .update(externalApiKey)
      .set({ lastUsedAt: usedAt })
      .where(eq(externalApiKey.id, id));
  }
}
