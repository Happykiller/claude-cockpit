---
titre: Process — commits, versions, CHANGELOG
type: regle
statut: actif
maj: 2026-10-25
---

# Process

- **Commits** : en français, `type: résumé` (`feat`, `fix`, `style`, `docs`). Une livraison est un commit
  `feat: x.y.z — ce qu'elle apporte` (ou `fix:`), dont le corps reprend les entrées du CHANGELOG en
  français. Les commits portent la ligne `Co-Authored-By` de Claude.
- **Branche** : on travaille et on livre sur `master`, par push direct (projet d'un seul mainteneur).
- **Versions** : SemVer. Une fonction nouvelle monte le mineur (0.4.1 → 0.5.0), une correction le patch.
- **CHANGELOG.md** : en **anglais**, au format Keep a Changelog. Chaque changement visible y entre sous
  `[Unreleased]` **dans le commit qui le fait** ; la livraison déplace ces entrées sous la version datée et
  ajoute le lien de comparaison en bas.
- **README** : deux versions, `README.md` (anglais) et `README.fr.md` (français), mises à jour **ensemble**.
- **Issues GitHub** : un correctif qui ferme une issue la cite dans le CHANGELOG (`[#2](https://github.com/Happykiller/claude-cockpit/issues/2)`) et
  dans le nom du test qui la couvre.
