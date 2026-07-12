import { createHash } from "node:crypto";
import type { ServiceScope } from "@circulo-ai/di";
import { AIRepositoryToken } from "@upstand/domain";

export async function authenticateExternalKey(
  value: string,
  scope: ServiceScope,
) {
  const hash = createHash("sha256").update(value).digest("hex");
  const repository = scope.resolve(AIRepositoryToken);
  const row = await repository.findActiveExternalApiKey(hash, new Date());
  if (!row) return null;
  await repository.markExternalApiKeyUsed(row.id, new Date());
  return row;
}
