import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { resource } from "./resource";

export const deployment = pgTable(
  "deployment",
  {
    id: text("id").primaryKey(),
    resourceId: text("resource_id")
      .notNull()
      .references(() => resource.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // 'queued' | 'running' | 'success' | 'failed'
    title: text("title").notNull(),
    logs: text("logs").default("").notNull(),
    serverId: text("server_id"),
    serverName: text("server_name"),
    sourceRevision: text("source_revision"),
    executionToken: text("execution_token"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("deployment_created_idx").on(table.createdAt),
    index("deployment_resource_created_idx").on(
      table.resourceId,
      table.createdAt,
    ),
    index("deployment_status_idx").on(table.status),
    index("deployment_server_status_idx").on(table.serverId, table.status),
    index("deployment_execution_lease_idx").on(table.status, table.updatedAt),
  ],
);

export const deploymentRelations = relations(deployment, ({ one }) => ({
  resource: one(resource, {
    fields: [deployment.resourceId],
    references: [resource.id],
  }),
}));
