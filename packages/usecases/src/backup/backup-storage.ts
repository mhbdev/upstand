import { spawn } from "node:child_process";
import type { S3Destination } from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";

export interface BackupStorageDestination {
  bucket: string;
  rcloneFlags: string[];
}

export function normalizeBackupPrefix(prefix: string): string {
  let normalized = prefix.trim();
  while (normalized.startsWith("/")) normalized = normalized.slice(1);
  while (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized ? `${normalized}/` : "";
}

function decryptDestinationField(value: string): string {
  const payload = JSON.parse(value);
  return decryptSecret(payload);
}

export function toBackupStorageDestination(
  destination: S3Destination,
): BackupStorageDestination {
  const accessKeyId = decryptDestinationField(destination.accessKeyId);
  const secretAccessKey = decryptDestinationField(destination.secretAccessKey);
  let additionalFlags: string[] = [];
  try {
    additionalFlags = JSON.parse(destination.additionalFlags || "[]");
  } catch {
    additionalFlags = [];
  }

  return {
    bucket: destination.bucket,
    rcloneFlags: [
      `--s3-provider=${destination.provider}`,
      `--s3-access-key-id=${accessKeyId}`,
      `--s3-secret-access-key=${secretAccessKey}`,
      `--s3-region=${destination.region}`,
      `--s3-endpoint=${destination.endpoint}`,
      "--s3-no-check-bucket",
      "--s3-force-path-style",
      ...additionalFlags,
    ],
  };
}

export function rcloneRemote(
  destination: BackupStorageDestination,
  key: string,
): string {
  return `:s3:${destination.bucket}/${key}`;
}

export function runProcess(
  command: string,
  args: string[],
  input?: NodeJS.ReadableStream,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${command} exited with ${code}: ${stderr.slice(0, 1_000)}`,
          ),
        );
    });
    if (input) input.pipe(child.stdin);
    else child.stdin.end();
  });
}

export function pipeProcesses(
  producerCommand: string,
  producerArgs: string[],
  consumerCommand: string,
  consumerArgs: string[],
  environments?: {
    producer?: Record<string, string | undefined>;
    consumer?: Record<string, string | undefined>;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const producer = spawn(producerCommand, producerArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      env: environments?.producer
        ? { ...process.env, ...environments.producer }
        : undefined,
    });
    const consumer = spawn(consumerCommand, consumerArgs, {
      stdio: ["pipe", "ignore", "pipe"],
      env: environments?.consumer
        ? { ...process.env, ...environments.consumer }
        : undefined,
    });
    let producerError = "";
    let consumerError = "";
    producer.stderr.on("data", (chunk: Buffer) => {
      producerError += chunk.toString();
    });
    consumer.stderr.on("data", (chunk: Buffer) => {
      consumerError += chunk.toString();
    });
    producer.once("error", reject);
    consumer.once("error", reject);
    producer.stdout.pipe(consumer.stdin);

    let producerCode: number | null = null;
    let consumerCode: number | null = null;
    const complete = () => {
      if (producerCode === null || consumerCode === null) return;
      if (producerCode === 0 && consumerCode === 0) return resolve();
      reject(
        new Error(
          `Backup pipeline failed (producer ${producerCode}, consumer ${consumerCode}): ${(producerError || consumerError).slice(0, 1_000)}`,
        ),
      );
    };
    producer.once("close", (code) => {
      producerCode = code;
      complete();
    });
    consumer.once("close", (code) => {
      consumerCode = code;
      complete();
    });
  });
}
