---
titre: Le plan d'exécution et le calibrage
type: daf
statut: actif
maj: 2026-10-25
---

# Le plan

**Intention** : que l'opérateur voie où en est un travail long sans lire le transcript, et que les
estimations de Claude deviennent justes avec le temps.

- **Sources** : les outils `mcp__cockpit__plan` / `mcp__cockpit__step` (source `cockpit`), et à défaut
  `TodoWrite` ou `TaskCreate` / `TaskUpdate`. Un plan déclaré par le cockpit n'est jamais remplacé par une
  liste `TodoWrite`.
- **Statuts** : `pending`, `in_progress`, `completed`, `blocked`, `skipped`. `blocked` veut dire « attend
  l'opérateur », **jamais** « le travail s'arrête » ; la réponse de l'opérateur remet l'étape en cours.
- **Chronos** : une étape ne se mesure que si elle a été **ouverte** (`in_progress`) avant d'être close.
  Close sans avoir été ouverte, son temps s'affiche deviné (`≈`, compté depuis la fin de la précédente) et
  n'entre **pas** au calibrage. L'attente en `blocked` ne compte pas non plus.
- **Calibrage** : le rapport temps réel / estimation des étapes mesurées, gardé dans le store (60 dernières,
  toutes sessions). À partir de cinq, il est rendu à Claude dans le prompt système ; le panneau ne l'affiche
  pas.
- **Jamais figé** : le prompt système exige de clore l'étape en cours avant la réponse finale, et de passer
  le reste en `skipped` avec une note quand le travail s'arrête avant la fin (0.4.1).
- **Une étape bloquée le reste** quand le travail avance sur une autre : passer à l'étape suivante ne
  clôt pas les précédentes (#2, 0.3.2). Bloquée s'affiche en pause (`⏸`, ambre), pas en échec (#3).
  Les tests qui portent ces règles citent le numéro de l'issue.
