import type { IUnitOfWork } from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import { z } from "zod";
import type {
  DockerContainer,
  DockerExecPort,
  DockerInspectionTarget,
  DockerInventoryReaderPort,
} from "../ports/docker";

export const FileExplorerItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "directory", "symlink", "other"]),
  sizeBytes: z.number(),
  permissions: z.string(),
  updatedAt: z.string(),
});

export type FileExplorerItem = z.infer<typeof FileExplorerItemSchema>;

export const ListContainerFilesInputSchema = z.object({
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
  containerId: z.string().optional(),
  path: z.string().default("/"),
});

export const ReadContainerFileInputSchema = z.object({
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
  containerId: z.string().optional(),
  path: z.string().min(1),
});

export const WriteContainerFileInputSchema = z.object({
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
  containerId: z.string().optional(),
  path: z.string().min(1),
  content: z.string(),
});

export const CreateContainerItemInputSchema = z.object({
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
  containerId: z.string().optional(),
  parentPath: z.string().default("/"),
  name: z.string().min(1),
  type: z.enum(["file", "directory"]),
});

export const DeleteContainerItemInputSchema = z.object({
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
  containerId: z.string().optional(),
  path: z.string().min(1),
});

export const SearchContainerFilesInputSchema = z.object({
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
  containerId: z.string().optional(),
  path: z.string().default("/"),
  query: z.string().min(1),
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

function shellQuote(str: string): string {
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export class ContainerFileManagerUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly docker: DockerExecPort,
    private readonly dockerInventory: DockerInventoryReaderPort,
  ) {}

  private async resolveTargetContainer(
    organizationId: string,
    resourceId: string,
    requestedContainerId?: string,
  ): Promise<{ target: DockerInspectionTarget; containerId: string }> {
    const resource = await this.uow.resourceRepository.findById(resourceId);
    if (!resource) throw new Error("Resource not found.");

    const environment = await this.uow.environmentRepository.findById(
      resource.environmentId,
    );
    const project = environment
      ? await this.uow.projectRepository.findById(environment.projectId)
      : null;
    if (!project || project.organizationId !== organizationId) {
      throw new Error("Resource is not part of the active organization.");
    }

    const resourceServerId = resource.serverId || "local";
    const target = await this.getTarget({
      organizationId,
      serverId: resourceServerId,
    });

    const containers = await this.dockerInventory.listContainers(target);
    const ownedContainers = containers.filter((container) =>
      containerBelongsToResource(container, resource),
    );

    let selected = requestedContainerId
      ? ownedContainers.find(
          (c) =>
            c.id === requestedContainerId ||
            c.id.startsWith(requestedContainerId) ||
            requestedContainerId.startsWith(c.id) ||
            c.name === requestedContainerId ||
            c.name.startsWith(requestedContainerId) ||
            requestedContainerId.startsWith(c.name),
        )
      : ownedContainers[0];

    if (!selected && ownedContainers.length > 0) {
      selected = ownedContainers[0];
    }

    if (!selected && containers.length > 0) {
      const resName = (resource.appName || resource.name).toLowerCase();
      selected = containers.find((c) => {
        const cleanName = (c.name || "").replace(/^\//, "").toLowerCase();
        return (
          cleanName.includes(resName) ||
          (requestedContainerId &&
            (c.id === requestedContainerId ||
              c.id.startsWith(requestedContainerId) ||
              requestedContainerId.startsWith(c.id)))
        );
      });
    }

    if (!selected) {
      throw new Error("Active running container not found for this resource.");
    }

    return { target, containerId: selected.id };
  }

  async listFiles(
    input: z.infer<typeof ListContainerFilesInputSchema>,
  ): Promise<FileExplorerItem[]> {
    const { target, containerId } = await this.resolveTargetContainer(
      input.organizationId,
      input.resourceId,
      input.containerId,
    );

    const safePath = shellQuote(input.path);
    const command = `cd ${safePath} 2>/dev/null && for f in ./* ./.* ; do [ -e "$f" ] || [ -L "$f" ] || continue; [ "$f" = "./." ] || [ "$f" = "./.." ] && continue; name=\${f#./}; if [ -d "$f" ]; then type="directory"; elif [ -L "$f" ]; then type="symlink"; else type="file"; fi; stat_out=$(stat -c '%s|%a|%y' "$f" 2>/dev/null || echo "0|644|1970-01-01"); echo "$name|$type|$stat_out"; done`;

    const result = await this.docker.execContainerCommand(
      target,
      containerId,
      command,
    );

    const items: FileExplorerItem[] = [];
    const lines = (result.output || "")
      .split("\n")
      .filter((line: string) => line.trim());

    for (const line of lines) {
      const parts = line.split("|");
      if (parts.length >= 5) {
        const rawName = parts[0]?.replace(/^\.\//, "") || "";
        const fileTypeRaw = parts[1]?.toLowerCase() || "";
        const sizeBytes = Number.parseInt(parts[2] || "0", 10);
        const permissions = parts[3] || "755";
        const updatedAt = parts[4]?.split(".")[0] || new Date().toISOString();

        let type: FileExplorerItem["type"] = "file";
        if (fileTypeRaw.includes("directory")) type = "directory";
        else if (fileTypeRaw.includes("symbolic link")) type = "symlink";

        const itemPath =
          input.path === "/"
            ? `/${rawName}`
            : `${input.path.replace(/\/$/, "")}/${rawName}`;

        items.push({
          name: rawName,
          path: itemPath,
          type,
          sizeBytes,
          permissions,
          updatedAt,
        });
      }
    }

    return items.sort((a, b) => {
      if (a.type === "directory" && b.type !== "directory") return -1;
      if (a.type !== "directory" && b.type === "directory") return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async readFile(
    input: z.infer<typeof ReadContainerFileInputSchema>,
  ): Promise<{ content: string; path: string }> {
    const { target, containerId } = await this.resolveTargetContainer(
      input.organizationId,
      input.resourceId,
      input.containerId,
    );

    const command = `cat -- ${shellQuote(input.path)}`;

    const result = await this.docker.execContainerCommand(
      target,
      containerId,
      command,
    );

    return { content: result.output || "", path: input.path };
  }

  async writeFile(
    input: z.infer<typeof WriteContainerFileInputSchema>,
  ): Promise<{ success: boolean }> {
    const { target, containerId } = await this.resolveTargetContainer(
      input.organizationId,
      input.resourceId,
      input.containerId,
    );

    const base64Content = Buffer.from(input.content, "utf8").toString("base64");
    const command = `echo ${shellQuote(base64Content)} | base64 -d > ${shellQuote(input.path)}`;

    await this.docker.execContainerCommand(target, containerId, command);

    return { success: true };
  }

  async createItem(
    input: z.infer<typeof CreateContainerItemInputSchema>,
  ): Promise<{ success: boolean }> {
    const { target, containerId } = await this.resolveTargetContainer(
      input.organizationId,
      input.resourceId,
      input.containerId,
    );

    const targetPath =
      input.parentPath === "/"
        ? `/${input.name}`
        : `${input.parentPath.replace(/\/$/, "")}/${input.name}`;

    const command =
      input.type === "directory"
        ? `mkdir -p -- ${shellQuote(targetPath)}`
        : `touch -- ${shellQuote(targetPath)}`;

    await this.docker.execContainerCommand(target, containerId, command);

    return { success: true };
  }

  async deleteItem(
    input: z.infer<typeof DeleteContainerItemInputSchema>,
  ): Promise<{ success: boolean }> {
    const { target, containerId } = await this.resolveTargetContainer(
      input.organizationId,
      input.resourceId,
      input.containerId,
    );

    const command = `rm -rf -- ${shellQuote(input.path)}`;

    await this.docker.execContainerCommand(target, containerId, command);

    return { success: true };
  }

  async searchFiles(
    input: z.infer<typeof SearchContainerFilesInputSchema>,
  ): Promise<FileExplorerItem[]> {
    const { target, containerId } = await this.resolveTargetContainer(
      input.organizationId,
      input.resourceId,
      input.containerId,
    );

    const safePattern = shellQuote(`*${input.query.replace(/[*?]/g, "")}*`);
    const command = `find ${shellQuote(input.path)} -name ${safePattern} -maxdepth 4 2>/dev/null | head -n 50`;

    const result = await this.docker.execContainerCommand(
      target,
      containerId,
      command,
    );
    const lines = (result.output || "")
      .split("\n")
      .filter((l: string) => l.trim());

    return lines.map((filePath: string) => {
      const name = filePath.split("/").pop() || filePath;
      return {
        name,
        path: filePath,
        type: "file",
        sizeBytes: 0,
        permissions: "644",
        updatedAt: new Date().toISOString(),
      };
    });
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
