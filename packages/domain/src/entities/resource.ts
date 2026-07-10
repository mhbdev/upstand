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

export const DockerfileBuildConfigSchema = z.object({
  type: z.literal("dockerfile"),
  dockerfilePath: RelativeBuildPathSchema.default("Dockerfile"),
  dockerContextPath: RelativeBuildPathSchema.default("."),
  dockerBuildStage: z.string().trim().min(1).max(128).optional(),
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
  envVars?: string;
  domains?: string;
  deployments?: string;
  containers?: string;
  serverId?: string | null;
}
