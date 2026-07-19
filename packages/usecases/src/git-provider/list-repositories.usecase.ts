import type { IUnitOfWork } from "@upstand/domain";
import { z } from "zod";
import { getBitbucketRepositories } from "./bitbucket-client";
import { getGiteaRepositories } from "./gitea-client";
import {
  getOrRefreshGitProviderToken,
  parseGitProviderConfig,
} from "./git-provider-config";
import { getRepositories } from "./github-client";
import { getGitlabRepositories } from "./gitlab-client";

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

      const config = parseGitProviderConfig(provider);

      if (provider.provider === "github") {
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
        const accessToken = await getOrRefreshGitProviderToken(
          tx,
          provider,
          config,
        );
        return await getGitlabRepositories(
          config.gitlabUrl,
          accessToken,
          config.groupName,
        );
      }

      if (provider.provider === "bitbucket") {
        return await getBitbucketRepositories(
          config.bitbucketUsername,
          config.appPassword,
          config.bitbucketWorkspaceName,
        );
      }

      if (provider.provider === "gitea") {
        const accessToken = await getOrRefreshGitProviderToken(
          tx,
          provider,
          config,
        );
        return await getGiteaRepositories(config.giteaUrl, accessToken);
      }

      throw new Error(
        `Provider ${provider.provider} is not supported for repository listing`,
      );
    });
  }
}
