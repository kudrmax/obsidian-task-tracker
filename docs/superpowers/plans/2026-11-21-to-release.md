# The engine to production (lead's plan, 2026-11-21)

Max, 2026-11-21: «результат: все на проде. Чистый код, подключен новый фронт, стандартные решения, стандартные паттерны… готов релиз и все перенесено в плагин. Без вопросов». Every step below is approved in advance; the lead decides product gaps itself, records each in the spec's «Decisions» with its reason, and does not stop to ask. Max is told only the result.

Spec: [`../specs/2026-11-18-ui-engine.md`](../specs/2026-11-18-ui-engine.md) (Principles 1–9, the owners table, «How the owners are kept one», «How a feature is checked», Part 2). Scope: the feature list [`../specs/2026-11-16-ui-standard-stack-features.md`](../specs/2026-11-16-ui-standard-stack-features.md) (F1–F310 and «Added from master»). History: [`../specs/ui-standard-stack/stage0.md`](../specs/ui-standard-stack/stage0.md), [`2026-11-19-engine-now.md`](2026-11-19-engine-now.md).

## The rules every step keeps

The spec's principles, in short — every agent brief links them, every review checks them first:

1. One screen, one state, one direction: one React tree over one Zustand store; the page is an output.
2. One owner per concern (the owners table); a second path is a defect.
3. Motion follows the change of place, not its cause; a context change draws in place.
4. Sizes are the browser's; no hand measuring or moving.
5. What the finger holds stays still under it.
6. The UI decides nothing: the port/core decides, the screen draws.
7. Everything alive has an owner and ends with it.
8. Performance is the architecture: no task over 16 ms with ~300 tasks; lift under 33 ms.
9. Standard, never invented: a library's feature or documented pattern; own code is named glue.

Plus the project's: clean code (OOP where it fits, small classes, no comments that the code can say), layers and guards untouched (`architecture`, `uiDecides`, `styles` tests never loosened), tokens only, both platforms and both themes checked by looking, small green commits without AI attribution, a flaky or failing test is a blocker, delete only with `trash`, never `~/Obsidian` or Max's stand except a files-only deploy.

## Steps

One integration branch, `ui-engine`, cut from `ui-trackpad` once step 0 lands; every later branch is cut from it and merged back after its checks. A step starts when the one before is merged.

| # | Step | Done when |
|---|---|---|
| 0 | **Day turn past the calendar**: Max's quick switch kept, no dimming while held, list and calendar at rest on one frame | on Max's stand; auto-approved by Max |
| 1 | **The whole screen gets the accepted swipe**: step 7's follow pager and day turn (trackpad module, axis lock, landing) become the one ribbon of `TaskScreen` on every stop; stage 0's pager deleted | the old pager gone from the code; e9 scenarios on the whole screen |
| 2 | **Part 1's leftovers on the owners**: E2 — the divider, cards entering / leaving / returning (Undo), a context change drawn in place (redone in slices from `ui-ribbon`'s pieces, not merged whole); E4 — Obsidian's commands off while the field is open (F194), «New project…» in the project choice | scenarios and frame checks green; stand updated |
| 3 | **Independent review of part 1** (`reviewer`): a second path for any concern, the UI deciding, invented solutions, dead code; its findings fixed in the owners | review clean |
| 4 | **Part 2.1–2.2: merge `origin/master`, audit the core** against the engine: each `core/application` module kept behind the port / replaced by the engine / dead; modules the iPhone app uses stay | audit table in the spec; nothing the app uses removed |
| 5 | **Part 2.3: `CorePort`** in `obsidian/`, the port over the core's services; where the core has a rule it wins; a case without a rule is decided by the lead and goes to `backend` (`contracts.ts` additive) | `CorePort` passes the same port tests as `MockPort` |
| 6 | **Part 2.4: the plugin mounts the engine** in its leaf, the note block and pop-outs over `CorePort`; the old UI goes to the trash; the trackpad module ships in the plugin's `main.js` | the plugin runs on the engine with a real tasks file; old UI deleted |
| 7 | **Part 2.5: the rest of the feature list** on the owners, in batches, each with its scenarios: view modes; selection and bulk actions; search and Done; projects panel, tree, filter, By project; full-screen task; repeat panel; bottom row, «⋯», assistant; Undo and notices; calendar sources; note block details; keyboard commands; phone-only and desktop-only items; the file, Sync, notices (F6–F8, F109, F266, F270, F272, F273); settings rows on the one drag owner (F300) | every F-item green on both platforms, both themes |
| 8 | **Part 2.6: `docs/plugin/`** follows every change (screen, actions, notes, swipes, menu) | docs match the build |
| 9 | **Acceptance**: the spec's list; performance budget measured on ~300 tasks; QA as Max uses it on a copy of his real tasks file, every gesture and transition, phone view and desktop, light and dark; a final `reviewer` pass | all green, no known defect |
| 10 | **Release**: merge `origin/master` into the branch, tests there; main clone `git pull --ff-only`, `git merge --no-ff ui-engine`, `git push origin master`; `npm run release`; BRAT update in `~/Obsidian`; version and `main.js` mark checked; Sync uploaded the plugin's files | Max's Obsidian runs the new version |
| 11 | **The iPhone app**: keeps its design (spec: carried later as a task of its own); now only `npm run test:apple` green and the known bug fixed — rename wiping projects, by calling the core's `toggleProject`; installer run after the merge | app on Max's phone from the new master |

## Out of scope, by Max

- Tasks covering event titles on the calendar: parked (2026-11-21).
- The frame audit's jank items: dropped — Max sees none (2026-11-21).
- Double click: removed for now, Max decides later.
