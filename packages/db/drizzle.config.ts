import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
  path: "../../apps/server/.env",
  // A caller-provided DATABASE_URL must win. This is essential for CI,
  // migrations in containers, and a self-hosted install where no repo-local
  // development .env file exists.
  override: false,
});

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
