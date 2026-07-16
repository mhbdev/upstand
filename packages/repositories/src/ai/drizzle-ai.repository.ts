import { randomUUID } from "node:crypto";
import {
  aiConversation,
  aiFeatureAssignment,
  aiMessage,
  aiProviderConfig,
  aiRun,
} from "@upstand/db";
import type {
  AIConversationRecord,
  AIFeature,
  AIFeatureAssignmentRecord,
  AIMessageRecord,
  AIProviderConfigRecord,
  CreateAIConversation,
  CreateAIProviderConfig,
  CreateAIRun,
  IAIRepository,
  JsonValue,
  UpdateAIProviderConfig,
} from "@upstand/domain";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Executor } from "../shared/types";

export class DrizzleAIRepository implements IAIRepository {
  constructor(private readonly executor: Executor) {}

  // ── Provider configs ──────────────────────────────────────────────────────

  async listProviderConfigs(
    organizationId: string,
  ): Promise<AIProviderConfigRecord[]> {
    const rows = await this.executor
      .select()
      .from(aiProviderConfig)
      .where(eq(aiProviderConfig.organizationId, organizationId))
      .orderBy(asc(aiProviderConfig.createdAt));
    return rows.map((r) => ({ ...r, enabled: r.enabled === 1 }));
  }

  async findProviderConfigById(
    id: string,
    organizationId: string,
  ): Promise<AIProviderConfigRecord | null> {
    const row = await this.executor
      .select()
      .from(aiProviderConfig)
      .where(
        and(
          eq(aiProviderConfig.id, id),
          eq(aiProviderConfig.organizationId, organizationId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
    return row ? { ...row, enabled: row.enabled === 1 } : null;
  }

  async findFirstEnabledProviderConfig(
    organizationId: string,
  ): Promise<AIProviderConfigRecord | null> {
    const row = await this.executor
      .select()
      .from(aiProviderConfig)
      .where(
        and(
          eq(aiProviderConfig.organizationId, organizationId),
          eq(aiProviderConfig.enabled, 1),
        ),
      )
      .orderBy(asc(aiProviderConfig.createdAt))
      .limit(1)
      .then((rows) => rows[0]);
    return row ? { ...row, enabled: true } : null;
  }

  async createProviderConfig(
    input: CreateAIProviderConfig,
  ): Promise<AIProviderConfigRecord> {
    const [row] = await this.executor
      .insert(aiProviderConfig)
      .values({
        id: input.id,
        organizationId: input.organizationId,
        name: input.name,
        provider: input.provider,
        model: input.model,
        baseUrl: input.baseUrl,
        enabled: 1,
        apiKeyCiphertext: input.secret?.ciphertext ?? null,
        apiKeyIv: input.secret?.iv ?? null,
        apiKeyAuthTag: input.secret?.authTag ?? null,
        apiKeyVersion: input.secret?.keyVersion ?? null,
      })
      .returning();
    if (!row) throw new Error("AI provider config insert returned no row.");
    return { ...row, enabled: row.enabled === 1 };
  }

  async updateProviderConfig(
    id: string,
    patch: UpdateAIProviderConfig,
  ): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.provider !== undefined) set.provider = patch.provider;
    if (patch.model !== undefined) set.model = patch.model;
    if (patch.baseUrl !== undefined) set.baseUrl = patch.baseUrl;
    if (patch.secret !== undefined && patch.secret !== null) {
      set.apiKeyCiphertext = patch.secret.ciphertext;
      set.apiKeyIv = patch.secret.iv;
      set.apiKeyAuthTag = patch.secret.authTag;
      set.apiKeyVersion = patch.secret.keyVersion;
    }
    await this.executor
      .update(aiProviderConfig)
      .set(set)
      .where(eq(aiProviderConfig.id, id));
  }

  async deleteProviderConfig(
    id: string,
    organizationId: string,
  ): Promise<void> {
    await this.executor
      .delete(aiProviderConfig)
      .where(
        and(
          eq(aiProviderConfig.id, id),
          eq(aiProviderConfig.organizationId, organizationId),
        ),
      );
  }

  // ── Feature assignments ───────────────────────────────────────────────────

  async listFeatureAssignments(
    organizationId: string,
  ): Promise<AIFeatureAssignmentRecord[]> {
    return this.executor
      .select()
      .from(aiFeatureAssignment)
      .where(eq(aiFeatureAssignment.organizationId, organizationId));
  }

  async findFeatureAssignment(
    organizationId: string,
    feature: AIFeature,
  ): Promise<AIFeatureAssignmentRecord | null> {
    const row = await this.executor
      .select()
      .from(aiFeatureAssignment)
      .where(
        and(
          eq(aiFeatureAssignment.organizationId, organizationId),
          eq(aiFeatureAssignment.feature, feature),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
    return row ?? null;
  }

  async saveFeatureAssignment(
    organizationId: string,
    feature: AIFeature,
    providerConfigId: string,
  ): Promise<void> {
    const existing = await this.findFeatureAssignment(organizationId, feature);
    if (existing) {
      await this.executor
        .update(aiFeatureAssignment)
        .set({ providerConfigId, updatedAt: new Date() })
        .where(eq(aiFeatureAssignment.id, existing.id));
    } else {
      await this.executor.insert(aiFeatureAssignment).values({
        id: randomUUID(),
        organizationId,
        feature,
        providerConfigId,
      });
    }
  }

  async removeFeatureAssignment(
    organizationId: string,
    feature: AIFeature,
  ): Promise<void> {
    await this.executor
      .delete(aiFeatureAssignment)
      .where(
        and(
          eq(aiFeatureAssignment.organizationId, organizationId),
          eq(aiFeatureAssignment.feature, feature),
        ),
      );
  }

  // ── Conversations ─────────────────────────────────────────────────────────

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

  async updateConversationTitle(
    conversationId: string,
    title: string,
  ): Promise<void> {
    await this.executor
      .update(aiConversation)
      .set({ title: title.slice(0, 120), updatedAt: new Date() })
      .where(eq(aiConversation.id, conversationId));
  }

  async deleteConversation(
    conversationId: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    await this.executor
      .delete(aiConversation)
      .where(
        and(
          eq(aiConversation.id, conversationId),
          eq(aiConversation.organizationId, organizationId),
          eq(aiConversation.userId, userId),
        ),
      );
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  async listMessages(conversationId: string): Promise<AIMessageRecord[]> {
    return this.executor
      .select()
      .from(aiMessage)
      .where(eq(aiMessage.conversationId, conversationId))
      .orderBy(aiMessage.createdAt, aiMessage.id);
  }

  async saveMessages(
    conversationId: string,
    messages: readonly AIMessageRecord[],
  ): Promise<void> {
    for (const message of messages) {
      await this.executor
        .insert(aiMessage)
        .values({
          id: message.id,
          conversationId,
          role: message.role,
          parts: message.parts as JsonValue[],
          createdAt: message.createdAt,
        })
        .onConflictDoUpdate({
          target: aiMessage.id,
          set: {
            role: message.role,
            parts: message.parts as JsonValue[],
          },
        });
    }
    await this.executor
      .update(aiConversation)
      .set({ updatedAt: new Date() })
      .where(eq(aiConversation.id, conversationId));
  }

  // ── Runs ──────────────────────────────────────────────────────────────────

  async createRun(input: CreateAIRun): Promise<void> {
    await this.executor.insert(aiRun).values(input);
  }

  async updateRun(
    runId: string,
    patch: { stepCount?: number; status?: string; finishedAt?: Date },
  ): Promise<void> {
    await this.executor.update(aiRun).set(patch).where(eq(aiRun.id, runId));
  }
}
