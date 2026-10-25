---
titre: Stack — un mod Claude Code
type: dat
statut: actif
maj: 2026-10-25
---

# Stack

- **Un plugin Claude Code dont tout le code est un module de hooks** (`hooks/hooks.json` → `hooks/register.tsx`).
  Le moteur l'exécute dans un environnement à lui : **ni DOM, ni Node**, pas de `require`, pas d'`import()`.
  Tout ce qui sort du module passe par `$` (`$.session`, `$.state`, `$.store`, `$.ui`, `$.tool`,
  `$.process`, `$.http`…).
- **TypeScript + JSX** compilé contre le global `h` ; les éléments (`Box`, `Text`…) viennent de
  `$.ui.resolve(e)`, jamais d'un import.
- **Aucune dépendance npm.** Les types de l'API sont écrits par le moteur dans `.claude-plugin/types/`
  (ignoré par git) au premier chargement ; `tsconfig.json` les étend.
- **Tests** : `claude plugin test .` exécute `tests/*.test.ts` avec le kit `claude-code/testing`
  (moteur simulé, horloge `mock.clock`, store `mock.store`).
- **Version minimale annoncée** : Claude Code 2.1.275 (installation depuis la marketplace en un geste).
  L'API des mods est en accès anticipé : elle peut changer d'une version de Claude Code à l'autre — un
  test qui casse après une mise à jour du moteur se lit d'abord dans les types régénérés.
- Le reste est hors module : `docs/make_demo.py` (Python 3, sans dépendance) dessine les maquettes SVG du
  README ; `scripts/check-version.sh` (bash) ; `.github/workflows/release.yml`.

Pourquoi un mod et pas un serveur MCP : le panneau, la bande, les notifications et le prompt système ne
sont atteignables que depuis un module de hooks ; les « outils » `mcp__cockpit__*` sont enregistrés par
`$.tool.register`, sans serveur.
