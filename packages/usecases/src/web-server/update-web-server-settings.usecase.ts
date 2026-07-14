import {
  CaddyMiddlewareListSchema,
  type IUnitOfWork,
  serializeCaddyMiddlewares,
  type WebServerSettings,
} from "@upstand/domain";
import { z } from "zod";
import type { CaddyService } from "./caddy.service";

export const UpdateWebServerSettingsInputSchema = z.object({
  letsEncryptEmail: z.string().email().nullable().optional(),
  httpPort: z.number().int().min(1).max(65535).optional(),
  httpsPort: z.number().int().min(1).max(65535).optional(),
  enableHttp3: z.boolean().optional(),
  globalCaddyfile: z.string().nullable().optional(),
  caddySnippets: z.string().optional(),
  caddyMiddlewares: CaddyMiddlewareListSchema.optional(),
  serverIp: z.string().nullable().optional(),
  dailyDockerCleanup: z.boolean().optional(),
  caddyEnvironment: z.string().optional(),
  caddyPorts: z.string().optional(),
  appName: z.string().trim().max(128).nullable().optional(),
  appDescription: z.string().trim().max(512).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  customCss: z.string().max(100_000).nullable().optional(),
  loginLogoUrl: z.string().url().nullable().optional(),
  supportUrl: z.string().url().nullable().optional(),
  docsUrl: z.string().url().nullable().optional(),
  metaTitle: z.string().trim().max(160).nullable().optional(),
  footerText: z.string().trim().max(512).nullable().optional(),
});

export type UpdateWebServerSettingsInput = z.infer<
  typeof UpdateWebServerSettingsInputSchema
>;

export class UpdateWebServerSettingsUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly caddyService: CaddyService,
  ) {}

  async execute(
    input: UpdateWebServerSettingsInput,
  ): Promise<WebServerSettings | null> {
    let settings = await this.uow.webServerSettingsRepository.findGlobal();
    if (!settings) {
      settings = await this.uow.webServerSettingsRepository.createGlobal({});
    }

    const patch: Partial<WebServerSettings> = {};
    if (input.letsEncryptEmail !== undefined)
      patch.letsEncryptEmail = input.letsEncryptEmail;
    if (input.httpPort !== undefined) patch.httpPort = input.httpPort;
    if (input.httpsPort !== undefined) patch.httpsPort = input.httpsPort;
    if (input.enableHttp3 !== undefined) patch.enableHttp3 = input.enableHttp3;
    if (input.globalCaddyfile !== undefined)
      patch.globalCaddyfile = input.globalCaddyfile;
    if (input.caddySnippets !== undefined)
      patch.caddySnippets = input.caddySnippets;
    if (input.caddyMiddlewares !== undefined)
      patch.caddyMiddlewares = serializeCaddyMiddlewares(
        input.caddyMiddlewares,
      );
    if (input.serverIp !== undefined) patch.serverIp = input.serverIp;
    if (input.dailyDockerCleanup !== undefined)
      patch.dailyDockerCleanup = input.dailyDockerCleanup;
    if (input.caddyEnvironment !== undefined)
      patch.caddyEnvironment = input.caddyEnvironment;
    if (input.caddyPorts !== undefined) patch.caddyPorts = input.caddyPorts;
    if (input.appName !== undefined) patch.appName = input.appName;
    if (input.appDescription !== undefined)
      patch.appDescription = input.appDescription;
    if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl;
    if (input.faviconUrl !== undefined) patch.faviconUrl = input.faviconUrl;
    if (input.customCss !== undefined) patch.customCss = input.customCss;
    if (input.loginLogoUrl !== undefined)
      patch.loginLogoUrl = input.loginLogoUrl;
    if (input.supportUrl !== undefined) patch.supportUrl = input.supportUrl;
    if (input.docsUrl !== undefined) patch.docsUrl = input.docsUrl;
    if (input.metaTitle !== undefined) patch.metaTitle = input.metaTitle;
    if (input.footerText !== undefined) patch.footerText = input.footerText;

    const candidate = { ...settings, ...patch };
    const needsRecreate =
      input.httpPort !== undefined ||
      input.httpsPort !== undefined ||
      input.enableHttp3 !== undefined ||
      input.caddyEnvironment !== undefined ||
      input.caddyPorts !== undefined;
    const resources = await this.uow.resourceRepository.findMany();
    const certificates =
      (await this.uow.certificateRepository.findAll?.()) ?? [];

    try {
      await this.caddyService.initializeCaddy(candidate, needsRecreate);
      await this.caddyService.syncResourceConfigs(
        resources,
        candidate,
        certificates,
      );
      return await this.uow.transaction((tx) =>
        tx.webServerSettingsRepository.updateGlobal(patch),
      );
    } catch (error) {
      try {
        await this.caddyService.initializeCaddy(settings, needsRecreate);
        await this.caddyService.syncResourceConfigs(
          resources,
          settings,
          certificates,
        );
      } catch {
        // The original error is more useful to the caller. Caddy logs retain the
        // recovery failure for operators.
      }
      throw error;
    }
  }
}
