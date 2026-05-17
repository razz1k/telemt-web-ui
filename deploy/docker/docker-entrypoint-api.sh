#!/bin/sh
set -eu

STORAGE_DIR=/var/lib/telemt-web-ui
TARGET_UID="${UID:-1000}"
TARGET_GID="${GID:-1000}"

mkdir -p "$STORAGE_DIR"

# Bind mount ./data may be root-owned when Docker creates it on first run.
if [ "$(id -u)" = "0" ]; then
  chown -R "${TARGET_UID}:${TARGET_GID}" "$STORAGE_DIR" 2>/dev/null || true
  exec su-exec "${TARGET_UID}:${TARGET_GID}" "$@"
fi

exec "$@"
