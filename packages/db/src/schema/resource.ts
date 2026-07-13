import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { environment } from "./environment";
import { server } from "./server";

export const resource = pgTable("resource", {
  id: text("id").primaryKey(),
  environmentId: text("environment_id")
    .notNull()
    .references(() => environment.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'application' | 'database' | 'compose'
  status: text("status").default("idle").notNull(),
  provider: text("provider").notNull(), // e.g. "github", "gitlab", "bitbucket", "gitea", "git", "raw"
  appName: text("app_name"),
  description: text("description"),
  dbType: text("db_type"),
  composeType: text("compose_type"),
  dockerImage: text("docker_image"),
  credentials: text("credentials"),
  buildConfig: text("build_config")
    .default(
      '{"type":"dockerfile","dockerfilePath":"Dockerfile","dockerContextPath":"."}',
    )
    .notNull(),
  advancedConfig: text("advanced_config").default("{}").notNull(),
  envVars: text("env_vars").default("{}").notNull(),
  domains: text("domains").default("[]").notNull(),
  deployments: text("deployments").default("[]").notNull(),
  containers: text("containers").default("[]").notNull(),
  serverId: text("server_id"),
  buildServerId: text("build_server_id").references(() => server.id, {
    onDelete: "set null",
  }),
  isPreviewDeploymentsActive: boolean("is_preview_deployments_active")
    .default(false)
    .notNull(),
  previewLimit: integer("preview_limit").default(3).notNull(),
  previewWildcard: text("preview_wildcard"),
  previewHttps: boolean("preview_https").default(false).notNull(),
  previewPort: integer("preview_port").default(3000).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const resourceRelations = relations(resource, ({ one }) => ({
  environment: one(environment, {
    fields: [resource.environmentId],
    references: [environment.id],
  }),
  buildServer: one(server, {
    fields: [resource.buildServerId],
    references: [server.id],
  }),
}));
