# Plugin UI refactor: a model, a timeline, drivers

Issue: kudrmax/obsidian-task-tracker#41 (takes in #40). Branch `ui-refactor`. Revision 6.

## How this spec is made

Revisions 1–3 were written top-down, and every review found new holes: the spec never started from what the plugin actually is. Since revision 4 it starts from a complete inventory of the current UI, made by reading every file:

- [`ui-refactor/inventory-state-effects.md`](ui-refactor/inventory-state-effects.md):
  - 565 state locations; 45 facts held in more than one place;
  - 819 effect call sites, 417 ordered by nothing;
  - 180 event sources.
- [`ui-refactor/inventory-behaviour.md`](ui-refactor/inventory-behaviour.md): 203 inputs, 84 motions, 84 measurements, 52 screen states.

[`ui-refactor/traceability.md`](ui-refactor/traceability.md) maps all 2,032 rows to the mechanism that owns each. A row that does not fit is a defect of a principle, not of the row. Each revision is checked two ways:
- the traceability is rerun from scratch;
- a fresh architect who has not seen earlier revisions judges the root.

| Revision | Rows left over | Classes left over | Faults at the root |
|---|---|---|---|
| 4 | 688 | 23 | 7 |
| 5 | 219 | 7 | 3 |
| 6 | the classes R1–R7 and the three faults at the root, each corrected in a principle; §Resolution shows where | | |

## The root cause

**The UI has no model.** Truth lives in the DOM and in work in flight.

| What should be in the model | Where it is today | Defects |
|---|---|---|
| **Facts:** what the screen shows | Fields, CSS classes, `dataset`, inline styles, the DOM. The shown day sits in 9 places, the strip's place in 11, an open field in 12. | Parts disagree (D58, D55) |
| **Time:** what happens in what order | Eight promise chains and flags; 417 calls under none | Races (D75, D77, D81) |
| **Consistency:** which data a frame is drawn from | Each read applied as it lands; a frame can mix a new title with old lists, or a read from before a write with one from after | A frame from two generations (D55, D56, D65, D84, D85) |
| **Identity:** which row is which across create, rename and undo | A typed field, its waiting text and its card are three nodes | A row remounts, the keyboard drops, a line flies in from a corner (D86, 5cca0ad9) |
| **Geometry:** sizes and places | Read from the live DOM when needed (84 places), often mid-animation | Gaps, jumps, measuring a ghost (A4, D60, D67, D76) |
| **Motion:** what moves and why | Inferred by diffing geometry over every row, or by CSS transitions on state classes | Cards flying on a context change (A3), rows jumping on lift (A5), D61 |
| **Interaction:** what the user is in the middle of | Each gesture's own flags, an arbiter, redraws deferred by hand | A redraw under the finger, debris after a drag (D66) |
| **Host:** Obsidian's and iOS's CSS and chrome | Unscoped rules meet Obsidian's and iPadOS's own | iPad button padding (f623d869), Live Preview stretching the block (D80), toolbar and keyboard |

Out of scope, and kept so: where a task lands, what a drop means and what a menu offers. These are rules, and they live in the core (`application`).

## Principles

Every principle has a mechanism and a guard (§Guards).

**P1. One model.**
- What the screen shows is a pure function of the model: `view(model)`.
- A fact has one field; a derived fact is a selector.
- The DOM, classes and styles are outputs, never read back as truth.
- The core's answers (`FunnelView`, `ViewChoice`, its sessions) are held as the core gives them.
- **Identity is model state.** A row's key is given when the user's message makes the row, a typed line included. When the create returns, `CreatedTask` binds that key to the task's id (`rowKey(taskId)`), so the same row lives on from field to waiting text to card.
- The one exception is **typed text**: while a field has focus, the field owns its text (CodeMirror, an `<input>`). The model receives edits and never writes back into a focused field.

**P2. One timeline.**
- The model changes only by messages, one at a time, in arrival order: `update(model, msg) → [model, commands]`.
- Everything outside the model is a command, and its outcome is a message: core services, the vault, Obsidian, timers, the network.
- **A user's event is handled to the end inside that event:** update, render, then the drivers, with focus last. Messages from other sources are batched once per microtask. This is what lets the iPhone keyboard rise on a typing pick.
- **Every wait has a bound.** A command that waits has a timeout, and the timeout is a message.

**P3. Every frame is one consistent snapshot of the file and its pending writes.**
- **The file sequence:** file work is one plugin-wide numbered sequence, shared by the leaf, every note block and the settings tab. A write takes its number when the user's message is processed, so writes run in the order Max acted.
- **Read-back:** after every write the runtime reads the file back itself. Every read carries the number of the last write before it.
- **A pending write is an intent:** the core call with its arguments. Tasks are named by id and places by anchor (after task K, at the end of a list), never by index.
- **What a screen draws** is the core's answer for the last read with every pending intent applied, by the core itself:

  ```
  shown = previewCore.view(context, after: lastRead + pendingIntents)
  ```

  - `previewCore` is the same core code (`composeCore`) over in-memory twins of the stores it writes: the tasks file and the projects-screen store, seeded from the last read.
  - The UI computes no outcome of its own.
  - Intents the twins cannot run are not previewed; they appear on their read-back. These are undo, settings writes and project-note writes.
- **Retiring a write:**
  - A read numbered at or above a write retires it.
  - A failed write drops its intent, and the rest are applied again. A later intent that depended on it then fails visibly, with a notice and a reverse transition, never silently.
- **A context change is a transaction:** another filter, mode, day or place. The model keeps it pending until every read of the new context has landed, then switches in one message.
  - **Timeout:** past its bound it stays on the old context and shows a notice.
  - **A second change** while one is pending queues behind it, in order.
- **Neighbours are read ahead.** The places and days next to the shown one in the ribbon are kept read, so a swipe, arrow or wheel turn never waits on a transaction: the incoming context is already there. This replaces the peek.
- **The clock is data.** The shown place is model state. When the shown place is the relative Today, midnight is a context change; it waits only for an active swipe to end.

**P4. Geometry is input.**
- **Sizes from the browser:** what only the browser knows enters the model as a message from an observer, and is never held back: text and card heights, the stage, the keyboard, Obsidian's toolbar, scroll positions where something depends on them.
- **Everything else is computed** from the model and the core's rules: widths, shares, stacked heights, the ribbon per place, drop places.
- **A frame has three phases, all before the paint:**
  1. render the end state;
  2. `measure` reads what changed;
  3. `motion` animates from the declared start to the measured end.
- **Leaving rows:** layout selectors skip rows that are leaving. A leaving row's fold and the heights that depend on it are one transition, so Rows shrinks in one step (D76). A key that comes back mid-fold revives its entry, never a second row.
- No other code reads geometry, ever.

**P5. Motion follows the change, and a context change moves as a whole.**
- **Within one context:** a row moves only when its keyed position changed between two models (added, moved, removed, Undo), whether the change came from Max or from the file.
- **Across contexts:** no row moves on its own. A context change either draws in place, or declares **one whole-region transition between two complete snapshots** (the day slide, the ribbon to the next place), as `screen.md` says for each. Another project, mode or filter draws in place; a day or place change slides as a whole.
- **Interactions declare their motions as transitions:** the carried card following the pointer, folds under a lift, room at a list's end, the drop and cancel flights, the panel slide, the divider snap, the keyboard ride. Each transition is numbered and runs once.
- **Everything else** (a re-render, a measurement, a resize) is applied in place.
- **Drivers report** `motionSettled(id)` or `motionInterrupted(id, at)`. A closing overlay stays in the model until its motion settles.
- **Continuous gestures** (divider, ribbon scrub, pinch, carry) go through a **transient channel**. The input driver passes the live value to `motion`, which lays out with the same pure selectors over the model plus that value, so there is no second layout engine. Crossing a step that changes what is drawn (a pinch zoom level, a divider snap) dispatches.

**P6. Interactions are layers; they pin what they hold and never freeze data.**
- **The stack:** the interaction state is a stack of modal layers (screen → select mode → full card → field → menu or sheet), plus at most one pointer gesture. It is a statechart.
  - Hand-offs are transitions: hold → drag; long press → pinch on a second finger; one sheet to the next.
  - Escape and tap order are reads of the stack. The arbitration rules A16 are its table.
- **Data applies at once:** reads, the minute tick, settings.
- **Pins:** each layer and gesture declares the entities it holds. A change to a pinned entity is a message to that layer, which decides:
  - a carried card deleted by Sync fades and the carry ends;
  - a menu's task deleted closes the menu;
  - a field whose task was deleted keeps its text until commit, which then fails with today's notice;
  - "deleted" means gone from the file, not merely hidden by a new context.
- **The pointer gesture pins a layout snapshot in the model:** its lists, drop places and anchors as they stood when it began.
  - While it is active, the view draws that snapshot, so the view is still `view(model)`.
  - When it ends, the move to the current layout is an ordinary keyed transition.
  - A drop resolves against model anchors, never against drawn positions.

**P7. Imperative code only at the edges.**
- `update`, selectors and `view` are pure.
- **Drivers** own the DOM work that is not declarative: each owns one kind of side effect, takes orders from the model and reports with messages.
- **The effect runner** owns services and the preview core.
- **Pure core queries** that every draw or pointer move needs (`snap`, `menu`, `listName`, `relation`, `isPast`…) come through a `CoreQueries` port, with the clock taken from the model. They are allowed in selectors.
- **The core's sessions** (`QuickEntrySession`, `SectionNameEntry`, `RepeatPage`, `DescriptionDraft`, the carry) are the machines themselves. The runtime holds them, a command calls them, and the model holds their latest snapshot. They are never re-implemented.
- **Host CSS is scoped:**
  - every rule sits under `.task-calendar`;
  - a scoped reset neutralises Obsidian's and iPadOS's control styles;
  - body classes are written only by `chrome`.

## Architecture

```
obsidian/ui/next/
  model/       Model, Msg (one union), selectors, CoreQueries port        pure
  update/      update(model, msg) → [model, Cmd[]]; layers; gestures      pure
  recognizers/ pointer, touch and wheel streams → gesture messages        pure
  effects/     the effect runner, the file sequence, pending intents,
               the preview core, the network lane, the core sessions      services
  view/        Preact components                                           pure
  drivers/     motion, measure, scroll, focus, input, keys, chrome,
               islands, overlay host                                       DOM
  host/        the plugin runtime (main.ts), the leaf, note-block and
               settings-tab hosts
```

**Preact 11, TSX.**
- TSX is checked by the project's own TypeScript 7 and bundled by esbuild without a plugin. Tests run in vitest with happy-dom, and the guards already read `.tsx`.
- Svelte is rejected: `svelte-check` requires TypeScript ≤6, and its `animate:flip` infers motion from geometry.
- **Rendering:** a user's event renders synchronously (Preact's `options.debounceRendering` is flushed by the runtime). Other messages render once per microtask.

**The plugin runtime** (in `main.ts`, one per plugin):
- **File work:** the file sequence, the pending intents, the preview core, the read-back.
- **The settings and device stores:**
  - their own change events are ignored while our writes to them are in flight;
  - one read follows when the last write settles, since `data.json` carries no number.
- **The network lane:** calendar events, latest wins per day. A superseded fetch is abandoned, not aborted, so no contract changes. The `Http` port is stubbed in the test build.
- **What every screen shares:** `chrome` (body classes, the keyboard inset) and the overlay host. From slice 1 the old screen uses them too, so old and new never fight over the window.
- **Every screen's store:** dispatch is FIFO and never nested. Subscribers are notified through selectors with an equality check. Rows are `memo` with stable props.
- **Action log:** a ring buffer of the last 200 messages, dumped on any failure and attached to QA reports. A race found once is replayed as a test.

**Drivers.**

| Driver | Owns | From the model | Reports |
|---|---|---|---|
| `motion` | WAAPI animations; every inline style and CSS variable from the model; reading the boxes it animates, in the commit phase only; the target window's frames | transitions; layout variables; live values from the transient channel | `motionSettled`, `motionInterrupted` |
| `measure` | `ResizeObserver` (the target window's); text fits; scroll positions where needed | which boxes | `measured`, `scrolled` (quantised), `scrollSettled` |
| `scroll` | every programmatic scroll; anchoring while rows fold; `ScrollHold` | scroll orders: `reveal`, `toHour`, `keep`, `edge`, `open` | `userScrolled` (ownership passes to the user) |
| `focus` | focus with `preventScroll`; CodeMirror focus; within the user's event | the field to focus | `focused`, `blurred` |
| `input` | pointer, touch, wheel; `preventDefault` decided synchronously from the gesture state | the gesture state | raw streams for `recognizers/` |
| `keys` | Obsidian `Scope`s, `app.keymap.pushScope`, shortcuts per tab or block | the layer stack | key messages |
| `chrome` | body classes, `css-change`, the keyboard inset, the status-bar room, the toolbar, popout windows, theme tokens per window | what to show in the chrome (body classes such as entering, keyboard up) | `platform`, `theme`, `keyboard`, `toolbar`, `window` |
| `islands` | CodeMirror (`EmbeddedEditor`), `MarkdownRenderer` output, Obsidian `Modal`: host nodes made once, never diffed | which island, with its model | edits, close |
| `overlay host` | the one place every sheet and menu of every screen mounts (356260af) | open layers | — |

The plugin's own menus and sheets (task, bulk, section, project, event, view, more, sources, search, the full card) are Preact layers.

**Picks**, made explicit:
1. **A write pick** takes its sequence number at the tap and **runs at once.** Only its presentation (the transition on the list) waits for the sheet to close. The order stays the order of taps (D81), and nothing in the file sequence waits on a fade.
2. **A typing pick** (rename, a new subtask, a section name) renders and focuses its field inside the tap (P2), so the iPhone keyboard rises.
3. **A hand-over** (⋯ → Search, a subtask's menu) is one layer transition from one sheet to the next.

**Undo.**
- **Whether it is offered:** `canUndo || pending writes > 0`, as a selector.
- **The undo itself** is a write in the sequence with no preview, shown on its read-back.
- **A conflict** is its own message and notice.

## Resolution

Every class the traceability or the root reviews left over, and where it now lands:

| Class | Where it lands |
|---|---|
| M1 settings tab | its own host (slice 6) |
| M2 plugin host | the plugin runtime |
| M3 chrome both ways | the `chrome` driver |
| M4 synchronous core reads | `CoreQueries` (P7) |
| M5 the core's sessions | the machines themselves (P7) |
| M6 menus | Preact layers |
| M7 and R1 pick timing and synchronous focus | three kinds of pick; a user's event handled to the end, focus last (P2) |
| M8 one interaction | the layer stack plus one gesture (P6) |
| M9 motion by cause | the keyed diff within a context; whole-region transitions across (P5) |
| M10, M11, R2 leaving rows and held heights | skipped by layout selectors; fold and heights as one transition; revival; measurements never held (P4) |
| M12 continuous values | the transient channel (P5) |
| M13 positions | `motion` reads the boxes it animates, in the commit phase |
| M14 scroll | `measure` reports it, `scroll` owns it |
| M15 swipe settle | a tap does not stop it (`screen.md`) |
| M16 unbounded waits | timeouts as messages (P2) |
| M17 and R5 the settings store | events ignored while our writes are in flight, then one read |
| M18 the network | latest wins per day, abandoned |
| M19 cross-screen renames | the pending intents are plugin-wide (P3) |
| M20 recognition | `recognizers/` |
| M21 all service callers | the runtime from slice 1 |
| M22 and R3 the outcome of a write | the preview core applies the intents (P3); the UI computes none |
| M23 key scopes | the `keys` driver |
| R4 a row's key across a create | `rowKey(taskId)` bound by `CreatedTask` (P1) |
| R6 what a swipe shows while the context changes | neighbours read ahead; queued changes; a timeout (P3) |
| R7 the guards' scope | per slice, below (§Guards) |
| Root: snapshots can't be folded | intents over the preview core (P3) |
| Root: the day change contradicted the docs | whole-region transitions (P5) |
| Root: the gesture drew a layout outside the model | the layout snapshot pinned in the model (P6) |

## Guards

**Scope per slice.**
- `uiRules.test.ts` covers `obsidian/ui/next` from slice 2.
- Its service rule (services only in `effects/` and `host/`) covers all of `obsidian/ui` from the end of slice 1.
- New CSS is written below a marker comment `/* next */` in `styles.css`. The new rules in `styles.test.ts` apply below the marker, and the freeze covers what stands above it.

`tests/uiRules.test.ts`:

- **Purity:**
  - `model/`, `update/`, `recognizers/` and `view/` import no DOM global, `obsidian`, service or driver.
  - `view/` imports only selectors, `CoreQueries` and `dispatch`.
- **Services and timers:**
  - Services only in `effects/` and `host/`.
  - Timers and frames only in `effects/` and `drivers/`.
- **DOM work, each only in its own driver:**
  - `.animate(`, `.style`, `setProperty`, `getBoundingClientRect`, `offset*`, `client*` sizes and `getComputedStyle`: `motion` and `measure`.
  - Scroll writes: `scroll`.
  - `.focus(`: `focus`.
  - `ResizeObserver`: `measure`.
  - `classList` and `dataset` writes: `chrome`.
  - Scopes: `keys`.

  JSX `style` is not used, and no code reads a class to decide.
- **Messages:** `Msg` is handled exhaustively (`assertNever`).
- **Windows:** no bare `document` or `window`.

`tests/styles.test.ts` (below `/* next */`):
- scans `.tsx`;
- every rule under `.task-calendar`;
- no `transition` of `height`, `width`, `margin`, `padding`, `top`, `left` or `transform`;
- no state class or pseudo-element that changes a box's size.

`tests/uiFreeze.test.ts`:
- the old `obsidian/ui` and the old CSS may only shrink, checked per directory, and a new file outside `next/` fails;
- a growth (a fix to a bug Max reports while the new screen grows) needs an entry in `uiFreeze.allow.ts` with the commit and the reason.

| Impossible by construction | Enforced by |
|---|---|
| A write out of the order Max acted in; a read before an earlier write | sequence tests; the service rule |
| A frame mixing two contexts or two generations | transaction and preview tests |
| A card flashing back after a drop or a rename | preview-core tests: two drops in flight, a failed write in the middle, a read numbered below a pending write |
| Motion of single rows across a context change; a transition running twice | `update` and `motion` tests; the frame recorder |
| Re-rendering at pointer rate | the render-counter test |
| A redraw under the finger | the gesture tests: a read during each gesture draws the pinned snapshot |
| A screen going stale under a menu, a field or the full card | the layer tests |
| A row remounting from field to card | identity tests |
| One fact in two places | purity and class guards; traceability |
| Focus scrolling the screen; the keyboard not rising on a pick | `focus` driver tests; the phone checklist |

## Migration: slices, not layers

Cutting by layer would leave two truths alive at once, the old DOM state beside the new model: the very defect class. So the cut is by host.

| Slice | What | Release |
|---|---|---|
| 1 | **The runtime under the old code:**<ul><li>contract change: `create*` → `CreatedTask` (`backend`);</li><li>the file sequence with read-back, which **replaces** the old rereads (`act`, `Reload` in `DayData`), so nothing reads twice;</li><li>numbered writes, settings handling, the network lane;</li><li>`chrome` and the overlay host shared;</li><li>every service caller in `obsidian/ui` through the runtime.</li></ul>Replaces `act`, `changing`, `Picks`, `WriteQueue`, `Reload`. The old views show writes as they do today; no previews yet. | ★ fixes the race class on its own |
| 2 | **Guards, freeze, the e2e harness, the preview core.** | — |
| 3 | **The note block, whole, on the new architecture:** Rows and By subprojects, lists, cards, entry, carry inside the block, menus, the full card. No swipe. | ★ |
| 4 | **The leaf as a new screen behind a hidden setting** (`newScreen`, off). Built region by region: lists and layouts, the timeline, the ribbon with neighbours read ahead, the panel and tree, the carry across them, select mode, search. A smoke subset of e2e runs per region. | — |
| 5 | **Switch:** once the full e2e matrix passes and an independent QA finds nothing, `newScreen` turns on. | ★ with Max's phone checklist |
| 6 | **The settings tab.** | ★ |
| 7 | **Delete** the old screen, the setting and the freeze baselines. | ★ |

## Tests

1. **`update` (unit):**
   - every decision 55–87 and fix commit as a replayed message log;
   - every A16 rule as a layer or gesture transition;
   - transactions, including a timeout and a queued second change;
   - pins (changed, gone, hidden-not-gone);
   - identity across create, rename and undo;
   - midnight during a swipe;
   - timeouts.
2. **The runtime and the preview core (unit):**
   - numbers taken at the user's message;
   - read-back;
   - intents with two drops in flight, a failure in the middle, and a read below a pending write;
   - settings echoes;
   - the network lane.
3. **Recognizers (unit):** every input of the inventory's section A as a stream.
4. **Views (happy-dom):** what each draws for a model; the render counter; the caret and composition surviving updates.
5. **Drivers (happy-dom):**
   - transitions run once;
   - running motions are cancelled before the next measure;
   - interruption;
   - scroll yields to the user;
   - focus within the event.
6. **End to end (`scripts/e2e/`, CDP, a test Obsidian with a copy of Max's real file):**
   - **Old against new at rest only**, in one build behind `newScreen`: frames after each step of a scenario, diffed at most 1 px per region. The clock is frozen through the core's clock port (never CDP virtual time), and calendars come from fixtures through a stubbed `Http`.
   - **Frame recorder** for motion, from `document.getAnimations()` and the CDP Animation domain, with row boxes sampled per frame. It fails on:
     - motion without a cause;
     - single rows moving across a context;
     - overshoot;
     - a rest more than 0.5 px off;
     - gaps or overlaps;
     - a swipe landing two places away.
   - **Budget, measured in separate runs:** under 8 ms of script per frame with 300 tasks at 4× CPU; no long task over 16 ms.
   - **Touch** through `Emulation.setTouchEmulationEnabled` and `Input.dispatchTouchEvent`.
   - **When it runs:** the full matrix (every input × mode × desktop and phone view × light and dark) gates each release; a smoke subset gates each region.
7. **Max's phone checklist at each ★** (under 5 minutes): momentum scroll, the rubber band, the real keyboard and its rising on a pick, a lost lift. A finding becomes a case above.

## Done when

- The traceability, rerun against the final revision, leaves no row over.
- Every guard is green, and every row of the "impossible" table has its test.
- The e2e matrix passes, the budget holds, an independent QA on a copy of Max's real file finds no defect, and the phone checklist passes at each ★.
- `CalendarScreen` is gone, and `docs/plugin/` is unchanged.

## How it is built

- `backend` makes the contract change and the preview-core composition; then one `frontend-obsidian` agent per slice or region. The lead checks every diff, test and screen.
- After each slice or region, a fresh reviewer gets the diff, the principles and that part's traceability rows, and finds where the code breaks a principle.
- After slices 3, 4 and 5, a fresh QA agent is told to break it on the e2e matrix.
- A finding is answered by naming the principle or the inventory row that let it through, and fixing that.
