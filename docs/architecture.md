# Architecture

Upstand uses a dependency-inward package structure:

```text
domain <- usecases <- api/server/web
   ^        ^
   |        |
platform, db, repositories, redis
```

## Layer responsibilities

- `@upstand/domain` contains entities, value objects, and repository/unit-of-work contracts. It has no framework, database, DI, Node platform, SSH, or encryption implementation dependencies.
- `@upstand/usecases` contains application workflows and their composition tokens. Workflows receive persistence and service abstractions through constructors; tests use in-memory fakes.
- `@upstand/db`, `@upstand/repositories`, `@upstand/redis`, and `@upstand/platform` contain infrastructure adapters. `@upstand/platform` owns platform-specific encryption and SSH-key operations.
- `@upstand/api`, `apps/server`, and `apps/web` are interface adapters and composition roots. They wire concrete adapters to application ports and expose HTTP/UI behavior.

## Enforcement

`bun run architecture:check` scans the domain and application source trees for forbidden inward-boundary imports. `bun run knip` checks unused files, exports, and dependencies. Every change should pass:

```text
bun run architecture:check
bun run knip
bun run check-types
bun run lint
bun run test
bun run build
bun run security:scan
```

The composition roots are intentionally the only places that know which concrete database, Redis, platform, and authentication adapters are selected.
