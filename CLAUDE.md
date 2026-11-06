# Task Calendar

## The screen is decided

`docs/design/README.md` and the boards in `docs/design/canvas/` are the approved design; `docs/superpowers/specs/2026-10-30-task-calendar-design.md` is the spec behind them. Where they disagree, the design wins. The main screen is transferred **pixel for pixel** (every size, colour, radius, font, mask and shadow from `canvas/Screen.dc.html`), except Obsidian's own chrome. A screen the design doesn't show is built only as `docs/design/README.md`'s last section says, and gets designed before it is polished.

## Both platforms

The plugin is used every day on the phone (iOS) and on the desktop (macOS). Every screen, gesture and control must work and look designed on both: a board for each platform where they differ, and a visual check of both in the test Obsidian (phone view and a desktop window, light and dark) before a release. A feature checked on one platform only is not done.

## Documentation

`docs/plugin/` is the plugin's user documentation, in Russian: `README.md` is the core (what makes this task manager different and how a day goes with it), the inner pages hold the file format, the screen, the actions, calendars, settings, how an agent edits the tasks file, and what Max sets up by hand (Scriptable, Shortcuts, Google) and how to check it. Not the spec and not the design. To learn how the plugin behaves, read these pages, not the code. A change to behaviour a user sees or to anything set up by hand (steps, names, buttons, files) updates these pages in the same branch.

## Layers

`src/domain` (pure: the file, the tasks, the rules), `src/application` (`contracts.ts` is the API the UI talks to; services), `src/infrastructure` (vault, Google, the work file), `src/ui` (the view). `ui` imports `application` only, never `domain` internals or `infrastructure`. `src/settings.ts` and `src/application/contracts.ts` are shared contracts: change them only with the whole team, never in a side branch alone.

**The UI decides nothing.** A second frontend in Swift is coming (`../task-calendar-ios`). Everything it would have to repeat lives in `application`: what is offered and what is disabled, what a tap writes, defaults, where a new task goes, what counts as the same, empty or overdue. The UI gets the decision ready (a field in `TaskItem.can`, a service method, a ready menu model) and only draws and turns gestures into minutes and places. The test: if the Swift version would have to write this line, it doesn't belong here.

`domain` and `application` are pure: no host globals (`window`, `document`, `setTimeout`, `localStorage`…), they get the clock and timers through ports. `src/phone` is the iOS app's door, `globalThis.TaskCalendarPhone`: its functions keep their names, arguments and results (adding is fine), the app calls them. `tests/architecture.test.ts` guards the imports, the host globals (`tsconfig.core.json`) and what `contracts.ts` re-exports; `tests/uiDecides.test.ts` trips on task fields compared in `src/ui`. Don't loosen them or raise a baseline: move the decision into `application`.

## One design system

- `styles.css`: the `body { … }` block at the top holds every token (`--tc-…`): colours, radii, sizes, type, spacing, motion. Component rules only read `var(--tc-…)`. `tests/styles.test.ts` fails on a bare number, colour or radius in a rule, on an unused or undefined token, and on `DESIGN` in `src/ui/design.ts` disagreeing with the CSS. Don't loosen it: move the value into a token.
- Colours are the design's (explicit), not Obsidian's theme, except the light accent (`--interactive-accent`) and the ground: `--tc-bg` is the theme's `--background-primary` (black on the phone, grey on the desktop), and a plain card and the switch's track are that ground lifted towards the text (`color-mix`), so they stand out on either. The theme follows Obsidian's: the `body.theme-light { … }` block right after the tokens overrides the colours with the light values of the board «Палитра»; it defines no new names. Event colours are computed in `src/ui/eventColors.ts` per theme.

## Trying a build

Never in `~/Obsidian`: it is production and syncs to the phone. A separate Obsidian with a scratch vault and its own profile: `open -n -a Obsidian --args --user-data-dir=<scratch>/obsidian-user --remote-debugging-port=9333`, the vault registered in that profile's `obsidian.json`, the branch build in `.obsidian/plugins/task-calendar/`. One such instance is usually already running on port 9333 (`ps aux | grep remote-debugging-port`): reuse it. Phone view: window 390×844, then `app.emulateMobile(true)` over the debugging port; screenshots through CDP (`Page.captureScreenshot`). A page in a browser is not a check: it runs the code outside Obsidian.

## Releasing

Per `~/.claude/CLAUDE.md`, «Свои плагины Obsidian». Version in `manifest.json`, `package.json`, `versions.json`. BRAT: `kudrmax/obsidian-task-tracker`, plugin id `task-calendar`.

**A release is made only by `npm run release -- "<notes>"`, in the main clone on master.** Never `gh release create` or `gh release upload` by hand, never a `main.js` built anywhere else. A release's `main.js` is not in git: `gh` uploads whatever file lies in the folder, so a failed build silently ships an old one (0.4.133 and 0.4.137 went out with a `main.js` from before the 📌 marker, and it spoiled task lines in Max's file). The script stops on anything wrong: not master, uncommitted changes, master behind origin, versions that disagree, a failing test or build, a `main.js` whose first line isn't `// task-calendar <version>` or that is older than the last commit, and assets on GitHub that differ from the local build. Never filter the output of a build or a test (`| grep error` hid «tsc: command not found»), and check a build by a mark of the new code, never by comparing two copies of the same file. A stopped release is fixed at its cause, never walked around.

Installing the release through BRAT is a must, not a try. With the `obsidian` CLI: `betaPlugins.updatePlugin`. When the CLI can't reach Max's Obsidian (no socket, «Command line interface is not enabled», another session's test Obsidian holds it), Advanced URI runs BRAT inside his running Obsidian, in the background: `open -g "obsidian://adv-uri?vault=Obsidian&commandid=obsidian42-brat%3AcheckForUpdatesAndUpdate"`. BRAT loads the updated plugin again itself. Only one Obsidian may be running for that, so quit your own test instance first. Then check `~/Obsidian/.obsidian/plugins/task-calendar/manifest.json` shows the version and that its `main.js` starts with `// task-calendar <version>`. Never restart Max's Obsidian and never close another session's test Obsidian.

## Files

Delete only with `trash`, never `rm`.

## Branches

`master` is the only long-lived branch; the main clone stays on it. Every piece of work is a branch from a fresh master in its own worktree under `.worktrees/`. Once Max approves: merge `origin/master` into the branch and run the tests there; then, in the main clone, `git pull --ff-only`, `git merge --no-ff <branch>` and `git push origin master` at once, then the release. No PRs. (`mvp` was removed on 2026-11-05: it only mirrored master.)
