import { z } from "zod";

export const ProjectSchema = z.object({
  id: z.uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Project = z.infer<typeof ProjectSchema>;

export interface CreateProjectDTO {
  id?: string;
}
