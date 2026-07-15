import type { ServiceScope } from "@circulo-ai/di";
import { TRPCError } from "@trpc/server";
import {
  CreateBackupScheduleInputSchema,
  CreateWebServerBackupScheduleInputSchema,
  DeleteBackupScheduleInputSchema,
  GetBackupRunsInputSchema,
  GetBackupSchedulesInputSchema,
  ListBackupVolumesInputSchema,
  ListComposeServicesInputSchema,
  RestoreBackupRunInputSchema,
  TriggerBackupRunInputSchema,
  UpdateBackupScheduleInputSchema,
} from "@upstand/usecases";
import {
  BackupSchedulerToken,
  CreateBackupScheduleUseCaseToken,
  CreateWebServerBackupScheduleUseCaseToken,
  DeleteBackupScheduleUseCaseToken,
  GetBackupRunsUseCaseToken,
  GetBackupSchedulesUseCaseToken,
  ListBackupVolumesUseCaseToken,
  ListComposeServicesUseCaseToken,
  RestoreBackupRunUseCaseToken,
  TriggerBackupRunUseCaseToken,
  UnitOfWorkToken,
  UpdateBackupScheduleUseCaseToken,
  UpdateWebServerBackupScheduleUseCaseToken,
} from "@upstand/usecases/tokens";
import { z } from "zod";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission, type PermissionAction } from "../permissions";

async function assertResourcePermission(
  ctx: { session: { user: { id: string } }; scope: ServiceScope },
  resourceId: string,
  permission: PermissionAction,
) {
  const uow = ctx.scope.resolve(UnitOfWorkToken);
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

async function assertOrganizationPermission(
  ctx: { session: { user: { id: string } } },
  organizationId: string,
  permission: PermissionAction,
): Promise<void> {
  await checkPermission(ctx.session.user.id, organizationId, permission);
}

async function assertWebServerSchedulePermission(
  ctx: { session: { user: { id: string } }; scope: ServiceScope },
  scheduleId: string,
  permission: PermissionAction,
) {
  const uow = ctx.scope.resolve(UnitOfWorkToken);
  const schedule = await uow.backupScheduleRepository.findById(scheduleId);
  if (schedule?.kind !== "web-server") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Web-server backup schedule not found",
    });
  }
  await assertOrganizationPermission(ctx, schedule.organizationId, permission);
  return schedule;
}

export const backupRouter = router({
  listWebServerSchedules: twoFactorVerifiedProcedure
    .input(z.object({ organizationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertOrganizationPermission(
        ctx,
        input.organizationId,
        "backup:view",
      );
      const schedules = await ctx.scope
        .resolve(UnitOfWorkToken)
        .backupScheduleRepository.findByOrganizationId(input.organizationId);
      return schedules
        .filter((schedule) => schedule.kind === "web-server")
        .map(
          ({ encryptedConfiguration: _encryptedConfiguration, ...schedule }) =>
            schedule,
        );
    }),

  listWebServerRuns: twoFactorVerifiedProcedure
    .input(
      z.object({
        organizationId: z.string().min(1),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertOrganizationPermission(
        ctx,
        input.organizationId,
        "backup:view",
      );
      const runs = await ctx.scope
        .resolve(UnitOfWorkToken)
        .backupRunRepository.findByOrganizationId(
          input.organizationId,
          input.limit,
        );
      return runs.filter((run) => run.kind === "web-server");
    }),

  createWebServerSchedule: twoFactorVerifiedProcedure
    .input(CreateWebServerBackupScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      await assertOrganizationPermission(
        ctx,
        input.organizationId,
        "backup:manage",
      );
      try {
        const result = await ctx.scope
          .resolve(CreateWebServerBackupScheduleUseCaseToken)
          .execute(input);
        await ctx.scope.resolve(BackupSchedulerToken).refresh();
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  updateWebServerSchedule: twoFactorVerifiedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        organizationId: z.string().min(1),
        destinationId: z.string().min(1).optional(),
        name: z.string().trim().min(1).max(120).optional(),
        cronExpression: z.string().trim().min(1).max(120).optional(),
        timezone: z.string().trim().min(1).max(120).optional(),
        prefix: z.string().trim().max(512).optional(),
        retentionCount: z
          .number()
          .int()
          .positive()
          .max(3650)
          .nullable()
          .optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertWebServerSchedulePermission(ctx, input.id, "backup:manage");
      try {
        const result = await ctx.scope
          .resolve(UpdateWebServerBackupScheduleUseCaseToken)
          .execute(input);
        await ctx.scope.resolve(BackupSchedulerToken).refresh();
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  deleteWebServerSchedule: twoFactorVerifiedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertWebServerSchedulePermission(ctx, input.id, "backup:manage");
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

  runWebServerNow: twoFactorVerifiedProcedure
    .input(z.object({ scheduleId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertWebServerSchedulePermission(
        ctx,
        input.scheduleId,
        "backup:manage",
      );
      try {
        return await ctx.scope
          .resolve(TriggerBackupRunUseCaseToken)
          .execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  restoreWebServer: twoFactorVerifiedProcedure
    .input(
      z.object({
        runId: z.string().min(1),
        confirm: z.literal("RESTORE_WEB_SERVER"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const run = await uow.backupRunRepository.findById(input.runId);
      if (run?.kind !== "web-server") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Web-server backup run not found",
        });
      }
      await assertOrganizationPermission(
        ctx,
        run.organizationId,
        "backup:manage",
      );
      try {
        await ctx.scope.resolve(RestoreBackupRunUseCaseToken).execute(input);
        return { restored: true };
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

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

  listComposeServices: twoFactorVerifiedProcedure
    .input(ListComposeServicesInputSchema)
    .query(async ({ ctx, input }) => {
      await assertResourcePermission(ctx, input.resourceId, "resource:view");
      try {
        return await ctx.scope
          .resolve(ListComposeServicesUseCaseToken)
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
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const schedule = await uow.backupScheduleRepository.findById(input.id);
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Backup schedule not found",
        });
      }
      if (schedule.kind === "web-server") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use the web-server backup schedule endpoint",
        });
      }
      if (!schedule.resourceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Backup schedule has no resource",
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
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const schedule = await uow.backupScheduleRepository.findById(input.id);
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Backup schedule not found",
        });
      }
      if (schedule.kind === "web-server") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use the web-server backup schedule endpoint",
        });
      }
      if (!schedule.resourceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Backup schedule has no resource",
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
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const schedule = await uow.backupScheduleRepository.findById(
        input.scheduleId,
      );
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Backup schedule not found",
        });
      }
      if (schedule.kind === "web-server") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use the web-server backup endpoint",
        });
      }
      if (!schedule.resourceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Backup schedule has no resource",
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
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const run = await uow.backupRunRepository.findById(input.runId);
      if (!run) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Backup run not found",
        });
      }
      if (run.kind === "web-server") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Use the web-server restore endpoint",
        });
      }
      if (!run.resourceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Backup run has no resource",
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
