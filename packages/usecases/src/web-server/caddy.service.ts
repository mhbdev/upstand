import { Readable } from "node:stream";
import type { DomainMapping, Resource } from "@upstand/domain";
import {
  parseDomainMappings,
  parseResourceAdvancedConfig,
} from "@upstand/domain";
import type Docker from "dockerode";
import { log } from "evlog";
import { getDockerInstance } from "../resource/docker-client";
import {
  ensureResourceOverlayNetwork,
  ensureUpstandOverlayNetwork,
  requireActiveManager,
} from "../swarm/swarm.helpers";

const CADDY_CONTAINER_NAME = "upstand-caddy";
const CADDY_IMAGE = "caddy:2.8-alpine";
const CADDYFILE_PATH = "/etc/caddy/Caddyfile";
const CADDYFILE_CANDIDATE_PATH = "/etc/caddy/Caddyfile.next";
const CADDYFILE_BACKUP_PATH = "/etc/caddy/Caddyfile.previous";
const CADDY_RUNTIME_VOLUME = "upstand-caddy-runtime";
const CADDY_DATA_VOLUME = "upstand-caddy-data";
const CADDY_CONFIG_VOLUME = "upstand-caddy-config";

export type CaddySettings = {
  letsEncryptEmail?: string | null;
  httpPort?: number;
  httpsPort?: number;
  enableHttp3?: boolean;
  globalCaddyfile?: string | null;
  caddySnippets?: string;
  caddyEnvironment?: string;
  caddyPorts?: string;
  caddyDashboardEnabled?: boolean;
};

type CaddyResource = Pick<
  Resource,
  "id" | "name" | "type" | "appName" | "domains" | "composeType"
> & { advancedConfig?: Resource["advancedConfig"] };

type CaddyRoute = DomainMapping & {
  resourceId: string;
  resourceName: string;
  upstream: string;
};

type PortMapping = {
  targetPort: number;
  publishedPort: number;
  protocol: "tcp" | "udp";
};

function sanitizeServiceName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, "-");
}

function caddySettingsWithDefaults(settings: CaddySettings = {}) {
  const effectiveSettings = {
    letsEncryptEmail: settings.letsEncryptEmail ?? null,
    httpPort: settings.httpPort ?? 80,
    httpsPort: settings.httpsPort ?? 443,
    enableHttp3: settings.enableHttp3 ?? true,
    globalCaddyfile: settings.globalCaddyfile ?? null,
    caddySnippets: settings.caddySnippets ?? "",
  };

  if (effectiveSettings.httpPort === effectiveSettings.httpsPort) {
    throw new Error("Caddy HTTP and HTTPS listener ports must be different");
  }

  return effectiveSettings;
}

function parseCaddyEnvironment(value?: string): string[] {
  if (!value) return [];

  let environment: unknown;
  try {
    environment = JSON.parse(value);
  } catch {
    throw new Error("Caddy environment variables must be valid JSON");
  }

  if (
    !environment ||
    typeof environment !== "object" ||
    Array.isArray(environment)
  ) {
    throw new Error("Caddy environment variables must be a JSON object");
  }

  return Object.entries(environment).map(([key, rawValue]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(`Invalid Caddy environment variable name: ${key}`);
    }
    if (["CADDY_ADMIN", "UPSTAND_CADDYFILE_B64"].includes(key)) {
      throw new Error(`${key} is managed by Upstand and cannot be overridden`);
    }
    if (typeof rawValue !== "string" && typeof rawValue !== "number") {
      throw new Error(
        `Caddy environment variable ${key} must be a string or number`,
      );
    }
    return `${key}=${rawValue}`;
  });
}

function validateGlobalOptions(value: string | null): void {
  if (!value) return;
  const forbidden = value.match(/^\s*(admin|http_port|https_port)\b/im)?.[1];
  if (forbidden) {
    throw new Error(
      `${forbidden} is managed by Upstand so public listeners and the private Caddy admin API remain reliable`,
    );
  }
}

function parseExtraPortMappings(value?: string): PortMapping[] {
  if (!value) return [];

  let ports: unknown;
  try {
    ports = JSON.parse(value);
  } catch {
    throw new Error("Additional Caddy ports must be valid JSON");
  }

  if (!Array.isArray(ports)) {
    throw new Error("Additional Caddy ports must be a JSON array");
  }

  const seenPublishedPorts = new Set<string>();
  return ports.map((rawPort) => {
    if (!rawPort || typeof rawPort !== "object" || Array.isArray(rawPort)) {
      throw new Error("Each additional Caddy port must be an object");
    }

    const port = rawPort as Record<string, unknown>;
    const targetPort = Number(port.targetPort);
    const publishedPort = Number(port.publishedPort);
    const protocol = port.protocol === "udp" ? "udp" : "tcp";

    if (
      !Number.isInteger(targetPort) ||
      !Number.isInteger(publishedPort) ||
      targetPort < 1 ||
      targetPort > 65535 ||
      publishedPort < 1 ||
      publishedPort > 65535
    ) {
      throw new Error("Additional Caddy ports must be between 1 and 65535");
    }

    if ([80, 443, 2019].includes(publishedPort)) {
      throw new Error(
        `Port ${publishedPort} is reserved for Caddy's public listeners or private admin API`,
      );
    }

    const key = `${publishedPort}/${protocol}`;
    if (seenPublishedPorts.has(key)) {
      throw new Error(
        `Additional Caddy port ${key} is configured more than once`,
      );
    }
    seenPublishedPorts.add(key);

    return { targetPort, publishedPort, protocol };
  });
}

function createTarArchive(fileName: string, content: string): Readable {
  const body = Buffer.from(content, "utf8");
  const header = Buffer.alloc(512, 0);
  const writeOctal = (offset: number, size: number, value: number) => {
    const encoded = value.toString(8).padStart(size - 1, "0");
    header.write(`${encoded}\0`, offset, size, "ascii");
  };

  header.write(fileName, 0, 100, "utf8");
  writeOctal(100, 8, 0o644);
  writeOctal(108, 8, 0);
  writeOctal(116, 8, 0);
  writeOctal(124, 12, body.length);
  writeOctal(136, 12, Math.floor(Date.now() / 1000));
  header.fill(0x20, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar", 257, 5, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeOctal(148, 8, checksum);

  const padding = Buffer.alloc((512 - (body.length % 512)) % 512, 0);
  return Readable.from([header, body, padding, Buffer.alloc(1024, 0)]);
}

function getRoutes(resources: CaddyResource[]): CaddyRoute[] {
  const routes: CaddyRoute[] = [];
  const routeOwners = new Map<string, string>();
  const hostHttps = new Map<string, boolean>();
  const hostCertificate = new Map<string, string>();

  for (const resource of resources) {
    let mappings: DomainMapping[];
    try {
      mappings = parseDomainMappings(resource.domains);
    } catch (error) {
      throw new Error(
        `Resource ${resource.name} (${resource.id}) has invalid domain mappings: ${error instanceof Error ? error.message : "unknown validation error"}`,
      );
    }

    for (const mapping of mappings) {
      const routeKey = `${mapping.host}${mapping.path}`;
      const owner = routeOwners.get(routeKey);
      if (owner) {
        throw new Error(
          `The route ${mapping.host}${mapping.path} is already assigned to ${owner}; a hostname and path can only be owned by one resource`,
        );
      }
      routeOwners.set(routeKey, resource.name);

      const httpsEnabled = hostHttps.get(mapping.host);
      if (httpsEnabled !== undefined && httpsEnabled !== mapping.https) {
        throw new Error(
          `All routes for ${mapping.host} must use the same HTTPS setting`,
        );
      }
      hostHttps.set(mapping.host, mapping.https);

      const certificateType = hostCertificate.get(mapping.host);
      if (
        certificateType !== undefined &&
        certificateType !== mapping.certificateType
      ) {
        throw new Error(
          `All HTTPS routes for ${mapping.host} must use the same certificate strategy`,
        );
      }
      hostCertificate.set(mapping.host, mapping.certificateType);

      if (resource.type === "compose" && !mapping.serviceName) {
        throw new Error(
          `Domain ${mapping.host}${mapping.path} on compose resource ${resource.name} needs an explicit service name`,
        );
      }

      const serviceName =
        mapping.serviceName ||
        sanitizeServiceName(resource.appName || resource.name);
      const upstreamServiceName =
        resource.type === "compose" &&
        resource.composeType !== "compose" &&
        mapping.serviceName
          ? `${sanitizeServiceName(resource.appName || resource.name)}_${sanitizeServiceName(mapping.serviceName)}`
          : serviceName;
      routes.push({
        ...mapping,
        resourceId: resource.id,
        resourceName: resource.name,
        upstream: `${upstreamServiceName}:${mapping.port}`,
      });
    }
  }

  return routes;
}

function routeBlock(route: CaddyRoute, index: number): string[] {
  const matcher = `@upstand_route_${index}`;
  const isRoot = route.path === "/";
  const lines = isRoot
    ? ["\thandle {"]
    : [
        `\t${matcher} path ${route.path} ${route.path}/*`,
        `\thandle ${matcher} {`,
      ];

  lines.push("\t\troute {");
  for (const middleware of route.middlewares) {
    lines.push(`\t\t\timport ${middleware}`);
  }

  if (route.stripPath && !isRoot) {
    lines.push(`\t\t\turi strip_prefix ${route.path}`);
    if (route.internalPath !== "/") {
      lines.push(`\t\t\trewrite ${route.internalPath}{uri}`);
    }
  } else if (!isRoot && route.internalPath !== route.path) {
    lines.push(`\t\t\turi replace ${route.path} ${route.internalPath}`);
  } else if (isRoot && route.internalPath !== "/") {
    lines.push(`\t\t\trewrite ${route.internalPath}{uri}`);
  }

  lines.push(`\t\t\treverse_proxy ${route.upstream} {`);
  // Swarm tasks can briefly disappear during a rolling update. Retry the
  // upstream while Docker's service DNS converges instead of returning an
  // avoidable 502 to the browser.
  lines.push("\t\t\tlb_try_duration 30s");
  lines.push("\t\t\tlb_try_interval 250ms");
  lines.push("\t\t}");
  lines.push("\t\t}");
  lines.push("\t}");
  return lines;
}

export function generateCaddyfileContent(
  settings: CaddySettings = {},
  resources: CaddyResource[] = [],
): string {
  const effectiveSettings = caddySettingsWithDefaults(settings);
  validateGlobalOptions(effectiveSettings.globalCaddyfile);
  const routes = getRoutes(resources);
  const groupedRoutes = new Map<string, CaddyRoute[]>();

  for (const route of routes) {
    const key = `${route.https ? "https" : "http"}:${route.host}`;
    const group = groupedRoutes.get(key) || [];
    group.push(route);
    groupedRoutes.set(key, group);
  }

  const globalOptions = [
    effectiveSettings.letsEncryptEmail
      ? `\temail ${effectiveSettings.letsEncryptEmail}`
      : "",
    effectiveSettings.httpPort !== 80
      ? `\thttp_port ${effectiveSettings.httpPort}`
      : "",
    effectiveSettings.httpsPort !== 443
      ? `\thttps_port ${effectiveSettings.httpsPort}`
      : "",
    effectiveSettings.globalCaddyfile?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n");

  const sites: string[] = [];
  for (const [key, routesForHost] of groupedRoutes) {
    const [protocol, host] = key.split(":", 2);
    const address = protocol === "https" ? host : `http://${host}`;
    const orderedRoutes = routesForHost.toSorted(
      (a, b) => b.path.length - a.path.length,
    );

    sites.push(`# upstand-domain ${host}`);
    sites.push(`${address} {`);
    sites.push("\tencode zstd gzip");
    const certificateType = routesForHost[0]?.certificateType;
    if (protocol === "https" && certificateType === "internal") {
      sites.push("\ttls internal");
    }
    orderedRoutes.forEach((route, index) => {
      sites.push(`# Resource: ${route.resourceName} (${route.resourceId})`);
      sites.push(...routeBlock(route, index));
    });
    if (!orderedRoutes.some((route) => route.path === "/")) {
      sites.push("\thandle {");
      sites.push('\t\trespond "Not found" 404');
      sites.push("\t}");
    }
    sites.push("}", "");
  }

  return [
    "{",
    globalOptions,
    "}",
    "",
    effectiveSettings.caddySnippets.trim(),
    "",
    "# Managed by Upstand. Do not edit this file directly.",
    "",
    ...sites,
  ]
    .filter(
      (line, index, lines) =>
        line || index === 0 || index === 2 || lines[index - 1] !== "",
    )
    .join("\n")
    .trimEnd()
    .concat("\n");
}

export class CaddyService {
  private readonly docker: Docker;
  private readonly networkName =
    process.env.DOCKER_NETWORK || "upstand-network";
  private configurationTail: Promise<void> = Promise.resolve();

  constructor(docker: Docker = getDockerInstance()) {
    this.docker = docker;
  }

  private async serializeConfiguration<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.configurationTail;
    let release: () => void = () => undefined;
    this.configurationTail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  private async initializeSwarm(): Promise<void> {
    await requireActiveManager(this.docker);
  }

  private async ensureNetwork(): Promise<void> {
    await this.initializeSwarm();
    await ensureUpstandOverlayNetwork(this.docker);
  }

  private async reconcileResourceNetworks(
    resources: CaddyResource[],
  ): Promise<Set<string>> {
    const routes = getRoutes(resources);
    if (routes.length === 0) return new Set();

    const sharedNetwork = await ensureUpstandOverlayNetwork(this.docker);
    const resourcesById = new Map(
      resources.map((resource) => [resource.id, resource]),
    );
    const networksByResource = new Map<string, { id: string; name: string }>();
    const desiredNetworkNames = new Set<string>();

    for (const route of routes) {
      const resource = resourcesById.get(route.resourceId);
      if (!resource) continue;

      let network = networksByResource.get(resource.id);
      if (!network) {
        const isolated = parseResourceAdvancedConfig(
          resource.advancedConfig,
        ).isolatedDeployment;
        network = isolated
          ? await ensureResourceOverlayNetwork(this.docker, resource.id)
          : { id: sharedNetwork.id, name: this.networkName };
        networksByResource.set(resource.id, network);
        desiredNetworkNames.add(network.name);

        try {
          await this.docker.getNetwork(network.name).connect({
            Container: CADDY_CONTAINER_NAME,
          });
        } catch (error: unknown) {
          const statusCode =
            typeof error === "object" && error !== null && "statusCode" in error
              ? error.statusCode
              : undefined;
          if (statusCode !== 403 && statusCode !== 409) throw error;
        }
      }

      const serviceName = route.upstream.slice(
        0,
        route.upstream.lastIndexOf(":"),
      );
      const service = this.docker.getService(serviceName);
      let inspect: Docker.Service;
      try {
        inspect = await service.inspect();
      } catch (error: unknown) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? error.statusCode
            : undefined;
        if (statusCode === 404) {
          log.warn({
            message: `Caddy upstream service '${serviceName}' does not exist yet.`,
          });
          continue;
        }
        throw error;
      }

      const serviceSpec = inspect.Spec;
      if (!serviceSpec) continue;
      const networks = serviceSpec.Networks || [];
      if (
        networks.some(
          (entry: { Target?: string }) => entry.Target === network.id,
        )
      ) {
        continue;
      }

      log.warn({
        message: `Repairing Caddy upstream service '${serviceName}' network attachment.`,
        networkId: network.id,
      });
      await service.update({
        version: inspect.Version?.Index,
        Name: serviceName,
        Mode: serviceSpec.Mode,
        TaskTemplate: serviceSpec.TaskTemplate,
        Networks: [...networks, { Target: network.id }],
        EndpointSpec: serviceSpec.EndpointSpec,
        UpdateConfig: serviceSpec.UpdateConfig,
        RollbackConfig: serviceSpec.RollbackConfig,
      });
    }

    return desiredNetworkNames;
  }

  private async detachStaleResourceNetworks(
    desiredNetworkNames: Set<string>,
  ): Promise<void> {
    const managedNetworks = await this.docker.listNetworks({
      filters: JSON.stringify({
        label: ["com.upstand.purpose=resource-isolation"],
      }),
    });

    for (const network of managedNetworks) {
      if (!network.Name || desiredNetworkNames.has(network.Name)) continue;
      try {
        await this.docker.getNetwork(network.Id).disconnect({
          Container: CADDY_CONTAINER_NAME,
          Force: true,
        });
        log.info({
          message: `Detached Caddy from stale resource network '${network.Name}'.`,
        });
      } catch (error: any) {
        if (error.statusCode !== 404 && error.statusCode !== 409) {
          log.warn({
            message: `Unable to detach Caddy from stale resource network '${network.Name}'.`,
            err: error.message || error,
          });
        }
      }
    }
  }

  private async ensureVolume(name: string): Promise<void> {
    const volumes = await this.docker.listVolumes();
    if (volumes.Volumes?.some((volume) => volume.Name === name)) return;
    await this.docker.createVolume({ Name: name });
  }

  private async ensureImage(): Promise<void> {
    const images = await this.docker.listImages();
    if (
      images.some((image) => image.RepoTags?.some((tag) => tag === CADDY_IMAGE))
    ) {
      return;
    }

    log.info({ message: `Pulling ${CADDY_IMAGE} image...` });
    const stream = await this.docker.pull(CADDY_IMAGE);
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (error) =>
        error ? reject(error) : resolve(),
      );
    });
  }

  private async findContainer() {
    const container = this.docker.getContainer(CADDY_CONTAINER_NAME);
    try {
      await container.inspect();
      return container;
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        error.statusCode === 404
      ) {
        return null;
      }
      throw error;
    }
  }

  async initializeCaddy(
    settings: CaddySettings = {},
    forceRecreate = false,
  ): Promise<void> {
    await this.serializeConfiguration(async () => {
      await this.ensureNetwork();
      await Promise.all([
        this.ensureVolume(CADDY_RUNTIME_VOLUME),
        this.ensureVolume(CADDY_DATA_VOLUME),
        this.ensureVolume(CADDY_CONFIG_VOLUME),
      ]);
      await this.ensureImage();

      let container = await this.findContainer();
      const existingContainer = container ? await container.inspect() : null;
      const hasManagedVolumes = [
        ["/etc/caddy", CADDY_RUNTIME_VOLUME],
        ["/data", CADDY_DATA_VOLUME],
        ["/config", CADDY_CONFIG_VOLUME],
      ].every(([destination, volume]) =>
        existingContainer?.Mounts?.some(
          (mount) =>
            mount.Destination === destination &&
            mount.Type === "volume" &&
            mount.Name === volume,
        ),
      );
      const shouldRecreate = forceRecreate || (container && !hasManagedVolumes);

      if (container && shouldRecreate) {
        if (existingContainer?.State.Running) await container.stop();
        await container.remove();
        container = null;
      }

      if (container) {
        const details = await container.inspect();
        if (!details.State.Running) await container.start();
        try {
          await this.docker.getNetwork(this.networkName).connect({
            Container: container.id,
          });
        } catch (error: unknown) {
          const statusCode =
            typeof error === "object" && error !== null && "statusCode" in error
              ? error.statusCode
              : undefined;
          if (statusCode !== 403 && statusCode !== 409) throw error;
        }
        return;
      }

      const effectiveSettings = caddySettingsWithDefaults(settings);
      const extraPorts = parseExtraPortMappings(settings.caddyPorts);
      const publicPorts: Record<string, Array<{ HostPort: string }>> = {
        [`${effectiveSettings.httpPort}/tcp`]: [{ HostPort: "80" }],
        [`${effectiveSettings.httpsPort}/tcp`]: [{ HostPort: "443" }],
      };
      const exposedPorts: Record<string, Record<string, never>> = {
        [`${effectiveSettings.httpPort}/tcp`]: {},
        [`${effectiveSettings.httpsPort}/tcp`]: {},
      };

      if (effectiveSettings.enableHttp3) {
        exposedPorts[`${effectiveSettings.httpsPort}/udp`] = {};
        publicPorts[`${effectiveSettings.httpsPort}/udp`] = [
          { HostPort: "443" },
        ];
      }
      for (const port of extraPorts) {
        const key = `${port.targetPort}/${port.protocol}`;
        exposedPorts[key] = {};
        publicPorts[key] = [{ HostPort: String(port.publishedPort) }];
      }

      const bootstrapConfig = Buffer.from(
        generateCaddyfileContent(effectiveSettings),
      ).toString("base64");
      const env = [
        ...parseCaddyEnvironment(settings.caddyEnvironment),
        `UPSTAND_CADDYFILE_B64=${bootstrapConfig}`,
      ];
      const created = await this.docker.createContainer({
        name: CADDY_CONTAINER_NAME,
        Image: CADDY_IMAGE,
        Env: env,
        Entrypoint: ["/bin/sh", "-ec"],
        Cmd: [
          `if [ ! -s ${CADDYFILE_PATH} ]; then printf '%s' "$UPSTAND_CADDYFILE_B64" | base64 -d > ${CADDYFILE_PATH}; fi; exec caddy run --config ${CADDYFILE_PATH} --adapter caddyfile`,
        ],
        ExposedPorts: exposedPorts,
        HostConfig: {
          RestartPolicy: { Name: "always" },
          PortBindings: publicPorts,
          Mounts: [
            {
              Type: "volume",
              Source: CADDY_RUNTIME_VOLUME,
              Target: "/etc/caddy",
            },
            { Type: "volume", Source: CADDY_DATA_VOLUME, Target: "/data" },
            { Type: "volume", Source: CADDY_CONFIG_VOLUME, Target: "/config" },
          ],
        },
      });

      const network = this.docker.getNetwork(this.networkName);
      await network.connect({ Container: created.id });
      await created.start();
      log.info({ message: "Caddy container created and started." });
    });
  }

  private async exec(
    container: ReturnType<Docker["getContainer"]>,
    command: string[],
  ): Promise<string> {
    const execution = await container.exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
      // Non-TTY Docker exec streams are multiplexed with an 8-byte header. Keep
      // the bytes intact and decode them once through cleanDockerLogs; treating
      // the stream as text produces the control characters visible in the UI.
      Tty: false,
    });
    const stream = await execution.start({});
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

    await new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    const result = await execution.inspect();
    const output = this.cleanDockerLogs(Buffer.concat(chunks));
    if (result.ExitCode !== 0) {
      throw new Error(
        output.trim() || `Command failed with exit code ${result.ExitCode}`,
      );
    }
    return this.cleanDockerLogs(Buffer.concat(chunks));
  }

  private async writeFile(
    container: ReturnType<Docker["getContainer"]>,
    fileName: string,
    content: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      container.putArchive(
        createTarArchive(fileName, content),
        { path: "/etc/caddy" },
        (error) => (error ? reject(error) : resolve()),
      );
    });
  }

  async syncResourceConfigs(
    resources: CaddyResource[],
    settings: CaddySettings = {},
  ): Promise<{ success: true; domains: string[]; changed: boolean }> {
    const caddyfile = generateCaddyfileContent(settings, resources);
    const domains = getRoutes(resources).map((route) => route.host);
    let changed = false;

    await this.initializeCaddy(settings);
    const desiredNetworkNames = await this.reconcileResourceNetworks(resources);
    await this.serializeConfiguration(async () => {
      const container = await this.findContainer();
      if (!container) throw new Error("Caddy container is not available");

      await this.writeFile(container, "Caddyfile.next", caddyfile);

      try {
        await this.exec(container, [
          "caddy",
          "fmt",
          "--overwrite",
          CADDYFILE_CANDIDATE_PATH,
        ]);
        const [activeConfig, candidateConfig] = await Promise.all([
          this.exec(container, ["cat", CADDYFILE_PATH]),
          this.exec(container, ["cat", CADDYFILE_CANDIDATE_PATH]),
        ]);
        if (activeConfig === candidateConfig) {
          await this.exec(container, [
            "/bin/sh",
            "-ec",
            `rm -f ${CADDYFILE_CANDIDATE_PATH}`,
          ]);
          return;
        }

        changed = true;
        await this.exec(container, [
          "/bin/sh",
          "-ec",
          `cp ${CADDYFILE_PATH} ${CADDYFILE_BACKUP_PATH}`,
        ]);
        await this.exec(container, [
          "caddy",
          "validate",
          "--config",
          CADDYFILE_CANDIDATE_PATH,
          "--adapter",
          "caddyfile",
        ]);
        await this.exec(container, [
          "/bin/sh",
          "-ec",
          `mv ${CADDYFILE_CANDIDATE_PATH} ${CADDYFILE_PATH}`,
        ]);
        await this.exec(container, [
          "caddy",
          "reload",
          "--config",
          CADDYFILE_PATH,
          "--adapter",
          "caddyfile",
        ]);
        await this.exec(container, [
          "/bin/sh",
          "-ec",
          `rm -f ${CADDYFILE_BACKUP_PATH}`,
        ]);
      } catch (error) {
        try {
          await this.exec(container, [
            "/bin/sh",
            "-ec",
            `if [ -f ${CADDYFILE_BACKUP_PATH} ]; then mv ${CADDYFILE_BACKUP_PATH} ${CADDYFILE_PATH}; fi; rm -f ${CADDYFILE_CANDIDATE_PATH}`,
          ]);
        } catch (rollbackError) {
          log.error({
            message:
              "Failed to restore the last valid Caddyfile after an unsuccessful reload",
            err:
              rollbackError instanceof Error
                ? rollbackError.message
                : rollbackError,
          });
        }
        throw error;
      }
    });
    await this.detachStaleResourceNetworks(desiredNetworkNames);

    log.info({
      message: "Caddy configuration synchronized successfully.",
      domainCount: new Set(domains).size,
      changed,
    });
    return { success: true, domains: [...new Set(domains)].sort(), changed };
  }

  async reloadCaddy(): Promise<{ success: boolean; error?: string }> {
    try {
      const container = await this.findContainer();
      if (!container) throw new Error("Caddy container is not available");
      await this.exec(container, [
        "caddy",
        "reload",
        "--config",
        CADDYFILE_PATH,
        "--adapter",
        "caddyfile",
      ]);
      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reload Caddy";
      log.error({ message: "Error reloading Caddy", err: message });
      return { success: false, error: message };
    }
  }

  async getStatus() {
    const container = await this.findContainer();
    if (!container) {
      return {
        running: false,
        status: "not-created",
        uptime: "0s",
        ports: [],
        activeDomainsCount: 0,
        activeDomains: [],
        mainCaddyfile: "# Caddy has not been initialized.",
      };
    }

    const inspect = await container.inspect();
    const startedAt = inspect.State.StartedAt
      ? new Date(inspect.State.StartedAt).getTime()
      : Date.now();
    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - startedAt) / 1000),
    );
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const uptime =
      hours > 0
        ? `${hours}h ${minutes}m`
        : `${minutes}m ${elapsedSeconds % 60}s`;
    const ports = Object.entries(inspect.NetworkSettings?.Ports || {})
      .flatMap(
        ([port, bindings]) =>
          bindings?.map((binding) => `${binding.HostPort} (${port})`) || [],
      )
      .sort();

    let mainCaddyfile = "# Caddyfile unavailable.";
    let activeDomains: string[] = [];
    try {
      mainCaddyfile = await this.exec(container, ["cat", CADDYFILE_PATH]);
      activeDomains = [
        ...new Set(
          [...mainCaddyfile.matchAll(/^# upstand-domain ([^\s]+)$/gm)]
            .map((match) => match[1])
            .filter((domain): domain is string => Boolean(domain)),
        ),
      ].sort();
    } catch (error) {
      log.warn({
        message: "Unable to read active Caddy configuration",
        err: error instanceof Error ? error.message : error,
      });
    }

    return {
      running: inspect.State.Running,
      status: inspect.State.Status,
      uptime,
      ports,
      activeDomainsCount: activeDomains.length,
      activeDomains,
      mainCaddyfile,
    };
  }

  async getLogs(tail = 100): Promise<string> {
    try {
      const container = await this.findContainer();
      if (!container) return "Caddy container has not been initialized.";
      const logs = await container.logs({ stdout: true, stderr: true, tail });
      return this.cleanDockerLogs(logs);
    } catch (error) {
      return `Failed to fetch Caddy logs: ${error instanceof Error ? error.message : "unknown error"}`;
    }
  }

  private cleanDockerLogs(buffer: Buffer): string {
    let output = "";
    let offset = 0;

    while (offset + 8 <= buffer.length) {
      const size = buffer.readUInt32BE(offset + 4);
      offset += 8;
      if (offset + size > buffer.length) return buffer.toString("utf8");
      output += buffer.toString("utf8", offset, offset + size);
      offset += size;
    }

    return output || buffer.toString("utf8");
  }

  async restartCaddy(): Promise<{ success: boolean; error?: string }> {
    try {
      const container = await this.findContainer();
      if (!container) throw new Error("Caddy container is not available");
      await container.restart();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to restart Caddy",
      };
    }
  }
}
