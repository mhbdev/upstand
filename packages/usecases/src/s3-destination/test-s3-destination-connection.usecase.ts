import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execAsync = promisify(exec);

export const TestS3DestinationConnectionInputSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  provider: z.string().min(1, "Provider is required"),
  accessKeyId: z.string().min(1, "Access Key Id is required"),
  secretAccessKey: z.string().min(1, "Secret Access Key is required"),
  bucket: z.string().min(1, "Bucket is required"),
  region: z.string(),
  endpoint: z.string().min(1, "Endpoint is required"),
  additionalFlags: z.array(z.string()).optional(),
});

export type TestS3DestinationConnectionInput = z.infer<
  typeof TestS3DestinationConnectionInputSchema
>;

export class TestS3DestinationConnectionUseCase {
  async execute(
    input: TestS3DestinationConnectionInput,
  ): Promise<{ success: boolean; output?: string }> {
    try {
      const rcloneFlags = [
        `--s3-access-key-id="${input.accessKeyId}"`,
        `--s3-secret-access-key="${input.secretAccessKey}"`,
        `--s3-region="${input.region}"`,
        `--s3-endpoint="${input.endpoint}"`,
        "--s3-no-check-bucket",
        "--s3-force-path-style",
        "--retries 1",
        "--low-level-retries 1",
        "--timeout 10s",
        "--contimeout 5s",
      ];
      if (input.provider) {
        rcloneFlags.unshift(`--s3-provider="${input.provider}"`);
      }
      if (input.additionalFlags && input.additionalFlags.length > 0) {
        rcloneFlags.push(...input.additionalFlags);
      }
      const rcloneDestination = `:s3:${input.bucket}`;
      const rcloneCommand = `rclone ls ${rcloneFlags.join(" ")} "${rcloneDestination}"`;

      const { stdout } = await execAsync(rcloneCommand);
      return { success: true, output: stdout };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to connect to S3 bucket");
    }
  }
}
