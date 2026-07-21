import { environment, environmentSecret } from "@upstand/db";
import type {
  CreateEnvironmentDTO,
  Environment,
  IEnvironmentRepository,
  UpdateEnvironmentDTO,
} from "@upstand/domain";
import { eq, inArray, sql } from "drizzle-orm";
import { BaseRepository } from "../shared/base.repository";
import type { Executor } from "../shared/types";

export class DrizzleEnvironmentRepository
  extends BaseRepository<typeof environment, Environment, CreateEnvironmentDTO>
  implements IEnvironmentRepository
{
  constructor(executor: Executor) {
    super(executor, environment);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Joins environment rows with their environment_secret rows and returns
   * hydrated Environment objects. Accepts raw environment DB rows.
   */
  private async hydrateWithSecrets(
    rows: (typeof environment.$inferSelect)[],
  ): Promise<Environment[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const secretRows = await this.executor
      .select()
      .from(environmentSecret)
      .where(inArray(environmentSecret.environmentId, ids));
    const secretsById = new Map(secretRows.map((s) => [s.environmentId, s]));
    return rows.map((row) => {
      const secret = secretsById.get(row.id);
      return {
        ...row,
        envVars: secret?.envVars ?? undefined,
      } as Environment;
    });
  }

  // ─── Overridden base finders (hydrate secrets) ────────────────────────────

  override async findById(id: string): Promise<Environment | null> {
    const [row] = await this.executor
      .select()
      .from(environment)
      .where(eq(environment.id, id))
      .limit(1);
    if (!row) return null;
    const hydrated = await this.hydrateWithSecrets([row]);
    return hydrated[0] ?? null;
  }

  async findByProjectId(projectId: string): Promise<Environment[]> {
    const rows = await this.executor
      .select()
      .from(environment)
      .where(eq(environment.projectId, projectId));
    return this.hydrateWithSecrets(rows);
  }

  override async findMany(_options?: unknown): Promise<Environment[]> {
    const rows = await this.executor.select().from(environment);
    return this.hydrateWithSecrets(rows);
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  async incrementResourceCount(id: string, delta: number): Promise<void> {
    await this.executor
      .update(environment)
      .set({
        resourceCount: sql`GREATEST(0, ${environment.resourceCount} + ${delta})`,
      })
      .where(eq(environment.id, id));
  }

  /**
   * Updates mutable environment fields and optionally upserts the encrypted
   * project-level environment variables in environment_secret.
   */
  async updateEnvironment(
    id: string,
    patch: UpdateEnvironmentDTO,
  ): Promise<Environment | null> {
    const { envVars, ...corePatch } = patch;

    // Update core environment row when there are core fields to change.
    if (Object.keys(corePatch).length > 0) {
      await this.executor
        .update(environment)
        .set(corePatch)
        .where(eq(environment.id, id));
    }

    // Upsert environment_secret when env vars are included in the patch.
    if (envVars !== undefined) {
      await this.executor
        .insert(environmentSecret)
        .values({
          environmentId: id,
          envVars,
          version: 1,
        })
        .onConflictDoUpdate({
          target: environmentSecret.environmentId,
          set: { envVars, updatedAt: new Date() },
        });
    }

    return this.findById(id);
  }
}
