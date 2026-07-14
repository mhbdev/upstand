import { deployment } from "@upstand/db";
import type {
  CreateDeploymentDTO,
  Deployment,
  IDeploymentRepository,
} from "@upstand/domain";
import { desc, eq, inArray } from "drizzle-orm";
import { BaseRepository } from "../shared/base.repository";
import type { Executor } from "../shared/types";

export class DrizzleDeploymentRepository
  extends BaseRepository<typeof deployment, Deployment, CreateDeploymentDTO>
  implements IDeploymentRepository
{
  constructor(executor: Executor) {
    super(executor, deployment);
  }

  async findRecent(limit = 500): Promise<Deployment[]> {
    return super.findMany({
      orderBy: desc(deployment.createdAt),
      limit: Math.max(1, Math.min(limit, 1_000)),
    });
  }

  async findRecentByResourceIds(
    resourceIds: readonly string[],
    limit = 500,
  ): Promise<Deployment[]> {
    if (resourceIds.length === 0) return [];
    return super.findMany({
      where: inArray(deployment.resourceId, [...resourceIds]),
      orderBy: desc(deployment.createdAt),
      limit: Math.max(1, Math.min(limit, 1_000)),
    });
  }

  async findByStatus(status: string, limit = 500): Promise<Deployment[]> {
    return super.findMany({
      where: eq(deployment.status, status),
      orderBy: desc(deployment.createdAt),
      limit: Math.max(1, Math.min(limit, 1_000)),
    });
  }

  async findByResourceId(resourceId: string): Promise<Deployment[]> {
    return super.findMany({
      where: eq(deployment.resourceId, resourceId),
      orderBy: desc(deployment.createdAt),
      limit: 500,
    });
  }
}
