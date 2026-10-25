---
titre: Arborescence et découpage du module
type: dat
statut: actif
maj: 2026-10-25
---

# Arborescence

La table des chemins est tenue dans le [README, section Develop](../../../README.md#develop) ; elle n'est
pas recopiée ici. Ce que le README ne dit pas, c'est **la règle de découpage** :

| Fichier | Contient | Ne contient pas |
| --- | --- | --- |
| `hooks/model.ts` | des **fonctions pures** : mise en forme, transitions du plan, totaux, projection, calibrage, relevé `usageReport` | aucun accès à `$`, aucune horloge implicite (`now` est passé en argument) |
| `hooks/view.tsx` | le dessin : `Dock` (panneau latéral) et `Band` (bande au-dessus du prompt) | aucune écriture d'état |
| `hooks/register.tsx` | les hooks, les outils, la commande `/cockpit`, les atomes d'état, le texte du prompt système (`GUIDE`) | de la logique testable seule : elle va dans `model.ts` |
| `types/index.d.ts` | le contrat de l'état (`PluginState`) | — |

Pourquoi : tout ce qui est pur se teste sans moteur (`tests/cockpit.test.ts` importe `../hooks/model`
directement), et un dessin qui écrirait l'état redessinerait en boucle.

Les maquettes du README (`docs/cockpit-*.svg`) ne sont **pas** des captures : `docs/make_demo.py` les
redessine. Un changement visible du panneau se reporte à la main dans ce script.
