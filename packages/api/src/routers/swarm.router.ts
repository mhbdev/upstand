import {
  InitSwarmInputSchema,
  RemoveSwarmNodeInputSchema,
  RotateSwarmJoinTokenInputSchema,
  UpdateSwarmNodeInputSchema,
} from "@upstand/usecases";
import { log } from "evlog";
import { z } from "zod";
import { ensureOrganizationAccess } from "../access-control";
import {
  GetSwarmContainersUseCaseToken,
  GetSwarmInfoUseCaseToken,
  GetSwarmJoinCommandsUseCaseToken,
  GetSwarmNodesUseCaseToken,
  InitSwarmUseCaseToken,
  RemoveSwarmNodeUseCaseToken,
  RotateSwarmJoinTokenUseCaseToken,
  UpdateSwarmNodeUseCaseToken,
} from "../di";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";

const SwarmOrganizationInputSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
});

async function requireClusterOwner(userId: string, organizationId: string) {
  await ensureOrganizationAccess(userId, organizationId, ["owner"]);
}

function auditClusterOperation({
  action,
  organizationId,
  userId,
  target,
}: {
  action: string;
  organizationId: string;
  userId: string;
  target?: string;
}) {
  log.info({
    message: "Docker Swarm control-plane operation completed",
    action,
    organizationId,
    userId,
    ...(target ? { target } : {}),
  });
}

export const swarmRouter = router({
  getInfo: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema)
    .query(async ({ ctx, input }) => {
      await requireClusterOwner(ctx.session.user.id, input.organizationId);
      const useCase = ctx.scope.resolve(GetSwarmInfoUseCaseToken);
      try {
        return await useCase.execute();
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getNodes: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema)
    .query(async ({ ctx, input }) => {
      await requireClusterOwner(ctx.session.user.id, input.organizationId);
      const useCase = ctx.scope.resolve(GetSwarmNodesUseCaseToken);
      try {
        return await useCase.execute();
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  updateNode: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema.merge(UpdateSwarmNodeInputSchema))
    .mutation(async ({ ctx, input }) => {
      await requireClusterOwner(ctx.session.user.id, input.organizationId);
      const useCase = ctx.scope.resolve(UpdateSwarmNodeUseCaseToken);
      try {
        const result = await useCase.execute(input);
        auditClusterOperation({
          action: "node.update",
          organizationId: input.organizationId,
          userId: ctx.session.user.id,
          target: input.nodeId,
        });
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  initSwarm: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema.merge(InitSwarmInputSchema))
    .mutation(async ({ ctx, input }) => {
      await requireClusterOwner(ctx.session.user.id, input.organizationId);
      const useCase = ctx.scope.resolve(InitSwarmUseCaseToken);
      try {
        const result = await useCase.execute(input);
        auditClusterOperation({
          action: "cluster.initialize",
          organizationId: input.organizationId,
          userId: ctx.session.user.id,
          target: input.advertiseAddr,
        });
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  removeNode: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema.merge(RemoveSwarmNodeInputSchema))
    .mutation(async ({ ctx, input }) => {
      await requireClusterOwner(ctx.session.user.id, input.organizationId);
      const useCase = ctx.scope.resolve(RemoveSwarmNodeUseCaseToken);
      try {
        const result = await useCase.execute(input);
        auditClusterOperation({
          action: "node.remove",
          organizationId: input.organizationId,
          userId: ctx.session.user.id,
          target: input.nodeId,
        });
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getJoinCommands: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema)
    .query(async ({ ctx, input }) => {
      await requireClusterOwner(ctx.session.user.id, input.organizationId);
      const useCase = ctx.scope.resolve(GetSwarmJoinCommandsUseCaseToken);
      try {
        const result = await useCase.execute();
        auditClusterOperation({
          action: "join-credentials.reveal",
          organizationId: input.organizationId,
          userId: ctx.session.user.id,
        });
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  rotateJoinToken: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema.merge(RotateSwarmJoinTokenInputSchema))
    .mutation(async ({ ctx, input }) => {
      await requireClusterOwner(ctx.session.user.id, input.organizationId);
      const useCase = ctx.scope.resolve(RotateSwarmJoinTokenUseCaseToken);
      try {
        const result = await useCase.execute(input);
        auditClusterOperation({
          action: `join-token.rotate.${input.role}`,
          organizationId: input.organizationId,
          userId: ctx.session.user.id,
        });
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getTasks: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema)
    .query(async ({ ctx, input }) => {
      await requireClusterOwner(ctx.session.user.id, input.organizationId);
      const useCase = ctx.scope.resolve(GetSwarmContainersUseCaseToken);
      try {
        return await useCase.execute();
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
