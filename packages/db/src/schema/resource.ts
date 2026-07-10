import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { environment } from "./environment";

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
  envVars: text("env_vars").default("{}").notNull(),
  domains: text("domains").default("[]").notNull(),
  deployments: text("deployments").default("[]").notNull(),
  containers: text("containers").default("[]").notNull(),
  serverId: text("server_id"),
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
}));
