import { TRPCError } from "@trpc/server";
import type { Capability } from "@upstand/domain";
import {
  GetEnvironmentUseCaseToken,
  GetProjectUseCaseToken,
} from "@upstand/usecases/tokens";
import { checkPermission } from "../permissions";

export async function resolveEnvironmentAndCheckPermission(
  ctx: {
    scope: { resolve: <T>(token: any) => T };
    session: { user: { id: string } };
  },
  environmentId: string,
  requiredPermission: Capability,
) {
  const envUseCase = ctx.scope.resolve<any>(GetEnvironmentUseCaseToken);
  const environment = await envUseCase.execute({ id: environmentId });
  if (!environment) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Environment not found",
    });
  }

  const projectUseCase = ctx.scope.resolve<any>(GetProjectUseCaseToken);
  const project = await projectUseCase.execute({
    id: environment.projectId,
  });
  if (!project) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Project not found",
    });
  }

  await checkPermission(
    ctx.session.user.id,
    project.organizationId,
    requiredPermission,
  );

  return { environment, project };
}
