import { scanHostKey } from "@upstand/platform/ssh/host-key";
import { z } from "zod";

export const ScanServerHostKeyInputSchema = z.object({
  ipAddress: z.string().min(1, "IP address is required"),
  port: z.number().default(22),
});

export type ScanServerHostKeyInput = z.infer<
  typeof ScanServerHostKeyInputSchema
>;

export class ScanServerHostKeyUseCase {
  async execute(
    input: ScanServerHostKeyInput,
  ): Promise<{ fingerprint: string; algorithm: string }> {
    try {
      const { fingerprint, algorithm } = await scanHostKey(
        input.ipAddress,
        input.port,
      );
      return { fingerprint, algorithm };
    } catch (error) {
      throw new Error(
        `Failed to scan SSH host key: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
