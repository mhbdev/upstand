import { TRPCError } from "@trpc/server";
import {
  DomainMappingSchema,
  parseDomainMappings,
  parseResourceAdvancedConfig,
  type Resource,
  ResourceAdvancedConfigSchema,
  ResourceComposeTypeSchema,
} from "@upstand/domain";
import {
  ControlResourceInputSchema,
  ConvertComposeInputSchema,
  DeleteResourceInputSchema,
  DeployResourceInputSchema,
  InspectComposeInputSchema,
  parseResourceCredentials,
  parseResourceEnvironmentVariables,
  UpdateResourceInputSchema,
} from "@upstand/usecases";
import {
  ControlResourceUseCaseToken,
  CreateResourceUseCaseToken,
  DeleteResourceUseCaseToken,
  DeployResourceUseCaseToken,
  GetEnvironmentUseCaseToken,
  GetProjectUseCaseToken,
  GetResourceUseCaseToken,
  InspectComposeUseCaseToken,
  RandomizeComposeUseCaseToken,
  UpdateResourceUseCaseToken,
} from "@upstand/usecases/tokens";
import { z } from "zod";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

const CreateComposeInputSchema = z.object({
  environmentId: z.string().min(1),
  name: z.string().min(1),
  appName: z.string().min(1),
  description: z.string().optional(),
  composeFile: z.string().min(1, "Compose file is required"),
  composeType: ResourceComposeTypeSchema.optional().default("stack"),
  advancedConfig: ResourceAdvancedConfigSchema.optional(),
  envVars: z.record(z.string(), z.string()).optional(),
  domains: z.array(DomainMappingSchema).optional(),
  serverId: z.string().optional(),
  buildServerId: z.string().nullable().optional(),
});

const UpdateComposeInputSchema = UpdateResourceInputSchema.pick({
  id: true,
  name: true,
  appName: true,
  description: true,
  serverId: true,
  buildServerId: true,
}).extend({
  composeFile: z.string().min(1).optional(),
  composeType: ResourceComposeTypeSchema.optional(),
  advancedConfig: ResourceAdvancedConfigSchema.optional(),
  envVars: z.record(z.string(), z.string()).optional(),
  domains: z.array(DomainMappingSchema).optional(),
});

const RandomizeComposeInputSchema = z.object({
  id: z.string().min(1),
});

function composePayload(resource: Resource) {
  let composeFile = "";
  try {
    const credentials = parseResourceCredentials(resource.credentials);
    if (typeof credentials.composeFile === "string") {
      composeFile = credentials.composeFile;
    }
  } catch {
    // Preserve a readable typed response for malformed legacy resources.
  }

  let domains: unknown[] = [];
  try {
    domains = parseDomainMappings(resource.domains);
  } catch {
    // Legacy domain data is handled by the generic resource repair path.
  }

  const envVars = parseResourceEnvironmentVariables(resource.envVars);

  return {
    id: resource.id,
    environmentId: resource.environmentId,
    name: resource.name,
    appName: resource.appName,
    description: resource.description,
    status: resource.status,
    composeType: resource.composeType,
    composeFileConfigured: composeFile.length > 0,
    advancedConfig: parseResourceAdvancedConfig(resource.advancedConfig),
    envVarsConfigured: Object.keys(envVars).length > 0,
    domains,
    serverId: resource.serverId,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
  };
}

async function authorizedCompose(
  ctx: any,
  id: string,
  action: "view" | "update" | "delete",
) {
  const resource = await ctx.scope
    .resolve(GetResourceUseCaseToken)
    .execute({ id });
  if (resource?.type !== "compose") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Compose resource not found",
    });
  }
  const environment = await ctx.scope
    .resolve(GetEnvironmentUseCaseToken)
    .execute({ id: resource.environmentId });
  const project = environment
    ? await ctx.scope
        .resolve(GetProjectUseCaseToken)
        .execute({ id: environment.projectId })
    : null;
  if (!project)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Environment not found",
    });
  await checkPermission(
    ctx.session.user.id,
    project.organizationId,
    `resource:${action}`,
  );
  return resource;
}

export const composeRouter = router({
  inspect: twoFactorVerifiedProcedure
    .input(
      z
        .object({ organizationId: z.string().min(1) })
        .merge(InspectComposeInputSchema),
    )
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "resource:create",
      );
      try {
        return await ctx.scope
          .resolve(InspectComposeUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  convert: twoFactorVerifiedProcedure
    .input(
      z
        .object({ organizationId: z.string().min(1) })
        .merge(ConvertComposeInputSchema),
    )
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "resource:create",
      );
      try {
        return await ctx.scope
          .resolve(InspectComposeUseCaseToken)
          .convert(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  create: twoFactorVerifiedProcedure
    .input(CreateComposeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const environment = await ctx.scope
        .resolve(GetEnvironmentUseCaseToken)
        .execute({
          id: input.environmentId,
        });
      const project = environment
        ? await ctx.scope
            .resolve(GetProjectUseCaseToken)
            .execute({ id: environment.projectId })
        : null;
      if (!project)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Environment not found",
        });
      await checkPermission(
        ctx.session.user.id,
        project.organizationId,
        "resource:create",
      );
      try {
        const resource = await ctx.scope
          .resolve(CreateResourceUseCaseToken)
          .execute({
            ...input,
            type: "compose",
            credentials: JSON.stringify({ composeFile: input.composeFile }),
          });
        return composePayload(resource);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  get: twoFactorVerifiedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) =>
      composePayload(await authorizedCompose(ctx, input.id, "view")),
    ),

  update: twoFactorVerifiedProcedure
    .input(UpdateComposeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await authorizedCompose(ctx, input.id, "update");
      const { composeFile, advancedConfig, envVars, domains, ...patch } = input;
      let credentials: string | undefined;
      if (composeFile !== undefined) {
        let current: Record<string, unknown> = {};
        try {
          current = parseResourceCredentials(resource.credentials);
        } catch {
          current = {};
        }
        credentials = JSON.stringify({ ...current, composeFile });
      }
      try {
        const updated = await ctx.scope
          .resolve(UpdateResourceUseCaseToken)
          .execute({
            ...patch,
            ...(credentials ? { credentials } : {}),
            ...(advancedConfig
              ? { advancedConfig: JSON.stringify(advancedConfig) }
              : {}),
            ...(envVars ? { envVars: JSON.stringify(envVars) } : {}),
            ...(domains ? { domains: JSON.stringify(domains) } : {}),
          });
        if (!updated)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Compose resource not found",
          });
        return composePayload(updated);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  deploy: twoFactorVerifiedProcedure
    .input(DeployResourceInputSchema)
    .mutation(async ({ ctx, input }) => {
      await authorizedCompose(ctx, input.id, "update");
      try {
        return composePayload(
          await ctx.scope.resolve(DeployResourceUseCaseToken).execute(input),
        );
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  control: twoFactorVerifiedProcedure
    .input(ControlResourceInputSchema)
    .mutation(async ({ ctx, input }) => {
      await authorizedCompose(ctx, input.id, "update");
      try {
        return composePayload(
          await ctx.scope.resolve(ControlResourceUseCaseToken).execute(input),
        );
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  delete: twoFactorVerifiedProcedure
    .input(DeleteResourceInputSchema)
    .mutation(async ({ ctx, input }) => {
      await authorizedCompose(ctx, input.id, "delete");
      try {
        return await ctx.scope
          .resolve(DeleteResourceUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  randomize: twoFactorVerifiedProcedure
    .input(RandomizeComposeInputSchema)
    .mutation(async ({ ctx, input }) => {
      await authorizedCompose(ctx, input.id, "update");
      try {
        return composePayload(
          await ctx.scope.resolve(RandomizeComposeUseCaseToken).execute(input),
        );
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
