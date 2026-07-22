import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertPublicHttpUrl } from "@upstand/platform/network/outbound";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export const TestS3DestinationConnectionInputSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  provider: z.string().min(1, "Provider is required"),
  accessKeyId: z.string().min(1, "Access Key Id is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
  bucket: z.string().min(1, "Bucket is required"),
  region: z.string(),
  endpoint: z.string().min(1, "Endpoint is required"),
  // Connection tests deliberately do not accept arbitrary rclone flags.
  // Stored destination flags are used by the backup workflow, but allowing
  // them here would let a user alter the executable's network/configuration
  // behavior during a server-side connection test.
});

export type TestS3DestinationConnectionInput = z.infer<
  typeof TestS3DestinationConnectionInputSchema
>;

export function buildRcloneArguments(
  input: Pick<
    TestS3DestinationConnectionInput,
    | "provider"
    | "accessKeyId"
    | "secretAccessKey"
    | "region"
    | "endpoint"
    | "bucket"
  >,
): string[] {
  return [
    "ls",
    `--s3-provider=${input.provider}`,
    `--s3-access-key-id=${input.accessKeyId}`,
    `--s3-secret-access-key=${input.secretAccessKey}`,
    `--s3-region=${input.region}`,
    `--s3-endpoint=${input.endpoint}`,
    "--s3-no-check-bucket",
    "--s3-force-path-style",
    "--retries",
    "1",
    "--low-level-retries",
    "1",
    "--timeout",
    "10s",
    "--contimeout",
    "5s",
    `:s3:${input.bucket}`,
  ];
}

export class TestS3DestinationConnectionUseCase {
  async execute(
    input: TestS3DestinationConnectionInput,
  ): Promise<{ success: boolean; output?: string }> {
    try {
      const endpoint = await assertPublicHttpUrl(input.endpoint);
      const { stdout } = await execFileAsync(
        "rclone",
        buildRcloneArguments({ ...input, endpoint: endpoint.toString() }),
        { timeout: 15_000, maxBuffer: 1024 * 1024 },
      );
      return { success: true, output: stdout };
    } catch (error: unknown) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Failed to connect to S3 bucket",
      );
    }
  }
}
