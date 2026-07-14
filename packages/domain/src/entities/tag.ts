import { z } from "zod";

export const TAG_COLORS = [
  "primary",
  "emerald",
  "amber",
  "violet",
  "rose",
  "sky",
  "slate",
] as const;

export const TagSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string().min(1).max(64),
  color: z.enum(TAG_COLORS),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Tag = z.infer<typeof TagSchema>;

export interface CreateTagDTO {
  id?: string;
  organizationId: string;
  name: string;
  color?: (typeof TAG_COLORS)[number];
}

export interface ITagRepository {
  findById(id: string): Promise<Tag | null>;
  findByOrganizationId(organizationId: string): Promise<Tag[]>;
  findByResourceId(resourceId: string): Promise<Tag[]>;
  create(data: CreateTagDTO): Promise<Tag>;
  updateById(id: string, patch: Partial<CreateTagDTO>): Promise<Tag | null>;
  deleteById(id: string): Promise<boolean>;
  attachToResource(resourceId: string, tagId: string): Promise<void>;
  detachFromResource(resourceId: string, tagId: string): Promise<void>;
}
