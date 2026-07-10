import { dockerRegistry } from "@upstand/db";
import type {
  CreateDockerRegistryDTO,
  DockerRegistry,
  IDockerRegistryRepository,
} from "@upstand/domain";
import { eq } from "drizzle-orm";
import { BaseRepository } from "../shared/base.repository";
import type { Executor } from "../shared/types";

export class DrizzleDockerRegistryRepository
  extends BaseRepository<
    typeof dockerRegistry,
    DockerRegistry,
    CreateDockerRegistryDTO
  >
  implements IDockerRegistryRepository
{
  constructor(executor: Executor) {
    super(executor, dockerRegistry);
  }

  async findByOrganizationId(
    organizationId: string,
  ): Promise<DockerRegistry[]> {
    return this.findMany({
      where: eq(dockerRegistry.organizationId, organizationId),
    });
  }
}
