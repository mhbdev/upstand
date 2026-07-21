import type { ServiceScope } from "@circulo-ai/di";
import {
  InitSwarmInputSchema,
  RemoveSwarmNodeInputSchema,
  RotateSwarmJoinTokenInputSchema,
  UpdateSwarmNodeInputSchema,
} from "@upstand/usecases";
import {
  GetSwarmContainersUseCaseToken,
  GetSwarmInfoUseCaseToken,
  GetSwarmJoinCommandsUseCaseToken,
  GetSwarmNodesUseCaseToken,
  InitSwarmUseCaseToken,
  PublishNotificationUseCaseToken,
  RemoveSwarmNodeUseCaseToken,
  RotateSwarmJoinTokenUseCaseToken,
  UpdateSwarmNodeUseCaseToken,
} from "@upstand/usecases/tokens";
import { log } from "evlog";
import { z } from "zod";
import { handleUseCaseError } from "../errors";
import { router, twoFactorVerifiedProcedure } from "../index";
import { authorizeContextCapability } from "../permissions";

const SwarmOrganizationInputSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
});

async function requireClusterOwner(
  ctx: Parameters<typeof authorizeContextCapability>[0],
  organizationId: string,
) {
  await authorizeContextCapability(ctx, organizationId, "swarm:manage");
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

async function notifyClusterOperation(
  scope: Pick<ServiceScope, "resolve">,
  input: {
    organizationId: string;
    event:
      | "cluster_initialized"
      | "cluster_node_updated"
      | "cluster_node_removed"
      | "cluster_token_rotated";
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  },
) {
  await scope
    .resolve(PublishNotificationUseCaseToken)
    .execute({
      ...input,
      idempotencyKey: `cluster:${input.event}:${input.organizationId}:${JSON.stringify(input.metadata ?? {})}`,
    })
    .catch((error) => {
      log.error({
        message: "Unable to queue cluster notification",
        event: input.event,
        organizationId: input.organizationId,
        err: error instanceof Error ? error.message : String(error),
      });
    });
}

export const swarmRouter = router({
  getInfo: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema)
    .query(async ({ ctx, input }) => {
      await requireClusterOwner(ctx, input.organizationId);
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
      await requireClusterOwner(ctx, input.organizationId);
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
      await requireClusterOwner(ctx, input.organizationId);
      const useCase = ctx.scope.resolve(UpdateSwarmNodeUseCaseToken);
      try {
        const result = await useCase.execute(input);
        auditClusterOperation({
          action: "node.update",
          organizationId: input.organizationId,
          userId: ctx.session.user.id,
          target: input.nodeId,
        });
        await notifyClusterOperation(ctx.scope, {
          organizationId: input.organizationId,
          event: "cluster_node_updated",
          title: "Docker Swarm node updated",
          message: `Swarm node ${input.nodeId} was updated.`,
          metadata: {
            nodeId: input.nodeId,
            availability: input.availability,
            role: input.role,
          },
        });
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  initSwarm: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema.merge(InitSwarmInputSchema))
    .mutation(async ({ ctx, input }) => {
      await requireClusterOwner(ctx, input.organizationId);
      const useCase = ctx.scope.resolve(InitSwarmUseCaseToken);
      try {
        const result = await useCase.execute(input);
        auditClusterOperation({
          action: "cluster.initialize",
          organizationId: input.organizationId,
          userId: ctx.session.user.id,
          target: input.advertiseAddr,
        });
        await notifyClusterOperation(ctx.scope, {
          organizationId: input.organizationId,
          event: "cluster_initialized",
          title: "Docker Swarm cluster initialized",
          message:
            "Upstand initialized Docker Swarm and prepared its overlay network.",
          metadata: {
            swarmId: result.swarmId,
            networkName: result.networkName,
          },
        });
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  removeNode: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema.merge(RemoveSwarmNodeInputSchema))
    .mutation(async ({ ctx, input }) => {
      await requireClusterOwner(ctx, input.organizationId);
      const useCase = ctx.scope.resolve(RemoveSwarmNodeUseCaseToken);
      try {
        const result = await useCase.execute(input);
        auditClusterOperation({
          action: "node.remove",
          organizationId: input.organizationId,
          userId: ctx.session.user.id,
          target: input.nodeId,
        });
        await notifyClusterOperation(ctx.scope, {
          organizationId: input.organizationId,
          event: "cluster_node_removed",
          title: "Docker Swarm node removed",
          message: `Swarm node ${input.nodeId} was drained and removed.`,
          metadata: { nodeId: input.nodeId },
        });
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getJoinCommands: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema)
    .query(async ({ ctx, input }) => {
      await requireClusterOwner(ctx, input.organizationId);
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

  getJoinCommand: twoFactorVerifiedProcedure
    .input(
      SwarmOrganizationInputSchema.extend({
        role: z.enum(["worker", "manager"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireClusterOwner(ctx, input.organizationId);
      const result = await ctx.scope
        .resolve(GetSwarmJoinCommandsUseCaseToken)
        .execute();
      auditClusterOperation({
        action: `join-credentials.reveal.${input.role}`,
        organizationId: input.organizationId,
        userId: ctx.session.user.id,
      });
      return {
        role: input.role,
        command:
          input.role === "worker"
            ? result.workerCommand
            : result.managerCommand,
        advertiseAddress: result.advertiseAddress,
      };
    }),

  rotateJoinToken: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema.merge(RotateSwarmJoinTokenInputSchema))
    .mutation(async ({ ctx, input }) => {
      await requireClusterOwner(ctx, input.organizationId);
      const useCase = ctx.scope.resolve(RotateSwarmJoinTokenUseCaseToken);
      try {
        const result = await useCase.execute(input);
        auditClusterOperation({
          action: `join-token.rotate.${input.role}`,
          organizationId: input.organizationId,
          userId: ctx.session.user.id,
        });
        await notifyClusterOperation(ctx.scope, {
          organizationId: input.organizationId,
          event: "cluster_token_rotated",
          title: `Docker Swarm ${input.role} token rotated`,
          message: `The ${input.role} join token was rotated.`,
          metadata: { role: input.role },
        });
        return result;
      } catch (error) {
        handleUseCaseError(error);
      }
    }),

  getTasks: twoFactorVerifiedProcedure
    .input(SwarmOrganizationInputSchema)
    .query(async ({ ctx, input }) => {
      await requireClusterOwner(ctx, input.organizationId);
      const useCase = ctx.scope.resolve(GetSwarmContainersUseCaseToken);
      try {
        return await useCase.execute();
      } catch (error) {
        handleUseCaseError(error);
      }
    }),
});
