import type { Resource } from "@upstand/domain";
import type { DockerContainer } from "@upstand/usecases/ports/docker";

const CONTAINER_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

function resourceName(resource: Pick<Resource, "appName" | "name">): string {
  return (resource.appName || resource.name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, "-");
}

function containerLabels(labels: string[]): Map<string, string> {
  return new Map(
    labels.flatMap((label) => {
      const separator = label.indexOf("=");
      return separator > 0
        ? [[label.slice(0, separator), label.slice(separator + 1)] as const]
        : [];
    }),
  );
}

export function isValidContainerIdentifier(value: string): boolean {
  return CONTAINER_ID_PATTERN.test(value);
}

export function matchesContainerIdentifier(
  requestedId: string,
  actualId: string,
): boolean {
  return (
    requestedId === actualId ||
    requestedId.startsWith(actualId) ||
    actualId.startsWith(requestedId)
  );
}

/**
 * Docker inventory is the authorization boundary for resource terminals. A
 * container must be both present on the selected target and labeled as part
 * of the requested resource; a caller-provided container id alone is not
 * sufficient to authorize `docker exec`.
 */
export function containerBelongsToResource(
  container: Pick<DockerContainer, "id" | "labels">,
  resource: Pick<Resource, "type" | "composeType" | "appName" | "name">,
): boolean {
  if (!isValidContainerIdentifier(container.id)) return false;

  const labels = containerLabels(container.labels);
  const expectedName = resourceName(resource);
  if (resource.type === "compose") {
    const namespace =
      resource.composeType === "compose"
        ? labels.get("com.docker.compose.project")
        : labels.get("com.docker.stack.namespace");
    return namespace === expectedName;
  }

  return labels.get("com.docker.swarm.service.name") === expectedName;
}
