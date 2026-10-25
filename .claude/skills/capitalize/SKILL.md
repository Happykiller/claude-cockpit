---
name: capitalize
description: Amélioration continue de fin de session. Analyse ce qui vient de se passer, identifie ce qui doit rejoindre la base de connaissance docs/KB/ (faire mieux) et ce qui est candidat à devenir un skill, un sous-agent ou un hook (faire plus efficacement). Écrit sans faire valider, puis rend compte. Déclencher avec /capitalize.
---

# /capitalize — capitaliser sur la session

Ta mission : transformer ce qui vient de se passer en **acquis durable**. Une session qui
s'achève sans capitalisation, c'est un apprentissage perdu qu'on repaiera plus tard.

Deux sorties possibles, et deux seulement :

- **Faire mieux** → une connaissance rejoint `docs/KB/`.
- **Faire plus efficacement** → un geste répété devient un outil dans `.claude/`.

## Commandes disponibles

| Commande | Action |
| --- | --- |
| `/capitalize` | Analyse la session et propose les deux volets |
| `/capitalize kb` | Volet connaissance seulement |
| `/capitalize moteur` | Volet industrialisation seulement |
| `/capitalize check` | Audit de la KB : liens morts, index désynchronisés, pages trop grosses ou obsolètes |

## Étape 1 — relire la session

Reprends l'échange depuis le début et liste, sans filtrer encore :

- ce qui a été **découvert** sur le projet (comportement, contrainte, dépendance cachée) ;
- ce qui a été **décidé**, et surtout **pourquoi** — l'alternative écartée compte autant ;
- ce que l'utilisateur a **corrigé** chez toi : c'est le signal le plus fort de tous, une
  correction non capitalisée se reproduira ;
- les gestes que tu as **répétés** ou qui ont été laborieux.

## Étape 2 — filtrer

Ne retiens que ce qui passe les trois filtres :

1. **Durable** — vrai encore dans trois mois, pas seulement aujourd'hui.
2. **Non déductible** — pas déjà lisible dans le code, le README ou l'historique git. Documenter
   ce que le dépôt dit déjà, c'est fabriquer une source qui divergera.
3. **Réutilisable** — servira à une prochaine session, pas seulement à celle-ci.

Ce qui ne passe pas est **jeté**, explicitement. Une KB qui grossit de tout est une KB qu'on ne
lit plus.

## Étape 3 — volet KB (faire mieux)

Classe chaque acquis retenu :

| Nature de l'acquis | Destination |
| --- | --- |
| Fait technique, décision d'architecture | `docs/KB/DAT/` |
| Règle métier, comportement attendu du produit | `docs/KB/DAF/` |
| Process, workflow, norme | `docs/KB/REGLES/process.md`, `workflows.md`, `normes.md` |
| Correction ou préférence de l'utilisateur envers toi | `docs/KB/REGLES/consignes.md` |
| Invariant non négociable | `docs/KB/REGLES/lois.md` |

Règles d'écriture :

- **Enrichir avant de créer** : cherche d'abord la page existante qui couvre le sujet.
- **Index-first** : toute nouvelle page est ajoutée au `README.md` de son dossier dans le même
  geste. Une page non indexée est une page perdue.
- **Découper** : si une page dépasse ~200 lignes ou ~15 Ko, transforme-la en dossier + index.
- Toujours écrire le **pourquoi**, jamais le seul quoi.
- Mettre à jour le champ `maj:` des pages touchées.
- Ajouter une ligne à `docs/KB/HISTORY.md` quand la session a **livré** quelque chose — pas pour
  dire qu'elle a eu lieu : l'historique git le sait déjà.

## Étape 4 — volet moteur (faire plus efficacement)

Pour chaque geste répété ou laborieux, choisis la bonne forme :

| Forme | Quand c'est le bon choix | Où |
| --- | --- | --- |
| **Hook** | Ça doit se déclencher tout seul, de façon déterministe, sans que personne y pense | `.claude/hooks/` |
| **Skill** | Une procédure qu'on redemande, qui demande du jugement, invoquée par `/nom` | `.claude/skills/<nom>/SKILL.md` |
| **Sous-agent** | Un travail volumineux ou une expertise à part, qui polluerait le contexte principal | `.claude/agents/<nom>.md` |
| **Règle KB** | Ça ne s'automatise pas : ça se rappelle | `docs/KB/REGLES/` |

Garde-fous :

- **Le seuil, c'est trois.** Un geste fait une fois ne justifie pas un outil. Deux fois, on note.
  Trois fois, on outille.
- **Vérifie que ça n'existe pas déjà**, dans `.claude/` du projet comme dans `~/.claude/`.
- Un outil non maintenu est pire que pas d'outil : si tu ne sais pas dire quand il se déclenchera
  la prochaine fois, c'est que c'est une règle KB, pas un outil.
- Tout outil créé est ajouté à `docs/KB/MOTEUR.md`, avec sa colonne « quand l'utiliser ».

## Étape 5 — écrire, puis rendre compte

**Écris sans faire valider** : le tri — durable, non déductible, réutilisable — **est** le travail,
le faire approuver une seconde fois le fait refaire à quelqu'un d'autre, et une clôture autonome
attendrait une validation que personne ne donnera. Deux exceptions, qui s'exposent et attendent :
ce qui **contredit** une page existante — une loi surtout —, et ce qui sort de `docs/KB/`,
`.claude/` et `tools/`.

**Rien ne passe les filtres : n'écris rien**, pas même une ligne d'historique, et dis-le en une
ligne. Une session courte sans acquis ne laisse aucune trace — c'est sa clôture normale.

Le compte rendu a cette forme :

```
## À intégrer à la KB
- [DAT/redis.md] Le cache Redis est optionnel : le service démarre sans, en mode dégradé.
  → découvert en debuggant le timeout de démarrage.

## Candidats à l'industrialisation
- [skill /deploy-preview] Enchaînement build + push + smoke test, refait 3 fois aujourd'hui.

## Écarté
- Le contournement du bug npm : temporaire, sera obsolète à la prochaine version.
```

L'utilisateur peut retirer ou amender après coup : c'est un commit qu'on corrige, pas une
autorisation qu'on attend. Termine par les fichiers créés, enrichis, les index mis à jour.
