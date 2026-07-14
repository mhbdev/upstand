import type { IUnitOfWork, WebServerSettings } from "@upstand/domain";
import type { CaddyService } from "./caddy.service";

function addUpstreamRetry(snippets: string, upstream: string): string {
  const legacy = `\treverse_proxy ${upstream}`;
  const resilient = `${legacy} {
\t\tlb_try_duration 30s
\t\tlb_try_interval 250ms
\t}`;

  return snippets.replaceAll(
    `${legacy}\n`,
    snippets.includes(`${legacy} {`) ? `${legacy}\n` : `${resilient}\n`,
  );
}

function ensureControlPlaneRetries(snippets: string): string {
  return [
    "upstand_web:3001",
    "upstand_server:3000",
    "upstand_fumadocs:4000",
  ].reduce(addUpstreamRetry, snippets);
}

export class GetWebServerSettingsUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly caddyService: CaddyService,
  ) {}

  async execute(): Promise<{ settings: WebServerSettings; status: any }> {
    let settings = await this.uow.webServerSettingsRepository.findGlobal();
    if (!settings) {
      settings = await this.uow.webServerSettingsRepository.createGlobal({
        caddySnippets: this.getControlPlaneRoutes(),
      });
    } else {
      const docsHost = process.env.UPSTAND_DOCS_HOST?.trim();
      if (
        docsHost &&
        /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(docsHost) &&
        !settings.caddySnippets.includes(`${docsHost} {`)
      ) {
        const docsRoute = `${docsHost} {
\tencode zstd gzip
\treverse_proxy upstand_fumadocs:4000 {
\t\tlb_try_duration 30s
\t\tlb_try_interval 250ms
\t}`;
        settings =
          (await this.uow.webServerSettingsRepository.updateGlobal({
            caddySnippets: `${settings.caddySnippets.trim()}\n\n${docsRoute}\n}`,
          })) ?? settings;
      }
    }

    const resilientSnippets = ensureControlPlaneRetries(settings.caddySnippets);
    if (resilientSnippets !== settings.caddySnippets) {
      settings =
        (await this.uow.webServerSettingsRepository.updateGlobal({
          caddySnippets: resilientSnippets,
        })) ?? settings;
    }

    if (!settings.serverIp) {
      let detectedIp = "";
      try {
        const res = await fetch("https://api.ipify.org?format=json");
        const data = (await res.json()) as { ip: string };
        if (data.ip) {
          detectedIp = data.ip;
        }
      } catch {
        try {
          const os = await import("node:os");
          const interfaces = os.networkInterfaces();
          for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name] || []) {
              if (net.family === "IPv4" && !net.internal) {
                detectedIp = net.address;
                break;
              }
            }
            if (detectedIp) break;
          }
        } catch {}
      }

      if (detectedIp) {
        const updated = await this.uow.webServerSettingsRepository.updateGlobal(
          {
            serverIp: detectedIp,
          },
        );
        if (updated) {
          settings = updated;
        }
      }
    }

    await this.caddyService.initializeCaddy(settings);
    const certificates =
      (await this.uow.certificateRepository.findAll?.()) ?? [];
    await this.caddyService.syncResourceConfigs(
      await this.uow.resourceRepository.findMany(),
      settings,
      certificates,
    );
    const status = await this.caddyService.getStatus();
    return { settings, status };
  }

  private getControlPlaneRoutes(): string {
    const dashboardHost = process.env.UPSTAND_DASHBOARD_HOST?.trim();
    const apiHost = process.env.UPSTAND_API_HOST?.trim();
    const docsHost = process.env.UPSTAND_DOCS_HOST?.trim();
    const validHost = (host: string | undefined) =>
      host && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host);

    if (!validHost(dashboardHost) || !validHost(apiHost)) return "";

    // These routes make the control plane reachable through the same managed
    // Caddy instance that later fronts deployed resources. They are seeded only
    // for a new installation; operator-authored snippets remain untouched.
    return `${dashboardHost} {
\tencode zstd gzip
\treverse_proxy upstand_web:3001 {
\t\tlb_try_duration 30s
\t\tlb_try_interval 250ms
\t}
}

${apiHost} {
\tencode zstd gzip
\treverse_proxy upstand_server:3000 {
\t\tlb_try_duration 30s
\t\tlb_try_interval 250ms
\t}
}${
      validHost(docsHost)
        ? `

${docsHost} {
	encode zstd gzip
	reverse_proxy upstand_fumadocs:4000 {
		lb_try_duration 30s
		lb_try_interval 250ms
	}
}`
        : ""
    }`;
  }
}
