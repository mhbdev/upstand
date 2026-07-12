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
packages/api/   tRPC routers and dependency-injection registrations
packages/usecases/ Domain workflows and integrations
packages/domain/ Entities, repositories, validation, and crypto contracts
packages/db/    Drizzle schema, migrations, and database adapter
packages/auth/  Better Auth configuration
packages/repositories/ Persistence implementations
packages/ui/    Shared UI primitives and design tokens
packages/env/   Validated server/client environment configuration
install.sh      Self-hosted installation and upgrade entry point
docker-compose*.yml  Local, development, and production topologies
```

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
cp .env.example .env  # if maintaining a local env file; see packages/env for required values
bun run db:start
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

## Configuration

Server variables are validated in `packages/env`. At minimum, development needs a PostgreSQL URL, Redis connection details, Better Auth URL/secret, CORS origin, and the SSH-key encryption key. Production values are generated and persisted by `install.sh` in `/etc/upstand/.env`; protect that file as a secret.

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

## License

The repository does not currently declare a license file. Until the project owner publishes one, treat the source as all-rights-reserved and do not redistribute it. Contributions are accepted under the terms selected by the project owner.
