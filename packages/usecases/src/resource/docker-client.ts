import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Docker from "dockerode";
import type { IUnitOfWork, Resource } from "@upstand/domain";
import { decryptSecret } from "@upstand/domain/crypto/secret-box";
import { DockerService } from "./docker.service";
import { CaddyService } from "../web-server/caddy.service";

let proxyStarted = false;
const PROXY_PORT = 23775;

export function getDockerInstance(): Docker {
  const isWindows = process.platform === "win32";
  const isBun = typeof (process as any).versions.bun !== "undefined";

  if (isWindows && isBun) {
    ensureDockerProxy();
    return new Docker({ host: "127.0.0.1", port: PROXY_PORT });
  }

  return new Docker();
}

export interface RemoteDockerConnection {
  host: string;
  port: number;
  username: string;
  privateKey: string;
}

/**
 * Creates a Docker API client for an independently managed deployment server.
 * Remote servers are not Swarm workers of the control-plane node; Docker's
 * SSH transport keeps the daemon socket private while retaining the Docker API.
 */
export function createRemoteDocker(connection: RemoteDockerConnection): Docker {
  return new Docker({
    host: connection.host,
    port: connection.port,
    username: connection.username,
    protocol: "ssh",
    // dockerode's type definition omits sshOptions although the runtime
    // supports it. Keep the cast local to this adapter.
    ...({
      sshOptions: { privateKey: connection.privateKey },
    } as unknown as Record<string, unknown>),
  });
}

export function createRemoteDockerCliEnvironment(
  connection: RemoteDockerConnection,
): { environment: NodeJS.ProcessEnv; cleanup: () => void } {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "upstand-docker-"));
  const sshDirectory = path.join(home, ".ssh");
  const keyPath = path.join(sshDirectory, "id_deployment");
  fs.mkdirSync(sshDirectory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyPath, `${connection.privateKey.trim()}\n`, {
    mode: 0o600,
  });
  fs.writeFileSync(
    path.join(sshDirectory, "config"),
    [
      "Host upstand-deployment",
      `HostName ${connection.host}`,
      `Port ${connection.port}`,
      `User ${connection.username}`,
      `IdentityFile ${keyPath}`,
      "StrictHostKeyChecking accept-new",
      "LogLevel ERROR",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  return {
    environment: {
      ...process.env,
      DOCKER_HOST: "ssh://upstand-deployment",
      HOME: home,
    } as NodeJS.ProcessEnv,
    cleanup: () => fs.rmSync(home, { recursive: true, force: true }),
  };
}

export async function resolveDockerServiceForServer(
  serverId: string | null | undefined,
  uow: IUnitOfWork,
  defaultDockerService: DockerService,
): Promise<{ dockerService: DockerService; cleanup: () => void }> {
  if (!serverId || serverId === "local" || serverId === "manager") {
    return { dockerService: defaultDockerService, cleanup: () => {} };
  }

  const server = await uow.serverRepository.findById(serverId);
  if (!server) {
    throw new Error(`Deployment server not found: ${serverId}`);
  }

  if (!server.sshKeyId) {
    throw new Error(`Target deployment server has no SSH key configured`);
  }

  const sshKey = await uow.sshKeyRepository.findById(server.sshKeyId);
  if (!sshKey) {
    throw new Error(`Target deployment server SSH key not found`);
  }

  const privateKey = decryptSecret({
    ciphertext: sshKey.privateKeyCiphertext,
    iv: sshKey.privateKeyIv,
    authTag: sshKey.privateKeyAuthTag,
    keyVersion: sshKey.privateKeyVersion,
  });

  const connection = {
    host: server.ipAddress,
    port: server.port,
    username: server.username,
    privateKey,
  };

  const remoteDocker = createRemoteDocker(connection);
  const remoteCli = createRemoteDockerCliEnvironment(connection);

  const dockerService = new DockerService(remoteDocker, remoteCli.environment);
  return {
    dockerService,
    cleanup: remoteCli.cleanup,
  };
}

export async function resolveServicesForResource(
  resource: Resource,
  uow: IUnitOfWork,
  defaultDockerService: DockerService,
  defaultCaddyService: CaddyService,
): Promise<{
  dockerService: DockerService;
  caddyService: CaddyService;
  cleanup: () => void;
}> {
  const serverId = resource.serverId;
  if (!serverId || serverId === "local" || serverId === "manager") {
    return {
      dockerService: defaultDockerService,
      caddyService: defaultCaddyService,
      cleanup: () => {},
    };
  }

  const server = await uow.serverRepository.findById(serverId);
  if (!server) {
    throw new Error(`Deployment server not found for resource ${resource.id}`);
  }

  if (!server.sshKeyId) {
    throw new Error(`Target deployment server has no SSH key configured`);
  }

  const sshKey = await uow.sshKeyRepository.findById(server.sshKeyId);
  if (!sshKey) {
    throw new Error(`Target deployment server SSH key not found`);
  }

  const privateKey = decryptSecret({
    ciphertext: sshKey.privateKeyCiphertext,
    iv: sshKey.privateKeyIv,
    authTag: sshKey.privateKeyAuthTag,
    keyVersion: sshKey.privateKeyVersion,
  });

  const connection = {
    host: server.ipAddress,
    port: server.port,
    username: server.username,
    privateKey,
  };

  const remoteDocker = createRemoteDocker(connection);
  const remoteCli = createRemoteDockerCliEnvironment(connection);

  const dockerService = new DockerService(remoteDocker, remoteCli.environment);
  const caddyService = new CaddyService(remoteDocker);
  return {
    dockerService,
    caddyService,
    cleanup: remoteCli.cleanup,
  };
}

function ensureDockerProxy() {
  if (proxyStarted) return;

  const client = new net.Socket();
  client.connect(PROXY_PORT, "127.0.0.1", () => {
    proxyStarted = true;
    client.destroy();
  });

  client.on("error", () => {
    // Start proxy
    const code = `
      const net = require("net");
      const PIPE_PATH = "//./pipe/docker_engine";
      const PORT = ${PROXY_PORT};
      const server = net.createServer((socket) => {
        const pipe = net.connect(PIPE_PATH);
        socket.pipe(pipe);
        pipe.pipe(socket);
        socket.on("error", () => {});
        pipe.on("error", () => {});
      });
      server.listen(PORT, "127.0.0.1");
    `;

    const child = spawn("node", ["-e", code], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    proxyStarted = true;
  });
}
