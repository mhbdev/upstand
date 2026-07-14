import { webServerSettings } from "@upstand/db";
import type {
  IWebServerSettingsRepository,
  UpdateWebServerSettingsDTO,
  WebServerSettings,
} from "@upstand/domain";
import { BaseRepository } from "../shared/base.repository";
import type { Executor } from "../shared/types";

export class DrizzleWebServerSettingsRepository
  extends BaseRepository<typeof webServerSettings, WebServerSettings, any>
  implements IWebServerSettingsRepository
{
  constructor(executor: Executor) {
    super(executor, webServerSettings);
  }

  async findGlobal(): Promise<WebServerSettings | null> {
    return this.findById("global");
  }

  async updateGlobal(
    patch: UpdateWebServerSettingsDTO,
  ): Promise<WebServerSettings | null> {
    return this.updateById("global", patch);
  }

  async createGlobal(data: {
    letsEncryptEmail?: string | null;
    httpPort?: number;
    httpsPort?: number;
    enableHttp3?: boolean;
    globalCaddyfile?: string | null;
    caddySnippets?: string;
    caddyMiddlewares?: string;
    serverIp?: string | null;
    dailyDockerCleanup?: boolean;
    caddyEnvironment?: string;
    caddyPorts?: string;
    caddyDashboardEnabled?: boolean;
    accessLogsEnabled?: boolean;
    accessLogCleanupCron?: string;
  }): Promise<WebServerSettings> {
    return this.create({
      id: "global",
      letsEncryptEmail: data.letsEncryptEmail ?? null,
      httpPort: data.httpPort ?? 80,
      httpsPort: data.httpsPort ?? 443,
      enableHttp3: data.enableHttp3 ?? true,
      globalCaddyfile: data.globalCaddyfile ?? null,
      caddySnippets: data.caddySnippets ?? "",
      caddyMiddlewares: data.caddyMiddlewares ?? "[]",
      serverIp: data.serverIp ?? null,
      dailyDockerCleanup: data.dailyDockerCleanup ?? false,
      caddyEnvironment: data.caddyEnvironment ?? "{}",
      caddyPorts: data.caddyPorts ?? "[]",
      caddyDashboardEnabled: data.caddyDashboardEnabled ?? false,
      accessLogsEnabled: data.accessLogsEnabled ?? false,
      accessLogCleanupCron: data.accessLogCleanupCron ?? "0 3 * * *",
    });
  }
}
