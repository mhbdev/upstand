export const AI_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "gateway",
  "openrouter",
] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export function isAIProvider(value: string): value is AIProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

import type { JsonObject, JsonValue } from "./json";

export type AIProviderConfigRecord = {
  id: string;
  organizationId: string;
  provider: AIProvider;
  model: string;
  baseUrl: string | null;
  apiKeyCiphertext: string | null;
  apiKeyIv: string | null;
  apiKeyAuthTag: string | null;
  apiKeyVersion: number | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SaveAIProviderConfig = {
  organizationId: string;
  provider: AIProvider;
  model: string;
  baseUrl: string | null;
  secret: {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
  } | null;
};

export type AIConversationRecord = {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  context: JsonObject | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AIMessageRecord = {
  id: string;
  conversationId: string;
  role: string;
  parts: JsonValue[];
  createdAt: Date;
};

export type CreateAIConversation = {
  id: string;
  organizationId: string;
  userId: string;
  context: JsonObject;
};

export type CreateAIRun = {
  id: string;
  conversationId: string;
  organizationId: string;
  userId: string;
  model: string;
};

export interface IAIRepository {
  findProviderConfig(
    organizationId: string,
  ): Promise<AIProviderConfigRecord | null>;
  saveProviderConfig(input: SaveAIProviderConfig): Promise<void>;
  deleteProviderConfig(organizationId: string): Promise<void>;
  createConversation(
    input: CreateAIConversation,
  ): Promise<AIConversationRecord>;
  findConversation(
    conversationId: string,
    organizationId: string,
    userId: string,
  ): Promise<AIConversationRecord | null>;
  listConversations(
    organizationId: string,
    userId: string,
  ): Promise<AIConversationRecord[]>;
  listMessages(conversationId: string): Promise<AIMessageRecord[]>;
  saveMessages(
    conversationId: string,
    messages: readonly AIMessageRecord[],
  ): Promise<void>;
  createRun(input: CreateAIRun): Promise<void>;
  updateRun(
    runId: string,
    patch: { stepCount?: number; status?: string; finishedAt?: Date },
  ): Promise<void>;
}
