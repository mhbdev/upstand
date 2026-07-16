import sshpk from "sshpk";

export function normalizeHostKeyFingerprint(value: string): string {
  const normalized = value.trim();
  if (!/^SHA256:[A-Za-z0-9+/=]+$/.test(normalized)) {
    throw new Error("SSH host fingerprint must use SHA256:base64 format");
  }
  return normalized;
}

export function verifyHostKeyFingerprint(
  expected: string,
  received: string | Buffer,
): boolean {
  const normalized = normalizeHostKeyFingerprint(expected);
  if (typeof received === "string") {
    // ssh2 returns the SHA-256 fingerprint without the OpenSSH `SHA256:`
    // label when `hostHash: "sha256"` is configured.
    const value = received.startsWith("SHA256:")
      ? received
      : `SHA256:${received}`;
    return value === normalized;
  }
  try {
    return (
      sshpk.parseKey(received, "ssh").fingerprint("sha256").toString() ===
      normalized
    );
  } catch {
    return false;
  }
}

export function hostVerifierForFingerprint(expected: string) {
  const normalized = normalizeHostKeyFingerprint(expected);
  return (received: string | Buffer): boolean =>
    verifyHostKeyFingerprint(normalized, received);
}
