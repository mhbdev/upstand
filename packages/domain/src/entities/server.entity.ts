import { z } from "zod";

export const ServerSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  serverType: z.string(), // 'deploy' | 'database'
  sshKeyId: z.string().nullable().optional(),
  ipAddress: z.string(),
  port: z.number(),
  username: z.string(),
  enableDockerCleanup: z.boolean(),
  status: z.string(), // 'idle' | 'setting_up' | 'ready' | 'failed'
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Server = z.infer<typeof ServerSchema>;

export interface CreateServerDTO {
  id?: string;
  organizationId: string;
  name: string;
  description?: string | null;
  serverType: string;
  sshKeyId?: string | null;
  ipAddress: string;
  port: number;
  username: string;
  enableDockerCleanup?: boolean;
  status?: string;
}
