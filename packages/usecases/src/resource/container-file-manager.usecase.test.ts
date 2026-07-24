import { describe, expect, test } from "bun:test";
import type { IUnitOfWork } from "@upstand/domain";
import { mockUnitOfWork } from "../testing/mock-unit-of-work";
import { ContainerFileManagerUseCase } from "./container-file-manager.usecase";

process.env.SSH_KEY_ENCRYPTION_KEY_V1 ??= Buffer.alloc(32, 7).toString(
  "base64",
);

describe("ContainerFileManagerUseCase", () => {
  const createMockContext = () => {
    const uow = mockUnitOfWork();
    const mockOrgId = "org-123";
    const mockProjectId = "proj-123";
    const mockEnvId = "env-123";
    const mockResourceId = "res-123";

    (uow.projectRepository.findById as any) = async (id: string) => {
      if (id === mockProjectId) {
        return {
          id: mockProjectId,
          organizationId: mockOrgId,
          name: "Test Proj",
        };
      }
      return null;
    };

    (uow.environmentRepository.findById as any) = async (id: string) => {
      if (id === mockEnvId) {
        return { id: mockEnvId, projectId: mockProjectId, name: "Production" };
      }
      return null;
    };

    (uow.resourceRepository.findById as any) = async (id: string) => {
      if (id === mockResourceId) {
        return {
          id: mockResourceId,
          environmentId: mockEnvId,
          name: "web-app",
          appName: "web-app",
          type: "application",
          serverId: "local",
        };
      }
      return null;
    };

    const mockDockerExec = {
      execContainerCommand: async (
        _target: any,
        _containerId: string,
        command: string,
      ) => {
        if (command.includes("for f in")) {
          return {
            output:
              "config.json|file|1024|644|2026-07-24 00:00:00\nsrc|directory|4096|755|2026-07-24 00:00:00",
          };
        }
        if (command.includes("cat --")) {
          return {
            output: '{"key":"value"}',
          };
        }
        if (command.includes("find")) {
          return {
            output: "/app/config.json\n/app/src/index.ts",
          };
        }
        return { output: "" };
      },
    };

    const mockDockerInventory = {
      listContainers: async () => [
        {
          id: "container-abc123456",
          labels: ["com.docker.swarm.service.name=web-app"],
        },
      ],
    };

    const useCase = new ContainerFileManagerUseCase(
      uow as unknown as IUnitOfWork,
      mockDockerExec as any,
      mockDockerInventory as any,
    );

    return { useCase, mockOrgId, mockResourceId };
  };

  test("listFiles returns formatted directory items", async () => {
    const { useCase, mockOrgId, mockResourceId } = createMockContext();
    const items = await useCase.listFiles({
      organizationId: mockOrgId,
      resourceId: mockResourceId,
      path: "/",
    });

    expect(items.length).toBe(2);
    expect(items[0]?.name).toBe("src");
    expect(items[0]?.type).toBe("directory");
    expect(items[1]?.name).toBe("config.json");
    expect(items[1]?.type).toBe("file");
  });

  test("readFile retrieves file contents", async () => {
    const { useCase, mockOrgId, mockResourceId } = createMockContext();
    const file = await useCase.readFile({
      organizationId: mockOrgId,
      resourceId: mockResourceId,
      path: "/config.json",
    });

    expect(file.content).toBe('{"key":"value"}');
    expect(file.path).toBe("/config.json");
  });

  test("writeFile successfully executes base64 decoded write", async () => {
    const { useCase, mockOrgId, mockResourceId } = createMockContext();
    const res = await useCase.writeFile({
      organizationId: mockOrgId,
      resourceId: mockResourceId,
      path: "/config.json",
      content: "hello world",
    });

    expect(res.success).toBe(true);
  });

  test("createItem successfully creates file or folder", async () => {
    const { useCase, mockOrgId, mockResourceId } = createMockContext();
    const folderRes = await useCase.createItem({
      organizationId: mockOrgId,
      resourceId: mockResourceId,
      parentPath: "/",
      name: "dist",
      type: "directory",
    });

    expect(folderRes.success).toBe(true);
  });

  test("deleteItem removes path", async () => {
    const { useCase, mockOrgId, mockResourceId } = createMockContext();
    const delRes = await useCase.deleteItem({
      organizationId: mockOrgId,
      resourceId: mockResourceId,
      path: "/dist",
    });

    expect(delRes.success).toBe(true);
  });

  test("searchFiles returns matching items", async () => {
    const { useCase, mockOrgId, mockResourceId } = createMockContext();
    const results = await useCase.searchFiles({
      organizationId: mockOrgId,
      resourceId: mockResourceId,
      path: "/app",
      query: "config",
    });

    expect(results.length).toBe(2);
    expect(results[0]?.name).toBe("config.json");
  });

  test("rejects access when resource belongs to another organization", async () => {
    const { useCase, mockResourceId } = createMockContext();
    expect(
      useCase.listFiles({
        organizationId: "other-org-999",
        resourceId: mockResourceId,
        path: "/",
      }),
    ).rejects.toThrow("Resource is not part of the active organization.");
  });
});
