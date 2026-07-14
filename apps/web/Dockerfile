FROM node:24-slim AS builder
COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

COPY package.json bun.lock tsconfig.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/
COPY apps/fumadocs/package.json ./apps/fumadocs/
COPY packages/db/package.json ./packages/db/
COPY packages/env/package.json ./packages/env/
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/ui/package.json ./packages/ui/
COPY packages/redis/package.json ./packages/redis/
COPY packages/repositories/package.json ./packages/repositories/
COPY packages/domain/package.json ./packages/domain/
COPY packages/usecases/package.json ./packages/usecases/
COPY packages/platform/package.json ./packages/platform/
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --ignore-scripts --frozen-lockfile

COPY apps/web ./apps/web
COPY packages/db ./packages/db
COPY packages/env ./packages/env
COPY packages/api ./packages/api
COPY packages/auth ./packages/auth
COPY packages/config ./packages/config
COPY packages/ui ./packages/ui
COPY packages/redis ./packages/redis
COPY packages/repositories ./packages/repositories
COPY packages/domain ./packages/domain
COPY packages/usecases ./packages/usecases
COPY packages/platform ./packages/platform

ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}
ARG NEXT_PUBLIC_UPSTAND_VERSION=development
ENV NEXT_PUBLIC_UPSTAND_VERSION=${NEXT_PUBLIC_UPSTAND_VERSION}
ENV NODE_ENV=production
RUN cd apps/web && node node_modules/next/dist/bin/next build
# standalone output excludes public/; ensure it exists so the runner copy never fails
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
