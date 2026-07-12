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

const ResourcePortSchema = z.object({
  publishedPort: z.number().int().min(1).max(65535),
  targetPort: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
});

const ResourceVolumeSchema = z.object({
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
  dockerfilePath: RelativeBuildPathSchema.default("Dockerfile"),
  dockerContextPath: RelativeBuildPathSchema.default("."),
  dockerBuildStage: z.string().trim().min(1).max(128).optional(),
  dockerBuildArgs: z.record(z.string(), z.string()).default({}),
});

export const RailpackBuildConfigSchema = z.object({
  type: z.literal("railpack"),
  railpackVersion: z
    .string()
    .trim()
    .regex(
      /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/,
      "Use a valid Railpack version",
    )
    .default("0.23.0"),
});

export const NixpacksBuildConfigSchema = z.object({
  type: z.literal("nixpacks"),
  publishDirectory: RelativeBuildPathSchema.optional(),
});

export const HerokuBuildpacksBuildConfigSchema = z.object({
  type: z.literal("heroku-buildpacks"),
  herokuVersion: z.enum(["24", "26"]).default("24"),
});

export const PaketoBuildpacksBuildConfigSchema = z.object({
  type: z.literal("paketo-buildpacks"),
});

export const StaticBuildConfigSchema = z.object({
  type: z.literal("static"),
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
  dockerfilePath: "Dockerfile",
  dockerContextPath: ".",
  dockerBuildArgs: {},
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
  credentials: z.string().nullable().optional(),
  buildConfig: z.string(),
  advancedConfig: z.string().optional(),
  envVars: z.string(),
  domains: z.string(),
  deployments: z.string(),
  containers: z.string(),
  serverId: z.string().nullable().optional(),
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
  credentials?: string | null;
  buildConfig?: string;
  advancedConfig?: string;
  envVars?: string;
  domains?: string;
  deployments?: string;
  containers?: string;
  serverId?: string | null;
}
