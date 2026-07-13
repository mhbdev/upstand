import type { IUnitOfWork, Server } from "@upstand/domain";
import { decryptSecret } from "@upstand/domain/crypto/secret-box";
import { log } from "evlog";
import { Client } from "ssh2";
import { z } from "zod";
import { getDockerInstance } from "../resource/docker-client";
import {
  formatSwarmEndpoint,
  requireActiveManager,
  validateSwarmAddress,
} from "../swarm/swarm.helpers";

const SWARM_JOIN_POLL_ATTEMPTS = 12;
const SWARM_JOIN_POLL_INTERVAL_MS = 2500;

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export const SetupServerInputSchema = z.object({
  id: z.string().min(1, "Server ID is required"),
});

export type SetupServerInput = z.infer<typeof SetupServerInputSchema>;

export class SetupServerUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(
    input: SetupServerInput,
  ): Promise<{ success: boolean; message: string }> {
    const server = await this.uow.serverRepository.findById(input.id);
    if (!server) {
      throw new Error("Server not found");
    }

    if (!server.sshKeyId) {
      throw new Error("Server does not have an SSH Key configured");
    }

    const sshKey = await this.uow.sshKeyRepository.findById(server.sshKeyId);
    if (!sshKey) {
      throw new Error("Configured SSH Key not found");
    }

    // Update status to setting_up
    await this.uow.serverRepository.updateById(server.id, {
      status: "setting_up",
      setupError: null,
    });

    // Decrypt the private key
    const privateKey = decryptSecret({
      ciphertext: sshKey.privateKeyCiphertext,
      iv: sshKey.privateKeyIv,
      authTag: sshKey.privateKeyAuthTag,
      keyVersion: sshKey.privateKeyVersion,
    });

    return this.runSetup(server, privateKey);
  }

  private async runSetup(
    server: Server,
    privateKey: string,
  ): Promise<{ success: boolean; message: string }> {
    const conn = new Client();

    const executeCommandResult = (cmd: string): Promise<CommandResult> => {
      return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
          if (err) return reject(err);
          let stdout = "";
          let stderr = "";
          stream.on("close", (code: number | null) => {
            resolve({ code, stdout, stderr });
          });
          stream.on("error", reject);
          stream.on("data", (data: Buffer | string) => {
            stdout += data.toString();
          });
          stream.stderr.on("data", (data: Buffer | string) => {
            stderr += data.toString();
          });
        });
      });
    };
    const executeCommand = async (cmd: string): Promise<string> => {
      const result = await executeCommandResult(cmd);
      if (result.code !== 0) {
        throw new Error(
          `Command failed with code ${result.code}. Stderr: ${result.stderr.trim()}`,
        );
      }
      return result.stdout;
    };

    try {
      await new Promise<void>((resolve, reject) => {
        conn.on("ready", resolve).on("error", reject).connect({
          host: server.ipAddress,
          port: server.port,
          username: server.username,
          privateKey: privateKey,
          readyTimeout: 20000,
        });
      });

      let sudo: string;
      try {
        sudo = (
          await executeCommand(
            "if [ \"$(id -u)\" -eq 0 ]; then printf ''; elif sudo -n true 2>/dev/null; then printf 'sudo '; else exit 1; fi",
          )
        ).trim();
      } catch {
        throw new Error(
          "The SSH user is not root and does not have passwordless sudo access.",
        );
      }
      const privileged = (command: string) =>
        executeCommand(`${sudo ? `${sudo} ` : ""}${command}`);

      // 1. Install Docker if not present
      log.info({
        message: `[Server Setup] Checking Docker installation on ${server.ipAddress}`,
      });
      try {
        await executeCommand("docker --version");
      } catch {
        log.info({
          message: `[Server Setup] Docker not found on ${server.ipAddress}. Installing Docker...`,
        });
        await executeCommand(
          `curl -fsSL https://get.docker.com | ${sudo ? `${sudo} ` : ""}sh`,
        );
      }

      await privileged("systemctl enable --now docker");

      // 2. Swarm node join
      log.info({
        message: `[Server Setup] Checking Swarm status on ${server.ipAddress}`,
      });
      const remoteDockerPrefix = sudo ? `${sudo} ` : "";
      const remoteSwarmStatus = await executeCommand(
        `${remoteDockerPrefix}docker info --format '{{.Swarm.LocalNodeState}}'`,
      )
        .then((status) => status.trim())
        .catch(() => "inactive");

      const localDocker = getDockerInstance();
      const localInfo = await requireActiveManager(localDocker);
      const swarmInspect = await localDocker.swarmInspect();

      if (remoteSwarmStatus === "active") {
        const remoteClusterId = await executeCommand(
          `${sudo ? `${sudo} ` : ""}docker info --format '{{.Swarm.Cluster.ID}}'`,
        ).then((clusterId) => clusterId.trim());

        if (!remoteClusterId || remoteClusterId !== swarmInspect.ID) {
          throw new Error(
            "Remote server already belongs to a different Docker Swarm cluster. Leave that cluster explicitly before adding it to this one.",
          );
        }
      } else if (remoteSwarmStatus !== "pending") {
        log.info({
          message: `[Server Setup] Joining ${server.ipAddress} to the Docker Swarm cluster...`,
        });
        const joinToken = swarmInspect.JoinTokens.Worker;
        const managerAddress = validateSwarmAddress(
          localInfo.Swarm?.NodeAddr ?? "",
          "Swarm manager address",
        );

        if (!joinToken) {
          throw new Error(
            "The Swarm manager did not provide a worker join command.",
          );
        }

        const joinResult = await executeCommandResult(
          `${remoteDockerPrefix}docker swarm join --token ${joinToken} ${formatSwarmEndpoint(managerAddress)}`,
        );

        if (joinResult.code !== 0) {
          log.info({
            message: `[Server Setup] Docker reported that the Swarm join is continuing asynchronously on ${server.ipAddress}. Waiting for the daemon to become active.`,
          });
        }
      }

      const managerEndpoint = formatSwarmEndpoint(
        validateSwarmAddress(
          localInfo.Swarm?.NodeAddr ?? "",
          "Swarm manager address",
        ),
      );
      await waitForSwarmJoin(
        executeCommandResult,
        remoteDockerPrefix,
        swarmInspect.ID,
        managerEndpoint,
      );

      log.info({
        message: `[Server Setup] Server ${server.name} set up successfully.`,
      });
      await this.uow.serverRepository.updateById(server.id, {
        status: "ready",
        setupError: null,
      });
      return {
        success: true,
        message: "Remote server connected and configured successfully.",
      };
    } catch (err: unknown) {
      const message = toSetupErrorMessage(err);
      log.error({
        message: `[Server Setup] Error setting up server ${server.name}: ${message}`,
      });
      await this.uow.serverRepository.updateById(server.id, {
        status: "failed",
        setupError: message,
      });
      throw new Error(message);
    } finally {
      conn.end();
    }
  }
}

async function waitForSwarmJoin(
  executeCommandResult: (command: string) => Promise<CommandResult>,
  dockerPrefix: string,
  expectedClusterId: string,
  managerEndpoint: string,
): Promise<void> {
  let lastStatus = "unknown";
  let lastError = "";

  for (let attempt = 0; attempt < SWARM_JOIN_POLL_ATTEMPTS; attempt += 1) {
    const result = await executeCommandResult(
      `${dockerPrefix}docker info --format '{{.Swarm.LocalNodeState}}|{{.Swarm.Cluster.ID}}'`,
    );

    if (result.code === 0) {
      const [state, clusterId] = result.stdout.trim().split("|");
      lastStatus = state || "inactive";

      if (state === "active" && clusterId === expectedClusterId) {
        return;
      }

      if (state === "active" && clusterId && clusterId !== expectedClusterId) {
        throw new Error(
          "Remote server joined a different Docker Swarm cluster. Leave that cluster explicitly before adding it to this one.",
        );
      }
    } else {
      lastError = result.stderr.trim() || result.stdout.trim();
    }

    if (attempt < SWARM_JOIN_POLL_ATTEMPTS - 1) {
      await delay(SWARM_JOIN_POLL_INTERVAL_MS);
    }
  }

  const details = lastError ? ` Docker reported: ${lastError}` : "";
  throw new Error(
    `Docker Swarm join did not complete within ${Math.round((SWARM_JOIN_POLL_ATTEMPTS * SWARM_JOIN_POLL_INTERVAL_MS) / 1000)} seconds (last state: ${lastStatus}). Ensure ${managerEndpoint} is reachable from the remote host on TCP 2377 and that the manager advertises a routable address.${details}`,
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function toSetupErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/already part of a swarm/i.test(message)) {
    return "This server is already part of a Docker Swarm. Upstand will not force it to leave an existing cluster. Leave that swarm explicitly on the server, then retry setup.";
  }
  if (/different Docker Swarm cluster/i.test(message)) {
    return "This server belongs to a different Docker Swarm cluster. Leave that cluster explicitly on the server, then retry setup.";
  }
  if (/authentication methods failed|client-authentication/i.test(message)) {
    return "SSH authentication failed. Verify the selected private key matches the public key in the remote user's ~/.ssh/authorized_keys, and confirm the username and port.";
  }
  if (/passwordless sudo/i.test(message)) return message;
  if (/timed out|timeout|connect/i.test(message)) {
    return `${message} Verify that the host is reachable and its SSH port is open from the Upstand server.`;
  }
  return message;
}
