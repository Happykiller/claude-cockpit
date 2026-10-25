---
name: cloture
description: Rituel de fin de session de travail. Capitalise les acquis dans docs/KB/, committe et pousse chaque dépôt du projet, exécute les skills de synchronisation de données du projet s'il y en a, arrête les conteneurs du projet, puis vérifie que tout est clean. Fonctionne en autonomie et ne s'arrête que sur anomalie. Déclencher avec /cloture.
---

# /cloture — clore la session de travail

Une session close, c'est trois choses vraies en même temps : **rien d'appris qui soit perdu,
rien d'écrit qui reste non poussé, rien qui tourne encore dans le vide.** Tant que l'une des
trois est fausse, la session n'est pas close — et tu le dis au lieu de conclure.

## Périmètre de ce projet

> Recensé le 2026-10-25 par `koa:poser-la-memoire`. À corriger dès que le projet change de forme.

| Dépôt | Chemin | Branche de travail | Remarque |
| --- | --- | --- | --- |
| claude-cockpit | `.` (`~/projet`) | `master` | public ; tests : `claude plugin test .` ; push direct sur `master` |

| Stack | Fichier compose | Services |
| --- | --- | --- |
| — | aucun | le mod n'a pas de conteneur |

| Skill de sync data | Ce qu'il pousse en amont | Doit tourner avant l'arrêt de |
| --- | --- | --- |

Aucune synchro de données : la table reste vide. Le grep de l'étape 1 trouve `cloture` elle-même (sa description dit « synchronisation ») : faux positif.

Une clôture **ne livre pas de version** : elle ne monte pas le numéro et ne pose pas de tag (`docs/KB/REGLES/lois.md`, loi 2).

Si cette section est vide ou fausse, **recense d'abord** (étape 1) et propose de la corriger dans
le même geste — un périmètre faux fait oublier un dépôt (ou une synchro de données), et un oubli
de ce genre est une session non close qui se croit close.

## Commandes disponibles

| Commande | Action |
| --- | --- |
| `/cloture` | Le rituel complet |
| `/cloture check` | Dry-run : ce qui *serait* fait, dépôt par dépôt, sans rien écrire ni arrêter |
| `/cloture sans-capi` | Saute la capitalisation, déjà faite dans la session |
| `/cloture sans-push` | Committe et arrête, mais ne pousse pas (réseau coupé, travail sensible) |

## Ordre d'exécution — non négociable

```
1. recenser  →  2. capitaliser  →  3. committer  →  4. pousser  →  5. synchroniser les données
→  6. arrêter  →  7. vérifier
```

Les conteneurs tombent **en dernier**, jamais en premier : un hook de pre-commit, une suite de
tests, une migration lancée par la capitalisation, ou une synchro de données peut encore avoir
besoin de la base. Un conteneur arrêté trop tôt transforme une clôture en séance de debug.

## Autonomie et arrêts

Tu enchaînes les six étapes **sans demander de validation**. Tu t'arrêtes net, tu exposes le
problème et tu attends, dans ces cas et ceux-là seulement :

- un **secret** (`.env`, clé privée, token, dump de base, credentials) est sur le point d'être
  committé ;
- un fichier modifié **n'a aucun rapport** avec la session : tu ne sais pas s'il doit partir ;
- un acquis de capitalisation **contredit** une page KB existante — jamais d'écrasement silencieux ;
- un **push rejeté** (non-fast-forward), une branche protégée, ou une règle projet qui impose une
  MR plutôt qu'un push direct ;
- une **synchro de données échoue ou signale un conflit** (remote injoignable, divergence, refus du
  skill lui-même) : tu ne forces rien côté remote, tu rapportes et tu passes à la suite ;
- un **conteneur tourne** sans être rattaché à un compose de ce projet : tu ne l'arrêtes pas ;
- un dépôt **reste sale** après commit (sous-module bougé, artefact non ignoré, conflit) ;
- un dépôt est en état intermédiaire : rebase, merge ou cherry-pick en cours ;
- les **tests du dépôt échouent** sur ce que tu t'apprêtes à committer : un rouge ne part pas sous
  le nom d'une clôture.

**La clôture se proportionne à la session.** Rien de modifié, rien de non poussé, rien appris, aucun
compose qui tourne : le recensement suffit, et le rapport tient en une ligne. Chaque étape qui n'a
rien à faire se dit en un mot et se saute — ce sont les gestes à vide qui rendent une clôture longue.

## Interdits absolus

Aucun de ces gestes ne se justifie par « pour que ce soit clean » :

- `git push --force` / `--force-with-lease` sans demande explicite ;
- `git add -A` / `git add .` sans avoir lu la liste de ce que ça ajoute ;
- `git reset --hard`, `git checkout .`, `git clean -fd`, `git stash` silencieux — nettoyer, ce
  n'est pas détruire le travail de quelqu'un ;
- `docker compose down -v` (les volumes emportent les données), `docker system prune`,
  `docker stop $(docker ps -q)` ;
- committer sur une branche protégée que les règles du projet réservent aux MR.

## Étape 1 — recenser

```bash
find . -name .git -maxdepth 3 -prune | sed 's|/\.git$||' | sort
find . -maxdepth 3 \( -name 'docker-compose*.y*ml' -o -name 'compose*.y*ml' \) -not -path '*/node_modules/*'
docker compose ls 2>/dev/null
docker ps --format '{{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Image}}'

# skills de synchronisation de données (même convention que le hook d'accueil)
grep -ril -E 'name: .*sync|description: .*(sync|synchro)' .claude/skills/*/SKILL.md 2>/dev/null
```

Confronte le résultat à la section « Périmètre » et à `docs/KB/DAT/arborescence.md`. Un dépôt
présent sur le disque mais absent du tableau doit être traité **et** signalé. Un skill de sync
data trouvé mais absent du périmètre doit être ajouté au tableau (étape suivante) et signalé.

Ordre de traitement : **les dépôts imbriqués et les dépendances avant le dépôt parent**. Un parent
poussé avant son sous-module pointe vers un commit que personne d'autre ne peut résoudre.

## Étape 2 — capitaliser

Exécute `/capitalize`. En clôture il travaille en autonomie : ce qui passe ses trois filtres
(durable, non déductible, réutilisable) est écrit ; ce qui contredit une page existante est un
**arrêt**, pas un arbitrage que tu rends seul.

Si `/capitalize` n'existe pas dans ce projet, ne l'improvise pas : signale-le, propose de lancer
`koa:poser-la-memoire`, et poursuis la clôture sans le volet capitalisation.

## Étape 3 — committer, dépôt par dépôt

Pour chaque dépôt du périmètre :

1. `git status --porcelain` et `git diff` — **lis** avant de stager. Ce que tu n'as pas lu, tu ne
   le committes pas.
2. Du **code** a changé : lance les tests du dépôt (la commande de son `CLAUDE.md` ou de son README),
   et garde la dernière ligne de leur sortie pour le rapport. Pas de commande connue : dis-le, ne
   l'invente pas.
3. Examine les fichiers non suivis **un par un**. Un artefact de build, un log, un dossier de
   dépendances ne se committe pas : il rejoint `.gitignore` (et c'est un commit à part).
4. **Découpe par sujet**, pas par session. Trois sujets touchés dans la journée font trois
   commits, pas un « wip fin de journée » que personne ne saura relire dans six mois.
5. Message de commit : reprends la convention réelle du dépôt (`git log --oneline -20`) et les
   règles de `docs/KB/REGLES/process.md`. Décris **l'effet obtenu**, pas la liste des fichiers.
6. Ne fabrique pas un commit vide pour « marquer la fin » : un dépôt sans modification reste sans
   commit, et c'est un résultat normal.

## Étape 4 — pousser

Sur la **branche courante** de chaque dépôt, dans l'ordre de l'étape 1. Jamais de force.

Si le push est rejeté : ne rebase pas d'office, ne force pas. Rapporte l'écart
(`git rev-list --left-right --count @{upstream}...HEAD`) et laisse la décision.

Si les règles du projet imposent une MR sur cette branche, pousse la branche de travail et
**donne le lien de création de MR** au lieu de pousser sur la cible.

## Étape 5 — synchroniser les données

Pour chaque skill de sync data du périmètre : exécute-le maintenant, **avant** l'arrêt des
conteneurs — c'est le pendant, côté clôture, de ce qu'un hook d'accueil de session peut tirer du
remote à l'ouverture : ce que le hook d'accueil
a pu tirer du remote en début de session, ce skill le pousse vers le remote en fin de session.

- S'il n'y a aucun skill de ce type dans le périmètre, cette étape est un **no-op** explicite : dis
  « aucune synchro de données pour ce projet » et passe à la suite, n'improvise rien.
- Un skill qui échoue ou signale un conflit est un **arrêt** (cf. « Autonomie et arrêts »), pas une
  synchro que tu forces ou que tu ignores en silence.
- Si `/cloture sans-push` a été demandé, applique la même prudence à la synchro de données : elle
  aussi pousse vers un remote, donc elle est sautée pour la même raison, et signalée comme telle.

## Étape 6 — arrêter les conteneurs

`docker compose ls` vide au recensement : rien à arrêter, l'étape se saute. Sinon, uniquement ce
qui appartient au projet, stack par stack, depuis le dossier du compose :

```bash
docker compose -f <fichier> down       # sans -v : les volumes survivent
```

Un conteneur du projet lancé hors compose s'arrête nommément (`docker stop <nom>`). Tout ce qui
n'est pas identifié comme appartenant au projet **reste en vie** et part dans le rapport.

## Étape 7 — vérifier

La clôture n'est pas ce que tu as fait, c'est ce qui est vrai à la fin. Prouve-le :

```bash
# Chaque dépôt : working tree propre et rien en attente de push
for r in <dépôts du périmètre>; do
  printf '%-24s ' "$r"
  [ -z "$(git -C "$r" status --porcelain)" ] && printf 'clean  ' || printf 'SALE   '
  git -C "$r" rev-list --left-right --count @{upstream}...HEAD 2>/dev/null \
    | awk '{print ($1==0 && $2==0) ? "sync" : "retard/avance: "$1"/"$2}'
done

# Plus aucun conteneur du projet
docker ps --format '{{.Names}}\t{{.Label "com.docker.compose.project"}}'
```

Si le périmètre a des skills de sync data, leur résultat (poussé / échoué / no-op) est vérifié ici
au même titre qu'un push : une synchro non confirmée n'est pas une session close.

## Étape 8 — rendre compte

Court, factuel, et honnête sur ce qui n'a pas pu être refermé :

```
## Clôture — <projet>

Capitalisation : 2 pages KB enrichies, 1 créée, 1 ligne HISTORY, 0 outil.
Tests : api « 212 passed », front « 48 passed ».

| Dépôt        | Commits | Push       | État final |
| ---          | ---     | ---        | ---        |
| api          | 2       | ok develop | clean      |
| front        | 1       | ok develop | clean      |
| socle        | 0       | —          | clean      |

Synchro de données : `/sync-fixtures` exécuté, poussé sans conflit.

Conteneurs : stack `socle` arrêtée (4 services). Aucun conteneur du projet encore en vie.

Non refermé :
- `extension` : push rejeté, 3 commits d'avance côté remote — à rebaser à la main.
```

S'il n'y a rien dans « Non refermé », écris-le explicitement. **La session est close** est une
affirmation vérifiée, pas une formule de politesse.
