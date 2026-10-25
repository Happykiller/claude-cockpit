---
titre: Moteur — ce que porte .claude/
type: dat
statut: actif
maj: 2026-10-25
---

# Moteur

Ce que le projet donne à l'agent qui y travaille, et quand s'en servir. Constaté, pas inventé : rien
n'a été créé au-delà des gestes de la mémoire.

| Élément | Où | Quand l'utiliser |
| --- | --- | --- |
| `/capitalize` | `.claude/skills/capitalize/` | en fin de session, ou après une correction de l'opérateur : verser les acquis dans la KB |
| `/cloture` | `.claude/skills/cloture/` | pour clore une session : capitaliser, tester, committer, pousser, vérifier |
| plugin `koa@koa-skills` | `.claude/settings.json` (portée projet) | `koa:poser-la-memoire` pour remettre cette KB d'aplomb |
| le cockpit lui-même | chargé en live ([environnements](DAT/environnements.md)) | `mcp__cockpit__plan` / `step` pour un travail de trois étapes ou plus ; `mcp__cockpit__usage` avant un travail long |
| skill `plugin-authoring` | fournie par Claude Code | avant de toucher à l'API des mods : types, événements, `claude plugin test` / `validate` |

Hors `.claude/`, les outils du dépôt : `scripts/check-version.sh` (avant une release),
`docs/make_demo.py` (après un changement visible du panneau).

Aucun sous-agent, hook ni serveur MCP propre au projet.
