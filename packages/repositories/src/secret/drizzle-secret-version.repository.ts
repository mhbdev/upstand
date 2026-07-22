import { randomUUID } from "node:crypto";
import { secretVersion } from "@upstand/db";
import type {
  ISecretVersionRepository,
  SecretScopeType,
  SecretVersion,
  SecretVersionPayload,
} from "@upstand/domain";
import { and, desc, eq } from "drizzle-orm";
import type { Executor } from "../shared/types";

export class DrizzleSecretVersionRepository
  implements ISecretVersionRepository
{
  constructor(private readonly executor: Executor) {}

  async findByScope(
    scopeType: SecretScopeType,
    scopeId: string,
  ): Promise<SecretVersion[]> {
    return (await this.executor
      .select({
        id: secretVersion.id,
        scopeType: secretVersion.scopeType,
        scopeId: secretVersion.scopeId,
        version: secretVersion.version,
        source: secretVersion.source,
        createdBy: secretVersion.createdBy,
        createdAt: secretVersion.createdAt,
      })
      .from(secretVersion)
      .where(
        and(
          eq(secretVersion.scopeType, scopeType),
          eq(secretVersion.scopeId, scopeId),
        ),
      )
      .orderBy(desc(secretVersion.version))) as SecretVersion[];
  }

  async findByScopeVersion(
    scopeType: SecretScopeType,
    scopeId: string,
    version: number,
  ): Promise<SecretVersionPayload | null> {
    const [row] = await this.executor
      .select()
      .from(secretVersion)
      .where(
        and(
          eq(secretVersion.scopeType, scopeType),
          eq(secretVersion.scopeId, scopeId),
          eq(secretVersion.version, version),
        ),
      )
      .limit(1);
    return row
      ? {
          scopeType: row.scopeType as SecretScopeType,
          scopeId: row.scopeId,
          version: row.version,
          credentials: row.credentials,
          buildSecrets: row.buildSecrets,
          envVars: row.envVars,
          source: row.source,
          createdBy: row.createdBy,
        }
      : null;
  }

  async append(payload: SecretVersionPayload): Promise<SecretVersion> {
    const [row] = await this.executor
      .insert(secretVersion)
      .values({ id: randomUUID(), ...payload })
      .returning({
        id: secretVersion.id,
        scopeType: secretVersion.scopeType,
        scopeId: secretVersion.scopeId,
        version: secretVersion.version,
        source: secretVersion.source,
        createdBy: secretVersion.createdBy,
        createdAt: secretVersion.createdAt,
      });
    if (!row) throw new Error("secret version insert returned no row");
    return row as SecretVersion;
  }
}
