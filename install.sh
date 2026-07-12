#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Production Docker Swarm installer. It deliberately does not guess a public
# address or pull mutable application tags: both are unsafe cluster defaults.

readonly INSTALL_DIR="/etc/upstand"
readonly ENV_FILE="$INSTALL_DIR/.env"
readonly SOURCE_DIR="$INSTALL_DIR/source"
readonly NETWORK_NAME="${DOCKER_NETWORK:-upstand-network}"
# BASH_SOURCE is an array only when Bash executes a file. A curl | bash install
# has no array element, so use the scalar expansion with a safe $0 fallback.
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE:-$0}")" && pwd)"
STACK_FILE="$INSTALL_DIR/docker-compose.prod.yml"

fail() {
  echo "error: $*" >&2
  exit 1
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || fail "run this installer as root"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command '$1' is not available"
}

require_digest_image() {
  local name="$1"
  local image="${!name:-}"
  [[ "$image" == *@sha256:* ]] || fail "$name must be set to an immutable image digest (for example ghcr.io/acme/image@sha256:...)"
}

ensure_git() {
  if command -v git >/dev/null 2>&1; then
    return
  fi
  command -v apt-get >/dev/null 2>&1 || fail "git is required to build from GitHub source; install git or provide immutable image digests"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y git
}

build_source_images() {
  local repository="${UPSTAND_REPOSITORY:-https://github.com/mhbdev/upstand.git}"
  local ref="${UPSTAND_REF:-master}"
  [[ "$repository" == https://github.com/*/*.git ]] || fail "UPSTAND_REPOSITORY must be a public HTTPS GitHub repository URL"
  [[ "$ref" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "UPSTAND_REF contains unsupported characters"

  ensure_git
  rm -rf "$SOURCE_DIR"
  git clone --depth 1 --branch "$ref" "$repository" "$SOURCE_DIR"
  local revision
  revision="$(git -C "$SOURCE_DIR" rev-parse --verify HEAD)"

  UPSTAND_SERVER_IMAGE="upstand-server:source-${revision}"
  UPSTAND_WEB_IMAGE="upstand-web:source-${revision}"
  UPSTAND_DOCS_IMAGE="upstand-docs:source-${revision}"

  docker build --file "$SOURCE_DIR/apps/server/Dockerfile" --tag "$UPSTAND_SERVER_IMAGE" "$SOURCE_DIR"
  docker build --file "$SOURCE_DIR/apps/web/Dockerfile" --build-arg "NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL" --tag "$UPSTAND_WEB_IMAGE" "$SOURCE_DIR"
  docker build --file "$SOURCE_DIR/apps/fumadocs/Dockerfile" --tag "$UPSTAND_DOCS_IMAGE" "$SOURCE_DIR"
  SOURCE_BUILD=true
}

ensure_stack_file() {
  [[ -f "$STACK_FILE" ]] && return
  install -d -m 0700 "$INSTALL_DIR"
  local repository="${UPSTAND_REPOSITORY:-https://github.com/mhbdev/upstand.git}"
  local ref="${UPSTAND_REF:-${UPSTAND_VERSION:-master}}"
  local raw_repository="${repository%.git}"
  raw_repository="${raw_repository#https://github.com/}"
  curl --fail --show-error --silent --location \
    "https://raw.githubusercontent.com/${raw_repository}/${ref}/docker-compose.prod.yml" \
    --output "$STACK_FILE"
  chmod 0600 "$STACK_FILE"
}

detect_advertise_address() {
  local address="${SWARM_ADVERTISE_ADDR:-}"
  if [[ -z "$address" ]]; then
    address="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}' || true)"
  fi
  [[ -n "$address" ]] || fail "set SWARM_ADVERTISE_ADDR to a routable private or public IPv4/IPv6 address"
  [[ "$address" != 127.* && "$address" != "0.0.0.0" && "$address" != "::1" && "$address" != "::" ]] || fail "SWARM_ADVERTISE_ADDR must not be loopback or unspecified"
  printf '%s' "$address"
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    require_command curl
    curl --fail --show-error --silent --location https://get.docker.com | sh
  fi

  systemctl enable --now docker
  docker version >/dev/null
}

ensure_swarm() {
  local advertise_address="$1"
  local status
  status="$(docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null || true)"

  if [[ "$status" != "active" ]]; then
    docker swarm init --advertise-addr "$advertise_address" --data-path-port 4789
  fi

  [[ "$(docker info --format '{{.Swarm.ControlAvailable}}')" == "true" ]] || fail "this host is a Swarm worker; run the installer on a reachable manager"

  local node_id
  node_id="$(docker info --format '{{.Swarm.NodeID}}')"
  docker node update --label-add upstand.control-plane=true "$node_id" >/dev/null

  if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    docker network create --driver overlay --attachable --label com.upstand.managed=true "$NETWORK_NAME" >/dev/null
  fi

  local driver scope attachable
  driver="$(docker network inspect --format '{{.Driver}}' "$NETWORK_NAME")"
  scope="$(docker network inspect --format '{{.Scope}}' "$NETWORK_NAME")"
  attachable="$(docker network inspect --format '{{.Attachable}}' "$NETWORK_NAME")"
  [[ "$driver" == "overlay" && "$scope" == "swarm" && "$attachable" == "true" ]] || fail "existing network '$NETWORK_NAME' must be an attachable Swarm overlay network"
}

write_environment() {
  install -d -m 0700 "$INSTALL_DIR"
  install -d -m 0700 "$INSTALL_DIR/secrets"

  local advertise_address="${1:-}"

  local requested_better_auth_url="${BETTER_AUTH_URL:-}"
  local requested_cors_origin="${CORS_ORIGIN:-}"
  local requested_server_url="${NEXT_PUBLIC_SERVER_URL:-}"
  local requested_server_image="${UPSTAND_SERVER_IMAGE:-}"
  local requested_web_image="${UPSTAND_WEB_IMAGE:-}"
  local requested_docs_image="${UPSTAND_DOCS_IMAGE:-}"
  local requested_auto_update="${UPSTAND_AUTO_UPDATE:-}"
  local requested_version="${UPSTAND_VERSION:-}"

  if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
  fi

  # A first-run install should be usable without requiring DNS setup up front.
  # Use nip.io defaults for a public IPv4 manager; operators can replace these
  # origins in the environment file and rerun the installer later.
  if [[ -z "${BETTER_AUTH_URL:-}" || -z "${CORS_ORIGIN:-}" || -z "${NEXT_PUBLIC_SERVER_URL:-}" ]]; then
    if [[ "$advertise_address" =~ ^[0-9]+(\.[0-9]+){3}$ ]]; then
      local default_api="https://api.${advertise_address}.nip.io"
      local default_dashboard="https://app.${advertise_address}.nip.io"
      if [[ -t 0 ]]; then
        read -r -p "API origin [${BETTER_AUTH_URL:-$default_api}]: " input_api
        read -r -p "Dashboard origin [${CORS_ORIGIN:-$default_dashboard}]: " input_dashboard
        BETTER_AUTH_URL="${input_api:-${BETTER_AUTH_URL:-$default_api}}"
        CORS_ORIGIN="${input_dashboard:-${CORS_ORIGIN:-$default_dashboard}}"
      else
        BETTER_AUTH_URL="${BETTER_AUTH_URL:-$default_api}"
        CORS_ORIGIN="${CORS_ORIGIN:-$default_dashboard}"
      fi
      NEXT_PUBLIC_SERVER_URL="${NEXT_PUBLIC_SERVER_URL:-$BETTER_AUTH_URL}"
      echo "Using default HTTPS origins: API=$BETTER_AUTH_URL dashboard=$CORS_ORIGIN" >&2
    else
      fail "set BETTER_AUTH_URL, CORS_ORIGIN, and NEXT_PUBLIC_SERVER_URL, or run on a host with a public IPv4 address for automatic nip.io defaults"
    fi
  fi

  [[ -r "$INSTALL_DIR/secrets/postgres_password" ]] && POSTGRES_PASSWORD="$(cat "$INSTALL_DIR/secrets/postgres_password")"
  [[ -r "$INSTALL_DIR/secrets/redis_password" ]] && REDIS_PASSWORD="$(cat "$INSTALL_DIR/secrets/redis_password")"
  [[ -r "$INSTALL_DIR/secrets/better_auth_secret" ]] && BETTER_AUTH_SECRET="$(cat "$INSTALL_DIR/secrets/better_auth_secret")"
  [[ -r "$INSTALL_DIR/secrets/ssh_key_encryption_key" ]] && SSH_KEY_ENCRYPTION_KEY_V1="$(cat "$INSTALL_DIR/secrets/ssh_key_encryption_key")"
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 32)}"
  REDIS_PASSWORD="${REDIS_PASSWORD:-$(openssl rand -hex 32)}"
  BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$(openssl rand -hex 32)}"
  SSH_KEY_ENCRYPTION_KEY_V1="${SSH_KEY_ENCRYPTION_KEY_V1:-$(openssl rand -base64 32 | tr -d '\n')}"
  printf '%s' "$POSTGRES_PASSWORD" >"$INSTALL_DIR/secrets/postgres_password"
  printf '%s' "$REDIS_PASSWORD" >"$INSTALL_DIR/secrets/redis_password"
  printf '%s' "$BETTER_AUTH_SECRET" >"$INSTALL_DIR/secrets/better_auth_secret"
  printf '%s' "$SSH_KEY_ENCRYPTION_KEY_V1" >"$INSTALL_DIR/secrets/ssh_key_encryption_key"
  chmod 0600 "$INSTALL_DIR/secrets"/*
  DOCKER_NETWORK="$NETWORK_NAME"

  BETTER_AUTH_URL="${requested_better_auth_url:-${BETTER_AUTH_URL:-}}"
  CORS_ORIGIN="${requested_cors_origin:-${CORS_ORIGIN:-}}"
  NEXT_PUBLIC_SERVER_URL="${requested_server_url:-${NEXT_PUBLIC_SERVER_URL:-}}"
  UPSTAND_SERVER_IMAGE="${requested_server_image:-${UPSTAND_SERVER_IMAGE:-}}"
  UPSTAND_WEB_IMAGE="${requested_web_image:-${UPSTAND_WEB_IMAGE:-}}"
  UPSTAND_DOCS_IMAGE="${requested_docs_image:-${UPSTAND_DOCS_IMAGE:-}}"
  UPSTAND_AUTO_UPDATE="${requested_auto_update:-${UPSTAND_AUTO_UPDATE:-false}}"

  : "${BETTER_AUTH_URL:?set BETTER_AUTH_URL to the HTTPS API origin}"
  : "${CORS_ORIGIN:?set CORS_ORIGIN to the HTTPS dashboard origin}"
  : "${NEXT_PUBLIC_SERVER_URL:?set NEXT_PUBLIC_SERVER_URL to the HTTPS API origin}"
  [[ "$BETTER_AUTH_URL" == https://* ]] || fail "BETTER_AUTH_URL must use HTTPS"
  [[ "$CORS_ORIGIN" == https://* ]] || fail "CORS_ORIGIN must use HTTPS"
  [[ "$NEXT_PUBLIC_SERVER_URL" == https://* ]] || fail "NEXT_PUBLIC_SERVER_URL must use HTTPS"
  UPSTAND_DASHBOARD_HOST="${CORS_ORIGIN#https://}"
  UPSTAND_API_HOST="${BETTER_AUTH_URL#https://}"
  [[ "$UPSTAND_DASHBOARD_HOST" != */* && "$UPSTAND_API_HOST" != */* ]] || fail "dashboard and API origins must not include a path"

  if [[ "${UPSTAND_BUILD_FROM_SOURCE:-false}" == true || -z "$UPSTAND_SERVER_IMAGE$UPSTAND_WEB_IMAGE$UPSTAND_DOCS_IMAGE" ]]; then
    build_source_images
  fi
  if [[ "${SOURCE_BUILD:-false}" != true ]]; then
    require_digest_image UPSTAND_SERVER_IMAGE
    require_digest_image UPSTAND_WEB_IMAGE
    require_digest_image UPSTAND_DOCS_IMAGE
  fi

  cat >"$ENV_FILE" <<EOF
DOCKER_NETWORK=$DOCKER_NETWORK
BETTER_AUTH_URL=$BETTER_AUTH_URL
CORS_ORIGIN=$CORS_ORIGIN
NEXT_PUBLIC_SERVER_URL=$NEXT_PUBLIC_SERVER_URL
UPSTAND_DASHBOARD_HOST=$UPSTAND_DASHBOARD_HOST
UPSTAND_API_HOST=$UPSTAND_API_HOST
UPSTAND_SERVER_IMAGE=$UPSTAND_SERVER_IMAGE
UPSTAND_WEB_IMAGE=$UPSTAND_WEB_IMAGE
UPSTAND_DOCS_IMAGE=$UPSTAND_DOCS_IMAGE
UPSTAND_AUTO_UPDATE=$UPSTAND_AUTO_UPDATE
UPSTAND_VERSION=$requested_version
POSTGRES_IMAGE=${POSTGRES_IMAGE:-postgres:16.4-alpine}
REDIS_IMAGE=${REDIS_IMAGE:-redis:7.4-alpine}
UPSTAND_SERVER_PORT=${UPSTAND_SERVER_PORT:-3000}
UPSTAND_WEB_PORT=${UPSTAND_WEB_PORT:-3001}
UPSTAND_DOCS_PORT=${UPSTAND_DOCS_PORT:-4000}
EOF
  chmod 0600 "$ENV_FILE"
}

deploy_stack() {
  local stack_file="$STACK_FILE"
  if [[ "${SOURCE_BUILD:-false}" == true ]]; then
    stack_file="$SOURCE_DIR/docker-compose.prod.yml"
  fi
  [[ -f "$stack_file" ]] || fail "docker-compose.prod.yml is unavailable"
  install -m 0600 "$stack_file" "$INSTALL_DIR/docker-compose.yml"

  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  if [[ "${SOURCE_BUILD:-false}" == true ]]; then
    docker stack deploy \
      --compose-file "$INSTALL_DIR/docker-compose.yml" \
      --prune \
      --resolve-image never \
      upstand
  else
    docker stack deploy \
      --compose-file "$INSTALL_DIR/docker-compose.yml" \
      --with-registry-auth \
      --prune \
      --resolve-image always \
      upstand
  fi
}

wait_for_stack() {
  local deadline=$((SECONDS + 600))
  local services=(postgres redis server web fumadocs)

  while ((SECONDS < deadline)); do
    local converged=true
    for service in "${services[@]}"; do
      local service_name="upstand_${service}"
      if ! docker service inspect "$service_name" >/dev/null 2>&1; then
        converged=false
        break
      fi

      local desired running
      desired="$(docker service inspect --format '{{if .Spec.Mode.Replicated}}{{.Spec.Mode.Replicated.Replicas}}{{else}}0{{end}}' "$service_name")"
      running="$(docker service ps --filter desired-state=running --format '{{.CurrentState}}' "$service_name" | grep -c '^Running ' || true)"
      if [[ "$desired" -lt 1 || "$running" -ne "$desired" ]]; then
        converged=false
        break
      fi
    done

    local server_container web_container docs_container
    server_container="$(docker ps -q --filter label=com.docker.swarm.service.name=upstand_server | head -n1)"
    web_container="$(docker ps -q --filter label=com.docker.swarm.service.name=upstand_web | head -n1)"
    docs_container="$(docker ps -q --filter label=com.docker.swarm.service.name=upstand_fumadocs | head -n1)"

    if [[ "$converged" == true ]] \
      && [[ -n "$server_container" && -n "$web_container" && -n "$docs_container" ]] \
      && docker exec "$server_container" curl --fail --silent http://127.0.0.1:3000/health/ready >/dev/null \
      && docker exec "$web_container" node -e "fetch('http://127.0.0.1:3001/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" \
      && docker exec "$docs_container" node -e "fetch('http://127.0.0.1:4000/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"; then
      return
    fi
    sleep 5
  done

  docker stack services upstand >&2 || true
  docker stack ps --no-trunc upstand >&2 || true
  fail "Upstand services did not become ready within 10 minutes"
}

main() {
  require_root
  require_command openssl
  require_command awk
  require_command ip
  require_command curl
  require_command grep
  ensure_docker
  local advertise_address
  advertise_address="$(detect_advertise_address)"
  ensure_stack_file
  write_environment "$advertise_address"
  ensure_swarm "$advertise_address"
  deploy_stack
  wait_for_stack

  echo "Upstand has been deployed and all services report ready."
  echo "Control-plane state is pinned to node label upstand.control-plane=true."
  echo "Use 'docker stack services upstand' to watch rollout status."
}

main "$@"
