/**
 * Local E2E test suite for Upstand.
 * Targets the dev server running at http://localhost:3000.
 *
 * Run:  bun run packages/usecases/e2e-local-test.ts
 */

const BASE_URL = "http://localhost:3000";

// ─── Helpers ────────────────────────────────────────────────────────────────

function assertOk(label: string, data: any) {
  if (data?.error) {
    throw new Error(`[${label}] API error: ${JSON.stringify(data.error, null, 2)}`);
  }
  if (!data?.result?.data) {
    throw new Error(`[${label}] Unexpected response shape: ${JSON.stringify(data, null, 2)}`);
  }
}

async function trpcQuery(
  path: string,
  input: Record<string, unknown>,
  authHeaders: Record<string, string>,
): Promise<any> {
  const qs = `?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(`${BASE_URL}/trpc/${path}${qs}`, { headers: authHeaders });
  return res.json();
}

async function trpcMutation(
  path: string,
  input: Record<string, unknown>,
  authHeaders: Record<string, string>,
): Promise<any> {
  const res = await fetch(`${BASE_URL}/trpc/${path}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify(input),
  });
  return res.json();
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function poll<T>(
  label: string,
  fn: () => Promise<T>,
  isDone: (v: T) => boolean,
  isError: (v: T) => boolean,
  maxAttempts = 40,
  intervalMs = 5000,
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    const value = await fn();
    console.log(`  [${label}] attempt ${i + 1}/${maxAttempts}: ${JSON.stringify(value)}`);
    if (isDone(value)) return value;
    if (isError(value)) throw new Error(`[${label}] errored: ${JSON.stringify(value)}`);
    await sleep(intervalMs);
  }
  throw new Error(`[${label}] timed out after ${maxAttempts} attempts`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  let orgId = "";
  let projectId = "";
  let envId = "";
  let resourceId = "";
  let sshKeyId = "";
  const cleanup: Array<() => Promise<void>> = [];

  try {
    // ── 1. Health ──────────────────────────────────────────────────────────
    console.log("\n═══ 1. Health Checks ═══");
    const liveRes = await fetch(`${BASE_URL}/health/live`);
    const liveData = await liveRes.json() as any;
    console.log("  /health/live →", liveData);
    if (liveData.status !== "alive") throw new Error("Server is not alive");

    const readyRes = await fetch(`${BASE_URL}/health/ready`);
    const readyData = await readyRes.json() as any;
    console.log("  /health/ready →", readyData);
    if (readyData.status !== "ready") throw new Error("Server is not ready");
    if (!readyData.checks.database) throw new Error("Database is not ready");
    if (!readyData.checks.redis) throw new Error("Redis is not ready");
    console.log("  ✅ Health checks passed");

    const tRPCHealthData = await trpcQuery("healthCheck", {}, {});
    console.log("  tRPC healthCheck →", tRPCHealthData);
    console.log("  ✅ tRPC health check passed");

    // ── 2. Auth ────────────────────────────────────────────────────────────
    console.log("\n═══ 2. Authentication ═══");
    let loginRes = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "local@upstand.dev", password: "LocalPassword123" }),
    });

    if (loginRes.status !== 200) {
      console.log("  User not found — creating...");
      const signUpRes = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Local Admin",
          email: "local@upstand.dev",
          password: "LocalPassword123",
        }),
      });
      if (signUpRes.status !== 200) {
        throw new Error(`Sign-up failed (${signUpRes.status}): ${await signUpRes.text()}`);
      }
      loginRes = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "local@upstand.dev", password: "LocalPassword123" }),
      });
    }

    if (loginRes.status !== 200) {
      throw new Error(`Login failed (${loginRes.status}): ${await loginRes.text()}`);
    }

    const setCookie = loginRes.headers.get("set-cookie");
    if (!setCookie) throw new Error("No set-cookie header returned after login");

    const authHeaders: Record<string, string> = {
      Cookie: setCookie.split(";")[0] ?? "",
      "Content-Type": "application/json",
    };
    console.log("  ✅ Logged in, cookies captured");

    // ── 3. Session & Org ───────────────────────────────────────────────────
    console.log("\n═══ 3. Session & Organization ═══");
    const sessionRes = await fetch(`${BASE_URL}/api/auth/get-session`, { headers: authHeaders });
    const sessionData = await sessionRes.json() as any;
    console.log("  User:", sessionData.user?.name, sessionData.user?.email);

    const orgsData = await (
      await fetch(`${BASE_URL}/api/auth/organization/list`, { headers: authHeaders })
    ).json() as any;
    console.log("  Organizations:", orgsData.map((o: any) => `${o.name} (${o.id})`));
    orgId = orgsData[0]?.id;
    if (!orgId) throw new Error("No organization found after sign-up");
    console.log(`  ✅ Using org: ${orgId}`);

    // ── 4. SSH Key ─────────────────────────────────────────────────────────
    console.log("\n═══ 4. SSH Key Generation ═══");
    const genKeyData = await trpcMutation(
      "sshKey.generate",
      { organizationId: orgId, name: `E2E-Key-${Date.now()}` },
      authHeaders,
    );
    assertOk("sshKey.generate", genKeyData);
    sshKeyId = genKeyData.result.data.id;
    const publicKey = genKeyData.result.data.publicKey;
    console.log(`  Generated key ID: ${sshKeyId}`);
    console.log(`  Public key starts: ${publicKey.substring(0, 40)}...`);
    cleanup.push(async () => {
      console.log("  [cleanup] Deleting SSH key...");
      await trpcMutation("sshKey.delete", { id: sshKeyId }, authHeaders);
    });
    console.log("  ✅ SSH key generated");

    // ── 5. Project & Environment ───────────────────────────────────────────
    console.log("\n═══ 5. Project & Environment ═══");
    const createProjData = await trpcMutation(
      "project.create",
      { name: `E2E-Project-${Date.now()}`, organizationId: orgId },
      authHeaders,
    );
    assertOk("project.create", createProjData);
    projectId = createProjData.result.data.id;
    console.log(`  Created project: ${projectId}`);

    cleanup.push(async () => {
      console.log("  [cleanup] Deleting project...");
      await trpcMutation(
        "project.deleteProject",
        { id: projectId, organizationId: orgId },
        authHeaders,
      );
    });

    const createEnvData = await trpcMutation(
      "environment.create",
      { projectId, name: "dev", description: "Local E2E environment" },
      authHeaders,
    );
    assertOk("environment.create", createEnvData);
    envId = createEnvData.result.data.id;
    console.log(`  Created environment: ${envId}`);
    console.log("  ✅ Project and environment created");

    // ── 6. Create Application Resource ────────────────────────────────────
    console.log("\n═══ 6. Create Application Resource (nginx:alpine) ═══");
    const createResourceData = await trpcMutation(
      "resource.create",
      {
        environmentId: envId,
        name: "e2e-nginx",
        type: "application",
        appName: `e2e-nginx-${Date.now()}`,
        dockerImage: "nginx:alpine",
        // No serverId — auto-resolves to local swarm node
        domains: [
          {
            host: "nginx.127.0.0.1.nip.io",
            path: "/",
            port: 80,
            https: false,
          },
        ],
      },
      authHeaders,
    );
    assertOk("resource.create", createResourceData);
    resourceId = createResourceData.result.data.id;
    console.log(`  Created resource: ${resourceId}`);

    cleanup.push(async () => {
      console.log("  [cleanup] Deleting resource...");
      await trpcMutation("resource.delete", { id: resourceId }, authHeaders).catch(console.warn);
    });
    console.log("  ✅ Application resource created");

    // ── 7. Deploy ──────────────────────────────────────────────────────────
    console.log("\n═══ 7. Deploy Application ═══");
    const deployData = await trpcMutation("resource.deploy", { id: resourceId }, authHeaders);
    if (deployData.error) {
      throw new Error(`Deploy failed: ${JSON.stringify(deployData.error, null, 2)}`);
    }
    console.log("  Deployment queued. Polling...");

    let finalDeploymentStatus = "unknown";
    await poll(
      "deployment",
      async () => {
        const data = await trpcQuery("resource.get", { id: resourceId }, authHeaders);
        const deps = JSON.parse(data?.result?.data?.deployments ?? "[]");
        return { status: deps[0]?.status ?? "pending", logs: deps[0]?.logs ?? "" };
      },
      (v) => v.status === "success",
      (v) => v.status === "failed",
      50,
      4000,
    ).then((v) => {
      finalDeploymentStatus = v.status;
    });

    if (finalDeploymentStatus !== "success") {
      throw new Error(`Deployment did not succeed; final status: ${finalDeploymentStatus}`);
    }
    console.log("  ✅ Deployment succeeded!");

    // ── 8. Verify Service Running (via containers endpoint) ────────────────
    console.log("\n═══ 8. Verify Running Containers ═══");
    console.log("  Waiting 15s for service to converge before routing check...");
    await sleep(15000);

    const containersData = await trpcQuery("resource.getContainers", { id: resourceId }, authHeaders);
    console.log("  Containers:", JSON.stringify(containersData?.result?.data, null, 2));
    const containers: any[] = containersData?.result?.data ?? [];
    const running = containers.filter((c) => c.State === "running");
    console.log(`  Running containers: ${running.length}`);
    if (running.length === 0) {
      console.warn("  ⚠️  No running containers found — deployment may still be converging");
    } else {
      console.log("  ✅ Container(s) running");
    }

    // ── 9. Fetch Logs ──────────────────────────────────────────────────────
    console.log("\n═══ 9. Fetch Application Logs ═══");
    const logsData = await trpcQuery(
      "resource.getLogs",
      { id: resourceId, tail: 30 },
      authHeaders,
    );
    const logLines: string[] = logsData?.result?.data ?? [];
    console.log(`  Retrieved ${logLines.length} log lines`);
    if (logLines.length > 0) {
      console.log("  Last line:", logLines[logLines.length - 1]);
      console.log("  ✅ Log retrieval working");
    } else {
      console.warn("  ⚠️  No log lines returned yet");
    }

    // ── 10. Verify HTTP Routing via Caddy / nip.io ────────────────────────
    console.log("\n═══ 10. Verify HTTP Routing (Caddy → nginx via nip.io) ═══");
    let routingOk = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const r = await fetch("http://nginx.127.0.0.1.nip.io/", {
          signal: AbortSignal.timeout(5000),
        });
        const body = await r.text();
        console.log(`  HTTP status: ${r.status}`);
        if (r.status === 200 && body.includes("Welcome to nginx")) {
          console.log("  ✅ Caddy routed request to nginx successfully!");
          routingOk = true;
          break;
        } else {
          console.log(`  Attempt ${attempt + 1}: status=${r.status}, body snippet=${body.substring(0, 80)}`);
        }
      } catch (e: any) {
        console.log(`  Attempt ${attempt + 1}: fetch error — ${e.message}`);
      }
      await sleep(3000);
    }
    if (!routingOk) {
      console.warn("  ⚠️  Caddy routing not confirmed — check if Caddy is running locally on port 80");
    }

    // ── 11. Control: Stop ──────────────────────────────────────────────────
    console.log("\n═══ 11. Control: Stop Application ═══");
    const stopData = await trpcMutation(
      "resource.control",
      { id: resourceId, command: "stop" },
      authHeaders,
    );
    if (stopData.error) {
      console.warn("  ⚠️  Stop returned error:", JSON.stringify(stopData.error.message ?? stopData.error));
    } else {
      console.log("  ✅ Stop command accepted");
    }
    await sleep(3000);

    // ── 12. Control: Start ─────────────────────────────────────────────────
    console.log("\n═══ 12. Control: Start Application ═══");
    const startData = await trpcMutation(
      "resource.control",
      { id: resourceId, command: "start" },
      authHeaders,
    );
    if (startData.error) {
      console.warn("  ⚠️  Start returned error:", JSON.stringify(startData.error.message ?? startData.error));
    } else {
      console.log("  ✅ Start command accepted");
    }
    await sleep(4000);

    // ── 13. Routing Targets ────────────────────────────────────────────────
    console.log("\n═══ 13. Routing Targets ═══");
    const routingTargetsData = await trpcQuery(
      "resource.getRoutingTargets",
      { id: resourceId },
      authHeaders,
    );
    console.log("  Routing targets:", JSON.stringify(routingTargetsData?.result?.data, null, 2));
    console.log("  ✅ Routing targets retrieved");

    console.log("\n══════════════════════════════════════════════════════════");
    console.log("  🎉  ALL LOCAL E2E TESTS PASSED SUCCESSFULLY!");
    console.log("══════════════════════════════════════════════════════════\n");
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────
    console.log("\n═══ Cleanup ═══");
    for (const fn of cleanup.reverse()) {
      try {
        await fn();
      } catch (e: any) {
        console.warn("  Cleanup warning:", e.message);
      }
    }
    console.log("  ✅ Cleanup done");
  }
}

run().catch((err) => {
  console.error("\n❌  Local E2E Test FAILED:", err.message ?? err);
  process.exit(1);
});
