import { TRPCError } from "@trpc/server";
import { DomainError } from "@upstand/domain";
import { log } from "evlog";

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

  const errorMessage = error instanceof Error ? error.message : String(error);
  const isExpectedOperationalError =
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("connection refused") ||
    errorMessage.includes("Failed to contact monitoring agent") ||
    errorMessage.includes("SSH") ||
    errorMessage.includes("ssh") ||
    errorMessage.includes("Docker") ||
    errorMessage.includes("docker") ||
    errorMessage.includes("handshake") ||
    errorMessage.includes("dial tcp") ||
    errorMessage.includes("Permission denied") ||
    errorMessage.includes("host unreachable") ||
    errorMessage.includes("All configured authentication methods failed");

  if (isExpectedOperationalError) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: errorMessage,
      cause: error,
    });
  }

  // Clean Architecture: Log raw internal errors for server troubleshooting
  // but mask details to avoid leaking database/system internals to client
  log.error({
    message: "Unexpected system error in router",
    err: errorMessage,
  });

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected server error occurred.",
  });
}
