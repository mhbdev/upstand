# Upstand

Upstand is a self-hostable control plane for deploying applications and databases, managing Docker resources, configuring Caddy, and operating remote servers from one web interface. It is a Bun/TypeScript monorepo built with Next.js, Hono, tRPC, Drizzle, PostgreSQL, Redis, Docker Swarm, and Better Auth.

The repository is public and welcomes focused, well-tested contributions. The documentation site contains the operational guides; this file is the shortest reliable path from checkout to a working development environment.

## What Upstand provides

- Owner-first authentication and organization access control.
- Application and database deployment workflows backed by queues.
- Remote-server registration, SSH-key management, and an owner-only SSH terminal.
- Docker Swarm inspection, node operations, cleanup actions, and notifications.
- Caddy configuration, domains, TLS/ACME settings, route snippets, and access logs.
- Backups, notification channels, audit-friendly job state, and self-hosted updates.
- A production installer (`install.sh`) for immutable release images or reproducible source builds.

## Repository map

```text
apps/web/       Next.js dashboard and PWA
apps/server/    Hono API, tRPC adapter, workers, migrations, terminal broker
apps/fumadocs/  User and operator documentation
packages/domain/ Enterprise entities, value objects, errors, and repository ports
packages/usecases/ Application workflows, service ports, and operational services
packages/infrastructure/ External provider adapters owned by the composition edge
packages/db/    Drizzle schema, migrations, and database infrastructure
packages/repositories/ Persistence adapters implementing domain repository ports
packages/redis/ Redis connection and queue runtime infrastructure
packages/platform/ Cross-cutting crypto and SSH platform capabilities
packages/auth/  Better Auth infrastructure and identity adapters
packages/api/   Interface adapters, tRPC routers, and the composition root
packages/ui/    Shared UI primitives and design tokens
packages/env/   Validated server/client environment configuration
install.sh      Self-hosted installation and upgrade entry point
docker-compose.local.yml  Bind-mounted local development stack
docker-compose.prod.yml   Production Docker Swarm stack used by install.sh
```

Dependencies point inward: apps and API adapters compose infrastructure and
application services; persistence implements contracts owned by the domain;
the domain never imports an outer workspace package, and use cases never import
API, auth, database, repository, environment, or UI adapters. Typed DI
tokens are declared only in `packages/usecases/src/tokens.ts` and
`packages/repositories/src/tokens.ts`. Consumers must import those tokens rather
than reconstructing their names with `Symbol.for(...)`. These rules are checked
by `packages/config/src/architecture.test.ts` and Turborepo's boundary checker.
See [ARCHITECTURE.md](ARCHITECTURE.md) for the package responsibilities and the
decision to retain a focused platform package.

## Prerequisites

For local development install:

- [Bun 1.3.14](https://bun.sh) (the version is pinned in `package.json`).
- Docker Engine and Docker Compose v2.
- Git.

Production self-hosting requires a Linux Docker Swarm manager with a routable advertise address, DNS or wildcard DNS for the dashboard/API origins, and ports 80/443 plus the Swarm and SSH ports required by your topology. Follow the [self-hosting guide](apps/fumadocs/content/docs/self-hosting.mdx) and [Swarm guide](apps/fumadocs/content/docs/docker-swarm.mdx).

## Local development

```bash
git clone https://github.com/mhbdev/upstand.git
cd upstand
bun install --frozen-lockfile
Create local ignored environment files using the variables documented in the self-hosting guide. Never commit them.
bun run docker:local:up
bun run db:push
bun run dev
```

Open `http://localhost:3001` for the dashboard and `http://localhost:3000` for the API. The first account created in a new database becomes the owner. Local Compose services provide PostgreSQL and Redis; never reuse production credentials locally.

Useful focused commands:

```bash
bun run dev:web
bun run dev:server
bun run check-types
bun run lint
bun test packages
bun run build
bun run db:generate
bun run db:migrate
bun run db:studio
```

Use `bun run check` only when you intentionally want Biome to write formatting changes. Before a pull request, prefer the read-only checks above and inspect the resulting diff.

## API documentation

The server exposes the generated OpenAPI contract at `/api/openapi.json` and
the interactive Swagger UI at `/api/docs/`. The REST-compatible routes under
`/api` delegate to the canonical tRPC procedures, so existing authentication,
authorization, rate limiting, and auditing remain in effect.

## Configuration

Server variables are validated in `packages/env`. At minimum, development needs a PostgreSQL URL, Redis connection details, Better Auth URL/secret, CORS origin, and the SSH-key encryption key. Production secrets are generated as Docker secrets under `/etc/upstand/secrets/`; non-secret origins and image metadata remain in `/etc/upstand/.env`. Protect both paths.

The public web build receives `NEXT_PUBLIC_SERVER_URL` at image build time. In production it must be the HTTPS API origin, never `localhost`. Release images should be pinned by digest. `UPSTAND_AUTO_UPDATE=true` enables opt-in stable-channel checks every 30 minutes; source installations are intentionally not auto-updated.

## Production installation

The supported path is the installer from a tagged GitHub release:

```bash
curl --fail --location https://raw.githubusercontent.com/mhbdev/upstand/master/install.sh -o install.sh
chmod 700 install.sh
sudo ./install.sh
```

Set `BETTER_AUTH_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_SERVER_URL`, and (for immutable deployments) the three `UPSTAND_*_IMAGE` digest variables before running it. The installer validates Swarm, creates the attachable overlay network, generates missing secrets, writes a mode-0600 environment file, deploys the stack, and waits for readiness. Re-running it is the normal upgrade and repair operation. See [updates](apps/fumadocs/content/docs/updates.mdx) for rollback and channel policy.

## Architecture and operational docs

Start with the [documentation index](apps/fumadocs/content/docs/index.mdx):

- [Getting started](apps/fumadocs/content/docs/getting-started.mdx)
- [Self-hosting](apps/fumadocs/content/docs/self-hosting.mdx)
- [Remote servers](apps/fumadocs/content/docs/remote-servers.mdx)
- [Deployments](apps/fumadocs/content/docs/deployments.mdx)
- [Docker Swarm](apps/fumadocs/content/docs/docker-swarm.mdx)
- [Updates and channels](apps/fumadocs/content/docs/updates.mdx)
- [Troubleshooting](apps/fumadocs/content/docs/troubleshooting.mdx)

## Contribution and project hygiene

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security issues belong in [SECURITY.md](SECURITY.md), not in a public issue. The expected community standards are in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and support boundaries are in [SUPPORT.md](SUPPORT.md). Release notes are maintained in [CHANGELOG.md](CHANGELOG.md).
