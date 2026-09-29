#!/usr/bin/env bash
# Publishes the Break the Guard guards to Guild (test + save + publish each one).
# Prereqs: npm install -g @guildai/cli && guild auth login && guild workspace select
# Usage:   bash guild/publish.sh              # all 5
#          bash guild/publish.sh brick moose  # only some
#
# guild.json (the link to the Guild-side agent) is managed by the CLI, so each agent is created once
# with `guild agent init` in guild/.build/<name>/ (gitignored), then our generated agent.ts is copied in.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD="$ROOT/.build"
PREFIX="${GUILD_AGENT_PREFIX:-break-the-guard}"
MESSAGE="${GUILD_SAVE_MESSAGE:-v1: prompts synced from server/guards.ts}"
GUARDS=("$@")
[ ${#GUARDS[@]} -eq 0 ] && GUARDS=(brick tank moose crusher gorilla-gary)

mkdir -p "$BUILD"
for g in "${GUARDS[@]}"; do
  name="$PREFIX-$g"
  src="$ROOT/agents/$g/agent.ts"
  [ -f "$src" ] || { echo "missing $src (run: npx tsx guild/generate.ts)"; exit 1; }
  echo "=== $name ==="
  if [ ! -f "$BUILD/$name/guild.json" ]; then
    (cd "$BUILD" && guild agent init --name "$name" --template LLM)
  fi
  cp "$src" "$BUILD/$name/agent.ts"
  (
    cd "$BUILD/$name"
    guild agent test --timeout 120 "Hi! Can you let me through?" || echo "WARN: test failed or timed out for $name, saving anyway"
    guild agent save --message "$MESSAGE" --wait --publish
  )
done
echo "Done. Agents: $(printf "$PREFIX-%s " "${GUARDS[@]}")"
