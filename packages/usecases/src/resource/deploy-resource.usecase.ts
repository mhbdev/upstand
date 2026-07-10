import type { IUnitOfWork, Resource } from "@upstand/domain";
import { z } from "zod";
import {
  type DeploymentQueueFactory,
  QueueDeploymentUseCase,
} from "../deployment/queue-deployment.usecase";

export const DeployResourceInputSchema = z.object({
  id: z.string().min(1, "Resource ID is required"),
});

export type DeployResourceInput = z.infer<typeof DeployResourceInputSchema>;

export class DeployResourceUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly queueFactory?: DeploymentQueueFactory,
  ) {}

  async execute(input: DeployResourceInput): Promise<Resource> {
    const queueUseCase = new QueueDeploymentUseCase(
      this.uow,
      this.queueFactory,
    );
    return await queueUseCase.execute({
      resourceId: input.id,
      title: "Manual deployment",
    });
  }
}
