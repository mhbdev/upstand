import { environment } from "@upstand/db";
import type {
  CreateEnvironmentDTO,
  Environment,
  IEnvironmentRepository,
} from "@upstand/domain";
import { eq, sql } from "drizzle-orm";
import { BaseRepository } from "../shared/base.repository";
import type { Executor } from "../shared/types";

export class DrizzleEnvironmentRepository
  extends BaseRepository<typeof environment, Environment, CreateEnvironmentDTO>
  implements IEnvironmentRepository
{
  constructor(executor: Executor) {
    super(executor, environment);
  }

  async findByProjectId(projectId: string): Promise<Environment[]> {
    return this.findMany({
      where: eq(environment.projectId, projectId),
    });
  }

  async incrementResourceCount(id: string, delta: number): Promise<void> {
    await this.executor
      .update(environment)
      .set({
        resourceCount: sql`GREATEST(0, ${environment.resourceCount} + ${delta})`,
      })
      .where(eq(environment.id, id));
  }
}
