import { Client } from "ssh2";

const BASE_URL = "https://api.65.109.183.214.nip.io";
const REMOTE_SERVER_IP = "162.217.248.234";
const REMOTE_SERVER_PASSWORD = "6tXR7a0mvLNZ6aeU";

function appendAuthorizedKey(publicKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      // Append the public key to authorized_keys
      const cmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo "${publicKey.trim()}" >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        stream.on("close", (code: number) => {
          conn.end();
          if (code === 0) resolve();
          else reject(new Error(`Failed to append key, exit code: ${code}`));
        }).on("data", () => {}).stderr.on("data", () => {});
      });
    }).on("error", reject).connect({
      host: REMOTE_SERVER_IP,
      port: 22,
      username: "root",
      password: REMOTE_SERVER_PASSWORD
    });
  });
}

function removeAuthorizedKey(publicKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on("ready", () => {
      // Remove the public key from authorized_keys
      const escapedKey = publicKey.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const cmd = `sed -i '/${escapedKey}/d' ~/.ssh/authorized_keys`;
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        stream.on("close", () => {
          conn.end();
          resolve();
        }).on("data", () => {}).stderr.on("data", () => {});
      });
    }).on("error", reject).connect({
      host: REMOTE_SERVER_IP,
      port: 22,
      username: "root",
      password: REMOTE_SERVER_PASSWORD
    });
  });
}

async function run() {
  console.log("--- Starting E2E API Verification on self-hosted server ---");
  
  // 1. Test public health check
  console.log("\n1. Testing health endpoints...");
  const liveRes = await fetch(`${BASE_URL}/health/live`);
  console.log("Health Live status:", liveRes.status, await liveRes.json());
  
  const readyRes = await fetch(`${BASE_URL}/health/ready`);
  console.log("Health Ready status:", readyRes.status, await readyRes.json());

  const trpcHealth = await fetch(`${BASE_URL}/trpc/healthCheck`);
  console.log("tRPC Health check status:", trpcHealth.status, await trpcHealth.json());

  // 2. Log in
  console.log("\n2. Logging in via Better Auth...");
  const loginRes = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "1839491@gmail.com",
      password: "M@hdi131849"
    })
  });
  console.log("Login HTTP Status:", loginRes.status);
  
  const setCookie = loginRes.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("No set-cookie header in login response!");
  }
  console.log("Cookies captured successfully.");

  // Helper to make authenticated requests
  const authHeaders: Record<string, string> = {
    "Cookie": setCookie.split(";")[0] ?? "",
    "Content-Type": "application/json"
  };

  // 3. Get Session and check organizations
  console.log("\n3. Retrieving session info...");
  const sessionRes = await fetch(`${BASE_URL}/api/auth/get-session`, {
    headers: authHeaders
  });
  const sessionData = await sessionRes.json() as any;
  console.log("Session User:", sessionData.user);

  // Let's get active organization
  const orgListRes = await fetch(`${BASE_URL}/api/auth/organization/list`, {
    headers: authHeaders
  });
  const orgs = await orgListRes.json() as any;
  console.log("Organizations list:", orgs);

  const activeOrg = orgs[0];
  const orgId = activeOrg.id;
  console.log(`Using Organization ID: ${orgId}`);

  // 4. Test Project & Environment Lifecycle
  console.log("\n4. Testing project & environment lifecycle...");
  const createProjRes = await fetch(`${BASE_URL}/trpc/project.create`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "E2E Test Project " + Date.now(),
      organizationId: orgId
    })
  });
  const createdProj = await createProjRes.json() as any;
  const projectId = createdProj.result.data.id;
  console.log("Created Project ID:", projectId);

  const createEnvRes = await fetch(`${BASE_URL}/trpc/environment.create`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      projectId: projectId,
      name: "Production",
      description: "Auto created by E2E test"
    })
  });
  const createdEnv = await createEnvRes.json() as any;
  const envId = createdEnv.result.data.id;
  console.log("Created Environment ID:", envId);

  // 5. Test SSH Key generation
  console.log("\n5. Generating and registering SSH Key...");
  const createKeyRes = await fetch(`${BASE_URL}/trpc/sshKey.generate`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      organizationId: orgId,
      name: "E2E Test Key"
    })
  });
  const generatedKey = await createKeyRes.json() as any;
  const sshKeyId = generatedKey.result.data.id;
  const publicKey = generatedKey.result.data.publicKey;
  console.log("Generated Key ID:", sshKeyId);

  // Append public key to the remote server's authorized_keys
  console.log(`Appending SSH key to remote server (${REMOTE_SERVER_IP}) authorized_keys...`);
  await appendAuthorizedKey(publicKey);
  console.log("SSH key appended successfully.");

  // 6. Test Server Registration
  console.log(`\n6. Registering remote server (${REMOTE_SERVER_IP})...`);
  const createServerRes = await fetch(`${BASE_URL}/trpc/server.create`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      organizationId: orgId,
      name: "Remote Swarm Agent",
      description: "Remote server registered via E2E test",
      serverType: "remote",
      sshKeyId: sshKeyId,
      ipAddress: REMOTE_SERVER_IP,
      port: 22,
      username: "root",
      enableDockerCleanup: true
    })
  });
  const createdServer = await createServerRes.json() as any;
  const serverId = createdServer.result.data.id;
  console.log("Registered Server ID:", serverId);

  // 7. Test Server Setup
  console.log("\n7. Triggering server setup...");
  const setupRes = await fetch(`${BASE_URL}/trpc/server.setup`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      id: serverId
    })
  });
  console.log("Server setup triggered status:", setupRes.status, await setupRes.json() as any);

  // Poll server setup status
  console.log("Polling server status until ready...");
  let attempts = 0;
  let serverStatus = "setting_up";
  let serverInfo: any = null;

  while (attempts < 60) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const checkRes = await fetch(`${BASE_URL}/trpc/server.one?input=${encodeURIComponent(JSON.stringify({ organizationId: orgId, id: serverId }))}`, {
      headers: authHeaders
    });
    const checkData = await checkRes.json() as any;
    serverInfo = checkData.result.data;
    serverStatus = serverInfo.status;
    console.log(`Attempt ${attempts + 1}: Status = ${serverStatus}`);
    
    if (serverStatus === "ready" || serverStatus === "failed") {
      break;
    }
    attempts++;
  }

  if (serverStatus !== "ready") {
    console.error("Server setup failed! Details:", serverInfo);
    throw new Error(`Server setup ended with status: ${serverStatus}. Error: ${serverInfo?.setupError}`);
  }
  console.log("Server is ready and configured successfully!");

  // 8. Test Clean Up
  console.log("\n8. Cleaning up E2E test assets...");
  
  // Delete server
  const deleteServerRes = await fetch(`${BASE_URL}/trpc/server.delete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      id: serverId
    })
  });
  console.log("Deleted Server status:", deleteServerRes.status, await deleteServerRes.json());

  // Remove SSH Authorized Key
  console.log("Removing SSH key from remote server...");
  await removeAuthorizedKey(publicKey);

  // Delete SSH Key from database
  const deleteKeyRes = await fetch(`${BASE_URL}/trpc/sshKey.delete`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      id: sshKeyId
    })
  });
  console.log("Deleted Key status:", deleteKeyRes.status, await deleteKeyRes.json());

  // Delete Project
  const deleteProjRes = await fetch(`${BASE_URL}/trpc/project.deleteProject`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      id: projectId,
      organizationId: orgId
    })
  });
  console.log("Deleted Project status:", deleteProjRes.status, await deleteProjRes.json());

  console.log("\n--- E2E API Verification Finished Successfully! ---");
}

run().catch((err) => {
  console.error("E2E Test failed:", err);
  process.exit(1);
});
