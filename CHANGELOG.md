# Changelog

All notable changes to Upstand are recorded here. Release tags use semantic versioning (`vMAJOR.MINOR.PATCH`).

## Unreleased

## 0.1.113 - 2026-07-22

### Added
- **External Secret Management & Secret Rotation**: Introduced secret provider integration, rotation schedules, claim locks, version repositories, and dedicated API routers (`secret.router.ts`, DB migrations `0051`-`0055`).
- **Container Auto-scaling Engine & Runtime**: Added `autoscaling-runtime.ts` and use-case evaluation logic for dynamic metric-driven container replica scaling.
- **Backup Verification & Recovery Workflows**: Added automated post-backup verification (`verify-backup-run.usecase.ts`), retention sync, and database backup/restore workflows.
- **Environment Promotion & Workflow Management**: Added environment cloning, promotion policies into protected environments, and environment variable override management.
- **Expanded Fumadocs Documentation**: Added comprehensive documentation pages covering backups, builds/previews, integrations, notifications, projects/resources, secrets/scaling, operations, and API automation.

### Improved
- **Infrastructure & Monitoring Client**: Enhanced SSH channel HTTP transport, container health check handling, and Docker service convergence validation.

## 0.1.112 - 2026-07-22

### Fixed
- Normalized release configuration formatting after the build-warning cleanup.

## 0.1.111 - 2026-07-22

### Fixed
- Removed remaining production build warnings by updating tsdown dependency options, externalizing optional OpenTelemetry instrumentation, and defining Fumadocs `metadataBase`.

## 0.1.110 - 2026-07-22

### Security
- Fixed S3 connection-test command injection by using argument-safe rclone execution and removing arbitrary test flags.
- Blocked private, link-local, loopback, and metadata destinations for S3 and registry tests and SSH host-key scans, with DNS validation, timeouts, and redirect protection.
- Enforced organization, resource, server, and container ownership for AI container commands and Docker terminal sessions.
- Made unknown Docker server references fail closed and hardened SSH host and username validation before generating SSH configuration.
- Removed terminal handoff credentials from WebSocket query strings.

## 0.1.109 - 2026-07-22

### Added
- **SCIM 2.0 Identity Management & Admin 2FA Reset**: Added SCIM repository layer and API router endpoints for enterprise user provisioning/deprovisioning. Implemented admin 2FA reset workflow and repositories.
- **Docker Deployment Convergence & Automated Rollback**: Introduced Docker service deployment convergence validation with automatic rollback triggers upon step failure or container convergence timeouts.
- **Database Hot-Path & Integrity Indexing**: Added migrations `0049_integrity_and_hot_path_indexes.sql` and `0050_furry_quentin_quire.sql` to optimize query performance across deployments, resources, and notification outbox tables.

### Improved
- **Modular Server & API Architecture**: De-monolithized server startup (`apps/server`) and `@upstand/api` routers (`web-server.router`, `permissions`, `rate-limit`, `openapi`, `errors`) into clean modular domains (`/scim`, `/trpc`, `/authorization`, `/rate-limiting`, `/routers/web-server`). Added full procedure authorization policy test coverage.
- **Resilient Redis Rate-Limiting**: Enhanced rate limiter with a circuit breaker and bounded local token-bucket LRU fallback, gracefully maintaining rate limits when Redis experiences timeouts or disconnections.
- **UpGal AI Stability & Recovery**: Upgraded UpGal error classification, instruction guidelines, and message history persistence to automatically recover from stale tool call states.
- **Docker Dashboard & Log Viewer**: Expanded Docker logs component with log level filtering (`INFO`, `WARN`, `ERROR`), pause/resume controls, auto-scroll toggle, and enhanced log search.

### Fixed
- **Codebase Lint & Format Compliance**: Resolved Biome linting and formatting issues across apps and packages, ensuring clean workspace build state for releases.

## 0.1.108 - 2026-07-21

### Fixed
- **Role-Based Remote Server Selection**: Updated resource creation dialogs (Application, Database, Compose), resource general settings tab, and templates setup page to filter target server and build server dropdown lists based on server types (`deploy`, `build`, `database`). This prevents selecting incompatible server roles in the UI and aligns with backend role assertions.
## 0.1.107 - 2026-07-21

### Added
- **Modern Terminal UI and Split Sidebar Layout**: Redesigned the interactive SSH and Docker terminal Dialog, introducing a spacious dual-column layout on desktop screens with settings placed in a dedicated left sidebar, and auto-collapsing to vertical stack on mobile/tablet.
- **Upgraded Terminal Toolbar**: Replaced the custom Popover theme menu with the `@upstand/ui` `Select` component. Designed modern font-size adjustment controls with `PlusIcon`/`MinusIcon` buttons, clear action with `Trash2`, download buffer with `Download`, and added `Tooltip` micro-interactions to all actions.
- **Configuration State Persistence**: Enabled `localStorage` memory caching for the user's font-size and active theme selections to preserve preferences across dialogue instances and page reloads.

### Fixed
- **Terminal Reconnect Session Expiry**: Prevented active WebSocket/SSH sessions from tearing down and reconnecting when font-size or theme options change, fixing the `"Terminal session expired. Open a new terminal and try again."` toast disconnection bug.

## 0.1.106 - 2026-07-21

### Fixed
- **Bypass env validation during Next.js production builds**: Added `process.env.NEXT_PHASE === "phase-production-build"` validation bypass to both `@upstand/env` server and web modules. This allows Next.js static page collection and dynamic routing build traces to compile successfully in CI/CD (GitHub Actions) environments without requiring active database connections or runtime secret environment variables.

## 0.1.105 - 2026-07-21

### Fixed
- **Private key formatting compatibility**: Added auto-serialization of generated and imported private keys to standard PKCS#1 PEM (for RSA keys) and OpenSSH PEM (for ED25519 keys) using `sshpk` prior to database encryption. This prevents the `ssh2` parser from throwing `"Cannot parse privateKey: Unsupported key format"` errors which occurred when Node's native `generateKeyPairSync` outputs key pairs in raw PKCS#8 formatting.

## 0.1.104 - 2026-07-21

### Added
- **Direct Remote Server Terminals**: Added a dedicated "Open Terminal" button on each Remote Server card, allowing users to connect to that server's terminal directly from the server manager. The terminal pre-selects the server's attached SSH Key, username, and port.
- **Enhanced Terminal Dialog Width**: Made the terminal emulator dialog wider on tablets and desktops (`max-w-[80rem]` for control-plane terminal and `max-w-[84rem]` for standard terminals) to accommodate longer terminal commands and larger font sizes.

## 0.1.103 - 2026-07-21

### Added
- **Multi-Algorithm SSH Key Generation**: Upgraded SSH key generation to support both modern, secure **ED25519** and legacy compatibility **RSA (2048-bit)** key pairs. Added a dropdown/selector in both the main SSH Keys manager panel and the remote server onboarding wizard.
- **Automated SSH Host Key Scanning & Verification**: Introduced a native, secure, async `scanHostKey` endpoint that queries the remote server's SSH fingerprint before adding it. Both the server wizard and the server manager now auto-scan and trust the host key during server creation, fixing the `"Trust the server SSH host key before provisioning it"` error without requiring any manual terminal commands.

## 0.1.102 - 2026-07-21

### Fixed
- **Remote server setup on Windows**: Provisioning (`SetupServerUseCase`) now runs `docker info --format json` over the existing SSH connection instead of routing through a Unix socket proxy, fixing the *"Was there a typo in the url or port?"* error on Windows ([`server-provisioning.ts`](packages/infrastructure/src/provisioning/server-provisioning.ts)).
- **Caddy initialization on Windows**: Replaced `CaddyService` (Docker API / Unix socket) with a pure SSH-command-based `initializeCaddyViaSsh` during server provisioning, enabling the DEPLOY role to complete successfully on Windows without a local Unix socket.
- **Runtime metrics and Docker API calls on Windows**: `ensureRemoteDockerProxy` now detects `process.platform === "win32"` and listens on a local TCP port (`127.0.0.1:23776+`) instead of a Unix `.sock` file path, fixing *"Was there a typo in the url or port?"* errors when fetching runtime metrics or performing any Docker API operation against remote servers on Windows ([`docker-client.ts`](packages/infrastructure/src/docker/docker-client.ts)).
- **SSH host key fingerprint padding mismatch**: `verifyHostKeyFingerprint` now strips trailing `=` padding before comparing SHA-256 base64 fingerprints, fixing host key verification failures against OpenSSH servers that emit fingerprints with or without trailing padding ([`host-key.ts`](packages/platform/src/ssh/host-key.ts)).
- **`ssh-keyscan` failure on Windows against OpenSSH 9.6**: `getTrustedKnownHostsEntry` now falls back to a pure Node.js/ssh2 host key scanner (`scanHostKeyWithSsh2Sync`) when `ssh-keyscan` exits with an error (e.g. unsupported KEX algorithm `sntrup761x25519-sha512@openssh.com` on modern Ubuntu 24.04 servers), fixing `"Could not read the SSH host key"` / `"Host denied (verification failed)"` errors on Windows.

## 0.1.101 - 2026-07-21

### Changed
- Optimized GitHub Actions release workflow (`release.yml`) by removing non-reusable `cache-to` GHA cache layer exports on tag builds, saving ~1m 45s per release.
- Added conditional `SKIP_TYPECHECK=1` support to Next.js container builds (`apps/web` and `apps/fumadocs`), eliminating duplicate type-checking inside Docker image builds (~22s saved).

## 0.1.100 - 2026-07-21

### Changed
- Release milestone 0.1.100 release hardening and complete synchronization between `master` and `canary` release channels.
- Verified 100% build type safety across all 15 workspace packages (`check-types`).

### Added
- **Declarative Repository Configuration (`upstand.json`)**: Added auto-discovery parser, schema validation (`upstand.schema.json`), domain entity Zod schemas, and automatic Git deployment synchronization for build engines, runtime resource limits, monorepo watch paths, and HTTP/Script cron schedules.
- **Interactive Remote Server Onboarding Wizard**: Added a multi-step onboarding wizard (`RemoteServerWizard`) for VPS hosts featuring provider options, OS installation guides, SSH key pairing, host role selection, automated provisioning, and live Docker/clock/runtime validation dialogs.
- **Trusted Proxy CIDR IP Resolution**: Added `TRUSTED_PROXY_CIDRS` parsing and robust IP address normalization supporting IPv4 and IPv6 CIDR subnet matching for client IP resolution.
- **Comprehensive Feature Documentation**: Added dedicated documentation guide (`upstand-json.mdx`) and JSON Schema editor autocompletion file (`public/upstand.schema.json`).

### Security & Bug Fixes
- Resolved TypeScript null-narrowing build error (`TS18047`) in deployment worker callback (`deployment-worker.ts`).
- Refactored Docker deployment service parameter reassignment (`noParameterAssign`) and normalized callback return signature types.
- Fixed fallback master key encoding in `secret-box.ts` to guarantee a 32-byte base64-encoded key during development and test environments.

### Added
- Cloud mode capability via `IS_CLOUD` and `NEXT_PUBLIC_IS_CLOUD` environment variables.
- Excluded Local Server deployment target options from resource creation dialogs and General infrastructure tab dropdowns when cloud mode is active.
- Added client-side and server-side target server validation checks on resource creation, update, and registry creation/updates, preventing cloud tenants from bypassing control plane isolation.
- Enforced target server selection requirement for Docker Registry credential validation under cloud mode.

## 0.1.97 - 2026-07-21

### Changed
- Resource general and advanced tab optimizations (1:1 with Dokploy service general tab).
- Hid the "Advanced Settings" and "Cron Jobs" tab trigger and panels for Database resources, avoiding configuration noise.
- Restricted Compose resource advanced settings tabs to only "General" and "Raw JSON" tabs.
- Relocated Database Lifecycle controls (Start / Stop) to the database configuration card footer on the General Tab.
- Wrapped deployment operations under `{resource.type !== "database" && ...}`.
- Hid build server and build registry execution infrastructure dropdowns for Databases and Compose resources, keeping layout clean.
- Excluded raw Compose file editor option from git providers when the resource type is `"application"`.

## 0.1.96 - 2026-07-21

### Added
- Refactored the Resource Advanced Settings page into a modular, tabbed UI with seven focused sections: **General & Runtime**, **Resources & Limits**, **Ports & Storage**, **Health & Deployment**, **Security & Capabilities**, **Environment & Labels**, and **Raw JSON**.
- Each section is extracted into its own self-contained card component (`GeneralCard`, `ResourcesCard`, `PortsVolumesCard`, `HealthcheckDeploymentCard`, `SecurityCard`, `EnvLabelsCard`, `RawJsonCard`) with a shared `AdvancedCardProps` type and `splitLines` utility to eliminate duplication.
- CPU and memory inputs now display unit adornments (`CPU`, `MB`) via `InputGroup` / `InputGroupAddon` instead of bare placeholder text.
- Port and volume editors are now structured per-row forms with labelled columns, protocol selectors, and read-only toggles — replacing the previous monolithic form that required manual text parsing.
- DNS and extra-hosts fields are now separate, clearly-labelled text areas instead of being merged into a single combined editor.
- Security toggles (init process, read-only root FS, TTY, privileged mode) are rendered from a typed `SECURITY_TOGGLES` constant array to avoid repetition.
- Rolling update and rollback strategies share a `StrategyForm` sub-component to avoid duplicating the identical five-field form.
- The main `ResourceAdvancedSettings` orchestrator now keeps `config` and `rawJson` in sync bidirectionally so editing via cards updates the JSON tab preview in real time.
- A sticky save footer (badge + button) appears on all non-JSON tabs; the JSON tab has its own inline validate-and-save button with a schema-error message.

## 0.1.95 - 2026-07-21

### Security & Bug Fixes
- Resolve CodeQL incomplete string escaping alerts (#35, #36) in `backups.ts` by escaping shell commands with robust single-quote tokenization.
- Resolve CodeQL incomplete string escaping alert (#34) in `key-value-editor.tsx` by escaping backslashes prior to double quotes in formatted environment string variables.
- Resolve CodeQL incomplete URL substring sanitization alerts (#32, #33) in `validate-domain.usecase.test.ts` by checking parsed URL hostnames instead of substring matching.

## 0.1.94 - 2026-07-21

### Added
- Added Cron Job Observability dashboard, schedule execution logs tracking, and `upstand.json` declarative schedule synchronization.
- Added live system status diagnostics endpoint (`getSystemStatus`) checking database and Redis health and server time zones.

### Security & Bug Fixes
- Fixed multi-tenant authorization check in `scheduleRouter.listLogs` to prevent schedule log query leakage across resources.
- Optimized resource configuration and secret upserts (`patchConfiguration`, `patchSecrets`) for atomic database patches.
- Cleaned up unused imports and refactored regex search loops in `code-editor.tsx` to achieve 0 biome check lint errors and warnings.

## 0.1.93 - 2026-07-20

### Fixed
- Fix Next.js web application Docker image build by adding the `--webpack` flag to match the custom webpack config in `next.config.ts`.

## 0.1.92 - 2026-07-20

### Improved
- Redesigned the audit logs list UI into a structured, responsive, and compact table layout.
- Added a details drawer (`Sheet`) for deep inspection of individual audit records, featuring actor/IP copy actions and raw JSON metadata copying/downloading.
- Configured dynamic CORS origin verification in the Hono API server.
- Configured dynamic `trustedOrigins` and dynamic base URL resolution (via `trustedProxyHeaders: true`) in Better Auth, ensuring login and session management work flawlessly on both dynamic raw server IPs/ports and custom domains.

## 0.1.91 - 2026-07-20

### Security & Bug Fixes

- Resolve CodeQL `js/shell-command-constructed-from-input` security alerts (#7, #8, #9, #10) in `docker-readonly.service.ts` by escaping `request.since`, `request.containerId`, `request.serviceName`, and `containerId` in `getLogs` and `getContainerStats` with `shellQuote`.
- Resolve CodeQL `js/insufficient-password-hash` (CWE-916) heuristic alert (#31) in `oauth-state.ts` by replacing `createHmac` with RFC 5869 `hkdfSync` key derivation for state MAC generation.

## 0.1.90 - 2026-07-20

### Fixed

- Resolve Upstand Server Logs loading issue by adding fallback to running container logs when Swarm service is unavailable, and triggering immediate refetch on log dialog open.
- Fix Caddy configuration save timeout ("fetch failed") by matching full Docker Hub `docker.io/library/` image tags during existence checks to avoid redundant Docker pulls.
- Standardize all UI checkboxes and labels across Web, Remote Servers, and Resource General settings to use `@upstand/ui` Base UI components (`Checkbox`, `Label`).

### Security & Bug Fixes

- Resolve CodeQL `js/shell-command-constructed-from-input` security alerts (#5, #6, #7, #8, #9, #10) in `docker-readonly.service.ts` via strict `shellQuote` parameter escaping.
- Resolve CodeQL `DOM text reinterpreted as HTML` / client-side redirection alerts (#2, #29) in `git-providers.tsx` by URL-encoding dynamic organization names with `encodeURIComponent`.
- Resolve CodeQL `js/polynomial-redos` alerts (#24, #25, #26, #27) by replacing slash trimming regexes in `build-registry.ts`, `backup-storage.ts`, and `notification-transport.ts` with O(n) loop string slicing.
- Resolve CodeQL CWE-916 heuristic alert (#3) in `oauth-state.ts` by explicitly converting token payloads to UTF-8 binary byte buffers.


### Security & Bug Fixes

- Resolve CodeQL `js/shell-command-constructed-from-input` security finding by enforcing strict parameter tokenization, validation, and clean argument escaping across remote Docker execution and archive transfer methods.
- Resolve ReDoS (Regular Expression Denial of Service) ambiguities by refactoring `SAFE_PATH_PATTERN` in `domain-mapping.ts` to eliminate nested quantifiers and guarantee linear time complexity matching.


### Added

- Add `exec_container_command` and `exec_server_terminal_command` tools to UpGal agent, enabling approval-gated shell command execution inside Docker containers and terminal commands on local/remote server hosts.
- Add rich context formatting and channel-specific interactive action buttons/keyboards (Telegram inline keyboards, Slack block buttons, Discord embed fields/links, Microsoft Teams adaptive card actions, Ntfy view headers, Pushover URLs, and rich HTML emails).

### Security & Bug Fixes

- Resolve CodeQL CWE-916 warning by migrating OAuth state signature and token lookup key derivation to `hkdfSync` key derivation.
- Resolve CodeQL second-order command injection vulnerability by adding `git-url-sanitizer` validation (rejecting leading `-` flags, whitespace, and control characters) and inserting `--` options terminators across Git CLI commands.


### Added

- Add Unified Live Stream Console & Terminal Split Screen view under Resource details, multiplexing and sorting logs across all running stack containers in real-time with color-coded service badges and hosting an interactive container terminal shell on the same pane.

## 0.1.86 - 2026-07-20

### Fixed

- Fix stuck loading state on Docker page logs and live stats tabs by checking query loading status instead of query pending status when queries are disabled.


## 0.1.85 - 2026-07-19

### Added

- Add rich, dynamic, and searchable breadcrumb dropdown menus for project levels (Projects, Environments, and Resources) to allow fast context-switching and navigation.

## 0.1.84 - 2026-07-19

### Added

- Add bookmarkIcon for tags tab item in the resource page.

### Fixed

- Resolve query suffix matching bug in container historical metrics retrieval to support dots, underscores, and hyphens separators.
- Resolve "Resource not found" toast notification appearing during resource deletion by disabling active queries upon delete mutation success.

## 0.1.83 - 2026-07-19

### Added

- Add git provider tag pattern support for deployments.
- Add page pagination and page skeleton dashboard UI components.

### Changed

- Align audit logs, certificates, deployments, registries, swarm, docker pages, git providers, layout, monitoring, notifications, projects, remote servers, requests, SCIM/SSO settings, SSH keys, tags, templates, and web server pages with the standardized UI layouts, PageToolbar, PageEmpty, StatusBadge, and ConfirmActionDialog components.

### Fixed

- Resolve various TypeScript, typechecking, and biome linting/formatting errors across packages and apps.
- Stabilize database schema migration checks.

## 0.1.81 - 2026-07-19

### Fixed

- Explicitly fetch `origin/master` on the GitHub Actions runner before checking release ancestry to prevent race-condition build failures when the tag triggers the runner before master is fully visible.

## 0.1.80 - 2026-07-19

### Fixed

- Fix critical database connection pool leak caused by instantiating new client pools via `createDb()` in middlewares and route handlers. Reuse the shared global `db` client instead.
- Enforce a Docker Swarm task history retention limit of 1 (instead of the default 5) so that older exited task containers are automatically cleaned up, allowing old and unused Docker images to be pruned cleanly on system updates.

## 0.1.79 - 2026-07-19

### Changed

- Align all 19 dashboard pages (Audit Logs, Certificates, Deployments, Docker Registry, Docker Swarm, Docker Inventory, Git Providers, Monitoring, Notifications, Projects, Remote Servers, S3 Destinations, SSO, SCIM, SSH Keys, Tags, Templates, Web Server) with the standardized UI layouts, PageToolbar, PageEmpty, StatusBadge, and ConfirmActionDialog components.

### Fixed

- Exclude stale Next development types from the apps' TypeScript configurations to prevent workspace build conflicts.

### Refactored

- Inject authentication, backup worker, notification delivery, access-log scheduler, and worker/scheduler dependencies at the API and infrastructure boundaries.
- Move deployment server orchestration, Docker inventory queries, Docker prune actions, and organization-scoped checks into use cases.
- Split Docker inspection capabilities into specialized interfaces.

## 0.1.78 - 2026-07-18

### Fixed

- Make Fumadocs source generation deterministic during type checks by preventing the asynchronous Next MDX plugin from racing with generated collection files.
- Use the same explicit Fumadocs generation command for local postinstall setup and the documentation image build.

## 0.1.77 - 2026-07-18

### Fixed

- Make UpGal walkthrough planning route-aware across the complete UI target catalog, including navigation and dialog-only controls from other pages.
- Recover older SSH field target references and automatically navigate legacy plans before locating their live targets.
- Keep highlighted controls above the guide dimming layer while preserving the chat overlay as the highest-priority surface.
- Prevent same-route guide redirects and improve conditional SSH-key guidance with explicit mode-switch targets.

## 0.1.76 - 2026-07-18

### Fixed

- Preserve wrapped navigation content when adding typed UpGal targets, including sidebar labels and icons.
- Keep the UpGal chat above the guide overlay and history menu, and preserve the active chat while replaying a walkthrough.
- Improve guide target availability, spotlight positioning, step progress, navigation feedback, and replay controls.
- Make guidance requests explain the workflow without asking for mutation-only input such as a project name.
- Align UpGal provider cards and settings hierarchy with the existing Settings card, badge, typography, and action patterns.

## 0.1.75 - 2026-07-18

### Added

- Add organization-scoped UpGal tag listing, creation, updates, deletion, assignment, and detachment with permission checks and approval gates for mutations.
- Add optional server-side Brave web search with bounded, sanitized result metadata and cited links in the chat UI.
- Add generic, type-safe UpGal UI action plans for internal navigation, target spotlighting, field focus, and guarded dialog opening.

### Changed

- Keep the UpGal chat above the walkthrough overlay and preserve the chat during guided navigation.
- Replace repeated raw UI action attributes with the reusable `UpGalTarget` definition component.
- Split new UpGal capability factories and schemas into focused tool modules instead of a shared feature schema file.

## 0.1.74 - 2026-07-18

- Bump

## 0.1.73 - 2026-07-18

### Added

- Expand UpGal with scoped diagnostics for projects, environments, resources, containers, previews, routing, backups, Git providers, Docker registries, organization search, Swarm, web-server logs, and update status.
- Add a unified TokenLens-backed model catalog with remote discovery, static fallback, caching, search, and capability metadata.
- Add optional, approval-gated MCP Apps connections for trusted HTTPS or localhost MCP servers.

### Changed

- Add provider model controls for temperature, reasoning, and maximum output tokens, with persisted settings and database migration support.
- Harden UpGal streaming, chat, persistence, and MCP error handling with safe user messages, retry classification, and structured tool failures.

## 0.1.72 - 2026-07-18

### Added

- Add server-side search and pagination to the organization and built-in template catalogs.
- Add permission-scoped UpGal tools for templates, resource configuration, monitoring status and metrics, and rich audit-log search.
- Add dedicated monitoring and audit-log documentation with tutorials, examples, diagrams, and cross-references.

### Changed

- Remove Starter blueprints from the Templates dashboard and documentation.
- Improve template cards with repository logos, GitHub links, source metadata, and robust logo fallbacks.
- Rework the template deployment dialog into a clear destination, naming, runtime, and review hierarchy.
- Align dashboard chat capabilities with the active user's organization permissions; mutations remain approval-gated.
- Remove direct `console.*` usage from source and document the production validation baseline.

## 0.1.71 - 2026-07-18

### Added

- Add a native, versioned template catalog with 476 ready-to-use Compose blueprints, searchable directly from the Templates dashboard and deployable without a runtime catalog dependency.
- Add built-in template variable rendering, relative mount isolation, source-aware one-click deployment, and a complete Fumadocs inventory for the shipped catalog.

### Changed

- Make UpGal Compose generation instructions explicit about YAML shape, service references, version pinning, named volumes, health checks, and host-access safety rules.

## 0.1.70 - 2026-07-17

### Changed

- Docs updated

## 0.1.69 - 2026-07-17

### Added

- Add `prune_docker_resources` tool to UpGal, enabling users to prune unused Docker resources (unused images, unattached volumes, builder cache, stopped containers, network/system, or all) on local or remote servers.
- The tool requires explicit user confirmation/approval before executing any destructive operations.

## 0.1.68 - 2026-07-17

### Fixed

- Fix all `<Select>` trigger components not showing the correct human-readable label when the dropdown is closed, by explicitly passing the resolved label as `SelectValue` children instead of relying on base-ui's dynamic `items` prop lookup.
- Fix `UpGal AI Settings` feature routing selects, provider type selector in Add/Edit Provider dialogs, and member role selects in the Members panel all showing raw values (IDs or keys) instead of their proper display labels.
- Fix `members-panel.tsx` custom role `SelectItem` rendering complex JSX (including a delete button) bleeding into the trigger display when that role was selected.

## 0.1.67 - 2026-07-17

### Fixed

- Fix rate limit (403/429) errors from the GitHub API when checking for updates by implementing a manual HTTP redirect-based fallback to scrape the latest release and download the manifest.
- Fix Swarm self-update failure for local/custom image tags (e.g. `upstand-server:custom`) by dynamically resolving and prepending the GHCR namespace.
- Fix Chromium horizontal/vertical scroll overlapping glitches and group label clipping in the landing page comparison table.
- Fix local Docker TCP-to-named-pipe proxy race condition (`ECONNREFUSED` error on startup) on Windows.

## 0.1.65 - 2026-07-17

### Added

- Support multiple named AI provider configurations in UpGal settings and route them to specific operations (e.g., Chat agent vs Compose template generator).

### Fixed

- Ensure active organization is set in the auth store before dashboard redirect to prevent rendering race conditions.
- Fix TS type error in remote Docker SSH proxy stream socket chunk handling.
- Ensure Docker system dial-stdio EOF is propagated correctly to the local Unix socket.

## 0.1.62 - 2026-07-16

### Fixed

- Forward remote Docker Unix-socket traffic explicitly in both directions across the verified SSH stream, including end-of-stream handling.

## 0.1.61 - 2026-07-16

### Fixed

- Route remote Docker API traffic through a local Unix socket backed by a verified SSH `docker system dial-stdio` stream, avoiding Bun's unsupported custom HTTP-agent path.

## 0.1.60 - 2026-07-16

### Fixed

- Replace Dockerode's malformed SSH URL transport with an explicitly verified SSH transport for managed remote servers.

## 0.1.59 - 2026-07-16

### Fixed

- Correct REST/OpenAPI route handling when the API host itself uses the `api` subdomain.
- Ensure remote Docker clients do not inherit the control plane's local Docker socket.

## 0.1.58 - 2026-07-16

### Fixed

- Correct remote Docker SSH connection setup and write verified `known_hosts` entries for Docker CLI operations.

## 0.1.57 - 2026-07-16

### Fixed

- Accept ssh2's hexadecimal SHA-256 host-key digest while continuing to persist and verify OpenSSH-format fingerprints.
- Remove a stale API-router import that blocked release type checking.

## 0.1.56 - 2026-07-16

### Changed

- Balance the two-factor verification footer spacing.

## 0.1.55 - 2026-07-16

### Fixed

- Require and submit the current password for two-factor enable and disable flows.
- Read the session-bound two-factor step-up record correctly after verification.

## 0.1.54 - 2026-07-16

### Fixed

- Preserve the rotated Better Auth session when recording two-factor step-up verification.

## 0.1.53 - 2026-07-16

### Fixed

- Map external integration and network delivery failures to actionable client errors.

## 0.1.52 - 2026-07-16

### Fixed

- Preserve existing S3 destination credentials when an update omits the secret fields.

## 0.1.51 - 2026-07-16

### Fixed

- Authorize S3 destination updates against the owning organization.

## 0.1.50 - 2026-07-16

### Security

- Redact S3 destination credentials from API responses and logs.

## 0.1.49 - 2026-07-16

### Fixed

- Include the control-plane database connection variables required by web-server backups.

## 0.1.48 - 2026-07-16

### Added

- Publish OpenAPI and Swagger UI endpoints for the supported API surface.

### Changed

- Refine typed resource navigation, resource domains, monitoring UX, and dashboard/runtime synchronization.

### Fixed

- Pin a compatible rclone release for S3-compatible backup and restore operations.

## 0.1.47 - 2026-07-16

### Fixed

- Align dashboard sidebar gutters.

## 0.1.46 - 2026-07-16

### Added

- Add the landing-page product comparison section.

### Fixed

- Harden managed provisioning and runtime deployment behavior.

## 0.1.45 - 2026-07-16

### Changed

- Publish the monitoring agent as a separate Linux image and require its immutable reference in production deployments.
- Build the monitoring image in CI and source installs, and remove generated vendor directories and binaries from Git.
- Connect the local monitoring agent to the server over the Swarm network without exposing its port publicly.

## 0.1.44 - 2026-07-16

### Added

- Add bounded login/session/setup retries and actionable timeout states (#54).
- Add persisted SSH host-key fingerprints with fail-closed verification for server, Docker, terminal, and monitoring connections (#20, #21).
- Add explicit audit-log capability checks and instance-owner protection for control-plane operations (#16, #17, #18).

### Changed

- Bind OAuth state to its provider, organization, user, purpose, and one-time Redis record; re-check authorization at callback time (#9).
- Validate custom Git-provider URLs and bound HTTP requests against HTTPS, SSRF, redirects, timeouts, and response-size limits (#10).
- Restrict custom-role and custom-permission delegation to the acting administrator's capabilities (#11).
- Require `backup:manage` for resource backup mutations and instance-owner authorization for control-plane backups (#14, #15).
- Verify release image digests again immediately before rollout and deploy exact immutable digests instead of mutable tags (#19).
- Store two-factor step-up state as a short-lived, user/session-bound record instead of a reusable boolean marker (#7).

### Fixed

- Stop logging monitoring credentials and expose monitoring agents only through loopback with SSH forwarding (#21).

## 0.1.41 - 2026-07-15

### Changed

- Require a complete GitHub release manifest containing verified server, web, and documentation image digests before showing an available update.
- Publish the release manifest only after all three GHCR images have been pushed successfully.

### Fixed

- Include the infrastructure workspace package in every Docker build context so release image builds resolve all workspace dependencies.

## 0.1.40 - 2026-07-15

### Added

- Add direct parity coverage for shared Git-provider HTTP, Docker Compose transformation, database environment, and remote-server role behavior.
- Add Caddy synchronization stage and duration diagnostics for production troubleshooting.

### Changed

- Refactor server lifecycle work into monitoring, cleanup, deployment, and self-update runtime modules.
- Consolidate Git-provider HTTP handling, Docker Compose configuration helpers, Docker value helpers, and use-case test fixtures.
- Make remote-server roles an explicit contract with role-specific setup: deploy hosts run Swarm, Caddy, and monitoring; build hosts run Docker and monitoring; database hosts run isolated Swarm and monitoring without a public edge.
- Give UpGal trusted runtime context for the active user and dashboard page, alongside the active organization.
- Replace all remaining ad-hoc DI `Symbol.for(...)` resolutions with exported composition tokens.

### Fixed

- Prevent duplicate monitoring-agent history requests while local monitoring is still being configured, and show Docker host identity without waiting for historical samples.
- Serialize Caddy configuration mutations across service instances, retain atomic rollback, and log the failed stage and elapsed time for production diagnosis.
- Reject invalid remote-server role changes, database build-concurrency settings, and deletion of a server that remains assigned to a resource.
- Display managed database environment variables alongside editable resource variables without duplicating protected credentials at rest.
- Remove dead dashboard helpers, a dead loader component, duplicate barrel exports, and stale Knip findings.

## 0.1.39 - 2026-07-15

### Added

- Add complete router and use-case smoke coverage for registration and module loading.
- Document local development, production installation, supported platform features, and installer behavior in the Fumadocs guides.

### Changed

- Consolidate Docker Compose configuration into the local development stack and the production Docker Swarm stack.
- Make `install.sh` non-interactive by default, with an explicit `--interactive` mode and safer immutable-image validation.
- Remove product enterprise, licensing, and billing surfaces and keep SSO, SCIM, and custom roles available through normal organization permissions.
- Remove E2E and external-service integration test harnesses, retaining deterministic unit, contract, and smoke coverage.

### Fixed

- Fix the login page hook-order runtime error by removing redundant session subscriptions from credential forms.
- Use the active Bun/Node runtime executable for the Docker API proxy test path.
- Enable Better Auth email/password sign-in and correct auth middleware error responses.
- Remove committed environment examples and credential-bearing E2E artifacts from the project.

## 0.1.38 - 2026-07-15

### Fixed

- Fix `server.inventory` tRPC endpoint returning 500 for `logs` and `stats` kinds when no container is selected — the query is now disabled client-side until a `containerId` (or `serviceName` for logs) is selected.
- Fix CI test failures in `@upstand/api`: the custom-role integration tests now skip gracefully when no `DATABASE_URL` is available, using `test.skipIf` and the same env-stub pattern as the rest of the API test suite.

## 0.1.37 - 2026-07-14

### Added

- Add custom roles database integration test suite `custom-role.test.ts` verifying creation, assignment, and role degradation/deletion logic.

### Changed

- Redesign custom roles creation flow: delete legacy "Custom Roles" settings section, and merge creation directly into the Member invite/addition form via the "Create custom role..." option.
- Restrict capability checklist editing: enforce static/read-only capability assignments for default roles (Member/Admin), making capabilities editable only when creating a new custom role.
- Implement automatic role degradation: when a custom role is deleted, automatically degrade all assigned members and pending invitations to standard Member permissions and role.

## 0.1.36 - 2026-07-14

### Changed

- Refactor native select dropdowns to use the customized Shadcn/base-ui `Select` component across the application.
- Fix Custom Roles dropdown selection mapping in the workspace membership panel.
- Merge the standardized UI layout branch, introducing the unified layout header and structured sidebar navigation.

## 0.1.35 - 2026-07-14

### Changed

- Add local E2E verification test pipeline suite (`e2e-local-test.ts`).
- Fix local Swarm node auto-resolution behavior by introducing the `"local"` sentinel server ID.
- Drop foreign key reference in `monitoring_settings.server_id` table to support local manager setup settings initialization.
- Refactor Docker client with resilient local fallbacks.

## 0.1.34 - 2026-07-14

### Changed

- Fix remote docker host SSH parsing bug in docker-modem compatibility.
- Standardize all 22 dashboard pages to use the unified `DashboardPageHeader` component for consistent title, description, icon, and action bar layout.
- Group dashboard sidebar navigation into collapsible sections: **Workloads**, **Infrastructure**, **Integrations**, and **Management** — all expanded by default.
- Replace generic sidebar icons with premium Hugeicons across the dashboard and settings sidebars.
- Move **API Keys** and **Custom Roles** pages into the Settings modal. Custom Roles is nested under a Members submenu.
- Remove the **Branding / White-label** feature entirely:
  - Deleted `BrandingPanel`, standalone `/settings/branding` route, and all related settings UI.
  - Removed `getPublicBranding` and `updateBranding` tRPC endpoints and their API-key permission mappings.
  - Removed branding columns (`appName`, `appDescription`, `logoUrl`, `faviconUrl`, `customCss`, `loginLogoUrl`, `supportUrl`, `docsUrl`, `metaTitle`, `footerText`) from the `web_server_settings` DB schema, Drizzle model, domain entity, and use-case input schema.
  - Removed branding-driven `<title>`, favicon, and custom-CSS injection from the dashboard layout.
  - Removed branding logo/name block and dynamic title from the login page.
  - Removed the White-label branding section from the documentation.
- Delete legacy standalone routes for `/settings/branding`, `/settings/custom-roles`, and `/settings/api-keys` that have been migrated into the settings modal.

## 0.1.33 - 2026-07-14

### Changed

- Add detailed error trace logging on server setup failures.

## 0.1.32 - 2026-07-14

### Changed

- Unlock all features (SSO, SCIM, Custom Roles, Branding/Whitelabeling) for free as OSS.
- Fix workspace dependencies configuration in Dockerfiles.

## 0.1.30 - 2026-07-13

### Added

- Add an explicit architecture boundary check and document the dependency direction between domain, application, adapters, and composition roots.
- Add Knip dead-code and dependency analysis to the root quality checks.
- Add the `@upstand/platform` adapter package for encryption and SSH platform concerns.

### Changed

- Remove framework, DI, Node platform, encryption, and SSH implementation dependencies from the domain package.
- Move composition tokens out of the domain and into the application/composition layer.
- Remove unused source files and dependencies across the workspace.
- Replace the unavailable package-manager scanner command with Bun audit and pin vulnerable transitive packages through workspace overrides.

### Security

- `bun audit` reports no known vulnerabilities.

## 0.1.29 - 2026-07-13

### Added

- Restore validated container-level start, stop, restart, and kill actions in the resource Containers tab.
- Add unique Docker service-name validation across all resources to prevent Swarm collisions between projects and environments.

### Changed

- Make non-isolated Compose services join the managed shared ingress overlay while preserving user-defined networks.
- Keep isolated resources on deterministic per-resource overlays and detach stale Caddy attachments after routes are removed or isolation changes.
- Preserve operator-owned external Compose volumes during isolated deployment volume prefixing.
- Document the shared and isolated network model, Compose project versus Stack routing, and container control limitations.

### Fixed

- Use standalone Compose service DNS names for Caddy routes and Swarm-prefixed names only for Stack deployments.
- Remove standalone Compose projects with their actual Compose containers instead of incorrectly issuing `docker stack rm`.
- Prevent resource deletion from leaving managed isolated networks attached indefinitely.

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
