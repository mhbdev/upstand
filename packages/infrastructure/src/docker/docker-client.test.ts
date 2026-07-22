import { describe, expect, test } from "bun:test";
import {
  createRemoteDocker,
  createRemoteDockerCliEnvironment,
  resolveDockerCliEnvironmentForServer,
  resolveDockerServiceForServer,
  resolveServicesForResource,
} from "./docker-client";

const missingServerUow = {
  serverRepository: { findById: async () => null },
} as any;

describe("remote Docker client", () => {
  test("uses a local Unix socket instead of Dockerode's SSH URL transport", () => {
    const docker = createRemoteDocker({
      host: "ssh://203.0.113.10",
      port: 22,
      username: "root",
      privateKey: "test-key",
      hostKeyFingerprint: "SHA256:YWJjZA==",
    });

    if (process.platform === "win32") {
      expect((docker as any).modem.host).toBe("127.0.0.1");
      expect((docker as any).modem.port).toBeDefined();
    } else {
      expect((docker as any).modem.host).toBeUndefined();
      expect((docker as any).modem.socketPath).toContain("upstand-docker-");
    }
  });

  test("uses the verified local tunnel for Docker CLI commands", () => {
    const cli = createRemoteDockerCliEnvironment({
      host: "203.0.113.10",
      port: 22,
      username: "root",
      privateKey: "test-key",
      hostKeyFingerprint: "SHA256:YWJjZA==",
    });

    expect(cli.environment.DOCKER_HOST).toMatch(
      process.platform === "win32" ? /^tcp:\/\/127\.0\.0\.1:/ : /^unix:\/\//,
    );
    expect(cli.environment.DOCKER_HOST).not.toContain("ssh://");
    cli.cleanup();
  });

  test("fails closed when a referenced server is missing", async () => {
    await expect(
      resolveDockerCliEnvironmentForServer("stale-server", missingServerUow),
    ).rejects.toThrow("Target deployment server was not found");
    await expect(
      resolveDockerServiceForServer(
        "stale-server",
        missingServerUow,
        {} as any,
      ),
    ).rejects.toThrow("Target deployment server was not found");
    await expect(
      resolveServicesForResource(
        { serverId: "stale-server" } as any,
        missingServerUow,
        {} as any,
        {} as any,
      ),
    ).rejects.toThrow("Resource target server was not found");
  });
});
