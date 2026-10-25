---
titre: Ce que la session reçoit — prompt système et outils
type: daf
statut: actif
maj: 2026-10-25
---

# Les outils du modèle

Le cockpit parle à la session par deux voies : une section du **prompt système** (`GUIDE` dans
`register.tsx`, injectée par `prompt.compose`, plus la leçon du calibrage), et quatre **outils**
enregistrés par `$.tool.register`.

| Outil | Écrit / lit | Pour quoi |
| --- | --- | --- |
| `mcp__cockpit__plan` | écrit | déclarer ou compléter (`append`) le plan, une estimation par étape |
| `mcp__cockpit__step` | écrit | une transition d'étape, avec une note |
| `mcp__cockpit__board` | écrit | l'espace session : entrées par `id`, chiffres clés, journal |
| `mcp__cockpit__usage` | **lit** | la consommation du compte : % fenêtre 5 h et semaine, renouvellements, projection, contexte |

Règles qui ne se voient pas dans le code :

- **Le plan et l'espace session ne se recopient pas** : le plan est le travail de Claude lui-même ;
  l'espace session sert ce qu'il **orchestre** (sous-agents, agents ouverts).
- **Un sous-agent ne tient pas le plan** (le prompt le dit) : les transitions viennent de la boucle
  principale.
- **`mcp__cockpit__usage` (0.5.0)** est né d'une demande d'un agent orchestrateur qui ne pouvait pas
  anticiper l'épuisement de la fenêtre de 5 h : les limites sont **celles du compte**, partagées par toutes
  ses sessions. L'outil relit `$.session.usage()` à l'appel (pas de retard de 15 s), et la projection
  vient des relevés que garde le panneau : elle est « pas encore lisible » pendant les dix premières minutes.
- Un outil refusé rend un `deny` en français qui dit quoi faire (« déclare-le d'abord avec
  mcp__cockpit__plan »), pour que la session se corrige seule.
