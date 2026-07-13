import {
  ApplicationBuildConfigSchema,
  type IUnitOfWork,
  isSupportedDatabaseImage,
  parseDomainMappings,
  parseResourceAdvancedConfig,
  type Resource,
  ResourceComposeTypeSchema,
  serializeApplicationBuildConfig,
  serializeDomainMappings,
  serializeResourceAdvancedConfig,
  ValidationError,
} from "@upstand/domain";
import { encryptSecret } from "@upstand/domain/crypto/secret-box";
import { log } from "evlog";
import { z } from "zod";
import { CaddyService } from "../web-server/caddy.service";
import { decryptSecret } from "@upstand/domain/crypto/secret-box";
import { createRemoteDocker } from "./docker-client";

export const UpdateResourceInputSchema = z.object({
  id: z.string().min(1, "Resource ID is required"),
  name: z.string().optional(),
  status: z.enum(["running", "stopped"]).optional(),
  appName: z.string().optional(),
  description: z.string().optional(),
  provider: z.string().optional(),
  dbType: z.string().optional(),
  dockerImage: z.string().optional(),
  composeType: ResourceComposeTypeSchema.optional(),
  credentials: z.string().optional(),
  buildConfig: ApplicationBuildConfigSchema.optional(),
  advancedConfig: z.string().optional(),
  envVars: z.string().optional(),
  domains: z.string().optional(),
  deployments: z.string().optional(),
  containers: z.string().optional(),
  serverId: z.string().nullable().optional(),
});

export type UpdateResourceInput = z.infer<typeof UpdateResourceInputSchema>;

function dockerServiceKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-");
}

export class UpdateResourceUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly caddyService: CaddyService,
  ) {}

  async execute(input: UpdateResourceInput): Promise<Resource | null> {
    const resource = await this.uow.resourceRepository.findById(input.id);
    if (!resource) {
      throw new ValidationError("Resource not found");
    }

    const patch: Partial<Resource> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.status !== undefined) patch.status = input.status;
    if (input.appName !== undefined) {
      const serviceKey = dockerServiceKey(input.appName);
      const duplicate = (await this.uow.resourceRepository.findMany()).find(
        (candidate) =>
          candidate.id !== resource.id &&
          dockerServiceKey(candidate.appName ?? "") === serviceKey,
      );
      if (duplicate) {
        throw new ValidationError(
          `Docker service name '${input.appName}' is already used by resource '${duplicate.name}'. Choose a unique service name across the Swarm cluster.`,
        );
      }
      patch.appName = input.appName;
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.provider !== undefined) patch.provider = input.provider;
    if (input.dbType !== undefined || input.dockerImage !== undefined) {
      if (resource.type !== "database") {
        throw new ValidationError(
          "Database engine and image can only be changed on database resources",
        );
      }

      const dbType = input.dbType ?? resource.dbType ?? undefined;
      const dockerImage =
        input.dockerImage ?? resource.dockerImage ?? undefined;
      if (!isSupportedDatabaseImage(dbType, dockerImage)) {
        throw new ValidationError(
          "Select a supported database image version for the selected database engine",
        );
      }
      if (input.dbType !== undefined) patch.dbType = input.dbType;
      if (input.dockerImage !== undefined)
        patch.dockerImage = input.dockerImage;
    }
    if (input.composeType !== undefined) {
      if (resource.type !== "compose") {
        throw new ValidationError(
          "Compose deployment mode can only be changed on Compose resources",
        );
      }
      patch.composeType = input.composeType;
    }
    if (input.credentials !== undefined) {
      let credentials = input.credentials;
      if (resource.type === "database" && input.credentials) {
        try {
          credentials = JSON.stringify(encryptSecret(input.credentials));
        } catch (error: unknown) {
          log.error({
            message: "Failed to encrypt database credentials",
            err: error instanceof Error ? error.message : String(error),
          });
          throw new ValidationError(
            "Database credentials could not be encrypted",
          );
        }
      }
      patch.credentials = credentials;
    }
    if (input.envVars !== undefined) patch.envVars = input.envVars;
    if (input.advancedConfig !== undefined) {
      try {
        patch.advancedConfig = serializeResourceAdvancedConfig(
          parseResourceAdvancedConfig(input.advancedConfig),
        );
      } catch (error) {
        throw new ValidationError(
          `Invalid advanced resource configuration: ${error instanceof Error ? error.message : "unknown validation error"}`,
        );
      }
    }
    if (input.buildConfig !== undefined) {
      if (resource.type !== "application") {
        throw new ValidationError(
          "Build configuration is only supported by application resources",
        );
      }
      patch.buildConfig = serializeApplicationBuildConfig(input.buildConfig);
    }
    if (input.domains !== undefined) {
      try {
        patch.domains = serializeDomainMappings(
          parseDomainMappings(input.domains),
        );
      } catch (error) {
        throw new ValidationError(
          `Invalid domain configuration: ${error instanceof Error ? error.message : "unknown validation error"}`,
        );
      }
    }
    if (input.deployments !== undefined) patch.deployments = input.deployments;
    if (input.containers !== undefined) patch.containers = input.containers;
    if (input.serverId !== undefined) patch.serverId = input.serverId;

    const routingChanged =
      input.domains !== undefined ||
      input.appName !== undefined ||
      input.name !== undefined ||
      input.advancedConfig !== undefined;
    const candidate = { ...resource, ...patch } as Resource;

    const resources = routingChanged
      ? await this.uow.resourceRepository.findMany()
      : [];
    const serverId = resource.serverId;
    const sameServerResources = serverId && !["local", "manager"].includes(serverId)
      ? resources.filter((c) => c.serverId === serverId)
      : resources.filter(
          (c) =>
            !c.serverId ||
            c.serverId === "local" ||
            c.serverId === "manager",
        );

    const existingResources = routingChanged ? sameServerResources : [];
    const candidateResources = routingChanged
      ? sameServerResources.map((item) =>
          item.id === resource.id ? candidate : item,
        )
      : [];
    const settings = routingChanged
      ? await this.uow.webServerSettingsRepository.findGlobal()
      : null;

    let caddyService = this.caddyService;
    if (routingChanged && serverId && !["local", "manager"].includes(serverId)) {
      const server = await this.uow.serverRepository.findById(serverId);
      if (server) {
        if (!server.sshKeyId) {
          throw new Error("Target deployment server has no SSH key configured");
        }
        const sshKey = await this.uow.sshKeyRepository.findById(server.sshKeyId);
        if (!sshKey) {
          throw new Error("Target deployment server SSH key not found");
        }
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
        };
        const remoteDocker = createRemoteDocker(connection);
        caddyService = new CaddyService(remoteDocker);
      }
    }

    // Apply the fully validated Caddy configuration before committing the metadata.
    // If the database write fails, immediately restore the previous known-good config.
    if (routingChanged) {
      await caddyService.syncResourceConfigs(
        candidateResources,
        settings || {},
      );
    }

    try {
      return await this.uow.transaction((tx) =>
        tx.resourceRepository.updateById(input.id, patch),
      );
    } catch (error) {
      if (routingChanged) {
        try {
          await caddyService.syncResourceConfigs(
            existingResources,
            settings || {},
          );
        } catch (rollbackError) {
          log.error({
            message: "Failed to restore Caddy after resource update rollback",
            err:
              rollbackError instanceof Error
                ? rollbackError.message
                : rollbackError,
          });
        }
      }
      throw error;
    }
  }
}
