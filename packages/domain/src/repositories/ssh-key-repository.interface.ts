import type { CreateSshKeyDTO, SshKey } from "../entities/ssh-key";

export interface ISshKeyRepository {
  findById(id: string): Promise<SshKey | null>;
  findByOrganizationId(organizationId: string): Promise<SshKey[]>;
  create(data: CreateSshKeyDTO): Promise<SshKey>;
  deleteById(id: string): Promise<boolean>;
}
