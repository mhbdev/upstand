import {
  type IUnitOfWork,
  type ServerBuildSettings,
  ValidationError,
} from "@upstand/domain";
import { redis } from "@upstand/redis";

export interface UpdateConcurrencyInput {
  serverId: string;
  concurrency: number;
  hostname?: string;
  ip?: string;
}

export class UpdateConcurrencyUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: UpdateConcurrencyInput): Promise<ServerBuildSettings> {
    if (
      !Number.isInteger(input.concurrency) ||
      input.concurrency < 1 ||
      input.concurrency > 100
    ) {
      throw new ValidationError(
        "Concurrency must be an integer between 1 and 100",
      );
    }

    const settings = await this.uow.transaction(async (tx) => {
      let settings = await tx.serverBuildSettingsRepository.findById(
        input.serverId,
      );
      if (!settings) {
        settings = await tx.serverBuildSettingsRepository.create({
          id: input.serverId,
          hostname: input.hostname || `Server ${input.serverId}`,
          ip: input.ip || "127.0.0.1",
          concurrency: input.concurrency,
        });
      } else {
        const patch: any = { concurrency: input.concurrency };
        if (input.hostname) patch.hostname = input.hostname;
        if (input.ip) patch.ip = input.ip;

        const updated = await tx.serverBuildSettingsRepository.updateById(
          input.serverId,
          patch,
        );
        if (!updated) {
          throw new Error("Failed to update server build settings");
        }
        settings = updated;
      }

      return settings;
    });

    await redis.publish(
      "upstand:server:concurrency",
      JSON.stringify({
        serverId: input.serverId,
        concurrency: input.concurrency,
      }),
    );
    return settings;
  }
}
