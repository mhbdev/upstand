import { TRPCError } from "@trpc/server";
import {
  CreateScheduleInputSchema,
  DeleteScheduleInputSchema,
  GetSchedulesInputSchema,
  UpdateScheduleInputSchema,
} from "@upstand/domain";
import {
  CreateScheduleUseCaseToken,
  DeleteScheduleUseCaseToken,
  GeneralSchedulerToken,
  GetEnvironmentUseCaseToken,
  GetProjectUseCaseToken,
  GetResourceUseCaseToken,
  GetSchedulesUseCaseToken,
  UnitOfWorkToken,
  UpdateScheduleUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission, type PermissionAction } from "../permissions";

async function authorizeResource(
  ctx: any,
  resourceId: string,
  action: PermissionAction,
) {
  const resource = await ctx.scope
    .resolve(GetResourceUseCaseToken)
    .execute({ id: resourceId });
  if (!resource) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
  }
  const environment = await ctx.scope
    .resolve(GetEnvironmentUseCaseToken)
    .execute({ id: resource.environmentId });
  const project = environment
    ? await ctx.scope.resolve(GetProjectUseCaseToken).execute({
        id: environment.projectId,
      })
    : null;
  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found",
    });
  }
  await checkPermission(ctx.session.user.id, project.organizationId, action);
  return resource;
}

export const scheduleRouter = router({
  list: twoFactorVerifiedProcedure
    .input(GetSchedulesInputSchema)
    .query(async ({ ctx, input }) => {
      await authorizeResource(ctx, input.resourceId, "resource:view");
      return ctx.scope.resolve(GetSchedulesUseCaseToken).execute(input);
    }),
  create: twoFactorVerifiedProcedure
    .input(CreateScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      await authorizeResource(ctx, input.resourceId, "resource:update");
      try {
        const result = await ctx.scope
          .resolve(CreateScheduleUseCaseToken)
          .execute(input);
        await ctx.scope.resolve(GeneralSchedulerToken).refresh();
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
  update: twoFactorVerifiedProcedure
    .input(UpdateScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.scope
        .resolve(UnitOfWorkToken)
        .scheduleRepository.findById(input.id);
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        });
      }
      await authorizeResource(
        ctx,
        schedule.resourceId || "",
        "resource:update",
      );
      try {
        const result = await ctx.scope
          .resolve(UpdateScheduleUseCaseToken)
          .execute(input);
        await ctx.scope.resolve(GeneralSchedulerToken).refresh();
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
  runNow: twoFactorVerifiedProcedure
    .input(DeleteScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.scope
        .resolve(UnitOfWorkToken)
        .scheduleRepository.findById(input.id);
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        });
      }
      await authorizeResource(
        ctx,
        schedule.resourceId || "",
        "resource:update",
      );
      await ctx.scope.resolve(GeneralSchedulerToken).executeNow(input.id);
      return { accepted: true };
    }),
  delete: twoFactorVerifiedProcedure
    .input(DeleteScheduleInputSchema)
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.scope
        .resolve(UnitOfWorkToken)
        .scheduleRepository.findById(input.id);
      if (!schedule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Schedule not found",
        });
      }
      await authorizeResource(
        ctx,
        schedule.resourceId || "",
        "resource:update",
      );
      const deleted = await ctx.scope
        .resolve(DeleteScheduleUseCaseToken)
        .execute(input);
      await ctx.scope.resolve(GeneralSchedulerToken).refresh();
      return { deleted };
    }),
});
