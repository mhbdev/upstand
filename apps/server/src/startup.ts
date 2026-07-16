import fs from "node:fs";
import path from "node:path";
import { db } from "@upstand/db";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { log } from "evlog";

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function runDatabaseMigrations(options?: {
  attempts?: number;
  delayMs?: number;
  migrationsFolder?: string;
}): Promise<void> {
  const attempts = options?.attempts ?? 30;
  const delayMs = options?.delayMs ?? 2_000;

  let migrationsFolder =
    options?.migrationsFolder ?? process.env.DB_MIGRATIONS_PATH;

  if (!migrationsFolder) {
    const rootPath = path.resolve(process.cwd(), "packages/db/src/migrations");
    const appPath = path.resolve(
      process.cwd(),
      "../../packages/db/src/migrations",
    );
    if (fs.existsSync(rootPath)) {
      migrationsFolder = rootPath;
    } else if (fs.existsSync(appPath)) {
      migrationsFolder = appPath;
    } else {
      migrationsFolder = rootPath;
    }
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await migrate(db, { migrationsFolder });
      log.info({
        message: "Database migrations completed",
        migrationsFolder,
        attempt,
      });
      return;
    } catch (error) {
      lastError = error;
      log.warn({
        message: "Database migration attempt failed",
        attempt,
        attempts,
        err: error instanceof Error ? error.message : String(error),
      });
      if (attempt < attempts) await wait(delayMs);
    }
  }

  throw new Error(`Database migrations failed after ${attempts} attempts`, {
    cause: lastError,
  });
}

/**
 * The initial-owner guard predates managed workspace provisioning. Keep the
 * guard and make its exception explicit for users created by member/SCIM
 * provisioning. This runs after migrations so existing installations upgrade
 * without a hand-authored migration file.
 */
export async function configureManagedUserProvisioning(): Promise<void> {
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION upstand_allow_initial_owner_only()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      PERFORM pg_advisory_xact_lock(84621735);

      IF COALESCE(NEW.managed, false) THEN
        RETURN NEW;
      END IF;

      IF EXISTS (SELECT 1 FROM "user" LIMIT 1) THEN
        RAISE EXCEPTION 'Upstand has already been configured; sign in with the owner account'
          USING ERRCODE = '42501';
      END IF;

      RETURN NEW;
    END;
    $$;
  `);
}
