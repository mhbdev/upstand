import { describe, expect, test } from "bun:test";
import type { IUnitOfWork } from "@upstand/domain";
import { encryptSecret } from "@upstand/platform/crypto/secret-box";
import { mockUnitOfWork } from "../testing/mock-unit-of-work";
import { ControlContainerUseCase } from "./control-container.usecase";
import { ControlResourceUseCase } from "./control-resource.usecase";
import { CreateResourceUseCase } from "./create-resource.usecase";
import { DeleteResourceUseCase } from "./delete-resource.usecase";
import { DeployResourceUseCase } from "./deploy-resource.usecase";
import { GetResourceContainersUseCase } from "./get-resource-containers.usecase";
import { GetResourceLogsUseCase } from "./get-resource-logs.usecase";
import { RebuildDatabaseUseCase } from "./rebuild-database.usecase";
import { RollbackResourceUseCase } from "./rollback-resource.usecase";
import { UpdateResourceUseCase } from "./update-resource.usecase";

process.env.SSH_KEY_ENCRYPTION_KEY_V1 ??= Buffer.alloc(32, 7).toString(
  "base64",
);

class MockEnvironmentRepository {
  public store: any[] = [];

  async findById(id: string) {
    return this.store.find((e) => e.id === id) || null;
  }

  async updateById(id: string, patch: any) {
    const item = this.store.find((e) => e.id === id);
    if (item) {
      Object.assign(item, patch);
      return item;
    }
    return null;
  }
}

class MockResourceRepository {
  public store: any[] = [];

  async create(data: any) {
    const item = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.push(item);
    return { ...item };
  }

  async findById(id: string) {
    const item = this.store.find((r) => r.id === id);
    return item ? { ...item } : null;
  }

  async findMany() {
    return this.store.map((r) => ({ ...r }));
  }

  async deleteById(id: string) {
    const index = this.store.findIndex((r) => r.id === id);
    if (index > -1) {
      this.store.splice(index, 1);
      return true;
    }
    return false;
  }

  async updateById(id: string, patch: any) {
    const item = this.store.find((r) => r.id === id);
    if (item) {
      Object.assign(item, patch);
      return { ...item };
    }
    return null;
  }
}

class MockDeploymentRepository {
  public store: any[] = [];
  async create(data: any) {
    const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
    this.store.push(item);
    return item;
  }
  async findById(id: string) {
    return this.store.find((d: any) => d.id === id) || null;
  }
  async updateById(id: string, patch: any) {
    const item = this.store.find((d: any) => d.id === id);
    if (item) {
      Object.assign(item, patch);
      return item;
    }
    return null;
  }
}

class MockServerBuildSettingsRepository {
  public store: any[] = [];
  async findById(id: string) {
    return this.store.find((s: any) => s.id === id) || null;
  }
  async create(data: any) {
    const item = { ...data, createdAt: new Date(), updatedAt: new Date() };
    this.store.push(item);
    return item;
  }
}

class MockOutboxRepository {
  public store: any[] = [];

  async create(data: any) {
    const item = {
      id: data.id ?? `outbox-${this.store.length + 1}`,
      status: "pending",
      attempts: 0,
      maxAttempts: 10,
      availableAt: new Date(),
      claimedAt: null,
      publishedAt: null,
      deadLetteredAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    this.store.push(item);
    return item;
  }

  async createMany(data: any[]) {
    return Promise.all(data.map((item) => this.create(item)));
  }
}

const createMockUnitOfWork = () =>
  mockUnitOfWork({
    environmentRepository: new MockEnvironmentRepository(),
    resourceRepository: new MockResourceRepository(),
    webServerSettingsRepository: { findGlobal: async () => null } as any,
    serverBuildSettingsRepository: new MockServerBuildSettingsRepository(),
    deploymentRepository: new MockDeploymentRepository(),
    outboxRepository: new MockOutboxRepository(),
    resourceRuntimeRepository: {
      upsert: async (resourceId: string, values: any) => ({
        resourceId,
        ...values,
      }),
    },
  }) as any;

const mockCaddyService = {
  syncResourceConfigs: async () => ({ success: true, domains: [] }),
} as any;

const mockDockerService = {
  deployDatabase: async () => {},
  deployAppImage: async () => {},
  deployAppGit: async () => {},
  deployComposeStack: async () => {},
  controlService: async () => {},
  rollbackService: async () => {},
  removeDatabase: async () => {},
  controlContainer: async () => {},
  getContainers: async () => [
    {
      id: "task-1",
      name: "app.1",
      status: "running",
      ports: "80:80",
      node: "node-1",
    },
  ],
  getLogs: async () => "Mock Docker Logs",
  removeResource: async () => {},
} as any;

describe("Resource Usecases", () => {
  test("creates a new resource and increments environment resource count", async () => {
    const uow = createMockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);

    // Seed mock environment
    uow.environmentRepository.store.push({
      id: "env-1",
      name: "production",
      resourceCount: 0,
    });
    const res = await createUseCase.execute({
      environmentId: "env-1",
      name: "redis-db",
      type: "database",
      appName: "redis-db",
      dbType: "redis",
      dockerImage: "redis:7-alpine",
    });
    expect(res.name).toBe("redis-db");
    expect(res.type).toBe("database");
    expect(res.status).toBe("idle");
    expect(uow.environmentRepository.store[0].resourceCount).toBe(1);
  });

  test("accepts an explicitly opted-in safe custom database image", async () => {
    const uow = createMockUnitOfWork();
    uow.environmentRepository.store.push({
      id: "env-custom-image",
      name: "production",
      resourceCount: 0,
    });
    const useCase = new CreateResourceUseCase(uow as IUnitOfWork);

    const resource = await useCase.execute({
      environmentId: "env-custom-image",
      name: "custom-postgres",
      type: "database",
      appName: "custom-postgres",
      dbType: "postgres",
      dockerImage: "ghcr.io/acme/postgres:17",
      allowCustomImage: true,
    });

    expect(resource.dockerImage).toBe("ghcr.io/acme/postgres:17");
    await expect(
      useCase.execute({
        environmentId: "env-custom-image",
        name: "unsafe-postgres",
        type: "database",
        appName: "unsafe-postgres",
        dbType: "postgres",
        dockerImage: "ghcr.io/acme/postgres:17;rm-rf",
        allowCustomImage: true,
      }),
    ).rejects.toThrow("supported database image");
  });

  test("deletes a resource and decrements environment resource count", async () => {
    const uow = createMockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const deleteUseCase = new DeleteResourceUseCase(
      uow as IUnitOfWork,
      mockCaddyService,
      mockDockerService,
    );

    // Seed mock environment
    uow.environmentRepository.store.push({
      id: "env-1",
      name: "production",
      resourceCount: 0,
    });

    const res = await createUseCase.execute({
      environmentId: "env-1",
      name: "web-app",
      type: "application",
      appName: "web-app",
    });

    expect(uow.environmentRepository.store[0].resourceCount).toBe(1);

    const success = await deleteUseCase.execute({ id: res.id });
    expect(success).toBe(true);
    expect(uow.resourceRepository.store).toHaveLength(0);
    expect(uow.environmentRepository.store[0].resourceCount).toBe(0);
  });

  test("rebuilds a database only through the confirmed destructive path", async () => {
    const uow = createMockUnitOfWork();
    const resource = await uow.resourceRepository.create({
      id: "db-1",
      environmentId: "env-1",
      name: "postgres",
      appName: "postgres",
      type: "database",
      dbType: "postgres",
      provider: "docker",
      status: "running",
      credentials: JSON.stringify({
        dbUser: "app",
        dbPassword: "secret",
        dbName: "appdb",
      }),
      envVars: "{}",
      serverId: null,
    });
    const calls: string[] = [];
    const docker = {
      ...mockDockerService,
      removeDatabase: async () => calls.push("remove"),
      deployDatabase: async (_resource: any, env: Record<string, string>) => {
        calls.push(`deploy:${env.POSTGRES_USER}:${env.POSTGRES_DB}`);
      },
      getContainers: async () => [{ id: "new-task", status: "running" }],
    } as any;

    const useCase = new RebuildDatabaseUseCase(uow as IUnitOfWork, docker);
    const updated = await useCase.execute({ id: resource.id, confirm: true });

    expect(calls).toEqual(["remove", "deploy:app:appdb"]);
    expect(updated.status).toBe("running");
    expect(uow.deploymentRepository.store[0]).toMatchObject({
      title: "Database rebuild",
      status: "success",
    });
  });

  test("commits a resource deployment and its outbox message together", async () => {
    const uow = createMockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const deployUseCase = new DeployResourceUseCase(uow as IUnitOfWork);

    uow.environmentRepository.store.push({
      id: "env-1",
      name: "production",
      resourceCount: 0,
    });

    const res = await createUseCase.execute({
      environmentId: "env-1",
      name: "my-service",
      type: "application",
      appName: "my-service",
    });

    const deployed = await deployUseCase.execute({ id: res.id });
    expect(deployed.status).toBe("queued");
    const outboxMessage = uow.outboxRepository.store[0];
    expect(uow.deploymentRepository.store[0]).toMatchObject({
      id: outboxMessage.payload.deploymentId,
      status: "queued",
    });
    expect(outboxMessage).toMatchObject({
      id: uow.deploymentRepository.store[0].id,
      type: "deployment.deploy",
      status: "pending",
      idempotencyKey: `deployment:${uow.deploymentRepository.store[0].id}`,
    });
    expect(outboxMessage.payload).toMatchObject({
      resourceId: res.id,
      deploymentId: uow.deploymentRepository.store[0].id,
      serverId: "local",
    });
  });

  test("does not publish a deployment before its transaction commits", async () => {
    const uow = createMockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const deployUseCase = new DeployResourceUseCase(uow as IUnitOfWork);

    uow.environmentRepository.store.push({
      id: "env-1",
      name: "production",
      resourceCount: 0,
    });
    const resource = await createUseCase.execute({
      environmentId: "env-1",
      name: "enqueue-failure",
      type: "application",
      appName: "enqueue-failure",
    });

    await deployUseCase.execute({ id: resource.id });
    expect(uow.deploymentRepository.store[0].status).toBe("queued");
    expect(uow.outboxRepository.store).toHaveLength(1);
  });

  test("controls a resource state via start/stop command", async () => {
    const uow = createMockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const controlUseCase = new ControlResourceUseCase(
      uow as IUnitOfWork,
      mockDockerService,
    );

    uow.environmentRepository.store.push({
      id: "env-1",
      name: "production",
      resourceCount: 0,
    });

    const res = await createUseCase.execute({
      environmentId: "env-1",
      name: "my-db",
      type: "database",
      appName: "my-db",
      dbType: "postgres",
      dockerImage: "postgres:16-alpine",
    });

    const stopped = await controlUseCase.execute({
      id: res.id,
      command: "stop",
    });
    expect(stopped.status).toBe("stopped");

    const started = await controlUseCase.execute({
      id: res.id,
      command: "start",
    });
    expect(started.status).toBe("running");
  });

  test("rolls back a Swarm resource and records the rollback history", async () => {
    const uow = createMockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const rollbackUseCase = new RollbackResourceUseCase(
      uow as IUnitOfWork,
      mockDockerService,
    );
    uow.environmentRepository.store.push({
      id: "env-1",
      name: "production",
      resourceCount: 0,
    });

    const resource = await createUseCase.execute({
      environmentId: "env-1",
      name: "rollback-service",
      type: "application",
      appName: "rollback-service",
    });

    const updated = await rollbackUseCase.execute({ id: resource.id });

    expect(updated.status).toBe("running");
    expect(uow.deploymentRepository.store[0]).toMatchObject({
      title: "Swarm service rollback",
      status: "success",
    });
  });

  test("passes the organization-owned rollback registry credentials to Swarm", async () => {
    process.env.SSH_KEY_ENCRYPTION_KEY_V1 ??= Buffer.alloc(32, 7).toString(
      "base64",
    );
    const uow = createMockUnitOfWork();
    uow.environmentRepository.store.push({
      id: "env-rollback",
      projectId: "project-rollback",
      name: "production",
      resourceCount: 0,
    });
    uow.projectRepository.findById = async (id: string) =>
      id === "project-rollback" ? { id, organizationId: "org-rollback" } : null;
    uow.dockerRegistryRepository.findById = async (id: string) =>
      id === "registry-rollback"
        ? {
            id,
            organizationId: "org-rollback",
            name: "private",
            username: "deploy",
            password: JSON.stringify(encryptSecret("registry-secret")),
            registryUrl: "https://registry.example.com",
          }
        : null;

    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const resource = await createUseCase.execute({
      environmentId: "env-rollback",
      name: "private-app",
      type: "application",
      appName: "private-app",
      rollbackActive: true,
      rollbackRegistryId: "registry-rollback",
    });
    let receivedAuth: unknown;
    const rollbackUseCase = new RollbackResourceUseCase(
      uow as IUnitOfWork,
      {
        ...mockDockerService,
        rollbackService: async (_resource: unknown, auth: unknown) => {
          receivedAuth = auth;
        },
      } as any,
    );

    await rollbackUseCase.execute({ id: resource.id });

    expect(receivedAuth).toEqual({
      username: "deploy",
      password: "registry-secret",
      serveraddress: "registry.example.com",
    });
  });

  test("validates a per-resource build registry against the project organization", async () => {
    const uow = createMockUnitOfWork();
    uow.environmentRepository.store.push({
      id: "env-build-registry",
      projectId: "project-build-registry",
      name: "production",
      resourceCount: 0,
    });
    uow.projectRepository.findById = async (id: string) =>
      id === "project-build-registry"
        ? { id, organizationId: "org-build-registry" }
        : null;
    uow.dockerRegistryRepository.findById = async (id: string) =>
      id === "registry-build"
        ? {
            id,
            organizationId: "org-build-registry",
            name: "build-images",
          }
        : id === "registry-other-org"
          ? {
              id,
              organizationId: "org-other",
              name: "other-org",
            }
          : null;

    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const resource = await createUseCase.execute({
      environmentId: "env-build-registry",
      name: "build-registry-app",
      type: "application",
      appName: "build-registry-app",
      buildRegistryId: "registry-build",
    });
    expect(resource.buildRegistryId).toBe("registry-build");

    await expect(
      createUseCase.execute({
        environmentId: "env-build-registry",
        name: "cross-org-build-registry-app",
        type: "application",
        appName: "cross-org-build-registry-app",
        buildRegistryId: "registry-other-org",
      }),
    ).rejects.toThrow("Selected build registry is not available");
  });

  test("controls only the selected container, including kill", async () => {
    const uow = createMockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const controlContainerUseCase = new ControlContainerUseCase(
      uow as IUnitOfWork,
      mockDockerService,
    );

    uow.environmentRepository.store.push({
      id: "env-1",
      name: "production",
      resourceCount: 0,
    });
    const resource = await createUseCase.execute({
      environmentId: "env-1",
      name: "selected-container",
      type: "application",
      appName: "selected-container",
    });

    const result = await controlContainerUseCase.execute({
      resourceId: resource.id,
      containerId: "task-1",
      command: "kill",
    });

    expect(result.id).toBe(resource.id);
  });

  test("normalizes a domain before Caddy receives the complete resource set", async () => {
    const uow = createMockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const caddyCalls: any[] = [];
    const updateUseCase = new UpdateResourceUseCase(
      uow as IUnitOfWork,
      {
        syncResourceConfigs: async (resources: any[]) => {
          caddyCalls.push(resources);
          return { success: true, domains: ["app.example.com"] };
        },
      } as any,
    );

    uow.environmentRepository.store.push({
      id: "env-1",
      name: "production",
      resourceCount: 0,
    });
    const resource = await createUseCase.execute({
      environmentId: "env-1",
      name: "web-app",
      type: "application",
      appName: "web-app",
    });

    const updated = await updateUseCase.execute({
      id: resource.id,
      domains: JSON.stringify([{ host: "APP.Example.com.", port: 3000 }]),
    });

    expect(JSON.parse(updated?.domains || "[]")).toMatchObject([
      { host: "app.example.com", path: "/", port: 3000, https: true },
    ]);
    expect(caddyCalls).toHaveLength(1);
    expect(caddyCalls[0][0].id).toBe(resource.id);
  });

  test("queries the live containers list", async () => {
    const uow = createMockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const getContainersUseCase = new GetResourceContainersUseCase(
      uow as IUnitOfWork,
      mockDockerService,
    );

    uow.environmentRepository.store.push({
      id: "env-1",
      name: "production",
      resourceCount: 0,
    });

    const res = await createUseCase.execute({
      environmentId: "env-1",
      name: "web-app",
      type: "application",
      appName: "web-app",
    });

    const containers = await getContainersUseCase.execute({ id: res.id });
    expect(containers).toHaveLength(1);
    expect(containers[0].id).toBe("task-1");
  });

  test("retrieves resource logs from DockerService", async () => {
    const uow = createMockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const getLogsUseCase = new GetResourceLogsUseCase(
      uow as IUnitOfWork,
      mockDockerService,
    );

    uow.environmentRepository.store.push({
      id: "env-1",
      name: "production",
      resourceCount: 0,
    });

    const res = await createUseCase.execute({
      environmentId: "env-1",
      name: "web-app",
      type: "application",
      appName: "web-app",
    });

    const logs = await getLogsUseCase.execute({ id: res.id });
    expect(logs).toBe("Mock Docker Logs");
  });
});
