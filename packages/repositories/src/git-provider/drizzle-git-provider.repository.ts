import { gitProvider } from "@upstand/db";
import type {
  CreateGitProviderDTO,
  GitProvider,
  IGitProviderRepository,
} from "@upstand/domain";
import { eq } from "drizzle-orm";
import { BaseRepository } from "../shared/base.repository";
import type { Executor } from "../shared/types";

export class DrizzleGitProviderRepository
  extends BaseRepository<typeof gitProvider, GitProvider, CreateGitProviderDTO>
  implements IGitProviderRepository
{
  constructor(executor: Executor) {
    super(executor, gitProvider);
  }

  async findByOrganizationId(organizationId: string): Promise<GitProvider[]> {
    return this.findMany({
      where: eq(gitProvider.organizationId, organizationId),
    });
  }
}
