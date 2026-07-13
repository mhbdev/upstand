import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  type ApplicationBuildConfig,
  ConflictError,
  isSupportedDatabaseImage,
  parseApplicationBuildConfig,
  parseResourceAdvancedConfig,
  type Resource,
  type ResourceAdvancedConfig,
} from "@upstand/domain";
import type Docker from "dockerode";
import { log } from "evlog";
import yaml from "yaml";
import {
  ensureResourceOverlayNetwork,
  ensureUpstandOverlayNetwork,
  isManager,
  isSwarmActive,
} from "../swarm/swarm.helpers";
import { getDockerInstance } from "./docker-client";

export interface ContainerRuntimeStats {
  cpu: number;
  ram: number;
  ramUsage: number;
  ramLimit: number;
  networkRxBytes: number;
  networkTxBytes: number;
}

export interface ServerRuntimeStats {
  collectedAt: string;
  serverName: string;
  dockerVersion: string;
  cpu: number;
  cpuCores: number;
  memoryUsage: number;
  memoryTotal: number;
  memoryPercent: number;
  activeContainers: number;
  networkRxBytes: number;
  networkTxBytes: number;
  dockerImageBytes: number;
  dockerContainerBytes: number;
  dockerVolumeBytes: number;
}

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberValue = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
};

const stringValue = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];
  return typeof value === "string" ? value : "unknown";
};

const sumDockerUsage = (value: unknown): number =>
  Array.isArray(value)
    ? value.reduce(
        (total, item) =>
          isUnknownRecord(item) ? total + numberValue(item, "Size") : total,
        0,
      )
    : 0;

function composeMap(value: unknown): Record<string, string> {
  if (isUnknownRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([, item]) => typeof item === "string" || typeof item === "number",
        )
        .map(([key, item]) => [key, String(item)]),
    );
  }
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.flatMap((item) => {
        if (typeof item !== "string") return [];
        const separator = item.indexOf("=");
        return separator === -1
          ? [[item, ""]]
          : [[item.slice(0, separator), item.slice(separator + 1)]];
      }),
    );
  }
  return {};
}

function applyComposeResourceConfig(
  rawCompose: string,
  resource: Resource,
  config: ResourceAdvancedConfig,
): string {
  const parsed = yaml.parse(rawCompose) as {
    services?: Record<string, Record<string, unknown>>;
  };
  if (!parsed?.services || typeof parsed.services !== "object")
    return rawCompose;
  const services = parsed.services;

  const resourceEnvironment = (() => {
    try {
      const value = JSON.parse(resource.envVars || "{}");
      return isUnknownRecord(value) ? composeMap(value) : {};
    } catch {
      return {};
    }
  })();
  const serviceNames = config.serviceName
    ? [config.serviceName]
    : Object.keys(parsed.services);
  const missingService = serviceNames.find((name) => !services[name]);
  if (missingService) {
    throw new Error(`Compose service '${missingService}' was not found`);
  }

  for (const serviceName of serviceNames) {
    const service = services[serviceName];
    if (!service) {
      throw new Error(`Compose service '${serviceName}' was not found`);
    }
    const environment = {
      ...composeMap(service.environment),
      ...resourceEnvironment,
      ...config.environment,
    };
    if (Object.keys(environment).length) service.environment = environment;

    const labels = { ...composeMap(service.labels), ...config.labels };
    if (Object.keys(labels).length) service.labels = labels;

    if (config.command.length) service.entrypoint = config.command;
    if (config.args.length) service.command = config.args;
    if (config.workingDir) service.working_dir = config.workingDir;
    if (config.user) service.user = config.user;
    if (config.hostname) service.hostname = config.hostname;
    if (config.dns.length) service.dns = config.dns;
    if (config.dnsSearch.length) service.dns_search = config.dnsSearch;
    if (config.extraHosts.length) service.extra_hosts = config.extraHosts;
    if (config.capAdd.length) service.cap_add = config.capAdd;
    if (config.capDrop.length) service.cap_drop = config.capDrop;
    if (config.init) service.init = true;
    if (config.readOnlyRootFilesystem) service.read_only = true;
    if (config.privileged) service.privileged = true;
    if (config.tty) service.tty = true;
    if (config.stopGracePeriodSeconds !== undefined) {
      service.stop_grace_period = `${config.stopGracePeriodSeconds}s`;
    }

    if (config.ports.length) {
      const currentPorts = Array.isArray(service.ports) ? service.ports : [];
      const additionalPorts = config.ports.map(
        (port) =>
          `${port.publishedPort}:${port.targetPort}${port.protocol === "udp" ? "/udp" : ""}`,
      );
      service.ports = [...new Set([...currentPorts, ...additionalPorts])];
    }
    if (config.volumes.length) {
      const currentVolumes = Array.isArray(service.volumes)
        ? service.volumes
        : [];
      const additionalVolumes = config.volumes.map(
        (volume) =>
          `${volume.source}:${volume.target}${volume.readOnly ? ":ro" : ""}`,
      );
      service.volumes = [...new Set([...currentVolumes, ...additionalVolumes])];
    }

    const deploy = isUnknownRecord(service.deploy) ? service.deploy : {};
    if (config.replicas !== undefined) deploy.replicas = config.replicas;
    if (config.placementConstraints.length) {
      deploy.placement = {
        ...(isUnknownRecord(deploy.placement) ? deploy.placement : {}),
        constraints: config.placementConstraints,
      };
    }
    if (config.resources.cpuLimit || config.resources.memoryLimitMb) {
      const existingResources = isUnknownRecord(deploy.resources)
        ? deploy.resources
        : {};
      deploy.resources = {
        ...existingResources,
        limits: {
          ...(isUnknownRecord(existingResources.limits)
            ? existingResources.limits
            : {}),
          ...(config.resources.cpuLimit
            ? { cpus: String(config.resources.cpuLimit) }
            : {}),
          ...(config.resources.memoryLimitMb
            ? { memory: `${config.resources.memoryLimitMb}M` }
            : {}),
        },
      };
    }
    if (Object.keys(deploy).length) service.deploy = deploy;
    if (config.restartPolicy.condition !== "any") {
      service.restart =
        config.restartPolicy.condition === "on-failure" ? "on-failure" : "no";
    }
    if (config.healthcheck) {
      service.healthcheck = {
        test: config.healthcheck.command,
        interval: `${config.healthcheck.intervalSeconds}s`,
        timeout: `${config.healthcheck.timeoutSeconds}s`,
        retries: config.healthcheck.retries,
        start_period: `${config.healthcheck.startPeriodSeconds}s`,
      };
    }
  }

  return yaml.stringify(parsed);
}

export class DockerService {
  private readonly docker = getDockerInstance();
  private readonly networkName =
    process.env.DOCKER_NETWORK || "upstand-network";

  private applyAdvancedConfig(
    resource: Resource,
    containerSpec: Record<string, unknown>,
    taskTemplate: Record<string, unknown>,
    endpointSpec: Record<string, unknown>,
    baseConstraints: string[] = [],
    serviceSpec?: Record<string, unknown>,
  ): void {
    const config = parseResourceAdvancedConfig(resource.advancedConfig);
    if (config.command.length) containerSpec.Command = config.command;
    if (config.args.length) containerSpec.Args = config.args;
    if (config.environment && Object.keys(config.environment).length) {
      const currentEnv = Array.isArray(containerSpec.Env)
        ? containerSpec.Env.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      const overrides = new Map(
        currentEnv.map((value) => {
          const split = value.indexOf("=");
          return [split === -1 ? value : value.slice(0, split), value] as const;
        }),
      );
      for (const [key, value] of Object.entries(config.environment)) {
        overrides.set(key, `${key}=${value}`);
      }
      containerSpec.Env = [...overrides.values()];
    }
    if (config.labels && Object.keys(config.labels).length) {
      containerSpec.Labels = config.labels;
    }
    if (config.volumes.length) {
      const existingMounts = Array.isArray(containerSpec.Mounts)
        ? containerSpec.Mounts
        : [];
      containerSpec.Mounts = [
        ...existingMounts,
        ...config.volumes.map((volume) => ({
          Type: "volume",
          Source: volume.source,
          Target: volume.target,
          ReadOnly: volume.readOnly,
        })),
      ];
    }
    if (config.healthcheck) {
      containerSpec.Healthcheck = {
        Test: ["CMD-SHELL", config.healthcheck.command.join(" ")],
        Interval: config.healthcheck.intervalSeconds * 1_000_000_000,
        Timeout: config.healthcheck.timeoutSeconds * 1_000_000_000,
        Retries: config.healthcheck.retries,
        StartPeriod: config.healthcheck.startPeriodSeconds * 1_000_000_000,
      };
    }
    containerSpec.Init = config.init;
    containerSpec.ReadOnly = config.readOnlyRootFilesystem;
    containerSpec.TTY = config.tty;
    containerSpec.Privileged = config.privileged;
    if (config.stopGracePeriodSeconds !== undefined) {
      containerSpec.StopGracePeriod =
        config.stopGracePeriodSeconds * 1_000_000_000;
    }
    if (config.workingDir) containerSpec.Dir = config.workingDir;
    if (config.user) containerSpec.User = config.user;
    if (config.hostname) containerSpec.Hostname = config.hostname;
    if (config.dns.length) containerSpec.DNS = config.dns;
    if (config.dnsSearch.length) containerSpec.DNSSearch = config.dnsSearch;
    if (config.extraHosts.length) containerSpec.Hosts = config.extraHosts;
    if (Object.keys(config.sysctls).length)
      containerSpec.Sysctls = config.sysctls;
    if (config.capAdd.length) containerSpec.CapAdd = config.capAdd;
    if (config.capDrop.length) containerSpec.CapDrop = config.capDrop;

    const resources = config.resources;
    if (resources.cpuLimit || resources.memoryLimitMb) {
      taskTemplate.Resources = {
        ...(taskTemplate.Resources as Record<string, unknown> | undefined),
        Limits: {
          ...(resources.cpuLimit
            ? { NanoCPUs: Math.round(resources.cpuLimit * 1_000_000_000) }
            : {}),
          ...(resources.memoryLimitMb
            ? { MemoryBytes: resources.memoryLimitMb * 1024 * 1024 }
            : {}),
        },
      };
    }
    if (resources.cpuReservation || resources.memoryReservationMb) {
      taskTemplate.Resources = {
        ...(taskTemplate.Resources as Record<string, unknown> | undefined),
        Reservations: {
          ...(resources.cpuReservation
            ? { NanoCPUs: Math.round(resources.cpuReservation * 1_000_000_000) }
            : {}),
          ...(resources.memoryReservationMb
            ? { MemoryBytes: resources.memoryReservationMb * 1024 * 1024 }
            : {}),
        },
      };
    }

    const restart = config.restartPolicy;
    taskTemplate.RestartPolicy = {
      Condition: restart.condition,
      ...(restart.maxAttempts ? { MaxAttempts: restart.maxAttempts } : {}),
      ...(restart.delaySeconds
        ? { Delay: restart.delaySeconds * 1_000_000_000 }
        : {}),
      ...(restart.windowSeconds
        ? { Window: restart.windowSeconds * 1_000_000_000 }
        : {}),
    };
    const constraints = [...baseConstraints, ...config.placementConstraints];
    if (constraints.length) {
      taskTemplate.Placement = {
        ...(taskTemplate.Placement as Record<string, unknown> | undefined),
        Constraints: [...new Set(constraints)],
      };
    }
    if (config.replicas !== undefined) {
      (serviceSpec ?? taskTemplate).Mode = {
        Replicated: { Replicas: config.replicas },
      };
    }
    const toDuration = (seconds?: number) =>
      seconds === undefined ? undefined : seconds * 1_000_000_000;
    const serviceConfig = (serviceSpec ?? taskTemplate) as Record<
      string,
      unknown
    >;
    const update = config.updateConfig;
    if (Object.keys(update).length) {
      const updateConfig = {
        ...update,
        ...(toDuration(update.delaySeconds) !== undefined
          ? { Delay: toDuration(update.delaySeconds) }
          : {}),
        ...(toDuration(update.monitorSeconds) !== undefined
          ? { Monitor: toDuration(update.monitorSeconds) }
          : {}),
      } as Record<string, unknown>;
      delete updateConfig.delaySeconds;
      delete updateConfig.monitorSeconds;
      serviceConfig.UpdateConfig = updateConfig;
    }
    const rollback = config.rollbackConfig;
    if (Object.keys(rollback).length) {
      const rollbackConfig = {
        ...rollback,
        ...(toDuration(rollback.delaySeconds) !== undefined
          ? { Delay: toDuration(rollback.delaySeconds) }
          : {}),
        ...(toDuration(rollback.monitorSeconds) !== undefined
          ? { Monitor: toDuration(rollback.monitorSeconds) }
          : {}),
      } as Record<string, unknown>;
      delete rollbackConfig.delaySeconds;
      delete rollbackConfig.monitorSeconds;
      serviceConfig.RollbackConfig = rollbackConfig;
    }
    if (config.ports.length) {
      endpointSpec.Ports = [
        ...(Array.isArray(endpointSpec.Ports) ? endpointSpec.Ports : []),
        ...config.ports.map((port) => ({
          Protocol: port.protocol,
          PublishedPort: port.publishedPort,
          TargetPort: port.targetPort,
          PublishMode: "ingress",
        })),
      ];
    }
  }

  public sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]/g, "-");
  }

  async initializeSwarm(): Promise<void> {
    const info = await this.docker.info();
    if (!isSwarmActive(info)) {
      throw new ConflictError(
        "Docker Swarm is inactive. Initialize it from the Docker Swarm dashboard with a routable advertise address before deploying resources.",
      );
    }
    if (!isManager(info)) {
      throw new ConflictError(
        "This Upstand instance is attached to a Swarm worker. Deployments must run through a reachable manager Docker API.",
      );
    }
  }

  async ensureNetwork(): Promise<string> {
    await this.initializeSwarm();
    const network = await ensureUpstandOverlayNetwork(this.docker);
    return network.id;
  }

  private async ensureDeploymentNetwork(resource: Resource): Promise<{
    id: string;
    name: string;
    isolated: boolean;
  }> {
    const isolated = parseResourceAdvancedConfig(
      resource.advancedConfig,
    ).isolatedDeployment;
    if (isolated) {
      const network = await ensureResourceOverlayNetwork(
        this.docker,
        resource.id,
      );
      return { ...network, isolated: true };
    }

    return {
      id: await this.ensureNetwork(),
      name: this.networkName,
      isolated: false,
    };
  }

  async deployDatabase(
    resource: Resource,
    envVars: Record<string, string>,
    onLog?: (log: string) => void,
    constraints?: string[],
  ): Promise<void> {
    const serviceName = this.sanitizeName(resource.appName || resource.name);
    const networkId = (await this.ensureDeploymentNetwork(resource)).id;

    let image = "";
    let targetPath = "";
    const ports: number[] = [];
    const defaultEnv: Record<string, string> = {};

    const dbType = resource.dbType?.toLowerCase() || "";
    if (dbType === "postgres") {
      image =
        resource.dockerImage &&
        isSupportedDatabaseImage(dbType, resource.dockerImage)
          ? resource.dockerImage
          : "postgres:16-alpine";
      targetPath = "/var/lib/postgresql/data";
      ports.push(5432);
      defaultEnv.POSTGRES_USER = envVars.POSTGRES_USER || "upstand";
      defaultEnv.POSTGRES_PASSWORD =
        envVars.POSTGRES_PASSWORD || "upstand-password";
      defaultEnv.POSTGRES_DB = envVars.POSTGRES_DB || "upstand";
    } else if (dbType === "mysql" || dbType === "mariadb") {
      image =
        resource.dockerImage &&
        isSupportedDatabaseImage(dbType, resource.dockerImage)
          ? resource.dockerImage
          : dbType === "mysql"
            ? "mysql:8.0"
            : "mariadb:11";
      targetPath = "/var/lib/mysql";
      ports.push(3306);
      defaultEnv.MYSQL_ROOT_PASSWORD =
        envVars.MYSQL_ROOT_PASSWORD || "upstand-password";
      defaultEnv.MYSQL_DATABASE = envVars.MYSQL_DATABASE || "upstand";
      defaultEnv.MYSQL_USER = envVars.MYSQL_USER || "upstand";
      defaultEnv.MYSQL_PASSWORD = envVars.MYSQL_PASSWORD || "upstand-password";
    } else if (dbType === "mongodb") {
      image =
        resource.dockerImage &&
        isSupportedDatabaseImage(dbType, resource.dockerImage)
          ? resource.dockerImage
          : "mongo:7.0";
      targetPath = "/data/db";
      ports.push(27017);
      defaultEnv.MONGO_INITDB_ROOT_USERNAME =
        envVars.MONGO_INITDB_ROOT_USERNAME || "upstand";
      defaultEnv.MONGO_INITDB_ROOT_PASSWORD =
        envVars.MONGO_INITDB_ROOT_PASSWORD || "upstand-password";
    } else if (dbType === "redis") {
      image =
        resource.dockerImage &&
        isSupportedDatabaseImage(dbType, resource.dockerImage)
          ? resource.dockerImage
          : "redis:7-alpine";
      targetPath = "/data";
      ports.push(6379);
    } else {
      throw new Error(`Unsupported database type: ${dbType}`);
    }

    if (onLog) onLog(`Pulling database image: ${image}...\n`);
    try {
      const stream = await this.docker.pull(image);
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(
          stream,
          (err) => (err ? reject(err) : resolve()),
          (event) => {
            if (onLog && event) {
              const status = event.status || "";
              const progress = event.progress ? ` ${event.progress}` : "";
              const id = event.id ? ` [${event.id}]` : "";
              onLog(`${status}${progress}${id}\n`);
            }
          },
        );
      });
    } catch (err: any) {
      if (onLog)
        onLog(
          `Warning: Failed to pull database image: ${err.message}. Relying on local cache.\n`,
        );
    }

    const mergedEnv = { ...defaultEnv, ...envVars };
    const envArray = Object.entries(mergedEnv).map(([k, v]) => `${k}=${v}`);
    const volumeName = `upstand-db-data-${resource.id}`;

    const isDev = process.env.NODE_ENV === "development";
    const getPublishedPort = (p: number) => {
      if (!isDev) return p;
      if (p === 5432) return 5433;
      if (p === 3306) return 3307;
      if (p === 27017) return 27018;
      if (p === 6379) return 6380;
      return p + 1;
    };

    const containerSpec: any = {
      Image: image,
      Env: envArray,
      Mounts: [
        {
          Type: "volume",
          Source: volumeName,
          Target: targetPath,
        },
      ],
    };

    if (dbType === "redis") {
      const redisPassword = envVars.REDIS_PASSWORD || "";
      if (redisPassword) {
        containerSpec.Command = [
          "redis-server",
          "--requirepass",
          redisPassword,
        ];
      }
    }

    const spec: Docker.CreateServiceOptions = {
      Name: serviceName,
      TaskTemplate: {
        ContainerSpec: containerSpec,
        RestartPolicy: {
          Condition: "any",
        },
        Placement: constraints ? { Constraints: constraints } : undefined,
      },
      Networks: [{ Target: networkId }],
      EndpointSpec: {
        Ports: ports.map((p) => ({
          Protocol: "tcp",
          PublishedPort: getPublishedPort(p),
          TargetPort: p,
          PublishMode: "ingress",
        })),
      },
    };

    const endpointSpec = spec.EndpointSpec || {};
    spec.EndpointSpec = endpointSpec;
    this.applyAdvancedConfig(
      resource,
      containerSpec,
      spec.TaskTemplate as Record<string, unknown>,
      spec.EndpointSpec as Record<string, unknown>,
      constraints,
      spec as Record<string, unknown>,
    );

    await this.upsertService(serviceName, spec);
    await this.ensureServiceNetwork(serviceName, networkId);
  }

  async deployAppImage(
    resource: Resource,
    envVars: Record<string, string>,
    onLog?: (log: string) => void,
    constraints?: string[],
  ): Promise<void> {
    const serviceName = this.sanitizeName(resource.appName || resource.name);
    const networkId = (await this.ensureDeploymentNetwork(resource)).id;

    if (!resource.dockerImage) {
      throw new Error("No Docker image specified for application resource");
    }

    if (onLog) onLog(`Pulling application image: ${resource.dockerImage}...\n`);
    try {
      const stream = await this.docker.pull(resource.dockerImage);
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(
          stream,
          (err) => (err ? reject(err) : resolve()),
          (event) => {
            if (onLog && event) {
              const status = event.status || "";
              const progress = event.progress ? ` ${event.progress}` : "";
              const id = event.id ? ` [${event.id}]` : "";
              onLog(`${status}${progress}${id}\n`);
            }
          },
        );
      });
    } catch (err: any) {
      if (onLog)
        onLog(
          `Warning: Failed to pull image: ${err.message}. Relying on local cache.\n`,
        );
    }

    const envArray = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);

    const spec: Docker.CreateServiceOptions = {
      Name: serviceName,
      TaskTemplate: {
        ContainerSpec: {
          Image: resource.dockerImage,
          Env: envArray,
        },
        RestartPolicy: {
          Condition: "any",
        },
        Placement: constraints ? { Constraints: constraints } : undefined,
      },
      Networks: [{ Target: networkId }],
    };

    const endpointSpec = spec.EndpointSpec || {};
    spec.EndpointSpec = endpointSpec;
    this.applyAdvancedConfig(
      resource,
      (spec.TaskTemplate as { ContainerSpec?: Record<string, unknown> })
        .ContainerSpec as Record<string, unknown>,
      spec.TaskTemplate as Record<string, unknown>,
      endpointSpec as Record<string, unknown>,
      constraints,
      spec as Record<string, unknown>,
    );

    await this.upsertService(serviceName, spec);
    await this.ensureServiceNetwork(serviceName, networkId);
  }

  async deployAppGit(
    resource: Resource,
    envVars: Record<string, string>,
    cloneUrl: string,
    onLog: (log: string) => void,
    sshKeyPath?: string,
    constraints?: string[],
  ): Promise<void> {
    const serviceName = this.sanitizeName(resource.appName || resource.name);
    const imageName = `upstand-app-${resource.id}:latest`;
    const networkId = (await this.ensureDeploymentNetwork(resource)).id;

    const buildDir = path.join(process.cwd(), ".builds");
    const clonePath = path.join(buildDir, resource.id);

    if (fs.existsSync(clonePath)) {
      onLog("Cleaning up old build directory...\n");
      fs.rmSync(clonePath, { recursive: true, force: true });
    }
    fs.mkdirSync(clonePath, { recursive: true });

    let branch = "main";
    let submodules = false;
    try {
      if (resource.credentials) {
        const config: unknown = JSON.parse(resource.credentials);
        if (isUnknownRecord(config)) {
          const configuredBranch = config.branch;
          branch =
            typeof configuredBranch === "string" && configuredBranch.trim()
              ? configuredBranch.trim()
              : branch;
          submodules = config.enableSubmodules === true;
        }
      }
    } catch {
      // Credentials are optional for direct Git providers; defaults remain safe.
    }

    onLog(`Cloning branch ${branch} into ${clonePath}...\n`);
    await this.runCommandAsync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--branch",
        branch,
        "--single-branch",
        cloneUrl,
        clonePath,
      ],
      onLog,
      sshKeyPath
        ? {
            ...process.env,
            GIT_SSH_COMMAND: `ssh -i "${sshKeyPath}" -o StrictHostKeyChecking=accept-new`,
          }
        : undefined,
    );

    if (submodules) {
      onLog("Initializing submodules...\n");
      await this.runCommandAsync(
        "git",
        ["-C", clonePath, "submodule", "update", "--init", "--recursive"],
        onLog,
        sshKeyPath
          ? {
              ...process.env,
              GIT_SSH_COMMAND: `ssh -i "${sshKeyPath}" -o StrictHostKeyChecking=accept-new`,
            }
          : undefined,
      );
    }

    try {
      const buildConfig = parseApplicationBuildConfig(resource.buildConfig);
      await this.buildApplicationImage(
        clonePath,
        imageName,
        buildConfig,
        envVars,
        onLog,
      );

      onLog("Deploying Swarm Service...\n");
      const envArray = Object.entries(envVars).map(
        ([key, value]) => `${key}=${value}`,
      );
      const runtimeCommand = this.getRuntimeCommand(clonePath);

      const spec: Docker.CreateServiceOptions = {
        Name: serviceName,
        TaskTemplate: {
          ContainerSpec: {
            Image: imageName,
            Env: envArray,
            ...(runtimeCommand ? { Command: runtimeCommand } : {}),
          },
          RestartPolicy: {
            Condition: "any",
          },
          Placement: constraints ? { Constraints: constraints } : undefined,
        },
        Networks: [{ Target: networkId }],
      };

      const endpointSpec = spec.EndpointSpec || {};
      spec.EndpointSpec = endpointSpec;
      this.applyAdvancedConfig(
        resource,
        (spec.TaskTemplate as { ContainerSpec?: Record<string, unknown> })
          .ContainerSpec as Record<string, unknown>,
        spec.TaskTemplate as Record<string, unknown>,
        endpointSpec as Record<string, unknown>,
        constraints,
        spec as Record<string, unknown>,
      );

      await this.upsertService(serviceName, spec);
      await this.ensureServiceNetwork(serviceName, networkId);
    } finally {
      onLog("Cleaning up build directory...\n");
      fs.rmSync(clonePath, { recursive: true, force: true });
    }
  }

  async readComposeFileFromGit(
    resource: Resource,
    cloneUrl: string,
    onLog: (log: string) => void,
    sshKeyPath?: string,
  ): Promise<string> {
    const buildDir = path.join(process.cwd(), ".builds");
    const clonePath = path.join(buildDir, `${resource.id}-compose`);
    fs.rmSync(clonePath, { recursive: true, force: true });
    fs.mkdirSync(buildDir, { recursive: true });

    let branch = "main";
    let composePath = "docker-compose.yml";
    let submodules = false;
    try {
      const config: unknown = JSON.parse(resource.credentials || "{}");
      if (isUnknownRecord(config)) {
        if (typeof config.branch === "string" && config.branch.trim()) {
          branch = config.branch.trim();
        }
        if (
          typeof config.composePath === "string" &&
          config.composePath.trim()
        ) {
          composePath = config.composePath.trim();
        }
        submodules = config.enableSubmodules === true;
      }
    } catch {
      // Defaults are safe when optional source metadata is malformed.
    }

    const sshEnvironment = sshKeyPath
      ? {
          ...process.env,
          GIT_SSH_COMMAND: `ssh -i "${sshKeyPath}" -o StrictHostKeyChecking=accept-new`,
        }
      : undefined;
    try {
      onLog(`Cloning branch ${branch} into ${clonePath}...\n`);
      await this.runCommandAsync(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--branch",
          branch,
          "--single-branch",
          cloneUrl,
          clonePath,
        ],
        onLog,
        sshEnvironment,
      );
      if (submodules) {
        await this.runCommandAsync(
          "git",
          ["-C", clonePath, "submodule", "update", "--init", "--recursive"],
          onLog,
          sshEnvironment,
        );
      }

      const resolvedComposePath = path.resolve(clonePath, composePath);
      const cloneRoot = `${path.resolve(clonePath)}${path.sep}`;
      if (!resolvedComposePath.startsWith(cloneRoot)) {
        throw new Error(
          "Compose path must stay inside the checked-out repository",
        );
      }
      if (!fs.existsSync(resolvedComposePath)) {
        throw new Error(`Compose file not found at '${composePath}'`);
      }
      return fs.readFileSync(resolvedComposePath, "utf8");
    } finally {
      fs.rmSync(clonePath, { recursive: true, force: true });
    }
  }

  private async buildApplicationImage(
    clonePath: string,
    imageName: string,
    config: ApplicationBuildConfig,
    envVars: Record<string, string>,
    onLog: (log: string) => void,
  ): Promise<void> {
    switch (config.type) {
      case "dockerfile":
        await this.buildDockerfileImage(clonePath, imageName, config, onLog);
        return;
      case "railpack":
        await this.buildRailpackImage(
          clonePath,
          imageName,
          config.railpackVersion,
          envVars,
          onLog,
        );
        return;
      case "nixpacks":
        await this.buildNixpacksImage(
          clonePath,
          imageName,
          config.publishDirectory,
          envVars,
          onLog,
        );
        return;
      case "heroku-buildpacks":
        await this.buildPackImage(
          clonePath,
          imageName,
          `heroku/builder:${config.herokuVersion}`,
          envVars,
          "Heroku Buildpacks",
          onLog,
        );
        return;
      case "paketo-buildpacks":
        await this.buildPackImage(
          clonePath,
          imageName,
          "paketobuildpacks/builder-jammy-full",
          envVars,
          "Paketo Buildpacks",
          onLog,
        );
        return;
      case "static":
        await this.buildStaticImage(
          clonePath,
          imageName,
          config.publishDirectory,
          config.spa,
          onLog,
        );
        return;
    }
  }

  private getRuntimeCommand(clonePath: string): string[] | undefined {
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(clonePath, "package.json"), "utf8"),
      ) as { scripts?: { start?: string } };
      // Docusaurus binds its development server to localhost by default. A
      // Swarm service must listen on the task interface for Caddy to reach it.
      if (packageJson.scripts?.start?.includes("docusaurus start")) {
        return ["/bin/bash", "-lc", "npm run start -- --host 0.0.0.0"];
      }
    } catch {
      // A repository without package metadata keeps the image's native CMD.
    }
    return undefined;
  }

  private async buildDockerfileImage(
    clonePath: string,
    imageName: string,
    config: Extract<ApplicationBuildConfig, { type: "dockerfile" }>,
    onLog: (log: string) => void,
  ): Promise<void> {
    const dockerfilePath = this.resolveBuildPath(
      clonePath,
      config.dockerfilePath,
      "Dockerfile path",
    );
    const contextPath = this.resolveBuildPath(
      clonePath,
      config.dockerContextPath,
      "Docker context path",
    );

    if (!fs.statSync(dockerfilePath).isFile()) {
      throw new Error("Dockerfile path must point to a file");
    }
    if (!fs.statSync(contextPath).isDirectory()) {
      throw new Error("Docker context path must point to a directory");
    }

    const args = ["build", "--file", dockerfilePath, "--tag", imageName];
    if (config.dockerBuildStage) {
      args.push("--target", config.dockerBuildStage);
    }
    for (const [key, value] of Object.entries(config.dockerBuildArgs)) {
      args.push("--build-arg", `${key}=${value}`);
    }
    args.push(contextPath);

    onLog(`Building Dockerfile image ${imageName}...\n`);
    await this.runCommandAsync("docker", args, onLog);
  }

  private async buildRailpackImage(
    clonePath: string,
    imageName: string,
    version: string,
    envVars: Record<string, string>,
    onLog: (log: string) => void,
  ): Promise<void> {
    const railpack = await this.ensureRailpack(version, onLog);
    const planPath = path.join(clonePath, "railpack-plan.json");
    const infoPath = path.join(clonePath, "railpack-info.json");
    const buildEnvironment = this.getBuildEnvironment(envVars);
    const environmentKeys = Object.keys(envVars).sort();

    onLog(`Preparing Railpack v${version} build plan...\n`);
    await this.runCommandAsync(
      railpack,
      [
        "prepare",
        clonePath,
        "--plan-out",
        planPath,
        "--info-out",
        infoPath,
        ...environmentKeys.flatMap((key) => ["--env", key]),
      ],
      onLog,
      buildEnvironment,
    );

    const builderName = `upstand-railpack-${createHash("sha256")
      .update(`${imageName}:${Date.now()}`)
      .digest("hex")
      .slice(0, 12)}`;
    const secretHash = createHash("sha256")
      .update(
        Object.entries(envVars)
          .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
          .map(([key, value]) => `${key}=${value}`)
          .join("\n"),
      )
      .digest("hex");

    try {
      onLog("Validating Docker Buildx availability...\n");
      await this.runCommandAsync("docker", ["buildx", "version"], onLog);
      onLog("Starting an isolated BuildKit builder for Railpack...\n");
      await this.runCommandAsync(
        "docker",
        [
          "buildx",
          "create",
          "--name",
          builderName,
          "--driver",
          "docker-container",
        ],
        onLog,
      );
      await this.runCommandAsync(
        "docker",
        ["buildx", "inspect", "--builder", builderName, "--bootstrap"],
        onLog,
      );

      const buildArgs = [
        "buildx",
        "build",
        "--builder",
        builderName,
        "--build-arg",
        `BUILDKIT_SYNTAX=ghcr.io/railwayapp/railpack-frontend:v${version}`,
        "--build-arg",
        `secrets-hash=${secretHash}`,
        "--file",
        planPath,
        "--output",
        `type=docker,name=${imageName}`,
      ];
      for (const key of environmentKeys) {
        buildArgs.push("--secret", `type=env,id=${key}`);
      }
      buildArgs.push(clonePath);

      onLog(`Building Railpack v${version} image ${imageName}...\n`);
      await this.runCommandAsync("docker", buildArgs, onLog, buildEnvironment);
    } finally {
      await this.runCommandAsync(
        "docker",
        ["buildx", "rm", "--force", builderName],
        () => {},
      ).catch(() => undefined);
    }
  }

  private async buildNixpacksImage(
    clonePath: string,
    imageName: string,
    publishDirectory: string | undefined,
    envVars: Record<string, string>,
    onLog: (log: string) => void,
  ): Promise<void> {
    const environmentKeys = Object.keys(envVars).sort();
    const buildArgs = ["build", clonePath, "--name", imageName];
    for (const key of environmentKeys) {
      buildArgs.push("--env", key);
    }
    if (publishDirectory) {
      buildArgs.push("--no-error-without-start");
    }

    onLog(`Building Nixpacks image ${imageName}...\n`);
    await this.runCommandAsync(
      "nixpacks",
      buildArgs,
      onLog,
      this.getBuildEnvironment(envVars),
    );

    if (!publishDirectory) {
      return;
    }

    const exportDirectory = this.resolveBuildPath(
      clonePath,
      publishDirectory,
      "Nixpacks publish directory",
      false,
    );
    const containerName = `upstand-export-${createHash("sha256")
      .update(`${imageName}:${Date.now()}`)
      .digest("hex")
      .slice(0, 12)}`;
    fs.mkdirSync(exportDirectory, { recursive: true });
    try {
      await this.runCommandAsync(
        "docker",
        ["create", "--name", containerName, imageName],
        onLog,
      );
      await this.runCommandAsync(
        "docker",
        ["cp", `${containerName}:/app/${publishDirectory}/.`, exportDirectory],
        onLog,
      );
      await this.buildStaticImage(
        clonePath,
        imageName,
        publishDirectory,
        false,
        onLog,
      );
    } finally {
      await this.runCommandAsync(
        "docker",
        ["rm", "--force", containerName],
        () => {},
      ).catch(() => undefined);
    }
  }

  private async buildPackImage(
    clonePath: string,
    imageName: string,
    builder: string,
    envVars: Record<string, string>,
    label: string,
    onLog: (log: string) => void,
  ): Promise<void> {
    const args = [
      "build",
      imageName,
      "--path",
      clonePath,
      "--builder",
      builder,
    ];
    for (const key of Object.keys(envVars).sort()) {
      // Pack resolves a value-less key from its process environment. This keeps
      // build secrets out of the process argument list and deployment logs.
      args.push("--env", key);
    }
    onLog(`Building ${label} image ${imageName}...\n`);
    await this.runCommandAsync(
      "pack",
      args,
      onLog,
      this.getBuildEnvironment(envVars),
    );
  }

  private async buildStaticImage(
    clonePath: string,
    imageName: string,
    publishDirectory: string,
    spa: boolean,
    onLog: (log: string) => void,
  ): Promise<void> {
    const resolvedPublishDirectory = this.resolveBuildPath(
      clonePath,
      publishDirectory,
      "Static publish directory",
    );
    if (!fs.statSync(resolvedPublishDirectory).isDirectory()) {
      throw new Error("Static publish directory must point to a directory");
    }

    const staticContext = path.join(
      path.dirname(clonePath),
      `.upstand-static-${createHash("sha256")
        .update(`${imageName}:${Date.now()}`)
        .digest("hex")
        .slice(0, 12)}`,
    );
    const assetsDirectory = path.join(staticContext, "site");
    const dockerfilePath = path.join(staticContext, "Dockerfile");
    const nginxConfigPath = path.join(staticContext, "nginx.conf");
    const dockerfile = [
      "FROM nginx:1.29-alpine",
      "WORKDIR /usr/share/nginx/html",
      ...(spa
        ? [
            'COPY [".upstand-static.nginx.conf", "/etc/nginx/conf.d/default.conf"]',
          ]
        : []),
      'COPY ["site/", "."]',
    ].join("\n");
    const nginxConfig = [
      "server {",
      "  listen 80;",
      "  server_name _;",
      "  root /usr/share/nginx/html;",
      "  index index.html;",
      spa
        ? "  location / { try_files $uri $uri/ /index.html; }"
        : "  location / { try_files $uri $uri/ =404; }",
      "}",
    ].join("\n");

    fs.mkdirSync(staticContext, { recursive: true });
    fs.cpSync(resolvedPublishDirectory, assetsDirectory, {
      recursive: true,
      filter: (source) => {
        const name = path.basename(source);
        return name !== ".git" && name !== ".env" && !name.startsWith(".env.");
      },
    });
    fs.writeFileSync(dockerfilePath, dockerfile, "utf8");
    if (spa) {
      fs.writeFileSync(nginxConfigPath, nginxConfig, "utf8");
    }
    try {
      onLog(`Building ${spa ? "SPA" : "static"} image ${imageName}...\n`);
      await this.runCommandAsync(
        "docker",
        ["build", "--file", dockerfilePath, "--tag", imageName, staticContext],
        onLog,
      );
    } finally {
      fs.rmSync(staticContext, { recursive: true, force: true });
    }
  }

  private resolveBuildPath(
    clonePath: string,
    requestedPath: string,
    label: string,
    mustExist = true,
  ): string {
    if (path.isAbsolute(requestedPath)) {
      throw new Error(`${label} must be relative to the repository root`);
    }

    const root = fs.realpathSync(clonePath);
    const candidate = path.resolve(root, requestedPath);
    const relative = path.relative(root, candidate);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error(`${label} must stay within the repository root`);
    }
    if (!mustExist) {
      return candidate;
    }
    if (!fs.existsSync(candidate)) {
      throw new Error(`${label} does not exist: ${requestedPath}`);
    }
    const realCandidate = fs.realpathSync(candidate);
    const realRelative = path.relative(root, realCandidate);
    if (
      realRelative === ".." ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    ) {
      throw new Error(`${label} resolves outside the repository root`);
    }
    return realCandidate;
  }

  private getBuildEnvironment(
    envVars: Record<string, string>,
  ): NodeJS.ProcessEnv {
    return { ...process.env, ...envVars };
  }

  private async ensureRailpack(
    version: string,
    onLog: (log: string) => void,
  ): Promise<string> {
    const platform = process.arch === "arm64" ? "arm64" : "x86_64";
    const target = `${platform}-unknown-linux-musl`;
    const toolsDirectory = path.join(
      process.cwd(),
      ".tools",
      `railpack-${version}`,
    );
    const binaryPath = path.join(toolsDirectory, "railpack");
    if (fs.existsSync(binaryPath)) {
      return binaryPath;
    }

    fs.mkdirSync(toolsDirectory, { recursive: true });
    const archivePath = path.join(toolsDirectory, "railpack.tar.gz");
    const releaseUrl = `https://github.com/railwayapp/railpack/releases/download/v${version}/railpack-v${version}-${target}.tar.gz`;
    onLog(`Downloading pinned Railpack v${version} binary...\n`);
    try {
      await this.runCommandAsync(
        "curl",
        [
          "--fail",
          "--location",
          "--retry",
          "3",
          "--retry-all-errors",
          "--output",
          archivePath,
          releaseUrl,
        ],
        onLog,
      );
      await this.runCommandAsync(
        "tar",
        ["-xzf", archivePath, "-C", toolsDirectory],
        onLog,
      );
      fs.chmodSync(binaryPath, 0o755);
      return binaryPath;
    } catch (error) {
      fs.rmSync(toolsDirectory, { recursive: true, force: true });
      throw error;
    } finally {
      fs.rmSync(archivePath, { force: true });
    }
  }

  async deployComposeStack(
    resource: Resource,
    rawCompose: string,
    onLog: (log: string) => void,
    constraints?: string[],
  ): Promise<void> {
    const stackName = this.sanitizeName(resource.appName || resource.name);
    const deploymentNetwork = await this.ensureDeploymentNetwork(resource);

    const buildDir = path.join(process.cwd(), ".builds");
    const composeDir = path.join(buildDir, resource.id);
    fs.mkdirSync(composeDir, { recursive: true });
    const composePath = path.join(composeDir, "docker-compose.yml");

    const advancedConfig = parseResourceAdvancedConfig(resource.advancedConfig);
    let composeContent = applyComposeResourceConfig(
      rawCompose,
      resource,
      advancedConfig,
    );
    if (
      !advancedConfig.isolatedDeployment &&
      !composeContent.includes("networks:")
    ) {
      composeContent += `\n\nnetworks:\n  default:\n    name: ${this.networkName}\n    external: true\n`;
    }

    if (advancedConfig.isolatedDeployment) {
      try {
        const parsed = yaml.parse(composeContent) as {
          services?: Record<string, Record<string, unknown>>;
          networks?: Record<string, unknown>;
          volumes?: unknown;
        };
        if (!parsed?.services || typeof parsed.services !== "object") {
          throw new Error(
            "Compose file must define services for isolated deployment",
          );
        }

        const ingressNetwork = "upstand_ingress";
        parsed.networks = {
          ...(parsed.networks || {}),
          [ingressNetwork]: {
            name: deploymentNetwork.name,
            external: true,
          },
        };

        for (const service of Object.values(parsed.services)) {
          const networks = service.networks;
          if (!networks) {
            service.networks = [ingressNetwork];
          } else if (Array.isArray(networks)) {
            if (!networks.includes(ingressNetwork))
              networks.push(ingressNetwork);
          } else if (typeof networks === "object") {
            service.networks = { ...networks, [ingressNetwork]: {} };
          } else {
            service.networks = [ingressNetwork];
          }
        }

        if (advancedConfig.isolatedDeploymentsVolume) {
          const volumePrefix = `${stackName}_`;
          const isNamedVolume = (source: unknown): source is string =>
            typeof source === "string" &&
            source.length > 0 &&
            !source.startsWith(".") &&
            !source.startsWith("/") &&
            !source.startsWith("~") &&
            !source.includes("/");
          const volumeNames = new Map<string, string>();
          const renameVolume = (source: unknown) => {
            if (!isNamedVolume(source)) return source;
            const renamed =
              volumeNames.get(source) || `${volumePrefix}${source}`;
            volumeNames.set(source, renamed);
            return renamed;
          };

          if (parsed.volumes && typeof parsed.volumes === "object") {
            const volumes = parsed.volumes as Record<string, unknown>;
            const renamedVolumes: Record<string, unknown> = {};
            for (const [name, definition] of Object.entries(volumes)) {
              const renamed = renameVolume(name) as string;
              if (definition && typeof definition === "object") {
                const nextDefinition = {
                  ...(definition as Record<string, unknown>),
                };
                if (typeof nextDefinition.name === "string") {
                  nextDefinition.name = renameVolume(nextDefinition.name);
                }
                renamedVolumes[renamed] = nextDefinition;
              } else {
                renamedVolumes[renamed] = definition;
              }
            }
            parsed.volumes = renamedVolumes;
          }

          for (const service of Object.values(parsed.services)) {
            if (!Array.isArray(service.volumes)) continue;
            service.volumes = service.volumes.map((volume) => {
              if (typeof volume === "string") {
                const [source, ...rest] = volume.split(":");
                const renamed = renameVolume(source);
                return rest.length ? [renamed, ...rest].join(":") : renamed;
              }
              if (volume && typeof volume === "object") {
                const nextVolume = { ...(volume as Record<string, unknown>) };
                nextVolume.source = renameVolume(nextVolume.source);
                return nextVolume;
              }
              return volume;
            });
          }
        }

        composeContent = yaml.stringify(parsed);
      } catch (error) {
        throw new Error(
          `Unable to prepare isolated Compose deployment: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Inject placement constraints if provided
    if (constraints && constraints.length > 0) {
      try {
        const parsed = yaml.parse(composeContent);
        if (parsed && typeof parsed === "object" && parsed.services) {
          for (const serviceName of Object.keys(parsed.services)) {
            const service = parsed.services[serviceName];
            if (service && typeof service === "object") {
              if (!service.deploy) {
                service.deploy = {};
              }
              if (!service.deploy.placement) {
                service.deploy.placement = {};
              }
              if (!service.deploy.placement.constraints) {
                service.deploy.placement.constraints = [];
              }
              for (const c of constraints) {
                if (!service.deploy.placement.constraints.includes(c)) {
                  service.deploy.placement.constraints.push(c);
                }
              }
            }
          }
          composeContent = yaml.stringify(parsed);
        }
      } catch (err) {
        onLog(
          `Warning: Failed to inject Swarm placement constraints: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }

    fs.writeFileSync(composePath, composeContent, "utf8");

    const composeCommand =
      resource.composeType === "compose"
        ? [
            "compose",
            "--project-name",
            stackName,
            "--file",
            composePath,
            "up",
            "--detach",
            "--remove-orphans",
          ]
        : ["stack", "deploy", "--compose-file", composePath, stackName];
    onLog(
      resource.composeType === "compose"
        ? `Deploying Docker Compose project '${stackName}'...\n`
        : `Deploying Docker Swarm stack '${stackName}'...\n`,
    );
    await this.runCommandAsync("docker", composeCommand, onLog);

    // Clean up
    fs.rmSync(composeDir, { recursive: true, force: true });
  }

  async controlService(
    resource: Resource,
    cmd: "start" | "stop" | "restart",
  ): Promise<void> {
    const serviceName = this.sanitizeName(resource.appName || resource.name);

    if (resource.type === "compose") {
      // Compose resources are either Docker Compose projects or Swarm stacks.
      if (cmd === "stop") {
        if (resource.composeType === "compose") {
          const containers = await this.docker.listContainers({
            all: true,
            filters: JSON.stringify({
              label: [`com.docker.compose.project=${serviceName}`],
            }),
          });
          await Promise.all(
            containers.map((container: any) =>
              this.docker.getContainer(container.Id).remove({ force: true }),
            ),
          );
        } else {
          await this.runCommandAsync(
            "docker",
            ["stack", "rm", serviceName],
            () => {},
          );
        }
      } else if (cmd === "start" || cmd === "restart") {
        let composeFile = "";
        try {
          if (resource.credentials) {
            const config = JSON.parse(resource.credentials);
            composeFile = config.composeFile || "";
          }
        } catch {}
        if (!composeFile) {
          throw new Error("No compose file configuration found to start stack");
        }
        await this.deployComposeStack(resource, composeFile, () => {});
      }
      return;
    }

    // Single Swarm Service control
    const service = this.docker.getService(serviceName);
    let inspect: any = null;
    try {
      inspect = await service.inspect();
    } catch (err: any) {
      if (err.statusCode === 404 && cmd === "start") {
        const envVars = JSON.parse(resource.envVars || "{}");
        if (resource.type === "database") {
          log.info({
            message: `Swarm service '${serviceName}' not found. Deploying database service...`,
          });
          await this.deployDatabase(resource, envVars);
          return;
        }
        if (
          resource.type === "application" &&
          resource.provider === "docker-registry"
        ) {
          log.info({
            message: `Swarm service '${serviceName}' not found. Deploying application image...`,
          });
          await this.deployAppImage(resource, envVars);
          return;
        }
        throw new Error(
          `Service '${serviceName}' not found. Please deploy the resource first.`,
        );
      }
      throw err;
    }

    if (cmd === "stop") {
      log.info({ message: `Stopping Swarm service '${serviceName}'...` });
      await service.update({
        version: inspect.Version.Index,
        Name: serviceName,
        Mode: { Replicated: { Replicas: 0 } },
        TaskTemplate: inspect.Spec.TaskTemplate,
        Networks: inspect.Spec.Networks,
      });
    } else if (cmd === "start") {
      log.info({ message: `Starting Swarm service '${serviceName}'...` });
      await service.update({
        version: inspect.Version.Index,
        Name: serviceName,
        Mode: { Replicated: { Replicas: 1 } },
        TaskTemplate: inspect.Spec.TaskTemplate,
        Networks: inspect.Spec.Networks,
        EndpointSpec: inspect.Spec.EndpointSpec,
      });
    } else if (cmd === "restart") {
      log.info({ message: `Restarting Swarm service '${serviceName}'...` });
      // Update task template with a restart timestamp env var to force update
      const taskTemplate = inspect.Spec.TaskTemplate || {};
      const containerSpec = taskTemplate.ContainerSpec || {};
      const env = containerSpec.Env || [];
      const filteredEnv = env.filter(
        (e: string) => !e.startsWith("UPSTAND_RESTART="),
      );
      filteredEnv.push(`UPSTAND_RESTART=${Date.now()}`);
      containerSpec.Env = filteredEnv;

      await service.update({
        version: inspect.Version.Index,
        Name: serviceName,
        Mode: inspect.Spec.Mode,
        TaskTemplate: taskTemplate,
        Networks: inspect.Spec.Networks,
        EndpointSpec: inspect.Spec.EndpointSpec,
      });
    }
  }

  async getContainers(resource: Resource): Promise<any[]> {
    const nameFilter = this.sanitizeName(resource.appName || resource.name);

    if (resource.type === "compose") {
      if (resource.composeType === "compose") {
        try {
          const containers = await this.docker.listContainers({
            all: true,
            filters: JSON.stringify({
              label: [`com.docker.compose.project=${nameFilter}`],
            }),
          });
          return containers.map((container: any) => ({
            id: container.Id.substring(0, 12),
            name: (container.Names?.[0] || container.Id).replace(/^\//, ""),
            status: container.State || "unknown",
            ports:
              container.Ports?.map((port: any) =>
                port.PublicPort
                  ? `${port.PublicPort}:${port.PrivatePort}`
                  : `${port.PrivatePort}`,
              ).join(", ") || "N/A",
            node: "local",
          }));
        } catch (err: any) {
          log.error({
            message: "Error getting Docker Compose containers",
            err: err.message,
          });
          return [];
        }
      }

      // Find all services in the stack
      try {
        const services = await this.docker.listServices({
          filters: JSON.stringify({
            label: [`com.docker.stack.namespace=${nameFilter}`],
          }),
        });

        const containersList: any[] = [];
        const nodes = await this.docker.listNodes().catch(() => []);
        const nodeMap = new Map(
          nodes.map((n: any) => [n.ID, n.Description?.Hostname || n.ID]),
        );

        for (const s of services) {
          const sAny = s as any;
          const serviceName = sAny.Spec?.Name || "";
          const tasks = await this.docker.listTasks({
            filters: JSON.stringify({
              service: [serviceName],
            }),
          });

          for (const task of tasks) {
            if (
              task.DesiredState === "running" ||
              task.Status?.State === "running"
            ) {
              const nodeName =
                nodeMap.get(task.NodeID) || task.NodeID || "local";
              const ports =
                sAny.Endpoint?.Ports?.map(
                  (p: any) => `${p.PublishedPort}:${p.TargetPort}`,
                ).join(", ") || "N/A";
              containersList.push({
                id: task.ID.substring(0, 12),
                name: `${serviceName}.${task.Slot || 1}`,
                status: task.Status?.State || "unknown",
                ports,
                node: nodeName,
              });
            }
          }
        }
        return containersList;
      } catch (err: any) {
        log.error({
          message: "Error getting compose stack containers",
          err: err.message,
        });
        return [];
      }
    }

    // Single Swarm Service
    try {
      const services = await this.docker.listServices({
        filters: JSON.stringify({ name: [nameFilter] }),
      });
      if (services.length === 0) {
        return [];
      }

      const s = services[0];
      const sAny = s as any;
      const serviceName = sAny.Spec?.Name || "";
      const tasks = await this.docker.listTasks({
        filters: JSON.stringify({
          service: [serviceName],
        }),
      });

      const nodes = await this.docker.listNodes().catch(() => []);
      const nodeMap = new Map(
        nodes.map((n: any) => [n.ID, n.Description?.Hostname || n.ID]),
      );

      return tasks
        .filter(
          (task) =>
            task.DesiredState === "running" || task.Status?.State === "running",
        )
        .map((task) => {
          const nodeName = nodeMap.get(task.NodeID) || task.NodeID || "local";
          const ports =
            sAny.Endpoint?.Ports?.map(
              (p: any) => `${p.PublishedPort}:${p.TargetPort}`,
            ).join(", ") || "N/A";
          return {
            id: task.ID.substring(0, 12),
            name: `${serviceName}.${task.Slot || 1}`,
            status: task.Status?.State || "unknown",
            ports,
            node: nodeName,
          };
        });
    } catch (err: any) {
      log.error({
        message: "Error getting service containers",
        err: err.message,
      });
      return [];
    }
  }

  /**
   * Returns DNS names that Caddy can reach over Upstand's attachable overlay
   * network. Compose stacks expose their individual Swarm service names.
   */
  async getRoutingServices(resource: Resource): Promise<string[]> {
    const resourceName = this.sanitizeName(resource.appName || resource.name);
    try {
      if (resource.type === "compose" && resource.composeType === "compose") {
        const containers = await this.docker.listContainers({
          all: true,
          filters: JSON.stringify({
            label: [`com.docker.compose.project=${resourceName}`],
          }),
        });
        return containers
          .map((container: any) => container.Names?.[0]?.replace(/^\//, ""))
          .filter((name): name is string => Boolean(name))
          .sort();
      }

      const services = await this.docker.listServices(
        resource.type === "compose"
          ? {
              filters: JSON.stringify({
                label: [`com.docker.stack.namespace=${resourceName}`],
              }),
            }
          : { filters: JSON.stringify({ name: [resourceName] }) },
      );

      const names = services
        .map((service: any) => service.Spec?.Name)
        .filter((name): name is string => Boolean(name));

      // A resource can be configured before its first deployment. The default
      // Swarm service name is still a valid future target in that case.
      return resource.type === "compose"
        ? [...new Set(names)].sort()
        : [...new Set([resourceName, ...names])].sort();
    } catch (error: any) {
      log.error({
        message: "Failed to discover Caddy routing services",
        resourceId: resource.id,
        err: error.message || error,
      });
      return resource.type === "compose" ? [] : [resourceName];
    }
  }

  async getLogs(
    resource: Resource,
    containerId?: string,
    tail = 150,
  ): Promise<string> {
    const serviceName = this.sanitizeName(resource.appName || resource.name);
    try {
      if (containerId) {
        // Fetch logs for a specific Swarm task/container
        const task = await this.docker
          .getTask(containerId)
          .inspect()
          .catch(() => null);
        if (task?.Status?.ContainerStatus?.ContainerID) {
          const container = this.docker.getContainer(
            task.Status.ContainerStatus.ContainerID,
          );
          try {
            const buffer = await container.logs({
              stdout: true,
              stderr: true,
              tail,
              timestamps: true,
            });
            return this.cleanDockerLogs(buffer);
          } catch (err: any) {
            return `No logs found for container task: ${err.message}`;
          }
        }

        // Try raw container ID
        try {
          const container = this.docker.getContainer(containerId);
          const buffer = (await container.logs({
            stdout: true,
            stderr: true,
            tail,
            timestamps: true,
          })) as any as Buffer;
          if (buffer) {
            return this.cleanDockerLogs(buffer);
          }
        } catch (err: any) {
          return `No logs found for container: ${err.message}`;
        }
      }

      // Default to combined Service logs
      if (resource.type === "compose") {
        // Compose Stack combined logs: find services and get logs for first running container
        const containers = await this.getContainers(resource);
        if (containers.length > 0) {
          return await this.getLogs(resource, containers[0].id, tail);
        }
        return "No active stack containers found to read logs from.";
      }

      try {
        const service = this.docker.getService(serviceName);
        const buffer = (await service.logs({
          stdout: true,
          stderr: true,
          tail,
          timestamps: true,
        })) as any as Buffer;
        return this.cleanDockerLogs(buffer);
      } catch (err: any) {
        if (
          err.statusCode === 404 ||
          err.message?.includes("no such service")
        ) {
          return `No logs found. The Swarm service '${serviceName}' has not been deployed yet, is starting up, or is stopped.`;
        }
        throw err;
      }
    } catch (err: any) {
      return `Failed to fetch logs: ${err.message}`;
    }
  }

  private cleanDockerLogs(buffer: Buffer): string {
    let result = "";
    let offset = 0;
    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) break;
      const size = buffer.readUInt32BE(offset + 4);
      offset += 8;

      if (offset + size > buffer.length) {
        result += buffer.toString("utf8", offset);
        break;
      }

      result += buffer.toString("utf8", offset, offset + size);
      offset += size;
    }
    return result || buffer.toString("utf8");
  }

  private async upsertService(
    serviceName: string,
    spec: Docker.CreateServiceOptions,
  ): Promise<void> {
    try {
      const service = this.docker.getService(serviceName);
      const inspect = await service.inspect();
      log.info({
        message: `Updating existing Swarm service '${serviceName}'...`,
      });
      await service.update({
        version: inspect.Version.Index,
        Name: serviceName,
        TaskTemplate: spec.TaskTemplate,
        Networks: spec.Networks,
        EndpointSpec: spec.EndpointSpec,
      });
    } catch (err: any) {
      if (err.statusCode === 404) {
        log.info({ message: `Creating new Swarm service '${serviceName}'...` });
        await this.docker.createService(spec);
      } else {
        throw err;
      }
    }
  }

  /**
   * Reconcile the network separately from the service spec update. Existing
   * services may have been created before the shared overlay was introduced,
   * and Docker does not retroactively attach those tasks when only the image
   * or environment changes.
   */
  private async ensureServiceNetwork(
    serviceName: string,
    networkId: string,
  ): Promise<void> {
    const service = this.docker.getService(serviceName);
    const inspect = await service.inspect();
    const networks = inspect.Spec?.Networks || [];
    if (
      networks.some(
        (network: { Target?: string }) => network.Target === networkId,
      )
    ) {
      return;
    }

    log.warn({
      message: `Attaching existing Swarm service '${serviceName}' to the Upstand overlay network.`,
      networkId,
    });
    await service.update({
      version: inspect.Version.Index,
      Name: serviceName,
      Mode: inspect.Spec.Mode,
      TaskTemplate: inspect.Spec.TaskTemplate,
      Networks: [...networks, { Target: networkId }],
      EndpointSpec: inspect.Spec.EndpointSpec,
      UpdateConfig: inspect.Spec.UpdateConfig,
      RollbackConfig: inspect.Spec.RollbackConfig,
    });
  }

  private runCommandAsync(
    cmd: string,
    args: string[],
    onLog: (log: string) => void,
    env?: NodeJS.ProcessEnv,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const p = spawn(cmd, args, {
        shell: false,
        env: env ? { ...process.env, ...env } : undefined,
      });

      p.stdout.on("data", (data) => {
        onLog(data.toString());
      });

      p.stderr.on("data", (data) => {
        onLog(data.toString());
      });

      p.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Command '${cmd} ${args.join(" ")}' failed with exit code ${code}`,
            ),
          );
        }
      });

      p.on("error", (err) => {
        reject(err);
      });
    });
  }

  async getContainerStats(containerId: string): Promise<ContainerRuntimeStats> {
    try {
      let realContainerId = containerId;
      const tasks = await this.docker
        .listTasks({
          filters: JSON.stringify({ id: [containerId] }),
        })
        .catch(() => []);

      if (tasks.length > 0 && tasks[0].Status?.ContainerStatus?.ContainerID) {
        realContainerId = tasks[0].Status.ContainerStatus.ContainerID;
      } else {
        const allTasks = await this.docker.listTasks().catch(() => []);
        const matchingTask = allTasks.find((t) => t.ID.startsWith(containerId));
        if (matchingTask?.Status?.ContainerStatus?.ContainerID) {
          realContainerId = matchingTask.Status.ContainerStatus.ContainerID;
        }
      }

      const container = this.docker.getContainer(realContainerId);
      const stats = await container.stats({ stream: false });

      let cpuPercent = 0;
      if (stats.cpu_stats && stats.precpu_stats) {
        const cpuDelta =
          stats.cpu_stats.cpu_usage.total_usage -
          stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta =
          stats.cpu_stats.system_cpu_usage -
          stats.precpu_stats.system_cpu_usage;
        const cpus =
          stats.cpu_stats.online_cpus ||
          stats.cpu_stats.cpu_usage.percpu_usage?.length ||
          1;
        if (systemDelta > 0 && cpuDelta > 0) {
          cpuPercent = (cpuDelta / systemDelta) * cpus * 100;
        }
      }

      let ramUsage = 0;
      let ramLimit = 0;
      let ramPercent = 0;
      if (stats.memory_stats) {
        ramUsage = stats.memory_stats.usage || 0;
        ramLimit = stats.memory_stats.limit || 1;
        ramPercent = (ramUsage / ramLimit) * 100;
      }

      const networkTotals = Object.values(stats.networks || {}).reduce(
        (total, network) => ({
          rx: total.rx + network.rx_bytes,
          tx: total.tx + network.tx_bytes,
        }),
        { rx: 0, tx: 0 },
      );

      return {
        cpu: Number.parseFloat(cpuPercent.toFixed(2)),
        ram: Number.parseFloat(ramPercent.toFixed(2)),
        ramUsage: Math.round(ramUsage / (1024 * 1024)),
        ramLimit: Math.round(ramLimit / (1024 * 1024)),
        networkRxBytes: networkTotals.rx,
        networkTxBytes: networkTotals.tx,
      };
    } catch (err: any) {
      log.error({
        message: "Failed to fetch container stats",
        err: err.message,
      });
      return {
        cpu: 0,
        ram: 0,
        ramUsage: 0,
        ramLimit: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
      };
    }
  }

  async getServerRuntimeStats(): Promise<ServerRuntimeStats> {
    const [rawInfo, rawDiskUsage, containers] = await Promise.all([
      this.docker.info() as Promise<unknown>,
      this.docker.df() as Promise<unknown>,
      this.docker.listContainers({ all: false }),
    ]);
    const info = isUnknownRecord(rawInfo) ? rawInfo : {};
    const diskUsage = isUnknownRecord(rawDiskUsage) ? rawDiskUsage : {};
    const containerStats = await Promise.all(
      containers.map((container) => this.getContainerStats(container.Id)),
    );
    const totals = containerStats.reduce<ContainerRuntimeStats>(
      (aggregate, current) => ({
        cpu: aggregate.cpu + current.cpu,
        ram: 0,
        ramUsage: aggregate.ramUsage + current.ramUsage,
        ramLimit: aggregate.ramLimit + current.ramLimit,
        networkRxBytes: aggregate.networkRxBytes + current.networkRxBytes,
        networkTxBytes: aggregate.networkTxBytes + current.networkTxBytes,
      }),
      {
        cpu: 0,
        ram: 0,
        ramUsage: 0,
        ramLimit: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
      },
    );
    const memoryTotal = Math.round(
      numberValue(info, "MemTotal") / (1024 * 1024),
    );

    return {
      collectedAt: new Date().toISOString(),
      serverName: stringValue(info, "Name"),
      dockerVersion: stringValue(info, "ServerVersion"),
      cpu: Number.parseFloat(totals.cpu.toFixed(2)),
      cpuCores: numberValue(info, "NCPU"),
      memoryUsage: totals.ramUsage,
      memoryTotal,
      memoryPercent:
        memoryTotal > 0
          ? Number.parseFloat(
              ((totals.ramUsage / memoryTotal) * 100).toFixed(2),
            )
          : 0,
      activeContainers: containers.length,
      networkRxBytes: totals.networkRxBytes,
      networkTxBytes: totals.networkTxBytes,
      dockerImageBytes: sumDockerUsage(diskUsage.Images),
      dockerContainerBytes: sumDockerUsage(diskUsage.Containers),
      dockerVolumeBytes: sumDockerUsage(diskUsage.Volumes),
    };
  }

  async removeResource(
    resource: Resource,
    deleteVolumes = false,
  ): Promise<void> {
    const serviceName = this.sanitizeName(resource.appName || resource.name);

    if (resource.type === "compose") {
      try {
        await this.runCommandAsync(
          "docker",
          ["stack", "rm", serviceName],
          () => {},
        );
      } catch (err: any) {
        log.error({
          message: `Failed to remove compose stack ${serviceName}`,
          err: err.message,
        });
      }

      if (deleteVolumes) {
        try {
          const volumesList = await this.docker.listVolumes();
          const volumes = volumesList.Volumes || [];
          for (const vol of volumes) {
            if (vol.Name.startsWith(`${serviceName}_`)) {
              await this.docker
                .getVolume(vol.Name)
                .remove()
                .catch(() => {});
            }
          }
        } catch (err: any) {
          log.error({
            message: "Failed to clean up compose stack volumes",
            err: err.message,
          });
        }
      }
      return;
    }

    try {
      const service = this.docker.getService(serviceName);
      await service.remove();
    } catch (err: any) {
      if (err.statusCode !== 404) {
        log.error({
          message: `Failed to remove Swarm service ${serviceName}`,
          err: err.message,
        });
      }
    }

    if (deleteVolumes) {
      try {
        const volumeName = `upstand-db-data-${resource.id}`;
        const volume = this.docker.getVolume(volumeName);
        await volume.remove().catch(() => {});
      } catch (err: any) {
        log.error({
          message: `Failed to remove volume for resource ${resource.id}`,
          err: err.message,
        });
      }
    }
  }
}
