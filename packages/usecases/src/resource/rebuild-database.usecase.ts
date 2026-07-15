import { randomUUID } from "node:crypto";
import type { IUnitOfWork, Resource } from "@upstand/domain";
import { z } from "zod";
import { getDatabaseEnvironment } from "./database-environment";
import type { DockerService } from "./docker-client";
import { resolveDockerServiceForServer } from "./docker-client";

export const RebuildDatabaseInputSchema = z.object({
  id: z.string().min(1, "Resource ID is required"),
  confirm: z.literal(true, {
    message: "Database rebuild requires confirmation",
  }),
});

export type RebuildDatabaseInput = z.infer<typeof RebuildDatabaseInputSchema>;

/** Recreate a database service and managed volume after an explicit confirmation. */
export class RebuildDatabaseUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly defaultDockerService: DockerService,
  ) {}

  async execute(input: RebuildDatabaseInput): Promise<Resource> {
    const resource = await this.uow.resourceRepository.findById(input.id);
    if (!resource) throw new Error("Resource not found");
    if (resource.type !== "database") {
      throw new Error("Only database resources can be rebuilt");
    }

    const deploymentId = `dep-${randomUUID()}`;
    const startedAt = new Date();
    await this.uow.deploymentRepository.create({
      id: deploymentId,
      resourceId: resource.id,
      status: "running",
      title: "Database rebuild",
      logs: "Database rebuild requested. Existing managed data will be removed.\n",
      serverId: resource.serverId,
    });

    try {
      return await this.uow.transaction(async (tx) => {
        const { dockerService, cleanup } = await resolveDockerServiceForServer(
          resource.serverId,
          tx,
          this.defaultDockerService,
        );
        try {
          await dockerService.removeDatabase(resource);
          await dockerService.deployDatabase(
            resource,
            getDatabaseEnvironment(resource),
          );
          const containers = await dockerService.getContainers(resource);
          const logs = `Database rebuild completed at ${new Date().toISOString()}.\n`;

          await tx.deploymentRepository.updateById(deploymentId, {
            status: "success",
            logs: `Database rebuild started at ${startedAt.toISOString()}.\n${logs}`,
          });

          const history = parseDeploymentHistory(resource.deployments);
          history.unshift({
            id: deploymentId,
            status: "success",
            title: "Database rebuild",
            logs: `Database rebuild started at ${startedAt.toISOString()}.\n${logs}`,
            createdAt: startedAt.toISOString(),
          });
          const updated = await tx.resourceRepository.updateById(resource.id, {
            status: "running",
            containers: JSON.stringify(containers),
            deployments: JSON.stringify(history.slice(0, 10)),
          });
          if (!updated) throw new Error("Resource could not be updated");
          return updated;
        } finally {
          cleanup();
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.uow.deploymentRepository.updateById(deploymentId, {
        status: "failed",
        logs: `Database rebuild failed: ${message}\n`,
      });
      throw error;
    }
  }
}

function parseDeploymentHistory(value: string | null | undefined): Array<{
  id: string;
  status: string;
  title: string;
  logs: string;
  createdAt: string;
}> {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (
        item,
      ): item is {
        id: string;
        status: string;
        title: string;
        logs: string;
        createdAt: string;
      } => {
        if (!item || typeof item !== "object") return false;
        const value = item as Record<string, unknown>;
        return (
          typeof value.id === "string" &&
          typeof value.status === "string" &&
          typeof value.title === "string" &&
          typeof value.logs === "string" &&
          typeof value.createdAt === "string"
        );
      },
    );
  } catch {
    return [];
  }
}
