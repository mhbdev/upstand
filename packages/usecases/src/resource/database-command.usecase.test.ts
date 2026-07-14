import { describe, expect, test } from "bun:test";
import type { IUnitOfWork } from "@upstand/domain";
import { DatabaseCommandUseCase } from "./database-command.usecase";

describe("database command use case", () => {
  test("runs an engine-specific health command without accepting shell input", async () => {
    let command = "";
    const useCase = new DatabaseCommandUseCase(
      {
        resourceRepository: {
          findById: async () => ({
            id: "db-1",
            type: "database",
            dbType: "redis",
            serverId: "local",
          }),
        },
      } as unknown as IUnitOfWork,
      {
        runCommandInResourceContainer: async (
          _resource: unknown,
          value: string,
        ) => {
          command = value;
          return "PONG\n";
        },
      } as any,
    );

    const result = await useCase.execute({ id: "db-1", command: "health" });
    expect(command).toBe("redis-cli ping");
    expect(result.output).toBe("PONG");
  });

  test("rejects non-database resources", async () => {
    const useCase = new DatabaseCommandUseCase(
      {
        resourceRepository: {
          findById: async () => ({ id: "app-1", type: "application" }),
        },
      } as unknown as IUnitOfWork,
      {} as any,
    );

    await expect(
      useCase.execute({ id: "app-1", command: "health" }),
    ).rejects.toThrow("only available for database resources");
  });
});
