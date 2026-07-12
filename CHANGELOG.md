# Changelog

All notable changes to Upstand are recorded here. Release tags use semantic versioning (`vMAJOR.MINOR.PATCH`).

## Unreleased

Changes after the latest tag are collected here until the next release.

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
