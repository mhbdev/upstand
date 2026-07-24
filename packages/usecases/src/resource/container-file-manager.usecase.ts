import type { IUnitOfWork } from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import { z } from "zod";
import type {
  DockerExecPort,
  DockerInspectionTarget,
  DockerInventoryReaderPort,
} from "../ports/docker";
import {
  containerBelongsToResource,
  shellQuote,
} from "../server/container-resolution.helper";

export function normalizeContainerPath(rawPath: string): string {
  if (!rawPath?.trim()) return "/";
  const parts = rawPath.replace(/\\/g, "/").split("/").filter(Boolean);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.length === 0 ? "/" : `/${stack.join("/")}`;
}

const DANGEROUS_SYSTEM_PATHS = new Set([
  "/",
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/lib",
  "/lib64",
  "/proc",
  "/sys",
  "/usr",
  "/var",
]);

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
  isBase64: z.boolean().optional(),
});

export const CreateContainerItemInputSchema = z.object({
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
  containerId: z.string().optional(),
  parentPath: z.string().default("/"),
  name: z.string().min(1),
  type: z.enum(["file", "directory"]),
});

export const RenameContainerItemInputSchema = z.object({
  organizationId: z.string().min(1),
  resourceId: z.string().min(1),
  containerId: z.string().optional(),
  oldPath: z.string().min(1),
  newPath: z.string().min(1),
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

    const normalizedPath = normalizeContainerPath(input.path);
    const safePath = shellQuote(normalizedPath);
    const command = `cd ${safePath} 2>/dev/null && for f in ./* ./.* ; do [ -e "$f" ] || [ -L "$f" ] || continue; [ "$f" = "./." ] || [ "$f" = "./.." ] && continue; name=\${f#./}; if [ -d "$f" ]; then type="directory"; elif [ -L "$f" ]; then type="symlink"; else type="file"; fi; stat_out=$(stat -c '%s|%a|%Y' "$f" 2>/dev/null || echo "0|644|0"); echo "$type|$stat_out|$name"; done`;

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
        const fileTypeRaw = parts[0]?.toLowerCase() || "";
        const sizeBytes = Number.parseInt(parts[1] || "0", 10);
        const permissions = parts[2] || "755";
        const timestampSec = Number.parseInt(parts[3] || "0", 10);
        const rawName = parts.slice(4).join("|").replace(/^\.\//, "") || "";

        if (!rawName) continue;

        let type: FileExplorerItem["type"] = "file";
        if (fileTypeRaw.includes("directory")) type = "directory";
        else if (
          fileTypeRaw.includes("symlink") ||
          fileTypeRaw.includes("symbolic link")
        )
          type = "symlink";

        const itemPath =
          normalizedPath === "/"
            ? `/${rawName}`
            : `${normalizedPath.replace(/\/$/, "")}/${rawName}`;

        const updatedAt =
          timestampSec > 0
            ? new Date(timestampSec * 1000).toISOString()
            : new Date().toISOString();

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

    const normalizedPath = normalizeContainerPath(input.path);
    const command = `cat -- ${shellQuote(normalizedPath)}`;

    const result = await this.docker.execContainerCommand(
      target,
      containerId,
      command,
    );

    return { content: result.output || "", path: normalizedPath };
  }

  async writeFile(
    input: z.infer<typeof WriteContainerFileInputSchema>,
  ): Promise<{ success: boolean }> {
    const { target, containerId } = await this.resolveTargetContainer(
      input.organizationId,
      input.resourceId,
      input.containerId,
    );

    const normalizedPath = normalizeContainerPath(input.path);
    const base64Content = input.isBase64
      ? input.content
      : Buffer.from(input.content, "utf8").toString("base64");

    const safePath = shellQuote(normalizedPath);
    const dirPath = shellQuote(
      normalizedPath.substring(0, normalizedPath.lastIndexOf("/")) || "/",
    );

    const command = `mkdir -p -- ${dirPath} && printf '%s' ${shellQuote(base64Content)} | base64 -d > ${safePath}`;

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

    const parent = normalizeContainerPath(input.parentPath);
    const targetPath =
      parent === "/"
        ? `/${input.name.replace(/^\//, "")}`
        : `${parent.replace(/\/$/, "")}/${input.name.replace(/^\//, "")}`;

    const safeTarget = shellQuote(targetPath);
    const dirPath = shellQuote(
      targetPath.substring(0, targetPath.lastIndexOf("/")) || "/",
    );

    const command =
      input.type === "directory"
        ? `mkdir -p -- ${safeTarget}`
        : `mkdir -p -- ${dirPath} && touch -- ${safeTarget}`;

    await this.docker.execContainerCommand(target, containerId, command);

    return { success: true };
  }

  async renameItem(
    input: z.infer<typeof RenameContainerItemInputSchema>,
  ): Promise<{ success: boolean }> {
    const { target, containerId } = await this.resolveTargetContainer(
      input.organizationId,
      input.resourceId,
      input.containerId,
    );

    const oldNormalized = normalizeContainerPath(input.oldPath);
    const newNormalized = normalizeContainerPath(input.newPath);

    if (DANGEROUS_SYSTEM_PATHS.has(oldNormalized) || oldNormalized === "/") {
      throw new Error(
        "Renaming system root or system directory is forbidden for security.",
      );
    }

    const newDir = shellQuote(
      newNormalized.substring(0, newNormalized.lastIndexOf("/")) || "/",
    );

    const command = `mkdir -p -- ${newDir} && mv -f -- ${shellQuote(oldNormalized)} ${shellQuote(newNormalized)}`;

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

    const normalizedPath = normalizeContainerPath(input.path);
    if (DANGEROUS_SYSTEM_PATHS.has(normalizedPath) || normalizedPath === "/") {
      throw new Error(
        "Deletion of system root or system directory is forbidden for security.",
      );
    }

    const command = `rm -rf -- ${shellQuote(normalizedPath)}`;

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

    const normalizedPath = normalizeContainerPath(input.path);
    const safePattern = shellQuote(`*${input.query.replace(/[*?]/g, "")}*`);
    const command = `find ${shellQuote(normalizedPath)} -name ${safePattern} -maxdepth 4 2>/dev/null | head -n 50`;

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
