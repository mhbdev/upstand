import { describe, expect, test } from "bun:test";
import {
  redactCommandOutput,
  shouldSuppressComposeRestart,
} from "./docker.service";

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

  test("suppresses restart-policy recreation only for standalone Compose kill", () => {
    expect(
      shouldSuppressComposeRestart(
        { type: "compose", composeType: "compose" },
        "kill",
      ),
    ).toBe(true);
    expect(
      shouldSuppressComposeRestart(
        { type: "compose", composeType: "stack" },
        "kill",
      ),
    ).toBe(false);
    expect(
      shouldSuppressComposeRestart(
        { type: "application", composeType: null },
        "kill",
      ),
    ).toBe(false);
  });
});
