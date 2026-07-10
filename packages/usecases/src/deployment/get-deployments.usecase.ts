import type { IUnitOfWork } from "@upstand/domain";

export interface DeploymentHistoryResult {
  id: string;
  resourceId: string;
  resourceName: string;
  resourceType: string;
  environmentName: string;
  projectName: string;
  serverId: string | null;
  serverName: string | null;
  title: string;
  status: string;
  logs: string;
  createdAt: string;
}

export class GetDeploymentsUseCase {
  constructor(private readonly uow: IUnitOfWork) {}

  async execute(): Promise<DeploymentHistoryResult[]> {
    // 1. Fetch all deployments from repository
    const deployments = await this.uow.deploymentRepository.findRecent(500);

    // 2. Fetch resources, environments, projects to enrich data
    const resources = await this.uow.resourceRepository.findMany();
    const environments = await this.uow.environmentRepository.findMany();
    const projects = await this.uow.projectRepository.findMany();

    const resourceMap = new Map<string, any>(
      resources.map((r: any) => [r.id, r]),
    );
    const envMap = new Map<string, any>(
      environments.map((e: any) => [e.id, e]),
    );
    const projectMap = new Map<string, any>(
      projects.map((p: any) => [p.id, p]),
    );

    return deployments.map((dep) => {
      const resource = resourceMap.get(dep.resourceId);
      const env = resource ? envMap.get(resource.environmentId) : null;
      const proj = env ? projectMap.get(env.projectId) : null;

      return {
        id: dep.id,
        resourceId: dep.resourceId,
        resourceName: resource?.name || "Unknown Service",
        resourceType: resource?.type || "unknown",
        environmentName: env?.name || "Unknown Env",
        projectName: proj?.name || "Unknown Project",
        serverId: dep.serverId || null,
        serverName: dep.serverName || "Dokploy Server",
        title: dep.title,
        status: dep.status,
        logs: dep.logs,
        createdAt: dep.createdAt.toISOString(),
      };
    });
  }
}
