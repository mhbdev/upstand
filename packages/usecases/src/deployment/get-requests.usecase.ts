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
    const environments = [];
    for (const projectId of projectIds) {
      const envs =
        await this.uow.environmentRepository.findByProjectId(projectId);
      environments.push(...envs);
    }
    const environmentIds = new Set(environments.map((env) => env.id));
    const resources = [];
    for (const envId of environmentIds) {
      const res = await this.uow.resourceRepository.findByEnvironmentId(envId);
      resources.push(...res);
    }
    const resourceIds = resources.map((resource) => resource.id);
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
