import { describe, expect, test } from "bun:test";
import { ValidationError } from "@upstand/domain";
import { mockUnitOfWork } from "../testing/mock-unit-of-work";
import { CreateEnvironmentUseCase } from "./create-environment.usecase";
import { DeleteEnvironmentUseCase } from "./delete-environment.usecase";
import { UpdateEnvironmentUseCase } from "./update-environment.usecase";

process.env.SSH_KEY_ENCRYPTION_KEY_V1 ??= Buffer.alloc(32, 7).toString(
  "base64",
);

class MockEnvironmentRepository {
  public store: any[] = [];

  async findById(id: string) {
    return this.store.find((e) => e.id === id) || null;
  }

  async findByProjectId(projectId: string) {
    return this.store.filter((e) => e.projectId === projectId);
  }

  async create(data: any) {
    const item = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.push(item);
    return item;
  }

  async updateEnvironment(id: string, patch: any) {
    const index = this.store.findIndex((e) => e.id === id);
    if (index === -1) return null;
    this.store[index] = {
      ...this.store[index],
      ...patch,
      updatedAt: new Date(),
    };
    return this.store[index];
  }

  async deleteById(id: string) {
    const index = this.store.findIndex((e) => e.id === id);
    if (index > -1) {
      this.store.splice(index, 1);
      return true;
    }
    return false;
  }
}

describe("Environment Usecases", () => {
  test("creates a new environment with a slugified name", async () => {
    const uow = mockUnitOfWork({
      environmentRepository: new MockEnvironmentRepository(),
    });
    const createUseCase = new CreateEnvironmentUseCase(uow);

    const env = await createUseCase.execute({
      projectId: "project-1",
      name: "Staging Env",
      description: "Temp test environment",
    });

    expect(env.name).toBe("Staging Env");
    expect(env.slug).toBe("staging-env");
    expect(env.isDefault).toBe(false);
    expect(env.isProtected).toBe(false);
  });

  test("updates an existing environment including project env vars", async () => {
    const uow = mockUnitOfWork({
      environmentRepository: new MockEnvironmentRepository(),
    });
    const createUseCase = new CreateEnvironmentUseCase(uow);
    const updateUseCase = new UpdateEnvironmentUseCase(uow);

    const env = await createUseCase.execute({
      projectId: "project-1",
      name: "Development",
      description: "Old description",
    });

    const updated = await updateUseCase.execute({
      id: env.id,
      name: "Dev Env",
      description: "New description",
      envVars: {
        DATABASE_URL: "postgres://db:5432/dev",
        PORT: "8080",
      },
    });

    expect(updated.name).toBe("Dev Env");
    expect(updated.description).toBe("New description");
    expect(updated.envVars).toBeDefined();

    // Check if env vars are serialised/encrypted JSON
    expect(updated.envVars).toBeDefined();
    const parsed = JSON.parse(updated.envVars ?? "{}");
    // Since it's encrypted via serializeResourceEnvironmentVariables, it will be in the encrypted payload format
    expect(parsed.ciphertext).toBeDefined();
    expect(parsed.iv).toBeDefined();
    expect(parsed.authTag).toBeDefined();
  });

  test("prevents deletion of default production environment", async () => {
    const uow = mockUnitOfWork({
      environmentRepository: new MockEnvironmentRepository(),
    });
    const createUseCase = new CreateEnvironmentUseCase(uow);
    const deleteUseCase = new DeleteEnvironmentUseCase(uow);

    const env = await createUseCase.execute({
      projectId: "project-1",
      name: "production",
    });

    // Manually mark it default
    uow.environmentRepository.store[0].isDefault = true;

    expect(deleteUseCase.execute({ id: env.id })).rejects.toThrow(
      ValidationError,
    );
  });

  test("prevents deletion when environment contains resources", async () => {
    const uow = mockUnitOfWork({
      environmentRepository: new MockEnvironmentRepository(),
    });
    const createUseCase = new CreateEnvironmentUseCase(uow);
    const deleteUseCase = new DeleteEnvironmentUseCase(uow);

    const env = await createUseCase.execute({
      projectId: "project-1",
      name: "Development",
    });

    // Manually update resourceCount
    uow.environmentRepository.store[0].resourceCount = 1;

    expect(deleteUseCase.execute({ id: env.id })).rejects.toThrow(
      ValidationError,
    );
  });

  test("deletes empty, non-default environment successfully", async () => {
    const uow = mockUnitOfWork({
      environmentRepository: new MockEnvironmentRepository(),
    });
    const createUseCase = new CreateEnvironmentUseCase(uow);
    const deleteUseCase = new DeleteEnvironmentUseCase(uow);

    const env = await createUseCase.execute({
      projectId: "project-1",
      name: "Staging",
    });

    const success = await deleteUseCase.execute({ id: env.id });
    expect(success).toBe(true);
    expect(uow.environmentRepository.store).toHaveLength(0);
  });
});
