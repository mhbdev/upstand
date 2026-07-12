import { CreateUserInputSchema } from "@upstand/usecases";
import { CreateUserUseCaseToken } from "../di";
import { handleUseCaseError } from "../errors";
import { protectedProcedure, publicProcedure, router } from "../index";
import { authRouter } from "./auth.router";
import { aiRouter } from "./ai.router";
import { apiKeyRouter } from "./api-key.router";
import { backupRouter } from "./backup.router";
import { deploymentRouter } from "./deployment.router";
import { dockerRegistryRouter } from "./docker-registry.router";
import { environmentRouter } from "./environment.router";
import { gitProviderRouter } from "./git-provider.router";
import { notificationRouter } from "./notification.router";
import { projectRouter } from "./project.router";
import { resourceRouter } from "./resource.router";
import { s3DestinationRouter } from "./s3-destination.router";
import { serverRouter } from "./server.router";
import { sshKeyRouter } from "./ssh-key.router";
import { swarmRouter } from "./swarm.router";
import { userRouter } from "./user.router";
import { webServerRouter } from "./web-server.router";

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
  user: userRouter,
  project: projectRouter,
  environment: environmentRouter,
  resource: resourceRouter,
  sshKey: sshKeyRouter,
  gitProvider: gitProviderRouter,
  s3Destination: s3DestinationRouter,
  auth: authRouter,
  webServer: webServerRouter,
  swarm: swarmRouter,
  deployment: deploymentRouter,
  dockerRegistry: dockerRegistryRouter,
  server: serverRouter,
  notification: notificationRouter,
  backup: backupRouter,
  ai: aiRouter,
  apiKey: apiKeyRouter,
});

export type AppRouter = typeof appRouter;
