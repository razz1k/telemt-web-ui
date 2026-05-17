#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

# git clean -dfX, minus:
#   node_modules anywhere, config/, data/, .env*
candidates=$(
  git clean -dfX -n 2>/dev/null \
    | awk '{print $NF}' \
    | grep -vE \
        -e '(^|/)node_modules(/|$)' \
        -e '^config(/|$)' \
        -e '^data(/|$)' \
        -e '^\.env(\.local)?$' \
    || true
)

if [ -z "$candidates" ]; then
  printf 'Nothing to clean.\n'
  exit 0
fi

printf 'Dry run (files that would be removed):\n'
printf '%s\n' "$candidates" | sed 's/^/  /'

printf '\nDelete these files? [y/N] '
read -r ans
case $ans in
  y|Y|yes|YES) ;;
  *)
    printf 'Cancelled.\n'
    exit 1
    ;;
esac

printf '%s\n' "$candidates" | while IFS= read -r f; do
  [ -e "$f" ] || [ -L "$f" ] || continue
  printf 'Removing %s\n' "$f"
  rm -rf "$f"
done

printf 'Done.\n'
