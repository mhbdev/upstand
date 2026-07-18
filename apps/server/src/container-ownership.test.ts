import { describe, expect, test } from "bun:test";
import {
  containerBelongsToResource,
  matchesContainerIdentifier,
} from "./container-ownership";

const application = {
  type: "application" as const,
  composeType: null,
  appName: "Checkout API",
  name: "Checkout API",
};

describe("resource terminal container ownership", () => {
  test("requires the requested container to carry the resource service label", () => {
    expect(
      containerBelongsToResource(
        {
          id: "abcdef123456",
          labels: ["com.docker.swarm.service.name=checkout-api"],
        },
        application,
      ),
    ).toBe(true);
    expect(
      containerBelongsToResource(
        {
          id: "abcdef123456",
          labels: ["com.docker.swarm.service.name=other-service"],
        },
        application,
      ),
    ).toBe(false);
  });

  test("uses the correct namespace label for Compose and Swarm stacks", () => {
    expect(
      containerBelongsToResource(
        {
          id: "compose-123",
          labels: ["com.docker.compose.project=checkout-api"],
        },
        { ...application, type: "compose", composeType: "compose" },
      ),
    ).toBe(true);
    expect(
      containerBelongsToResource(
        {
          id: "stack-123",
          labels: ["com.docker.stack.namespace=checkout-api"],
        },
        { ...application, type: "compose", composeType: "stack" },
      ),
    ).toBe(true);
  });

  test("supports Docker's abbreviated ids without accepting an unrelated id", () => {
    expect(matchesContainerIdentifier("abcdef", "abcdef123456")).toBe(true);
    expect(matchesContainerIdentifier("abcdef123456", "abcdef")).toBe(true);
    expect(matchesContainerIdentifier("fedcba", "abcdef123456")).toBe(false);
  });
});
