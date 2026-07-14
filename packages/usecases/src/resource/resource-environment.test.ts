import { expect, test } from "bun:test";
import {
  parseResourceEnvironmentVariables,
  serializeResourceEnvironmentVariables,
} from "./resource-environment";

process.env.SSH_KEY_ENCRYPTION_KEY_V1 ??= Buffer.alloc(32, 7).toString(
  "base64",
);

test("resource environment variables encrypt on write and decrypt on read", () => {
  const serialized = serializeResourceEnvironmentVariables({
    API_KEY: "secret-value",
    PORT: "8080",
  });

  expect(serialized).not.toContain("secret-value");
  expect(parseResourceEnvironmentVariables(serialized)).toEqual({
    API_KEY: "secret-value",
    PORT: "8080",
  });
});

test("legacy plaintext resource environment variables remain readable", () => {
  expect(
    parseResourceEnvironmentVariables(
      JSON.stringify({ LEGACY_TOKEN: "still-deployable" }),
    ),
  ).toEqual({ LEGACY_TOKEN: "still-deployable" });
});
