import { TRPCError } from "@trpc/server";
import {
  parseResourceAdvancedConfig,
  type Resource,
  ResourcePortSchema,
  ResourceVolumeSchema,
} from "@upstand/domain";
import {
  GetEnvironmentUseCaseToken,
  GetProjectUseCaseToken,
  GetResourceUseCaseToken,
  UpdateResourceUseCaseToken,
} from "@upstand/usecases/tokens";
import { z } from "zod";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

const ResourceIndexInputSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().min(0).max(31),
});

const PortCreateInputSchema = z.object({
  id: z.string().min(1),
  port: ResourcePortSchema,
});
const PortUpdateInputSchema = ResourceIndexInputSchema.extend({
  port: ResourcePortSchema,
});
const VolumeCreateInputSchema = z.object({
  id: z.string().min(1),
  volume: ResourceVolumeSchema,
});
const VolumeUpdateInputSchema = ResourceIndexInputSchema.extend({
  volume: ResourceVolumeSchema,
});
const ResourceIdInputSchema = z.object({ id: z.string().min(1) });

async function authorize(ctx: any, id: string, action: "view" | "update") {
  const resource = await ctx.scope
    .resolve(GetResourceUseCaseToken)
    .execute({ id });
  if (!resource)
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
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
  return resource as Resource;
}

async function updateConfig(
  ctx: any,
  resource: Resource,
  config: ReturnType<typeof parseResourceAdvancedConfig>,
) {
  const updated = await ctx.scope.resolve(UpdateResourceUseCaseToken).execute({
    id: resource.id,
    advancedConfig: JSON.stringify(config),
  });
  if (!updated)
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
  return parseResourceAdvancedConfig(updated.advancedConfig);
}

export const portRouter = router({
  list: twoFactorVerifiedProcedure
    .input(ResourceIdInputSchema)
    .query(async ({ ctx, input }) => {
      const resource = await authorize(ctx, input.id, "view");
      return parseResourceAdvancedConfig(resource.advancedConfig).ports;
    }),
  create: twoFactorVerifiedProcedure
    .input(PortCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await authorize(ctx, input.id, "update");
      const config = parseResourceAdvancedConfig(resource.advancedConfig);
      const duplicate = config.ports.some(
        (port) =>
          port.publishedPort === input.port.publishedPort &&
          port.targetPort === input.port.targetPort &&
          port.protocol === input.port.protocol,
      );
      if (duplicate)
        throw new TRPCError({
          code: "CONFLICT",
          message: "This port mapping already exists",
        });
      config.ports = [...config.ports, input.port];
      return updateConfig(ctx, resource, config).then(
        (updated) => updated.ports,
      );
    }),
  update: twoFactorVerifiedProcedure
    .input(PortUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await authorize(ctx, input.id, "update");
      const config = parseResourceAdvancedConfig(resource.advancedConfig);
      if (!config.ports[input.index])
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Port mapping not found",
        });
      config.ports[input.index] = input.port;
      return updateConfig(ctx, resource, config).then(
        (updated) => updated.ports,
      );
    }),
  delete: twoFactorVerifiedProcedure
    .input(ResourceIndexInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await authorize(ctx, input.id, "update");
      const config = parseResourceAdvancedConfig(resource.advancedConfig);
      if (!config.ports[input.index])
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Port mapping not found",
        });
      config.ports = config.ports.filter((_, index) => index !== input.index);
      return updateConfig(ctx, resource, config).then(
        (updated) => updated.ports,
      );
    }),
});

export const mountRouter = router({
  list: twoFactorVerifiedProcedure
    .input(ResourceIdInputSchema)
    .query(async ({ ctx, input }) => {
      const resource = await authorize(ctx, input.id, "view");
      return parseResourceAdvancedConfig(resource.advancedConfig).volumes;
    }),
  create: twoFactorVerifiedProcedure
    .input(VolumeCreateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await authorize(ctx, input.id, "update");
      const config = parseResourceAdvancedConfig(resource.advancedConfig);
      if (
        config.volumes.some((volume) => volume.target === input.volume.target)
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This mount target already exists",
        });
      }
      config.volumes = [...config.volumes, input.volume];
      return updateConfig(ctx, resource, config).then(
        (updated) => updated.volumes,
      );
    }),
  update: twoFactorVerifiedProcedure
    .input(VolumeUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await authorize(ctx, input.id, "update");
      const config = parseResourceAdvancedConfig(resource.advancedConfig);
      if (!config.volumes[input.index])
        throw new TRPCError({ code: "NOT_FOUND", message: "Mount not found" });
      config.volumes[input.index] = input.volume;
      return updateConfig(ctx, resource, config).then(
        (updated) => updated.volumes,
      );
    }),
  delete: twoFactorVerifiedProcedure
    .input(ResourceIndexInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resource = await authorize(ctx, input.id, "update");
      const config = parseResourceAdvancedConfig(resource.advancedConfig);
      if (!config.volumes[input.index])
        throw new TRPCError({ code: "NOT_FOUND", message: "Mount not found" });
      config.volumes = config.volumes.filter(
        (_, index) => index !== input.index,
      );
      return updateConfig(ctx, resource, config).then(
        (updated) => updated.volumes,
      );
    }),
});
