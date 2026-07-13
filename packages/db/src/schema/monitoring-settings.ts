import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { server } from "./server";

export const monitoringSettings = pgTable("monitoring_settings", {
  serverId: text("server_id")
    .primaryKey()
    .references(() => server.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  cpuThreshold: integer("cpu_threshold").notNull().default(90),
  memoryThreshold: integer("memory_threshold").notNull().default(90),
  alertEmail: text("alert_email"),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const monitoringSettingsRelations = relations(
  monitoringSettings,
  ({ one }) => ({
    server: one(server, {
      fields: [monitoringSettings.serverId],
      references: [server.id],
    }),
  }),
);
