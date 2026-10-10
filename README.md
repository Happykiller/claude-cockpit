# cockpit

Mod Claude Code : un panneau animé, dessiné en cellules de terminal, qui montre en permanence

- **l'activité** : modèle, effort, mode d'exécution, fenêtre de 5 h (avec sa projection au rythme actuel) et semaine, contexte, durée de la session et son coût en équivalent API, travail laissé en fond (commandes, sous-agents) ;
- **la frise du plan** : étapes faites (temps réel / estimé, « — » pour une étape close sans avoir été ouverte), étape en cours (barre, dépassement en rouge), étapes à venir, reste et heure de fin estimés ; un plan fini laisse place, dix minutes après, aux derniers plans.

Docké à droite en plein écran (≥ 110 colonnes), en bandeau au-dessus du prompt sinon : le moteur choisit, le mod suit.

Maquette : https://claude.ai/artifact/Fc2HcwnsbS38fkUZAqsykZ

## Le plan

Le mod déclare deux outils, `mcp__cockpit__plan` (titre, étapes, estimation en minutes) et `mcp__cockpit__step` (transition d'une étape), et une section du prompt système demande à Claude de s'en servir pour tout travail de trois étapes ou plus. TodoWrite et TaskCreate/TaskUpdate sont suivis aussi quand la session les a.

**Calibrage.** Chaque étape chronométrée (ouverte puis close) range son couple estimé / réel dans le store du mod (`samples`, les 60 dernières), d'une session à l'autre. Dès cinq étapes, le cockpit affiche le rapport réel / estimé et une heure de fin corrigée, et la consigne du prompt le donne à Claude pour qu'il corrige ses estimations. Les plans finis sont gardés aussi (`plans`, les 8 derniers).

**Alertes.** Une étape bloquée et un plan fini envoient une notification du terminal et un toast ; le contexte à 90 % du seuil de compaction, un toast.

## Commandes

- `/cockpit` : ouvre le panneau
- `/cockpit reset` : efface le plan
- `/cockpit close` : ferme le panneau

## Installation

Chargé par `CLAUDE_CODE_PLUGIN_DIRS` (bloc `env` de `~/.claude/settings.json`), qui pointe sur ce dossier : une modification se recharge à chaud.

## Le fond du panneau

Claude Code peint le panneau latéral avec la clé de thème `composerSidebarBackground`, un gris
qu'aucun mod ne peut retirer. Pour que le cockpit garde le fond du terminal, un thème personnalisé
la redéfinit, dans `~/.claude/themes/cockpit.json` :

```json
{ "name": "Sombre — panneau sans teinte", "base": "dark",
  "overrides": { "composerSidebarBackground": "ansi:black" } }
```

puis `"theme": "custom:cockpit"` dans `~/.claude/settings.json` (ou `/theme`).

## Vérifier

```bash
claude plugin validate .
claude plugin test .
```
