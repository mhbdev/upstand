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

const VERSION_PATTERN = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i;

function compareVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const match = value.trim().match(VERSION_PATTERN);
    return match ? match.slice(1, 4).map(Number) : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    const leftPart = a[index] ?? 0;
    const rightPart = b[index] ?? 0;
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

export class GetUpdateStatusUseCase {
  async execute(options?: {
    forceRefresh?: boolean;
  }): Promise<UpdateStatusResult> {
    let currentVersion = process.env.UPSTAND_VERSION;
    if (!currentVersion) {
      try {
        const rootPkgPath = path.join(process.cwd(), "package.json");
        if (fs.existsSync(rootPkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
          currentVersion = pkg.version ? `v${pkg.version}` : undefined;
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
    const repo = process.env.GITHUB_REPOSITORY || "mhbdev/upstand";

    const now = Date.now();
    const cacheKey = `${channel}:${currentVersion}:${repo}`;
    if (
      cachedStatus &&
      cachedStatus.expiresAt > now &&
      cachedStatus.key === cacheKey &&
      !options?.forceRefresh
    ) {
      return cachedStatus.result;
    }

    try {
      const endpoint =
        channel === "canary"
          ? `https://api.github.com/repos/${repo}/releases?per_page=30`
          : `https://api.github.com/repos/${repo}/releases/latest`;
      const response = await fetch(endpoint, {
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Upstand",
        },
      });

      if (!response.ok && response.status !== 404) {
        log.warn({
          message: `GitHub API returned ${response.status} when checking for updates.`,
        });
        return {
          currentVersion,
          latestVersion: currentVersion,
          updateAvailable: false,
          channel,
          canUpdate: channel !== "source",
          checkedAt,
        };
      }

      let data: unknown = await response.json();
      // A repository may publish tags before creating a GitHub Release. Fall
      // back to the tags endpoint so self-hosted installs do not report a
      // misleading API error during that short release window.
      if (response.status === 404) {
        const tagsResponse = await fetch(
          `https://api.github.com/repos/${repo}/tags?per_page=30`,
          {
            cache: "no-store",
            headers: {
              Accept: "application/vnd.github+json",
              "User-Agent": "Upstand",
            },
          },
        );
        if (!tagsResponse.ok) {
          throw new Error(`GitHub API returned ${tagsResponse.status}`);
        }
        data = await tagsResponse.json();
      }
      const latestVersion =
        channel === "canary" && Array.isArray(data)
          ? ((data as Array<{ name?: string }>).find((tag) =>
              tag.name?.includes("canary"),
            )?.name ?? currentVersion)
          : Array.isArray(data)
            ? ((data as Array<{ name?: string }>)[0]?.name ?? currentVersion)
            : ((data as { tag_name?: string }).tag_name ?? currentVersion);

      const updateAvailable =
        compareVersions(latestVersion, currentVersion) > 0;

      const result: UpdateStatusResult = {
        currentVersion,
        latestVersion,
        updateAvailable,
        channel,
        canUpdate: channel !== "source",
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
        canUpdate: channel !== "source",
        checkedAt,
      };
    }
  }
}
