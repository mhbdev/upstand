import fs from "node:fs";
import path from "node:path";
import { log } from "evlog";

export interface UpdateStatusResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}

let cachedStatus: { result: UpdateStatusResult; expiresAt: number } | null =
  null;

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
    if (!currentVersion) {
      currentVersion = "v0.1.0";
    }

    const repo = process.env.GITHUB_REPOSITORY || "upstand/upstand";

    const now = Date.now();
    if (cachedStatus && cachedStatus.expiresAt > now) {
      return cachedStatus.result;
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/releases/latest`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Upstand",
          },
        },
      );

      if (!response.ok) {
        log.warn({
          message: `GitHub API returned ${response.status} when checking for updates.`,
        });
        return {
          currentVersion,
          latestVersion: currentVersion,
          updateAvailable: false,
        };
      }

      const data = (await response.json()) as { tag_name: string };
      const latestVersion = data.tag_name || currentVersion;

      const cleanTag = (tag: string) => tag.replace(/^v/, "").trim();
      const updateAvailable =
        cleanTag(latestVersion) !== cleanTag(currentVersion);

      const result: UpdateStatusResult = {
        currentVersion,
        latestVersion,
        updateAvailable,
      };

      cachedStatus = {
        result,
        expiresAt: now + 30 * 60 * 1000,
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
      };
    }
  }
}
