import type { IUnitOfWork } from "@upstand/domain";
import { decryptSecret } from "@upstand/domain/crypto/secret-box";
import { log } from "evlog";
import { Client } from "ssh2";
import { z } from "zod";
import { getDockerInstance } from "../resource/docker-client";
import {
  formatSwarmEndpoint,
  requireActiveManager,
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
    });

    // Decrypt the private key
    const privateKey = decryptSecret({
      ciphertext: sshKey.privateKeyCiphertext,
      iv: sshKey.privateKeyIv,
      authTag: sshKey.privateKeyAuthTag,
      keyVersion: sshKey.privateKeyVersion,
    });

    // Start setup asynchronously in background so we don't block the API response
    this.runSetup(server, privateKey).catch((err) => {
      log.error({
        message: `Failed to set up server ${server.name}`,
        err: err.message,
      });
    });

    return {
      success: true,
      message: "Server setup initiated in the background.",
    };
  }

  private async runSetup(server: any, privateKey: string): Promise<void> {
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
        await executeCommand("curl -fsSL https://get.docker.com | sh");
      }

      await executeCommand("systemctl enable docker && systemctl start docker");

      // 2. Swarm node join
      log.info({
        message: `[Server Setup] Checking Swarm status on ${server.ipAddress}`,
      });
      const remoteSwarmStatus = await executeCommand(
        "docker info --format '{{.Swarm.LocalNodeState}}'",
      )
        .then((status) => status.trim())
        .catch(() => "inactive");

      const localDocker = getDockerInstance();
      const localInfo = await requireActiveManager(localDocker);
      const swarmInspect = await localDocker.swarmInspect();

      if (remoteSwarmStatus === "active") {
        const remoteClusterId = await executeCommand(
          "docker info --format '{{.Swarm.Cluster.ID}}'",
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
        const managerAddress = localInfo.Swarm?.NodeAddr;

        if (!joinToken || !managerAddress) {
          throw new Error(
            "The Swarm manager did not provide a worker join command.",
          );
        }

        await executeCommand(
          `docker swarm join --token ${joinToken} ${formatSwarmEndpoint(managerAddress)}`,
        );
      }

      log.info({
        message: `[Server Setup] Server ${server.name} set up successfully.`,
      });
      await this.uow.serverRepository.updateById(server.id, {
        status: "ready",
      });
    } catch (err: any) {
      log.error({
        message: `[Server Setup] Error setting up server ${server.name}: ${err.message}`,
      });
      await this.uow.serverRepository.updateById(server.id, {
        status: "failed",
      });
    } finally {
      conn.end();
    }
  }
}
