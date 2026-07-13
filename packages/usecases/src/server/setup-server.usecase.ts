import type { IUnitOfWork, Server } from "@upstand/domain";
import { decryptSecret } from "@upstand/domain/crypto/secret-box";
import { log } from "evlog";
import { Client } from "ssh2";
import { z } from "zod";
import { createRemoteDocker } from "../resource/docker-client";
import { CaddyService } from "../web-server/caddy.service";

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

      // 2. Remote deployment servers are independent Docker environments.
      // They must not join the control-plane Swarm. This mirrors Dokploy's
      // remote-server model and keeps each server's scheduler and networking
      // isolated from the control plane.
      log.info({
        message: `[Server Setup] Checking Swarm status on ${server.ipAddress}`,
      });
      const remoteDockerPrefix = sudo ? `${sudo} ` : "";
      const remoteSwarmStatus = await executeCommand(
        `${remoteDockerPrefix}docker info --format '{{.Swarm.LocalNodeState}}'`,
      )
        .then((status) => status.trim())
        .catch(() => "inactive");

      if (remoteSwarmStatus !== "active") {
        log.info({
          message: `[Server Setup] Initializing an independent Docker Swarm on ${server.ipAddress}...`,
        });
        await privileged(
          `docker swarm init --advertise-addr ${shellQuote(server.ipAddress)}`,
        );
      }

      await privileged(
        "docker network inspect upstand-network >/dev/null 2>&1 || docker network create --driver overlay --attachable upstand-network",
      );

      const remoteDocker = createRemoteDocker({
        host: server.ipAddress,
        port: server.port,
        username: server.username,
        privateKey,
      });
      const remoteInfo = await remoteDocker.info();
      if (remoteInfo.Swarm?.LocalNodeState !== "active") {
        throw new Error(
          `Remote Docker Swarm is not active after initialization (state: ${remoteInfo.Swarm?.LocalNodeState ?? "unknown"}).`,
        );
      }

      // Caddy is installed on every deployment server, just like Dokploy's
      // Traefik instance. Resource routing is synchronized during deployment.
      await new CaddyService(remoteDocker).initializeCaddy();

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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
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
