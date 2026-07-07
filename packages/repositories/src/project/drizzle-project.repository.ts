import { project } from "@upstand/db";
import type {
  CreateProjectDTO,
  IProjectRepository,
  Project,
} from "@upstand/domain";
import { BaseRepository } from "../shared/base.repository";
import type { Executor } from "../shared/types";

export class DrizzleProjectRepository
  extends BaseRepository<typeof project, Project, CreateProjectDTO>
  implements IProjectRepository
{
  constructor(executor: Executor) {
    super(executor, project);
  }
}
