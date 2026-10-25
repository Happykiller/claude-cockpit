---
titre: Le panneau — placements, sections, alertes
type: daf
statut: actif
maj: 2026-10-25
---

# Le panneau

- **Deux placements, choisis par Claude Code, pas par le mod** : le dock à droite du transcript (mode plein
  écran, 110 colonnes au moins) et la bande au-dessus du prompt. Toute fonction se pense pour les deux
  (`Dock` et `Band` dans `view.tsx`).
- **Sections du dock** : Configuration (1), Statistiques (2), Activité (3), Plan (4), Espace session (5).
  Chacune se replie sur une ligne de résumé ; le choix est gardé d'une session à l'autre.
- **Une section sans objet se cache** : le Plan sans plan, l'Espace session vide. Un plan fini reste dix
  minutes.
- **Couleurs du thème du terminal**, aucun fond peint ; le gris du dock vient de Claude Code, d'où le thème
  `themes/cockpit-dark.json`.
- **Alertes** (notification du terminal + toast) : une étape bloquée, un plan fini, une entrée de l'espace
  session bloquée ou en échec, le contexte à 90 % du seuil de compaction, une nouvelle version publiée.
  Chacune sonne **une fois** par occurrence.
- **Langue** : les libellés du panneau sont en français ; une version anglaise est annoncée au README
  (« on the roadmap ») — À COMPLÉTER : priorité et forme (option `userConfig` ? langue du système ?).
- **Rien ne sort de la machine** sauf la lecture de `releases/latest` sur l'API GitHub, une fois par heure
  au plus, coupée par `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. Voir [lois](../REGLES/lois.md).
