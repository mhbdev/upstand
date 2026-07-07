import type { ServiceScope } from "@circulo-ai/di";
import { auth } from "@upstand/auth";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext<{ Variables: { scope: ServiceScope } }>;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });

  // Retrieve request-scoped container from Hono context
  const scope = context.get("scope");

  return {
    auth: null,
    session,
    scope,
    honoContext: context,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
