#!/bin/sh
set -eu

read_secret() {
  file="$1"
  [ -r "$file" ] || { echo "missing Docker secret: $file" >&2; exit 1; }
  tr -d '\r\n' < "$file"
}

export POSTGRES_PASSWORD="$(read_secret "${POSTGRES_PASSWORD_FILE:-/run/secrets/postgres_password}")"
export REDIS_PASSWORD="$(read_secret "${REDIS_PASSWORD_FILE:-/run/secrets/redis_password}")"
export BETTER_AUTH_SECRET="$(read_secret "${BETTER_AUTH_SECRET_FILE:-/run/secrets/better_auth_secret}")"
export SSH_KEY_ENCRYPTION_KEY_V1="$(read_secret "${SSH_KEY_ENCRYPTION_KEY_V1_FILE:-/run/secrets/ssh_key_encryption_key}")"

export DATABASE_URL="postgresql://${DATABASE_USER:-upstand}:${POSTGRES_PASSWORD}@${DATABASE_HOST:-localhost}:5432/${DATABASE_NAME:-upstand}"
export REDIS_URL="redis://:${REDIS_PASSWORD}@${REDIS_HOST:-localhost}:6379"

exec "$@"
