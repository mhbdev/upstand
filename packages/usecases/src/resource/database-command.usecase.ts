import type { IUnitOfWork } from "@upstand/domain";
import { z } from "zod";
import type { DockerCommandService as DockerService } from "./docker-client";
import { resolveDockerServiceForServer } from "./docker-client";

export const DatabaseCommandSchema = z.enum(["health", "version"]);

export const DatabaseCommandInputSchema = z.object({
  id: z.string().min(1, "Resource ID is required"),
  command: DatabaseCommandSchema,
});

export type DatabaseCommandInput = z.infer<typeof DatabaseCommandInputSchema>;
type DatabaseCommand = z.infer<typeof DatabaseCommandSchema>;

const COMMANDS: Record<
  string,
  Record<z.infer<typeof DatabaseCommandSchema>, string>
> = {
  postgres: {
    health: "pg_isready",
    version: "postgres --version",
  },
  mysql: {
    health: "mysqladmin ping",
    version: "mysql --version",
  },
  mariadb: {
    health: "mariadb-admin ping",
    version: "mariadb --version",
  },
  mongodb: {
    health: "mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok'",
    version: "mongod --version",
  },
  redis: {
    health: "redis-cli ping",
    version: "redis-server --version",
  },
  libsql: {
    health: "curl -fsS http://127.0.0.1:8080/health",
    version: "sqld --version",
  },
};

export class DatabaseCommandUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly defaultDockerService: DockerService,
  ) {}

  async execute(input: DatabaseCommandInput): Promise<{
    resourceId: string;
    dbType: string;
    command: DatabaseCommand;
    output: string;
  }> {
    const resource = await this.uow.resourceRepository.findById(input.id);
    if (!resource) throw new Error("Resource not found");
    if (resource.type !== "database") {
      throw new Error(
        "Database commands are only available for database resources",
      );
    }

    const dbType = resource.dbType?.toLowerCase() ?? "";
    const command = COMMANDS[dbType]?.[input.command];
    if (!command) throw new Error(`Unsupported database engine: ${dbType}`);

    const { dockerService, cleanup } = await resolveDockerServiceForServer(
      resource.serverId,
      this.uow,
      this.defaultDockerService,
    );
    try {
      const output = await dockerService.runCommandInResourceContainer(
        resource,
        command,
      );
      return {
        resourceId: resource.id,
        dbType,
        command: input.command,
        output: output.trim().slice(0, 32_000),
      };
    } finally {
      cleanup();
    }
  }
}
