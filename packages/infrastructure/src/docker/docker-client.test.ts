import { describe, expect, test } from "bun:test";
import { createRemoteDocker } from "./docker-client";

describe("remote Docker client", () => {
  test("uses a local Unix socket instead of Dockerode's SSH URL transport", () => {
    const docker = createRemoteDocker({
      host: "ssh://203.0.113.10",
      port: 22,
      username: "root",
      privateKey: "test-key",
      hostKeyFingerprint: "SHA256:YWJjZA==",
    });

    expect((docker as any).modem.host).toBeUndefined();
    expect((docker as any).modem.socketPath).toContain("upstand-docker-");
  });
});
