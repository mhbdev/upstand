FROM node:24-slim AS builder
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

ENV NODE_ENV=production
RUN cd apps/fumadocs && bun run build
# standalone output excludes public/; ensure it exists so the runner copy never fails
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
