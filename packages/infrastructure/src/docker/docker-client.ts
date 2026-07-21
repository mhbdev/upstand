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
import { Client } from "ssh2";
import { CaddyService } from "../caddy/caddy.service";
import { DockerService } from "./docker.service";

let proxyStarted = false;
const PROXY_PORT = 23775;
// Port range for remote Docker SSH proxies on Windows (Unix sockets unsupported).
let nextRemoteProxyPort = 23776;
type RemoteProxyEntry = { socketPath: string } | { host: string; port: number };
const remoteDockerProxies = new Map<string, RemoteProxyEntry>();

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
  const entry = ensureRemoteDockerProxy(connection);
  return "socketPath" in entry
    ? new Docker({ socketPath: entry.socketPath })
    : new Docker({ host: entry.host, port: entry.port });
}

function ensureRemoteDockerProxy(
  connection: RemoteDockerConnection,
): RemoteProxyEntry {
  const trustedFingerprint = connection.hostKeyFingerprint;
  if (!trustedFingerprint) {
    throw new Error("Remote Docker SSH host key is not trusted");
  }
  const key = createHash("sha256")
    .update(
      `${connection.host}:${connection.port}:${connection.username}:${connection.privateKey}`,
    )
    .digest("hex");
  const existing = remoteDockerProxies.get(key);
  if (existing) return existing;

  // Build the per-connection SSH-tunnel proxy server. Each incoming TCP/socket
  // connection opens a fresh SSH session and pipes data through
  // `docker system dial-stdio` so dockerode can speak the Docker HTTP API.
  const proxy = net.createServer((socket) => {
    const bufferedChunks: Buffer[] = [];
    let streamReady = false;
    let targetStream: any = null;

    socket.on("data", (chunk) => {
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : typeof chunk === "string"
          ? Buffer.from(chunk)
          : Buffer.from(chunk as any);
      if (streamReady && targetStream) {
        targetStream.write(buf);
      } else {
        bufferedChunks.push(buf);
      }
    });

    socket.on("end", () => {
      if (targetStream) targetStream.end();
    });

    const client = new Client();
    const fail = () => {
      client.end();
      socket.destroy();
    };
    client
      .once("ready", () => {
        client.exec("docker system dial-stdio", (error, stream) => {
          if (error) return fail();
          targetStream = stream;
          for (const chunk of bufferedChunks) {
            stream.write(chunk);
          }
          bufferedChunks.length = 0;
          streamReady = true;

          stream.on("data", (chunk: Buffer) => {
            socket.write(chunk);
          });
          stream.once("end", () => {
            socket.end();
          });
          stream.once("close", () => {
            socket.end();
            client.end();
          });
          stream.once("error", fail);
        });
      })
      .once("error", fail)
      .connect({
        host: connection.host.replace(/^ssh:\/\//, ""),
        port: connection.port,
        username: connection.username,
        privateKey: connection.privateKey,
        hostHash: "sha256",
        hostVerifier: hostVerifierForFingerprint(trustedFingerprint),
      });
    socket.once("error", fail);
  });

  // Windows does not support Unix-domain sockets on arbitrary file paths.
  // Use a local TCP port instead so dockerode can reach the SSH tunnel proxy.
  if (process.platform === "win32") {
    const localPort = nextRemoteProxyPort++;
    proxy.once("error", () => {
      remoteDockerProxies.delete(key);
    });
    proxy.listen(localPort, "127.0.0.1");
    const entry: RemoteProxyEntry = { host: "127.0.0.1", port: localPort };
    remoteDockerProxies.set(key, entry);
    return entry;
  }

  const socketPath = path.join(os.tmpdir(), `upstand-docker-${key}.sock`);
  fs.rmSync(socketPath, { force: true });
  proxy.once("error", () => {
    remoteDockerProxies.delete(key);
    fs.rmSync(socketPath, { force: true });
  });
  proxy.listen(socketPath);
  const entry: RemoteProxyEntry = { socketPath };
  remoteDockerProxies.set(key, entry);
  return entry;
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

  if (!scan.error && scan.stdout.trim()) {
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
  }

  const fallback = scanHostKeyWithSsh2Sync(
    connection.host,
    connection.port,
    trustedFingerprint,
  );
  if (fallback) {
    return fallback;
  }

  throw new Error(
    `The SSH host key for ${connection.host}:${connection.port} does not match its trusted fingerprint`,
  );
}

function scanHostKeyWithSsh2Sync(
  host: string,
  port: number,
  expectedFp: string,
): string | null {
  const hostKeyModule = path
    .resolve(__dirname, "../../platform/src/ssh/host-key")
    .replace(/\\/g, "/");

  const code = `
const { Client } = require("ssh2");
const crypto = require("crypto");
let verifyHostKeyFingerprint;
try {
  verifyHostKeyFingerprint = require("${hostKeyModule}").verifyHostKeyFingerprint;
} catch {
  verifyHostKeyFingerprint = (exp, rec) => exp.trim().replace(/=+$/, "") === rec.trim().replace(/=+$/, "");
}

const host = process.env.TARGET_HOST;
const port = parseInt(process.env.TARGET_PORT || "22", 10);
const expectedFp = process.env.EXPECTED_FP;

const conn = new Client();
conn.connect({
  host,
  port,
  username: "root",
  hostVerifier: (keyBuf) => {
    try {
      const algLen = keyBuf.readUInt32BE(0);
      const algorithm = keyBuf.subarray(4, 4 + algLen).toString("utf8");
      const encodedKey = keyBuf.toString("base64");
      const fp = "SHA256:" + crypto.createHash("sha256").update(keyBuf).digest("base64");
      if (verifyHostKeyFingerprint(expectedFp, fp)) {
        console.log("upstand-deployment " + algorithm + " " + encodedKey);
        process.exit(0);
      }
    } catch (e) {}
    process.exit(1);
  }
}).on("error", () => process.exit(1));
`;

  const nodeModulesPath =
    path.resolve(__dirname, "../../../node_modules") +
    path.delimiter +
    path.resolve(__dirname, "../../node_modules");

  const res = spawnSync("node", ["-e", code], {
    encoding: "utf8",
    timeout: 12_000,
    env: {
      ...process.env,
      NODE_PATH: nodeModulesPath,
      TARGET_HOST: host,
      TARGET_PORT: String(port),
      EXPECTED_FP: expectedFp,
    },
  });

  if (res.status === 0 && res.stdout.trim()) {
    return res.stdout.trim() + "\n";
  }
  return null;
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

    // Synchronously wait for the proxy to start listening (up to 2 seconds)
    const checkCode = `
      const net = require("net");
      const PORT = ${PROXY_PORT};
      let attempts = 0;
      function check() {
        const socket = new net.Socket();
        socket.connect(PORT, "127.0.0.1", () => {
          socket.destroy();
          process.exit(0);
        });
        socket.on("error", () => {
          attempts++;
          if (attempts > 50) {
            process.exit(1);
          }
          setTimeout(check, 20);
        });
      }
      check();
    `;
    spawnSync(process.execPath, ["-e", checkCode], { timeout: 2000 });
    proxyStarted = true;
  });
}
