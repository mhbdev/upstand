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
  images: { server: string; web: string; fumadocs: string } | null;
}

const RELEASE_MANIFEST_ASSET = "upstand-release-manifest.json";
const REQUIRED_IMAGES = ["server", "web", "fumadocs"] as const;

type GitHubRelease = {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
};

type ReleaseManifest = {
  schemaVersion?: number;
  version?: string;
  images?: Array<{
    name?: string;
    image?: string;
    digest?: string;
  }>;
};

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

function unavailableStatus(
  currentVersion: string,
  channel: UpdateStatusResult["channel"],
  checkedAt: string,
): UpdateStatusResult {
  return {
    currentVersion,
    latestVersion: currentVersion,
    updateAvailable: false,
    channel,
    canUpdate: channel !== "source",
    checkedAt,
    images: null,
  };
}

function isCompleteRelease(
  release: GitHubRelease,
  manifest: ReleaseManifest,
  repo: string,
): boolean {
  const version = release.tag_name;
  if (
    !version ||
    manifest.schemaVersion !== 1 ||
    manifest.version !== version
  ) {
    return false;
  }

  const images = new Map(
    (manifest.images ?? []).map((image) => [image.name, image]),
  );
  return REQUIRED_IMAGES.every((name) => {
    const image = images.get(name);
    return (
      image?.image === `ghcr.io/${repo}-${name}:${version}` &&
      typeof image.digest === "string" &&
      /^sha256:[a-f0-9]{64}$/i.test(image.digest)
    );
  });
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

      if (!response.ok) {
        log.warn({
          message: `GitHub API returned ${response.status} when checking for updates.`,
        });
        return unavailableStatus(currentVersion, channel, checkedAt);
      }

      const data = (await response.json()) as GitHubRelease | GitHubRelease[];
      const release = Array.isArray(data)
        ? data.find((candidate) =>
            channel === "canary"
              ? candidate.prerelease === true
              : candidate.prerelease !== true,
          )
        : data;
      if (!release || release.draft || !release.tag_name) {
        return unavailableStatus(currentVersion, channel, checkedAt);
      }

      const manifestAsset = release.assets?.find(
        (asset) => asset.name === RELEASE_MANIFEST_ASSET,
      );
      if (!manifestAsset?.browser_download_url) {
        log.warn({
          message: "Latest GitHub release has no complete image manifest.",
          release: release.tag_name,
        });
        return unavailableStatus(currentVersion, channel, checkedAt);
      }

      const manifestResponse = await fetch(manifestAsset.browser_download_url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "Upstand",
        },
      });
      if (!manifestResponse.ok) {
        throw new Error(
          `Release manifest returned ${manifestResponse.status} for ${release.tag_name}`,
        );
      }
      const manifest = (await manifestResponse.json()) as ReleaseManifest;
      if (!isCompleteRelease(release, manifest, repo)) {
        log.warn({
          message:
            "Latest GitHub release does not contain all required images.",
          release: release.tag_name,
        });
        return unavailableStatus(currentVersion, channel, checkedAt);
      }

      const latestVersion = release.tag_name;
      const images = new Map(
        (manifest.images ?? []).map((image) => [image.name, image]),
      );
      const verifiedImages = Object.fromEntries(
        REQUIRED_IMAGES.map((name) => [
          name,
          (images.get(name)?.digest || "").toLowerCase(),
        ]),
      ) as UpdateStatusResult["images"];

      const updateAvailable =
        compareVersions(latestVersion, currentVersion) > 0;

      const result: UpdateStatusResult = {
        currentVersion,
        latestVersion,
        updateAvailable,
        channel,
        canUpdate: channel !== "source",
        checkedAt,
        images: verifiedImages,
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
      return unavailableStatus(currentVersion, channel, checkedAt);
    }
  }
}
