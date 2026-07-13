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

    const executeCommand = (cmd: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
          if (err) return reject(err);
          let stdout = "";
          let stderr = "";
          stream.on("close", (code: number | null) => {
            if (code !== 0) {
              reject(
                new Error(
                  `Command failed with code ${code}. Stderr: ${stderr}`,
                ),
              );
            } else {
              resolve(stdout);
            }
          });
          stream.on("data", (data: Buffer | string) => {
            stdout += data.toString();
          });
          stream.stderr.on("data", (data: Buffer | string) => {
            stderr += data.toString();
          });
        });
      });
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
      const remoteSwarmStatus = await executeCommand(
        `${sudo ? `${sudo} ` : ""}docker info --format '{{.Swarm.LocalNodeState}}'`,
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
      } else {
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

        await executeCommand(
          `${sudo ? `${sudo} ` : ""}docker swarm join --token ${joinToken} ${formatSwarmEndpoint(managerAddress)}`,
        );
      }

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
    } catch (err: any) {
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

function toSetupErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/authentication methods failed|client-authentication/i.test(message)) {
    return "SSH authentication failed. Verify the selected private key matches the public key in the remote user's ~/.ssh/authorized_keys, and confirm the username and port.";
  }
  if (/passwordless sudo/i.test(message)) return message;
  if (/timed out|connect/i.test(message)) {
    return `${message} Verify that the host is reachable and its SSH port is open from the Upstand server.`;
  }
  return message;
}
