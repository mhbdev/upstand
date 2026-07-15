import { CreateUserInputSchema } from "@upstand/usecases";
import { CreateUserUseCaseToken } from "@upstand/usecases/tokens";
import { handleUseCaseError } from "../errors";
import { publicProcedure, router } from "../index";

export const userRouter = router({
  create: publicProcedure
    .input(CreateUserInputSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(CreateUserUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
