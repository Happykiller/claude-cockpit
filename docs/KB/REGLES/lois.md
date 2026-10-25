---
titre: Lois
type: regle
statut: actif
maj: 2026-10-25
---

# Lois

1. **Rien de l'opérateur ne sort de sa machine.** La seule requête réseau du mod est la lecture de
   `releases/latest` sur l'API GitHub, une fois par heure au plus, et elle se tait sous
   `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. Le README le promet (« Nothing about you or your sessions is
   sent anywhere ») : une nouvelle requête est une rupture de cette promesse, à décider avec l'opérateur.
2. **Les trois numéros de version concordent** — `.claude-plugin/plugin.json`, `hooks/version.ts`, la
   première entrée datée de `CHANGELOG.md` — et **ne changent que dans le commit qu'on tague**. Pourquoi :
   les installations en mise à jour automatique prennent la version de `plugin.json` sur `master` ; un
   numéro monté avant le tag annonce une version qui n'existe pas encore.
3. **Le nouveau code lit l'ancien état.** Tout champ ajouté à un type de `$.state` ou du store se lit avec
   un repli : un rechargement garde les valeurs écrites par la version précédente ([etat](../DAT/etat.md)).
4. **Un dessin (`ui.render`) n'écrit jamais l'état** : il redessinerait en boucle.
5. **Un hook qui répond pour un outil ou qui garde porte son `.catch`** : sans gestionnaire, un hook qui
   échoue est sauté, et ce qu'il gardait passe. Les outils du cockpit répondent alors un `deny` qui dit l'échec.
6. **Jamais de secret dans le dépôt**, seed comprise : `koa.profil` ne porte que des **noms** de secrets,
   les valeurs se saisissent dans KoA. Le dépôt est **public**.
