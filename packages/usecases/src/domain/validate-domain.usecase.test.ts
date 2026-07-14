import { describe, expect, test } from "bun:test";
import { ValidateDomainUseCase } from "./validate-domain.usecase";

describe("ValidateDomainUseCase", () => {
  test("rejects malformed hostnames before DNS resolution", async () => {
    await expect(
      new ValidateDomainUseCase().execute({
        organizationId: "org-1",
        host: "https://bad..example.com",
      }),
    ).rejects.toThrow("valid domain hostname");
  });
});
