import { describe, expect, test } from "bun:test";
import { createRemoteDocker } from "./docker-client";

describe("remote Docker client", () => {
  test("passes a hostname, not an SSH URL, to ssh2", () => {
    const docker = createRemoteDocker({
      host: "ssh://203.0.113.10",
      port: 22,
      username: "root",
      privateKey: "test-key",
      hostKeyFingerprint: "SHA256:YWJjZA==",
    });

    expect((docker as any).modem.host).toBe("203.0.113.10");
    expect((docker as any).modem.protocol).toBe("ssh");
  });
});
