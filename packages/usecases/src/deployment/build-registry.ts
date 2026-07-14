export interface BuildRegistryReference {
  registryUrl?: string | null;
  imagePrefix?: string | null;
  username?: string | null;
}

/** Build the immutable transfer image reference used between build and target servers. */
export function buildRegistryImageTag(
  registry: BuildRegistryReference,
  serviceName: string,
): string {
  const host = (registry.registryUrl || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const prefix = (registry.imagePrefix || registry.username || "")
    .replace(/^\/+|\/+$/g, "")
    .trim();
  const normalizedServiceName = serviceName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-");
  const repository = [host, prefix, normalizedServiceName]
    .filter(Boolean)
    .join("/");
  return `${repository || "upstand"}:latest`;
}
