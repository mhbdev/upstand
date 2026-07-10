import { serverBuildSettings } from "@upstand/db";
import type {
  CreateServerBuildSettingsDTO,
  IServerBuildSettingsRepository,
  ServerBuildSettings,
} from "@upstand/domain";
import { BaseRepository } from "../shared/base.repository";
import type { Executor } from "../shared/types";

export class DrizzleServerBuildSettingsRepository
  extends BaseRepository<
    typeof serverBuildSettings,
    ServerBuildSettings,
    CreateServerBuildSettingsDTO
  >
  implements IServerBuildSettingsRepository
{
  constructor(executor: Executor) {
    super(executor, serverBuildSettings);
  }
}
