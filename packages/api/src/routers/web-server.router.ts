import type { IUnitOfWork } from "@upstand/domain";
import { UnitOfWorkToken } from "@upstand/domain";
import {
  getDockerInstance,
  PublishNotificationUseCaseToken,
  TriggerUpdateInputSchema,
  UpdateWebServerSettingsInputSchema,
} from "@upstand/usecases";
import { log } from "evlog";
import { z } from "zod";
import {
  GetUpdateStatusUseCaseToken,
  GetWebServerLogsUseCaseToken,
  GetWebServerSettingsUseCaseToken,
  ReloadWebServerUseCaseToken,
  TriggerUpdateUseCaseToken,
  UpdateWebServerSettingsUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";

async function queueDockerCleanupNotification(publisher: {
  execute(input: {
    event: "docker_cleanup_completed";
    title: string;
    message: string;
  }): Promise<number>;
}): Promise<void> {
  await publisher
    .execute({
      event: "docker_cleanup_completed",
      title: "Docker cleanup completed",
      message: "Upstand completed a Docker cleanup operation.",
    })
    .catch((error) => {
      log.error({
        message: "Unable to queue Docker cleanup notification",
        err: error instanceof Error ? error.message : error,
      });
    });
}

function cleanDockerLogs(buffer: Buffer): string {
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

async function dockerLogBuffer(logs: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(logs)) return logs;
  if (
    !logs ||
    typeof logs !== "object" ||
    !("getReader" in logs) ||
    typeof logs.getReader !== "function"
  ) {
    throw new Error("Docker returned an unsupported logs stream");
  }
  const reader = logs.getReader() as {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock(): void;
  };
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

const UPSTAND_SERVER_SERVICE = "upstand_server";
const UPSTAND_REDIS_SERVICE = "upstand_redis";

async function getRunningServiceContainer(serviceName: string) {
  const docker = getDockerInstance();
  const tasks = await docker.listTasks({
    filters: JSON.stringify({
      service: [serviceName],
      "desired-state": ["running"],
    }),
  });
  const task = tasks.find(
    (candidate) =>
      candidate.Status?.State === "running" &&
      candidate.Status?.ContainerStatus?.ContainerID,
  );
  const containerId = task?.Status?.ContainerStatus?.ContainerID;
  if (!containerId) {
    throw new Error(`No running task is available for ${serviceName}`);
  }
  return docker.getContainer(containerId);
}

async function forceServiceUpdate(serviceName: string): Promise<void> {
  const docker = getDockerInstance();
  const service = docker.getService(serviceName);
  const inspect = await service.inspect();
  const taskTemplate = inspect.Spec.TaskTemplate;
  if (!taskTemplate) throw new Error(`Service ${serviceName} has no task spec`);

  await service.update({
    version: inspect.Version.Index,
    Name: inspect.Spec.Name,
    TaskTemplate: {
      ...taskTemplate,
      ForceUpdate: (taskTemplate.ForceUpdate || 0) + 1,
    },
    Mode: inspect.Spec.Mode,
    UpdateConfig: inspect.Spec.UpdateConfig,
    RollbackConfig: inspect.Spec.RollbackConfig,
    Networks: inspect.Spec.Networks,
    EndpointSpec: inspect.Spec.EndpointSpec,
  });
}

async function execInContainer(
  container: ReturnType<ReturnType<typeof getDockerInstance>["getContainer"]>,
  command: string[],
): Promise<void> {
  const execution = await container.exec({
    Cmd: command,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await execution.start({});
  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  const result = await execution.inspect();
  if (result.ExitCode !== 0) {
    throw new Error(
      `Command '${command[0]}' failed with exit code ${result.ExitCode}`,
    );
  }
}

async function getRedisPassword(): Promise<string> {
  const service = getDockerInstance().getService(UPSTAND_REDIS_SERVICE);
  const inspect = await service.inspect();
  const entry = inspect.Spec.TaskTemplate?.ContainerSpec?.Env?.find(
    (value: string) => value.startsWith("REDIS_PASSWORD="),
  );
  const password = entry?.slice("REDIS_PASSWORD=".length);
  if (!password)
    throw new Error("Redis password is not configured on the service");
  return password;
}

async function checkGpuStatus() {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  let driverInstalled = false;
  let driverVersion: string | undefined;
  let gpuModel: string | undefined;
  let memoryInfo: string | undefined;
  let runtimeInstalled = false;
  let runtimeConfigured = false;
  let cudaSupport = false;
  let cudaVersion: string | undefined;
  let swarmEnabled = false;
  let gpuResources = 0;

  try {
    const { stdout } = await execAsync(
      "nvidia-smi --query-gpu=driver_version --format=csv,noheader",
    );
    driverVersion = stdout.trim();
    driverInstalled = !!driverVersion;
  } catch {}

  if (driverInstalled) {
    try {
      const { stdout } = await execAsync(
        "nvidia-smi --query-gpu=gpu_name,memory.total --format=csv,noheader",
      );
      const parts = stdout.split(",");
      gpuModel = parts[0]?.trim();
      memoryInfo = parts[1]?.trim();
    } catch {}

    try {
      const { stdout } = await execAsync("nvidia-smi -q");
      const match = stdout.match(/CUDA Version\s*:\s*([\d.]+)/);
      if (match) {
        cudaVersion = match[1];
        cudaSupport = true;
      }
    } catch {}
  }

  try {
    const { stdout } = await execAsync("command -v nvidia-container-runtime");
    runtimeInstalled = !!stdout.trim();
  } catch {}

  try {
    const { stdout } = await execAsync(
      'docker info --format "{{json .Runtimes}}"',
    );
    const runtimes = JSON.parse(stdout);
    runtimeConfigured = "nvidia" in runtimes;
  } catch {}

  try {
    const { stdout } = await execAsync(
      "docker node inspect self --format '{{json .Description.Resources.GenericResources}}'",
    );
    if (stdout && stdout.trim() !== "null") {
      const generic = JSON.parse(stdout);
      for (const res of generic) {
        if (
          res.DiscreteResourceSpec &&
          (res.DiscreteResourceSpec.Kind === "GPU" ||
            res.DiscreteResourceSpec.Kind === "gpu")
        ) {
          gpuResources = res.DiscreteResourceSpec.Value;
          swarmEnabled = true;
          break;
        }
      }
    }
  } catch {}

  return {
    driverInstalled,
    driverVersion,
    gpuModel,
    memoryInfo,
    runtimeInstalled,
    runtimeConfigured,
    cudaSupport,
    cudaVersion,
    availableGPUs: driverInstalled ? 1 : 0,
    swarmEnabled,
    gpuResources,
  };
}

async function setupGpuSupport() {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  const status = await checkGpuStatus();
  if (!status.driverInstalled) {
    throw new Error(
      "NVIDIA driver not found. Please install NVIDIA drivers before configuring GPU support.",
    );
  }
  const daemonConfig = {
    runtimes: {
      nvidia: {
        path: "nvidia-container-runtime",
        runtimeArgs: [],
      },
    },
    "default-runtime": "nvidia",
  };

  const setupCommands = [
    `echo '${JSON.stringify(daemonConfig, null, 2)}' | sudo tee /etc/docker/daemon.json`,
    "sudo systemctl daemon-reload",
    "sudo systemctl restart docker",
  ].join(" && ");

  await execAsync(setupCommands);
}

export const webServerRouter = router({
  getSettings: twoFactorVerifiedProcedure.query(async ({ ctx }) => {
    const useCase = ctx.scope.resolve(GetWebServerSettingsUseCaseToken);
    try {
      return await useCase.execute();
    } catch (error) {
      handleUseCaseError(error);
    }
  }),

  updateSettings: twoFactorVerifiedProcedure
    .input(UpdateWebServerSettingsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(UpdateWebServerSettingsUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getLogs: twoFactorVerifiedProcedure
    .input(z.object({ tail: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(GetWebServerLogsUseCaseToken);
      try {
        return await useCase.execute(input.tail);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getServerLogs: twoFactorVerifiedProcedure
    .input(z.object({ tail: z.number().optional() }))
    .query(async ({ input }) => {
      const docker = getDockerInstance();
      try {
        const service = docker.getService(UPSTAND_SERVER_SERVICE);
        const logBuffer = await service.logs({
          stdout: true,
          stderr: true,
          tail: input.tail || 100,
        });
        return cleanDockerLogs(await dockerLogBuffer(logBuffer));
      } catch (err: any) {
        return `Failed to fetch server logs: ${err.message}`;
      }
    }),

  reload: twoFactorVerifiedProcedure
    .input(z.object({ action: z.enum(["reload", "restart"]) }))
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(ReloadWebServerUseCaseToken);
      try {
        return await useCase.execute(input.action);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  reloadServer: twoFactorVerifiedProcedure.mutation(async () => {
    try {
      await forceServiceUpdate(UPSTAND_SERVER_SERVICE);
      return { success: true };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to restart server container");
    }
  }),

  cleanRedis: twoFactorVerifiedProcedure.mutation(async () => {
    try {
      const [container, password] = await Promise.all([
        getRunningServiceContainer(UPSTAND_REDIS_SERVICE),
        getRedisPassword(),
      ]);
      await execInContainer(container, [
        "redis-cli",
        "--no-auth-warning",
        "-a",
        password,
        "FLUSHALL",
      ]);
      return { success: true };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to flush Redis");
    }
  }),

  reloadRedis: twoFactorVerifiedProcedure.mutation(async () => {
    try {
      await forceServiceUpdate(UPSTAND_REDIS_SERVICE);
      return { success: true };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to restart Redis container");
    }
  }),

  cleanAllDeploymentQueue: twoFactorVerifiedProcedure.mutation(
    async ({ ctx }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken) as IUnitOfWork;
      try {
        await uow.transaction(async (tx) => {
          const resources = await tx.resourceRepository.findMany();
          for (const r of resources) {
            let deploymentsList: any[] = [];
            try {
              deploymentsList = JSON.parse(r.deployments || "[]");
            } catch {}

            let changed = false;
            for (const dep of deploymentsList) {
              if (dep.status === "running") {
                dep.status = "failed";
                dep.logs +=
                  "\nDeployment cancelled by clean deployment queue operation.\n";
                changed = true;
              }
            }

            if (changed || r.status === "running") {
              await tx.resourceRepository.updateById(r.id, {
                status: "stopped",
                deployments: JSON.stringify(deploymentsList),
              });
            }
          }
        });
        return { success: true };
      } catch (error: any) {
        throw new Error(error?.message || "Failed to clean deployment queue");
      }
    },
  ),

  cleanUnusedImages: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    try {
      await execAsync("docker image prune --all --force");
      await queueDockerCleanupNotification(
        ctx.scope.resolve(PublishNotificationUseCaseToken),
      );
      return { success: true };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to clean unused images");
    }
  }),

  cleanUnusedVolumes: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    try {
      await execAsync("docker volume prune --all --force");
      await queueDockerCleanupNotification(
        ctx.scope.resolve(PublishNotificationUseCaseToken),
      );
      return { success: true };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to clean unused volumes");
    }
  }),

  cleanStoppedContainers: twoFactorVerifiedProcedure.mutation(
    async ({ ctx }) => {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);
      try {
        await execAsync("docker container prune --force");
        await queueDockerCleanupNotification(
          ctx.scope.resolve(PublishNotificationUseCaseToken),
        );
        return { success: true };
      } catch (error: any) {
        throw new Error(error?.message || "Failed to clean stopped containers");
      }
    },
  ),

  cleanDockerBuilder: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    try {
      await execAsync("docker builder prune --all --force");
      await queueDockerCleanupNotification(
        ctx.scope.resolve(PublishNotificationUseCaseToken),
      );
      return { success: true };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to clean docker builder");
    }
  }),

  cleanDockerPrune: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    try {
      await execAsync("docker system prune --all --force");
      await queueDockerCleanupNotification(
        ctx.scope.resolve(PublishNotificationUseCaseToken),
      );
      return { success: true };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to prune docker system");
    }
  }),

  cleanAll: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    try {
      await execAsync(
        "docker container prune --force && docker image prune --all --force && docker volume prune --all --force && docker builder prune --all --force && docker system prune --all --force",
      );
      await queueDockerCleanupNotification(
        ctx.scope.resolve(PublishNotificationUseCaseToken),
      );
      return { success: true };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to run all prunes");
    }
  }),

  cleanPatchCaches: twoFactorVerifiedProcedure.mutation(async () => {
    return { success: true };
  }),

  checkGpuStatus: twoFactorVerifiedProcedure.query(async () => {
    try {
      return await checkGpuStatus();
    } catch (_err: any) {
      return {
        driverInstalled: false,
        driverVersion: undefined,
        gpuModel: undefined,
        memoryInfo: undefined,
        runtimeInstalled: false,
        runtimeConfigured: false,
        cudaSupport: false,
        cudaVersion: undefined,
        availableGPUs: 0,
        swarmEnabled: false,
        gpuResources: 0,
      };
    }
  }),

  setupGpuSupport: twoFactorVerifiedProcedure.mutation(async () => {
    try {
      await setupGpuSupport();
      return { success: true };
    } catch (err: any) {
      throw new Error(err.message || "Failed to configure GPU support");
    }
  }),

  updateServerIp: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    const uow = ctx.scope.resolve(UnitOfWorkToken) as IUnitOfWork;
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = (await res.json()) as { ip: string };
      const ip = data.ip;

      let settings = await uow.webServerSettingsRepository.findGlobal();
      if (!settings) {
        settings = await uow.webServerSettingsRepository.createGlobal({});
      }
      await uow.webServerSettingsRepository.updateGlobal({ serverIp: ip });
      return { success: true, ip };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to query server public IP");
    }
  }),

  getUpdateData: twoFactorVerifiedProcedure.query(async ({ ctx }) => {
    const useCase = ctx.scope.resolve(GetUpdateStatusUseCaseToken);
    try {
      return await useCase.execute();
    } catch (error) {
      handleUseCaseError(error);
    }
  }),

  checkForUpdates: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    const useCase = ctx.scope.resolve(GetUpdateStatusUseCaseToken);
    try {
      return await useCase.execute({ forceRefresh: true });
    } catch (error) {
      handleUseCaseError(error);
    }
  }),

  triggerUpdate: twoFactorVerifiedProcedure
    .input(TriggerUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(TriggerUpdateUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
