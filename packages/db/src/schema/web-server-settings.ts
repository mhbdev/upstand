import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const webServerSettings = pgTable("web_server_settings", {
  id: text("id").primaryKey(), // always 'global'
  letsEncryptEmail: text("lets_encrypt_email"),
  httpPort: integer("http_port").default(80).notNull(),
  httpsPort: integer("https_port").default(443).notNull(),
  enableHttp3: boolean("enable_http3").default(true).notNull(),
  globalCaddyfile: text("global_caddyfile"),
  caddySnippets: text("caddy_snippets").default("").notNull(),
  caddyMiddlewares: text("caddy_middlewares").default("[]").notNull(),
  serverIp: text("server_ip"),
  dailyDockerCleanup: boolean("daily_docker_cleanup").default(false).notNull(),
  caddyEnvironment: text("caddy_environment").default("{}").notNull(),
  caddyPorts: text("caddy_ports").default("[]").notNull(),
  caddyDashboardEnabled: boolean("caddy_dashboard_enabled")
    .default(false)
    .notNull(),
  appName: text("app_name"),
  appDescription: text("app_description"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  customCss: text("custom_css"),
  loginLogoUrl: text("login_logo_url"),
  supportUrl: text("support_url"),
  docsUrl: text("docs_url"),
  metaTitle: text("meta_title"),
  footerText: text("footer_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
