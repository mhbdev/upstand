import type { CreateProjectDTO, Project } from "../entities/project";

export interface IProjectRepository {
  findById(id: string): Promise<Project | null>;
  create(data: CreateProjectDTO): Promise<Project>;
  findByOrganizationId(organizationId: string): Promise<Project[]>;
}
