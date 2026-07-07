#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SRC_DIR="$ROOT_DIR/skills/chipgen"
DEST_ROOT="${CODEX_HOME:-$HOME/.codex}/skills"
DEST_DIR="$DEST_ROOT/chipgen"

if [ ! -f "$SRC_DIR/SKILL.md" ]; then
  echo "Skill source not found: $SRC_DIR" >&2
  exit 1
fi

mkdir -p "$DEST_ROOT"

if [ -e "$DEST_DIR" ]; then
  if [ "${1:-}" = "--force" ]; then
    rm -rf "$DEST_DIR"
  else
    echo "Destination already exists: $DEST_DIR" >&2
    echo "Run './install-skill.sh --force' to replace it." >&2
    exit 1
  fi
fi

cp -R "$SRC_DIR" "$DEST_DIR"
chmod +x "$DEST_DIR/scripts/chipgen.js" 2>/dev/null || true

echo "Installed chipgen skill to $DEST_DIR"
echo "Restart Codex to pick up new skills."
