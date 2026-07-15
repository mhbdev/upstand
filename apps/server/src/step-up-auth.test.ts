import { describe, expect, test } from "bun:test";
import { isStepUpVerificationValid } from "./step-up-auth";

describe("step-up authentication", () => {
  test("does not require verification when two-factor authentication is disabled", () => {
    expect(isStepUpVerificationValid(false, null)).toBe(true);
  });

  test("requires the exact verified marker when two-factor authentication is enabled", () => {
    expect(isStepUpVerificationValid(true, "true")).toBe(true);
    expect(isStepUpVerificationValid(true, "1")).toBe(false);
    expect(isStepUpVerificationValid(true, "verified")).toBe(false);
    expect(isStepUpVerificationValid(true, null)).toBe(false);
  });
});
