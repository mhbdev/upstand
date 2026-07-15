import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export const DockerCleanupActionSchema = z.enum([
  "images",
  "volumes",
  "containers",
  "builder",
  "system",
  "all",
]);
export type DockerCleanupAction = z.infer<typeof DockerCleanupActionSchema>;

const ACTION_ARGS: Record<Exclude<DockerCleanupAction, "all">, string[]> = {
  images: ["image", "prune", "--all", "--force"],
  volumes: ["volume", "prune", "--all", "--force"],
  containers: ["container", "prune", "--force"],
  builder: ["builder", "prune", "--all", "--force"],
  system: ["system", "prune", "--all", "--force"],
};

const ALL_ACTIONS: Array<Exclude<DockerCleanupAction, "all">> = [
  "containers",
  "images",
  "volumes",
  "builder",
  "system",
];

type CommandResult = { stdout: string; stderr: string };
type CommandExecutor = (
  args: string[],
  environment: Record<string, string | undefined>,
) => Promise<CommandResult>;

async function executeDocker(
  args: string[],
  environment: Record<string, string | undefined>,
): Promise<CommandResult> {
  return execFileAsync("docker", args, {
    env: { ...process.env, ...environment },
    maxBuffer: 2 * 1024 * 1024,
  });
}

export class DockerCleanupService {
  constructor(private readonly execute: CommandExecutor = executeDocker) {}

  async run(
    action: DockerCleanupAction,
    environment: Record<string, string | undefined> = {},
  ): Promise<{ action: DockerCleanupAction; output: string[] }> {
    const parsed = DockerCleanupActionSchema.parse(action);
    const actions = parsed === "all" ? ALL_ACTIONS : [parsed];
    const output: string[] = [];
    for (const current of actions) {
      const result = await this.execute(ACTION_ARGS[current], environment);
      output.push(
        `${current}: ${[result.stdout, result.stderr]
          .filter(Boolean)
          .join("\n")
          .trim()}`,
      );
    }
    return { action: parsed, output };
  }
}
