import { describe, expect, test } from "bun:test";
import { GetUpdateStatusUseCase } from "./get-update-status.usecase";

const release = (tag = "v0.1.41") => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  assets: [
    {
      name: "upstand-release-manifest.json",
      browser_download_url:
        "https://github.com/mhbdev/upstand/releases/download/manifest.json",
    },
  ],
});

const manifest = (version = "v0.1.41") => ({
  schemaVersion: 1,
  version,
  images: [
    {
      name: "server",
      image: `ghcr.io/mhbdev/upstand-server:${version}`,
      digest: `sha256:${"1".repeat(64)}`,
    },
    {
      name: "web",
      image: `ghcr.io/mhbdev/upstand-web:${version}`,
      digest: `sha256:${"2".repeat(64)}`,
    },
    {
      name: "fumadocs",
      image: `ghcr.io/mhbdev/upstand-fumadocs:${version}`,
      digest: `sha256:${"3".repeat(64)}`,
    },
    {
      name: "monitoring",
      image: `ghcr.io/mhbdev/upstand-monitoring:${version}`,
      digest: `sha256:${"4".repeat(64)}`,
    },
  ],
});

function mockGitHub(releaseData: unknown, manifestData: unknown) {
  return async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    return new Response(
      JSON.stringify(
        url.includes("manifest.json") ? manifestData : releaseData,
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}

describe("GetUpdateStatusUseCase", () => {
  test("only reports an update when the release manifest contains every image", async () => {
    const originalFetch = globalThis.fetch;
    const originalVersion = process.env.UPSTAND_VERSION;
    const originalImage = process.env.UPSTAND_SERVER_IMAGE;
    process.env.UPSTAND_VERSION = "v0.1.40";
    process.env.UPSTAND_SERVER_IMAGE = "ghcr.io/mhbdev/upstand-server:v0.1.40";
    globalThis.fetch = mockGitHub(release(), manifest()) as typeof fetch;

    try {
      await expect(
        new GetUpdateStatusUseCase().execute({ forceRefresh: true }),
      ).resolves.toMatchObject({
        latestVersion: "v0.1.41",
        updateAvailable: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
      process.env.UPSTAND_VERSION = originalVersion;
      process.env.UPSTAND_SERVER_IMAGE = originalImage;
    }
  });

  test("does not use a tag when the release is missing an image", async () => {
    const originalFetch = globalThis.fetch;
    const originalVersion = process.env.UPSTAND_VERSION;
    const originalImage = process.env.UPSTAND_SERVER_IMAGE;
    process.env.UPSTAND_VERSION = "v0.1.40";
    process.env.UPSTAND_SERVER_IMAGE = "ghcr.io/mhbdev/upstand-server:v0.1.40";
    globalThis.fetch = mockGitHub(release(), {
      ...manifest(),
      images: manifest().images?.slice(0, 2),
    }) as typeof fetch;

    try {
      await expect(
        new GetUpdateStatusUseCase().execute({ forceRefresh: true }),
      ).resolves.toMatchObject({
        latestVersion: "v0.1.40",
        updateAvailable: false,
      });
    } finally {
      globalThis.fetch = originalFetch;
      process.env.UPSTAND_VERSION = originalVersion;
      process.env.UPSTAND_SERVER_IMAGE = originalImage;
    }
  });
});
