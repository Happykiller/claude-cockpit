---
titre: Consignes de l'opérateur
type: regle
statut: actif
maj: 2026-10-25
---

# Consignes

| Date | Consigne | Pourquoi |
| --- | --- | --- |
| 2026-10-25 | **Livrer en gestes séparés, chacun vérifié** : commit, puis push de `master`, puis tag, puis push du tag — jamais `commit && tag && push` d'un seul bloc. | Un commit refusé (identité git absente) a laissé le tag se poser et partir sur le commit de la version précédente ; il a fallu le supprimer à distance. |
