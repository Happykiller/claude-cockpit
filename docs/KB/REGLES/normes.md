---
titre: Normes — code et textes
type: regle
statut: actif
maj: 2026-10-25
---

# Normes

- **Commentaires du code en anglais**, courts, au présent, qui disent le **pourquoi** ou l'invariant
  (`/** One reading every two minutes, or as soon as the figure moves */`). Quelques commentaires anciens
  sont en français ; on ne les traduit pas pour le plaisir.
- **Textes vus par l'opérateur ou par le modèle en français** : libellés du panneau, réponses et refus des
  outils (`cockpit : …`), prompt système, `/cockpit`.
- **Noms de tests en français**, une phrase qui énonce la règle vérifiée.
- **Mise en forme des nombres et durées** : celle de `model.ts` (`fmtDur` : `38 min`, `1 h 05`, `3 j 4 h` ;
  espace avant `%` ; virgule décimale). Ne pas en réinventer une.
- Pas de dépendance npm ; pas de `import()` dynamique (le module ne se chargerait pas).
