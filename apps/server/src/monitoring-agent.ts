import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { serviceProvider } from "@upstand/api/di";
import { getDockerInstance } from "@upstand/infrastructure";
import { UnitOfWorkToken } from "@upstand/usecases/tokens";
import { log } from "evlog";

export async function initializeMonitoring(): Promise<void> {
  let monitoringPath =
    process.env.NODE_ENV === "production"
      ? "/app/apps/monitoring"
      : path.join(process.cwd(), "apps", "monitoring");

  if (process.env.NODE_ENV !== "production" && !fs.existsSync(monitoringPath)) {
    const alternativePath = path.join(
      process.cwd(),
      "..",
      "..",
      "apps",
      "monitoring",
    );
    if (fs.existsSync(alternativePath)) {
      monitoringPath = alternativePath;
    }
  }

  if (!fs.existsSync(monitoringPath)) {
    log.error({ message: `Monitoring path not found: ${monitoringPath}` });
    return;
  }

  try {
    const docker = getDockerInstance();
    await new Promise<void>((resolve, reject) => {
      log.info({
        message: "Building Upstand Monitoring Agent Docker image...",
      });
      const tarProcess = spawn("tar", ["-cf", "-", "-C", monitoringPath, "."]);

      docker.buildImage(
        tarProcess.stdout,
        { t: "upstand-monitoring-agent:latest" },
        (err, stream) => {
          if (err) return reject(err);
          if (!stream) return reject(new Error("No build stream returned"));
          docker.modem.followProgress(stream, (err) => {
            if (err) reject(err);
            else resolve();
          });
        },
      );
      tarProcess.on("error", reject);
    });
    log.info({
      message: "Upstand Monitoring Agent Docker image built successfully! ✅",
    });

    const containerName = "upstand-monitoring-agent";

    let networkMode: string | undefined;
    try {
      const me = docker.getContainer(os.hostname());
      const info = await me.inspect();
      const networks = Object.keys(info.NetworkSettings.Networks || {});
      networkMode = networks.find((n) => n !== "bridge") || networks[0];
    } catch (e) {
      log.warn({
        message: "Could not detect container network",
        err: e instanceof Error ? e.message : String(e),
      });
    }

    const scope = serviceProvider.createScope();
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

    const metricsConfig = {
      server: {
        serverId: "local",
        refreshRate: 25,
        port: 3001,
        serverType: "Dokploy",
        token,
        urlCallback: `http://localhost:${process.env.PORT || 3000}/api/monitoring/alerts`,
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
      Image: "upstand-monitoring-agent:latest",
      HostConfig: {
        RestartPolicy: { Name: "always" },
        ...(networkMode ? { NetworkMode: networkMode } : {}),
        PortBindings: {
          "3001/tcp": [{ HostIp: "127.0.0.1", HostPort: "3001" }],
        },
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
    const newContainer = docker.getContainer(containerName);
    await newContainer.start();
    log.info({
      message: "Local Monitoring Agent container started on port 3001! 📈",
    });
  } catch (error) {
    log.error({
      message: "Failed to initialize local monitoring agent",
      err: error instanceof Error ? error.message : String(error),
    });
  }
}
