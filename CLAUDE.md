# Task Calendar

## The screen is decided

`docs/design/README.md` and the boards in `docs/design/canvas/` are the approved design; `docs/superpowers/specs/2026-10-30-task-calendar-design.md` is the spec behind them. Where they disagree, the design wins. The main screen is transferred **pixel for pixel** (every size, colour, radius, font, mask and shadow from `canvas/Screen.dc.html`), except Obsidian's own chrome. A screen the design doesn't show is built only as `docs/design/README.md`'s last section says, and gets designed before it is polished.

## Both platforms

The plugin is used every day on the phone (iOS) and on the desktop (macOS). Every screen, gesture and control must work and look designed on both: a board for each platform where they differ, and a visual check of both in the test Obsidian (phone view and a desktop window, light and dark) before a release. A feature checked on one platform only is not done.

## Documentation

`docs/plugin/` is the plugin's user documentation, in Russian: `README.md` is the core (what makes this task manager different and how a day goes with it), the inner pages hold the file format, the screen, the actions, calendars, settings, how an agent edits the tasks file, and what Max sets up by hand (Scriptable, Shortcuts, Google) and how to check it. Not the spec and not the design. To learn how the plugin behaves, read these pages, not the code. A change to behaviour a user sees or to anything set up by hand (steps, names, buttons, files) updates these pages in the same branch.

## Layers

`src/domain` (pure: the file, the tasks, the rules), `src/application` (`contracts.ts` is the API the UI talks to; services), `src/infrastructure` (vault, Google, the work file), `src/ui` (the view). `ui` imports `application` only, never `domain` internals or `infrastructure`. `src/settings.ts` and `src/application/contracts.ts` are shared contracts: change them only with the whole team, never in a side branch alone.

## One design system

- `styles.css`: the `body { … }` block at the top holds every token (`--tc-…`): colours, radii, sizes, type, spacing, motion. Component rules only read `var(--tc-…)`. `tests/styles.test.ts` fails on a bare number, colour or radius in a rule, on an unused or undefined token, and on `DESIGN` in `src/ui/design.ts` disagreeing with the CSS. Don't loosen it: move the value into a token.
- Colours are the design's (explicit), not Obsidian's theme, except the light accent (`--interactive-accent`) and the ground: `--tc-bg` is the theme's `--background-primary` (black on the phone, grey on the desktop), and a plain card and the switch's track are that ground lifted towards the text (`color-mix`), so they stand out on either. The theme follows Obsidian's: the `body.theme-light { … }` block right after the tokens overrides the colours with the light values of the board «Палитра»; it defines no new names. Event colours are computed in `src/ui/eventColors.ts` per theme.

## Trying a build

Never in `~/Obsidian`: it is production and syncs to the phone. A separate Obsidian with a scratch vault and its own profile: `open -n -a Obsidian --args --user-data-dir=<scratch>/obsidian-user --remote-debugging-port=9333`, the vault registered in that profile's `obsidian.json`, the branch build in `.obsidian/plugins/task-calendar/`. One such instance is usually already running on port 9333 (`ps aux | grep remote-debugging-port`): reuse it. Phone view: window 390×844, then `app.emulateMobile(true)` over the debugging port; screenshots through CDP (`Page.captureScreenshot`). A page in a browser is not a check: it runs the code outside Obsidian.

## Releasing

Per `~/.claude/CLAUDE.md`, «Свои плагины Obsidian». Version in `manifest.json`, `package.json`, `versions.json`. No CI: `npm run build`, then `gh release create <version> main.js manifest.json styles.css`. BRAT: `kudrmax/obsidian-task-tracker`, plugin id `task-calendar`.

The release is the task; installing it through BRAT is a try, not a must. If the `obsidian` CLI can't reach Max's Obsidian (no socket, «Command line interface is not enabled», another session's test Obsidian holds it), say so in one line and the task is done: Max runs the update himself. Don't wait for the CLI, don't offer to restart his Obsidian, don't close or restart any test Obsidian to free it.

## Files

Delete only with `trash`, never `rm`.

## Branches

`master` is the only long-lived branch; the main clone stays on it. Every piece of work is a branch from a fresh master in its own worktree under `.worktrees/`. Once Max approves: merge `origin/master` into the branch and run the tests there; then, in the main clone, `git pull --ff-only`, `git merge --no-ff <branch>` and `git push origin master` at once, then the release. No PRs. (`mvp` was removed on 2026-11-05: it only mirrored master.)
