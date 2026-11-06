---
titre: Consignes de l'opérateur
type: regle
statut: actif
maj: 2026-11-06
---

# Consignes

| Date | Consigne | Pourquoi |
| --- | --- | --- |
| 2026-10-25 | **Livrer en gestes séparés, chacun vérifié** : commit, puis push de `master`, puis tag, puis push du tag — jamais `commit && tag && push` d'un seul bloc. | Un commit refusé (identité git absente) a laissé le tag se poser et partir sur le commit de la version précédente ; il a fallu le supprimer à distance. |
| 2026-11-06 | **Le titre du panneau reste sobre** : il tient sur une ligne, sans annonce passagère. Ce qui est ponctuel passe par un toast ou par `/cockpit`. | La flèche vers la nouvelle version, à côté du titre, faisait passer le numéro à la ligne dans un dock étroit : jugé « inutile, moche » par l'opérateur, retiré en 0.5.1. |
