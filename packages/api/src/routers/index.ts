import { CreateUserInputSchema } from "@upstand/usecases";
import { CreateUserUseCaseToken } from "../di";
import { handleUseCaseError } from "../errors";
import { protectedProcedure, publicProcedure, router } from "../index";
import { userRouter } from "./user.router";
export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  createUser: publicProcedure
    .input(CreateUserInputSchema)
    .mutation(async ({ ctx, input }) => {
      const useCase = ctx.scope.resolve(CreateUserUseCaseToken);
      try {
        return await useCase.execute(input);
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
  user: userRouter
});

export type AppRouter = typeof appRouter;
