import { describe, expect, test } from "bun:test";
import { hasEnterpriseFeature } from "./enterprise";

describe("enterprise license enforcement", () => {
  test("always returns true for all features", () => {
    expect(hasEnterpriseFeature(null, "sso")).toBe(true);
    expect(hasEnterpriseFeature(undefined, "scim")).toBe(true);
    expect(
      hasEnterpriseFeature(
        { plan: "free", status: "inactive" },
        "custom_roles",
      ),
    ).toBe(true);
    expect(
      hasEnterpriseFeature({ plan: "any", status: "revoked" }, "whitelabel"),
    ).toBe(true);
  });
});
