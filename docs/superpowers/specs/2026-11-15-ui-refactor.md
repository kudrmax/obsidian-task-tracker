# Plugin UI refactor: one state, one queue, motion by cause, layout in CSS

Issue: kudrmax/obsidian-task-tracker#41 (takes in #40). Branch `ui-refactor`.

Why: `obsidian/ui` (141 files, 17,914 lines, 106 classes) keeps breaking in layout, motion and ordering. The projects view went through four QA rounds, and each found more of the same kind; decisions 55–87 of `2026-11-12-projects-one-view-design.md` are almost all such patches. The causes are structural (the issue lists them with file:line):

- one fact lives in several places (fields, CSS classes, the core, the DOM);
- eight separate ordering mechanisms, and reads that bypass the write queue;
- every read redraws everything and guesses what changed;
- motion is derived from geometry (FLIP over every row) instead of the cause; there are six animation mechanisms;
- layout is computed from live measurements while animations run;
- the orchestrator (`CalendarScreen`, 1,688 lines) has no test.

This refactor rebuilds how the plugin's view layer is made so those classes of defect cannot happen by construction. **What Max sees does not change.** The core, the contracts, the door, the iPhone app and the design stay as they are.

## What stays the same (the bar)

- Every behaviour in `docs/plugin/` and every approved board: pixel for pixel, desktop and phone, light and dark.
- The guarded behaviours (`rules.swipeLanding`: one swipe, one place; Inbox and Soon split in half) and their tests.
- `core/`, `contracts.ts`, `settings.ts`, the door, `tests/architecture.test.ts` (only allowed packages grow by `preact`), `tests/uiDecides.test.ts`, `tests/styles.test.ts`, the tokens in `styles.css`.
- Obsidian's own parts (the view, the settings tab, `Menu`, `Modal`, `MarkdownRenderer`, `Scope`) are used through thin adapters, as today.

## Decision 1: Preact 11 with TSX

Checked on a prototype (`obsidian/ui/next`, `tests/ui/next/prototype.test.tsx`, commit on this branch):

- **Preact:**
  - TSX is type-checked by the project's own `tsc` (TypeScript 7), bundled by esbuild without a plugin, and tested by vitest with happy-dom.
  - `architecture.test.ts` and `uiDecides.test.ts` already read `.tsx`.
  - About 4 KB in the bundle.
  - The prototype passes `tsc --noEmit`, the production build and the whole suite (3,633 tests).
- **Svelte 5, rejected:**
  - `svelte-check` declares `typescript ^5 || ^6`. It runs a second, older TypeScript beside the project's 7, so `.svelte` files sit outside `tsc --noEmit`.
  - The guards would need a Svelte parser.
  - Its `animate:flip` moves by geometry, which is the very rule being replaced.
- **React:** the same model as Preact, about 10× the size, no gain.

No state library: the store below is ~50 lines and owned by the project. Components subscribe to it; no signals and no context soup.

## Architecture

```
gesture / Obsidian event / timer ──► action ──► reduce(state, action) ──► new state ──► Preact draws it
                                                      │
                                                      └─► effects ──► one queue ──► TaskService / DayService / … ──► result action
```

### 1. One screen state

`ScreenState` is one immutable object, the only place each fact lives:

- **The day and the clock:** the selected date, today, the day boundary.
- **The view:** the core's `FunnelView` and `ViewChoice` (place, mode, layout, filter, panel, subprojects), as last read. The mode, the place and the panel are never copied into fields or classes.
- **The lists:** what `DayData` reads today (day, soon, inbox, backlog, done, sections, offer, project tree, title drops, by project node, missing file), plus each list's `Cause` (below).
- **The events:** day events and their sources' status.
- **Interaction:**
  - selection, the card being named;
  - the open overlay (menu, full card, search, quick entry);
  - the carry and the swipe as gesture states (below);
  - the timeline zoom, as `hourPx`;
  - the scroll intent (`keep`, `reveal(id)`, `toHour(h)`). It is an instruction the list component carries out once, never a value read back from the DOM.
- **The stage size:** written by a `ResizeObserver` action.

CSS classes only reflect state (`class={mode}`); no code reads a class or a `dataset` to decide anything.

### 2. One queue of work

`reduce(state, action) → { state, effects }` is pure and unit-tested. Effects run in `Store`'s queue:

- **The file lane:** writes (`TaskService` calls), reads of the view and the lists, and view changes (`setFunnelPlace`, carry calls). It is strictly serial, so a read always sees every write queued before it. This replaces `act()`/`changing`, `turning`, `Picks.settled`, `afterEntry`, `drawnLanding`, the deferrals in `ScreenParts`, and the 41 direct `deps.tasks.*` calls.
- **The network lane:** the calendars' events. Latest wins, so it never holds up a write («a change to a task never waits for the calendars»).
- **Stale results:** every read carries the context it was asked for (date, filter, mode). The reducer drops a result whose context is no longer the state's. A read of another day can't land on this one.
- **Reads during a gesture:** a file read that arrives while a carry or a swipe is under way is kept in `pending`. It is applied the moment the gesture ends, in the same reduce. Nothing on the screen re-lays out under the finger.
- `Reload`'s coalescing (many vault events → one read) stays, as an effect.

### 3. Declarative drawing

- Every part becomes a Preact component of the state: the screen, the title and filter row, the wheel and the bottom capsule, the four mode layouts, `TaskList`, `TaskCard`, the timeline, the panel, the menus, the quick bar, the full card, search.
- Rows are matched by key (task id, section id). The 263 `el()` builders and the per-class DOM ownership go.
- `ModeLayout` stays as the boundary between modes: one layout component per `ViewChoice.layout`. A change of mode is a change of component, drawn in place.

### 4. Motion by cause

Each list's state carries why it last changed (`obsidian/ui/next/motion.ts`):

| Cause | Lists that slide | Example |
|---|---|---|
| `write` with the lists it touched | only those | the user moved, finished or added a task |
| `context` | none: drawn in place | another project, mode, day or filter; the first read |
| `still` | none | a read from outside (Sync, an agent edit) |

- **The one list motion:** `KeyedList` reads positions once before and once after a drawing, and only in lists the cause lets slide. Rows enter and leave with the same rule.
- **The one carry motion:** while a carry is under way, the carried card follows the pointer. No other row's height or place changes until the drop.
- **CSS transitions:** only for hover, press and colour, never for a property that layout or another animation also drives.
- **What goes:** the FLIP over all rows, the `is-redrawn` reflow trick, height transitions with `transitionDelay`, the re-fit timers, and the WAAPI calls outside these two places.

### 5. Layout in CSS

- **Columns and rows:** CSS Grid. Widths and heights come from the core's rules (`layoutWidths`, `layoutShareAt`, `stackedLists`) as CSS custom properties set from state.
- **The ribbon:** one track translated by `place × column width`. The swipe drives that offset through its state machine, and landing uses `rules.swipeLanding`.
- **Measurements:** only `ResizeObserver` (stage and content sizes → actions). Drop targets are snapshotted once when a carry lifts, never during motion. No `getBoundingClientRect` in a render path.

### 6. Gestures as state machines

- **Carry:** `idle → pressed → lifted(snapshot of targets) → over(target) → dropping → idle`, or `cancelled`. It is the core's carry session (`startCarry`, `carryAt`, `carryOnNode`, `endCarry`) driven from these states.
- **Swipe:** `idle → tracking → settling(landing) → idle`.
- **Pinch zoom** and **edge hold** are machines too.
- `GestureArbiter`'s one-holder rule becomes the rule that at most one machine is active. Each is a pure reducer with its own tests.

### 7. Rules made checkable

A new `tests/uiRules.test.ts` guards the new layer:

- **No timers or frames:** no `setTimeout` or `requestAnimationFrame` outside the effect runner and the gesture input adapter.
- **No measuring in drawing:** no `getBoundingClientRect`, `offset*` or `client*` outside `KeyedList`, the carry snapshot and the `ResizeObserver` adapter.
- **No animation outside the two motions:** no `.animate(` outside `KeyedList` and the carried card.
- **No state in the DOM:** no `classList` or `dataset` writes, since classes come from JSX.
- **Calls through the queue:** no `TaskService` call outside the effect runner.

## Migration: in steps, the plugin working after each

The new layer grows inside the old screen and takes it over part by part (strangler). Each step ends green and is checked in the test Obsidian on desktop and phone, light and dark, on a copy of Max's real tasks file.

| Step | What moves | What it replaces |
|---|---|---|
| 0 | `Store`, the effect runner over the services, mounting Preact inside `TaskCalendarView` | — |
| 1 | `ScreenState` + reducer + queue under the existing drawing: `CalendarScreen` dispatches actions and draws from the state | `act`, `turning`, `Picks.settled`, `afterEntry`, `drawnLanding`, `DayData`'s `JSON.stringify` diff, the duplicated mode, panel and place fields |
| 2 | `TaskList`, `TaskCard`, section headers as components with `KeyedList` | `KeyedRows`, the FLIP, `EntryRows`, `is-redrawn` |
| 3 | The four mode layouts and the ribbon on CSS Grid | `RibbonLayout`, `ColumnsLayout`, `RowsLayout`, `ByProjectLayout` measuring, `BlockHeight`, absolute positioning |
| 4 | Carry, swipe, pinch as machines | `DragController`, `DragSession`, `ListDrop` live hit tests, `Swipe`, `ScreenPager` |
| 5 | Quick entry, menus, full card, search, timeline | `QuickEntryController`, `WriteQueue`, `TaskMenu`/`MenuPanel` DOM, `FullScreen`, `Timeline` |
| 6 | Delete what was replaced | `CalendarScreen` as the hub, the old classes and CSS state classes |

## Tests

- **The reducer and the queue (unit):**
  - every race in decisions 55–87 becomes a test, e.g. delete → switch project (77), a menu item while the menu closes (81), carry → cancel → switch mode;
  - a read of a stale context is dropped;
  - a read during a carry is applied at the drop.
- **Components (happy-dom):** what each draws for a state, and motion by cause, as in the prototype.
- **Gestures (unit):** each machine's transitions.
- **End to end:**
  - A CDP harness in `scripts/e2e/` against the test Obsidian (port 9333, scratch vault, a copy of the real file).
  - It runs a matrix of modes × gestures × transitions on desktop and phone.
  - Moving states are captured frame by frame and checked for row jumps, flying cards and gaps.
  - Run before every step's merge.

## Done when

- **Impossible by construction:**
  - reading the file before an earlier write finishes;
  - moving a card no write touched;
  - animating a change of context;
  - a row's height changing during a carry;
  - one fact in two places.

  `uiRules.test.ts` and the reducer tests guard each of these.
- `CalendarScreen` is gone as the hub: state, effects and view are separate and each is tested.
- The e2e matrix passes on desktop and phone, light and dark. An independent QA pass on a copy of Max's real file finds no defect.
- `docs/plugin/` is unchanged, since behaviour is unchanged. Anything that changed by accident is a defect.

## How it is built

- Only `obsidian/` and `tests/` change, so one `frontend-obsidian` agent at a time, step by step, in this branch. The lead checks each step's diff, tests and screens before the next.
- No `backend` or `frontend-swift` work. A rule found missing from the core goes to Max first as a contract change.
- One fresh QA agent after steps 3, 4 and 6, told to break it.
- Steps merge into master one by one (each step is a release), so Max uses the new layer as it grows and a regression shows early.
