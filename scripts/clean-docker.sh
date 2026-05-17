#!/bin/sh
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

found=0
for f in docker-compose*.yml; do
  if [ ! -f "$f" ]; then
    continue
  fi
  found=1
  printf '==> docker compose -f %s down -v --remove-orphans --rmi all\n' "$f"
  docker compose -f "$f" down -v --remove-orphans --rmi all
done

if [ "$found" -eq 0 ]; then
  printf 'No docker-compose*.yml in %s\n' "$ROOT" >&2
  exit 1
fi

printf '==> done\n'
