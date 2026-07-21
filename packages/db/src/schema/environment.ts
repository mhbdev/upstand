import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { project } from "./project";

export const environment = pgTable(
  "environment",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").default(false).notNull(),
    isProtected: boolean("is_protected").default(false).notNull(),
    resourceCount: integer("resource_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("environment_project_idx").on(table.projectId),
    uniqueIndex("environment_project_slug_uidx").on(
      table.projectId,
      table.slug,
    ),
  ],
);

export const environmentRelations = relations(environment, ({ one }) => ({
  project: one(project, {
    fields: [environment.projectId],
    references: [project.id],
  }),
}));
