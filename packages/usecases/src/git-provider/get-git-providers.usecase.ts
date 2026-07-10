import type { GitProvider, IUnitOfWork } from "@upstand/domain";
import { z } from "zod";

export const GetGitProvidersInputSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
});

export type GetGitProvidersInput = z.infer<typeof GetGitProvidersInputSchema>;

export class GetGitProvidersUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: GetGitProvidersInput): Promise<GitProvider[]> {
    return this.uow.transaction(async (tx) => {
      return await tx.gitProviderRepository.findByOrganizationId(
        input.organizationId,
      );
    });
  }
}
