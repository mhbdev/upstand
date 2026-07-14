import { describe, expect, test } from "bun:test";
import { UpdateConcurrencyUseCase } from "./update-concurrency.usecase";

describe("UpdateConcurrencyUseCase", () => {
  test("rejects a build-server setting outside the active organization", async () => {
    const useCase = new UpdateConcurrencyUseCase({
      serverRepository: {
        findById: async () => ({ organizationId: "different-org" }),
      },
    } as any);

    await expect(
      useCase.execute({
        organizationId: "active-org",
        serverId: "remote-server",
        concurrency: 2,
      }),
    ).rejects.toThrow("not part of the active organization");
  });
});
