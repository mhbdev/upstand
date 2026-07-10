import type { IUnitOfWork } from "@upstand/domain";
import { z } from "zod";
import { getBitbucketBranches } from "./bitbucket-client";
import { getGiteaBranches, refreshGiteaToken } from "./gitea-client";
import { getBranches } from "./github-client";
import { getGitlabBranches, refreshGitlabToken } from "./gitlab-client";

export const ListGitBranchesInputSchema = z.object({
  gitProviderId: z.string().min(1, "Git Provider ID is required"),
  owner: z.string().min(1, "Repository owner is required"),
  repo: z.string().min(1, "Repository name is required"),
});

export type ListGitBranchesInput = z.infer<typeof ListGitBranchesInputSchema>;

export class ListGitBranchesUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: ListGitBranchesInput) {
    return this.uow.transaction(async (tx) => {
      const provider = await tx.gitProviderRepository.findById(
        input.gitProviderId,
      );
      if (!provider) {
        throw new Error("Git Provider not found");
      }

      if (provider.provider === "github") {
        const config = JSON.parse(provider.config);
        if (
          !config.githubAppId ||
          !config.githubPrivateKey ||
          !config.githubInstallationId
        ) {
          throw new Error(
            "GitHub App is not fully configured (missing installation)",
          );
        }
        return await getBranches(
          String(config.githubAppId),
          config.githubPrivateKey,
          config.githubInstallationId,
          input.owner,
          input.repo,
        );
      }

      if (provider.provider === "gitlab") {
        const config = JSON.parse(provider.config);
        const currentTime = Math.floor(Date.now() / 1000);
        const safetyMargin = 60;

        let accessToken = config.accessToken;
        if (
          config.expiresAt &&
          currentTime + safetyMargin >= config.expiresAt
        ) {
          const refreshed = await refreshGitlabToken(
            config.gitlabUrl,
            config.refreshToken,
            config.applicationId,
            config.secret,
          );
          config.accessToken = refreshed.accessToken;
          config.refreshToken = refreshed.refreshToken;
          config.expiresAt = refreshed.expiresAt;

          await tx.gitProviderRepository.updateById(provider.id, {
            config: JSON.stringify(config),
          });
          accessToken = refreshed.accessToken;
        }

        // Pass owner/repo format for GitLab project path querying
        const projectPath = `${input.owner}/${input.repo}`;
        return await getGitlabBranches(
          config.gitlabUrl,
          accessToken,
          projectPath,
        );
      }

      if (provider.provider === "bitbucket") {
        const config = JSON.parse(provider.config);
        return await getBitbucketBranches(
          config.bitbucketUsername,
          config.appPassword,
          input.owner,
          input.repo,
        );
      }

      if (provider.provider === "gitea") {
        const config = JSON.parse(provider.config);
        const currentTime = Math.floor(Date.now() / 1000);
        const safetyMargin = 60;

        let accessToken = config.accessToken;
        if (
          config.expiresAt &&
          currentTime + safetyMargin >= config.expiresAt
        ) {
          const refreshed = await refreshGiteaToken(
            config.giteaUrl,
            config.refreshToken,
            config.clientId,
            config.clientSecret,
          );
          config.accessToken = refreshed.accessToken;
          config.refreshToken = refreshed.refreshToken;
          config.expiresAt = refreshed.expiresAt;

          await tx.gitProviderRepository.updateById(provider.id, {
            config: JSON.stringify(config),
          });
          accessToken = refreshed.accessToken;
        }

        return await getGiteaBranches(
          config.giteaUrl,
          accessToken,
          input.owner,
          input.repo,
        );
      }

      throw new Error(
        `Provider ${provider.provider} is not supported for branch listing`,
      );
    });
  }
}
