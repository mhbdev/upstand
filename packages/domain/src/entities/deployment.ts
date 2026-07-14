import { z } from "zod";

export const DeploymentSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  status: z.string(),
  title: z.string(),
  logs: z.string(),
  serverId: z.string().nullable().optional(),
  serverName: z.string().nullable().optional(),
  sourceRevision: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Deployment = z.infer<typeof DeploymentSchema>;

export interface CreateDeploymentDTO {
  id?: string;
  resourceId: string;
  status: string;
  title: string;
  logs?: string;
  serverId?: string | null;
  serverName?: string | null;
  sourceRevision?: string | null;
}

export interface UpdateDeploymentDTO {
  status?: string;
  logs?: string;
  serverId?: string | null;
  serverName?: string | null;
}
