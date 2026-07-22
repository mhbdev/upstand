import { TRPCError } from "@trpc/server";
import {
  CreateSecretProviderInputSchema,
  CreateSecretRotationScheduleInputSchema,
  ListSecretVersionsInputSchema,
  RestoreSecretVersionInputSchema,
  RotateSecretsInputSchema,
  SyncSecretProviderInputSchema,
  UpdateSecretProviderInputSchema,
  UpdateSecretRotationScheduleInputSchema,
} from "@upstand/usecases";
import {
  CreateSecretProviderUseCaseToken,
  CreateSecretRotationScheduleUseCaseToken,
  DeleteSecretProviderUseCaseToken,
  DeleteSecretRotationScheduleUseCaseToken,
  GetProjectUseCaseToken,
  ListSecretProvidersUseCaseToken,
  ListSecretRotationSchedulesUseCaseToken,
  ListSecretVersionsUseCaseToken,
  RestoreSecretVersionUseCaseToken,
  RotateSecretsUseCaseToken,
  SyncSecretProviderUseCaseToken,
  UnitOfWorkToken,
  UpdateSecretProviderUseCaseToken,
  UpdateSecretRotationScheduleUseCaseToken,
} from "@upstand/usecases/tokens";
import { z } from "zod";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

async function organizationForScope(
  ctx: any,
  scopeType: "environment" | "resource",
  scopeId: string,
): Promise<string> {
  const uow = ctx.scope.resolve(UnitOfWorkToken);
  const environment =
    scopeType === "environment"
      ? await uow.environmentRepository.findById(scopeId)
      : (() => Promise.resolve(null))();
  const resource =
    scopeType === "resource"
      ? await uow.resourceRepository.findById(scopeId)
      : null;
  const resolvedEnvironment =
    environment ??
    (resource
      ? await uow.environmentRepository.findById(resource.environmentId)
      : null);
  if (!resolvedEnvironment)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Secret scope not found",
    });
  const project = await ctx.scope
    .resolve(GetProjectUseCaseToken)
    .execute({ id: resolvedEnvironment.projectId });
  if (!project)
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  return project.organizationId;
}

export const secretRouter = router({
  versions: twoFactorVerifiedProcedure
    .input(ListSecretVersionsInputSchema)
    .query(async ({ ctx, input }) => {
      const organizationId = await organizationForScope(
        ctx,
        input.scopeType,
        input.scopeId,
      );
      await checkPermission(
        ctx.session.user.id,
        organizationId,
        "resource:view",
      );
      return ctx.scope.resolve(ListSecretVersionsUseCaseToken).execute(input);
    }),
  restore: twoFactorVerifiedProcedure
    .input(RestoreSecretVersionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = await organizationForScope(
        ctx,
        input.scopeType,
        input.scopeId,
      );
      await checkPermission(
        ctx.session.user.id,
        organizationId,
        "resource:update",
      );
      await ctx.scope.resolve(RestoreSecretVersionUseCaseToken).execute(input);
      return { success: true };
    }),
  providers: twoFactorVerifiedProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const organizationId = input.organizationId;
      await checkPermission(
        ctx.session.user.id,
        organizationId,
        "resource:view",
      );
      return ctx.scope
        .resolve(ListSecretProvidersUseCaseToken)
        .execute(organizationId);
    }),
  createProvider: twoFactorVerifiedProcedure
    .input(CreateSecretProviderInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "environment:update",
      );
      return ctx.scope.resolve(CreateSecretProviderUseCaseToken).execute(input);
    }),
  deleteProvider: twoFactorVerifiedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const provider = await ctx.scope
        .resolve(UnitOfWorkToken)
        .secretProviderRepository.findById(input.id);
      if (!provider)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Secret provider not found",
        });
      await checkPermission(
        ctx.session.user.id,
        provider.organizationId,
        "environment:update",
      );
      await ctx.scope
        .resolve(DeleteSecretProviderUseCaseToken)
        .execute(input.id);
      return { success: true };
    }),
  updateProvider: twoFactorVerifiedProcedure
    .input(UpdateSecretProviderInputSchema)
    .mutation(async ({ ctx, input }) => {
      const provider = await ctx.scope
        .resolve(UnitOfWorkToken)
        .secretProviderRepository.findById(input.id);
      if (!provider)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Secret provider not found",
        });
      await checkPermission(
        ctx.session.user.id,
        provider.organizationId,
        "environment:update",
      );
      return ctx.scope.resolve(UpdateSecretProviderUseCaseToken).execute(input);
    }),
  sync: twoFactorVerifiedProcedure
    .input(SyncSecretProviderInputSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = await organizationForScope(
        ctx,
        input.scopeType,
        input.scopeId,
      );
      await checkPermission(
        ctx.session.user.id,
        organizationId,
        "resource:update",
      );
      return ctx.scope.resolve(SyncSecretProviderUseCaseToken).execute(input);
    }),
  rotate: twoFactorVerifiedProcedure
    .input(RotateSecretsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = await organizationForScope(
        ctx,
        input.scopeType,
        input.scopeId,
      );
      await checkPermission(
        ctx.session.user.id,
        organizationId,
        "resource:update",
      );
      return ctx.scope.resolve(RotateSecretsUseCaseToken).execute(input);
    }),
  rotationSchedules: twoFactorVerifiedProcedure
    .input(ListSecretVersionsInputSchema)
    .query(async ({ ctx, input }) => {
      const organizationId = await organizationForScope(
        ctx,
        input.scopeType,
        input.scopeId,
      );
      await checkPermission(
        ctx.session.user.id,
        organizationId,
        "resource:view",
      );
      return ctx.scope
        .resolve(ListSecretRotationSchedulesUseCaseToken)
        .execute(input.scopeType, input.scopeId);
    }),
  createRotationSchedule: twoFactorVerifiedProcedure
    .input(CreateSecretRotationScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const organizationId = await organizationForScope(
        ctx,
        input.scopeType,
        input.scopeId,
      );
      if (organizationId !== input.organizationId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Secret scope belongs to another organization",
        });
      await checkPermission(
        ctx.session.user.id,
        organizationId,
        "resource:update",
      );
      return ctx.scope
        .resolve(CreateSecretRotationScheduleUseCaseToken)
        .execute(input);
    }),
  updateRotationSchedule: twoFactorVerifiedProcedure
    .input(UpdateSecretRotationScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.scope
        .resolve(UnitOfWorkToken)
        .secretRotationScheduleRepository?.findById(input.id);
      if (!schedule)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Secret rotation schedule not found",
        });
      await checkPermission(
        ctx.session.user.id,
        schedule.organizationId,
        "resource:update",
      );
      return ctx.scope
        .resolve(UpdateSecretRotationScheduleUseCaseToken)
        .execute(input);
    }),
  deleteRotationSchedule: twoFactorVerifiedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.scope
        .resolve(UnitOfWorkToken)
        .secretRotationScheduleRepository?.findById(input.id);
      if (!schedule)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Secret rotation schedule not found",
        });
      await checkPermission(
        ctx.session.user.id,
        schedule.organizationId,
        "resource:update",
      );
      return ctx.scope
        .resolve(DeleteSecretRotationScheduleUseCaseToken)
        .execute(input.id);
    }),
});
