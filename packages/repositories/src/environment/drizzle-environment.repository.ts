import { environment } from "@upstand/db";
import type {
  CreateEnvironmentDTO,
  Environment,
  IEnvironmentRepository,
} from "@upstand/domain";
import { eq } from "drizzle-orm";
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
}
