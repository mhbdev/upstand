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
  const value = typeof received === "string" ? received : received.toString();
  if (value.startsWith("SHA256:")) return value === normalized;
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
