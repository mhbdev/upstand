import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

export const aiProviderConfig = pgTable(
  "ai_provider_config",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    baseUrl: text("base_url"),
    apiKeyCiphertext: text("api_key_ciphertext"),
    apiKeyIv: text("api_key_iv"),
    apiKeyAuthTag: text("api_key_auth_tag"),
    apiKeyVersion: integer("api_key_version"),
    enabled: integer("enabled").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ai_provider_config_org_uidx").on(table.organizationId),
  ],
);

export const aiConversation = pgTable(
  "ai_conversation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New UpGal conversation"),
    context: jsonb("context").$type<Record<string, unknown>>(),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_conversation_org_idx").on(table.organizationId, table.updatedAt),
  ],
);

export const aiMessage = pgTable(
  "ai_message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversation.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    parts: jsonb("parts").$type<unknown[]>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("ai_message_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const aiRun = pgTable(
  "ai_run",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversation.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"),
    model: text("model").notNull(),
    stepCount: integer("step_count").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("ai_run_conversation_idx").on(table.conversationId, table.startedAt),
  ],
);

export const aiApproval = pgTable(
  "ai_approval",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => aiRun.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => aiConversation.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => user.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("ai_approval_tool_call_uidx").on(table.runId, table.toolCallId),
    index("ai_approval_org_idx").on(table.organizationId, table.status),
  ],
);

export const externalApiKey = pgTable(
  "external_api_key",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    secretHash: text("secret_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("external_api_key_hash_uidx").on(table.secretHash),
    index("external_api_key_org_idx").on(table.organizationId, table.revokedAt),
  ],
);

export const aiRelations = relations(aiConversation, ({ many }) => ({
  messages: many(aiMessage),
  runs: many(aiRun),
}));
