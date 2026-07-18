import { ServiceCollection } from "@circulo-ai/di";
import { registerApplicationFeatures } from "./di/application";
import { registerBackups } from "./di/backups";
import {
  configureDockerInfrastructure,
  configureMonitoringAgent,
  createDockerInfrastructureResolver,
  createMonitoringAgentPort,
  getDockerInstance,
} from "./di/dependencies";
import { registerPersistence } from "./di/persistence";
import { registerRuntime } from "./di/runtime";
import { validateCompositionGraph } from "./di/validation";
import { registerWebServer } from "./di/web-server";

const services = new ServiceCollection();

configureDockerInfrastructure(
  createDockerInfrastructureResolver(),
  getDockerInstance,
);
configureMonitoringAgent(createMonitoringAgentPort());

export type ServiceProvider = ReturnType<typeof services.build>;
let provider: ServiceProvider | undefined;

export function getServiceProvider(): ServiceProvider {
  if (!provider) throw new Error("Service provider has not been built");
  return provider;
}

registerPersistence(services);
registerApplicationFeatures(services);
registerBackups(services, getServiceProvider);
registerWebServer(services);
registerRuntime(services);

provider = services.build();
validateCompositionGraph(provider);

/** @deprecated Prefer getServiceProvider() so composition stays behind a factory boundary. */
export const serviceProvider = getServiceProvider();
