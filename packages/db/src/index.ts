import { env } from "@upstand/env/server";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";

import * as schema from "./schema";

export * from "./schema";

export function createDb() {
  return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();

export type DatabaseExecutor = NodePgDatabase<typeof schema>;
export type DatabaseTransactionClient = PgTransaction<any, typeof schema, any>;
