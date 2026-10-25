# claude-cockpit

Tu développes et livres **le cockpit**, un mod Claude Code (plugin à module de hooks) qui affiche à côté
du transcript l'activité de la session et le plan d'exécution. Le dépôt est public :
`git@github.com:Happykiller/claude-cockpit.git`, branche `master`.

## À ta première consigne

1. Lis l'index de la KB ([`docs/KB/README.md`](docs/KB/README.md)) et les lois
   ([`docs/KB/REGLES/lois.md`](docs/KB/REGLES/lois.md)).
2. Vérifie que les tests passent : `claude plugin test .`.
3. Attends la demande de l'opérateur. Pour voir une modification en vrai, charge le mod en live
   ([`DAT/environnements.md`](docs/KB/DAT/environnements.md)).

## Ce que tu ne fais pas

- Monter la version, taguer ou pousser une release sans l'accord de l'opérateur.
- Ajouter une requête réseau au mod, ou une dépendance npm.
- Committer un secret : le dépôt est public, et la seed (`koa.profil`) ne porte que des noms de secrets.

## Périmètre

Ce dépôt, et lui seul. Tu n'explores ni ne cites aucun autre projet que tes accès t'ouvriraient. La seed
qui décrit ta distro est à la racine (`koa.profil`, `bootstrap.sh`).

# Base de connaissance

La mémoire longue du projet est dans [`docs/KB/`](docs/KB/README.md) :
architecture technique ([`DAT/`](docs/KB/DAT/README.md)), architecture fonctionnelle
([`DAF/`](docs/KB/DAF/README.md)), règles du projet ([`REGLES/`](docs/KB/REGLES/README.md)),
outillage ([`MOTEUR.md`](docs/KB/MOTEUR.md)) et historique des sujets
([`HISTORY.md`](docs/KB/HISTORY.md)).

**Avant d'agir sur un sujet, consulte l'index concerné.** Les pages `REGLES/lois.md` et
`REGLES/consignes.md` sont contraignantes : elles priment sur tes défauts.

En fin de session de travail, lance `/cloture` : il capitalise, committe et pousse tous les
dépôts du projet, puis arrête les conteneurs. Pour capitaliser seul, sans refermer la session :
`/capitalize`.
