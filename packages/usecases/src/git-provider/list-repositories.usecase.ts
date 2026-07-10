import type { IUnitOfWork } from "@upstand/domain";
import { z } from "zod";
import { getBitbucketRepositories } from "./bitbucket-client";
import { getGiteaRepositories, refreshGiteaToken } from "./gitea-client";
import { getRepositories } from "./github-client";
import { getGitlabRepositories, refreshGitlabToken } from "./gitlab-client";

export const ListGitRepositoriesInputSchema = z.object({
  gitProviderId: z.string().min(1, "Git Provider ID is required"),
});

export type ListGitRepositoriesInput = z.infer<
  typeof ListGitRepositoriesInputSchema
>;

export class ListGitRepositoriesUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(input: ListGitRepositoriesInput) {
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
        return await getRepositories(
          String(config.githubAppId),
          config.githubPrivateKey,
          config.githubInstallationId,
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

        return await getGitlabRepositories(
          config.gitlabUrl,
          accessToken,
          config.groupName,
        );
      }

      if (provider.provider === "bitbucket") {
        const config = JSON.parse(provider.config);
        return await getBitbucketRepositories(
          config.bitbucketUsername,
          config.appPassword,
          config.bitbucketWorkspaceName,
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

        return await getGiteaRepositories(config.giteaUrl, accessToken);
      }

      throw new Error(
        `Provider ${provider.provider} is not supported for repository listing`,
      );
    });
  }
}
