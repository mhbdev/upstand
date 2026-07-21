FROM oven/bun:1.3.14 AS pruner
WORKDIR /repo
COPY . .
RUN bunx turbo@2.10.5 prune web --docker --out-dir /out

FROM node:24-slim AS builder
COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

COPY --from=pruner /out/json/ ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --ignore-scripts --frozen-lockfile
COPY --from=pruner /out/full/ ./

ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}
ARG NEXT_PUBLIC_IS_CLOUD=false
ENV NEXT_PUBLIC_IS_CLOUD=${NEXT_PUBLIC_IS_CLOUD}
ARG NEXT_PUBLIC_UPSTAND_VERSION=development
ENV NEXT_PUBLIC_UPSTAND_VERSION=${NEXT_PUBLIC_UPSTAND_VERSION}
ENV NODE_ENV=production
RUN cd apps/web && node node_modules/next/dist/bin/next build --webpack
RUN mkdir -p apps/web/public

FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

ENV HOSTNAME=0.0.0.0
ENV PORT=3001
EXPOSE 3001

CMD ["node", "apps/web/server.js"]
