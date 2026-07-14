import { resource } from "@upstand/db";
import type {
  CreateResourceDTO,
  IResourceRepository,
  Resource,
} from "@upstand/domain";
import { eq } from "drizzle-orm";
import { BaseRepository } from "../shared/base.repository";
import type { Executor } from "../shared/types";

export class DrizzleResourceRepository
  extends BaseRepository<typeof resource, Resource, CreateResourceDTO>
  implements IResourceRepository
{
  constructor(executor: Executor) {
    super(executor, resource);
  }

  async findByEnvironmentId(environmentId: string): Promise<Resource[]> {
    return this.findMany({
      where: eq(resource.environmentId, environmentId),
    });
  }

  async findByWebhookTokenHash(hash: string): Promise<Resource | null> {
    return this.findOne(eq(resource.webhookTokenHash, hash));
  }
}
