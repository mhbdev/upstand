import type { GitProvider, IUnitOfWork } from "@upstand/domain";
import { refreshGiteaToken } from "./gitea-client";
import { refreshGitlabToken } from "./gitlab-client";

export function parseGitProviderConfig(provider: GitProvider): Record<string, any> {
  try {
    return JSON.parse(provider.config);
  } catch (_err) {
    throw new Error(`Invalid or unparseable configuration for Git provider '${provider.name}'`);
  }
}

export async function getOrRefreshGitProviderToken(
  tx: IUnitOfWork,
  provider: GitProvider,
  config: Record<string, any>,
): Promise<string> {
  const currentTime = Math.floor(Date.now() / 1000);
  const safetyMargin = 60;

  let accessToken = config.accessToken;

  if (provider.provider === "gitlab") {
    if (config.expiresAt && currentTime + safetyMargin >= config.expiresAt) {
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
  } else if (provider.provider === "gitea") {
    if (config.expiresAt && currentTime + safetyMargin >= config.expiresAt) {
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
  }

  return accessToken;
}
