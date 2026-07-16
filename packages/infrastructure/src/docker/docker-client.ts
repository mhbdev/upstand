import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { IUnitOfWork, Resource } from "@upstand/domain";
import { decryptSecret } from "@upstand/platform/crypto/secret-box";
import {
  hostVerifierForFingerprint,
  verifyHostKeyFingerprint,
} from "@upstand/platform/ssh/host-key";
import type { DockerInfrastructureResolverPort } from "@upstand/usecases/ports/docker";
import Docker from "dockerode";
import { CaddyService } from "../caddy/caddy.service";
import { DockerService } from "./docker.service";

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
  hostKeyFingerprint?: string;
}

/**
 * Creates a Docker API client for an independently managed deployment server.
 * Remote servers are not Swarm workers of the control-plane node; Docker's
 * SSH transport keeps the daemon socket private while retaining the Docker API.
 */
export function createRemoteDocker(connection: RemoteDockerConnection): Docker {
  if (!connection.hostKeyFingerprint) {
    throw new Error("Remote Docker SSH host key is not trusted");
  }
  return new Docker({
    host: connection.host.replace(/^ssh:\/\//, ""),
    port: connection.port,
    username: connection.username,
    protocol: "ssh",
    // dockerode's type definition omits sshOptions although the runtime
    // supports it. Keep the cast local to this adapter.
    ...({
      sshOptions: {
        privateKey: connection.privateKey,
        hostHash: "sha256",
        hostVerifier: hostVerifierForFingerprint(connection.hostKeyFingerprint),
      },
    } as unknown as Record<string, unknown>),
  });
}

export function createRemoteDockerCliEnvironment(
  connection: RemoteDockerConnection,
): {
  environment: Record<string, string | undefined>;
  cleanup: () => void;
} {
  if (!connection.hostKeyFingerprint) {
    throw new Error("Remote Docker SSH host key is not trusted");
  }
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "upstand-docker-"));
  const sshDirectory = path.join(home, ".ssh");
  const keyPath = path.join(sshDirectory, "id_deployment");
  fs.mkdirSync(sshDirectory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyPath, `${connection.privateKey.trim()}\n`, {
    mode: 0o600,
  });
  fs.writeFileSync(
    path.join(sshDirectory, "known_hosts"),
    getTrustedKnownHostsEntry(connection),
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(sshDirectory, "config"),
    [
      "Host upstand-deployment",
      `HostName ${connection.host}`,
      `Port ${connection.port}`,
      `User ${connection.username}`,
      `IdentityFile ${keyPath}`,
      "StrictHostKeyChecking yes",
      "LogLevel ERROR",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  return {
    environment: {
      DOCKER_HOST: "ssh://upstand-deployment",
      HOME: home,
    },
    cleanup: () => fs.rmSync(home, { recursive: true, force: true }),
  };
}

function getTrustedKnownHostsEntry(connection: RemoteDockerConnection): string {
  const trustedFingerprint = connection.hostKeyFingerprint;
  if (!trustedFingerprint) {
    throw new Error("Remote Docker SSH host key is not trusted");
  }

  const scan = spawnSync(
    "ssh-keyscan",
    ["-T", "10", "-p", String(connection.port), connection.host],
    { encoding: "utf8", timeout: 12_000 },
  );

  if (scan.error || scan.status !== 0) {
    throw new Error(
      `Could not read the SSH host key for ${connection.host}:${connection.port}`,
    );
  }

  for (const line of scan.stdout.split("\n")) {
    const [host, algorithm, encodedKey] = line.trim().split(/\s+/, 3);
    if (!host || !algorithm || !encodedKey) continue;
    const fingerprint = `SHA256:${createHash("sha256")
      .update(Buffer.from(encodedKey, "base64"))
      .digest("base64")
      .replace(/=+$/, "")}`;
    if (verifyHostKeyFingerprint(trustedFingerprint, fingerprint)) {
      return `upstand-deployment ${algorithm} ${encodedKey}\n`;
    }
  }

  throw new Error(
    `The SSH host key for ${connection.host}:${connection.port} does not match its trusted fingerprint`,
  );
}

export async function resolveDockerCliEnvironmentForServer(
  serverId: string | null | undefined,
  uow: IUnitOfWork,
): Promise<{
  environment: Record<string, string | undefined>;
  cleanup: () => void;
}> {
  if (!serverId || serverId === "local" || serverId === "manager") {
    return { environment: {}, cleanup: () => {} };
  }

  const server = await uow.serverRepository.findById(serverId);
  // If the server is not in the registry, fall back to local Docker socket.
  // This handles stale Swarm node IDs stored before the "local" sentinel fix.
  if (!server) return { environment: {}, cleanup: () => {} };
  if (!server.sshKeyId) {
    throw new Error("Target deployment server has no SSH key configured");
  }
  const sshKey = await uow.sshKeyRepository.findById(server.sshKeyId);
  if (!sshKey) throw new Error("Target deployment server SSH key not found");
  const privateKey = decryptSecret({
    ciphertext: sshKey.privateKeyCiphertext,
    iv: sshKey.privateKeyIv,
    authTag: sshKey.privateKeyAuthTag,
    keyVersion: sshKey.privateKeyVersion,
  });
  return createRemoteDockerCliEnvironment({
    host: server.ipAddress,
    port: server.port,
    username: server.username,
    privateKey,
    hostKeyFingerprint: server.sshHostKeyFingerprint ?? undefined,
  });
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
    // If the server is not in the registry, fall back to local Docker socket.
    // This handles stale Swarm node IDs stored before the "local" sentinel fix.
    return { dockerService: defaultDockerService, cleanup: () => {} };
  }

  if (!server.sshKeyId) {
    throw new Error("Target deployment server has no SSH key configured");
  }

  const sshKey = await uow.sshKeyRepository.findById(server.sshKeyId);
  if (!sshKey) {
    throw new Error("Target deployment server SSH key not found");
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
    hostKeyFingerprint: server.sshHostKeyFingerprint ?? undefined,
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
    // The serverId was not found in the server table — this can happen when a
    // resource was previously assigned the raw Swarm node ID instead of "local".
    // Fall back to the local Docker socket to avoid a hard crash.
    return {
      dockerService: defaultDockerService,
      caddyService: defaultCaddyService,
      cleanup: () => {},
    };
  }

  if (!server.sshKeyId) {
    throw new Error("Target deployment server has no SSH key configured");
  }

  const sshKey = await uow.sshKeyRepository.findById(server.sshKeyId);
  if (!sshKey) {
    throw new Error("Target deployment server SSH key not found");
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
    hostKeyFingerprint: server.sshHostKeyFingerprint ?? undefined,
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

export function createDockerInfrastructureResolver(): DockerInfrastructureResolverPort {
  return {
    resolveDockerServiceForServer,
    resolveDockerCliEnvironmentForServer,
    resolveServicesForResource,
    createRemoteServices(connection) {
      const remoteDocker = createRemoteDocker(connection);
      const cli = createRemoteDockerCliEnvironment(connection);
      return {
        docker: remoteDocker,
        dockerService: new DockerService(remoteDocker, cli.environment),
        caddyService: new CaddyService(remoteDocker),
        cli,
        info: () => remoteDocker.info(),
      };
    },
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

    const child = spawn(process.execPath, ["-e", code], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    proxyStarted = true;
  });
}
