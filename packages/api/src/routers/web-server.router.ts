import { TRPCError } from "@trpc/server";
import type { IUnitOfWork } from "@upstand/domain";
import {
  AccessLogCleanupCronSchema,
  AccessLogQuerySchema,
  aggregateAccessLogStats,
  getDockerInstance,
  type NotificationPublisher,
  queryAccessLogEntries,
  TriggerUpdateInputSchema,
  UpdateWebServerSettingsInputSchema,
} from "@upstand/usecases";
import {
  CaddyServiceToken,
  GetUpdateStatusUseCaseToken,
  GetWebServerLogsUseCaseToken,
  GetWebServerSettingsUseCaseToken,
  PublishNotificationUseCaseToken,
  ReloadWebServerUseCaseToken,
  TriggerUpdateUseCaseToken,
  UnitOfWorkToken,
  UpdateWebServerSettingsUseCaseToken,
} from "@upstand/usecases/tokens";
import { log } from "evlog";
import { z } from "zod";

import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

async function queueDockerCleanupNotification(
  publisher: NotificationPublisher,
): Promise<void> {
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

async function requireActiveOrganizationPermission(
  ctx: any,
  permission: Parameters<typeof checkPermission>[2],
): Promise<void> {
  const organizationId = ctx.session.session.activeOrganizationId;
  if (!organizationId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Select an active organization before using server operations",
    });
  }
  await checkPermission(ctx.session.user.id, organizationId, permission);
}

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

async function getSecurityAudit(uow: IUnitOfWork) {
  const docker = getDockerInstance();
  const checks: Array<{
    id: string;
    title: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }> = [];

  try {
    const info = await docker.info();
    checks.push({
      id: "docker-version",
      title: "Docker engine reachable",
      status: "pass",
      detail: `${info.ServerVersion || "unknown"} on ${info.OperatingSystem || "unknown"}`,
    });
    checks.push({
      id: "swarm",
      title: "Swarm control plane",
      status: info.Swarm?.LocalNodeState === "active" ? "pass" : "warn",
      detail: `Local node state: ${info.Swarm?.LocalNodeState || "unknown"}`,
    });
  } catch (error) {
    checks.push({
      id: "docker-version",
      title: "Docker engine reachable",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const network = await docker
      .getNetwork(process.env.DOCKER_NETWORK || "upstand-network")
      .inspect();
    const valid = network.Driver === "overlay" && network.Attachable === true;
    checks.push({
      id: "managed-network",
      title: "Managed ingress network",
      status: valid ? "pass" : "fail",
      detail: valid
        ? "Attachable overlay network is configured."
        : "The managed network must be an attachable overlay network.",
    });
  } catch (error) {
    checks.push({
      id: "managed-network",
      title: "Managed ingress network",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const settings = await uow.webServerSettingsRepository.findGlobal();
  const snippets = `${settings?.globalCaddyfile || ""}\n${settings?.caddySnippets || ""}`;
  checks.push({
    id: "caddy-admin",
    title: "Caddy admin surface",
    status: snippets.includes(":2019") ? "fail" : "pass",
    detail: snippets.includes(":2019")
      ? "Caddy admin port appears to be exposed in the configured snippet."
      : "No Caddy admin listener was found in environment configuration.",
  });

  const failed = checks.filter((check) => check.status === "fail").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  return {
    generatedAt: new Date().toISOString(),
    score: Math.max(0, 100 - failed * 35 - warnings * 10),
    checks,
  };
}

export const webServerRouter = router({
  securityAudit: twoFactorVerifiedProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:view",
      );
      try {
        return await getSecurityAudit(ctx.scope.resolve(UnitOfWorkToken));
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getSettings: twoFactorVerifiedProcedure.query(async ({ ctx }) => {
    await requireActiveOrganizationPermission(ctx, "server:view");
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
      await requireActiveOrganizationPermission(ctx, "server:update");
      const useCase = ctx.scope.resolve(UpdateWebServerSettingsUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  accessLogStatus: twoFactorVerifiedProcedure.query(async ({ ctx }) => {
    await requireActiveOrganizationPermission(ctx, "server:view");
    const uow = ctx.scope.resolve(UnitOfWorkToken);
    const settings = await uow.webServerSettingsRepository.findGlobal();
    return {
      enabled: settings?.accessLogsEnabled ?? false,
      cleanupCron: settings?.accessLogCleanupCron ?? "0 3 * * *",
    };
  }),

  toggleAccessLogs: twoFactorVerifiedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireActiveOrganizationPermission(ctx, "server:update");
      const useCase = ctx.scope.resolve(UpdateWebServerSettingsUseCaseToken);
      try {
        const settings = await useCase.execute({
          accessLogsEnabled: input.enabled,
        });
        return { enabled: settings?.accessLogsEnabled ?? input.enabled };
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  updateAccessLogCleanup: twoFactorVerifiedProcedure
    .input(z.object({ cron: AccessLogCleanupCronSchema }))
    .mutation(async ({ ctx, input }) => {
      await requireActiveOrganizationPermission(ctx, "server:update");
      const useCase = ctx.scope.resolve(UpdateWebServerSettingsUseCaseToken);
      try {
        const settings = await useCase.execute({
          accessLogCleanupCron: input.cron,
        });
        return { cleanupCron: settings?.accessLogCleanupCron ?? input.cron };
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  accessLogs: twoFactorVerifiedProcedure
    .input(AccessLogQuerySchema)
    .query(async ({ ctx, input }) => {
      await requireActiveOrganizationPermission(ctx, "server:view");
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const settings = await uow.webServerSettingsRepository.findGlobal();
      if (!settings?.accessLogsEnabled) {
        return { entries: [], total: 0, pageCount: 1, page: input.page };
      }
      const content = await ctx.scope
        .resolve(CaddyServiceToken)
        .getAccessLogs();
      return { ...queryAccessLogEntries(content, input), page: input.page };
    }),

  accessLogStats: twoFactorVerifiedProcedure
    .input(z.object({ from: z.coerce.date(), to: z.coerce.date() }))
    .query(async ({ ctx, input }) => {
      await requireActiveOrganizationPermission(ctx, "server:view");
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const settings = await uow.webServerSettingsRepository.findGlobal();
      if (!settings?.accessLogsEnabled) return [];
      const content = await ctx.scope
        .resolve(CaddyServiceToken)
        .getAccessLogs();
      return aggregateAccessLogStats(content, input.from, input.to);
    }),

  getLogs: twoFactorVerifiedProcedure
    .input(z.object({ tail: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await requireActiveOrganizationPermission(ctx, "server:view");
      const useCase = ctx.scope.resolve(GetWebServerLogsUseCaseToken);
      try {
        return await useCase.execute(input.tail);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getServerLogs: twoFactorVerifiedProcedure
    .input(z.object({ tail: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      await requireActiveOrganizationPermission(ctx, "server:view");
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
      await requireActiveOrganizationPermission(ctx, "server:update");
      const useCase = ctx.scope.resolve(ReloadWebServerUseCaseToken);
      try {
        return await useCase.execute(input.action);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  reloadServer: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    await requireActiveOrganizationPermission(ctx, "server:update");
    try {
      await forceServiceUpdate(UPSTAND_SERVER_SERVICE);
      return { success: true };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to restart server container");
    }
  }),

  cleanRedis: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    await requireActiveOrganizationPermission(ctx, "server:delete");
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

  reloadRedis: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    await requireActiveOrganizationPermission(ctx, "server:update");
    try {
      await forceServiceUpdate(UPSTAND_REDIS_SERVICE);
      return { success: true };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to restart Redis container");
    }
  }),

  cleanAllDeploymentQueue: twoFactorVerifiedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        confirm: z.literal("CLEANUP"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:delete",
      );
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      try {
        await uow.transaction(async (tx) => {
          const runningDeployments =
            await tx.deploymentRepository.findByStatus("running");
          for (const deployment of runningDeployments) {
            await tx.deploymentRepository.updateById(deployment.id, {
              status: "failed",
              logs: `${deployment.logs}\nDeployment cancelled by clean deployment queue operation.\n`,
            });
          }
          const resources = await tx.resourceRepository.findMany();
          for (const r of resources) {
            if (r.status === "running") {
              await tx.resourceRepository.updateById(r.id, {
                status: "stopped",
              });
            }
          }
        });
        return { success: true };
      } catch (error: any) {
        throw new Error(error?.message || "Failed to clean deployment queue");
      }
    }),

  cleanUnusedImages: twoFactorVerifiedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        confirm: z.literal("CLEANUP"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:delete",
      );
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

  cleanUnusedVolumes: twoFactorVerifiedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        confirm: z.literal("CLEANUP"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:delete",
      );
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

  cleanStoppedContainers: twoFactorVerifiedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        confirm: z.literal("CLEANUP"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:delete",
      );
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
    }),

  cleanDockerBuilder: twoFactorVerifiedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        confirm: z.literal("CLEANUP"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:delete",
      );
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

  cleanDockerPrune: twoFactorVerifiedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        confirm: z.literal("CLEANUP"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:delete",
      );
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

  cleanAll: twoFactorVerifiedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        confirm: z.literal("CLEANUP"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "server:delete",
      );
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

  checkGpuStatus: twoFactorVerifiedProcedure.query(async ({ ctx }) => {
    await requireActiveOrganizationPermission(ctx, "server:view");
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

  setupGpuSupport: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    await requireActiveOrganizationPermission(ctx, "server:update");
    try {
      await setupGpuSupport();
      return { success: true };
    } catch (err: any) {
      throw new Error(err.message || "Failed to configure GPU support");
    }
  }),

  updateServerIp: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    await requireActiveOrganizationPermission(ctx, "server:update");
    const uow = ctx.scope.resolve(UnitOfWorkToken);
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
    await requireActiveOrganizationPermission(ctx, "server:view");
    const useCase = ctx.scope.resolve(GetUpdateStatusUseCaseToken);
    try {
      return await useCase.execute();
    } catch (error) {
      handleUseCaseError(error);
    }
  }),

  checkForUpdates: twoFactorVerifiedProcedure.mutation(async ({ ctx }) => {
    await requireActiveOrganizationPermission(ctx, "server:view");
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
      await requireActiveOrganizationPermission(ctx, "server:update");
      const useCase = ctx.scope.resolve(TriggerUpdateUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
