import {
  createMCPClient,
  type MCPClient,
  mcpAppClientCapabilities,
  splitMCPAppTools,
} from "@ai-sdk/mcp";
import { env } from "@upstand/env/server";
import type { Tool } from "ai";
import { log } from "evlog";
import { z } from "zod";

const serverSchema = z.object({
  id: z.string().trim().min(1).max(40),
  url: z.url(),
  headers: z.record(z.string(), z.string()).optional(),
});

const serversSchema = z.array(serverSchema).max(10);
type MCPAppTools = Record<string, Tool<unknown, unknown>>;

export type UpGalMCPAppConnection = {
  tools: MCPAppTools;
  close: () => Promise<void>;
};

function configuredServers() {
  const raw = env.UPGAL_MCP_SERVERS?.trim();
  if (!raw) return [];

  try {
    const parsed = serversSchema.parse(JSON.parse(raw));
    return parsed.filter((server) => {
      const url = new URL(server.url);
      return url.protocol === "https:" || url.hostname === "localhost";
    });
  } catch (error) {
    log.warn({
      message: "Ignoring invalid UPGAL_MCP_SERVERS configuration",
      err: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function toolKey(serverId: string, toolName: string) {
  const safeServerId = serverId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeToolName = toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `mcp_${safeServerId}_${safeToolName}`;
}

function prefixedTools(
  serverId: string,
  tools: Record<string, Tool<unknown, unknown>>,
): MCPAppTools {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      toolKey(serverId, name),
      {
        ...tool,
        description: `[MCP app: ${serverId}] ${tool.description ?? name}`,
      },
    ]),
  ) as unknown as MCPAppTools;
}

/**
 * Load optional operator-configured MCP servers for one agent run.
 * External servers are opt-in, HTTPS/localhost-only, namespaced, and
 * approval-gated by the UpGal agent.
 */
export async function connectUpGalMCPApps(): Promise<UpGalMCPAppConnection> {
  const clients: MCPClient[] = [];
  const tools: MCPAppTools = {};

  for (const server of configuredServers()) {
    try {
      const client = await createMCPClient({
        clientName: "upgal",
        version: "1.0.0",
        capabilities: mcpAppClientCapabilities,
        maxRetries: 1,
        transport: {
          type: "http",
          url: server.url,
          headers: server.headers,
          redirect: "error",
        },
      });
      clients.push(client);

      const definitions = await client.listTools();
      const { modelVisible } = splitMCPAppTools(definitions);
      Object.assign(
        tools,
        prefixedTools(
          server.id,
          client.toolsFromDefinitions(modelVisible) as unknown as Record<
            string,
            Tool<unknown, unknown>
          >,
        ),
      );
    } catch (error) {
      log.warn({
        message: "UpGal MCP app connection unavailable",
        serverId: server.id,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    tools,
    close: async () => {
      await Promise.all(
        clients.map(async (client) => {
          try {
            await client.close();
          } catch (error) {
            log.warn({
              message: "Failed to close UpGal MCP app connection",
              err: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );
    },
  };
}
