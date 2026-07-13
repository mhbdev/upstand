import { z } from "zod";

export const TestDockerRegistryConnectionInputSchema = z.object({
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  registryUrl: z.string().optional().nullable(),
});

export type TestDockerRegistryConnectionInput = z.infer<
  typeof TestDockerRegistryConnectionInputSchema
>;

export class TestDockerRegistryConnectionUseCase {
  async execute(
    input: TestDockerRegistryConnectionInput,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const url = input.registryUrl || "https://index.docker.io/v2/";
      const response = await fetch(url, {
        headers:
          input.username && input.password
            ? {
                Authorization: `Basic ${Buffer.from(
                  `${input.username}:${input.password}`,
                ).toString("base64")}`,
              }
            : {},
      });
      if (response.status === 200 || response.status === 401) {
        return {
          success: true,
          message: `Successfully connected to Docker registry at ${url}. Response status: ${response.status}`,
        };
      }
      throw new Error(`Registry returned status code ${response.status}`);
    } catch (err: any) {
      return {
        success: false,
        message: err.message || "Failed to connect to registry",
      };
    }
  }
}
