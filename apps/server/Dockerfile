FROM buildpacksio/pack:0.39.1 AS buildpacks
FROM docker/buildx-bin:0.16.2 AS buildx

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
COPY packages/domain/package.json ./packages/domain/
COPY packages/usecases/package.json ./packages/usecases/
COPY packages/infrastructure/package.json ./packages/infrastructure/
COPY packages/platform/package.json ./packages/platform/

# Install all dependencies without running postinstall scripts (which require source files)
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --ignore-scripts --frozen-lockfile

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
COPY packages/domain ./packages/domain
COPY packages/usecases ./packages/usecases
COPY packages/infrastructure ./packages/infrastructure
COPY packages/platform ./packages/platform

# Compile the Hono application
RUN cd apps/server && bun run build

# Runner stage
FROM oven/bun:1.3.14-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

ARG TARGETARCH
ARG NIXPACKS_VERSION=1.41.0

# Install system dependencies needed by deployment worker and rclone testing
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    docker-cli \
    rclone \
    ca-certificates \
    curl \
    tar \
    python3 \
    make \
    g++ \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Nixpacks is pinned at image-build time, so production deployments never run a
# mutable installer. Railpack is intentionally downloaded per configured release
# by the worker because an application can select its own Railpack version.
RUN case "$TARGETARCH" in \
      amd64) NIXPACKS_TARGET="x86_64-unknown-linux-musl" ;; \
      arm64) NIXPACKS_TARGET="aarch64-unknown-linux-musl" ;; \
      *) echo "Unsupported Nixpacks architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl --fail --location --retry 3 --retry-all-errors \
      "https://github.com/railwayapp/nixpacks/releases/download/v${NIXPACKS_VERSION}/nixpacks-v${NIXPACKS_VERSION}-${NIXPACKS_TARGET}.tar.gz" \
      --output /tmp/nixpacks.tar.gz \
    && tar -xzf /tmp/nixpacks.tar.gz -C /usr/local/bin \
    && chmod 0755 /usr/local/bin/nixpacks \
    && rm /tmp/nixpacks.tar.gz

COPY --from=buildpacks /usr/local/bin/pack /usr/local/bin/pack
COPY --from=buildx /buildx /usr/libexec/docker/cli-plugins/docker-buildx
RUN chmod 0755 /usr/libexec/docker/cli-plugins/docker-buildx && docker buildx version

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
COPY packages/domain/package.json ./packages/domain/
COPY packages/usecases/package.json ./packages/usecases/
COPY packages/infrastructure/package.json ./packages/infrastructure/
COPY packages/platform/package.json ./packages/platform/

# Fumadocs owns a workspace postinstall hook. It must have its source config
# available while Bun installs production dependencies, even though it is not
# included in the final server command.
COPY apps/fumadocs ./apps/fumadocs
COPY packages/infrastructure ./packages/infrastructure
COPY packages/platform ./packages/platform

# Install production dependencies with their platform-specific install steps.
# This is required by ssh2's optional native CPU-feature module used for remote
# server provisioning; the lockfile remains frozen for reproducibility.
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --production --frozen-lockfile

# Copy the built output from builder stage
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/packages/db/src/migrations ./packages/db/src/migrations
COPY apps/server/docker-entrypoint.sh ./apps/server/docker-entrypoint.sh
RUN chmod 0755 ./apps/server/docker-entrypoint.sh

ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/app/apps/server/docker-entrypoint.sh"]
CMD ["bun", "run", "apps/server/dist/index.mjs"]
