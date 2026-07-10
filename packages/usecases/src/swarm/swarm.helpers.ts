import { isIP } from "node:net";
import { ConflictError, ValidationError } from "@upstand/domain";
import type Docker from "dockerode";

export const UPSTAND_SWARM_NETWORK =
  process.env.DOCKER_NETWORK || "upstand-network";

export interface DockerSwarmInfo {
  Swarm?: {
    LocalNodeState?: string;
    ControlAvailable?: boolean;
    NodeID?: string;
    NodeAddr?: string;
    Nodes?: number;
  };
}

export interface DockerSwarmNode {
  ID: string;
  Description?: {
    Hostname?: string;
    Engine?: { EngineVersion?: string };
  };
  Spec?: {
    Name?: string;
    Labels?: Record<string, string>;
    Role?: string;
    Availability?: string;
  };
  Status?: { State?: string; Addr?: string };
  Version?: { Index?: number };
  ManagerStatus?: {
    Leader?: boolean;
    Addr?: string;
    Reachability?: string;
  };
}

export interface DockerOverlayNetwork {
  Id: string;
  Driver: string;
  Scope: string;
  Attachable: boolean;
}

export interface DockerNetworkCreateResult {
  id?: string;
  Id?: string;
}

const LOOPBACK_OR_UNSPECIFIED_ADDRESSES = new Set([
  "0.0.0.0",
  "::",
  "::1",
  "localhost",
]);

export function validateSwarmAddress(value: string, field: string): string {
  const address = value.trim();

  if (!address) {
    throw new ValidationError(`${field} is required.`);
  }

  if (
    LOOPBACK_OR_UNSPECIFIED_ADDRESSES.has(address.toLowerCase()) ||
    address.startsWith("127.")
  ) {
    throw new ValidationError(
      `${field} must be a routable address. Loopback and unspecified addresses cannot form a production Swarm.`,
    );
  }

  if (isIP(address)) {
    return address;
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(address)) {
    throw new ValidationError(
      `${field} must be an IP address, network interface, or DNS hostname without a port.`,
    );
  }

  return address;
}

export function validateSwarmAddressPools(
  pools: string[],
  subnetSize: number,
): string[] {
  const normalized = pools.map((pool) => pool.trim()).filter(Boolean);
  if (!normalized.length) {
    throw new ValidationError("At least one overlay address pool is required.");
  }

  const families = new Set<number>();
  for (const pool of normalized) {
    const [address, prefix, ...rest] = pool.split("/");
    const family = address ? isIP(address) : 0;
    const prefixLength = Number(prefix);
    const maxPrefix = family === 6 ? 128 : 32;

    if (
      rest.length ||
      !family ||
      !Number.isInteger(prefixLength) ||
      prefixLength < 0 ||
      prefixLength >= subnetSize ||
      subnetSize > maxPrefix
    ) {
      throw new ValidationError(
        `Overlay address pool '${pool}' is invalid for a /${subnetSize} subnet size.`,
      );
    }

    families.add(family);
  }

  if (families.size > 1) {
    throw new ValidationError(
      "Use either IPv4 or IPv6 overlay address pools, not a mixture of both.",
    );
  }

  return [...new Set(normalized)];
}

export function formatSwarmEndpoint(address: string): string {
  return isIP(address) === 6 ? `[${address}]:2377` : `${address}:2377`;
}

export function isSwarmActive(info: DockerSwarmInfo): boolean {
  return info?.Swarm?.LocalNodeState === "active";
}

export function isManager(info: DockerSwarmInfo): boolean {
  return isSwarmActive(info) && info.Swarm?.ControlAvailable === true;
}

export async function requireActiveManager(
  docker: Docker,
): Promise<DockerSwarmInfo> {
  const info = (await docker.info()) as DockerSwarmInfo;

  if (!isSwarmActive(info)) {
    throw new ConflictError(
      "Docker Swarm is inactive. Initialize a cluster before managing it.",
    );
  }

  if (!isManager(info)) {
    throw new ConflictError(
      "This Upstand instance is attached to a Swarm worker. Connect the control plane to a manager node to manage the cluster.",
    );
  }

  return info;
}

export async function ensureUpstandOverlayNetwork(
  docker: Docker,
): Promise<{ id: string; created: boolean }> {
  const network = docker.getNetwork(UPSTAND_SWARM_NETWORK);

  try {
    const existing = (await network.inspect()) as DockerOverlayNetwork;
    if (
      existing.Driver !== "overlay" ||
      existing.Scope !== "swarm" ||
      existing.Attachable !== true
    ) {
      throw new ConflictError(
        `Network '${UPSTAND_SWARM_NETWORK}' exists but is not an attachable Swarm overlay network. Rename or remove it before continuing.`,
      );
    }

    return { id: existing.Id, created: false };
  } catch (error: unknown) {
    if (error instanceof ConflictError) {
      throw error;
    }

    if (!isDockerNotFoundError(error)) {
      throw error;
    }
  }

  const created = (await docker.createNetwork({
    Name: UPSTAND_SWARM_NETWORK,
    Driver: "overlay",
    Attachable: true,
    CheckDuplicate: true,
    Labels: {
      "com.upstand.managed": "true",
      "com.upstand.purpose": "application-routing",
    },
  })) as DockerNetworkCreateResult;

  return {
    id: created.id || created.Id || UPSTAND_SWARM_NETWORK,
    created: true,
  };
}

export function isDockerNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 404
  );
}

export function managerNodeCount(nodes: DockerSwarmNode[]): number {
  return nodes.filter((node) => node.Spec?.Role === "manager").length;
}

export function activeManagerNodeCount(nodes: DockerSwarmNode[]): number {
  return nodes.filter(
    (node) =>
      node.Spec?.Role === "manager" &&
      node.Spec?.Availability === "active" &&
      node.Status?.State === "ready" &&
      node.ManagerStatus?.Reachability !== "unreachable",
  ).length;
}

export function assertSafeManagerRemoval(
  target: DockerSwarmNode,
  nodes: DockerSwarmNode[],
  localNodeId?: string,
): void {
  if (target.ID === localNodeId) {
    throw new ConflictError(
      "The manager running Upstand cannot be changed from this control plane. Perform this operation from another reachable manager.",
    );
  }

  if (target.ManagerStatus?.Leader) {
    throw new ConflictError(
      "The current Swarm leader cannot be demoted or removed. Elect another leader first.",
    );
  }

  if (target.Spec?.Role === "manager" && managerNodeCount(nodes) <= 1) {
    throw new ConflictError(
      "Refusing to remove the cluster's last manager. Promote a reachable worker first.",
    );
  }
}

export function dockerErrorMessage(
  action: string,
  error: unknown,
): ValidationError | ConflictError {
  const message = error instanceof Error ? error.message : String(error);

  if (/out of sequence|update out of sequence|version/i.test(message)) {
    return new ConflictError(
      `${action} could not be applied because the cluster changed. Refresh and try again.`,
    );
  }

  return new ValidationError(`${action} failed: ${message}`);
}
