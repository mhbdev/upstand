import {
  ApplicationBuildConfigSchema,
  type IUnitOfWork,
  parseDomainMappings,
  type Resource,
  serializeDomainMappings,
  serializeApplicationBuildConfig,
  ValidationError,
} from "@upstand/domain";
import { encryptSecret } from "@upstand/domain/crypto/secret-box";
import { log } from "evlog";
import { z } from "zod";
import type { CaddyService } from "../web-server/caddy.service";

export const UpdateResourceInputSchema = z.object({
  id: z.string().min(1, "Resource ID is required"),
  name: z.string().optional(),
  status: z.enum(["running", "stopped"]).optional(),
  appName: z.string().optional(),
  description: z.string().optional(),
  provider: z.string().optional(),
  credentials: z.string().optional(),
  buildConfig: ApplicationBuildConfigSchema.optional(),
  envVars: z.string().optional(),
  domains: z.string().optional(),
  deployments: z.string().optional(),
  containers: z.string().optional(),
  serverId: z.string().nullable().optional(),
});

export type UpdateResourceInput = z.infer<typeof UpdateResourceInputSchema>;

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
    if (input.appName !== undefined) patch.appName = input.appName;
    if (input.description !== undefined) patch.description = input.description;
    if (input.provider !== undefined) patch.provider = input.provider;
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
      input.name !== undefined;
    const candidate = { ...resource, ...patch } as Resource;
    const existingResources = routingChanged
      ? await this.uow.resourceRepository.findMany()
      : [];
    const candidateResources = routingChanged
      ? existingResources.map((item) =>
          item.id === resource.id ? candidate : item,
        )
      : [];
    const settings = routingChanged
      ? await this.uow.webServerSettingsRepository.findGlobal()
      : null;

    // Apply the fully validated Caddy configuration before committing the metadata.
    // If the database write fails, immediately restore the previous known-good config.
    if (routingChanged) {
      await this.caddyService.syncResourceConfigs(
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
          await this.caddyService.syncResourceConfigs(
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
