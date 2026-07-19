import { z } from "zod";

const RelativeBuildPathSchema = z
  .string()
  .trim()
  .min(1, "A build path is required")
  .max(512, "Build paths must not exceed 512 characters");

export const ApplicationBuildTypeSchema = z.enum([
  "dockerfile",
  "railpack",
  "nixpacks",
  "heroku-buildpacks",
  "paketo-buildpacks",
  "static",
]);

export const DATABASE_IMAGE_OPTIONS = {
  postgres: ["postgres:16-alpine", "postgres:17-alpine"],
  mysql: ["mysql:8.0", "mysql:8.4"],
  mariadb: ["mariadb:10.11", "mariadb:11"],
  mongodb: ["mongo:6.0", "mongo:7.0"],
  redis: ["redis:7-alpine", "redis:8-alpine"],
  libsql: ["ghcr.io/tursodatabase/libsql-server:latest"],
} as const;

export type DatabaseType = keyof typeof DATABASE_IMAGE_OPTIONS;

/** Conservative validation for an explicitly selected custom Docker image. */
export const DockerImageReferenceSchema = z
  .string()
  .trim()
  .min(1, "Docker image is required")
  .max(512, "Docker image reference is too long")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._/@:-]*$/,
    "Docker image reference contains unsupported characters",
  );

export function isValidDockerImageReference(
  value: string | null | undefined,
): boolean {
  return (
    typeof value === "string" &&
    DockerImageReferenceSchema.safeParse(value).success
  );
}

export const ResourceComposeTypeSchema = z.enum(["compose", "stack"]);
export type ResourceComposeType = z.infer<typeof ResourceComposeTypeSchema>;

export function isSupportedDatabaseImage(
  databaseType: string | undefined,
  image: string | null | undefined,
  allowCustom = false,
): boolean {
  if (!databaseType || !image) return false;
  const options = DATABASE_IMAGE_OPTIONS[databaseType as DatabaseType];
  return Boolean(
    (options as readonly string[] | undefined)?.includes(image) ||
      (allowCustom && isValidDockerImageReference(image)),
  );
}

export const ResourcePortSchema = z.object({
  publishedPort: z.number().int().min(1).max(65535),
  targetPort: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});

export const ResourceVolumeSchema = z.object({
  source: z.string().trim().min(1).max(512),
  target: z
    .string()
    .trim()
    .regex(/^\/.+/, "Volume targets must be absolute paths"),
  readOnly: z.boolean().default(false),
});

const ResourceHealthcheckSchema = z.object({
  command: z.array(z.string().trim().min(1)).min(1).max(32),
  intervalSeconds: z.number().int().min(1).max(86400).default(30),
  timeoutSeconds: z.number().int().min(1).max(86400).default(5),
  retries: z.number().int().min(1).max(100).default(3),
  startPeriodSeconds: z.number().int().min(0).max(86400).default(10),
});

export const ResourceAdvancedConfigSchema = z.object({
  serviceName: z
    .string()
    .trim()
    .max(253)
    .optional()
    .describe("Compose service to receive resource-level overrides."),
  isolatedDeployment: z
    .boolean()
    .default(false)
    .describe("Use a dedicated Swarm overlay network for this resource."),
  isolatedDeploymentsVolume: z
    .boolean()
    .default(false)
    .describe("Prefix Compose named volumes when isolation is enabled."),
  randomize: z
    .boolean()
    .default(false)
    .describe("Randomize Compose resource names to avoid collisions."),
  randomSuffix: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{0,31}$/)
    .optional(),
  command: z.array(z.string().trim().min(1)).max(64).default([]),
  args: z.array(z.string().max(4096)).max(128).default([]),
  ports: z.array(ResourcePortSchema).max(32).default([]),
  volumes: z.array(ResourceVolumeSchema).max(32).default([]),
  environment: z.record(z.string(), z.string()).default({}),
  labels: z.record(z.string(), z.string()).default({}),
  placementConstraints: z
    .array(z.string().trim().min(1).max(256))
    .max(32)
    .default([]),
  resources: z
    .object({
      cpuLimit: z.number().positive().max(1024).optional(),
      cpuReservation: z.number().positive().max(1024).optional(),
      memoryLimitMb: z.number().int().positive().max(1_048_576).optional(),
      memoryReservationMb: z
        .number()
        .int()
        .positive()
        .max(1_048_576)
        .optional(),
    })
    .default({}),
  restartPolicy: z
    .object({
      condition: z.enum(["none", "on-failure", "any"]).default("any"),
      maxAttempts: z.number().int().min(0).max(1000).optional(),
      delaySeconds: z.number().int().min(0).max(86400).optional(),
      windowSeconds: z.number().int().min(0).max(86400).optional(),
    })
    .default({ condition: "any" }),
  replicas: z.number().int().min(0).max(1000).optional(),
  stopGracePeriodSeconds: z.number().int().min(0).max(86400).optional(),
  workingDir: z.string().trim().max(4096).optional(),
  user: z.string().trim().max(256).optional(),
  hostname: z.string().trim().max(253).optional(),
  dns: z.array(z.string().trim().min(1).max(253)).max(16).default([]),
  dnsSearch: z.array(z.string().trim().min(1).max(253)).max(16).default([]),
  extraHosts: z.array(z.string().trim().min(1).max(512)).max(64).default([]),
  sysctls: z.record(z.string(), z.string()).default({}),
  capAdd: z.array(z.string().trim().min(1).max(128)).max(64).default([]),
  capDrop: z.array(z.string().trim().min(1).max(128)).max(64).default([]),
  updateConfig: z
    .object({
      parallelism: z.number().int().min(0).max(1000).optional(),
      delaySeconds: z.number().int().min(0).max(86400).optional(),
      monitorSeconds: z.number().int().min(0).max(86400).optional(),
      failureAction: z.enum(["continue", "pause", "rollback"]).optional(),
      order: z.enum(["stop-first", "start-first"]).optional(),
    })
    .default({}),
  rollbackConfig: z
    .object({
      parallelism: z.number().int().min(0).max(1000).optional(),
      delaySeconds: z.number().int().min(0).max(86400).optional(),
      monitorSeconds: z.number().int().min(0).max(86400).optional(),
      failureAction: z.enum(["continue", "pause"]).optional(),
      order: z.enum(["stop-first", "start-first"]).optional(),
    })
    .default({}),
  healthcheck: ResourceHealthcheckSchema.nullable().default(null),
  init: z.boolean().default(false),
  readOnlyRootFilesystem: z.boolean().default(false),
  tty: z.boolean().default(false),
  privileged: z.boolean().default(false),
});

export type ResourceAdvancedConfig = z.infer<
  typeof ResourceAdvancedConfigSchema
>;

export const DEFAULT_RESOURCE_ADVANCED_CONFIG: ResourceAdvancedConfig =
  ResourceAdvancedConfigSchema.parse({});

export const serializeResourceAdvancedConfig = (
  config: ResourceAdvancedConfig,
): string => JSON.stringify(ResourceAdvancedConfigSchema.parse(config));

export const parseResourceAdvancedConfig = (
  value: string | null | undefined,
): ResourceAdvancedConfig => {
  if (!value) return DEFAULT_RESOURCE_ADVANCED_CONFIG;
  try {
    return ResourceAdvancedConfigSchema.parse(JSON.parse(value));
  } catch {
    return DEFAULT_RESOURCE_ADVANCED_CONFIG;
  }
};

export const DockerfileBuildConfigSchema = z.object({
  type: z.literal("dockerfile"),
  buildPath: RelativeBuildPathSchema.default("."),
  dockerfilePath: RelativeBuildPathSchema.default("Dockerfile"),
  dockerContextPath: RelativeBuildPathSchema.default("."),
  dockerBuildStage: z.string().trim().min(1).max(128).optional(),
  dockerBuildArgs: z.record(z.string(), z.string()).default({}),
  dockerNoCache: z.boolean().default(false),
  dockerCleanupCache: z.boolean().default(false),
});

export const RailpackBuildConfigSchema = z.object({
  type: z.literal("railpack"),
  buildPath: RelativeBuildPathSchema.default("."),
  railpackVersion: z
    .string()
    .trim()
    .regex(
      /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/,
      "Use a valid Railpack version",
    )
    .default("0.15.4"),
});

export const NixpacksBuildConfigSchema = z.object({
  type: z.literal("nixpacks"),
  buildPath: RelativeBuildPathSchema.default("."),
  publishDirectory: RelativeBuildPathSchema.optional(),
});

export const HerokuBuildpacksBuildConfigSchema = z.object({
  type: z.literal("heroku-buildpacks"),
  buildPath: RelativeBuildPathSchema.default("."),
  herokuVersion: z.enum(["24", "26"]).default("24"),
});

export const PaketoBuildpacksBuildConfigSchema = z.object({
  type: z.literal("paketo-buildpacks"),
  buildPath: RelativeBuildPathSchema.default("."),
});

export const StaticBuildConfigSchema = z.object({
  type: z.literal("static"),
  buildPath: RelativeBuildPathSchema.default("."),
  publishDirectory: RelativeBuildPathSchema,
  spa: z.boolean().default(false),
});

export const ApplicationBuildConfigSchema = z.discriminatedUnion("type", [
  DockerfileBuildConfigSchema,
  RailpackBuildConfigSchema,
  NixpacksBuildConfigSchema,
  HerokuBuildpacksBuildConfigSchema,
  PaketoBuildpacksBuildConfigSchema,
  StaticBuildConfigSchema,
]);

export type ApplicationBuildConfig = z.infer<
  typeof ApplicationBuildConfigSchema
>;

export const DEFAULT_APPLICATION_BUILD_CONFIG: ApplicationBuildConfig = {
  type: "dockerfile",
  buildPath: ".",
  dockerfilePath: "Dockerfile",
  dockerContextPath: ".",
  dockerBuildArgs: {},
  dockerNoCache: false,
  dockerCleanupCache: false,
};

export const serializeApplicationBuildConfig = (
  config: ApplicationBuildConfig,
): string => JSON.stringify(ApplicationBuildConfigSchema.parse(config));

export const parseApplicationBuildConfig = (
  value: string | null | undefined,
): ApplicationBuildConfig => {
  if (!value) {
    return DEFAULT_APPLICATION_BUILD_CONFIG;
  }

  try {
    return ApplicationBuildConfigSchema.parse(JSON.parse(value));
  } catch {
    return DEFAULT_APPLICATION_BUILD_CONFIG;
  }
};

export const ResourceSchema = z.object({
  id: z.string(),
  environmentId: z.string(),
  name: z.string(),
  type: z.string(),
  status: z.string(),
  provider: z.string(),
  appName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  dbType: z.string().nullable().optional(),
  composeType: z.string().nullable().optional(),
  dockerImage: z.string().nullable().optional(),
  buildRegistryId: z.string().nullable().optional(),
  rollbackActive: z.boolean().optional(),
  rollbackRegistryId: z.string().nullable().optional(),
  externalPort: z.number().int().min(1).max(65535).nullable().optional(),
  libsqlGrpcPort: z.number().int().min(1).max(65535).nullable().optional(),
  libsqlAdminPort: z.number().int().min(1).max(65535).nullable().optional(),
  credentials: z.string().nullable().optional(),
  triggerType: z.enum(["push", "tag"]).optional(),
  tagPattern: z.string().nullable().optional(),
  watchPaths: z.string().optional(),
  webhookTokenHash: z.string().nullable().optional(),
  webhookTokenPrefix: z.string().nullable().optional(),
  buildConfig: z.string(),
  buildSecrets: z.string().nullable().optional(),
  isPreviewDeploymentsActive: z.boolean().optional(),
  previewLimit: z.number().int().min(1).max(100).optional(),
  previewWildcard: z.string().nullable().optional(),
  previewHttps: z.boolean().optional(),
  previewPort: z.number().int().min(1).max(65535).optional(),
  advancedConfig: z.string().optional(),
  envVars: z.string(),
  domains: z.string(),
  serverId: z.string().nullable().optional(),
  buildServerId: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Resource = z.infer<typeof ResourceSchema>;

export interface CreateResourceDTO {
  id?: string;
  environmentId: string;
  name: string;
  type: string;
  status?: string;
  provider: string;
  appName?: string | null;
  description?: string | null;
  dbType?: string | null;
  composeType?: string | null;
  dockerImage?: string | null;
  buildRegistryId?: string | null;
  rollbackActive?: boolean;
  rollbackRegistryId?: string | null;
  externalPort?: number | null;
  libsqlGrpcPort?: number | null;
  libsqlAdminPort?: number | null;
  credentials?: string | null;
  triggerType?: "push" | "tag";
  tagPattern?: string | null;
  watchPaths?: string;
  webhookTokenHash?: string | null;
  webhookTokenPrefix?: string | null;
  buildConfig?: string;
  buildSecrets?: string | null;
  isPreviewDeploymentsActive?: boolean;
  previewLimit?: number;
  previewWildcard?: string | null;
  previewHttps?: boolean;
  previewPort?: number;
  advancedConfig?: string;
  envVars?: string;
  domains?: string;
  serverId?: string | null;
  buildServerId?: string | null;
}
