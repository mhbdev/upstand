import { z } from "zod";

export const WebServerSettingsSchema = z.object({
  id: z.string(),
  letsEncryptEmail: z.string().email().nullable().optional(),
  httpPort: z.number().int().min(1).max(65535),
  httpsPort: z.number().int().min(1).max(65535),
  enableHttp3: z.boolean(),
  globalCaddyfile: z.string().nullable().optional(),
  caddySnippets: z.string(),
  serverIp: z.string().nullable().optional(),
  dailyDockerCleanup: z.boolean(),
  caddyEnvironment: z.string(),
  caddyPorts: z.string(),
  caddyDashboardEnabled: z.boolean(),
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
  serverIp?: string | null;
  dailyDockerCleanup?: boolean;
  caddyEnvironment?: string;
  caddyPorts?: string;
  caddyDashboardEnabled?: boolean;
}
