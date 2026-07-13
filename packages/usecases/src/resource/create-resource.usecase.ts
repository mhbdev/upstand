import { randomUUID } from "node:crypto";
import {
  ApplicationBuildConfigSchema,
  DEFAULT_APPLICATION_BUILD_CONFIG,
  DEFAULT_RESOURCE_ADVANCED_CONFIG,
  type IUnitOfWork,
  isSupportedDatabaseImage,
  type Resource,
  ResourceComposeTypeSchema,
  serializeApplicationBuildConfig,
  serializeResourceAdvancedConfig,
  ValidationError,
} from "@upstand/domain";
import { encryptSecret } from "@upstand/platform/crypto/secret-box";
import { log } from "evlog";
import { z } from "zod";

export const CreateResourceInputSchema = z.object({
  environmentId: z.string().min(1, "Environment ID is required"),
  name: z.string().min(1, "Resource name is required"),
  type: z.enum(["application", "database", "compose"]),
  appName: z.string().min(1, "App Name is required"),
  description: z.string().optional(),
  dbType: z.string().optional(),
  composeType: ResourceComposeTypeSchema.optional(),
  dockerImage: z.string().optional(),
  credentials: z.string().optional(),
  buildConfig: ApplicationBuildConfigSchema.optional(),
  serverId: z.string().optional(),
});

export type CreateResourceInput = z.infer<typeof CreateResourceInputSchema>;

function dockerServiceKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-");
}

export class CreateResourceUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: CreateResourceInput): Promise<Resource> {
    if (
      input.type === "database" &&
      !isSupportedDatabaseImage(input.dbType, input.dockerImage)
    ) {
      throw new ValidationError(
        "Select a supported database image version for the selected database engine",
      );
    }

    return this.uow.transaction(async (tx) => {
      const environment = await tx.environmentRepository.findById(
        input.environmentId,
      );
      if (!environment) {
        throw new ValidationError("Environment not found");
      }

      const serviceKey = dockerServiceKey(input.appName);
      const duplicate = (await tx.resourceRepository.findMany()).find(
        (resource) => dockerServiceKey(resource.appName ?? "") === serviceKey,
      );
      if (duplicate) {
        throw new ValidationError(
          `Docker service name '${input.appName}' is already used by resource '${duplicate.name}'. Choose a unique service name across the Swarm cluster.`,
        );
      }

      // Prefill provider and initial metadata
      let provider = "github";
      if (input.type === "database") {
        provider = input.dockerImage || input.dbType || "docker-registry";
      } else if (input.type === "application" && input.dockerImage) {
        provider = "docker-registry";
      } else if (input.type === "compose") {
        provider = "raw";
      }

      let credentials = input.credentials ?? null;
      if (input.type === "database" && input.credentials) {
        try {
          const encrypted = encryptSecret(input.credentials);
          credentials = JSON.stringify(encrypted);
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

      const res = await tx.resourceRepository.create({
        id: randomUUID(),
        environmentId: input.environmentId,
        name: input.name,
        type: input.type,
        status: "idle",
        provider,
        appName: input.appName,
        description: input.description ?? null,
        dbType: input.dbType ?? null,
        composeType:
          input.type === "compose" ? (input.composeType ?? "stack") : null,
        dockerImage: input.dockerImage ?? null,
        credentials,
        buildConfig: serializeApplicationBuildConfig(
          input.buildConfig ?? DEFAULT_APPLICATION_BUILD_CONFIG,
        ),
        advancedConfig: serializeResourceAdvancedConfig(
          DEFAULT_RESOURCE_ADVANCED_CONFIG,
        ),
        envVars: "{}",
        domains: "[]",
        deployments: "[]",
        containers: "[]",
        serverId: input.serverId ?? null,
      });

      // Increment resource count
      await tx.environmentRepository.updateById(input.environmentId, {
        resourceCount: environment.resourceCount + 1,
      });

      return res;
    });
  }
}
