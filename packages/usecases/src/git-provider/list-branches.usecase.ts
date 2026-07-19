import type { IUnitOfWork } from "@upstand/domain";
import { z } from "zod";
import { getBitbucketBranches } from "./bitbucket-client";
import { getGiteaBranches } from "./gitea-client";
import {
  getOrRefreshGitProviderToken,
  parseGitProviderConfig,
} from "./git-provider-config";
import { getBranches } from "./github-client";
import { getGitlabBranches } from "./gitlab-client";

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
        return await getBranches(
          String(config.githubAppId),
          config.githubPrivateKey,
          config.githubInstallationId,
          input.owner,
          input.repo,
        );
      }

      if (provider.provider === "gitlab") {
        const accessToken = await getOrRefreshGitProviderToken(
          tx,
          provider,
          config,
        );
        const projectPath = `${input.owner}/${input.repo}`;
        return await getGitlabBranches(
          config.gitlabUrl,
          accessToken,
          projectPath,
        );
      }

      if (provider.provider === "bitbucket") {
        return await getBitbucketBranches(
          config.bitbucketUsername,
          config.appPassword,
          input.owner,
          input.repo,
        );
      }

      if (provider.provider === "gitea") {
        const accessToken = await getOrRefreshGitProviderToken(
          tx,
          provider,
          config,
        );
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
