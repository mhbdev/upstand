import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { resource } from "./resource";

export const schedule = pgTable(
  "schedule",
  {
    id: text("id").primaryKey(),
    resourceId: text("resource_id")
      .references(() => resource.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cronExpression: text("cron_expression").notNull(),
    command: text("command").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("schedule_resource_idx").on(table.resourceId),
    index("schedule_enabled_idx").on(table.enabled),
  ],
);

export const scheduleRelations = relations(schedule, ({ one }) => ({
  resource: one(resource, {
    fields: [schedule.resourceId],
    references: [resource.id],
  }),
}));
