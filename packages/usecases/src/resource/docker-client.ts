import { spawn } from "node:child_process";
import net from "node:net";
import Docker from "dockerode";

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
