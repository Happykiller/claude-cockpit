---
titre: Workflows — développer, tester, livrer
type: regle
statut: actif
maj: 2026-10-25
---

# Workflows

## Développer une fonction

1. La logique pure dans `hooks/model.ts`, le branchement dans `register.tsx`, le dessin dans `view.tsx`
   ([arborescence](../DAT/arborescence.md)). Un champ d'état nouveau se déclare dans `types/index.d.ts`.
2. Un test dans `tests/cockpit.test.ts` (nom en français, qui dit la règle).
3. Contrôles : `claude plugin test .`, `claude plugin validate .`, et le typage
   (`npx -y -p typescript@5.6.3 tsc -p .`, une fois les types posés par le moteur).
4. Voir la fonction en vrai : le mod en live ([environnements](../DAT/environnements.md)).
5. CHANGELOG `[Unreleased]`, README anglais et français, et `docs/make_demo.py` si le panneau change.

## Livrer une version

Les étapes 1 à 3 du README (section Develop), **une commande à la fois** ([consignes](consignes.md)) :

1. CHANGELOG : `[Unreleased]` → `## [x.y.z] - AAAA-MM-JJ`, lien de comparaison en bas.
2. Le même numéro dans `plugin.json` et `hooks/version.ts` ; `scripts/check-version.sh` doit dire ✔.
3. Tests et validation au vert.
4. Commit `feat: x.y.z — …` ; **vérifier qu'il existe** (`git log -1`).
5. `git push origin master`.
6. `git tag vx.y.z` sur ce commit, puis `git push origin vx.y.z`.
7. Vérifier le workflow `release` et `releases/latest` (API publique, `gh` n'est pas connecté).

Un tag parti sur le mauvais commit : le workflow échoue au contrôle des versions et ne publie rien ; le
supprimer (`git push origin :refs/tags/vx.y.z`) demande l'opérateur en mode auto.
