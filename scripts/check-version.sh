#!/usr/bin/env bash
# The version is written in three places: they must agree before a release.
set -euo pipefail
cd "$(dirname "$0")/.."

manifest=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' .claude-plugin/plugin.json)
module=$(sed -n "s/^export const VERSION = '\([^']*\)'.*/\1/p" hooks/version.ts)
changelog=$(grep -m1 -o '^## \[[0-9][^]]*\]' CHANGELOG.md | tr -d '#[] ')

echo "plugin.json      $manifest"
echo "hooks/version.ts $module"
echo "CHANGELOG.md     $changelog"
if [[ "$manifest" != "$module" || "$manifest" != "$changelog" ]]; then
  echo "✘ the versions differ" >&2
  exit 1
fi
if ! grep -q "^\[$manifest\]: " CHANGELOG.md; then
  echo "✘ CHANGELOG.md has no link for [$manifest]" >&2
  exit 1
fi
echo "✔ version $manifest"
