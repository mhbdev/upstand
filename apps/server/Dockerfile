FROM oven/bun:1.3.14 AS builder
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

# Copy monorepo configuration files to fetch dependencies
COPY package.json bun.lock tsconfig.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/fumadocs/package.json ./apps/fumadocs/
COPY packages/db/package.json ./packages/db/
COPY packages/env/package.json ./packages/env/
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/ui/package.json ./packages/ui/
COPY packages/redis/package.json ./packages/redis/
COPY packages/repositories/package.json ./packages/repositories/

# Install all dependencies without running postinstall scripts (which require source files)
RUN bun install --ignore-scripts --frozen-lockfile

# Copy codebase
COPY apps/server ./apps/server
COPY packages/db ./packages/db
COPY packages/env ./packages/env
COPY packages/api ./packages/api
COPY packages/auth ./packages/auth
COPY packages/config ./packages/config
COPY packages/ui ./packages/ui
COPY packages/redis ./packages/redis
COPY packages/repositories ./packages/repositories

# Run postinstall scripts now that source code is copied
RUN cd apps/fumadocs && bun run postinstall

# Compile the Hono application
RUN cd apps/server && bun run build

# Runner stage
FROM oven/bun:1.3.14-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy configurations and lockfile
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/fumadocs/package.json ./apps/fumadocs/
COPY packages/db/package.json ./packages/db/
COPY packages/env/package.json ./packages/env/
COPY packages/api/package.json ./packages/api/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/ui/package.json ./packages/ui/
COPY packages/redis/package.json ./packages/redis/
COPY packages/repositories/package.json ./packages/repositories/

# Install only production dependencies without running postinstall scripts
RUN bun install --production --ignore-scripts --frozen-lockfile

# Copy the built output from builder stage
COPY --from=builder /app/apps/server/dist ./apps/server/dist

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "run", "apps/server/dist/index.mjs"]
