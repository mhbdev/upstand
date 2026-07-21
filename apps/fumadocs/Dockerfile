FROM oven/bun:1.3.14 AS pruner
WORKDIR /repo
COPY . .
RUN bunx turbo@2.10.5 prune fumadocs --docker --out-dir /out

FROM node:24-slim AS builder
COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1
ENV SKIP_TYPECHECK=1

COPY --from=pruner /out/json/ ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --ignore-scripts --frozen-lockfile
COPY --from=pruner /out/full/ ./

ENV NODE_ENV=production
RUN cd apps/fumadocs && bun run generate
RUN cd apps/fumadocs && node node_modules/next/dist/bin/next build
RUN mkdir -p apps/fumadocs/public

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/fumadocs/.next/standalone ./
COPY --from=builder /app/apps/fumadocs/.next/static ./apps/fumadocs/.next/static
COPY --from=builder /app/apps/fumadocs/public ./apps/fumadocs/public

ENV HOSTNAME=0.0.0.0
ENV PORT=4000
EXPOSE 4000

CMD ["node", "apps/fumadocs/server.js"]
