import type { IUnitOfWork, Server } from "@upstand/domain";
import { z } from "zod";

const ServerTypeSchema = z.string().trim().min(1).max(32);

export const UpdateServerInputSchema = z.object({
  organizationId: z.string().min(1),
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  serverType: ServerTypeSchema.optional(),
  sshKeyId: z.string().min(1).nullable().optional(),
  ipAddress: z.string().trim().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65_535).optional(),
  username: z.string().trim().min(1).max(120).optional(),
  enableDockerCleanup: z.boolean().optional(),
});

export type UpdateServerInput = z.infer<typeof UpdateServerInputSchema>;

export class UpdateServerUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: UpdateServerInput): Promise<Server> {
    const current = await this.uow.serverRepository.findById(input.id);
    if (!current || current.organizationId !== input.organizationId) {
      throw new Error("Server not found");
    }

    const { organizationId: _organizationId, id: _id, ...patch } = input;
    const connectionChanged = [
      "sshKeyId",
      "ipAddress",
      "port",
      "username",
    ].some((field) => field in input);
    const updated = await this.uow.serverRepository.updateById(
      input.id,
      connectionChanged
        ? { ...patch, status: "idle", setupError: null }
        : patch,
    );
    if (!updated) throw new Error("Server not found");
    return updated;
  }
}
