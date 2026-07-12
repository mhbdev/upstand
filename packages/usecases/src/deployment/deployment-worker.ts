import fs from "node:fs";
import path from "node:path";
import { type IUnitOfWork, UnitOfWorkToken } from "@upstand/domain";
import { decryptSecret } from "@upstand/domain/crypto/secret-box";
import { closeRedis, createRedis, type Redis, redis } from "@upstand/redis";
import { DelayedError, type Job, Worker } from "bullmq";
import { log } from "evlog";
import { getInstallationToken } from "../git-provider/github-client";
import type { DockerService } from "../resource/docker.service";
import { getDockerInstance } from "../resource/docker-client";
import {
  CaddyServiceToken,
  DockerServiceToken,
  PublishNotificationUseCaseToken,
} from "../tokens";
import type { CaddyService } from "../web-server/caddy.service";
import { getDeploymentQueueName } from "./deployment-queue-name";
import { ResourceLock } from "./resource-lock";

export class DeploymentWorker {
  private worker: Worker | null = null;
  private workerRedis: Redis | null = null;
  private pubsubRedis: Redis | null = null;

  constructor(
    private readonly serverId: string,
    private readonly getServiceProvider: () => any, // Function to get the DI container
  ) {}

  public async start(): Promise<void> {
    if (this.worker) return;

    const redisConn = createRedis({
      maxRetriesPerRequest: null,
      loggerName: `deployment-worker:${this.serverId}`,
    });
    this.workerRedis = redisConn;
    const queueName = getDeploymentQueueName(this.serverId);

    // Get initial concurrency from DB or default
    let concurrency = 2; // Default to 2 for manager/leader, 1 for workers
    const scope = this.getServiceProvider().createScope();
    try {
      const uow = scope.resolve(UnitOfWorkToken) as IUnitOfWork;
      const settings = await uow.serverBuildSettingsRepository.findById(
        this.serverId,
      );
      if (settings) {
        concurrency = Math.max(1, Math.min(100, settings.concurrency));
      } else {
        // Create default settings if not exists
        await uow.serverBuildSettingsRepository.create({
          id: this.serverId,
          hostname:
            this.serverId === "local"
              ? "Dokploy Server"
              : `Swarm Node ${this.serverId}`,
          ip: "127.0.0.1",
          concurrency: this.serverId === "local" ? 2 : 1,
        });
        concurrency = this.serverId === "local" ? 2 : 1;
      }
    } catch (err: any) {
      log.error({
        message:
          "Failed to fetch build settings for worker, using default concurrency",
        err: err.message,
      });
    } finally {
      await scope.dispose();
    }

    log.info({
      message: `Starting Deployment Worker for server '${this.serverId}' on queue '${queueName}' with concurrency ${concurrency}`,
    });

    try {
      this.worker = new Worker(
        queueName,
        async (job: Job) => {
          await this.processJob(job);
        },
        {
          connection: redisConn as any,
          concurrency,
          limiter: {
            max: 10,
            duration: 1000,
          },
          maxStalledCount: 1,
          stalledInterval: 30_000,
        },
      );

      this.worker.on("failed", (job: any, err: any) => {
        log.error({
          message: "Deployment queue job failed",
          deployment: {
            jobId: job?.id,
            deploymentId: job?.data?.deploymentId,
            resourceId: job?.data?.resourceId,
            serverId: this.serverId,
          },
          err: err.message,
        });
      });
      this.worker.on("error", (error) => {
        log.error({
          message: "Deployment worker connection error",
          serverId: this.serverId,
          err: error.message,
        });
      });

      await this.worker.waitUntilReady();
      await this.startPubSubListener();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  public isReady(): boolean {
    return Boolean(this.worker?.isRunning());
  }

  private async startPubSubListener(): Promise<void> {
    this.pubsubRedis = createRedis({
      loggerName: `deployment-concurrency:${this.serverId}`,
    });
    await this.pubsubRedis.subscribe("upstand:server:concurrency");

    this.pubsubRedis.on("message", async (channel: string, message: string) => {
      if (channel === "upstand:server:concurrency") {
        try {
          const payload = JSON.parse(message);
          if (payload.serverId === this.serverId && this.worker) {
            log.info({
              message: `Updating worker concurrency for ${this.serverId} to ${payload.concurrency}`,
            });
            const concurrency = Number(payload.concurrency);
            if (
              !Number.isInteger(concurrency) ||
              concurrency < 1 ||
              concurrency > 100
            ) {
              throw new Error(
                "Concurrency must be an integer between 1 and 100",
              );
            }
            this.worker.concurrency = concurrency;
          }
        } catch (err: any) {
          log.error({
            message: "Error processing concurrency update message",
            err: err.message,
          });
        }
      }
    });
  }

  public async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    if (this.pubsubRedis) {
      await closeRedis(this.pubsubRedis);
      this.pubsubRedis = null;
    }
    if (this.workerRedis) {
      await closeRedis(this.workerRedis);
      this.workerRedis = null;
    }
  }

  private async processJob(job: Job) {
    const { resourceId, deploymentId } = job.data as {
      resourceId: string;
      deploymentId: string;
    };
    if (!resourceId || !deploymentId) {
      throw new Error("Deployment job is missing resourceId or deploymentId");
    }

    const lockKey = `upstand:resource:lock:${resourceId}`;

    // 1. Try to acquire the Redis lock for serialization of this resource
    const resourceLock = await ResourceLock.acquire(redis, lockKey);
    if (!resourceLock) {
      log.info({
        message: `Resource ${resourceId} is currently building. Delaying job ${job.id}.`,
      });
      // This is normal queue back-pressure, not a failed deployment. Moving the
      // active job to delayed and signalling BullMQ with DelayedError preserves
      // its attempt count and prevents a misleading failed-job event.
      await job.moveToDelayed(Date.now() + 5_000, job.token);
      throw new DelayedError(
        `Resource ${resourceId} is already building; retry scheduled.`,
      );
    }

    let tempSshKeyPath: string | null = null;
    let resource: Awaited<
      ReturnType<IUnitOfWork["resourceRepository"]["findById"]>
    > = null;
    let logsAccumulator = "Deployment pipeline started in queue worker...\n";
    let flushTimeout: ReturnType<typeof setTimeout> | null = null;
    let flushInFlight: Promise<void> | null = null;

    const scope = this.getServiceProvider().createScope();
    let uow: IUnitOfWork;
    let dockerService: DockerService;
    let caddyService: CaddyService;
    try {
      uow = scope.resolve(UnitOfWorkToken) as IUnitOfWork;
      dockerService = scope.resolve(DockerServiceToken) as DockerService;
      caddyService = scope.resolve(CaddyServiceToken) as CaddyService;
    } catch (error) {
      await scope.dispose();
      await resourceLock.release();
      throw error;
    }

    const publishDeploymentOutcome = async (status: "success" | "failed") => {
      if (!resource) return;

      const environment = await uow.environmentRepository.findById(
        resource.environmentId,
      );
      if (!environment) return;
      const project = await uow.projectRepository.findById(
        environment.projectId,
      );
      if (!project) return;

      const publisher = scope.resolve(PublishNotificationUseCaseToken) as {
        execute: (input: {
          organizationId: string;
          event: "deployment_succeeded" | "deployment_failed";
          title: string;
          message: string;
          metadata: Record<string, unknown>;
        }) => Promise<number>;
      };
      const succeeded = status === "success";
      await publisher.execute({
        organizationId: project.organizationId,
        event: succeeded ? "deployment_succeeded" : "deployment_failed",
        title: `${resource.name} deployment ${succeeded ? "succeeded" : "failed"}`,
        message: succeeded
          ? `The deployment for ${resource.name} completed successfully.`
          : `The deployment for ${resource.name} failed. Review the deployment logs for details.`,
        metadata: {
          resourceId,
          resourceName: resource.name,
          deploymentId,
          resourceType: resource.type,
        },
      });
    };

    const appendLog = (msg: string) => {
      logsAccumulator += msg;

      if (!flushTimeout) {
        flushTimeout = setTimeout(() => {
          flushTimeout = null;
          flushInFlight = uow
            .transaction(async (tx) => {
              // Update deployment logs in the dedicated deployment table
              await tx.deploymentRepository.updateById(deploymentId, {
                logs: logsAccumulator,
              });

              // Also update resource deployments JSON list for backwards compatibility
              const r = await tx.resourceRepository.findById(resourceId);
              if (r) {
                const depsList = JSON.parse(r.deployments || "[]");
                const idx = depsList.findIndex(
                  (d: any) => d.id === deploymentId,
                );
                if (idx > -1) {
                  depsList[idx].logs = logsAccumulator;
                  await tx.resourceRepository.updateById(resourceId, {
                    deployments: JSON.stringify(depsList),
                  });
                }
              }
            })
            .catch((error) => {
              log.error({
                message: "Failed to write build logs to database",
                deploymentId,
                resourceId,
                err: error instanceof Error ? error.message : String(error),
              });
            })
            .finally(() => {
              flushInFlight = null;
            });
        }, 1500);
      }
    };

    const flushFinalLogs = async (status: "success" | "failed") => {
      if (flushTimeout) {
        clearTimeout(flushTimeout);
        flushTimeout = null;
      }
      if (flushInFlight) {
        await flushInFlight;
      }
      resourceLock.assertOwned();
      let containers: Awaited<
        ReturnType<DockerService["getContainers"]>
      > | null = null;
      if (resource) {
        try {
          containers = await dockerService.getContainers(resource);
        } catch (error) {
          log.error({
            message: "Failed to refresh containers after deployment",
            deploymentId,
            resourceId,
            err: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await uow.transaction(async (tx) => {
        // Update dedicated deployment record
        await tx.deploymentRepository.updateById(deploymentId, {
          logs: logsAccumulator,
          status,
        });

        // Update resource status and history
        const r = await tx.resourceRepository.findById(resourceId);
        if (r) {
          const depsList = JSON.parse(r.deployments || "[]");
          const idx = depsList.findIndex((d: any) => d.id === deploymentId);
          if (idx > -1) {
            depsList[idx].logs = logsAccumulator;
            depsList[idx].status = status;

            await tx.resourceRepository.updateById(resourceId, {
              deployments: JSON.stringify(depsList),
              status: status === "success" ? "running" : "stopped",
              ...(containers ? { containers: JSON.stringify(containers) } : {}),
            });
          }
        }
      });
    };

    try {
      const deployment = await uow.deploymentRepository.findById(deploymentId);
      if (!deployment || deployment.resourceId !== resourceId) {
        throw new Error("Deployment record does not match the queued job");
      }
      if (deployment.status === "success" || deployment.status === "failed") {
        log.info({
          message: "Skipping deployment job whose database state is terminal",
          deploymentId,
          resourceId,
          status: deployment.status,
        });
        return;
      }

      // Set deployment state to running in the database
      await uow.transaction(async (tx) => {
        await tx.deploymentRepository.updateById(deploymentId, {
          status: "running",
        });
        const r = await tx.resourceRepository.findById(resourceId);
        if (r) {
          const depsList = JSON.parse(r.deployments || "[]");
          const idx = depsList.findIndex((d: any) => d.id === deploymentId);
          if (idx > -1) {
            depsList[idx].status = "running";
          }
          await tx.resourceRepository.updateById(resourceId, {
            status: "running",
            deployments: JSON.stringify(depsList),
          });
        }
      });

      resource = await uow.transaction(async (tx) => {
        return await tx.resourceRepository.findById(resourceId);
      });

      if (!resource) {
        throw new Error("Resource not found");
      }

      // Resolve Swarm Node constraints if deploying to a remote server
      let constraints: string[] | undefined;
      const targetServerId = resource.serverId;
      if (
        targetServerId &&
        targetServerId !== "local" &&
        targetServerId !== "manager"
      ) {
        appendLog(
          `Resolving target remote server with ID: ${targetServerId}...\n`,
        );
        const server = await uow.transaction(async (tx) => {
          return await tx.serverRepository.findById(targetServerId);
        });
        if (server) {
          appendLog(
            `Target server resolved to '${server.name}' (${server.ipAddress}). Matching with Swarm nodes...\n`,
          );
          try {
            const dockerClient = getDockerInstance();
            const nodes = await dockerClient.listNodes().catch(() => []);
            const matchedNode = nodes.find(
              (node: any) =>
                node.Status?.Addr === server.ipAddress ||
                (node.ManagerStatus?.Addr &&
                  node.ManagerStatus.Addr.split(":")[0] === server.ipAddress),
            );
            if (matchedNode) {
              appendLog(
                `Matched with Swarm Node ID: ${matchedNode.ID}. Adding placement constraint.\n`,
              );
              constraints = [`node.id == ${matchedNode.ID}`];
            } else {
              const matchedByName = nodes.find(
                (node: any) =>
                  node.Description?.Hostname === server.name ||
                  node.Spec?.Name === server.name,
              );
              if (matchedByName) {
                appendLog(
                  `Matched with Swarm Node Hostname: ${matchedByName.Description?.Hostname}. Adding placement constraint.\n`,
                );
                constraints = [`node.id == ${matchedByName.ID}`];
              } else {
                appendLog(
                  `Warning: No active Swarm Node matches server IP '${server.ipAddress}' or name '${server.name}'. Swarm scheduler will decide node placement.\n`,
                );
              }
            }
          } catch (err: any) {
            appendLog(
              `Warning: Failed to list Swarm nodes for placement matching: ${err.message}\n`,
            );
          }
        } else {
          appendLog(
            `Warning: Server with ID '${targetServerId}' not found in database. Swarm scheduler will decide node placement.\n`,
          );
        }
      }

      const envVars = JSON.parse(resource.envVars || "{}");

      if (resource.type === "database") {
        appendLog("Preparing database deployment...\n");

        const decryptedCredentials: Record<string, string> = {};
        if (resource.credentials) {
          try {
            const payload = JSON.parse(resource.credentials);
            if (payload.ciphertext && payload.iv && payload.authTag) {
              const decryptedStr = decryptSecret(payload);
              const creds = JSON.parse(decryptedStr);

              const dbType = resource.dbType?.toLowerCase() || "";
              if (dbType === "postgres") {
                if (creds.dbUser)
                  decryptedCredentials.POSTGRES_USER = creds.dbUser;
                if (creds.dbPassword)
                  decryptedCredentials.POSTGRES_PASSWORD = creds.dbPassword;
                if (creds.dbName)
                  decryptedCredentials.POSTGRES_DB = creds.dbName;
              } else if (dbType === "mysql" || dbType === "mariadb") {
                if (creds.dbRootPassword)
                  decryptedCredentials.MYSQL_ROOT_PASSWORD =
                    creds.dbRootPassword;
                if (creds.dbUser)
                  decryptedCredentials.MYSQL_USER = creds.dbUser;
                if (creds.dbPassword)
                  decryptedCredentials.MYSQL_PASSWORD = creds.dbPassword;
                if (creds.dbName)
                  decryptedCredentials.MYSQL_DATABASE = creds.dbName;
              } else if (dbType === "mongodb") {
                if (creds.dbUser)
                  decryptedCredentials.MONGO_INITDB_ROOT_USERNAME =
                    creds.dbUser;
                if (creds.dbPassword)
                  decryptedCredentials.MONGO_INITDB_ROOT_PASSWORD =
                    creds.dbPassword;
              } else if (dbType === "redis") {
                if (creds.dbPassword)
                  decryptedCredentials.REDIS_PASSWORD = creds.dbPassword;
              }
            }
          } catch (err: any) {
            appendLog(
              `Warning: Failed to decrypt database credentials: ${err.message}\n`,
            );
          }
        }

        const finalEnv = { ...decryptedCredentials, ...envVars };
        await dockerService.deployDatabase(
          resource,
          finalEnv,
          appendLog,
          constraints,
        );
        appendLog("Database Swarm service deployed successfully!\n");
      } else if (resource.type === "compose") {
        appendLog("Preparing Docker Compose Stack deployment...\n");
        let composeFile = "";
        if (resource.credentials) {
          const config = JSON.parse(resource.credentials);
          composeFile = config.composeFile || "";
        }
        if (!composeFile) {
          throw new Error("No compose file content found in configuration");
        }
        await dockerService.deployComposeStack(
          resource,
          composeFile,
          appendLog,
          constraints,
        );
        appendLog("Compose Stack stack deployed successfully!\n");
      } else if (resource.type === "application") {
        if (resource.provider === "docker-registry") {
          await dockerService.deployAppImage(
            resource,
            envVars,
            appendLog,
            constraints,
          );
          appendLog("Application image deployed successfully!\n");
        } else {
          appendLog(
            `Setting up Git deployment provider: ${resource.provider}...\n`,
          );
          let cloneUrl = "";
          let credentialsObj: any = {};
          try {
            credentialsObj = JSON.parse(resource.credentials || "{}");
          } catch {}

          if (
            ["github", "gitlab", "bitbucket", "gitea"].includes(
              resource.provider,
            )
          ) {
            const gitProviderId = credentialsObj.githubAccount;
            if (!gitProviderId) {
              throw new Error(
                "Git Provider not associated. Please configure repository connection.",
              );
            }

            const gitProvider = await uow.transaction(async (tx) => {
              return await tx.gitProviderRepository.findById(gitProviderId);
            });

            if (!gitProvider) {
              throw new Error("Associated Git Provider not found");
            }

            const config = JSON.parse(gitProvider.config);

            if (resource.provider === "github") {
              appendLog("Retrieving GitHub App installation access token...\n");
              const token = await getInstallationToken(
                String(config.githubAppId),
                config.githubPrivateKey,
                config.githubInstallationId,
              );
              cloneUrl = `https://x-access-token:${token}@github.com/${credentialsObj.repository}.git`;
            } else if (resource.provider === "gitlab") {
              appendLog("Connecting to GitLab using OAuth access token...\n");
              const token = config.accessToken;
              const gitlabHost = (
                config.gitlabUrl || "https://gitlab.com"
              ).replace(/https?:\/\//, "");
              cloneUrl = `https://oauth2:${token}@${gitlabHost}/${credentialsObj.repository}.git`;
            } else if (resource.provider === "gitea") {
              appendLog("Connecting to Gitea using OAuth access token...\n");
              const token = config.accessToken;
              const giteaHost = (config.giteaUrl || "").replace(
                /https?:\/\//,
                "",
              );
              cloneUrl = `https://oauth2:${token}@${giteaHost}/${credentialsObj.repository}.git`;
            } else if (resource.provider === "bitbucket") {
              appendLog("Connecting to Bitbucket using app password...\n");
              cloneUrl = `https://${config.bitbucketUsername}:${config.appPassword}@bitbucket.org/${credentialsObj.repository}.git`;
            }
          } else if (resource.provider === "git") {
            cloneUrl = credentialsObj.repositoryUrl || "";
            if (!cloneUrl) {
              throw new Error("Repository URL is empty in configuration");
            }

            const sshKeyId = credentialsObj.sshKeyId;
            if (sshKeyId) {
              appendLog(
                "Retrieving SSH key credentials for authentication...\n",
              );
              const sshKey = await uow.transaction(async (tx) => {
                return await tx.sshKeyRepository.findById(sshKeyId);
              });

              if (!sshKey) {
                throw new Error("Configured SSH key not found in workspace");
              }

              appendLog("Decrypting private key...\n");
              const privateKey = decryptSecret({
                ciphertext: sshKey.privateKeyCiphertext,
                iv: sshKey.privateKeyIv,
                authTag: sshKey.privateKeyAuthTag,
                keyVersion: sshKey.privateKeyVersion,
              });

              const buildDir = path.join(process.cwd(), ".builds");
              fs.mkdirSync(buildDir, { recursive: true });
              tempSshKeyPath = path.join(buildDir, `ssh-key-${resource.id}`);
              fs.writeFileSync(tempSshKeyPath, privateKey.trim() + "\n", {
                mode: 0o600,
              });
            }
          } else {
            throw new Error(
              `Unsupported deployment provider: ${resource.provider}`,
            );
          }

          appendLog(
            "Triggering Docker container build pipeline for repository...\n",
          );
          await dockerService.deployAppGit(
            resource,
            envVars,
            cloneUrl,
            appendLog,
            tempSshKeyPath || undefined,
            constraints,
          );
          appendLog(
            "Build compiled successfully and Swarm Service registered.\n",
          );
        }
      }

      appendLog("Updating Caddy Web Server reverse proxy configuration...\n");
      const updatedResource = await uow.transaction(async (tx) => {
        return await tx.resourceRepository.findById(resourceId);
      });

      if (updatedResource && updatedResource.domains) {
        const [resources, settings] = await uow.transaction(async (tx) => [
          await tx.resourceRepository.findMany(),
          await tx.webServerSettingsRepository.findGlobal(),
        ]);
        await caddyService.syncResourceConfigs(resources, settings || {});
        appendLog("Caddy routing reloaded successfully.\n");
      }

      appendLog("Pipeline completed successfully! ✅\n");
      resourceLock.assertOwned();
      await flushFinalLogs("success");
      await publishDeploymentOutcome("success").catch((error) => {
        log.error({
          message: "Unable to queue deployment success notification",
          err: error instanceof Error ? error.message : error,
        });
      });
    } catch (err: any) {
      appendLog(`\nDeployment failed! ❌\nError: ${err.message}\n`);
      log.error({
        message: "Queue worker deploy pipeline error",
        err: err.message || err,
      });
      await flushFinalLogs("failed");
      await publishDeploymentOutcome("failed").catch((notificationError) => {
        log.error({
          message: "Unable to queue deployment failure notification",
          err:
            notificationError instanceof Error
              ? notificationError.message
              : notificationError,
        });
      });
    } finally {
      if (tempSshKeyPath && fs.existsSync(tempSshKeyPath)) {
        try {
          fs.unlinkSync(tempSshKeyPath);
        } catch (e: any) {
          log.error({
            message: "Failed to clean up temp SSH key file",
            err: e.message,
          });
        }
      }
      await scope.dispose();
      await resourceLock.release().catch((error) => {
        log.error({
          message: "Failed to release resource deployment lock",
          resourceId,
          deploymentId,
          err: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }
}
