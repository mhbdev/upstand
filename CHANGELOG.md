# Changelog

All notable changes to Upstand are recorded here. Release tags use semantic versioning (`vMAJOR.MINOR.PATCH`).

## Unreleased

Changes after the latest tag are collected here until the next release.

## 0.1.11 - 2026-07-13

### Fixed

- Added a managed HTTPS Caddy route for the Fumadocs service and backfilled it for existing installations, fixing the documentation subdomain TLS/proxy failure.

## 0.1.10 - 2026-07-13

### Changed

- Refined the marketing, authentication, and public navigation surfaces for a clearer responsive experience and direct documentation access.

## 0.1.9 - 2026-07-13

### Added

- Docker Swarm secret-file handling for database, Redis, Better Auth, and SSH encryption credentials.
- A checked-in `.env.example` and portable local database-generation defaults for contributors.

### Fixed

- The local `bun db:generate` command no longer fails when Better Auth URLs are not configured.
- Dashboard and landing-page version reporting no longer falls back to stale hardcoded release numbers.

## 0.1.7 - 2026-07-12

### Fixed

- Removed a duplicate `advanced_config` migration statement that prevented fresh stable image installs from starting PostgreSQL migrations.

## 0.1.8 - 2026-07-12

### Added

- Hardened deployment and token boundaries across the UpGal integration and background deployment workers.
- Published stable GHCR images for the dashboard, API, and documentation services.

### Changed

- Stable self-hosted installations now use immutable release image digests with automatic updates disabled by default for manual verification.

## 0.1.5 - 2026-07-12

### Fixed

- Made the curl-based installer fetch its production Compose manifest from the selected release when launched outside the repository.

## 0.1.4 - 2026-07-12

### Added

- AI assistant infrastructure, persisted conversations, and the dashboard assistant surface.
- Settings navigation and workspace support for the new assistant capabilities.
- Database migration and API wiring for AI conversations and provider configuration.

### Fixed

- Kept dependency metadata and the Bun lockfile in sync for frozen production installs.
- Improved resource and environment navigation while preserving existing deployment flows.

### Changed

- Updated server and web dependencies used by the assistant and settings experience.

## 0.1.0 - 2026-07-12

### Added

- Production contributor, security, support, and release guidance.
- Shared update status behavior for the Web Server page and Settings dialog.
- Opt-in stable-channel automatic update checks.
- Owner-only SSH terminal access from the Web Server page.

### Fixed

- Docker exec stream decoding no longer displays multiplexing control bytes in the active Caddyfile.

### Changed

- Update status now identifies stable, canary, and source installations and explains when an update is unavailable.

## 0.1.1 - 2026-07-12

### Fixed

- Prevented the compiled Bun server from binding port 3000 twice when WebSocket support is enabled.
- Made Docker resource deployment typing compatible with the production web image type-check.
- Allowed update checks to use Git tags when a GitHub Release object has not been created yet.

## 0.1.2 - 2026-07-12

### Fixed

- Pass the installed server image and automatic-update policy into the API container so source/channel detection and opt-in updates behave consistently in production.

## Release process

Maintainers should move the relevant Unreleased entries into a versioned section, run the full verification suite, create a signed or protected `vMAJOR.MINOR.PATCH` tag, and verify the GitHub release workflow and image digests before announcing the release.
