export type UpGalErrorCode =
  | "configuration"
  | "authentication"
  | "rate_limit"
  | "timeout"
  | "validation"
  | "permission"
  | "tool"
  | "provider"
  | "internal";

export type UpGalErrorInfo = {
  code: UpGalErrorCode;
  status: 400 | 401 | 403 | 408 | 429 | 500 | 502 | 503;
  retryable: boolean;
  userMessage: string;
};

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function classifyUpGalError(error: unknown): UpGalErrorInfo {
  const message = errorText(error).toLowerCase();
  if (
    message.includes("configure an ai provider") ||
    message.includes("provider config not found") ||
    message.includes("web search is not configured")
  ) {
    return {
      code: "configuration",
      status: 503,
      retryable: false,
      userMessage: message.includes("web search")
        ? "Web search is not configured on this Upstand server. Set UPGAL_WEB_SEARCH_API_KEY and retry."
        : "UpGal needs a configured AI provider. Open Settings → UpGal Settings and configure one before retrying.",
    };
  }
  if (
    message.includes("api key") ||
    message.includes("unauthorized") ||
    message.includes("401")
  ) {
    return {
      code: "authentication",
      status: 401,
      retryable: false,
      userMessage:
        "UpGal could not authenticate with the configured AI provider. Check the API key in Settings → UpGal Settings.",
    };
  }
  if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return {
      code: "rate_limit",
      status: 429,
      retryable: true,
      userMessage:
        "The AI provider is rate-limiting this request. Wait a moment and try again.",
    };
  }
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted")
  ) {
    return {
      code: "timeout",
      status: 408,
      retryable: true,
      userMessage:
        "UpGal took too long to receive a response. The completed inspection results are preserved; retry to continue.",
    };
  }
  if (message.includes("permission") || message.includes("forbidden")) {
    return {
      code: "permission",
      status: 403,
      retryable: false,
      userMessage: "You do not have permission to use this UpGal capability.",
    };
  }
  if (message.includes("invalid") || message.includes("validation")) {
    return {
      code: "validation",
      status: 400,
      retryable: false,
      userMessage:
        "UpGal could not validate that request. Check the selected resource and try again.",
    };
  }
  return {
    code: "provider",
    status: 502,
    retryable: true,
    userMessage:
      "UpGal could not complete this response. Completed tool results remain available above; retry to continue.",
  };
}

export function upGalErrorMessage(error: unknown) {
  return classifyUpGalError(error).userMessage;
}
