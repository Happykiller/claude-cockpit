---
titre: État de session et store partagé
type: dat
statut: actif
maj: 2026-10-25
---

# État et store

Trois mémoires, de durées différentes :

| Où | Durée | Ce qu'on y met |
| --- | --- | --- |
| variables du module (`let` en tête de `register.tsx`) | jusqu'au prochain rechargement du mod | ce que le prochain tick replie dans l'état : minuteur, mode lu dans le pied du prompt, largeur du dock |
| `$.state` (atomes `cockpit/*`, déclarés dans `types/index.d.ts`) | la session, rechargements compris | ce que le dessin lit : activité, plan, espace session, tâches de fond, sections repliées |
| `$.store` | **toutes les sessions** de la machine | calibrage (`samples`, 60 étapes), plans finis (`plans`, 40, chacun marqué de sa session), sections repliées, cycle `shift+tab`, dernière release vue, largeur de référence |

Ce qui en découle :

- **Le store est partagé entre sessions concurrentes** : ses bornes (`KEEP_PLANS = 40`) sont dimensionnées
  pour qu'une session active ne chasse pas les plans des autres, et le panneau ne montre que ceux de sa
  session.
- **Un rechargement garde `$.state` et `$.store` et perd le module** : le nouveau code lit des valeurs
  écrites par l'ancien. Un champ ajouté à un type d'état est donc **absent** des états existants : le lire
  avec un repli (`stored.flow ?? []`), comme le fait le rendu du `Pane`. Voir [lois](../REGLES/lois.md).
- **Le dessin n'écrit jamais** : ce qu'il observe (le mode lu dans le pied du prompt) passe par une
  variable du module, que le tick suivant reporte dans l'état.
- Le compte des tokens commence au chargement du mod : une session déjà en cours avant ne compte pas ce
  qui précède (limite documentée au README).
