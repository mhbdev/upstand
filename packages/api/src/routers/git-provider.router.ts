import { TRPCError } from "@trpc/server";
import { UnitOfWorkToken } from "@upstand/domain";
import {
  CreateGitProviderInputSchema,
  DeleteGitProviderInputSchema,
  GetGitProvidersInputSchema,
  ListGitBranchesInputSchema,
  ListGitRepositoriesInputSchema,
} from "@upstand/usecases";
import {
  CreateGitProviderUseCaseToken,
  DeleteGitProviderUseCaseToken,
  GetGitProvidersUseCaseToken,
  ListGitBranchesUseCaseToken,
  ListGitRepositoriesUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { checkPermission } from "../permissions";

export const gitProviderRouter = router({
  create: twoFactorVerifiedProcedure
    .input(CreateGitProviderInputSchema)
    .mutation(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "git_provider:create",
      );

      const useCase = ctx.scope.resolve(CreateGitProviderUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  list: twoFactorVerifiedProcedure
    .input(GetGitProvidersInputSchema)
    .query(async ({ ctx, input }) => {
      await checkPermission(
        ctx.session.user.id,
        input.organizationId,
        "git_provider:view",
      );

      const useCase = ctx.scope.resolve(GetGitProvidersUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  delete: twoFactorVerifiedProcedure
    .input(DeleteGitProviderInputSchema)
    .mutation(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const provider = await uow.gitProviderRepository.findById(input.id);
      if (!provider) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Git Provider not found",
        });
      }

      await checkPermission(
        ctx.session.user.id,
        provider.organizationId,
        "git_provider:delete",
      );

      const deleteUseCase = ctx.scope.resolve(DeleteGitProviderUseCaseToken);
      try {
        return await deleteUseCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  listRepositories: twoFactorVerifiedProcedure
    .input(ListGitRepositoriesInputSchema)
    .query(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const provider = await uow.gitProviderRepository.findById(
        input.gitProviderId,
      );
      if (!provider) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Git Provider not found",
        });
      }

      await checkPermission(
        ctx.session.user.id,
        provider.organizationId,
        "git_provider:view",
      );

      const useCase = ctx.scope.resolve(ListGitRepositoriesUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  listBranches: twoFactorVerifiedProcedure
    .input(ListGitBranchesInputSchema)
    .query(async ({ ctx, input }) => {
      const uow = ctx.scope.resolve(UnitOfWorkToken);
      const provider = await uow.gitProviderRepository.findById(
        input.gitProviderId,
      );
      if (!provider) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Git Provider not found",
        });
      }

      await checkPermission(
        ctx.session.user.id,
        provider.organizationId,
        "git_provider:view",
      );

      const useCase = ctx.scope.resolve(ListGitBranchesUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
