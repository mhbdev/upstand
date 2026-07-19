/**
 * Sanitizes and validates Git repository URLs to prevent second-order command injection
 * via option flags (e.g. --upload-pack, -oProxyCommand, --config) passed to shell commands like `git ls-remote` or `git clone`.
 */

const CONTROL_CHARACTERS_REGEX = /[\r\n\0]/;

export function sanitizeGitUrl(rawUrl: string): string {
  if (typeof rawUrl !== "string") {
    throw new Error("Git URL must be a string");
  }

  if (CONTROL_CHARACTERS_REGEX.test(rawUrl)) {
    throw new Error("Git URL contains invalid control characters");
  }

  const url = rawUrl.trim();

  if (!url) {
    throw new Error("Git URL cannot be empty");
  }

  if (url.startsWith("-")) {
    throw new Error("Git URL cannot start with a dash or flag parameter");
  }

  // Ensure SSH URLs or HTTP/HTTPS URLs follow safe structures
  if (url.includes(" ")) {
    throw new Error("Git URL cannot contain whitespace");
  }

  return url;
}

export function assertSafeGitUrl(url: string): void {
  sanitizeGitUrl(url);
}
