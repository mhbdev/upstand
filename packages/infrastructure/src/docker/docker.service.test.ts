import { describe, expect, test } from "bun:test";
import { redactCommandOutput } from "./docker.service";

describe("deployment command log safety", () => {
  test("redacts build and registry secrets without leaking shorter values", () => {
    expect(
      redactCommandOutput("token=super-secret and token=secret", [
        "secret",
        "super-secret",
      ]),
    ).toBe("token=[REDACTED] and token=[REDACTED]");
  });

  test("does not include secret-bearing command arguments in the failure format", () => {
    expect(
      redactCommandOutput("docker login --password-stdin registry.example", [
        "registry-password",
      ]),
    ).not.toContain("registry-password");
  });
});
