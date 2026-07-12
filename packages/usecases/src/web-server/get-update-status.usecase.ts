import fs from "node:fs";
import path from "node:path";
import { log } from "evlog";

export interface UpdateStatusResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  channel: "stable" | "canary" | "source";
  canUpdate: boolean;
  checkedAt: string;
}

let cachedStatus: {
  result: UpdateStatusResult;
  expiresAt: number;
  key: string;
} | null = null;

export class GetUpdateStatusUseCase {
  constructor() {}

  async execute(): Promise<UpdateStatusResult> {
    let currentVersion = process.env.UPSTAND_VERSION;
    if (!currentVersion) {
      try {
        const rootPkgPath = path.join(process.cwd(), "package.json");
        if (fs.existsSync(rootPkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
          currentVersion = `v${pkg.version || "0.1.0"}`;
        }
      } catch {}
    }
    if (!currentVersion) currentVersion = "source-local";

    const currentImage = process.env.UPSTAND_SERVER_IMAGE || "";
    const channel: UpdateStatusResult["channel"] = currentImage.includes(
      ":canary",
    )
      ? "canary"
      : currentImage.includes(":source-")
        ? "source"
        : "stable";
    const checkedAt = new Date().toISOString();
    if (channel === "source") {
      return {
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        channel,
        canUpdate: false,
        checkedAt,
      };
    }

    const repo = process.env.GITHUB_REPOSITORY || "mhbdev/upstand";

    const now = Date.now();
    const cacheKey = `${channel}:${currentVersion}:${repo}`;
    if (
      cachedStatus &&
      cachedStatus.expiresAt > now &&
      cachedStatus.key === cacheKey
    ) {
      return cachedStatus.result;
    }

    try {
      const endpoint =
        channel === "canary"
          ? `https://api.github.com/repos/${repo}/releases?per_page=30`
          : `https://api.github.com/repos/${repo}/releases/latest`;
      const response = await fetch(endpoint, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Upstand",
        },
      });

      if (!response.ok) {
        log.warn({
          message: `GitHub API returned ${response.status} when checking for updates.`,
        });
        return {
          currentVersion,
          latestVersion: currentVersion,
          updateAvailable: false,
          channel,
          canUpdate: true,
          checkedAt,
        };
      }

      const data = await response.json();
      const latestVersion =
        channel === "canary"
          ? ((data as Array<{ tag_name?: string; prerelease?: boolean }>).find(
              (release) => release.prerelease && release.tag_name,
            )?.tag_name ?? currentVersion)
          : ((data as { tag_name?: string }).tag_name ?? currentVersion);

      const cleanTag = (tag: string) => tag.replace(/^v/, "").trim();
      const updateAvailable =
        cleanTag(latestVersion) !== cleanTag(currentVersion);

      const result: UpdateStatusResult = {
        currentVersion,
        latestVersion,
        updateAvailable,
        channel,
        canUpdate: true,
        checkedAt,
      };

      cachedStatus = {
        result,
        expiresAt: now + 30 * 60 * 1000,
        key: cacheKey,
      };

      return result;
    } catch (err: any) {
      log.error({
        message: "Failed to check for updates from GitHub",
        err: err.message,
      });
      return {
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        channel,
        canUpdate: true,
        checkedAt,
      };
    }
  }
}
