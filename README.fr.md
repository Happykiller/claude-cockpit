# Cockpit pour Claude Code

[English](README.md) · **Français**

Un panneau latéral animé pour [Claude Code](https://claude.com/claude-code). Pendant que Claude travaille, il garde deux choses sous les yeux : **ce que la session consomme** et **où en est le plan**.

<p align="center">
  <img src="docs/cockpit-dock.svg" alt="Le cockpit docké à côté de la conversation Claude Code : jauges d'activité en haut, frise du plan en bas" width="100%">
</p>

<sub>Maquette animée du panneau, tirée de la disposition du mod. Dans le terminal, le panneau est fait de cellules de caractères et suit le thème de couleurs de ton terminal.</sub>

## Ce qu'il montre

**La configuration**

- **Modèle et effort** : `Opus 5.5`, `high / max`, relus à chaque requête.
- **Mode d'exécution** : `default`, `accept edits`, `plan`, `auto`, `bypass`. Il suit `shift+tab` en moins d'une seconde.

**Les statistiques**

- **La session** : sa durée, son coût en équivalent API et ses tokens, sous-agents compris : envoyés (↑), reçus (↓) et nombre de requêtes.

**L'activité, en permanence**

- **Fenêtre de 5 h** : consommation, heure de renouvellement, et **projection au rythme actuel**. Par exemple : `⚑ au rythme actuel : 100 % avant la fin, vers 14:32`.
- **Semaine** : consommation et renouvellement.
- **Contexte** : tokens sur la fenêtre, répartis entre système, outils, messages et réserve de compaction. Un toast prévient quand le contexte atteint 90 % du seuil de compaction automatique.
- **Débit** : tokens produits par requête, et la taille de la dernière réponse.
- **Cache** : chaque requête renvoie toute la conversation ; ce que l'API a déjà vu, elle le relit dans son cache de prompt, environ dix fois moins cher. Le cockpit montre la part des envoyés relue du cache.
- **En fond** : les commandes et sous-agents encore en cours, chacun avec sa durée.

**Le plan, en frise**

- Claude déclare le plan avec une estimation par étape, puis signale chaque transition. Le cockpit dessine :
  - une frise sur toute la largeur : un nœud au départ de chaque étape, un ⚑ à la fin du plan, chaque étape aussi longue qu'elle dure ;
  - au-dessus des nœuds, le numéro des étapes ; en dessous, les heures : réelles pour les étapes déjà lancées, prévues (`~14:56`) pour les autres, et la fin prévue sous le ⚑ ;
  - le temps passé contre l'estimation, étape par étape ;
  - une barre pour l'étape en cours, qui passe au rouge au-delà de son estimation ;
  - le titre du plan sur sa ligne, l'écoulé et le reste juste dessous.
- **Calibrage d'une session à l'autre** : le cockpit garde le temps réel contre l'estimation de chaque étape mesurée. Au bout de cinq étapes, il transmet ce rapport à Claude, qui corrige ses estimations suivantes. Le panneau ne l'affiche pas.
- **Alertes** : une étape bloquée (Claude t'attend) ou un plan fini envoie une notification du terminal et un toast.
- La section n'apparaît que pendant un plan : sans plan en cours, elle se cache. Un plan fini reste dix minutes en vue.

**L'espace session**

- Un bloc à part, en magenta et sans frise, que la session remplit librement avec l'outil `mcp__cockpit__board` pour te montrer ce qui a du sens. Le plan reste le travail que Claude exécute lui-même ; l'espace session sert surtout quand il orchestre un travail exécuté par d'autres (sous-agents, agents ouverts) et suit un plan qu'il a écrit.
- Il affiche :
  - une barre d'avancement par statut : fait, échoué, en cours, bloqué, à venir ;
  - des chiffres clés (`tickets 12/40`), colorés ok, à surveiller ou en alerte ;
  - les entrées, chacune avec son exécutant, son avancement, sa durée et une note. Au-delà de trois, les entrées closes se replient en une ligne ; les échecs restent en vue ;
  - les quatre dernières lignes du journal, datées.
- Chaque appel complète l'espace : un `id` déjà vu met l'entrée à jour, une valeur vide retire un chiffre, `remove` retire des entrées, `reset` repart de zéro, `clear` l'efface.
- Une entrée qui passe bloquée ou en échec envoie une notification et un toast.
- Sans espace session, le bloc ne s'affiche pas.

**Des sections repliables**

- Dans le panneau latéral, chaque titre de section se replie et se rouvre : un clic dessus, ou sa touche une fois le panneau sélectionné avec `ctrl+x tab` (`1` Configuration, `2` Statistiques, `3` Activité, `4` Plan, `5` Espace session).
- Repliée, une section garde une ligne de résumé. Pour la configuration : `◆ Opus 5.5 · auto · effort high`. Pour l'activité, la fenêtre de 5 h : son taux, sa fin et la projection au rythme actuel, colorés comme la jauge (`5 H 57 % · fin 15:10 (1 h 12)  ⚑ 100 % vers 14:32`).
- Le choix est mémorisé d'une session à l'autre.

**Deux dispositions, au choix de Claude Code**

Dans la disposition plein écran, à partir de 110 colonnes, le cockpit se docke à droite de la conversation. Dans un terminal plus étroit, il devient un bandeau au-dessus du prompt :

<p align="center">
  <img src="docs/cockpit-band.svg" alt="Le cockpit en bandeau au-dessus du prompt, dans un terminal plus étroit" width="100%">
</p>

## Installation

Il faut **Claude Code 2.1.275 ou plus récent** : les versions antérieures ne savent pas installer un plugin depuis sa marketplace en une seule étape. Le cockpit a été développé et testé sur la 2.1.296.

Dans une session Claude Code, tape :

```text
/plugin install cockpit --marketplace Happykiller/claude-cockpit
```

Réponds `y` pour ajouter la marketplace, puis choisis une portée. **User** rend le cockpit disponible dans tous tes projets. Il est actif tout de suite et s'ouvre de lui-même au début de chaque session.

### Mise en place conseillée

**1. Laisser Claude tenir le plan sans demander.** Le cockpit déclare trois outils, `mcp__cockpit__plan`, `mcp__cockpit__step` et `mcp__cockpit__board`. Dans le mode de permission par défaut, Claude Code peut demander ton accord à chaque étape. Pour les autoriser une fois pour toutes, ajoute-les dans `~/.claude/settings.json` :

```json
{
  "permissions": {
    "allow": ["mcp__cockpit__plan", "mcp__cockpit__step", "mcp__cockpit__board"]
  }
}
```

Fusionne-les avec ta liste `allow` existante, sans la remplacer.

**2. Retirer la teinte grise derrière le panneau (facultatif).** Claude Code peint le panneau docké avec son propre gris (`composerSidebarBackground`), qu'aucun plugin ne peut changer. Le plugin livre un thème identique au thème sombre, sauf qu'il garde le fond de ton terminal derrière le cockpit. Choisis **« Dark — untinted side panel »** dans `/theme`.

Si ce thème n'apparaît pas dans `/theme`, installe-le comme thème utilisateur :

```bash
mkdir -p ~/.claude/themes
curl -fsSL https://raw.githubusercontent.com/Happykiller/claude-cockpit/master/themes/cockpit-dark.json \
  -o ~/.claude/themes/cockpit-dark.json
```

Puis mets `"theme": "custom:cockpit-dark"` dans `~/.claude/settings.json`, ou choisis-le dans `/theme`.

**3. Lui laisser de la place.** La disposition dockée demande la disposition plein écran de Claude Code et au moins 110 colonnes. En dessous, c'est le bandeau.

**4. Activer la mise à jour automatique.** Claude Code ne met à jour les marketplaces tierces que si tu le lui demandes. Lance `/plugin`, ouvre l'onglet **Marketplaces**, choisis `claude-cockpit`, puis **Enable auto-update**. Ou règle-le dans `~/.claude/settings.json` :

```json
{
  "extraKnownMarketplaces": {
    "claude-cockpit": {
      "source": { "source": "github", "repo": "Happykiller/claude-cockpit" },
      "autoUpdate": true
    }
  }
}
```

Claude Code récupère alors chaque nouvelle version en arrière-plan, quelques minutes après le début d'une session, et te propose de lancer `/reload-plugins`.

## Utilisation

Rien à faire : une section du prompt système demande à Claude de déclarer un plan pour toute tâche de trois étapes ou plus, puis de signaler chaque étape au fil de l'eau. Une autre lui présente l'espace session, pour suivre un travail qu'il orchestre. Tu peux aussi le lui demander : *« mets le plan dans le cockpit »*, *« suis les agents dans l'espace session »*.

| Commande | Effet |
| --- | --- |
| `/cockpit` | Rouvre le panneau, si tu l'as fermé |
| `/cockpit reset` | Efface le plan en cours et l'espace session |
| `/cockpit close` | Ferme le panneau |
| `/cockpit version` | Affiche la version installée et le lien vers le journal des versions |
| `/cockpit update` | Met le cockpit à la dernière version (les deux commandes `claude plugin` qu'on lancerait dans un terminal) ; `/reload-plugins` la charge ensuite |

Le cockpit suit aussi les listes `TodoWrite` et `TaskCreate` / `TaskUpdate` quand une session s'en sert.

Pour mettre à jour, désactiver ou désinstaller le plugin, passe par le menu `/plugin`.

## Versions

La version installée s'affiche à côté du titre du panneau (`v0.3.0`). Ce qui change d'une version à l'autre est dans [CHANGELOG.md](CHANGELOG.md), en anglais, et sur la [page des releases](https://github.com/Happykiller/claude-cockpit/releases).

Quand une version plus récente sort, le cockpit le signale : `v0.3.0 → v0.4.0` à côté du titre, et un toast, une seule fois. Avec la mise à jour automatique (étape 4 plus haut), Claude Code l'installe tout seul. Sinon, lance `/cockpit update`, puis `/reload-plugins`.

`/reload-plugins` seul ne charge que ce qui est déjà sur le disque : il ne va pas chercher de nouvelle version.

## Comment ça marche

Le cockpit est un **mod** Claude Code : un module de hooks (`hooks/register.tsx`) que le moteur charge avec le plugin. Il ne lit que ce que le moteur expose aux plugins :

| Affiché | Source |
| --- | --- |
| Modèle, effort, contexte et tokens de chaque requête (sous-agents compris pour les tokens) | le flux `turn.step` |
| Limites, renouvellements, coût, répartition du contexte | `session.measure` et `$.session.usage()` |
| Mode d'exécution | le `permission_mode` des hooks et, entre deux tours, l'indication du pied du prompt : à chaque `shift+tab`, le pied est relu une fois avec le mode qu'on quitte, et le cockpit en déduit le mode suivant dans le cycle qu'il a observé |
| Travail en fond | `classic.Stop` (`background_tasks`), `SubagentStart` / `SubagentStop`, les `Bash` lancés en fond, les notifications de fin de tâche (`prompt.submit`), `$.agent.list()` |
| Le plan | ses outils `mcp__cockpit__plan` / `mcp__cockpit__step`, plus `TodoWrite` et les outils de tâches |
| L'espace session | son outil `mcp__cockpit__board`, et rien d'autre |

Le cockpit garde dans le store local du plugin, sous ton dossier de configuration Claude Code :
- les mesures du calibrage : les 60 dernières étapes mesurées ;
- les derniers plans finis : les 40 derniers, toutes sessions confondues, chacun marqué de sa session ;
- les sections du panneau que tu as repliées.

**Rien sur toi ni sur tes sessions n'est envoyé nulle part.** La seule requête du cockpit va à l'API GitHub, au plus une fois par heure, pour lire le numéro de la dernière release. Il ne la fait pas quand `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` est défini.

## Développer

```bash
git clone https://github.com/Happykiller/claude-cockpit.git
claude --plugin-dir ./claude-cockpit
```

Pour un rechargement à chaud pendant que tu modifies, pointe `CLAUDE_CODE_PLUGIN_DIRS` sur le dossier, par exemple dans le bloc `env` de `~/.claude/settings.json`. Une session interactive recharge alors le mod à chaque enregistrement.

Une fois le mod chargé, le moteur écrit ses définitions de types dans `.claude-plugin/types/`. Elles sont ignorées par git, et `tsconfig.json` s'appuie dessus.

```bash
npx -y -p typescript@5.6.3 tsc -p .   # contrôle de types
claude plugin validate .               # manifeste, marketplace, hooks
claude plugin test .                   # tests/*.test.ts
python3 docs/make_demo.py              # régénère les maquettes du README
scripts/check-version.sh               # les trois numéros de version concordent
```

Pour publier une version :

1. Déplace les entrées `[Unreleased]` de `CHANGELOG.md` sous un nouveau titre `## [x.y.z] - date`, et ajoute son lien de comparaison en bas du fichier.
2. Écris le même numéro dans `.claude-plugin/plugin.json` et `hooks/version.ts`, puis lance `scripts/check-version.sh`.
3. Commite, pose le tag `vx.y.z`, et pousse le commit et le tag.

Le tag lance `.github/workflows/release.yml`. Il vérifie que le tag et les trois numéros de version concordent, puis publie la Release GitHub avec la section du changelog de cette version. Les utilisateurs en mise à jour automatique reçoivent la version d'après le nouveau `plugin.json` de `master`, et les autres voient la release annoncée dans le panneau. Ne change donc la version que dans le commit que tu tagues.

| Chemin | Rôle |
| --- | --- |
| `hooks/register.tsx` | les hooks : événements, outils, commande `/cockpit`, état |
| `hooks/model.ts` | la logique pure : formats, transitions du plan, totaux, projection, calibrage |
| `hooks/view.tsx` | le dessin : panneau docké et bandeau |
| `types/index.d.ts` | le contrat d'état (`PluginState`) |
| `themes/cockpit-dark.json` | le thème sans teinte derrière le panneau |
| `hooks/version.ts` | la version affichée dans le panneau |
| `.github/workflows/release.yml` | publie la Release GitHub d'un tag |
| `scripts/check-version.sh` | vérifie que le manifeste, le module et le journal des versions donnent le même numéro |
| `docs/make_demo.py` | les maquettes SVG animées |

## Limites

- **Liste « EN FOND »** : elle est complète à chaque fin de tour. Entre deux tours, elle ajoute ce qui démarre, retire une tâche dès sa notification de fin, et recoupe les sous-agents avec la liste du moteur toutes les 15 secondes.
- **Tokens de la session** : le cumul part du chargement du mod. Une session déjà ouverte au moment de l'installer ou de le recharger ne compte pas ce qui précède.
- **Calibrage** : il démarre à cinq étapes mesurées. Une étape n'est mesurée que si Claude l'a ouverte avant de la clore.
- **Pas de son** : le moteur n'a pas de lecteur audio dans les terminaux Linux et Windows.

## Licence

[MIT](LICENSE)
