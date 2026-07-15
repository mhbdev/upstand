import type { IUnitOfWork, Resource } from "@upstand/domain";
import type Docker from "dockerode";
import type {
  DockerInfrastructureResolverPort,
  DockerServicePort,
  RemoteDockerConnectionPort,
} from "../ports/docker";
import type { CaddyServicePort } from "../ports/caddy";

let resolver: DockerInfrastructureResolverPort = {
  async resolveDockerServiceForServer(_serverId, _uow, defaultDockerService) {
    return { dockerService: defaultDockerService, cleanup: () => {} };
  },
  async resolveDockerCliEnvironmentForServer() {
    return { environment: {}, cleanup: () => {} };
  },
  async resolveServicesForResource(
    _resource,
    _uow,
    defaultDockerService,
    defaultCaddyService,
  ) {
    return {
      dockerService: defaultDockerService,
      caddyService: defaultCaddyService,
      cleanup: () => {},
    };
  },
  createRemoteServices() {
    throw new Error("Remote Docker infrastructure has not been configured");
  },
};

let dockerClientFactory: (() => Docker) | null = null;

export function configureDockerInfrastructure(
  nextResolver: DockerInfrastructureResolverPort,
  clientFactory: () => Docker,
): void {
  resolver = nextResolver;
  dockerClientFactory = clientFactory;
}

export type DockerService = DockerServicePort;

export function getDockerInstance(): Docker {
  if (!dockerClientFactory) {
    throw new Error("Docker infrastructure has not been configured");
  }
  return dockerClientFactory();
}

export function resolveDockerServiceForServer(
  serverId: string | null | undefined,
  uow: IUnitOfWork,
  defaultDockerService: DockerServicePort,
) {
  return resolver.resolveDockerServiceForServer(
    serverId,
    uow,
    defaultDockerService,
  );
}

export function resolveDockerCliEnvironmentForServer(
  serverId: string | null | undefined,
  uow: IUnitOfWork,
) {
  return resolver.resolveDockerCliEnvironmentForServer(serverId, uow);
}

export function resolveServicesForResource(
  resource: Resource,
  uow: IUnitOfWork,
  defaultDockerService: DockerServicePort,
  defaultCaddyService: CaddyServicePort,
) {
  return resolver.resolveServicesForResource(
    resource,
    uow,
    defaultDockerService,
    defaultCaddyService,
  );
}

export function createRemoteServices(connection: RemoteDockerConnectionPort) {
  return resolver.createRemoteServices(connection);
}
