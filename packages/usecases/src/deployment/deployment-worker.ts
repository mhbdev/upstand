import fs from "node:fs";
import path from "node:path";
import type { IUnitOfWork, Resource } from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import { closeRedis, createRedis, type Redis, redis } from "@upstand/redis";
import { DelayedError, type Job, Worker } from "bullmq";
import { log } from "evlog";
import { assertSafeGitUrl } from "../git-provider/git-url-sanitizer";
import { getInstallationToken } from "../git-provider/github-client";
import type { NotificationPublisher } from "../notification/publish-notification.usecase";
import { getDatabaseEnvironment } from "../resource/database-environment";
import type { DockerDeploymentService as DockerService } from "../resource/docker-client";
import { createRemoteServices } from "../resource/docker-client";
import { parseResourceCredentials } from "../resource/resource-credentials";
import { parseResourceEnvironmentVariables } from "../resource/resource-environment";
import {
  assertBuildServerSupportsResource,
  assertDeploymentServerSupportsResource,
} from "../server/server-role";
import type { CaddyService } from "../web-server/caddy.service";
import { buildRegistryImageTag } from "./build-registry";
import { getDeploymentQueueName } from "./deployment-queue-name";
import { ResourceLock } from "./resource-lock";

export interface DeploymentWorkerScope {
  uow: IUnitOfWork;
  dockerService: DockerService;
  caddyService: CaddyService;
  publisher: NotificationPublisher;
  dispose: () => Promise<void>;
}

export interface DeploymentWorkerDependencies {
  getBuildSettings: () => Promise<{ concurrency: number } | null>;
  createScope: () => Promise<DeploymentWorkerScope>;
}

export class DeploymentWorker {
  private worker: Worker | null = null;
  private workerRedis: Redis | null = null;
  private pubsubRedis: Redis | null = null;

  constructor(
    private readonly serverId: string,
    private readonly dependencies: DeploymentWorkerDependencies,
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
    try {
      const settings = await this.dependencies.getBuildSettings();
      if (settings) {
        concurrency = Math.max(1, Math.min(100, settings.concurrency));
      } else {
        concurrency = this.serverId === "local" ? 2 : 1;
      }
    } catch (err: any) {
      log.error({
        message:
          "Failed to fetch build settings for worker, using default concurrency",
        err: err.message,
      });
    } finally {
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
    const {
      resourceId,
      deploymentId,
      previewDeploymentId,
      sourceRevision: queuedSourceRevision,
    } = job.data as {
      resourceId: string;
      deploymentId: string;
      previewDeploymentId?: string;
      sourceRevision?: string;
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
    let remoteCliCleanup: (() => void) | null = null;
    let buildCliCleanup: (() => void) | null = null;

    const scope = await this.dependencies.createScope();
    const { uow, publisher } = scope;
    let dockerService = scope.dockerService;
    let caddyService = scope.caddyService;

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

      const succeeded = status === "success";
      await publisher.execute({
        organizationId: project.organizationId,
        event: succeeded ? "deployment_succeeded" : "deployment_failed",
        idempotencyKey: `deployment:${deploymentId}:${status}`,
        title: `${resource.name} deployment ${succeeded ? "succeeded" : "failed"}`,
        message: succeeded
          ? `The deployment for ${resource.name} completed successfully.`
          : `The deployment for ${resource.name} failed. Review the deployment logs for details.`,
        metadata: {
          resourceId,
          resourceName: resource.name,
          deploymentId,
          resourceType: resource.type,
          projectName: project.name,
          environmentName: environment.name,
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
      await uow.transaction(async (tx) => {
        // Update dedicated deployment record
        await tx.deploymentRepository.updateById(deploymentId, {
          logs: logsAccumulator,
          status,
        });

        if (previewDeploymentId) {
          await tx.previewDeploymentRepository.updateById(previewDeploymentId, {
            status: status === "success" ? "success" : "failed",
          });
        }

        // Update only desired resource status; runtime observations are queried live.
        const r = await tx.resourceRepository.findById(resourceId);
        if (r) {
          await tx.resourceRepository.updateById(resourceId, {
            ...(!previewDeploymentId
              ? { status: status === "success" ? "running" : "stopped" }
              : {}),
          });
        }
      });
    };

    try {
      const deployment = await uow.deploymentRepository.findById(deploymentId);
      if (!deployment || deployment.resourceId !== resourceId) {
        throw new Error("Deployment record does not match the queued job");
      }
      const sourceRevision = deployment.sourceRevision ?? queuedSourceRevision;
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
          await tx.resourceRepository.updateById(resourceId, {
            status: "running",
          });
        }
      });

      resource = await uow.transaction(async (tx) => {
        return await tx.resourceRepository.findById(resourceId);
      });

      if (!resource) {
        throw new Error("Resource not found");
      }
      const deployedResource = { ...resource };

      let previewDeploymentRecord: any = null;
      if (previewDeploymentId) {
        previewDeploymentRecord =
          await uow.previewDeploymentRepository.findById(previewDeploymentId);
        if (previewDeploymentRecord) {
          await uow.transaction(async (tx) => {
            await tx.previewDeploymentRepository.updateById(
              previewDeploymentId,
              {
                status: "running",
              },
            );
          });

          // Override name, appName, and branch in credentials
          deployedResource.name = previewDeploymentRecord.appName;
          deployedResource.appName = previewDeploymentRecord.appName;

          const creds = parseResourceCredentials(deployedResource.credentials);
          creds.branch = previewDeploymentRecord.branchName;
          deployedResource.credentials = JSON.stringify(creds);
        }
      }

      let buildDockerService = dockerService;
      buildCliCleanup = null;
      let registryInfo: any;
      let targetDestinationDocker: any;
      const cancellationKey = `upstand:deployment:cancel:${deploymentId}`;
      dockerService.setCancellationKey(cancellationKey);

      if (
        deployedResource.serverId &&
        !["local", "manager"].includes(deployedResource.serverId)
      ) {
        const server = await uow.serverRepository.findById(
          deployedResource.serverId,
        );
        if (!server) {
          // serverId not found in server table — likely a stale Swarm node ID
          // from before the "local" sentinel fix. Log a warning and fall back
          // to the local Docker socket.
          appendLog(
            `Warning: serverId '${deployedResource.serverId}' not found in server registry. ` +
              "Falling back to local Docker socket.\n",
          );
        } else {
          assertDeploymentServerSupportsResource(server, deployedResource.type);
          if (server.status !== "ready") {
            throw new Error(
              `Target deployment server '${server.name}' is not ready. Run server setup before deploying.`,
            );
          }
          if (!server.sshKeyId) {
            throw new Error(
              "Target deployment server has no SSH key configured",
            );
          }
          const sshKey = await uow.sshKeyRepository.findById(server.sshKeyId);
          if (!sshKey)
            throw new Error("Target deployment server SSH key not found");
          const privateKey = decryptSecret({
            ciphertext: sshKey.privateKeyCiphertext,
            iv: sshKey.privateKeyIv,
            authTag: sshKey.privateKeyAuthTag,
            keyVersion: sshKey.privateKeyVersion,
          });
          const connection = {
            host: server.ipAddress,
            port: server.port,
            username: server.username,
            privateKey,
            hostKeyFingerprint: server.sshHostKeyFingerprint ?? undefined,
          };
          const remote = createRemoteServices(connection);
          remoteCliCleanup = remote.cli.cleanup;
          dockerService = remote.dockerService;
          dockerService.setCancellationKey(cancellationKey);
          caddyService = remote.caddyService;
          targetDestinationDocker = remote.docker;
          appendLog(
            `Using independent Docker environment on '${server.name}'.\n`,
          );
        } // end else (server found)
      } // end if (non-local serverId)

      if (
        deployedResource.buildServerId &&
        deployedResource.buildServerId !== deployedResource.serverId
      ) {
        const buildServer = await uow.serverRepository.findById(
          deployedResource.buildServerId,
        );
        if (!buildServer) throw new Error("Target build server not found");
        assertBuildServerSupportsResource(buildServer, deployedResource.type);
        if (buildServer.status !== "ready") {
          throw new Error(
            `Target build server '${buildServer.name}' is not ready. Run server setup before deploying.`,
          );
        }
        if (!buildServer.sshKeyId) {
          throw new Error("Target build server has no SSH key configured");
        }
        const sshKey = await uow.sshKeyRepository.findById(
          buildServer.sshKeyId,
        );
        if (!sshKey) throw new Error("Target build server SSH key not found");
        const privateKey = decryptSecret({
          ciphertext: sshKey.privateKeyCiphertext,
          iv: sshKey.privateKeyIv,
          authTag: sshKey.privateKeyAuthTag,
          keyVersion: sshKey.privateKeyVersion,
        });
        const connection = {
          host: buildServer.ipAddress,
          port: buildServer.port,
          username: buildServer.username,
          privateKey,
          hostKeyFingerprint: buildServer.sshHostKeyFingerprint ?? undefined,
        };
        const remoteBuild = createRemoteServices(connection);
        buildCliCleanup = remoteBuild.cli.cleanup;
        buildDockerService = remoteBuild.dockerService;
        buildDockerService.setCancellationKey(cancellationKey);
        appendLog(
          `Offloading build compilation tasks to separate build server '${buildServer.name}'.\n`,
        );

        const envRecord = await uow.environmentRepository.findById(
          deployedResource.environmentId,
        );
        if (!envRecord) throw new Error("Environment not found");
        const projectRecord = await uow.projectRepository.findById(
          envRecord.projectId,
        );
        if (!projectRecord) throw new Error("Project not found");
        const organizationId = projectRecord.organizationId;

        const resourceCredentials = parseResourceCredentials(
          deployedResource.credentials,
        );
        const configuredBuildRegistryId =
          deployedResource.buildRegistryId ||
          resourceCredentials.buildRegistryId;
        const registry = configuredBuildRegistryId
          ? await uow.dockerRegistryRepository.findById(
              configuredBuildRegistryId,
            )
          : (
              await uow.dockerRegistryRepository.findByOrganizationId(
                organizationId,
              )
            )[0];
        if (!registry) {
          throw new Error(
            configuredBuildRegistryId
              ? "Selected build registry not found"
              : "No Docker Registry configured. A shared Docker Registry must be configured under settings to support separate build servers.",
          );
        }
        if (registry.organizationId !== organizationId) {
          throw new Error(
            "Selected build registry belongs to another organization",
          );
        }
        let decryptedPassword = "";
        if (registry.password) {
          try {
            const payload = JSON.parse(registry.password);
            if (payload.ciphertext && payload.iv && payload.authTag) {
              decryptedPassword = decryptSecret(payload);
            } else {
              decryptedPassword = registry.password;
            }
          } catch {
            decryptedPassword = registry.password;
          }
        }

        const cleanUrl = (registry.registryUrl || "")
          .replace(/https?:\/\//, "")
          .replace(/\/+$/, "");
        const serviceName = dockerService.sanitizeName(
          deployedResource.appName || deployedResource.name,
        );
        const imageTag = buildRegistryImageTag(registry, serviceName);

        registryInfo = {
          url: cleanUrl,
          username: registry.username,
          password: decryptedPassword,
          imageTag,
        };
      }

      // Remote servers have their own scheduler, so placement constraints from
      // the control-plane Swarm are intentionally not applied.
      const constraints: string[] | undefined = undefined;

      const envVars = parseResourceEnvironmentVariables(resource.envVars);

      if (resource.type === "database") {
        appendLog("Preparing database deployment...\n");

        const finalEnv = getDatabaseEnvironment({
          ...resource,
          envVars: JSON.stringify(envVars),
        });
        await dockerService.deployDatabase(
          resource,
          finalEnv,
          appendLog,
          constraints,
        );
        appendLog("Database Swarm service deployed successfully!\n");
      } else if (resource.type === "compose") {
        appendLog(
          resource.composeType === "compose"
            ? "Preparing Docker Compose deployment...\n"
            : "Preparing Docker Compose Stack deployment...\n",
        );
        let composeFile = "";
        const credentials = parseResourceCredentials(resource.credentials);
        if (resource.provider === "raw") {
          composeFile = credentials.composeFile || "";
        } else {
          const source = await resolveGitSource(resource, uow, appendLog);
          tempSshKeyPath = source.sshKeyPath || null;
          composeFile = await dockerService.readComposeFileFromGit(
            resource,
            source.cloneUrl,
            appendLog,
            source.sshKeyPath,
            sourceRevision,
          );
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
        appendLog(
          resource.composeType === "compose"
            ? "Docker Compose project deployed successfully!\n"
            : "Compose Stack deployed successfully!\n",
        );
      } else if (resource.type === "application") {
        if (resource.provider === "docker-registry") {
          let imageRegistryAuth:
            | { username?: string; password?: string; serveraddress?: string }
            | undefined;
          const imageCredentials = parseResourceCredentials(
            resource.credentials,
          );
          if (imageCredentials.registryId) {
            const registry = await uow.dockerRegistryRepository.findById(
              imageCredentials.registryId,
            );
            if (!registry)
              throw new Error("Selected Docker registry not found");
            const environment = await uow.environmentRepository.findById(
              resource.environmentId,
            );
            const project = environment
              ? await uow.projectRepository.findById(environment.projectId)
              : null;
            if (
              !project ||
              project.organizationId !== registry.organizationId
            ) {
              throw new Error(
                "Selected Docker registry belongs to another organization",
              );
            }
            let password = "";
            if (registry.password) {
              try {
                const payload = JSON.parse(registry.password);
                password =
                  payload.ciphertext && payload.iv && payload.authTag
                    ? decryptSecret(payload)
                    : registry.password;
              } catch {
                password = registry.password;
              }
            }
            imageRegistryAuth = {
              username: registry.username || undefined,
              password,
              serveraddress: (registry.registryUrl || "").replace(
                /^https?:\/\//,
                "",
              ),
            };
          }
          await dockerService.deployAppImage(
            resource,
            envVars,
            appendLog,
            constraints,
            imageRegistryAuth,
          );
          appendLog("Application image deployed successfully!\n");
        } else {
          appendLog(
            `Setting up Git deployment provider: ${resource.provider}...\n`,
          );
          let cloneUrl = "";
          let credentialsObj: any = {};
          try {
            credentialsObj = parseResourceCredentials(resource.credentials);
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
            assertSafeGitUrl(cloneUrl);

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
              fs.writeFileSync(tempSshKeyPath, `${privateKey.trim()}\n`, {
                mode: 0o600,
              });
            }
          } else if (resource.provider === "drop") {
            // Bypasses git setup, cloneUrl remains empty
          } else {
            throw new Error(
              `Unsupported deployment provider: ${resource.provider}`,
            );
          }

          appendLog(
            "Triggering Docker container build pipeline for repository...\n",
          );
          await buildDockerService.deployAppGit(
            resource,
            envVars,
            cloneUrl,
            appendLog,
            tempSshKeyPath || undefined,
            constraints,
            registryInfo,
            targetDestinationDocker,
            sourceRevision,
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

      if (updatedResource?.domains || previewDeploymentId) {
        const [resources, settings, allPreviews] = await uow.transaction(
          async (tx) => [
            await tx.resourceRepository.findMany(),
            await tx.webServerSettingsRepository.findGlobal(),
            await tx.previewDeploymentRepository.findMany(),
          ],
        );
        const routingResources =
          deployedResource.serverId &&
          !["local", "manager"].includes(deployedResource.serverId)
            ? resources.filter(
                (candidate) => candidate.serverId === deployedResource.serverId,
              )
            : resources.filter(
                (candidate) =>
                  !candidate.serverId ||
                  candidate.serverId === "local" ||
                  candidate.serverId === "manager",
              );

        // Fetch all active preview deployments
        const activePreviews = allPreviews.filter(
          (p) => p.status === "success" || p.id === previewDeploymentId,
        );
        const routingPreviews: any[] = [];
        for (const preview of activePreviews) {
          const parentResource = resources.find(
            (r) => r.id === preview.resourceId,
          );
          if (parentResource) {
            const matchesServer =
              deployedResource.serverId &&
              !["local", "manager"].includes(deployedResource.serverId)
                ? parentResource.serverId === deployedResource.serverId
                : !parentResource.serverId ||
                  parentResource.serverId === "local" ||
                  parentResource.serverId === "manager";

            if (matchesServer) {
              const parentDomains = JSON.parse(parentResource.domains || "[]");
              const parentPort = parentDomains[0]?.port || 80;
              const parentHttps = parentDomains[0]?.https ?? false;
              const parentCert = parentDomains[0]?.certificateType ?? "none";
              const parentMiddlewares = parentDomains[0]?.middlewares ?? [];

              const previewDomains = [
                {
                  host: preview.domain,
                  path: "/",
                  port: parentPort,
                  https: parentHttps,
                  certificateType: parentCert,
                  middlewares: parentMiddlewares,
                },
              ];

              routingPreviews.push({
                id: preview.id,
                name: preview.appName,
                type: "application",
                appName: preview.appName,
                domains: JSON.stringify(previewDomains),
                composeType: parentResource.composeType,
                advancedConfig: parentResource.advancedConfig,
              });
            }
          }
        }

        const certificates =
          (await uow.certificateRepository.findAll?.()) ?? [];
        await caddyService.syncResourceConfigs(
          [...routingResources, ...routingPreviews],
          settings || {},
          certificates,
        );
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
      const cancelled = Boolean(
        await redis.get(`upstand:deployment:cancel:${deploymentId}`),
      );
      appendLog(
        cancelled
          ? `\nDeployment cancelled by user. 🛑\nReason: ${err.message}\n`
          : `\nDeployment failed! ❌\nError: ${err.message}\n`,
      );
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
      remoteCliCleanup?.();
      buildCliCleanup?.();
      await redis.del(`upstand:deployment:cancel:${deploymentId}`);
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

async function resolveGitSource(
  resource: Resource,
  uow: IUnitOfWork,
  appendLog: (log: string) => void,
): Promise<{ cloneUrl: string; sshKeyPath?: string }> {
  const credentials = parseResourceCredentials(resource.credentials);
  let cloneUrl = "";
  let sshKeyPath: string | undefined;

  if (["github", "gitlab", "bitbucket", "gitea"].includes(resource.provider)) {
    const gitProviderId = credentials.githubAccount;
    if (!gitProviderId) {
      throw new Error(
        "Git Provider not associated. Please configure repository connection.",
      );
    }

    const gitProvider = await uow.transaction((tx) =>
      tx.gitProviderRepository.findById(gitProviderId),
    );
    if (!gitProvider) throw new Error("Associated Git Provider not found");
    const config = JSON.parse(gitProvider.config);

    if (resource.provider === "github") {
      appendLog("Retrieving GitHub App installation access token...\n");
      const token = await getInstallationToken(
        String(config.githubAppId),
        config.githubPrivateKey,
        config.githubInstallationId,
      );
      cloneUrl = `https://x-access-token:${token}@github.com/${credentials.repository}.git`;
    } else if (resource.provider === "gitlab") {
      appendLog("Connecting to GitLab using OAuth access token...\n");
      const gitlabHost = (config.gitlabUrl || "https://gitlab.com").replace(
        /https?:\/\//,
        "",
      );
      cloneUrl = `https://oauth2:${config.accessToken}@${gitlabHost}/${credentials.repository}.git`;
    } else if (resource.provider === "gitea") {
      appendLog("Connecting to Gitea using OAuth access token...\n");
      const giteaHost = (config.giteaUrl || "").replace(/https?:\/\//, "");
      cloneUrl = `https://oauth2:${config.accessToken}@${giteaHost}/${credentials.repository}.git`;
    } else {
      appendLog("Connecting to Bitbucket using app password...\n");
      cloneUrl = `https://${config.bitbucketUsername}:${config.appPassword}@bitbucket.org/${credentials.repository}.git`;
    }
  } else if (resource.provider === "git") {
    cloneUrl = credentials.repositoryUrl || "";
    if (!cloneUrl) throw new Error("Repository URL is empty in configuration");
    assertSafeGitUrl(cloneUrl);

    if (credentials.sshKeyId) {
      const sshKey = await uow.transaction((tx) =>
        tx.sshKeyRepository.findById(credentials.sshKeyId),
      );
      if (!sshKey) throw new Error("Configured SSH key not found in workspace");
      const privateKey = decryptSecret({
        ciphertext: sshKey.privateKeyCiphertext,
        iv: sshKey.privateKeyIv,
        authTag: sshKey.privateKeyAuthTag,
        keyVersion: sshKey.privateKeyVersion,
      });
      const buildDir = path.join(process.cwd(), ".builds");
      fs.mkdirSync(buildDir, { recursive: true });
      sshKeyPath = path.join(buildDir, `ssh-key-${resource.id}`);
      fs.writeFileSync(sshKeyPath, `${privateKey.trim()}\n`, { mode: 0o600 });
    }
  } else {
    throw new Error(
      `Unsupported Compose deployment provider: ${resource.provider}`,
    );
  }

  return { cloneUrl, sshKeyPath };
}
