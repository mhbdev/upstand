# Changelog

All notable changes to Upstand are recorded here. Release tags use semantic versioning (`vMAJOR.MINOR.PATCH`).

## Unreleased

Changes after the latest tag are collected here until the next release.

## 0.1.23 - 2026-07-13

### Added

- Added descriptive property-level guidance to UpGal tool inputs so models can select the correct project, environment, resource, server, and Docker identifiers.

### Changed

- Improved UpGal tool descriptions and assistant instructions so tool results are followed by concise natural-language summaries, including explicit empty-result responses.
- Improved UpGal interruption messages with actionable provider, authentication, rate-limit, and retry guidance.

### Fixed

- Persisted failed UpGal runs as failed instead of leaving them in a running state after a response stream error.

## 0.1.22 - 2026-07-13

### Added

- Added read-only UpGal account and Docker inventory tools for organization status, containers, images, volumes, services, engine information, and logs.
- Added shared dashboard page layout primitives for consistent page hierarchy across dashboard routes.

### Changed

- Improved Git provider cards with clearer connection status, access metadata, actions, and responsive layouts.
- Improved large data dialogs, including terminal, notification channel, deployment log, and resource dialogs, with responsive sizing, scrolling, and clearer content hierarchy.
- Expanded the dashboard UI consistency across settings, monitoring, deployments, storage, server, and resource pages.

### Fixed

- Prevented live polling and background refetches from overwriting unsaved resource, web-server, deployment concurrency, and AI settings edits.
- Preserved local drafts when saving one section while another section still contains unsaved changes.

## 0.1.21 - 2026-07-13

### Fixed

- Included the Better Auth session schema and migration generated for database-backed sessions, so fresh installs and upgrades create the `session` table before the API starts.
- Fixed the UpGal tool header type narrowing that caused the release CI typecheck to fail for static tools.

## 0.1.20 - 2026-07-13

### Added

- Added end-to-end UpGal conversation history: titled conversations can be loaded, continued, or removed from a compact history popover.
- Added AI Elements `PromptInput`, adaptive tool result cards, approval status announcements, and a non-destructive fallback for incomplete tool payloads.
- Added a controlled self-update dialog with rollout progress, API reconnection messaging, and automatic reload after the target version is healthy.

### Fixed

- UpGal tool execution now supplies the AI SDK v7 tool context required by every read and mutation tool, fixing `list_projects` validation failures.
- Tool approvals preserve the active organization and conversation ID when the follow-up request is sent.
- Persisted conversation messages load in chronological order and the first user message becomes the conversation title.

## 0.1.19 - 2026-07-13

### Fixed

- Dashboard self-updates now persist the new `UPSTAND_VERSION` in the Swarm service environment, so About and subsequent update checks report the image that is actually running instead of the pre-update version.

## 0.1.18 - 2026-07-13

### Added

- Added provider-wide AI model catalog discovery for OpenAI, Anthropic, Google, OpenRouter, and OpenAI-compatible gateways, while preserving custom model IDs.
- Added a force-refresh update check shared by Web Server and Settings so newly published tags are detected immediately instead of waiting for the server cache.
- Added responsive, larger terminal and notification configuration dialogs, accessible provider icons, and Git provider access-management links.

### Changed

- Moved UpGal configuration into Settings as **UpGal Settings** and removed the duplicate dashboard navigation entry.
- Replaced settings/API-key/remote-server native selects with the repository's based-ui Select component.
- Resource forms now protect unsaved edits from live polling and use a horizontally scrollable, keyboard-accessible provider tab list.

### Fixed

- Update checks now fall back to GitHub tags when a repository has no formal Release object (including the current v0.1.17 tag), compare semantic versions correctly, and report source-install updates without incorrectly enabling an in-place update.
- UpGal chat requests now target the configured API origin in self-hosted deployments.

## 0.1.17 - 2026-07-13

### Added

- Added OpenRouter as an AI provider with server-side model catalog discovery and support for custom model IDs.
- Added provider-specific “Manage access” links for GitHub, GitLab, Bitbucket, and Gitea installations or OAuth permissions.

### Fixed

- UpGal now sends chat requests to the API origin in self-hosted deployments instead of the dashboard origin, preventing an HTML 404 response from Next.js.
- AI connection tests now validate the provider, model, endpoint, and optionally unsaved API key currently shown in the form.
- Hardened Better Auth production cookies and enabled explicit session rotation and database persistence alongside Redis storage.

## 0.1.16 - 2026-07-13

### Fixed

- Dashboard server-rendered routes now resolve the API origin from the incoming self-hosted dashboard host, so authenticated users are not sent back to `/login` when release images were built with the CI placeholder URL.
- Server-side session checks forward the browser session cookie directly to Better Auth and fail clearly when the API cannot be reached.

## 0.1.15 - 2026-07-13

### Fixed

- Release web images now resolve the self-hosted API origin at runtime instead of calling the CI placeholder host, fixing login/session/setup bootstrap failures.

## 0.1.14 - 2026-07-13

### Fixed

- Fixed the notification event option type after removing the unused platform-backup event.
- Parallelized stable and canary Docker image publishing with independent Buildx caches to reduce release wall-clock time.

## 0.1.13 - 2026-07-13

### Added

- Added API-key authentication test coverage and tightened notification/API-key integration behavior.

### Fixed

- Removed the unused `platform_backup_completed` notification event so the event catalog contains only events with real producers.

## 0.1.12 - 2026-07-13

### Fixed

- Stable installer upgrades now refresh the Compose manifest from the selected release instead of reusing an older source-era manifest.

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
