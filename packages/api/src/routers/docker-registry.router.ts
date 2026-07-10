import { TRPCError } from "@trpc/server";
import { UnitOfWorkToken } from "@upstand/domain";
import {
  CreateDockerRegistryInputSchema,
  DeleteDockerRegistryInputSchema,
  GetDockerRegistriesInputSchema,
  TestDockerRegistryConnectionInputSchema,
} from "@upstand/usecases";
import {
  CreateDockerRegistryUseCaseToken,
  DeleteDockerRegistryUseCaseToken,
  GetDockerRegistriesUseCaseToken,
  TestDockerRegistryConnectionUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

export const dockerRegistryRouter = router({
  create: twoFactorVerifiedProcedure
    .input(CreateDockerRegistryInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "docker_registry:create",
      );

      const useCase = ctx.scope.resolve(CreateDockerRegistryUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  list: twoFactorVerifiedProcedure
    .input(GetDockerRegistriesInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "docker_registry:view",
      );

      const useCase = ctx.scope.resolve(GetDockerRegistriesUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  delete: twoFactorVerifiedProcedure
    .input(DeleteDockerRegistryInputSchema)
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const registry = await uow.dockerRegistryRepository.findById(input.id);
      if (!registry) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Docker registry not found",
        });
      }

      await checkPermission(
        ctx.session.user.id,
        registry.organizationId,
        "docker_registry:delete",
      );

      const useCase = ctx.scope.resolve(DeleteDockerRegistryUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  testConnection: twoFactorVerifiedProcedure
    .input(TestDockerRegistryConnectionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(
        TestDockerRegistryConnectionUseCaseToken,
      );
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
