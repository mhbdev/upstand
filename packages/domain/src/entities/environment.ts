import { z } from "zod";

export const EnvironmentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  isDefault: z.boolean(),
  isProtected: z.boolean(),
  resourceCount: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export interface CreateEnvironmentDTO {
  id?: string;
  projectId: string;
  name: string;
  slug: string;
  description?: string | null;
  isDefault?: boolean;
  isProtected?: boolean;
  resourceCount?: number;
}
