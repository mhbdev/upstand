import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const serverDirectory = path.join(root, "apps", "server");
const webDirectory = path.join(root, "apps", "web");
const requiredBunVersion = "1.3.14";
const composeFile = path.join(root, "docker-compose.local.yml");

function fail(message: string): never {
  console.error(`\nSetup failed: ${message}`);
  process.exit(1);
}

function run(command: string, args: string[], env = process.env): void {
  let result: ReturnType<typeof Bun.spawnSync>;
  try {
    result = Bun.spawnSync({
      cmd: [command, ...args],
      cwd: root,
      env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
  } catch {
    fail(
      `Could not run '${command}'. Make sure it is installed and available on PATH.`,
    );
  }

  if (!result.success) {
    fail(`'${command} ${args.join(" ")}' exited with code ${result.exitCode}.`);
  }
}

function commandWorks(command: string, args: string[]): boolean {
  try {
    return Bun.spawnSync({
      cmd: [command, ...args],
      cwd: root,
      stdout: "ignore",
      stderr: "ignore",
    }).success;
  } catch {
    return false;
  }
}

async function copyIfMissing(
  examplePath: string,
  targetPath: string,
): Promise<boolean> {
  if (await Bun.file(targetPath).exists()) {
    return false;
  }

  if (!(await Bun.file(examplePath).exists())) {
    fail(`Missing environment template: ${path.relative(root, examplePath)}`);
  }

  await Bun.write(targetPath, Bun.file(examplePath));
  console.log(`Created ${path.relative(root, targetPath)}`);
  return true;
}

function readEnvValue(contents: string, name: string): string | undefined {
  return contents
    .split(/\r?\n/)
    .find((line) => line.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function databasePassword(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) {
    return undefined;
  }

  try {
    return decodeURIComponent(new URL(databaseUrl).password);
  } catch {
    return undefined;
  }
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function waitForPostgres(env: NodeJS.ProcessEnv): Promise<void> {
  const attempts = 30;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = Bun.spawnSync({
        cmd: [
          "docker",
          "compose",
          "-f",
          composeFile,
          "exec",
          "-T",
          "postgres",
          "pg_isready",
          "-U",
          "postgres",
          "-d",
          "upstand",
        ],
        cwd: root,
        env,
        stdout: "ignore",
        stderr: "ignore",
      });
      if (result.success) {
        return;
      }
    } catch {
      // Docker may still be starting the container.
    }

    await Bun.sleep(1000);
  }

  fail(
    "PostgreSQL did not become ready within 30 seconds. Run `bun run docker:logs` to inspect it.",
  );
}

async function main(): Promise<void> {
  if (Bun.version !== requiredBunVersion) {
    fail(
      `This repository requires Bun ${requiredBunVersion}; found Bun ${Bun.version}.`,
    );
  }

  if (!commandWorks("docker", ["info"])) {
    fail(
      "Docker Engine is not available. Install Docker Desktop or Docker Engine, start it, and run `bun setup` again.",
    );
  }

  const rootEnvCreated = await copyIfMissing(
    path.join(root, ".env.example"),
    path.join(root, ".env"),
  );
  const serverEnvCreated = await copyIfMissing(
    path.join(serverDirectory, ".env.example"),
    path.join(serverDirectory, ".env"),
  );
  await copyIfMissing(
    path.join(webDirectory, ".env.example"),
    path.join(webDirectory, ".env.local"),
  );

  if (!process.argv.includes("--skip-install")) {
    console.log("Installing workspace dependencies...");
    run(process.execPath, ["install", "--frozen-lockfile"]);
  }

  const env = { ...process.env };
  const rootEnv = await Bun.file(path.join(root, ".env")).text();
  const serverEnv = await Bun.file(path.join(serverDirectory, ".env")).text();
  const configuredPassword = readEnvValue(rootEnv, "POSTGRES_PASSWORD");
  const serverPassword = databasePassword(
    readEnvValue(serverEnv, "DATABASE_URL"),
  );
  const postgresPassword =
    rootEnvCreated && !serverEnvCreated
      ? (serverPassword ?? configuredPassword)
      : (configuredPassword ?? serverPassword);
  if (postgresPassword) {
    env.POSTGRES_PASSWORD = postgresPassword;
  }

  console.log("Starting local PostgreSQL and Redis services...");
  run(
    "docker",
    ["compose", "-f", composeFile, "up", "-d", "postgres", "redis"],
    env,
  );
  await waitForPostgres(env);

  if (postgresPassword) {
    console.log(
      "Synchronizing the local PostgreSQL password without deleting data...",
    );
    run(
      "docker",
      [
        "compose",
        "-f",
        composeFile,
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-c",
        `ALTER ROLE postgres PASSWORD ${sqlString(postgresPassword)};`,
      ],
      env,
    );
  }

  console.log("Applying the checked-in database migrations...");
  run(process.execPath, ["run", "db:migrate"], env);
  console.log(
    "\nLocal setup is ready. Run `bun dev` to start the server, web console, and Fumadocs.",
  );
}

await main();
