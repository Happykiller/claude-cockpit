# Changelog

Every notable change to the cockpit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the version numbers follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version you run shows next to the panel's title (`◢◤ C O C K P I T  v0.3.0`), and `/cockpit version` prints it.

## [Unreleased]

## [0.3.2] - 2026-10-12

### Fixed

- A blocked step stays blocked while work goes on with another step: a step waiting for a decision is not done ([#2](https://github.com/Happykiller/claude-cockpit/issues/2)). This takes back part of 0.3.1: moving on to another step no longer closes the earlier ones. A step left running goes back to waiting, as in 0.2.0. Your next prompt still puts a blocked step back in progress.
- The summary of the folded steps no longer counts a time for steps closed without having been opened. It shows `—` when they are the only ones ([#1](https://github.com/Happykiller/claude-cockpit/issues/1)).

### Changed

- A blocked step shows `⏸` in amber, the pause Claude Code's own footer draws, instead of `✗` in coral, which read as a failure ([#3](https://github.com/Happykiller/claude-cockpit/issues/3)).

## [0.3.1] - 2026-10-12

### Fixed

- A blocked step no longer stays "waiting for the operator" once you have answered. Your next prompt puts it back in progress, and Claude moving on to a later step closes the steps it left running or blocked.
- The time a step spends waiting for you is left out of its measured time, so a long wait no longer skews the calibration of Claude's estimates.

## [0.3.0] - 2026-10-12

### Added

- The version number next to the panel's title, and `/cockpit version`, which also says how to update and how to turn on auto-update.
- A newer release shows beside the title (`v0.3.0 → v0.4.0`), and a toast says it once. The cockpit reads the latest release from the GitHub API, at most once a day, and not at all when `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set.
- Releases: a tag `vX.Y.Z` publishes the GitHub Release with that version's changelog section, once the tag and the version numbers agree.
- This changelog, and the README's steps to turn on auto-update.

### Fixed

- The execution mode follows `shift+tab` again, `manual` included. When the mode changes, the prompt footer is read once more with the mode being left, then without any mode. The cockpit takes the next mode in the cycle from that. It learns your own cycle (with `bypass permissions`, for example) and keeps it from one session to the next.

## [0.2.0] - 2026-10-11

### Added

- Four sections: Configuration (model, mode, effort), Statistics (duration, cost, tokens sent and received), Activity, Plan. Each title folds on a click or its key (`1` to `4`). A folded section keeps a one-line summary, and the choice is kept across sessions.
- Session tokens added up request by request, subagents included. The cache line gives the share of what was sent that was read back from the prompt cache.
- The timeline runs across the whole width: a node where each step began, ⚑ at the end, step numbers above and real or expected times below.
- The 5-hour window's projection at the pace of the last 45 minutes.
- Background work: shells and subagents still running, each with its run time.
- Calibration: real time against estimate, stored across sessions and given back to Claude.
- A notification and a toast when a step is blocked or a plan ends. A toast before auto-compaction.
- Ten minutes after a plan ends, the panel shows the plans this session finished.
- One-line install from the repository's marketplace, an English and a French README, animated mockups and the MIT license.

### Changed

- The plan's title has its own line, with the elapsed and remaining time under it.
- The history shows only the current session's plans.

### Fixed

- An expired limit window reads as renewed, and the usage is read again right away.
- A step closed without having been opened is marked as not timed.
- Background work empties on time: a task leaves on its end notification, and a new session starts empty.

## [0.1.0] - 2026-10-10

### Added

- The cockpit: an animated panel in terminal cells, docked beside the transcript or as a band above the prompt.
- Live activity: model, effort, execution mode, 5-hour and weekly limits, context split, output per request.
- The plan as a timeline, from Claude's own tools `mcp__cockpit__plan` and `mcp__cockpit__step`, and from `TodoWrite` and `TaskCreate` lists.
- Colors taken from the terminal's theme.

[Unreleased]: https://github.com/Happykiller/claude-cockpit/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/Happykiller/claude-cockpit/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/Happykiller/claude-cockpit/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Happykiller/claude-cockpit/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Happykiller/claude-cockpit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Happykiller/claude-cockpit/releases/tag/v0.1.0
