import type { IUnitOfWork } from "@upstand/domain";
import type {
  DeploymentHistoryResult,
  GetDeploymentsUseCase,
} from "./get-deployments.usecase";
import type { GetQueueUseCase, QueueJobResult } from "./get-queue.usecase";

export class GetRequestsUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly getDeployments: GetDeploymentsUseCase,
    private readonly getQueue: GetQueueUseCase,
  ) {}

  async execute(organizationId: string): Promise<{
    deployments: DeploymentHistoryResult[];
    queue: QueueJobResult[];
    generatedAt: Date;
  }> {
    const projects =
      await this.uow.projectRepository.findByOrganizationId(organizationId);
    const projectIds = new Set(projects.map((project) => project.id));
    const environments = await this.uow.environmentRepository.findMany();
    const environmentIds = new Set(
      environments
        .filter((environment) => projectIds.has(environment.projectId))
        .map((environment) => environment.id),
    );
    const resources = await this.uow.resourceRepository.findMany();
    const resourceIds = resources
      .filter((resource) => environmentIds.has(resource.environmentId))
      .map((resource) => resource.id);
    const [deployments, queue] = await Promise.all([
      this.getDeployments.execute(resourceIds),
      this.getQueue.execute(resourceIds),
    ]);
    return {
      deployments,
      queue,
      generatedAt: new Date(),
    };
  }
}
