import { z } from "zod";
import { EntityIconSchema } from "./icon";

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  organizationId: z.string(),
  icon: EntityIconSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Project = z.infer<typeof ProjectSchema>;

export interface CreateProjectDTO {
  id?: string;
  name: string;
  description?: string | null;
  organizationId: string;
  icon?: string | null;
}

export interface UpdateProjectDTO {
  name?: string;
  description?: string | null;
  icon?: string | null;
}
