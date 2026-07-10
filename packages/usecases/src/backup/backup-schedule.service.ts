import {
  type BackupDatabaseEngine,
  type BackupSchedule,
  type CreateBackupScheduleInput,
  CreateBackupScheduleInputSchema,
  type IUnitOfWork,
  type Resource,
  ValidationError,
} from "@upstand/domain";
import { encryptSecret } from "@upstand/domain/crypto/secret-box";
import { Cron } from "croner";

const DATABASE_ENGINES: Record<string, BackupDatabaseEngine> = {
  postgres: "postgres",
  mysql: "mysql",
  mariadb: "mariadb",
  mongodb: "mongodb",
};

function parseResourceCredentials(resource: Resource): Record<string, string> {
  if (!resource.credentials) return {};
  try {
    return JSON.parse(resource.credentials) as Record<string, string>;
  } catch {
    return {};
  }
}

function defaultsForDatabase(resource: Resource): { databaseName?: string } {
  const credentials = parseResourceCredentials(resource);
  return {
    databaseName: credentials.dbName,
  };
}

export function validateBackupSchedule(input: CreateBackupScheduleInput): void {
  try {
    const cron = new Cron(input.cronExpression, {
      paused: true,
      timezone: input.timezone,
      mode: "5-part",
    });
    const next = cron.nextRun();
    cron.stop();
    if (!next) throw new Error("The schedule has no future run");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid schedule";
    throw new ValidationError(`Invalid backup schedule: ${message}`);
  }

  try {
    Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
  } catch {
    throw new ValidationError("Backup timezone must be a valid IANA timezone");
  }
}

export function normalizeBackupScheduleInput(
  rawInput: CreateBackupScheduleInput,
  resource: Resource,
  options: { allowExistingSourceCredentials?: boolean } = {},
): CreateBackupScheduleInput {
  const resourceEngine = resource.dbType
    ? DATABASE_ENGINES[resource.dbType.toLowerCase()]
    : undefined;
  const databaseEngine = rawInput.databaseEngine ?? resourceEngine;

  if (rawInput.kind === "database" && !databaseEngine) {
    throw new ValidationError(
      "Choose a supported database engine (PostgreSQL, MySQL, MariaDB, or MongoDB)",
    );
  }

  if (rawInput.kind === "database" && databaseEngine) {
    const defaults = defaultsForDatabase(resource);
    const normalized = CreateBackupScheduleInputSchema.parse({
      ...rawInput,
      databaseEngine,
      databaseName: rawInput.databaseName ?? defaults.databaseName,
    });

    if (
      resource.type !== "database" &&
      !normalized.sourceCredentials &&
      !options.allowExistingSourceCredentials
    ) {
      throw new ValidationError(
        "Database backups for applications and Compose resources require source database credentials",
      );
    }
    return normalized;
  }

  return CreateBackupScheduleInputSchema.parse(rawInput);
}

export function encryptedSourceCredentials(
  input: CreateBackupScheduleInput,
): string | null {
  return input.sourceCredentials
    ? JSON.stringify(encryptSecret(JSON.stringify(input.sourceCredentials)))
    : null;
}

export async function resolveBackupOrganizationId(
  uow: IUnitOfWork,
  resource: Resource,
): Promise<string> {
  const environment = await uow.environmentRepository.findById(
    resource.environmentId,
  );
  if (!environment) throw new ValidationError("Resource environment not found");

  const project = await uow.projectRepository.findById(environment.projectId);
  if (!project) throw new ValidationError("Resource project not found");
  return project.organizationId;
}

export function toScheduleUpdate(
  input: CreateBackupScheduleInput,
  encryptedConfiguration: string | null | undefined,
) {
  return {
    resourceId: input.resourceId,
    destinationId: input.destinationId,
    name: input.name,
    kind: input.kind,
    cronExpression: input.cronExpression,
    timezone: input.timezone,
    prefix: input.prefix.replace(/^\/+|\/+$/g, ""),
    retentionCount: input.retentionCount ?? null,
    enabled: input.enabled,
    databaseName: input.databaseName ?? null,
    databaseEngine: input.databaseEngine ?? null,
    serviceName: input.serviceName ?? null,
    volumeName: input.volumeName ?? null,
    stopService: input.stopService,
    encryptedConfiguration,
  };
}

export function scheduleWithInput(
  schedule: BackupSchedule,
): CreateBackupScheduleInput {
  return {
    resourceId: schedule.resourceId,
    destinationId: schedule.destinationId,
    name: schedule.name,
    kind: schedule.kind,
    cronExpression: schedule.cronExpression,
    timezone: schedule.timezone,
    prefix: schedule.prefix,
    retentionCount: schedule.retentionCount,
    enabled: schedule.enabled,
    databaseName: schedule.databaseName ?? undefined,
    databaseEngine: schedule.databaseEngine ?? undefined,
    serviceName: schedule.serviceName ?? undefined,
    volumeName: schedule.volumeName ?? undefined,
    stopService: schedule.stopService,
  };
}
