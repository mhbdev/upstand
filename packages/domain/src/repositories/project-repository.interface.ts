import type { CreateProjectDTO, Project } from "../entities/project";

export interface IProjectRepository {
  findById(id: string): Promise<Project | null>;
  findMany(): Promise<Project[]>;
  create(data: CreateProjectDTO): Promise<Project>;
  delete(id: string): Promise<Project | null>;
  findByOrganizationId(organizationId: string): Promise<Project[]>;
}
