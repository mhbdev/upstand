import { describe, expect, test } from "bun:test";
import type { IUnitOfWork } from "@upstand/domain";
import { GetServerUseCase } from "./get-server.usecase";
import { GetServerCountUseCase } from "./get-server-count.usecase";
import { UpdateServerUseCase } from "./update-server.usecase";

function createUow() {
  const servers = new Map<string, any>([
    [
      "server-1",
      {
        id: "server-1",
        organizationId: "org-1",
        name: "Primary",
        description: null,
        serverType: "deploy",
        sshKeyId: "key-1",
        ipAddress: "203.0.113.10",
        port: 22,
        username: "root",
        enableDockerCleanup: false,
        status: "ready",
        setupError: null,
      },
    ],
  ]);
  const uow = {
    serverRepository: {
      findById: async (id: string) => servers.get(id) ?? null,
      findByOrganizationId: async (organizationId: string) =>
        [...servers.values()].filter(
          (server) => server.organizationId === organizationId,
        ),
      updateById: async (id: string, patch: Record<string, unknown>) => {
        const server = servers.get(id);
        if (!server) return null;
        Object.assign(server, patch);
        return server;
      },
    },
  } as unknown as IUnitOfWork;
  return { uow, servers };
}

describe("server use cases", () => {
  test("does not expose a server across organizations", async () => {
    const { uow } = createUow();
    await expect(
      new GetServerUseCase(uow).execute({
        organizationId: "org-2",
        id: "server-1",
      }),
    ).rejects.toThrow("Server not found");
  });

  test("counts only servers in the requested organization", async () => {
    const { uow, servers } = createUow();
    servers.set("server-2", { ...servers.get("server-1"), id: "server-2" });
    servers.set("server-3", {
      ...servers.get("server-1"),
      id: "server-3",
      organizationId: "org-2",
    });

    expect(
      await new GetServerCountUseCase(uow).execute({
        organizationId: "org-1",
      }),
    ).toBe(2);
  });

  test("resets readiness after connection metadata changes", async () => {
    const { uow, servers } = createUow();
    const updated = await new UpdateServerUseCase(uow).execute({
      organizationId: "org-1",
      id: "server-1",
      ipAddress: "203.0.113.20",
      port: 2222,
    });

    expect(updated.ipAddress).toBe("203.0.113.20");
    expect(updated.port).toBe(2222);
    expect(updated.status).toBe("idle");
    expect(updated.setupError).toBeNull();
    expect(servers.get("server-1")).toBe(updated);
  });
});
