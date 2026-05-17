#!/bin/sh
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

printf 'Dry run (files that would be removed):\n'
git clean -dfX -n \
  -e apps/api/node_modules/ \
  -e apps/web/node_modules/ \
  --exclude=data/state.db \
  --exclude='data/*.db' \
  -- ':!data'

printf '\nDelete these files? [y/N] '
read -r ans
case $ans in
  y|Y|yes|YES) ;;
  *)
    printf 'Cancelled.\n'
    exit 1
    ;;
esac

git clean -dfX \
  -e apps/api/node_modules/ \
  -e apps/web/node_modules/ \
  --exclude=data/state.db \
  --exclude='data/*.db' \
  -- ':!data'
