import { resource, resourceConfiguration, resourceSecret } from "@upstand/db";
import type {
  CreateResourceDTO,
  IResourceRepository,
  Resource,
} from "@upstand/domain";
import {
  RESOURCE_STATE_VERSION,
  serializeResourceConfiguration,
} from "@upstand/domain";
import { count, eq, inArray } from "drizzle-orm";
import type { Executor } from "../shared/types";

const DEFAULT_CONFIGURATION = serializeResourceConfiguration({});
const DEFAULT_BUILD_CONFIG = DEFAULT_CONFIGURATION.buildConfig;
const DEFAULT_ADVANCED_CONFIG = DEFAULT_CONFIGURATION.advancedConfig;
const DEFAULT_WATCH_PATHS = DEFAULT_CONFIGURATION.watchPaths;
const DEFAULT_DOMAINS = DEFAULT_CONFIGURATION.domains;
const DEFAULT_ENV_VARS = "{}";

type ResourceRow = typeof resource.$inferSelect;

export class DrizzleResourceRepository implements IResourceRepository {
  constructor(private readonly executor: Executor) {}

  async findById(id: string): Promise<Resource | null> {
    const [row] = await this.executor
      .select()
      .from(resource)
      .where(eq(resource.id, id))
      .limit(1);
    return row ? ((await this.hydrate([row]))[0] ?? null) : null;
  }

  async findByWebhookTokenHash(hash: string): Promise<Resource | null> {
    const [row] = await this.executor
      .select()
      .from(resource)
      .where(eq(resource.webhookTokenHash, hash))
      .limit(1);
    return row ? ((await this.hydrate([row]))[0] ?? null) : null;
  }

  async findByEnvironmentId(environmentId: string): Promise<Resource[]> {
    const rows = await this.executor
      .select()
      .from(resource)
      .where(eq(resource.environmentId, environmentId));
    return this.hydrate(rows);
  }

  async findMany(): Promise<Resource[]> {
    return this.hydrate(await this.executor.select().from(resource));
  }

  async create(data: CreateResourceDTO): Promise<Resource> {
    const { configuration, secrets, core } = splitResourceValues(data);
    const [row] = await this.executor
      .insert(resource)
      .values(toResourceInsert(core))
      .returning();
    if (!row) throw new Error("create: resource insert returned no row");
    await this.insertOwnedState(
      row.id,
      mergeConfiguration(defaultConfiguration(), configuration),
      mergeSecrets(defaultSecrets(), secrets),
    );
    return (await this.findById(row.id)) as Resource;
  }

  async createMany(values: CreateResourceDTO[]): Promise<Resource[]> {
    if (values.length === 0) return [];
    const split = values.map(splitResourceValues);
    const rows = await this.executor
      .insert(resource)
      .values(split.map(({ core }) => toResourceInsert(core)))
      .returning();
    await Promise.all(
      rows.map((row, index) =>
        this.insertOwnedState(
          row.id,
          mergeConfiguration(
            defaultConfiguration(),
            split[index]?.configuration,
          ),
          mergeSecrets(defaultSecrets(), split[index]?.secrets),
        ),
      ),
    );
    return this.hydrate(rows);
  }

  async updateById(
    id: string,
    patch: Partial<CreateResourceDTO>,
  ): Promise<Resource | null> {
    const { configuration, secrets, core } = splitResourceValues(patch);
    if (Object.keys(core).length > 0) {
      await this.executor.update(resource).set(core).where(eq(resource.id, id));
    }
    if (configuration) {
      const current = await this.getConfiguration(id);
      await this.upsertConfiguration(
        id,
        mergeConfiguration(current, configuration),
      );
    }
    if (secrets) {
      const current = await this.getSecrets(id);
      await this.upsertSecrets(id, mergeSecrets(current, secrets));
    }
    return this.findById(id);
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.executor
      .delete(resource)
      .where(eq(resource.id, id))
      .returning({ id: resource.id });
    return deleted.length > 0;
  }

  async count(): Promise<number> {
    const [row] = await this.executor.select({ value: count() }).from(resource);
    return row?.value ?? 0;
  }

  private async hydrate(rows: ResourceRow[]): Promise<Resource[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [configRows, secretRows] = await Promise.all([
      this.executor
        .select()
        .from(resourceConfiguration)
        .where(inArray(resourceConfiguration.resourceId, ids)),
      this.executor
        .select()
        .from(resourceSecret)
        .where(inArray(resourceSecret.resourceId, ids)),
    ]);
    const configs = new Map(
      configRows.map((configuration) => [
        configuration.resourceId,
        configuration,
      ]),
    );
    const secretsById = new Map(
      secretRows.map((secret) => [secret.resourceId, secret]),
    );
    return rows.map((row) => {
      const configuration = configs.get(row.id);
      const secret = secretsById.get(row.id);
      return {
        ...row,
        credentials: secret?.credentials ?? null,
        buildConfig: configuration?.buildConfig ?? DEFAULT_BUILD_CONFIG,
        buildSecrets: secret?.buildSecrets ?? null,
        advancedConfig:
          configuration?.advancedConfig ?? DEFAULT_ADVANCED_CONFIG,
        envVars: secret?.envVars ?? DEFAULT_ENV_VARS,
        domains: configuration?.domains ?? DEFAULT_DOMAINS,
        watchPaths: configuration?.watchPaths ?? DEFAULT_WATCH_PATHS,
      } as Resource;
    });
  }

  private async insertOwnedState(
    resourceId: string,
    configuration: ResourceConfigurationValues,
    secrets: ResourceSecretValues,
  ): Promise<void> {
    await Promise.all([
      this.executor.insert(resourceConfiguration).values({
        resourceId,
        ...configuration,
      }),
      this.executor.insert(resourceSecret).values({
        resourceId,
        ...secrets,
      }),
    ]);
  }

  private async getConfiguration(
    resourceId: string,
  ): Promise<ResourceConfigurationValues> {
    const [row] = await this.executor
      .select()
      .from(resourceConfiguration)
      .where(eq(resourceConfiguration.resourceId, resourceId))
      .limit(1);
    return row
      ? {
          version: row.version,
          buildConfig: row.buildConfig,
          advancedConfig: row.advancedConfig,
          watchPaths: row.watchPaths,
          domains: row.domains,
        }
      : defaultConfiguration();
  }

  private async getSecrets(resourceId: string): Promise<ResourceSecretValues> {
    const [row] = await this.executor
      .select()
      .from(resourceSecret)
      .where(eq(resourceSecret.resourceId, resourceId))
      .limit(1);
    return row
      ? {
          version: row.version,
          credentials: row.credentials,
          buildSecrets: row.buildSecrets,
          envVars: row.envVars,
        }
      : defaultSecrets();
  }

  private async upsertConfiguration(
    resourceId: string,
    values: ResourceConfigurationValues,
  ): Promise<void> {
    await this.executor
      .insert(resourceConfiguration)
      .values({ resourceId, ...values })
      .onConflictDoUpdate({
        target: resourceConfiguration.resourceId,
        set: values,
      });
  }

  private async upsertSecrets(
    resourceId: string,
    values: ResourceSecretValues,
  ): Promise<void> {
    await this.executor
      .insert(resourceSecret)
      .values({ resourceId, ...values })
      .onConflictDoUpdate({
        target: resourceSecret.resourceId,
        set: values,
      });
  }
}

type ResourceConfigurationValues = {
  version: number;
  buildConfig: string;
  advancedConfig: string;
  watchPaths: string;
  domains: string;
};

type ResourceSecretValues = {
  version: number;
  credentials: string | null;
  buildSecrets: string | null;
  envVars: string;
};

function defaultConfiguration(): ResourceConfigurationValues {
  return {
    version: RESOURCE_STATE_VERSION,
    buildConfig: DEFAULT_BUILD_CONFIG,
    advancedConfig: DEFAULT_ADVANCED_CONFIG,
    watchPaths: DEFAULT_WATCH_PATHS,
    domains: DEFAULT_DOMAINS,
  };
}

function defaultSecrets(): ResourceSecretValues {
  return {
    version: RESOURCE_STATE_VERSION,
    credentials: null,
    buildSecrets: null,
    envVars: DEFAULT_ENV_VARS,
  };
}

function mergeConfiguration(
  current: ResourceConfigurationValues,
  patch: ResourceConfigurationPatch | undefined,
): ResourceConfigurationValues {
  return { ...current, ...patch };
}

function mergeSecrets(
  current: ResourceSecretValues,
  patch: ResourceSecretPatch | undefined,
): ResourceSecretValues {
  return { ...current, ...patch };
}

function splitResourceValues(values: Partial<CreateResourceDTO>) {
  const {
    credentials,
    buildConfig,
    buildSecrets,
    advancedConfig,
    envVars,
    domains,
    watchPaths,
    ...core
  } = values;
  const configuration =
    buildConfig !== undefined ||
    advancedConfig !== undefined ||
    domains !== undefined ||
    watchPaths !== undefined
      ? {
          version: RESOURCE_STATE_VERSION,
          ...(buildConfig !== undefined ? { buildConfig } : {}),
          ...(advancedConfig !== undefined ? { advancedConfig } : {}),
          ...(domains !== undefined ? { domains } : {}),
          ...(watchPaths !== undefined ? { watchPaths } : {}),
        }
      : undefined;
  const secrets =
    credentials !== undefined ||
    buildSecrets !== undefined ||
    envVars !== undefined
      ? {
          version: RESOURCE_STATE_VERSION,
          ...(credentials !== undefined ? { credentials } : {}),
          ...(buildSecrets !== undefined ? { buildSecrets } : {}),
          ...(envVars !== undefined ? { envVars } : {}),
        }
      : undefined;
  return { core, configuration, secrets };
}

type ResourceConfigurationPatch = Partial<ResourceConfigurationValues>;
type ResourceSecretPatch = Partial<ResourceSecretValues>;

function toResourceInsert(
  values: Partial<CreateResourceDTO>,
): typeof resource.$inferInsert {
  if (
    !values.id ||
    !values.environmentId ||
    !values.name ||
    !values.type ||
    !values.provider
  ) {
    throw new Error(
      "Resource inserts require id, environmentId, name, type, and provider",
    );
  }
  return {
    ...values,
    id: values.id,
    environmentId: values.environmentId,
    name: values.name,
    type: values.type,
    provider: values.provider,
  };
}
