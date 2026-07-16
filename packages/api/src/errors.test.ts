import { TRPCError } from "@trpc/server";
import { describe, expect, test } from "bun:test";
import { handleUseCaseError } from "./errors";

describe("use-case error mapping", () => {
  test("maps external notification/network failures to a client error", () => {
    expect(() => handleUseCaseError(new Error("fetch failed"))).toThrow(
      TRPCError,
    );

    try {
      handleUseCaseError(new Error("fetch failed"));
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("BAD_REQUEST");
      expect((error as TRPCError).message).toBe("fetch failed");
    }
  });

  test("maps provider-rejected notifications to a client error", () => {
    expect(() =>
      handleUseCaseError(
        new Error("Slack rejected the notification (404 Not Found)"),
      ),
    ).toThrow(TRPCError);

    try {
      handleUseCaseError(
        new Error("Slack rejected the notification (404 Not Found)"),
      );
    } catch (error) {
      expect((error as TRPCError).code).toBe("BAD_REQUEST");
      expect((error as TRPCError).message).toContain(
        "Slack rejected the notification",
      );
    }
  });

  test("maps unavailable Git provider integrations to a client error", () => {
    for (const message of [
      "Unable to connect. Is the computer able to access the url?",
      "Was there a typo in the url or port?",
      "Failed to fetch GitHub repositories: upstream unavailable",
      "GitHub App is not fully configured (missing installation)",
    ]) {
      try {
        handleUseCaseError(new Error(message));
      } catch (error) {
        expect((error as TRPCError).code).toBe("BAD_REQUEST");
        expect((error as TRPCError).message).toBe(message);
      }
    }
  });

  test("preserves router errors raised inside a handled operation", () => {
    const conflict = new TRPCError({
      code: "CONFLICT",
      message: "Certificate is in use",
    });

    expect(() => handleUseCaseError(conflict)).toThrow(conflict);
  });
});
