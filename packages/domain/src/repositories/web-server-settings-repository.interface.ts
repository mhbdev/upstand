import type {
  UpdateWebServerSettingsDTO,
  WebServerSettings,
} from "../entities/web-server-settings";

export interface IWebServerSettingsRepository {
  findGlobal(): Promise<WebServerSettings | null>;
  updateGlobal(
    patch: UpdateWebServerSettingsDTO,
  ): Promise<WebServerSettings | null>;
  createGlobal(data: {
    letsEncryptEmail?: string | null;
    httpPort?: number;
    httpsPort?: number;
    enableHttp3?: boolean;
    globalCaddyfile?: string | null;
  }): Promise<WebServerSettings>;
}
