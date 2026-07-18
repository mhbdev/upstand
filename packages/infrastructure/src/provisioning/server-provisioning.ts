import { hostVerifierForFingerprint } from "@upstand/platform/ssh/host-key";
import type { ServerProvisioningPort } from "@upstand/usecases";
import { Client } from "ssh2";
import { CaddyService } from "../caddy/caddy.service";
import { createRemoteDocker } from "../docker/docker-client";

export function createServerProvisioningPort(): ServerProvisioningPort {
  return {
    connect: async ({ server, privateKey, hostKeyFingerprint }) => {
      const client = new Client();
      await new Promise<void>((resolve, reject) => {
        client
          .once("ready", resolve)
          .once("error", reject)
          .connect({
            host: server.ipAddress,
            port: server.port,
            username: server.username,
            privateKey,
            hostHash: "sha256",
            hostVerifier: hostVerifierForFingerprint(hostKeyFingerprint),
            readyTimeout: 20_000,
          });
      });

      const connection = {
        host: server.ipAddress,
        port: server.port,
        username: server.username,
        privateKey,
        hostKeyFingerprint,
      };
      const remoteDocker = createRemoteDocker(connection);
      const remote = {
        info: () => remoteDocker.info(),
        caddyService: new CaddyService(remoteDocker),
      };

      return {
        execute: (command) => execute(client, command),
        upload: (localPath, remotePath) =>
          new Promise<void>((resolve, reject) => {
            client.sftp((error, sftp) => {
              if (error) return reject(error);
              sftp.fastPut(localPath, remotePath, (putError) =>
                putError ? reject(putError) : resolve(),
              );
            });
          }),
        dockerInfo: () => remote.info(),
        initializeCaddy: (settings) =>
          remote.caddyService.initializeCaddy(settings),
        close: async () => {
          client.end();
        },
      };
    },
  };
}

async function execute(
  client: Client,
  command: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (error, stream) => {
      if (error) return reject(error);
      let stdout = "";
      let stderr = "";
      let exitCode: number | null = null;
      let finished = false;
      const finish = (code: number | null) => {
        if (finished) return;
        finished = true;
        resolve({ code, stdout, stderr });
        stream.destroy();
      };
      stream.on("exit", (code: number | null) => {
        exitCode = code;
        setTimeout(() => finish(code), 20);
      });
      stream.on("close", () => finish(exitCode));
      stream.on("error", reject);
      stream.on("data", (data: Buffer | string) => {
        stdout += data.toString();
      });
      stream.stderr.on("data", (data: Buffer | string) => {
        stderr += data.toString();
      });
    });
  });
}
