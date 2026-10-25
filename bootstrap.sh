#!/usr/bin/env bash
# Rejouable : KoA le relance à chaque reprovisionnement. Ne journalise jamais la valeur d'un secret.
set -euo pipefail
[ -f "$HOME/.agent-env" ] && source "$HOME/.agent-env"
cd "$(dirname "$0")"

# L'identité des commits, posée sur ce seul dépôt : la release se fait par commit puis tag.
git config user.name "$GIT_USER_NAME"
git config user.email "$GIT_USER_EMAIL"

echo "bootstrap : distro=${WSL_DISTRO_NAME:-?} utilisateur=$(whoami) identité git=${GIT_USER_EMAIL:+posée}" | tee "$HOME/bootstrap.log"
