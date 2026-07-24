import type { IUnitOfWork } from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import { z } from "zod";
import type {
  DockerContainer,
  DockerExecPort,
  DockerInspectionTarget,
  DockerInventoryReaderPort,
} from "../ports/docker";

export const ExecContainerCommandInputSchema = z.object({
  organizationId: z.string().min(1),
  serverId: z.string().min(1).optional(),
  containerId: z.string().min(1).optional(),
  resourceId: z.string().min(1),
  command: z.string().min(1),
});

function resourceName(resource: {
  appName?: string | null;
  name: string;
}): string {
  return (resource.appName || resource.name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "-");
}

function containerBelongsToResource(
  container: Pick<DockerContainer, "id" | "name" | "labels">,
  resource: {
    id: string;
    type: string;
    composeType?: string | null;
    appName?: string | null;
    name: string;
  },
): boolean {
  const labels = new Map(
    (container.labels || []).flatMap((label) => {
      const separator = label.indexOf("=");
      return separator > 0
        ? [[label.slice(0, separator), label.slice(separator + 1)] as const]
        : [];
    }),
  );
  const expectedName = resourceName(resource);

  const upstandResourceId = labels.get("upstand.resource.id");
  if (upstandResourceId && upstandResourceId === resource.id) {
    return true;
  }

  if (resource.type === "compose") {
    const namespace =
      resource.composeType === "compose"
        ? labels.get("com.docker.compose.project")
        : labels.get("com.docker.stack.namespace");
    if (namespace === expectedName) return true;
  }

  const swarmService = labels.get("com.docker.swarm.service.name");
  if (
    swarmService &&
    (swarmService === expectedName || swarmService.includes(expectedName))
  ) {
    return true;
  }

  const composeService = labels.get("com.docker.compose.service");
  if (
    composeService &&
    (composeService === expectedName || composeService.includes(expectedName))
  ) {
    return true;
  }

  const cleanContainerName = (container.name || "")
    .replace(/^\//, "")
    .toLowerCase();
  if (
    cleanContainerName === expectedName ||
    cleanContainerName.includes(expectedName) ||
    cleanContainerName.includes(resource.id) ||
    (resource.appName &&
      cleanContainerName.includes(resource.appName.toLowerCase()))
  ) {
    return true;
  }

  return false;
}

function matchesContainerIdentifier(
  requested?: string,
  actual?: string,
): boolean {
  if (!requested || !actual) return false;
  return (
    requested === actual ||
    requested.startsWith(actual) ||
    actual.startsWith(requested)
  );
}

export class ExecContainerCommandUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly docker: DockerExecPort,
    private readonly dockerInventory: DockerInventoryReaderPort,
  ) {}

  async execute(input: z.infer<typeof ExecContainerCommandInputSchema>) {
    const resource = await this.uow.resourceRepository.findById(
      input.resourceId,
    );
    if (!resource) throw new Error("Resource not found.");

    const environment = await this.uow.environmentRepository.findById(
      resource.environmentId,
    );
    const project = environment
      ? await this.uow.projectRepository.findById(environment.projectId)
      : null;
    if (!project || project.organizationId !== input.organizationId) {
      throw new Error("Resource is not part of the active organization.");
    }

    const resourceServerId = resource.serverId || "local";
    if (
      input.serverId &&
      (input.serverId === "manager" ? "local" : input.serverId) !==
        (resourceServerId === "manager" ? "local" : resourceServerId)
    ) {
      throw new Error("Resource is not assigned to the requested server.");
    }

    const target = await this.getTarget({
      organizationId: input.organizationId,
      serverId: resourceServerId,
    });
    const containers = await this.dockerInventory.listContainers(target);
    const ownedContainers = containers.filter((container) =>
      containerBelongsToResource(container, resource),
    );
    let selected = input.containerId
      ? ownedContainers.find(
          (container) =>
            matchesContainerIdentifier(
              input.containerId as string,
              container.id,
            ) ||
            matchesContainerIdentifier(
              input.containerId as string,
              container.name,
            ),
        )
      : ownedContainers[0];

    if (!selected && containers.length > 0) {
      const resName = (resource.appName || resource.name).toLowerCase();
      selected = containers.find((c) => {
        const cleanName = (c.name || "").replace(/^\//, "").toLowerCase();
        return (
          cleanName.includes(resName) ||
          (input.containerId &&
            (c.id === input.containerId ||
              c.id.startsWith(input.containerId) ||
              input.containerId.startsWith(c.id)))
        );
      });
    }

    if (!selected) {
      throw new Error("Container is not part of the requested resource.");
    }

    return this.docker.execContainerCommand(target, selected.id, input.command);
  }

  private async getTarget(input: {
    organizationId: string;
    serverId?: string;
  }): Promise<DockerInspectionTarget> {
    if (
      !input.serverId ||
      input.serverId === "local" ||
      input.serverId === "manager"
    ) {
      return { kind: "local", name: "Local Docker" };
    }
    const server = await this.uow.serverRepository.findById(input.serverId);
    if (!server || server.organizationId !== input.organizationId) {
      throw new Error("Server is not part of the active organization.");
    }
    if (!server.sshKeyId) throw new Error("Server has no SSH key configured.");
    const key = await this.uow.sshKeyRepository.findById(server.sshKeyId);
    if (!key) throw new Error("Configured server SSH key was not found.");
    return {
      kind: "remote",
      name: server.name,
      host: server.ipAddress,
      port: server.port,
      username: server.username,
      privateKey: decryptSecret({
        ciphertext: key.privateKeyCiphertext,
        iv: key.privateKeyIv,
        authTag: key.privateKeyAuthTag,
        keyVersion: key.privateKeyVersion,
      }),
    };
  }
}
