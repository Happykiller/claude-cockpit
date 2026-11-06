---
titre: Environnements — dev, live, release
type: dat
statut: actif
maj: 2026-11-06
---

# Environnements

## La distro de dev (KoA)

Le projet vit dans une distro WSL créée par KoA (`claude-cockpit`, utilisateur `agent`, dépôt dans
`~/projet`), décrite par la seed à la racine (`koa.profil`, `bootstrap.sh`).

- **Pousser** : la clé `~/.ssh/koa_seed`, déposée par KoA pour tous les hôtes, a l'écriture sur le dépôt
  GitHub. Aucun secret de plus.
- **Committer** : la distro n'a pas d'identité git par défaut ; `bootstrap.sh` la pose sur le dépôt depuis
  les secrets `GIT_USER_NAME` / `GIT_USER_EMAIL`. Sans elle, `git commit` échoue.
- **`gh` n'est pas authentifié** : l'état d'un workflow se lit par l'API publique
  (`curl https://api.github.com/repos/Happykiller/claude-cockpit/actions/runs`).
- **Mode auto** : le classifieur refuse certains gestes (supprimer un tag distant, installer un plugin
  d'une marketplace). Les donner à l'opérateur, à lancer avec `! <commande>`.
- Le montage Windows est ouvert : l'opérateur y partage des captures (`/mnt/c/Users/…`).

## La distro Debian de l'opérateur

Le dépôt vit aussi dans `~/claude-cockpit` (utilisateur `happykiller`), avec d'autres réglages que la
distro de dev. Vérifier où l'on est avant de suivre une procédure (`whoami`, `$WSL_DISTRO_NAME`).

- **Pousser** : `origin` est en HTTPS et `gh` est authentifié. `gh auth setup-git` est posé dans le
  `~/.gitconfig` global (2026-11-06), donc un simple `git push origin <ref>` passe par le jeton de `gh`.
  La clé SSH n'est pas utilisée : elle a été refusée pour ses permissions trop ouvertes.
- **`gh` répond** : `gh run list --workflow release.yml` donne l'état d'un workflow.
- **Le cockpit installé est ce dépôt** : la marketplace est locale, et `/reload-plugins` relit
  `~/claude-cockpit`. Il charge donc aussi ce qui n'est pas committé, et `/cockpit update` n'est pas
  nécessaire ici pour voir une version.
- **Pas de `docker`** dans cette distro.

## Le mod en live

Pour voir une modification dans la session même : lier le dépôt dans le dossier des mods de la session
(skill `plugin-authoring` → `~/.claude/dev-mods/<session>/cockpit` → lien vers `~/projet`), puis accepter
le rechargement à chaud. Chaque modification recharge le mod à la fin du tour. Hors de cette voie :
`claude --plugin-dir ~/projet`, ou `CLAUDE_CODE_PLUGIN_DIRS` (README, section Develop).

Le plugin installé depuis la marketplace et le mod en dev portent le même nom : ne pas charger les deux.

## La release

Un tag `vX.Y.Z` poussé lance `.github/workflows/release.yml` : il vérifie que le tag et les trois numéros
de version concordent, puis publie la GitHub Release avec la section du CHANGELOG. Les cockpits installés
interrogent `releases/latest` au plus une fois par heure et l'annoncent. Procédure :
[workflows](../REGLES/workflows.md).
