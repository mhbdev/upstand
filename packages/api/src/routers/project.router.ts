import { CreateProjectInputSchema } from "@upstand/usecases";
import { CreateProjectUseCaseToken } from "../di";
import { handleUseCaseError } from "../errors";
import { protectedProcedure, router } from "../index";

export const projectRouter = router({
  create: protectedProcedure
    .input(CreateProjectInputSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(CreateProjectUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
