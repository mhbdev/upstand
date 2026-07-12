import { createHash } from "node:crypto";
import { createDb, externalApiKey } from "@upstand/db";
import { and, eq, isNull } from "drizzle-orm";

export async function authenticateExternalKey(value: string) {
  const hash = createHash("sha256").update(value).digest("hex");
  const row = await createDb()
    .select()
    .from(externalApiKey)
    .where(
      and(
        eq(externalApiKey.secretHash, hash),
        isNull(externalApiKey.revokedAt),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);
  if (!row || (row.expiresAt && row.expiresAt < new Date())) return null;
  await createDb()
    .update(externalApiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(externalApiKey.id, row.id));
  return row;
}
