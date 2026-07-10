import type { ServiceScope } from "@circulo-ai/di";
import { TRPCError } from "@trpc/server";
import { type IUnitOfWork, UnitOfWorkToken } from "@upstand/domain";
import {
  CreateBackupScheduleInputSchema,
  DeleteBackupScheduleInputSchema,
  GetBackupRunsInputSchema,
  GetBackupSchedulesInputSchema,
  ListBackupVolumesInputSchema,
  RestoreBackupRunInputSchema,
  TriggerBackupRunInputSchema,
  UpdateBackupScheduleInputSchema,
} from "@upstand/usecases";
import {
  BackupSchedulerToken,
  CreateBackupScheduleUseCaseToken,
  DeleteBackupScheduleUseCaseToken,
  GetBackupRunsUseCaseToken,
  GetBackupSchedulesUseCaseToken,
  ListBackupVolumesUseCaseToken,
  RestoreBackupRunUseCaseToken,
  TriggerBackupRunUseCaseToken,
  UpdateBackupScheduleUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission, type PermissionAction } from "../permissions";

async function assertResourcePermission(
  ctx: { session: { user: { id: string } }; scope: ServiceScope },
  resourceId: string,
  permission: PermissionAction,
) {
  const uow = ctx.scope.resolve(UnitOfWorkToken) as IUnitOfWork;
  const resource = await uow.resourceRepository.findById(resourceId);
  if (!resource) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
  }
  const environment = await uow.environmentRepository.findById(
    resource.environmentId,
  );
  if (!environment) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Environment not found",
    });
  }
  const project = await uow.projectRepository.findById(environment.projectId);
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
  await checkPermission(
    ctx.session.user.id,
    project.organizationId,
    permission,
  );
  return resource;
}

export const backupRouter = router({
  listSchedules: twoFactorVerifiedProcedure
    .input(GetBackupSchedulesInputSchema)
    .query(async ({ ctx, input }) => {
      await assertResourcePermission(ctx, input.resourceId, "resource:view");
      try {
        return await ctx.scope
          .resolve(GetBackupSchedulesUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  listRuns: twoFactorVerifiedProcedure
    .input(GetBackupRunsInputSchema)
    .query(async ({ ctx, input }) => {
      await assertResourcePermission(ctx, input.resourceId, "resource:view");
      try {
        return await ctx.scope
          .resolve(GetBackupRunsUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  listVolumes: twoFactorVerifiedProcedure
    .input(ListBackupVolumesInputSchema)
    .query(async ({ ctx, input }) => {
      await assertResourcePermission(ctx, input.resourceId, "resource:view");
      try {
        return await ctx.scope
          .resolve(ListBackupVolumesUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  createSchedule: twoFactorVerifiedProcedure
    .input(CreateBackupScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      await assertResourcePermission(ctx, input.resourceId, "resource:update");
      try {
        const result = await ctx.scope
          .resolve(CreateBackupScheduleUseCaseToken)
          .execute(input);
        await ctx.scope.resolve(BackupSchedulerToken).refresh();
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  updateSchedule: twoFactorVerifiedProcedure
    .input(UpdateBackupScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken) as IUnitOfWork;
      const schedule = await uow.backupScheduleRepository.findById(input.id);
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Backup schedule not found",
        });
      }
      await assertResourcePermission(
        ctx,
        schedule.resourceId,
        "resource:update",
      );
      try {
        const result = await ctx.scope
          .resolve(UpdateBackupScheduleUseCaseToken)
          .execute(input);
        await ctx.scope.resolve(BackupSchedulerToken).refresh();
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  deleteSchedule: twoFactorVerifiedProcedure
    .input(DeleteBackupScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken) as IUnitOfWork;
      const schedule = await uow.backupScheduleRepository.findById(input.id);
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Backup schedule not found",
        });
      }
      await assertResourcePermission(
        ctx,
        schedule.resourceId,
        "resource:update",
      );
      try {
        const result = await ctx.scope
          .resolve(DeleteBackupScheduleUseCaseToken)
          .execute(input);
        await ctx.scope.resolve(BackupSchedulerToken).refresh();
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  runNow: twoFactorVerifiedProcedure
    .input(TriggerBackupRunInputSchema)
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken) as IUnitOfWork;
      const schedule = await uow.backupScheduleRepository.findById(
        input.scheduleId,
      );
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Backup schedule not found",
        });
      }
      await assertResourcePermission(
        ctx,
        schedule.resourceId,
        "resource:update",
      );
      try {
        return await ctx.scope
          .resolve(TriggerBackupRunUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  restore: twoFactorVerifiedProcedure
    .input(RestoreBackupRunInputSchema)
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken) as IUnitOfWork;
      const run = await uow.backupRunRepository.findById(input.runId);
      if (!run) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Backup run not found",
        });
      }
      await assertResourcePermission(ctx, run.resourceId, "resource:update");
      try {
        await ctx.scope.resolve(RestoreBackupRunUseCaseToken).execute(input);
        return { restored: true };
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
