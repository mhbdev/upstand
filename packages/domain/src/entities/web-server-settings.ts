import { z } from "zod";

export const WebServerSettingsSchema = z.object({
  id: z.string(),
  letsEncryptEmail: z.string().email().nullable().optional(),
  httpPort: z.number().int().min(1).max(65535),
  httpsPort: z.number().int().min(1).max(65535),
  enableHttp3: z.boolean(),
  globalCaddyfile: z.string().nullable().optional(),
  caddySnippets: z.string(),
  caddyMiddlewares: z.string(),
  serverIp: z.string().nullable().optional(),
  dailyDockerCleanup: z.boolean(),
  caddyEnvironment: z.string(),
  caddyPorts: z.string(),
  caddyDashboardEnabled: z.boolean(),
  appName: z.string().nullable().optional(),
  appDescription: z.string().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  customCss: z.string().nullable().optional(),
  loginLogoUrl: z.string().url().nullable().optional(),
  supportUrl: z.string().url().nullable().optional(),
  docsUrl: z.string().url().nullable().optional(),
  metaTitle: z.string().nullable().optional(),
  footerText: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WebServerSettings = z.infer<typeof WebServerSettingsSchema>;

export interface UpdateWebServerSettingsDTO {
  letsEncryptEmail?: string | null;
  httpPort?: number;
  httpsPort?: number;
  enableHttp3?: boolean;
  globalCaddyfile?: string | null;
  caddySnippets?: string;
  caddyMiddlewares?: string;
  serverIp?: string | null;
  dailyDockerCleanup?: boolean;
  caddyEnvironment?: string;
  caddyPorts?: string;
  caddyDashboardEnabled?: boolean;
  appName?: string | null;
  appDescription?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  customCss?: string | null;
  loginLogoUrl?: string | null;
  supportUrl?: string | null;
  docsUrl?: string | null;
  metaTitle?: string | null;
  footerText?: string | null;
}
