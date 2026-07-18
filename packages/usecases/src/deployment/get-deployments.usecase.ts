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

  async executeForOrganization(
    organizationId: string,
  ): Promise<DeploymentHistoryResult[]> {
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
    return this.execute(
      resources
        .filter((resource) => environmentIds.has(resource.environmentId))
        .map((resource) => resource.id),
    );
  }

  async execute(
    resourceIds?: readonly string[],
  ): Promise<DeploymentHistoryResult[]> {
    // Deployment history is always scoped to known resource IDs. The optional
    // argument is used by organization-aware callers; the unscoped form is
    // retained for internal maintenance tooling only.
    const resources = resourceIds
      ? await Promise.all(
          resourceIds.map((resourceId) =>
            this.uow.resourceRepository.findById(resourceId),
          ),
        ).then((items) => items.filter((resource) => resource !== null))
      : await this.uow.resourceRepository.findMany();
    const deployments = resourceIds
      ? await this.uow.deploymentRepository.findRecentByResourceIds(
          resourceIds,
          500,
        )
      : await this.uow.deploymentRepository.findRecent(500);

    // Fetch environments and projects to enrich data
    const environments = await this.uow.environmentRepository.findMany();
    const projects = await this.uow.projectRepository.findMany();

    const resourceMap = new Map(
      resources.map((resource) => [resource.id, resource]),
    );
    const envMap = new Map(
      environments.map((environment) => [environment.id, environment]),
    );
    const projectMap = new Map(
      projects.map((project) => [project.id, project]),
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
