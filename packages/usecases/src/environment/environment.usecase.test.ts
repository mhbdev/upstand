import { describe, expect, test } from "bun:test";
import { ValidationError } from "@upstand/domain";
import { mockUnitOfWork } from "../testing/mock-unit-of-work";
import { CreateEnvironmentUseCase } from "./create-environment.usecase";
import { DeleteEnvironmentUseCase } from "./delete-environment.usecase";

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
