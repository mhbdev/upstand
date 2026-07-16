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

  test("preserves router errors raised inside a handled operation", () => {
    const conflict = new TRPCError({
      code: "CONFLICT",
      message: "Certificate is in use",
    });

    expect(() => handleUseCaseError(conflict)).toThrow(conflict);
  });
});
