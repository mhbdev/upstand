import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import type { IUnitOfWork, S3Destination } from "@upstand/domain";
import {
  type BackupDatabaseEngine,
  type BackupSchedule,
  type Resource,
  ValidationError,
} from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import { resolveDockerCliEnvironmentForServer } from "../resource/docker-client";
import { parseResourceCredentials as parseCredentialDocument } from "../resource/resource-credentials";
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

function randomSuffix(): string {
  return randomUUID().slice(0, 8);
}

const CONTROL_PLANE_POSTGRES_CONTAINERS = [
  "upstand-postgres",
  "upstand_postgres",
] as const;
const WEB_SERVER_BACKUP_VOLUMES = [
  "upstand-caddy-runtime",
  "upstand-caddy-data",
  "upstand-caddy-config",
] as const;

type WebServerBackupManifest = {
  version: 1;
  createdAt: string;
  files: string[];
};

export function validateWebServerBackupManifest(
  parsed: unknown,
  manifestKey: string,
): WebServerBackupManifest {
  const manifestSuffix = "manifest.json";
  const manifestIndex = manifestKey.lastIndexOf(manifestSuffix);
  const base = manifestKey.slice(0, manifestIndex);
  const expectedFiles = new Set([
    `${base}control-plane.dump`,
    ...WEB_SERVER_BACKUP_VOLUMES.map((volume) => `${base}${volume}.tar.gz`),
  ]);
  const files =
    parsed && typeof parsed === "object"
      ? (parsed as { files?: unknown }).files
      : undefined;
  if (
    manifestIndex < 1 ||
    !manifestKey.endsWith(manifestSuffix) ||
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { version?: unknown }).version !== 1 ||
    typeof (parsed as { createdAt?: unknown }).createdAt !== "string" ||
    Number.isNaN(Date.parse((parsed as { createdAt: string }).createdAt)) ||
    !Array.isArray(files) ||
    files.length !== expectedFiles.size ||
    new Set(files).size !== files.length ||
    !files.every(
      (file) =>
        typeof file === "string" &&
        file.startsWith(base) &&
        !file.split("/").includes("..") &&
        expectedFiles.has(file),
    )
  ) {
    throw new ValidationError("Web-server backup manifest is invalid");
  }
  return parsed as WebServerBackupManifest;
}

function databaseFileExtension(engine: BackupDatabaseEngine): string {
  return engine === "mongodb" || engine === "libsql" || engine === "redis"
    ? "archive.gz"
    : "sql.gz";
}

function parseEncryptedConfiguration(
  schedule: BackupSchedule,
): BackupCredentials | null {
  if (!schedule.encryptedConfiguration) return null;
  const payload = JSON.parse(schedule.encryptedConfiguration);
  return JSON.parse(decryptSecret(payload)) as BackupCredentials;
}

function parseResourceCredentials(resource: Resource): Record<string, string> {
  return parseCredentialDocument(resource.credentials) as Record<
    string,
    string
  >;
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
  constructor(
    private readonly dockerEnvironment: Record<string, string | undefined> = {},
  ) {}

  withDockerEnvironment(
    environment: Record<string, string | undefined>,
  ): BackupRuntimeService {
    return new BackupRuntimeService(environment);
  }

  async listVolumes(resource: Resource): Promise<string[]> {
    const containerId = await this.resolveContainerId(resource, null);
    const { stdout } = await execFileAsync(
      "docker",
      ["inspect", containerId, "--format", "{{json .Mounts}}"],
      { env: { ...process.env, ...this.dockerEnvironment } },
    );
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
    if (
      !engine ||
      (!databaseName && engine !== "libsql" && engine !== "redis")
    ) {
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
    await pipeProcesses(
      "docker",
      dockerArgs,
      "rclone",
      ["rcat", ...storage.rcloneFlags, rcloneRemote(storage, fileKey)],
      { producer: this.dockerEnvironment },
    );
  }

  async createWebServerBackup(
    schedule: BackupSchedule,
    destination: S3Destination,
  ): Promise<string> {
    const storage = toBackupStorageDestination(destination);
    const base = `web-server/${normalizeBackupPrefix(schedule.prefix)}${backupTimestamp()}-${randomSuffix()}/`;
    const postgresKey = `${base}control-plane.dump`;
    const volumeKeys = WEB_SERVER_BACKUP_VOLUMES.map(
      (volume) => `${base}${volume}.tar.gz`,
    );
    const postgresContainer = await this.resolvePostgresContainer();

    await pipeProcesses(
      "docker",
      [
        "exec",
        postgresContainer,
        "sh",
        "-ec",
        String.raw`pg_dump -Fc -U "\${POSTGRES_USER:-postgres}" -d "\${POSTGRES_DB:-upstand}"`,
      ],
      "rclone",
      ["rcat", ...storage.rcloneFlags, rcloneRemote(storage, postgresKey)],
    );

    for (const [index, volume] of WEB_SERVER_BACKUP_VOLUMES.entries()) {
      await pipeProcesses(
        "docker",
        [
          "run",
          "--rm",
          "-v",
          `${volume}:/source:ro`,
          "alpine:3.20",
          "tar",
          "-C",
          "/source",
          "-czf",
          "-",
          ".",
        ],
        "rclone",
        [
          "rcat",
          ...storage.rcloneFlags,
          rcloneRemote(storage, volumeKeys[index] as string),
        ],
      );
    }

    const manifestKey = `${base}manifest.json`;
    const manifest: WebServerBackupManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      files: [postgresKey, ...volumeKeys],
    };
    await runProcess(
      "rclone",
      ["rcat", ...storage.rcloneFlags, rcloneRemote(storage, manifestKey)],
      Readable.from([JSON.stringify(manifest)]),
    );
    return manifestKey;
  }

  async restoreWebServerBackup(
    destination: S3Destination,
    manifestKey: string,
  ): Promise<void> {
    const storage = toBackupStorageDestination(destination);
    const manifest = await this.readWebServerManifest(storage, manifestKey);
    const postgresContainer = await this.resolvePostgresContainer();
    let caddyWasRunning = false;
    try {
      const inspect = await execFileAsync("docker", [
        "inspect",
        "--format",
        "{{.State.Running}}",
        "upstand-caddy",
      ]);
      caddyWasRunning = inspect.stdout.trim() === "true";
    } catch {
      caddyWasRunning = false;
    }

    if (caddyWasRunning) {
      await execFileAsync("docker", ["stop", "--time", "30", "upstand-caddy"]);
    }
    try {
      const databaseKey = manifest.files.find((file) =>
        file.endsWith("control-plane.dump"),
      );
      if (!databaseKey)
        throw new ValidationError(
          "Web-server backup has no control-plane database dump",
        );
      await execFileAsync("docker", [
        "exec",
        postgresContainer,
        "sh",
        "-ec",
        String.raw`psql -U "\${POSTGRES_USER:-postgres}" -d "\${POSTGRES_DB:-upstand}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();"`,
      ]);
      await pipeProcesses(
        "rclone",
        ["cat", ...storage.rcloneFlags, rcloneRemote(storage, databaseKey)],
        "docker",
        [
          "exec",
          "-i",
          postgresContainer,
          "sh",
          "-ec",
          String.raw`pg_restore -U "\${POSTGRES_USER:-postgres}" -d "\${POSTGRES_DB:-upstand}" --clean --if-exists --no-owner`,
        ],
      );

      for (const volume of WEB_SERVER_BACKUP_VOLUMES) {
        const key = manifest.files.find((file) =>
          file.endsWith(`${volume}.tar.gz`),
        );
        if (!key)
          throw new ValidationError(`Web-server backup is missing ${volume}`);
        await pipeProcesses(
          "rclone",
          ["cat", ...storage.rcloneFlags, rcloneRemote(storage, key)],
          "docker",
          [
            "run",
            "--rm",
            "-i",
            "-v",
            `${volume}:/target`,
            "alpine:3.20",
            "sh",
            "-ec",
            "find /target -mindepth 1 -delete && tar -xzf - -C /target",
          ],
        );
      }
    } finally {
      if (caddyWasRunning) {
        await execFileAsync("docker", ["start", "upstand-caddy"]).catch(
          () => undefined,
        );
      }
    }
  }

  async deleteWebServerBackup(
    destination: S3Destination,
    manifestKey: string,
  ): Promise<void> {
    const storage = toBackupStorageDestination(destination);
    let manifest: WebServerBackupManifest;
    try {
      manifest = await this.readWebServerManifest(storage, manifestKey);
    } catch {
      await runProcess("rclone", [
        "deletefile",
        ...storage.rcloneFlags,
        rcloneRemote(storage, manifestKey),
      ]);
      return;
    }
    for (const key of [...manifest.files, manifestKey]) {
      await runProcess("rclone", [
        "deletefile",
        ...storage.rcloneFlags,
        rcloneRemote(storage, key),
      ]);
    }
  }

  private async resolvePostgresContainer(): Promise<string> {
    const candidates = process.env.UPSTAND_POSTGRES_CONTAINER
      ? [
          process.env.UPSTAND_POSTGRES_CONTAINER,
          ...CONTROL_PLANE_POSTGRES_CONTAINERS,
        ]
      : [...CONTROL_PLANE_POSTGRES_CONTAINERS];
    for (const candidate of [...new Set(candidates)]) {
      const result = await execFileAsync("docker", [
        "ps",
        "--filter",
        `name=${candidate}`,
        "--format",
        "{{.ID}}",
      ]);
      const id = result.stdout.trim().split(/\r?\n/)[0];
      if (id) return id;
    }
    throw new ValidationError("Upstand PostgreSQL container is not running");
  }

  private async readWebServerManifest(
    storage: ReturnType<typeof toBackupStorageDestination>,
    manifestKey: string,
  ): Promise<WebServerBackupManifest> {
    const { stdout } = await execFileAsync(
      "rclone",
      ["cat", ...storage.rcloneFlags, rcloneRemote(storage, manifestKey)],
      { maxBuffer: 1024 * 1024 },
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new ValidationError("Web-server backup manifest is invalid");
    }
    return validateWebServerBackupManifest(parsed, manifestKey);
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
        { producer: this.dockerEnvironment },
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
    if (
      !engine ||
      (!databaseName && engine !== "libsql" && engine !== "redis")
    ) {
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
      { consumer: this.dockerEnvironment },
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
        { consumer: this.dockerEnvironment },
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
    if (engine === "libsql") {
      return "tar -C /var/lib/sqld -czf - .";
    }
    if (engine === "redis") {
      return "tar -C /data -czf - dump.rdb";
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
    if (engine === "libsql") {
      return "find /var/lib/sqld -mindepth 1 -delete && tar -xzf - -C /var/lib/sqld";
    }
    if (engine === "redis") {
      return "mkdir -p /data && tar -xzf - -C /data";
    }
    const command = engine === "mariadb" ? "mariadb" : "mysql";
    return `MYSQL_PWD="$UPSTAND_BACKUP_PASSWORD" gunzip | ${command} -u "$UPSTAND_BACKUP_USER"`;
  }

  private async resolveContainerId(
    resource: Resource,
    schedule: BackupSchedule | null,
  ): Promise<string> {
    const serviceName = serviceNameFor(resource, schedule?.serviceName);
    const { stdout } = await execFileAsync(
      "docker",
      [
        "ps",
        "--filter",
        `label=com.docker.swarm.service.name=${serviceName}`,
        "--format",
        "{{.ID}}",
      ],
      { env: { ...process.env, ...this.dockerEnvironment } },
    );
    const containerId = stdout.trim().split("\n")[0];
    if (!containerId) {
      throw new Error(
        `No running container found for service '${serviceName}'`,
      );
    }
    return containerId;
  }

  private async stopService(serviceName: string): Promise<number> {
    const { stdout } = await execFileAsync(
      "docker",
      [
        "service",
        "inspect",
        serviceName,
        "--format",
        "{{.Spec.Mode.Replicated.Replicas}}",
      ],
      { env: { ...process.env, ...this.dockerEnvironment } },
    );
    const replicas = Number.parseInt(stdout.trim(), 10);
    if (!Number.isInteger(replicas)) {
      throw new Error(
        `Unable to determine replicas for service '${serviceName}'`,
      );
    }
    await execFileAsync("docker", ["service", "scale", `${serviceName}=0`], {
      env: { ...process.env, ...this.dockerEnvironment },
    });
    return replicas;
  }

  private async restoreService(
    serviceName: string,
    replicas: number,
  ): Promise<void> {
    await execFileAsync(
      "docker",
      ["service", "scale", `${serviceName}=${replicas}`],
      { env: { ...process.env, ...this.dockerEnvironment } },
    );
  }
}

export async function withBackupRuntime<T>(
  uow: IUnitOfWork,
  resource: Resource,
  runtime: BackupRuntimeService,
  operation: (runtime: BackupRuntimeService) => Promise<T>,
): Promise<T> {
  const remote = await resolveDockerCliEnvironmentForServer(
    resource.serverId,
    uow,
  );
  try {
    return await operation(runtime.withDockerEnvironment(remote.environment));
  } finally {
    remote.cleanup();
  }
}
