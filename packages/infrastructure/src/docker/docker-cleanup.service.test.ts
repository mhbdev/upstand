import { describe, expect, test } from "bun:test";
import { DockerCleanupService } from "./docker-cleanup.service";

describe("DockerCleanupService", () => {
  test("runs the full cleanup as separate argument-safe Docker commands", async () => {
    const calls: string[][] = [];
    const service = new DockerCleanupService(async (args) => {
      calls.push(args);
      return { stdout: "ok", stderr: "" };
    });

    const result = await service.run("all", {
      DOCKER_HOST: "ssh://remote",
    });

    expect(result.action).toBe("all");
    expect(calls).toEqual([
      ["container", "prune", "--force"],
      ["image", "prune", "--all", "--force"],
      ["volume", "prune", "--all", "--force"],
      ["builder", "prune", "--all", "--force"],
      ["system", "prune", "--all", "--force"],
    ]);
  });

  test("does not interpolate cleanup action input into a shell", async () => {
    const calls: string[][] = [];
    const service = new DockerCleanupService(async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "" };
    });

    await service.run("images");

    expect(calls).toEqual([["image", "prune", "--all", "--force"]]);
  });
});
