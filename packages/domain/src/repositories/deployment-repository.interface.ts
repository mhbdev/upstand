import type {
  CreateDeploymentDTO,
  Deployment,
  UpdateDeploymentDTO,
} from "../entities/deployment";

export interface IDeploymentRepository {
  findById(id: string): Promise<Deployment | null>;
  findMany(): Promise<Deployment[]>;
  findRecent(limit?: number): Promise<Deployment[]>;
  findByStatus(status: string, limit?: number): Promise<Deployment[]>;
  findByResourceId(resourceId: string): Promise<Deployment[]>;
  create(data: CreateDeploymentDTO): Promise<Deployment>;
  updateById(
    id: string,
    patch: UpdateDeploymentDTO,
  ): Promise<Deployment | null>;
  deleteById(id: string): Promise<boolean>;
}
