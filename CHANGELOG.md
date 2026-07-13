# Changelog

All notable changes to Upstand are recorded here. Release tags use semantic versioning (`vMAJOR.MINOR.PATCH`).

## Unreleased

Changes after the latest tag are collected here until the next release.

## 0.1.28 - 2026-07-13

### Added

- Add type-aware resource configuration for applications, databases, Docker Compose projects, and Docker Swarm stacks.
- Add Compose service targeting and apply advanced runtime, networking, health-check, resource, and deployment settings to Compose definitions.

### Changed

- Improve resource tabs with type-aware domains, containers, deployments, backups, and General tab controls.
- Make repository-backed Compose start and restart actions use the deployment queue so source checkout and server selection are handled consistently.
- Improve remote server setup handling for asynchronous and already-active Swarm joins with clearer progress and recovery errors.
- Improve Docker image application configuration and database engine, image, and credential editing.
- Remove remaining Biome diagnostics and normalize formatting across the workspace.

### Fixed

- Prevent Compose deployments from treating Docker Compose projects as Swarm stacks, and preserve Compose service routing and container discovery.
- Fix deployment controls that previously displayed non-functional build/kill actions.
- Recover the test server update path after Docker disk exhaustion took PostgreSQL offline; the server is now running and healthy on `v0.1.27`.

## 0.1.27 - 2026-07-13

### Fixed

- Recover UpGal turns when stale or partially streamed UI tool parts fail current AI SDK validation, with structured diagnostics instead of a silent history loss.
- Serialize per-conversation UpGal persistence checkpoints so an older asynchronous snapshot cannot overwrite a newer assistant/tool result.
- Preserve immutable message creation timestamps when `useChat` resends full conversation history and add a deterministic database ordering tie-breaker.

## 0.1.26 - 2026-07-13

### Changed

- Checkpoint UpGal UI messages after each completed agent step and persist the final partial message when a stream is aborted.
- Keep UpGal retries bound to their existing conversation and stop stale streams before loading or starting another conversation.
- Reconcile deployed Swarm services and Caddy upstreams onto the shared `upstand-network` overlay.
- Retry Caddy upstreams briefly during Swarm task and service-DNS convergence to avoid transient 502 responses.
- Add Dokploy-style isolated deployments with dedicated attachable overlay networks, isolated Compose ingress, and optional named-volume prefixing.
- Use the real Swarm service name for Compose domain routes and attach Caddy to each resource's routing network.
- Make the resource Backups panel reactive with TanStack Form subscriptions and normalize resource monitoring metrics at the UI boundary.

### Fixed

- Prevent interrupted UpGal responses from leaving only the incoming user message in persistent conversation history.
- Prevent legacy deployed resources without the shared overlay attachment from returning a permanent Caddy 502.
- Prevent Backups and Monitoring tabs from crashing when form state or runtime metrics are unavailable.

## 0.1.25 - 2026-07-13

### Added

- Added actionable UpGal project, environment, and resource result cards with direct dashboard links.
- Added explicit approval, denial, pending, and interrupted-response states to the UpGal chat UI.
- Added complete resource advanced settings for runtime, networking, health checks, capabilities, and rolling updates.

### Changed

- Migrated UpGal mutation approval policy to AI SDK `toolApproval` with the native `useChat` approval continuation flow.
- Improved conversation loading, organization switching, stale-load handling, and deterministic message ordering.
- Improved resource and tool-result presentation with reusable, theme-aware components.

### Fixed

- Preserved original UI messages when streaming agent responses so approved tool calls continue the pending assistant message instead of creating duplicate turns.
- Prevented same-millisecond persisted messages from changing order after a conversation reload.
- Replaced forced dark surfaces in dialogs, terminals, charts, and resource views with semantic theme colors.

## 0.1.24 - 2026-07-13

### Added

- Added a responsive, validated domain dialog with clearer route and certificate strategy controls.
- Added certificate strategy support for Let&apos;s Encrypt automatic renewal and Caddy&apos;s internal CA.
- Added persistent remote-server setup errors and actionable SSH authentication diagnostics.
- Added the audit logs dashboard, storage, filtering, pagination, and automatic redacted operation capture.

### Changed

- Made the audit log repository a required dependency of every unit of work.
- Improved domain route tables with service, rewrite, path, and certificate details.
- Improved remote setup to run to completion, support passwordless sudo, validate the Swarm manager address, and surface failures to the API.

### Fixed

- Serialized UpGal tool results to JSON-safe values before returning them to the AI SDK, preventing interrupted responses caused by database dates.

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
