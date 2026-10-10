# Cockpit for Claude Code

**English** · [Français](README.fr.md)

An animated side panel for [Claude Code](https://claude.com/claude-code) that keeps two things in sight while Claude works: **what the session is consuming**, and **where the plan stands**.

<p align="center">
  <img src="docs/cockpit-dock.svg" alt="Cockpit docked beside the Claude Code transcript: activity gauges on top, the plan as a timeline below" width="100%">
</p>

<sub>Animated mockup of the panel, drawn from the mod's layout. In the terminal, the panel is made of character cells and follows your terminal's color theme.</sub>

## What it shows

**Activity, always on**

- **Model and effort**: `Opus 5.5`, `high / max`, read from every request.
- **Execution mode**: `default`, `accept edits`, `plan`, `auto`, `bypass`. It changes as soon as you press `shift+tab`.
- **5-hour window**: how much is used, when it renews, and **where it is heading at the current pace**. For example, `⚑ at the current pace: 100 % before the end, around 14:32`.
- **Week**: how much is used and when it renews.
- **Context**: tokens out of the window, split into system, tools, messages and the compaction reserve. A toast warns you when the context reaches 90 % of the auto-compaction threshold.
- **Flow**: output tokens per request, plus the session's duration and its cost at API prices.
- **In the background**: shells and subagents still running, each with its run time.

**The plan, as a timeline**

- Claude declares the plan with an estimate for each step, then reports every transition. The cockpit draws a rail of nodes, the time spent against the estimate, a bar for the running step (it turns red past its estimate), the remaining time and the expected finish time.
- **Calibration across sessions**: the cockpit stores the real time against the estimate for every measured step. After five steps, it shows the ratio (`×1.2`) and a realistic finish time. It also gives the ratio back to Claude, who adjusts its next estimates.
- **Alerts**: a blocked step (Claude waiting for you) and a finished plan each send a terminal notification and a toast.
- Ten minutes after a plan finishes, the panel shows the latest plans instead.

**Two layouts, chosen by Claude Code**

In the fullscreen layout, from 110 columns, the cockpit docks to the right of the transcript. In a narrower terminal, it becomes a band above the prompt:

<p align="center">
  <img src="docs/cockpit-band.svg" alt="Cockpit as a band above the prompt in a narrower terminal" width="100%">
</p>

> The panel's labels are in French (`SEMAINE`, `RESTE`, `EN FOND`…). An English version is on the roadmap.

## Install

Requires **Claude Code 2.1.275 or later**: earlier versions cannot install a plugin from its marketplace in one step. The cockpit was developed and tested on 2.1.296.

In a Claude Code session, type:

```text
/plugin install cockpit --marketplace Happykiller/claude-cockpit
```

Answer `y` to add the marketplace, then pick a scope. **User** makes the cockpit available in every project. The cockpit is active right away and opens on its own at the start of each session.

### Recommended setup

**1. Let Claude update the plan without asking.** The cockpit registers two tools, `mcp__cockpit__plan` and `mcp__cockpit__step`. In the default permission mode, Claude Code may ask for approval at every step. To allow them once and for all, add them to `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["mcp__cockpit__plan", "mcp__cockpit__step"]
  }
}
```

Merge this with your existing `allow` list rather than replacing it.

**2. Remove the gray tint behind the side panel (optional).** Claude Code paints the docked panel with its own gray (`composerSidebarBackground`), which no plugin can change. The plugin ships a theme that keeps your terminal's background behind the cockpit and is otherwise identical to the dark theme. Pick **"Dark — untinted side panel"** in `/theme`.

If that theme is not listed in `/theme`, install it as a user theme:

```bash
mkdir -p ~/.claude/themes
curl -fsSL https://raw.githubusercontent.com/Happykiller/claude-cockpit/master/themes/cockpit-dark.json \
  -o ~/.claude/themes/cockpit-dark.json
```

Then set `"theme": "custom:cockpit-dark"` in `~/.claude/settings.json`, or pick it in `/theme`.

**3. Give it room.** The docked layout needs Claude Code's fullscreen layout and at least 110 columns. Below that, you get the band.

## Use

Nothing to do: a section of the system prompt asks Claude to declare a plan for any task of three steps or more, and to report each step as it goes. You can also ask for it: *"put the plan in the cockpit"*.

| Command | Effect |
| --- | --- |
| `/cockpit` | Opens the panel again (after you closed it) |
| `/cockpit reset` | Clears the current plan |
| `/cockpit close` | Closes the panel |

The cockpit also follows `TodoWrite` and `TaskCreate` / `TaskUpdate` lists when a session uses them.

To update, disable or uninstall the plugin, use the `/plugin` menu.

## How it works

The cockpit is a Claude Code **mod**: a hooks module (`hooks/register.tsx`) that the engine loads with the plugin. It only reads what the engine exposes to plugins:

| Shown | Source |
| --- | --- |
| Model, effort, context per request | the `turn.step` stream |
| Limits, renewal times, cost, context split | `session.measure` and `$.session.usage()` |
| Execution mode | the `permission_mode` of hook inputs and the prompt footer's hint |
| Background work | `classic.Stop` (`background_tasks`), `SubagentStart` / `SubagentStop`, background `Bash` calls |
| The plan | its own tools `mcp__cockpit__plan` / `mcp__cockpit__step`, plus `TodoWrite` and the task tools |

The calibration samples (the last 60 measured steps) and the latest finished plans (the last 8) are kept in the plugin's local store, under your Claude Code configuration directory. **Nothing is sent anywhere.**

## Develop

```bash
git clone https://github.com/Happykiller/claude-cockpit.git
claude --plugin-dir ./claude-cockpit
```

For hot reloading while you edit, point `CLAUDE_CODE_PLUGIN_DIRS` at the folder, for example in the `env` block of `~/.claude/settings.json`. An interactive session then reloads the mod each time you save.

After the engine has loaded the mod once, it writes its type definitions into `.claude-plugin/types/`. They are git-ignored, and `tsconfig.json` extends them.

```bash
npx -y -p typescript@5.6.3 tsc -p .   # type-check
claude plugin validate .               # manifest, marketplace, hooks
claude plugin test .                   # tests/*.test.ts
python3 docs/make_demo.py              # regenerate the README mockups
```

| Path | Role |
| --- | --- |
| `hooks/register.tsx` | the hooks: events, tools, the `/cockpit` command, state |
| `hooks/model.ts` | pure logic: formatting, plan transitions, totals, projection, calibration |
| `hooks/view.tsx` | the drawing: the docked panel and the band |
| `types/index.d.ts` | the state contract (`PluginState`) |
| `themes/cockpit-dark.json` | the untinted side-panel theme |
| `docs/make_demo.py` | the animated SVG mockups |

## Limits

- The panel's labels are in French.
- The background list is complete at the end of each turn. Between two turns, it adds what starts and drops subagents that end.
- Calibration starts after five measured steps. A step only counts as measured if Claude opened it before closing it.
- No sound: the engine has no audio player on Linux or Windows terminals.

## License

[MIT](LICENSE)
