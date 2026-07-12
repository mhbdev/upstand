import { describe, expect, test } from "bun:test";
import type { IUnitOfWork } from "@upstand/domain";
import { ControlResourceUseCase } from "./control-resource.usecase";
import { CreateResourceUseCase } from "./create-resource.usecase";
import { DeleteResourceUseCase } from "./delete-resource.usecase";
import { DeployResourceUseCase } from "./deploy-resource.usecase";
import { GetResourceContainersUseCase } from "./get-resource-containers.usecase";
import { GetResourceLogsUseCase } from "./get-resource-logs.usecase";
import { UpdateResourceUseCase } from "./update-resource.usecase";

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

class MockUnitOfWork implements IUnitOfWork {
  public readonly backupScheduleRepository = {} as any;
  public readonly backupRunRepository = {} as any;
  public readonly environmentRepository =
    new MockEnvironmentRepository() as any;
  public readonly resourceRepository = new MockResourceRepository() as any;
  public readonly sshKeyRepository = {} as any;
  public readonly gitProviderRepository = {} as any;
  public readonly projectRepository = {} as any;
  public readonly userRepository = {} as any;
  public readonly webServerSettingsRepository = {
    findGlobal: async () => null,
  } as any;
  public readonly s3DestinationRepository = {} as any;
  public readonly serverBuildSettingsRepository =
    new MockServerBuildSettingsRepository() as any;
  public readonly deploymentRepository = new MockDeploymentRepository() as any;
  public readonly dockerRegistryRepository = {} as any;
  public readonly serverRepository = {} as any;
  public readonly notificationChannelRepository = {} as any;
  public readonly notificationDeliveryRepository = {} as any;

  async transaction<T>(work: (uow: IUnitOfWork) => Promise<T>): Promise<T> {
    return work(this as any);
  }
}

const mockCaddyService = {
  syncResourceConfigs: async () => ({ success: true, domains: [] }),
} as any;

const mockDockerService = {
  deployDatabase: async () => {},
  deployAppImage: async () => {},
  deployAppGit: async () => {},
  deployComposeStack: async () => {},
  controlService: async () => {},
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
    const uow = new MockUnitOfWork();
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

  test("deletes a resource and decrements environment resource count", async () => {
    const uow = new MockUnitOfWork();
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

  test("queues a resource deployment for the background worker", async () => {
    const uow = new MockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    const queuedJobs: any[] = [];
    let queueClosed = false;
    const deployUseCase = new DeployResourceUseCase(uow as IUnitOfWork, () => ({
      add: async (name, data, options) => {
        queuedJobs.push({ name, data, options });
      },
      close: async () => {
        queueClosed = true;
      },
    }));

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
    expect(deployed.deployments).toContain("dep-");
    expect(queuedJobs).toHaveLength(1);
    expect(queuedJobs[0].options.jobId).toBe(queuedJobs[0].data.deploymentId);
    expect(queuedJobs[0].options.attempts).toBe(1);
    expect(queueClosed).toBe(true);
  });

  test("marks a deployment failed when Redis enqueueing fails", async () => {
    const uow = new MockUnitOfWork();
    const createUseCase = new CreateResourceUseCase(uow as IUnitOfWork);
    let queueClosed = false;
    const deployUseCase = new DeployResourceUseCase(uow as IUnitOfWork, () => ({
      add: async () => {
        throw new Error("Redis unavailable");
      },
      close: async () => {
        queueClosed = true;
      },
    }));

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

    await expect(deployUseCase.execute({ id: resource.id })).rejects.toThrow(
      "Redis unavailable",
    );
    expect(uow.deploymentRepository.store[0].status).toBe("failed");
    expect(uow.resourceRepository.store[0].status).toBe("idle");
    expect(queueClosed).toBe(true);
  });

  test("controls a resource state via start/stop command", async () => {
    const uow = new MockUnitOfWork();
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

  test("normalizes a domain before Caddy receives the complete resource set", async () => {
    const uow = new MockUnitOfWork();
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

  test("queries containers list and updates database", async () => {
    const uow = new MockUnitOfWork();
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

    const updatedResource = await uow.resourceRepository.findById(res.id);
    expect(updatedResource?.containers).toContain("task-1");
  });

  test("retrieves resource logs from DockerService", async () => {
    const uow = new MockUnitOfWork();
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
