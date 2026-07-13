import { z } from "zod";

const SERVICE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const MIDDLEWARE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const SAFE_PATH_PATTERN = /^\/(?:[A-Za-z0-9._~!$&'()+,;=:@%-]+\/?)*$/;

export function normalizeDomainHost(value: string): string {
  const suppliedHost = value.trim().replace(/\.$/, "");

  if (
    !suppliedHost ||
    /[/:?#@[\]\\\s]/.test(suppliedHost) ||
    suppliedHost.includes("..")
  ) {
    throw new Error("Enter a valid public hostname without a protocol or port");
  }

  let hostname: string;
  try {
    hostname = new URL(`https://${suppliedHost}`).hostname.toLowerCase();
  } catch {
    throw new Error("Enter a valid public hostname");
  }

  if (!HOSTNAME_PATTERN.test(hostname)) {
    throw new Error(
      "Domains must be fully-qualified hostnames; IP addresses, localhost, and wildcard domains are not supported",
    );
  }

  return hostname;
}

export function normalizeDomainPath(value: string): string {
  const path = value.trim() || "/";

  if (
    !SAFE_PATH_PATTERN.test(path) ||
    path.includes("//") ||
    /(?:^|\/)\.\.?(?:\/|$)/.test(path)
  ) {
    throw new Error(
      "Paths must start with / and cannot contain query strings, fragments, or traversal segments",
    );
  }

  return path.length > 1 ? path.replace(/\/+$/, "") : "/";
}

const DomainMappingInputSchema = z.object({
  host: z.string().min(1).max(253),
  /** Public request path. */
  path: z.string().max(2048).optional().default("/"),
  /** Path prefix expected by the upstream application. */
  internalPath: z.string().max(2048).optional().default("/"),
  stripPath: z.boolean().optional().default(false),
  /** Internal Docker/Swarm service port. */
  port: z.coerce.number().int().min(1).max(65535).optional().default(80),
  /** Required for a compose resource unless its service name is supplied manually. */
  serviceName: z.string().regex(SERVICE_NAME_PATTERN).optional(),
  /** true uses Caddy Automatic HTTPS; false serves HTTP only. */
  https: z.boolean().optional().default(true),
  /** Certificate strategy used by the edge proxy for HTTPS routes. */
  certificateType: z
    .enum(["letsencrypt", "internal"])
    .optional()
    .default("letsencrypt"),
  /** Names of administrator-defined Caddy snippets to import for this route. */
  middlewares: z
    .array(z.string().regex(MIDDLEWARE_NAME_PATTERN))
    .max(16)
    .optional()
    .default([]),
});

export const DomainMappingSchema = DomainMappingInputSchema.transform(
  (mapping, ctx) => {
    try {
      const path = normalizeDomainPath(mapping.path);
      const internalPath = normalizeDomainPath(mapping.internalPath);

      return {
        ...mapping,
        host: normalizeDomainHost(mapping.host),
        path,
        internalPath,
        serviceName: mapping.serviceName?.toLowerCase(),
        certificateType: mapping.https
          ? mapping.certificateType
          : "letsencrypt",
        middlewares: [...new Set(mapping.middlewares)],
      };
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid domain mapping",
      });
      return z.NEVER;
    }
  },
);

export type DomainMapping = {
  host: string;
  path: string;
  internalPath: string;
  stripPath: boolean;
  port: number;
  serviceName?: string;
  https: boolean;
  certificateType: "letsencrypt" | "internal";
  middlewares: string[];
};

/**
 * Parses both the current mapping format and the former `{ host, port }` format.
 * Persisting the normalized result upgrades legacy data without a destructive migration.
 */
export function parseDomainMappings(domainsJson: string): DomainMapping[] {
  let rawMappings: unknown;
  try {
    rawMappings = JSON.parse(domainsJson || "[]");
  } catch {
    throw new Error("Stored domain mappings are not valid JSON");
  }

  const mappings = z.array(DomainMappingSchema).safeParse(rawMappings);
  if (!mappings.success) {
    throw new Error(
      mappings.error.issues
        .map((issue) => `${issue.path.join(".") || "domain"}: ${issue.message}`)
        .join("; "),
    );
  }

  return mappings.data;
}

export function serializeDomainMappings(mappings: DomainMapping[]): string {
  return JSON.stringify(mappings);
}
