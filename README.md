# cockpit

Mod Claude Code : un panneau animé, dessiné en cellules de terminal, qui montre en permanence

- **l'activité** : modèle, effort, mode d'exécution, fenêtre de 5 h et semaine (consommation, heure de fin), contexte, durée et coût de la session ;
- **la frise du plan** : étapes faites (temps réel / estimé), étape en cours (barre, dépassement en corail), étapes à venir, reste et heure de fin estimés.

Docké à droite en plein écran (≥ 110 colonnes), en bandeau au-dessus du prompt sinon : le moteur choisit, le mod suit.

Maquette : https://claude.ai/artifact/Fc2HcwnsbS38fkUZAqsykZ

## Le plan

Le mod déclare deux outils, `mcp__cockpit__plan` (titre, étapes, estimation en minutes) et `mcp__cockpit__step` (transition d'une étape), et une section du prompt système demande à Claude de s'en servir pour tout travail de trois étapes ou plus. TodoWrite et TaskCreate/TaskUpdate sont suivis aussi quand la session les a.

## Commandes

- `/cockpit` : ouvre le panneau
- `/cockpit reset` : efface le plan
- `/cockpit close` : ferme le panneau

## Installation

Chargé par `CLAUDE_CODE_PLUGIN_DIRS` (bloc `env` de `~/.claude/settings.json`), qui pointe sur ce dossier : une modification se recharge à chaud.

## Vérifier

```bash
claude plugin validate .
claude plugin test .
```
