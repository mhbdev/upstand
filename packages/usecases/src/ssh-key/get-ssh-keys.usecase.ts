import type { IUnitOfWork, SshKey } from "@upstand/domain";
import { z } from "zod";

export const GetSshKeysInputSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
});

export type GetSshKeysInput = z.infer<typeof GetSshKeysInputSchema>;

export class GetSshKeysUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: GetSshKeysInput): Promise<SshKey[]> {
    return this.uow.transaction(async (tx) => {
      return await tx.sshKeyRepository.findByOrganizationId(
        input.organizationId,
      );
    });
  }
}
