import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { S3Destination } from "@upstand/domain";
import {
  type BackupDatabaseEngine,
  type BackupSchedule,
  type Resource,
  ValidationError,
} from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import {
  normalizeBackupPrefix,
  pipeProcesses,
  rcloneRemote,
  runProcess,
  toBackupStorageDestination,
} from "./backup-storage";

const execFileAsync = promisify(execFile);

interface BackupCredentials {
  databaseUser: string;
  databasePassword: string;
}

function backupTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function databaseFileExtension(engine: BackupDatabaseEngine): string {
  return engine === "mongodb" ? "archive.gz" : "sql.gz";
}

function parseEncryptedConfiguration(
  schedule: BackupSchedule,
): BackupCredentials | null {
  if (!schedule.encryptedConfiguration) return null;
  const payload = JSON.parse(schedule.encryptedConfiguration);
  return JSON.parse(decryptSecret(payload)) as BackupCredentials;
}

function parseResourceCredentials(resource: Resource): Record<string, string> {
  if (!resource.credentials) return {};
  try {
    const raw = JSON.parse(resource.credentials);
    if (raw.ciphertext && raw.iv && raw.authTag) {
      return JSON.parse(decryptSecret(raw)) as Record<string, string>;
    }
    return raw as Record<string, string>;
  } catch {
    return {};
  }
}

function resolveCredentials(
  schedule: BackupSchedule,
  resource: Resource,
): BackupCredentials {
  const configured = parseEncryptedConfiguration(schedule);
  if (configured) return configured;
  const credentials = parseResourceCredentials(resource);
  const engine = schedule.databaseEngine;
  if (engine === "postgres") {
    return {
      databaseUser: credentials.dbUser || "upstand",
      databasePassword: credentials.dbPassword || "",
    };
  }
  if (engine === "mongodb") {
    return {
      databaseUser: credentials.dbUser || "upstand",
      databasePassword: credentials.dbPassword || "",
    };
  }
  return {
    databaseUser: credentials.dbUser || "root",
    databasePassword:
      credentials.dbRootPassword || credentials.dbPassword || "",
  };
}

function serviceNameFor(
  resource: Resource,
  serviceName?: string | null,
): string {
  const appName = (resource.appName || resource.name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, "-");
  return resource.type === "compose" && serviceName
    ? `${appName}_${serviceName}`
    : appName;
}

export class BackupRuntimeService {
  async listVolumes(resource: Resource): Promise<string[]> {
    const containerId = await this.resolveContainerId(resource, null);
    const { stdout } = await execFileAsync("docker", [
      "inspect",
      containerId,
      "--format",
      "{{json .Mounts}}",
    ]);
    const mounts = JSON.parse(stdout) as Array<{
      Type?: string;
      Name?: string;
    }>;
    return mounts
      .filter((mount) => mount.Type === "volume" && mount.Name)
      .map((mount) => mount.Name as string)
      .sort();
  }

  async createBackup(
    schedule: BackupSchedule,
    resource: Resource,
    destination: S3Destination,
  ): Promise<string> {
    const storage = toBackupStorageDestination(destination);
    const resourcePath = `${resource.id}/${normalizeBackupPrefix(schedule.prefix)}`;
    const fileName =
      schedule.kind === "database"
        ? `${backupTimestamp()}.${databaseFileExtension(
            schedule.databaseEngine as BackupDatabaseEngine,
          )}`
        : `${schedule.volumeName}-${backupTimestamp()}.tar.gz`;
    const fileKey = `${resourcePath}${fileName}`;

    if (schedule.kind === "database") {
      await this.createDatabaseBackup(schedule, resource, storage, fileKey);
    } else {
      await this.createVolumeBackup(schedule, resource, storage, fileKey);
    }
    return fileKey;
  }

  async restoreBackup(
    schedule: BackupSchedule,
    resource: Resource,
    destination: S3Destination,
    fileKey: string,
  ): Promise<void> {
    const storage = toBackupStorageDestination(destination);
    if (schedule.kind === "database") {
      await this.restoreDatabaseBackup(schedule, resource, storage, fileKey);
      return;
    }
    await this.restoreVolumeBackup(schedule, resource, storage, fileKey);
  }

  async deleteBackup(
    destination: S3Destination,
    fileKey: string,
  ): Promise<void> {
    const storage = toBackupStorageDestination(destination);
    await runProcess("rclone", [
      "deletefile",
      ...storage.rcloneFlags,
      rcloneRemote(storage, fileKey),
    ]);
  }

  private async createDatabaseBackup(
    schedule: BackupSchedule,
    resource: Resource,
    storage: ReturnType<typeof toBackupStorageDestination>,
    fileKey: string,
  ): Promise<void> {
    const engine = schedule.databaseEngine;
    const databaseName = schedule.databaseName;
    if (!engine || !databaseName) {
      throw new ValidationError("Database backup configuration is incomplete");
    }
    const credentials = resolveCredentials(schedule, resource);
    const containerId = await this.resolveContainerId(resource, schedule);
    const command = this.databaseDumpCommand(engine);
    const dockerArgs = [
      "exec",
      "-i",
      "-e",
      `UPSTAND_BACKUP_USER=${credentials.databaseUser}`,
      "-e",
      `UPSTAND_BACKUP_PASSWORD=${credentials.databasePassword}`,
      "-e",
      `UPSTAND_BACKUP_DATABASE=${databaseName}`,
      containerId,
      "sh",
      "-c",
      command,
    ];
    await pipeProcesses("docker", dockerArgs, "rclone", [
      "rcat",
      ...storage.rcloneFlags,
      rcloneRemote(storage, fileKey),
    ]);
  }

  private async createVolumeBackup(
    schedule: BackupSchedule,
    resource: Resource,
    storage: ReturnType<typeof toBackupStorageDestination>,
    fileKey: string,
  ): Promise<void> {
    if (!schedule.volumeName) {
      throw new ValidationError("Volume backup configuration is incomplete");
    }
    const serviceName = serviceNameFor(resource, schedule.serviceName);
    const replicas = schedule.stopService
      ? await this.stopService(serviceName)
      : null;
    try {
      await pipeProcesses(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${schedule.volumeName}:/source:ro`,
          "alpine:3.20",
          "tar",
          "-C",
          "/source",
          "-czf",
          "-",
          ".",
        ],
        "rclone",
        ["rcat", ...storage.rcloneFlags, rcloneRemote(storage, fileKey)],
      );
    } finally {
      if (replicas !== null) await this.restoreService(serviceName, replicas);
    }
  }

  private async restoreDatabaseBackup(
    schedule: BackupSchedule,
    resource: Resource,
    storage: ReturnType<typeof toBackupStorageDestination>,
    fileKey: string,
  ): Promise<void> {
    const engine = schedule.databaseEngine;
    const databaseName = schedule.databaseName;
    if (!engine || !databaseName) {
      throw new ValidationError("Database restore configuration is incomplete");
    }
    const credentials = resolveCredentials(schedule, resource);
    const containerId = await this.resolveContainerId(resource, schedule);
    await pipeProcesses(
      "rclone",
      ["cat", ...storage.rcloneFlags, rcloneRemote(storage, fileKey)],
      "docker",
      [
        "exec",
        "-i",
        "-e",
        `UPSTAND_BACKUP_USER=${credentials.databaseUser}`,
        "-e",
        `UPSTAND_BACKUP_PASSWORD=${credentials.databasePassword}`,
        "-e",
        `UPSTAND_BACKUP_DATABASE=${databaseName}`,
        containerId,
        "sh",
        "-c",
        this.databaseRestoreCommand(engine),
      ],
    );
  }

  private async restoreVolumeBackup(
    schedule: BackupSchedule,
    resource: Resource,
    storage: ReturnType<typeof toBackupStorageDestination>,
    fileKey: string,
  ): Promise<void> {
    if (!schedule.volumeName) {
      throw new ValidationError("Volume restore configuration is incomplete");
    }
    const serviceName = serviceNameFor(resource, schedule.serviceName);
    const replicas = schedule.stopService
      ? await this.stopService(serviceName)
      : null;
    try {
      await pipeProcesses(
        "rclone",
        ["cat", ...storage.rcloneFlags, rcloneRemote(storage, fileKey)],
        "docker",
        [
          "run",
          "--rm",
          "-i",
          "-v",
          `${schedule.volumeName}:/target`,
          "alpine:3.20",
          "sh",
          "-c",
          "find /target -mindepth 1 -delete && tar -xzf - -C /target",
        ],
      );
    } finally {
      if (replicas !== null) await this.restoreService(serviceName, replicas);
    }
  }

  private databaseDumpCommand(engine: BackupDatabaseEngine): string {
    if (engine === "postgres") {
      return 'PGPASSWORD="$UPSTAND_BACKUP_PASSWORD" pg_dump -Fc --no-owner --no-acl -U "$UPSTAND_BACKUP_USER" -d "$UPSTAND_BACKUP_DATABASE" | gzip';
    }
    if (engine === "mongodb") {
      return 'mongodump --archive --gzip -d "$UPSTAND_BACKUP_DATABASE" -u "$UPSTAND_BACKUP_USER" -p "$UPSTAND_BACKUP_PASSWORD" --authenticationDatabase admin';
    }
    const command = engine === "mariadb" ? "mariadb-dump" : "mysqldump";
    return `MYSQL_PWD="$UPSTAND_BACKUP_PASSWORD" ${command} -u "$UPSTAND_BACKUP_USER" --single-transaction --quick --databases "$UPSTAND_BACKUP_DATABASE" | gzip`;
  }

  private databaseRestoreCommand(engine: BackupDatabaseEngine): string {
    if (engine === "postgres") {
      return 'PGPASSWORD="$UPSTAND_BACKUP_PASSWORD" gunzip | pg_restore -U "$UPSTAND_BACKUP_USER" -d "$UPSTAND_BACKUP_DATABASE" --clean --if-exists --no-owner';
    }
    if (engine === "mongodb") {
      return 'mongorestore --archive --gzip --drop -u "$UPSTAND_BACKUP_USER" -p "$UPSTAND_BACKUP_PASSWORD" --authenticationDatabase admin';
    }
    const command = engine === "mariadb" ? "mariadb" : "mysql";
    return `MYSQL_PWD="$UPSTAND_BACKUP_PASSWORD" gunzip | ${command} -u "$UPSTAND_BACKUP_USER"`;
  }

  private async resolveContainerId(
    resource: Resource,
    schedule: BackupSchedule | null,
  ): Promise<string> {
    const serviceName = serviceNameFor(resource, schedule?.serviceName);
    const { stdout } = await execFileAsync("docker", [
      "ps",
      "--filter",
      `label=com.docker.swarm.service.name=${serviceName}`,
      "--format",
      "{{.ID}}",
    ]);
    const containerId = stdout.trim().split("\n")[0];
    if (!containerId) {
      throw new Error(
        `No running container found for service '${serviceName}'`,
      );
    }
    return containerId;
  }

  private async stopService(serviceName: string): Promise<number> {
    const { stdout } = await execFileAsync("docker", [
      "service",
      "inspect",
      serviceName,
      "--format",
      "{{.Spec.Mode.Replicated.Replicas}}",
    ]);
    const replicas = Number.parseInt(stdout.trim(), 10);
    if (!Number.isInteger(replicas)) {
      throw new Error(
        `Unable to determine replicas for service '${serviceName}'`,
      );
    }
    await execFileAsync("docker", ["service", "scale", `${serviceName}=0`]);
    return replicas;
  }

  private async restoreService(
    serviceName: string,
    replicas: number,
  ): Promise<void> {
    await execFileAsync("docker", [
      "service",
      "scale",
      `${serviceName}=${replicas}`,
    ]);
  }
}
