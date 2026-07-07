import { TRPCError } from "@trpc/server";
import { DomainError } from "@upstand/domain";

export function handleUseCaseError(error: unknown): never {
  if (error instanceof DomainError) {
    let trpcCode:
      | "CONFLICT"
      | "NOT_FOUND"
      | "BAD_REQUEST"
      | "UNAUTHORIZED"
      | "FORBIDDEN" = "BAD_REQUEST";

    switch (error.code) {
      case "CONFLICT":
        trpcCode = "CONFLICT";
        break;
      case "ENTITY_NOT_FOUND":
        trpcCode = "NOT_FOUND";
        break;
      case "VALIDATION_ERROR":
        trpcCode = "BAD_REQUEST";
        break;
      case "UNAUTHORIZED":
        trpcCode = "UNAUTHORIZED";
        break;
      case "FORBIDDEN":
        trpcCode = "FORBIDDEN";
        break;
    }

    throw new TRPCError({
      code: trpcCode,
      message: error.message,
      cause: error,
    });
  }

  // Clean Architecture: Log raw internal errors for server troubleshooting
  // but mask details to avoid leaking database/system internals to client
  console.error("[UNEXPECTED SYSTEM ERROR]:", error);

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected server error occurred.",
  });
}
