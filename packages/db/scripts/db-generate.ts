import dotenv from "dotenv";
import path from "node:path";

dotenv.config({
  path: path.resolve(import.meta.dir, "../../../apps/server/.env"),
});

const required = [
  "BETTER_AUTH_URL",
  "CORS_ORIGIN",
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
] as const;

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`${name} must be set before generating the database schema`);
  }
}

const env = {
  ...process.env,
  SKIP_ENV_VALIDATION: "1",
};
const cwd = path.resolve(import.meta.dir, "..");

function run(args: string[]) {
  const result = Bun.spawnSync({
    cmd: [process.execPath, "x", ...args],
    cwd,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (!result.success) {
    throw new Error(`Database generation command failed: ${args.join(" ")}`);
  }
}

run([
  "better-auth",
  "generate",
  "--config",
  "../auth/src/index.ts",
  "--output",
  "src/schema/auth.ts",
  "--yes",
]);
run(["drizzle-kit", "generate"]);
