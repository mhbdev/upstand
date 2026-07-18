import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getServiceProvider } from "@upstand/api/di";
import { getDockerInstance } from "@upstand/infrastructure";
import { UnitOfWorkToken } from "@upstand/usecases/tokens";
import { log } from "evlog";

const MONITORING_IMAGE_ENV = "UPSTAND_MONITORING_IMAGE";

export async function initializeMonitoring(): Promise<void> {
  try {
    const docker = getDockerInstance();
    const scope = getServiceProvider().createScope();
    let token = "";
    let cpuThreshold = 90;
    let memoryThreshold = 90;
    try {
      const uow = scope.resolve(UnitOfWorkToken);
      let settings =
        await uow.monitoringSettingsRepository.findByServerId("local");
      if (!settings) {
        settings = await uow.monitoringSettingsRepository.upsert({
          serverId: "local",
          token: randomBytes(24).toString("hex"),
          cpuThreshold: 90,
          memoryThreshold: 90,
        });
      }
      token = settings.token;
      cpuThreshold = settings.cpuThreshold;
      memoryThreshold = settings.memoryThreshold;
    } finally {
      await scope.dispose();
    }

    const monitoringImage = await resolveMonitoringImage(docker);
    await ensureImage(docker, monitoringImage);

    const containerName = "upstand-monitoring-agent";
    let networkMode: string | undefined;
    try {
      const me = docker.getContainer(os.hostname());
      const info = await me.inspect();
      const networks = Object.keys(info.NetworkSettings.Networks || {});
      networkMode = networks.find((n) => n !== "bridge") || networks[0];
    } catch (error) {
      log.warn({
        message: "Could not detect container network for monitoring agent",
        err: error instanceof Error ? error.message : String(error),
      });
    }

    const callbackHost = networkMode ? "upstand_server" : "127.0.0.1";
    const metricsConfig = {
      server: {
        serverId: "local",
        refreshRate: 25,
        port: 3001,
        serverType: "Dokploy",
        token,
        urlCallback: `http://${callbackHost}:${process.env.PORT || 3000}/api/monitoring/alerts`,
        retentionDays: 7,
        cronJob: "0 0 * * *",
        thresholds: {
          cpu: cpuThreshold,
          memory: memoryThreshold,
        },
      },
      containers: {
        refreshRate: 25,
        services: {
          include: [],
          exclude: [],
        },
      },
    };

    const containerOpts = {
      name: containerName,
      Env: [
        `METRICS_CONFIG=${JSON.stringify(metricsConfig)}`,
        "DB_PATH=/data/monitoring.db",
      ],
      Image: monitoringImage,
      HostConfig: {
        RestartPolicy: { Name: "always" },
        ...(networkMode
          ? { NetworkMode: networkMode }
          : {
              PortBindings: {
                "3001/tcp": [{ HostIp: "127.0.0.1", HostPort: "3005" }],
              },
            }),
        Binds: [
          "/var/run/docker.sock:/var/run/docker.sock:ro",
          "/proc:/host/proc:ro",
          "/sys:/host/sys:ro",
          "/etc/os-release:/etc/os-release:ro",
          "upstand-monitoring-data:/data",
        ],
      },
      ExposedPorts: {
        "3001/tcp": {},
      },
    };

    const container = docker.getContainer(containerName);
    try {
      await container.inspect();
      await container.remove({ force: true });
    } catch {}

    await docker.createContainer(containerOpts);
    await docker.getContainer(containerName).start();
    log.info({
      message: "Local Monitoring Agent container started",
      image: monitoringImage,
      network: networkMode || "loopback",
    });
  } catch (error) {
    log.error({
      message: "Failed to initialize local monitoring agent",
      err: error instanceof Error ? error.message : String(error),
    });
  }
}

async function resolveMonitoringImage(
  docker: ReturnType<typeof getDockerInstance>,
) {
  const configured = process.env[MONITORING_IMAGE_ENV]?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${MONITORING_IMAGE_ENV} is required in production`);
  }

  const monitoringPath = resolveDevelopmentMonitoringPath();
  if (!monitoringPath) {
    throw new Error(
      `${MONITORING_IMAGE_ENV} is not set and the monitoring source is unavailable`,
    );
  }
  await buildDevelopmentMonitoringImage(docker, monitoringPath);
  return "upstand-monitoring-agent:local";
}

function resolveDevelopmentMonitoringPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "apps", "monitoring"),
    path.join(process.cwd(), "..", "..", "apps", "monitoring"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function buildDevelopmentMonitoringImage(
  docker: ReturnType<typeof getDockerInstance>,
  monitoringPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    log.info({ message: "Building development monitoring agent image" });
    const tarProcess = spawn("tar", ["-cf", "-", "-C", monitoringPath, "."]);
    docker.buildImage(
      tarProcess.stdout,
      { t: "upstand-monitoring-agent:local" },
      (error, stream) => {
        if (error) return reject(error);
        if (!stream)
          return reject(new Error("No monitoring build stream returned"));
        docker.modem.followProgress(stream, (progressError) => {
          if (progressError) reject(progressError);
          else resolve();
        });
      },
    );
    tarProcess.on("error", reject);
  });
}

async function ensureImage(
  docker: ReturnType<typeof getDockerInstance>,
  image: string,
): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    return;
  } catch {}

  log.info({ message: "Pulling monitoring agent image", image });
  const stream = await docker.pull(image);
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (error) =>
      error ? reject(error) : resolve(),
    );
  });
}
