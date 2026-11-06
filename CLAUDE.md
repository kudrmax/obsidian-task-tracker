# Task Calendar

## One repository, one core, several frontends

This repository holds the whole product: the core (the tasks file and every rule about it, TypeScript), the Obsidian plugin (a frontend of that core) and the Apple apps in `apple/` (Swift frontends: the iPhone app today, a Mac app later). The core is one code, never a copy or a port: the plugin bundles it into `main.js`, the apps run `phone/task-calendar-phone.js` (built from `src/phone`, committed, `tests/phone/build.test.ts` keeps it the build of the current source) in JavaScriptCore through `apple/Core`. A rule a Swift frontend needs is added to the core and asked for through the door (`docs/door.md`), never written again in Swift. `manifest.json`, `versions.json` and `README.md` stay at the root: Obsidian and BRAT look for them there. The apps are installed from Xcode, never as GitHub releases of this repository: BRAT takes the highest release as the plugin's. `kudrmax/task-calendar-ios` is the apps' old repository: emptied, its README points here.

## The screen is decided

`docs/design/README.md` and the boards in `docs/design/canvas/` are the approved design; `docs/superpowers/specs/2026-10-30-task-calendar-design.md` is the spec behind them. Where they disagree, the design wins. The main screen is transferred **pixel for pixel** (every size, colour, radius, font, mask and shadow from `canvas/Screen.dc.html`), except Obsidian's own chrome. A screen the design doesn't show is built only as `docs/design/README.md`'s last section says, and gets designed before it is polished.

## Both platforms

The plugin is used every day on the phone (iOS) and on the desktop (macOS). Every screen, gesture and control must work and look designed on both: a board for each platform where they differ, and a visual check of both in the test Obsidian (phone view and a desktop window, light and dark) before a release. A feature checked on one platform only is not done.

## Documentation

`docs/plugin/` is the plugin's user documentation, in Russian: `README.md` is the core (what makes this task manager different and how a day goes with it), the inner pages hold the file format, the screen, the actions, calendars, settings, how an agent edits the tasks file, and what Max sets up by hand (Scriptable, Shortcuts, Google) and how to check it. Not the spec and not the design. To learn how the plugin behaves, read these pages, not the code. A change to behaviour a user sees or to anything set up by hand (steps, names, buttons, files) updates these pages in the same branch.

## Layers

`src/domain` (pure: the file, the tasks, the rules), `src/application` (`contracts.ts` is the API the UI talks to; services), `src/infrastructure` (vault, Google, the work file), `src/ui` (the view). `ui` imports `application` only, never `domain` internals or `infrastructure`. `src/settings.ts` and `src/application/contracts.ts` are shared contracts: change them only with the whole team, never in a side branch alone.

**The UI decides nothing.** The Swift frontends in `apple/` use the same core. Everything it would have to repeat lives in `application`: what is offered and what is disabled, what a tap writes, defaults, where a new task goes, what counts as the same, empty or overdue. The UI gets the decision ready (a field in `TaskItem.can`, a service method, a ready menu model) and only draws and turns gestures into minutes and places. The test: if the Swift version would have to write this line, it doesn't belong here.

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

## The Apple apps

`apple/` is an XcodeGen project (`project.yml`; the `.xcodeproj`, the Info.plists and the signing team `App/Config/Team.xcconfig` are not in git). `apple/Core` is a Swift package with the bridge to the core and what only Swift can do (files by bookmark, the repeat plan, the reminder sync); `swift test --package-path apple/Core` (`npm run test:apple`) runs its tests on the Mac against the committed `phone/task-calendar-phone.js`, and the release runs them too. Everything the app shows is English, controls are stock iOS 26. Simulator builds take Xcode 26.3 (`DEVELOPER_DIR=/Applications/Xcode-26.3.0.app/Contents/Developer`) and one of the two simulators from `~/.claude/CLAUDE.md`.

### Installing on the iPhone

`~/Applications/Install TaskCalendar.app` (Launchpad: «Install TaskCalendar») builds `origin/master` of this repository in Release (the project in `apple/`) and installs it on Max's iPhone over Wi-Fi or a cable, renewing the free 7-day signature. Max starts it with a click; Claude runs it whenever a build should reach the phone:

```bash
"$HOME/Applications/Install TaskCalendar.app/Contents/Resources/install.command"
```

Only what is on `origin/master` gets in: the installer warns about local commits that are not pushed and builds without them. So push master before running it.

### Reading the phone without opening the app

Opening Task Calendar runs a sync, which wipes the evidence of why reminders went wrong: read the phone from the Mac instead. The iPhone must be on a **cable** and unlocked (over Wi-Fi `devicectl` often reports it unavailable).

- The app's saved state (the latest sync): `xcrun devicectl device copy from --device <id from xcrun devicectl list devices> --domain-type appDataContainer --domain-identifier com.kudrmax.taskcalendar --source Library/Preferences/com.kudrmax.taskcalendar.plist --destination <scratch>/prefs.plist`, then `plutil -p`.
- The system log: `log collect --device-udid` needs root, so use `pymobiledevice3` from a venv in the scratchpad: `pymobiledevice3 syslog collect --start-time <epoch> <out>.logarchive`, then `log show <out>.logarchive --predicate …`.
- Shortcuts automations log in `siriactionsd` (`com.apple.shortcuts:Triggers`): `App.InFocus: BundleID: …, isStarting: …` names the app a trigger watches and says whether it fired. The intents log in the app's own process (`com.apple.appintents`: `SyncRemindersIntent.perform() finished`).
- 2026-11-06: reminders stopped updating because the «Update Reminders» automation watched Task Calendar itself instead of Obsidian closing; the log showed it in a minute.
