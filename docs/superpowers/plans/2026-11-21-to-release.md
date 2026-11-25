# The engine to production (lead's plan, 2026-11-21, revision 2)

Max, 2026-11-21: «результат: все на проде. Чистый код, подключен новый фронт, стандартные решения, стандартные паттерны… готов релиз и все перенесено в плагин. Без вопросов». Every step below is approved in advance. The lead decides product gaps itself and records each in the spec's «Decisions» with its reason. The spec's «Max sees the audit» (Part 2.2), «a product question for Max» (2.3), «re-checked with Max» (2.7) and «Max has tried each engine step» (Acceptance) are replaced by this go-ahead — recorded as a Decision in step 0. One exception stays, because nothing can do it but Max's hands: the check on the real iPhone before the release (step 10).

Revision 2 takes in three independent reviews of revision 1 (architecture, completeness, risk and process).

Spec: [`../specs/2026-11-18-ui-engine.md`](../specs/2026-11-18-ui-engine.md) (Principles 1–9, the owners table, «How the owners are kept one», «How a feature is checked», Part 2). Scope: [`../specs/2026-11-16-ui-standard-stack-features.md`](../specs/2026-11-16-ui-standard-stack-features.md) (F1–F314 and what master added since). History: [`../specs/ui-standard-stack/stage0.md`](../specs/ui-standard-stack/stage0.md), [`2026-11-19-engine-now.md`](2026-11-19-engine-now.md).

## The rules every step keeps

The spec's principles, in short — every brief links them, every review checks them first:

1. One screen, one state, one direction: one React tree over one Zustand store; the page is an output.
2. One owner per concern; a second path is a defect.
3. Motion follows the change of place, not its cause; a context change draws in place.
4. Sizes are the browser's; no hand measuring or moving.
5. What the finger holds stays still under it.
6. The UI decides nothing: the core decides, the screen draws.
7. Everything alive has an owner and ends with it.
8. Performance is the architecture: no task over 16 ms with ~300 tasks; lift under 33 ms.
9. Standard, never invented: a library's feature or documented pattern; own code is named glue. The one named exception is the macOS trackpad module (Decision 126).

And the project's:

- **The core is one code.** A rule the iPhone app or the agents' program also uses lives in the core, once. The engine imports nothing from the core; it gets such a rule through the port.
- **Frozen, accepted by Max:** the follow pager and its trackpad path (Decisions 64, 126), `LANDING`, the day turn (127), every row marked accepted in `2026-11-19-engine-now.md`. A review or QA finding against them is reported, not fixed.
- **Behaviours Max asked for twice** (`CLAUDE.md`, plus Decision 121's drop flight) keep their tests' assertions; such a test may move onto new code with its assertions unchanged, never be loosened or deleted.
- **Max's data:** nothing touches `~/Obsidian` before step 10. Every check with a real file uses a copy of his tasks file in a scratch vault. The file's format does not change in this run (the iPhone app and the phone's old plugin write the same file until they update).
- Guards never loosened (`architecture`, `uiDecides`, `styles`); clean code (small classes, no dead code, no comments the code can say); tokens only; both platforms and both themes checked by looking; small green commits without AI attribution; a flaky or failing test is a blocker; delete only with `trash`; `docs/plugin/` and `docs/design/` follow each change in the same branch.

## How each batch runs

Max, 2026-11-23: «уменьшим количество бесполезных проверок… я имел в виду лишнее РУЧНОЕ тестирование. Сами тесты пусть запускает когда хочет». So: automated tests (unit, e2e, Max's recordings) run as often as useful; checking by hand in the test Obsidian only where something visible changed, once per batch, the changed screens only; the full by-eye pass on both platforms and themes is step 9's acceptance.

A batch is one row of a step, at most ~10 F-items. It starts from the integration branch with `origin/master` merged. It ends with: a «F → scenario → status» table in the spec; every e2e scenario and every recording of Max's run again; a `reviewer` pass whose first question is «a second path?», plus jscpd; the docs updated; merged back.

## Steps

The integration branch is `ui-engine`, cut from `ui-trackpad` in step 0. A long branch is a deliberate exception to «a branch from fresh master»: master is merged into it at the start of every step.

| # | Step | Done when |
|---|---|---|
| −1 | **Tools checked** before autonomy: a test Obsidian with CDP; Max's recordings replay; `gh auth`; the `obsidian` CLI reaches `~/Obsidian` (Advanced URI as fallback); `npm run test:apple`; a simulator via `ios-sim take`/`release`; the iPhone installer reaches the phone | each works or is named as a blocker |
| 0 | **Day turn** finished (in work). `ui-engine` cut, `origin/master` merged (the `agent/` program, `columnView` everywhere). `CLAUDE.md` and the agent definitions describe the engine, the stand, `native/trackpad/`. Decision: Max's go-ahead replaces the spec's Max checkpoints | merged, all tests green |
| 1 | **One ribbon.** Step 7's follow pager and day turn become the one ribbon of `TaskScreen` on every stop. To the trash: `Ribbon.tsx` (except `RibbonTrack`), `wheelStrokes.ts` and its test, `store.step`/`turnDay`/`dayWay`, the day path of `Slide`, the stand's places in `Place`. `WheelFollow` stays as the named fallback without the module, with its own scenarios. Max's «one swipe, one place» and «Inbox and Soon split in half» tests move onto `FollowPager` with their assertions unchanged. The owners table and the «trackpad pager frozen» paragraph are rewritten. The guards are narrowed back to owner files (Motion and `animate(` in `gestures/`) | no second pager; Max's tests green on the live code |
| 2 | **Part 1's leftovers**, each a batch: the divider; cards entering, leaving, returning (Undo); a context change drawn in place — redone in slices from `ui-ribbon`'s pieces, never merged whole. E4: F194 (Obsidian's commands off while the field is open), «New project…», F131 (the panel's page change: a new owners-table row only if no owner fits) | scenarios and frames green |
| 3 | **Review of part 1** (`reviewer` + jscpd): second paths, the UI deciding, invented solutions, dead code | findings fixed in the owners |
| 4 | **Audit the core.** Each `core/application` module: kept behind the port / replaced by the engine / dead; whether the iPhone app (`PhoneCalls`, the door) or the `agent/` program uses it; and whether the engine holds its own copy of a rule the app uses (`swipeLanding` and `SWIPE_FLICK_SPEED`, `stackTasks`/`eventLeft`, `snapMinute`…). Each copy gets a decision: the pure rule stays in the core and reaches the engine through the port. The feature list gains what master added since 0.4.215 | audit in the spec; every copy has its source of truth |
| 5 | **The port, the real way.** Port tests split into the `ScreenPort` contract (shape, subscription, preview equals the move's result, async writes at 0/30/300 ms) and the stand's rules. `CorePort` lives in its own layer (`obsidian/adapters/`, its own `architecture.test.ts` row: may import `contracts.ts` and `engine/port.ts`, decides nothing). Lists come from the core's `columnView`; `sameAsScreen` checks what `CorePort` gives. `uiDecides` learns the engine's port fields. Where the core and `MockPort` differ, the core wins and the stand's test is rewritten. A gap gets an additive contract from `backend`. Device settings are read from the existing keys (list width, mode, zoom, note block mode, Subprojects, tree width) | `CorePort` passes the contract; a copy of Max's tasks file read and written back is byte-identical |
| 6 | **The plugin runs the engine.** First an inventory of every file of `obsidian/ui` outside `engine/`: kept (settings, assistant, sources, colours, Reload…, moved into a named shared place), replaced, deleted. The host is assembled once in one module (trackpad fingers and their dispose, haptics, zoom, markdown, platform), used by the plugin and the stand. The plugin's leaf, note block and pop-outs mount `TaskScreen` over `CorePort`; the old screen goes to the trash; `ENGINE_MAY_ALSO` shrinks. `MockPort` goes to the trash; the stand runs on `CorePort` over an in-memory tasks file. The trackpad module ships in `main.js`: written outside the vault (Obsidian's `userData`), old builds cleaned, a new build after a BRAT update takes over the running hook (versioned mark, shared listener) or the fallback runs and says so, a crash guard (a «loading» mark — a module that never finished loading is skipped next start) and a setting to turn it off, detach on unload and on window close. Every part 1 scenario runs again unchanged on the plugin with the fixture tasks file | the plugin on the engine with the copy of Max's file; old UI deleted |
| 6b | **Dead core code.** Modules the audit marked replaced or dead and that neither the app nor `agent/` uses — to the trash; knip finds no unused export in `core/application`; `core/task-calendar-phone.js` and `agent/obsidian-task-calendar.mjs` rebuilt; the guarded `swipeLanding` stays | no dead code; app and agent tests green |
| 7 | **The rest of the feature list,** batches as above: opening and hosts (F1–F4, F9); view modes; day navigation (F41–F50: arrows, title tap, back to today); lists, sections and empty states (F55–F67); subtasks, folding, First step (F195–F201, F79, F198); the menu's part 2 pages (Section, Project, First step, Open in Obsidian/Calendar, Pick a date with places, Notes from the menu); selection and bulk; search and Done; projects panel, tree, filter, By project; full-screen task; repeat panel; bottom row, «⋯», assistant; Undo and notices; calendar sources; note block details; keyboard commands; phone-only and desktop-only items; motion (F295–F299); the file, Sync, notices (F6–F8, F109, F266, F270, F272, F273); settings rows on the one drag owner (F300); F311–F314 and master's additions. Rebuilt on the engine from step 6's trash (Decision 141): the assistant's answers (`AnswerPopup`, `AssistantAnswers`, ⌘Enter on the field's scope) and the calendar sources window (`SourcesPopover`, `labelMark`), Open in Calendar over the kept `AppleCalendar`. **Docs ahead of the build** (step 6 left these pages describing what step 7 brings back; each is checked against the build when its batch lands): `docs/plugin/screen.md` — «⋯» with Search, Select tasks and Best task, the wheel («Колёсико»), Backlog under Inbox, the Done column, view modes and the view button, the day arrows and the title's tap, the projects panel and filter, the project block's modes; `docs/plugin/tasks.md` — Search and ⌘F, Select tasks and bulk, the full-screen task, Repeat, Section, First step, Reminder, the menu's Open in Obsidian/Calendar, ⌘Z/⌘F inside a note's block; `docs/plugin/calendars.md` — the sources window; `docs/plugin/assistant.md` — Best task's answer | every F-item green on both platforms, both themes |
| 8 | **Docs**: `docs/plugin/` (Notes instead of Description, no double click, the menu, swipes, the day turn), `docs/design/` (README and boards for every change Max took), the agents' skill and `docs/plugin/agents.md`, `CLAUDE.md`'s list of behaviours asked for twice (+ the drop flight) | docs match the build |
| 9 | **Acceptance on the Mac**: the spec's list; performance on ~300 tasks; QA as Max uses it on the copy of his file, every gesture and transition, phone view and desktop, light and dark; an hour of ordinary work with the trackpad module (notes, Canvas, pop-out); the fallback path with the module off; final `reviewer` | all green, no known defect except frozen items' reports |
| 10 | **Release.** `npm run test:apple` green and the iPhone fix (rename wipes projects → the core's `toggleProject`) merged first. **Gate: one check on the real iPhone by Max** — the branch's build in a test vault on his phone (prepared by the lead), long-press drag without the text menu, swipes, the menu, ~300 tasks; until then the release waits and the report's first line says so. Before releasing: the vault's git commit and 0.4.217 recorded as the last good state; the rollback is a revert released with a higher version, the tasks file from the vault's git. Then: master merged into the branch, tests; main clone `git pull --ff-only`, `git merge --no-ff ui-engine`, `git push origin master`; `npm run release` with a version above 0.4.217; BRAT update in `~/Obsidian` (CLI first; Advanced URI only with one Obsidian running); version, `main.js` mark, the trackpad module loaded (or its fallback) checked; the tasks file's diff against the vault's git empty; Sync uploaded the plugin's files; the iPhone installer run from the new master | Max's Obsidian and phone run the new version |
| 11 | **Closing**: issue #41 closed with the merge commit; issues opened for what is deferred (double click; the iPhone app's design and the 13 «For the Swift frontend» decisions; tasks over event titles); worktrees of the merged branches stopped, trashed, pruned (stage 0's branches stay until Max says) | nothing left open without an issue |

## Out of scope, by Max

- Tasks covering event titles on the calendar: parked (2026-11-21).
- The frame audit's jank items: dropped — Max sees none (2026-11-21).
- Double click: removed for now, Max decides later.
- The iPhone app's new design: a task of its own after this release.

## Paused by Max (2026-11-23, 23:00)

Steps 0–6 merged in `ui-engine` (602b64cb; full run green: 3313 unit, 327 Swift, 398 e2e). Step 7's first wave committed and pushed, NOT merged, NOT reviewed, no full e2e yet:

| Branch | Head | What |
|---|---|---|
| `ui-engine-7a` | f0c2772e | day arrows and title tap (F41–F48, F50), view modes and the view button, Subprojects, hosts F1–F4/F9; Decisions 146–149; has 7b merged in |
| `ui-engine-7b` | 5e67ec40 | Backlog, section header menu and drag, folding, F79/F198, First step, the wheel, edge fades; Decisions 150–153 |
| `ui-engine-7c` | 1d598439 | menu pages Repeat/Section/Open in Obsidian & Calendar, full-screen task, First step (duplicate); Decisions 154–157 |
| `ui-engine-7d` | db1282d4 | «⋯», search ⌘F, Done, Select tasks and bulk, stack drag, assistant answers; Decisions 158–161; FollowPager got a `first` field |

To resume: keep 7B's First step (stateless port) and remove 7C's (firstStepOn/firstStep in port and CorePort, startFirstStep/endFirstStep, Card stepField, view/FirstStep.tsx, firstStep.test.ts, e27's «first step» case); teach the wheel the Done stop (F257); bulk Repeat/Section via actAll; a blank card-high row above the first card (7A saw it, likely 7B's hidden section header); the core shows notes in the full screen's «⋯» copy (design: none). Then one reviewer pass per batch, merge in order 7b → 7a → 7c → 7d with a full run at each merge. Then the next wave: projects panel/tree/filter/By project, calendar sources window (+F32), note block details, keyboard commands, phone/desktop-only, motion, file/Sync/notices, settings rows (F300), F311–F314, Rows F18–F21.
