import {
  type ApplicationBuildConfig,
  ApplicationBuildConfigSchema,
} from "@upstand/domain";

export const RAILPACK_VERSIONS = [
  "0.15.4",
  "0.16.0",
  "0.17.0",
  "0.18.0",
  "0.19.0",
  "0.20.0",
  "0.21.0",
  "0.22.0",
  "0.23.0",
] as const;

export type ResourceProvider =
  | "docker"
  | "github"
  | "gitlab"
  | "bitbucket"
  | "gitea"
  | "git"
  | "raw"
  | "drop";

export type DatabaseCredentials = Record<string, string>;

const defaultDockerfileBuildConfig = (): ApplicationBuildConfig => ({
  type: "dockerfile",
  buildPath: ".",
  dockerfilePath: "Dockerfile",
  dockerContextPath: ".",
  dockerBuildArgs: {},
  dockerNoCache: false,
  dockerCleanupCache: false,
});

export function parseApplicationBuildConfig(
  value: string | null | undefined,
): ApplicationBuildConfig {
  if (!value) return defaultDockerfileBuildConfig();
  try {
    return ApplicationBuildConfigSchema.parse(JSON.parse(value));
  } catch {
    return defaultDockerfileBuildConfig();
  }
}

export function parseResourceCredentials(
  value: string | null | undefined,
): Record<string, any> | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseDeployments(value: string | null | undefined): any[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createBuildConfig(
  type: ApplicationBuildConfig["type"],
): ApplicationBuildConfig {
  switch (type) {
    case "dockerfile":
      return defaultDockerfileBuildConfig();
    case "railpack":
      return { type, buildPath: ".", railpackVersion: "0.15.4" };
    case "nixpacks":
      return { type, buildPath: "." };
    case "heroku-buildpacks":
      return { type, buildPath: ".", herokuVersion: "24" };
    case "paketo-buildpacks":
      return { type, buildPath: "." };
    case "static":
      return { type, buildPath: ".", publishDirectory: "dist", spa: true };
  }
}
