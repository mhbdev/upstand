import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { ProcessSourceWebhookUseCase } from "./process-source-webhook.usecase";

function resource(
  id: string,
  organizationId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    environmentId: `env-${id}`,
    name: id,
    type: "application",
    status: "idle",
    provider: "github",
    appName: id,
    credentials: JSON.stringify({
      autoDeploy: true,
      githubAccount: "provider-1",
      repository: "acme/example",
      branch: "main",
      triggerType: "On Push",
      watchPaths: ["apps/api/**"],
    }),
    buildConfig: "{}",
    advancedConfig: "{}",
    envVars: "{}",
    domains: "[]",
    deployments: "[]",
    containers: "[]",
    serverId: null,
    buildServerId: null,
    webhookTokenHash: null,
    webhookTokenPrefix: null,
    organizationId,
    ...overrides,
  };
}

function harness() {
  const queued: string[] = [];
  const queuedInputs: Array<{ resourceId: string; sourceRevision?: string }> =
    [];
  const service = resource("api", "org-1");
  const uow = {
    gitProviderRepository: {
      findById: async () => ({
        id: "provider-1",
        organizationId: "org-1",
        provider: "github",
        config: JSON.stringify({ webhookSecret: "secret" }),
      }),
    },
    resourceRepository: { findMany: async () => [service] },
    environmentRepository: {
      findById: async () => ({ id: "env-api", projectId: "project-1" }),
    },
    projectRepository: {
      findById: async () => ({ id: "project-1", organizationId: "org-1" }),
    },
  } as any;
  const useCase = new ProcessSourceWebhookUseCase(uow, () => ({
    execute: async (input) => {
      queuedInputs.push(input);
      const { resourceId } = input;
      queued.push(resourceId);
    },
  }));
  return { useCase, queued, queuedInputs };
}

function signed(body: string) {
  return `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
}

describe("source webhook processing", () => {
  test("queues a matching push when a watched path changed", async () => {
    const { useCase, queued, queuedInputs } = harness();
    const body = JSON.stringify({
      ref: "refs/heads/main",
      after: "0123456789abcdef0123456789abcdef01234567",
      repository: { full_name: "acme/example" },
      commits: [{ modified: ["apps/api/src/index.ts"] }],
    });
    const result = await useCase.execute({
      providerId: "provider-1",
      provider: "github",
      bodyText: body,
      headers: {
        "x-github-event": "push",
        "x-hub-signature-256": signed(body),
      },
    });
    expect(result.queued).toBe(1);
    expect(queued).toEqual(["api"]);
    expect(queuedInputs[0]?.sourceRevision).toBe(
      "0123456789abcdef0123456789abcdef01234567",
    );
  });

  test("rejects invalid signatures before matching resources", async () => {
    const { useCase } = harness();
    const body = JSON.stringify({
      ref: "refs/heads/main",
      repository: { full_name: "acme/example" },
    });
    await expect(
      useCase.execute({
        providerId: "provider-1",
        provider: "github",
        bodyText: body,
        headers: {
          "x-github-event": "push",
          "x-hub-signature-256": "sha256=invalid",
        },
      }),
    ).rejects.toThrow("Invalid webhook signature");
  });

  test("uses typed tag and watch-path fields when they are present", async () => {
    const queued: string[] = [];
    const service = resource("api", "org-1", {
      triggerType: "tag",
      watchPaths: JSON.stringify(["packages/api/**"]),
      credentials: JSON.stringify({
        autoDeploy: true,
        githubAccount: "provider-1",
        repository: "acme/example",
        branch: "v1.2.3",
        triggerType: "push",
        watchPaths: ["apps/old/**"],
      }),
    });
    const uow = {
      gitProviderRepository: {
        findById: async () => ({
          id: "provider-1",
          organizationId: "org-1",
          provider: "github",
          config: JSON.stringify({ webhookSecret: "secret" }),
        }),
      },
      resourceRepository: { findMany: async () => [service] },
      environmentRepository: {
        findById: async () => ({ id: "env-api", projectId: "project-1" }),
      },
      projectRepository: {
        findById: async () => ({ id: "project-1", organizationId: "org-1" }),
      },
    } as any;
    const useCase = new ProcessSourceWebhookUseCase(uow, () => ({
      execute: async ({ resourceId }) => queued.push(resourceId),
    }));
    const body = JSON.stringify({
      ref: "refs/tags/v1.2.3",
      repository: { full_name: "acme/example" },
      commits: [{ modified: ["packages/api/src/index.ts"] }],
    });

    const result = await useCase.execute({
      providerId: "provider-1",
      provider: "github",
      bodyText: body,
      headers: {
        "x-github-event": "push",
        "x-hub-signature-256": signed(body),
      },
    });

    expect(result.queued).toBe(1);
    expect(queued).toEqual(["api"]);
  });

  test("queues a Git-backed Compose resource through the provider webhook", async () => {
    const queued: string[] = [];
    const service = resource("stack", "org-1", { type: "compose" });
    const uow = {
      gitProviderRepository: {
        findById: async () => ({
          id: "provider-1",
          organizationId: "org-1",
          provider: "github",
          config: JSON.stringify({ webhookSecret: "secret" }),
        }),
      },
      resourceRepository: { findMany: async () => [service] },
      environmentRepository: {
        findById: async () => ({ id: "env-stack", projectId: "project-1" }),
      },
      projectRepository: {
        findById: async () => ({ id: "project-1", organizationId: "org-1" }),
      },
    } as any;
    const useCase = new ProcessSourceWebhookUseCase(uow, () => ({
      execute: async ({ resourceId }) => queued.push(resourceId),
    }));
    const body = JSON.stringify({
      ref: "refs/heads/main",
      repository: { full_name: "acme/example" },
      commits: [{ modified: ["apps/api/src/index.ts"] }],
    });

    const result = await useCase.execute({
      providerId: "provider-1",
      provider: "github",
      bodyText: body,
      headers: {
        "x-github-event": "push",
        "x-hub-signature-256": signed(body),
      },
    });

    expect(result.queued).toBe(1);
    expect(queued).toEqual(["stack"]);
  });

  test("matches Docker Hub image events by repository and tag", async () => {
    const queued: string[] = [];
    const service = resource("image", "org-1", {
      provider: "docker-registry",
      dockerImage: "acme/api:stable",
      credentials: JSON.stringify({
        autoDeploy: true,
        dockerImage: "acme/api:stable",
      }),
    });
    const uow = {
      gitProviderRepository: {
        findById: async () => ({
          id: "provider-1",
          organizationId: "org-1",
          provider: "dockerhub",
          config: JSON.stringify({ webhookSecret: "secret" }),
        }),
      },
      resourceRepository: { findMany: async () => [service] },
      environmentRepository: {
        findById: async () => ({ id: "env-image", projectId: "project-1" }),
      },
      projectRepository: {
        findById: async () => ({ id: "project-1", organizationId: "org-1" }),
      },
    } as any;
    const useCase = new ProcessSourceWebhookUseCase(uow, () => ({
      execute: async ({ resourceId }) => queued.push(resourceId),
    }));
    const body = JSON.stringify({
      repository: { repo_name: "acme/api" },
      push_data: { tag: "stable" },
    });
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;

    const result = await useCase.execute({
      providerId: "provider-1",
      provider: "dockerhub",
      bodyText: body,
      headers: { "x-hub-signature": signature },
    });

    expect(result.queued).toBe(1);
    expect(queued).toEqual(["image"]);
  });
});
