import { randomUUID } from "node:crypto";
import {
  createUpGalResponse,
  createUpGalTools,
  executeUpGalReadTool,
  getConversationForUser,
  getUpGalToolNamesForUser,
  isUpGalToolName,
  saveIncomingMessages,
  UPGAL_TOOL_METADATA,
  type UpGalUIMessage,
  validateAndRecoverUpGalMessages,
} from "@upstand/api/ai/upgal";
import { classifyUpGalError } from "@upstand/api/ai/upgal-errors";
import { UpGalPageContextSchema } from "@upstand/api/ai/upgal-page-context";
import {
  authenticateApiKey,
  setApiKeyRateLimitHeaders,
} from "@upstand/api/api-key-auth";
import { auth } from "@upstand/api/auth";
import { authorizeMcpTool, checkPermission } from "@upstand/api/permissions";
import { isJsonObject } from "@upstand/domain";
import { AIRepositoryToken } from "@upstand/repositories/tokens";
import type { Hono } from "hono";
import { z } from "zod";
import { createHttpRateLimitMiddleware } from "../rate-limit";
import type { AppEnv } from "../types";

export function registerAiRoutes(app: Hono<AppEnv>): void {
  app.use(
    "/api/ai/chat",
    createHttpRateLimitMiddleware({
      path: "api.ai.chat",
      profile: "default",
      onRejected: (c, message) => c.json({ error: message }, 429),
      resolveIdentity: async (c, ip) => {
        const session = await auth.api.getSession({
          headers: c.req.raw.headers,
        });
        return {
          identifier: session ? `user:${session.user.id}` : `ip:${ip}`,
          hasSession: Boolean(session),
        };
      },
    }),
  );

  app.post("/api/ai/chat", async (c) => {
    const requestLog = c.get("log");
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Authentication required" }, 401);
    const bodyResult = z
      .object({
        organizationId: z.string().min(1),
        conversationId: z.string().min(1).optional(),
        page: UpGalPageContextSchema.optional(),
        messages: z.unknown(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!bodyResult.success)
      return c.json({ error: "Invalid UpGal request" }, 400);
    const body = bodyResult.data;
    await checkPermission(session.user.id, body.organizationId, "ai:view");
    const conversationId = body.conversationId || randomUUID();
    const ownedConversation = await getConversationForUser(
      conversationId,
      body.organizationId,
      session.user.id,
      c.get("scope").resolve(AIRepositoryToken),
    );
    if (body.conversationId && !ownedConversation)
      return c.json({ error: "Conversation not found" }, 404);
    if (!ownedConversation)
      await c
        .get("scope")
        .resolve(AIRepositoryToken)
        .createConversation({
          id: conversationId,
          organizationId: body.organizationId,
          userId: session.user.id,
          context: body.page ? { page: body.page } : {},
        });
    const context = {
      organizationId: body.organizationId,
      userId: session.user.id,
      userName: session.user.name?.trim() || undefined,
      page: body.page,
      conversationId,
      runId: randomUUID(),
      scope: c.get("scope"),
      log: c.get("log"),
      allowedToolNames: await getUpGalToolNamesForUser(
        session.user.id,
        body.organizationId,
      ),
    };
    const tools = createUpGalTools(context);
    let messages: UpGalUIMessage[];
    try {
      messages = await validateAndRecoverUpGalMessages(body.messages, tools);
    } catch (error) {
      requestLog.warn(
        "Rejected UpGal request with unrecoverable UI message history",
        {
          organizationId: body.organizationId,
          conversationId,
          messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
          err: error,
        },
      );
      return c.json(
        {
          error:
            "UpGal could not read this conversation history. Start a new message to continue.",
        },
        400,
      );
    }
    try {
      await saveIncomingMessages(
        conversationId,
        messages,
        c.get("scope").resolve(AIRepositoryToken),
        body.organizationId,
        session.user.id,
      );
      return await createUpGalResponse(context, messages, c.req.raw);
    } catch (error) {
      const info = classifyUpGalError(error);
      requestLog.error(error instanceof Error ? error : String(error), {
        message: "UpGal request failed before streaming started",
        organizationId: body.organizationId,
        conversationId,
        code: info.code,
        retryable: info.retryable,
      });
      return c.json(
        {
          error: info.userMessage,
          code: info.code,
          retryable: info.retryable,
        },
        info.status,
      );
    }
  });

  app.all("/api/mcp", async (c) => {
    const requestLog = c.get("log");
    const authorization = c.req.header("authorization") || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    const key = token
      ? await authenticateApiKey(new Headers({ "x-api-key": token }))
      : null;
    if (!key) return c.json({ error: "Invalid or expired API key" }, 401);
    setApiKeyRateLimitHeaders(key, (name, value) => c.header(name, value));
    const bodyResult = z
      .object({
        id: z.union([z.string(), z.number(), z.null()]).optional(),
        method: z.string(),
        params: z.record(z.string(), z.json()).optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!bodyResult.success)
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid MCP request" },
        },
        400,
      );
    const body = bodyResult.data;
    const id = body.id ?? null;
    const canUseMcpTool = async (name: string) => {
      if (!isUpGalToolName(name)) return false;
      try {
        await authorizeMcpTool(key, name);
        return true;
      } catch {
        return false;
      }
    };
    if (body.method === "initialize")
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "upstand-upgal", version: "1.0.0" },
        },
      });
    if (body.method === "tools/list")
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: (
            await Promise.all(
              UPGAL_TOOL_METADATA.map(async ([name, description, mutation]) =>
                (await canUseMcpTool(name))
                  ? { name, description, mutation }
                  : null,
              ),
            )
          )
            .filter((tool): tool is NonNullable<typeof tool> => tool !== null)
            .map(({ name, description, mutation }) => ({
              name,
              description,
              annotations: {
                destructiveHint: mutation,
                readOnlyHint: !mutation,
              },
            })),
        },
      });
    if (body.method === "tools/call") {
      const name = body.params?.name;
      const args = body.params?.arguments ?? {};
      if (typeof name !== "string" || !isJsonObject(args))
        return c.json(
          {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32602,
              message: "Tool name and object arguments are required",
            },
          },
          400,
        );
      const metadata = UPGAL_TOOL_METADATA.find(
        ([toolName]) => toolName === name,
      );
      if (!metadata || !isUpGalToolName(name) || !(await canUseMcpTool(name)))
        return c.json({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32602,
            message: "Tool is not available for this API key",
          },
        });
      if (metadata[2])
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: "Mutating MCP tools must be approved through the UpGal dashboard.",
              },
            ],
          },
        });
      try {
        const result = await executeUpGalReadTool(name, args, {
          organizationId: key.organizationId,
          userId: key.userId,
          conversationId: randomUUID(),
          runId: randomUUID(),
          scope: c.get("scope"),
          log: requestLog,
        });
        return c.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(result) }] },
        });
      } catch (error) {
        const info = classifyUpGalError(error);
        requestLog.warn("UpGal MCP tool execution failed", {
          toolName: name,
          organizationId: key.organizationId,
          code: info.code,
        });
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [{ type: "text", text: info.userMessage }],
          },
        });
      }
    }
    return c.json(
      {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not found" },
      },
      404,
    );
  });
}
