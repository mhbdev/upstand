import { z } from "zod";

export const UpGalPageContextSchema = z.object({
  path: z.string().trim().min(1).max(512),
  title: z.string().trim().min(1).max(200).optional(),
});

export type UpGalPageContext = z.infer<typeof UpGalPageContextSchema>;

export type DescribedUpGalPageContext = UpGalPageContext & {
  description: string;
  routeParameters: Record<string, string>;
};

type PageRoute = {
  pattern: RegExp;
  description: string;
  parameterNames?: readonly string[];
};

const PAGE_ROUTES: readonly PageRoute[] = [
  {
    pattern: /^\/projects\/([^/]+)\/([^/]+)\/([^/]+)\/?$/,
    description:
      "Resource details, configuration, deployments, logs, and runtime controls.",
    parameterNames: ["projectId", "environmentId", "resourceId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/([^/]+)\/?$/,
    description: "Environment details and the resources deployed within it.",
    parameterNames: ["projectId", "environmentId"],
  },
  {
    pattern: /^\/projects\/([^/]+)\/?$/,
    description: "Project details and its environments.",
    parameterNames: ["projectId"],
  },
  {
    pattern: /^\/projects\/?$/,
    description: "Projects in the active organization.",
  },
  {
    pattern: /^\/dashboard\/?$/,
    description: "Organization overview and operational account status.",
  },
  {
    pattern: /^\/deployments\/?$/,
    description: "Deployment history, status, and logs.",
  },
  {
    pattern: /^\/docker\/?$/,
    description: "Docker containers, images, volumes, and networks.",
  },
  {
    pattern: /^\/docker-swarm\/?$/,
    description: "Docker Swarm cluster status, nodes, and controls.",
  },
  {
    pattern: /^\/remote-servers\/?$/,
    description: "Remote deploy, build, and database servers.",
  },
  {
    pattern: /^\/monitoring\/?$/,
    description: "Server monitoring metrics, history, and alert thresholds.",
  },
  {
    pattern: /^\/web-server\/?$/,
    description: "Caddy web server configuration, routes, and access logs.",
  },
  {
    pattern: /^\/templates\/?$/,
    description: "Reusable application and Docker Compose templates.",
  },
  {
    pattern: /^\/notifications\/?$/,
    description: "Notification channels, event subscriptions, and deliveries.",
  },
  {
    pattern: /^\/requests\/?$/,
    description: "Recent HTTP request activity and diagnostics.",
  },
  {
    pattern: /^\/audit-logs\/?$/,
    description: "Organization audit events and actor activity.",
  },
  {
    pattern: /^\/settings\/ai\/?$/,
    description: "UpGal provider, model, and API credential settings.",
  },
  {
    pattern: /^\/settings\/(sso|scim)\/?$/,
    description: "Organization identity-provider integration settings.",
    parameterNames: ["identityProtocol"],
  },
];

function decodeRouteValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function describeUpGalPage(
  page: UpGalPageContext,
): DescribedUpGalPageContext {
  for (const route of PAGE_ROUTES) {
    const match = page.path.match(route.pattern);
    if (!match) continue;

    const routeParameters = Object.fromEntries(
      (route.parameterNames ?? []).flatMap((name, index) => {
        const value = match[index + 1];
        return value ? [[name, decodeRouteValue(value)]] : [];
      }),
    );

    return { ...page, description: route.description, routeParameters };
  }

  return {
    ...page,
    description: page.title
      ? `The ${page.title} dashboard page.`
      : "An Upstand dashboard page.",
    routeParameters: {},
  };
}
