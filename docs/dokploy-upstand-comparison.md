# Dokploy ↔ Upstand capability comparison

Audit date: 2026-07-13  
Dokploy source: `C:\Users\baghe\AppData\Local\Temp\dokploy-study`  
Dokploy commit: `9142127fb363af7454615856e3b417ab5118879a`  
Upstand source: workspace at commit/state present during this audit.

## Executive conclusion

Dokploy is currently the broader, more mature product surface. Its core advantage is depth around service-specific deployment UX and operational controls: distinct Application, Compose, and database workflows; Traefik/domain/certificate management; remote/build servers; previews, rollbacks, patches, schedules, volume backups; Docker inspection; and a 450-path generated API. Upstand has a cleaner generic-resource/domain architecture and several strong foundations—Swarm, queued deployments, encrypted secrets, S3 backup schedules and restore, provider integrations, notifications, audit logs, API keys/MCP, and UpGal—but many Dokploy capabilities are either not yet exposed, only represented as generic JSON, or absent.

This is a source and documentation audit, not a live deployment test. No external credentials, Docker cluster, Git webhook, DNS provider, or billing account was available, so runtime behavior and failure modes were not experimentally verified.

## Inventory scale

| Surface | Dokploy | Upstand |
|---|---:|---:|
| Generated API paths | 450 | — |
| API router modules | 43 | 20 |
| Server/service modules | 48 | 117 use-case files |
| Database schema files | 48 | 20 |
| Dashboard TSX components | 356 | 123 TSX files |
| Dashboard pages | 49+ route pages | 21 route pages |

Dokploy's repository README is intentionally high-level. Its external documentation adds multi-tenancy, monitoring, S3 destinations, Git sources, users, notifications, registries, SSH keys, certificates, backups, concurrent builds, applications, Compose, databases, auto-deploy, schedule jobs, patches, volume backups, providers, watch paths, remote servers, clusters, AI, and enterprise modules.

## Complete feature matrix

Status meanings: **Parity** means an equivalent user-facing capability is implemented; **Partial** means a foundation exists but behavior, scope, or UI is materially narrower; **Missing** means no equivalent was found in the audited source; **Enterprise** means Dokploy's feature is proprietary/licensed.

### Product and tenancy

| Dokploy capability | Upstand status | Evidence / gap |
|---|---|---|
| Self-hosted installation | Partial | Upstand has Docker/Swarm installation and update docs; Dokploy ships installer, Dockerfiles, migration and health flows. |
| Cloud offering, subscription, checkout, invoices, plan limits | Missing | Dokploy has Stripe router/UI and plan-limit utilities; Upstand has no billing surface. |
| Organizations/projects/environments | Partial | Upstand has organization-scoped projects and environments; Dokploy additionally has project duplication, tags, invitations, organization switching, and permission-aware project views. |
| Members, invitations, roles, permission assignment | Partial | Upstand has member APIs and organization permissions; Dokploy exposes user invitation, role/permission management, custom roles, and enterprise enforcement. |
| 2FA and session verification | Parity/partial | Upstand gates sensitive routes with `twoFactorVerifiedProcedure`; Dokploy has profile 2FA setup/reset flows. Verify full enrollment/recovery parity. |
| API keys | Parity/partial | Upstand supports scoped, expiring, revocable keys and MCP; Dokploy supports user-generated deployment/API tokens. Different models and scopes. |
| Audit logs | Parity/partial | Both have audit-log schema/UI; Dokploy also has enterprise audit-log router and broader event coverage. |
| Tags | Missing | Dokploy has tag schema/router/UI for organizing resources. |
| Search, request/activation queue | Missing | Dokploy has global search command and requests/activation pages. |

### Applications and source/build

| Dokploy capability | Upstand status | Evidence / gap |
|---|---|---|
| Single-service Application resource | Partial | Upstand's generic `resource` supports `type=application`; Dokploy has a dedicated application model/UI/API with much richer typed settings. |
| GitHub, GitLab, Bitbucket, Gitea, generic Git | Partial | Upstand has provider CRUD, repository and branch listing for these providers; Dokploy also has provider-specific OAuth/callback/webhook flows and per-resource saved-provider settings. |
| Docker image/registry source | Partial | Upstand has Docker registry CRUD and `dockerImage`; Dokploy supports Docker source, registry selection, private registry authentication and rollback registry. |
| Raw/drop deployment source | Partial | Upstand has raw Compose provider; Dokploy has a dedicated Drop source and drag-and-drop upload flow. |
| Auto-deploy webhooks | Partial | Upstand deployment queue exists; Dokploy has explicit GitHub/Gitea/GitLab/Bitbucket/DockerHub webhook endpoints plus refresh tokens. Confirm equivalent webhook handlers in Upstand. |
| Push/tag trigger selection | Partial | Dokploy models `push` and `tag`; Upstand resource schema does not expose trigger type/watch paths. |
| Watch paths | Missing | Dokploy supports path-filtered auto-deploy. |
| Dockerfile builds | Parity/partial | Both support Dockerfile; Dokploy has build stage, context, args, secrets, cache cleanup and source-specific paths. |
| Nixpacks | Parity | Both model Nixpacks; verify installed versions and generated command parity. |
| Railpack | Parity/partial | Both model Railpack; versions differ/defaults differ. |
| Heroku Buildpacks | Parity/partial | Both model Heroku buildpacks; Dokploy exposes version 24 and 26 in current schema, while Upstand allows 24 and 26 but requires implementation verification. |
| Paketo Buildpacks | Parity/partial | Both model it; verify actual builder installation and execution in Upstand images. |
| Static/SPA build | Parity/partial | Both model static publish directory/SPA; compare serving and routing behavior. |
| Build args, build secrets, clean cache, submodules | Partial | Dokploy has typed encrypted fields and UI; Upstand has Dockerfile args but no equivalent complete application settings found. |
| Build-server selection and per-server concurrency | Partial | Upstand has `buildServerId` and concurrency use case; Dokploy has dedicated build-server UI and server/build separation. |
| Zero-downtime / rolling deployment | Partial | Both use Swarm concepts; Dokploy has explicit update/rollback configs, registry handling, replicas and rollback activation. |
| Deployment history, logs, queue cancellation, kill build, clear queues | Partial | Upstand has queue/history/logs and cancellation; Dokploy has per-application/Compose cleanup, kill-build, remove deployment, queue listing and last-10 UI. |
| Preview deployments | Partial | Upstand has schema/repository/use-case foundations and UI fields; Dokploy has provider webhook flow, preview environments/domains, wildcard, HTTPS/cert resolver, labels, limit and collaborator-permission enforcement. |
| Rollbacks | Partial | Upstand has deployment rollback-related schema/config fields but no dedicated rollback router/use-case found; Dokploy has rollback settings and rollback history/actions. |
| Patches / file editor overlays | Missing | Dokploy can create/edit/delete/toggle patches, read repository files/directories, and maintain patch repos. |
| Templates / one-click marketplace | Missing | Dokploy has template processing, tags, search, import and template deployment UI. |
| AI-generated project/template | Partial | UpGal exists in Upstand with approval-bound tools; Dokploy has project AI assistant/template generator. Different feature intent and coverage. |

### Compose and databases

| Dokploy capability | Upstand status | Evidence / gap |
|---|---|---|
| Docker Compose and Docker Stack modes | Partial | Upstand models `compose`/`stack`; Dokploy has dedicated Compose file editor, conversion, import, service discovery and stack-specific commands. |
| Compose from GitHub/GitLab/Bitbucket/Gitea/generic Git/raw | Partial | Upstand raw/provider foundations exist; Dokploy has complete per-provider Compose flows and webhooks. |
| Compose import, template deployment, randomization, isolated deployment | Missing/partial | Dokploy has all four API/UI flows; Upstand has advanced isolation fields but no equivalent import/template/randomize surface found. |
| Compose service selection, service logs/stats/terminal | Partial | Upstand exposes resource containers/logs/stats; Dokploy has multi-service UI with service-specific monitoring and terminal. |
| MySQL | Parity/partial | Upstand database type/image support; Dokploy has dedicated lifecycle, credentials, external port, rebuild/reload/status UI. |
| PostgreSQL | Parity/partial | Same gap: Upstand generic resource; Dokploy dedicated database workflow and custom command UI. |
| MariaDB | Parity/partial | Same gap. |
| MongoDB | Parity/partial | Same gap. |
| Redis | Parity/partial | Same gap. |
| libSQL | Missing | Dokploy has libSQL schema, service, router, page, credentials and backup support; Upstand's database options omit it. |
| Database custom image/version/credentials/ports/volumes | Partial | Upstand validates a fixed image list and generic advanced config; Dokploy provides service-specific credentials, external port and rebuild controls. |
| Database manual/scheduled backups | Partial | Upstand has generic schedules/runs/restore; Dokploy has database-specific backup implementations for five engines plus Compose/web-server backup paths. |

### Networking, routing, and persistence

| Dokploy capability | Upstand status | Evidence / gap |
|---|---|---|
| Traefik reverse proxy and service discovery | Partial | Upstand docs/code expose routing and web-server controls; Dokploy has extensive Traefik generators, middleware, file editor, env editor and per-resource config. |
| Custom domains and generated `traefik.me` domains | Partial | Upstand has domains/routing UI; generated-domain behavior and full validation need verification. |
| Certificates: Let's Encrypt/custom/none | Partial | Upstand routing/certificate docs and domain mapping exist; Dokploy has dedicated certificate CRUD and preview/custom resolver handling. |
| Redirects | Missing | Dokploy has redirects schema/router/UI and Traefik generation. |
| Security headers / basic auth / access security | Missing/partial | Dokploy has security router/UI and middleware generation; Upstand has no matching dedicated resource-security module found. |
| Forward auth | Missing | Dokploy enterprise forward-auth settings, SSO provider linkage and domain toggle. |
| Ports | Partial | Upstand advanced resource ports exist; Dokploy has dedicated port CRUD and UI. |
| Volumes, binds, file mounts | Partial | Upstand advanced volumes exist; Dokploy has named/bind/file mounts, Compose service mounts, mount CRUD and repository-safe file mounts. |
| Volume backups and restore | Partial | Upstand has volume listing and backup/restore use cases; Dokploy has dedicated volume-backups router/UI and S3-oriented named-volume semantics. |
| CDN | Missing | Dokploy has a CDN service module. |

### Operations and infrastructure

| Dokploy capability | Upstand status | Evidence / gap |
|---|---|---|
| Local Docker management | Partial | Upstand can inspect/control resource containers and clean the web server; Dokploy has global container list, labels/name searches, restart/remove, mounts, networks, upload, logs and terminal. |
| Per-container terminal/logs/stats | Partial | Both have pieces; Dokploy has WebSocket terminal, Docker stats, log filters, line count/since/status filters and service-aware viewers. |
| CPU/memory/disk/network monitoring | Parity/partial | Both have monitoring/historical metrics; Dokploy also has a separate Go monitoring daemon and paid/free monitoring paths. |
| Server registration/setup/validation/security audit | Partial | Upstand server create/setup/stats and SSH keys; Dokploy has setup, validate, security audit, public IP/time, server actions and remote-only mode. |
| Remote deploy servers and separate build servers | Partial | Upstand server/build-server IDs and remote server page; verify complete remote Docker transport and deployment/build split. |
| Docker Swarm init, managers/workers, join commands, node update/remove, token rotation | Parity/partial | Upstand has explicit Swarm use cases for these; Dokploy has dedicated cluster settings, node UI and application placement controls. |
| GPU detection/setup | Partial | Upstand exposes GPU status/setup endpoints; Dokploy has GPU setup utilities and UI. |
| Docker cleanup/prune/builder/unused image-volume cleanup | Partial | Upstand web-server cleanup endpoints cover most actions; compare safety prompts, scopes and scheduled cleanup. |
| Web-server management, Traefik terminal/logs, update/reload | Partial | Both expose control/update/log flows; Dokploy's operational surface is larger and Traefik-centric. |
| Self-update, release channels, update status | Parity/partial | Upstand has documented immutable release/channel/rollback flow and UI; Dokploy has version/release/update checks and automatic update controls. |
| Scheduled jobs / cron | Partial | Dokploy schedules can run deployment/backup jobs and enterprise cron utilities; Upstand has general scheduler and backup scheduler but no full resource schedule UI equivalent found. |
| Notifications | Partial | Upstand channel/delivery workers exist; Dokploy supports custom, Discord, email, Gotify, Lark, Ntfy, Pushover, Resend, Slack, Teams, Telegram plus per-provider connection tests. Compare provider parity exactly. |
| Concurrent builds | Partial | Both have queue/concurrency concepts; Dokploy has per-server concurrency UI and deployment queues per server. |

### Security, enterprise, and integrations

| Dokploy capability | Upstand status | Evidence / gap |
|---|---|---|
| Secret encryption at rest | Parity | Both encrypt sensitive credentials; Upstand explicitly uses secret-box and organization-scoped API-key hashing. |
| SSO (enterprise) | Missing | Dokploy has SSO provider registration, trusted origins and sign-in enforcement. |
| SCIM (enterprise) | Missing | Dokploy has SCIM schema/router. |
| Custom roles (enterprise) | Missing | Dokploy has dedicated custom-role UI/router. |
| Whitelabeling (enterprise) | Missing | Dokploy has enterprise whitelabel settings/UI. |
| License-key activation and enterprise plan settings | Missing | Dokploy has license-key router/service/UI. |
| Stripe billing and cloud provisioning | Missing | No Upstand equivalent found. |
| SSH key generation/storage | Parity/partial | Both support SSH keys; compare import, rotation, use by provider and server setup. |
| Docker registries | Parity/partial | Both CRUD/test registries; Dokploy additionally uses registries for builds, Swarm auth and rollbacks. |
| AI provider/model management | Parity/partial | Both support provider settings, model listing and encrypted keys; UpGal has richer approval/MCP operational integration, Dokploy has project assistant/template generation. |

## Dokploy API coverage appendix

The authoritative tiny-feature inventory is the checked-in `openapi.json`: 450 paths across these router groups: `admin`, `ai`, `application`, `backup`, `bitbucket`, `certificate`, `cluster`, `compose`, `deployment`, `destination`, `docker`, `domain`, `environment`, `gitea`, `github`, `gitlab`, `gitProvider`, `licenseKey`, `mariadb`, `mongo`, `mounts`, `mysql`, `notification`, `organization`, `patch`, `port`, `postgres`, `previewDeployment`, `project`, `redirects`, `redis`, `registry`, `rollback`, `schedule`, `security`, `server`, `settings`, `sshKey`, `sso`, `stripe`, `swarm`, `user`, and `volumeBackups`.

Important Dokploy-only or easy-to-miss procedures include:

* Application: `cancelDeployment`, `cleanQueues`, `clearDeployments`, `killBuild`, `markRunning`, `refreshToken`, `reload`, `save*Provider`, `saveBuildType`, `updateTraefikConfig`.
* Compose: `deployTemplate`, `fetchSourceType`, `getConvertedCompose`, `getDefaultCommand`, `getTags`, `import`, `isolatedDeployment`, `loadMountsByService`, `loadServices`, `processTemplate`, `randomizeCompose`.
* Deployment/rollback/preview: centralized/by-server/by-type listings, queue listing, process kill, preview redeploy/delete, rollback delete/execute.
* Docker/settings: container searches by labels/name/service/stack, container restart, Traefik file/env/middleware editing, GPU setup, Docker builder/prune/cleanup, log cleanup, Redis reload.
* Notifications: separate create/update/test procedures for Custom, Discord, Email, Gotify, Lark, Ntfy, Pushover, Resend, Slack, Teams, and Telegram.
* Enterprise: SSO trusted origins/providers, SCIM, custom roles, audit logs, forward auth, whitelabeling, license validation/settings.

## Recommended parity order for Upstand

1. Finish resource parity: typed application/Compose/database settings, domains/certificates, ports, mounts, redirects, security headers, and service-specific credentials.
2. Finish deployment lifecycle parity: webhooks/refresh tokens/watch paths, build-server/concurrency controls, previews, rollbacks, zero-downtime behavior, and deployment cleanup.
3. Finish operations parity: global Docker explorer, service terminal/log filters, Traefik configuration, scheduled jobs, notifications provider parity, volume backup UI, and templates.
4. Close infrastructure gaps: remote Docker/build servers, validation/security audit, GPU, cluster placement, and installer/update observability.
5. Decide product scope explicitly for libSQL, CDN, forward auth, SSO/SCIM/custom roles/whitelabeling, billing, and cloud provisioning. These are not merely missing UI; they require domain, authorization, persistence, and operational decisions.

## Evidence locations

Dokploy: `openapi.json`, `apps/dokploy/server/api/routers`, `packages/server/src/services`, `packages/server/src/db/schema`, `packages/server/src/utils`, `apps/dokploy/components/dashboard`, Dockerfiles, README/GUIDES.  
Upstand: `packages/api/src/routers`, `packages/usecases/src`, `packages/db/src/schema`, `packages/domain/src`, `apps/web/src/app`, `apps/web/src/features`, and `apps/fumadocs/content/docs`.

External documentation consulted: [Dokploy documentation index](https://docs.dokploy.com/docs/core), [architecture](https://docs.dokploy.com/docs/core/architecture), [features](https://docs.dokploy.com/docs/core/features), [applications](https://docs.dokploy.com/docs/core/applications), and [Docker Compose](https://docs.dokploy.com/docs/core/docker-compose).
