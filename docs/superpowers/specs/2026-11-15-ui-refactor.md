# Plugin UI refactor: the plugin becomes a host of the core's door

Issue: kudrmax/obsidian-task-tracker#41 (takes in #40). Branch `ui-refactor`. Revision 7.

## How this spec is made

Revisions 1–3 were written top-down, and every review found new holes: the spec never started from what the plugin actually is. Since revision 4 it starts from a complete inventory of the current UI, made by reading every file:

- [`ui-refactor/inventory-state-effects.md`](ui-refactor/inventory-state-effects.md):
  - 565 state locations; 45 facts held in more than one place;
  - 819 effect call sites, 417 ordered by nothing;
  - 180 event sources.
- [`ui-refactor/inventory-behaviour.md`](ui-refactor/inventory-behaviour.md): 203 inputs, 84 motions, 84 measurements, 52 screen states.

[`ui-refactor/traceability.md`](ui-refactor/traceability.md) maps all 2,032 rows to the mechanism that owns each. Each revision is checked two ways: the traceability is rerun from scratch, and a fresh architect who has not seen earlier revisions judges the root against the code.

| Revision | Rows left over | Faults at the root |
|---|---|---|
| 4 | 688 (23 classes) | 7 |
| 5 | 219 (7 classes) | 3 |
| 6 | 155 (4 classes) | 3 |
| 7 | the faults of revision 6 dissolved at their cause, below | |

The faults of revisions 5 and 6 had one cause. The spec treated the core as an asynchronous service the UI waits on, and built machinery around the waiting: read-back, previews, transactions, read-ahead, echoes. The core already has a **synchronous, pure door**, `callDoor(method, args, context) → answer` (`core/application/PhoneCalls.ts`). The iPhone app runs on it, and it covers every `TaskService`, `DayService`, undo, settings and calendar method (a typed coverage map, `PhoneCalls.ts:1077`). On Max's real tasks file (31 KB) a whole funnel view costs about 3 ms through it, JSON included (measured locally). Revision 7 puts the plugin on the same door, and the waiting is gone.

## The root cause

**The UI has no model.** Truth lives in the DOM and in work in flight.

| What should be in the model | Where it is today | Defects |
|---|---|---|
| **Facts:** what the screen shows | Fields, classes, `dataset`, inline styles, the DOM. The shown day sits in 9 places, the strip's place in 11, an open field in 12. | Parts disagree (D58, D55) |
| **Time:** what happens in what order | Eight promise chains and flags; 417 calls under none; reads that write (the view reads tidy the file, `TaskReads` `tidies: true`) | Races (D75, D77, D81) |
| **Consistency:** which data a frame is drawn from | Each asynchronous read applied as it lands | A frame from two generations (D55, D56, D65, D84, D85) |
| **Identity:** which row is which across create, rename and undo | A typed field, its waiting text and its card are three nodes | A row remounts, a line flies in from a corner (D86, 5cca0ad9) |
| **Geometry:** sizes and places | Read from the live DOM when needed (84 places), often mid-animation | Gaps, jumps, measuring a ghost (A4, D60, D67, D76) |
| **Motion:** what moves and why | Inferred by diffing geometry, or by CSS transitions on state classes | Cards flying on a context change (A3), rows jumping on lift (A5), D61 |
| **Interaction:** what the user is in the middle of | Each gesture's own flags, an arbiter, redraws deferred by hand | A redraw under the finger, debris after a drag (D66) |
| **Lifecycle:** what is alive | Subscriptions, observers and timers made inside widgets and not always ended | Scroll watches never stopped (68181284), blocks remounting (ad8fe1ec), Sync or the metadata cache not ready at start (03f149aa, 57562189) |
| **Host:** Obsidian's and iOS's CSS and chrome | Unscoped rules meet Obsidian's and iPadOS's own | iPad padding (f623d869), Live Preview stretching the block (D80) |

The rules themselves stay where they are, in the core: where a task lands, what a drop means, what a menu offers.

## Principles

**P1. One model.**
- What the screen shows is a pure function of the model: `view(model)`.
- A fact has one field; a derived fact is a selector.
- The DOM, classes and styles are outputs, never read back as truth.
- **Identity is model state:** a row's key is given when the user's message makes it. The core's `CreatedTask` id (known at once, P3) is bound to that key, so one row lives from field to card.
- **Typed text is the one exception:** while a field has focus, the field owns its text. The model receives edits and never writes back into it.
- **Values the screen writes are model state; the store only keeps them:** the list share, zoom, tree width and device choices.

**P2. One timeline.**
- The model changes only by messages, one at a time: `update(model, msg) → [model, commands]`.
- Work outside the model is a command, and its outcome is a message.
- **A user's event is handled to the end inside it:** update, render, drivers, focus last. That is what lets the iPhone keyboard rise on a typing pick. Other messages are batched once per microtask.
- **Every wait on something the user sees has a bound,** and the bound is a message.

**P3. The core is a pure, synchronous function over a replica the runtime holds.**
- **The replica:** the plugin runtime holds one `DoorContext` (`PhoneCalls.ts:85`): the tasks text, the settings text, the undo history, the projects-screen state, the id state, the calendars' texts and the project notes. Every screen shares it.
- **Calls:** every core call (a view, a write, a carry step, a session step, an undo, a settings change) is `callDoor(method, args, replica)`, in-process, without JSON, the same door the iPhone app calls.
  - A call is synchronous and runs inside the message that asks for it, in message order.
  - Its answer gives the result and the new parts of the replica: tasks, settings, history, projects screen, ids.
- **Consequences:**
  - **Views are selectors over the replica,** memoised by its identity. Another filter, mode, day or place is drawn from the same replica in the same message, so a frame can never mix generations or contexts. There is nothing to wait for and nothing to read ahead.
  - **A write is visible at once,** with its real outcome: where the card landed, the new task's id. There is no preview to compute and no optimistic layer.
  - **Tidying the file** (today a hidden write inside a read) is the answer's new `tasks` text with `step: false`. It is persisted like any write, and the read stays pure.
  - **Ids have one lineage,** carried in the replica.
- **Persistence:** one plugin-wide serial queue writes the answers' texts to the vault, with compare-and-set (`vault.process`, which writes only if the file still holds the text the replica was based on, as `DoorAnswer.tasks` already specifies).
- **Outside changes:** Sync, an agent, another device.
  - When the file's text differs from the last text the runtime persisted or read, it becomes the new base.
  - The calls since the last persisted base (the **pending calls**, kept as method and arguments) are replayed in order through the door over it, and the replica becomes the result.
  - A replayed call that now fails (`staleTask`) is dropped with a notice and a reverse transition; the rest stand.
  - Our own write's change event finds its own text and does nothing.
- **Calendars:** the network lane fetches events, latest wins per day, a superseded fetch abandoned. Their files go into the replica as data, cached first and fresh when they land.
- **Synchronous rules** used per frame or per pointer move (`rules.*`: `snap`, `swipeLanding`, `layoutWidths`, `stackedLists`…) are called directly. They are pure.
- **Cost:** a full view on Max's file costs about 3 ms. The core caches the parsed document by text, so views over an unchanged text don't parse again (a core task in slice 1, with a budget test).

**P4. Geometry is input.**
- **Sizes from the browser:** what only the browser knows enters the model as a message from an observer, never held back: text and card heights, the stage, the keyboard, the toolbar, scroll positions where something depends on them.
- **Everything else is computed** from the model and the core's rules.
- **A frame has three phases, all before the paint:**
  1. render the end state;
  2. `measure` reads what changed;
  3. `motion` animates from the declared start to the measured end.
- **Leaving rows:** layout selectors skip them. A fold and the heights that depend on it are one transition (D76). A key that returns mid-fold revives its entry.
- No other code reads geometry.

**P5. Motion follows the change; a context change moves as a whole or not at all.**
- **Within one context:** a row moves only when its keyed position changed between two models (added, moved, removed, Undo), whether the change came from Max or from the file.
- **Across contexts:** no row moves on its own. Another project, mode or filter draws in place. A day or place change is one whole-region transition between two complete views (the day slide, the ribbon), as `screen.md` says.
- **Interactions declare their motions as numbered transitions:** the carried card, folds under a lift, room at a list's end, the drop and cancel flights, the panel slide, the divider snap, the keyboard ride. Each runs once.
- **Everything else** (a re-render, a measurement, a resize) applies in place.
- **Drivers report** `motionSettled(id)` or `motionInterrupted(id, at)`.
- **Continuous gestures** go through a transient channel. The input driver passes the live value to `motion`, which lays out with the same pure selectors plus that value. Crossing a step that changes what is drawn dispatches.

**P6. Interactions are layers; what moves pins what is under it; data never freezes.**
- **The stack:** a stack of modal layers (screen → select mode → full card → field → menu or sheet) plus at most one pointer gesture. It is a statechart.
  - Hand-offs are transitions: hold → drag; long press → pinch; one sheet to the next.
  - Escape and tap order are reads of the stack. The arbitration rules A16 are its table.
  - A tap during a swipe's settle does not stop it; the tap goes where it lands (`screen.md`).
- **Data applies at once:** the replica, the minute tick, settings.
- **Pins:** each layer and gesture declares the entities it holds. A change to one is a message to that layer:
  - a carried card deleted from the file fades and the carry ends;
  - a menu's task deleted closes the menu;
  - a field whose task was deleted keeps its text until commit, which then fails with today's notice;
  - hidden by a new context is not deleted;
  - a line Sync rewrote so heavily that it has a new id counts as deleted, and that is accepted.
- **Anything moving pins the layout under it:** a pointer gesture, a closing sheet, a sliding region.
  - It pins the layout as it stood when it began: lists, drop places, anchors. While it is active the view draws that snapshot, so the view is still `view(model)`.
  - A context change the gesture itself causes re-pins it as one declared whole-region transition: a held card opening another node (D65).
  - When the motion ends, the move to the current layout is an ordinary keyed transition. This gives a write pick's list change after its sheet closes (R10).
  - A drop resolves against model anchors.

**P7. Imperative code only at the edges.**
- `update`, selectors and `view` are pure.
- **Drivers** own the DOM work that is not declarative.
- **The runtime** owns the replica, the door calls, persistence, the network and Obsidian's events.
- **The core's sessions** (`entry.*`, `sectionName`, `repeatPage`, `description`, the carry) are door methods over the replica, never re-implemented.
- **Host CSS is scoped:**
  - every new rule sits under `.task-calendar`;
  - a scoped reset neutralises Obsidian's and iPadOS's control styles;
  - body classes are written only by `chrome`.

**P8. Everything alive has an owner.**
- A host (the leaf, a note block, the settings tab) mounts, owns and disposes every driver, observer, subscription, scope and timer it starts.
- Host readiness (layout ready, Sync loaded, metadata cache resolved) and teardown arrive as messages.
- A test mounts and unmounts each host and finds nothing left alive.

## Architecture

```
obsidian/ui/next/
  model/       Model, Msg (one union), selectors over the replica       pure
  update/      update(model, msg) → [model, Cmd[]]; layers; gestures    pure
  recognizers/ pointer, touch and wheel streams → gesture messages      pure
  view/        Preact components                                         pure
  drivers/     motion, measure, scroll, focus, input, keys, chrome,
               islands, overlay host                                     DOM
  host/        leaf, note block, settings tab: mount, own, dispose
obsidian/runtime/
  Runtime      the replica; door calls; pending calls and replay; the
               persistence queue; the network lane; Obsidian's events;
               the action log
  TaskServiceFacade   TaskService (and Day, Undo, Settings) over the
                      runtime, for the old screen during the migration
```

**Preact 11, TSX.**
- It is checked by TypeScript 7 and bundled by esbuild as is. Svelte is rejected: `svelte-check` needs TypeScript ≤6, and its `animate:flip` infers motion from geometry.
- A user's event renders synchronously (the runtime flushes Preact's `debounceRendering`).

**Drivers.**

| Driver | Owns | Reports |
|---|---|---|
| `motion` | WAAPI; every inline style and CSS variable from the model; reading the boxes it animates, in the commit phase; the target window's frames | `motionSettled`, `motionInterrupted` |
| `measure` | `ResizeObserver` (the target window's); text fits; scroll positions where needed | `measured`, `scrolled`, `scrollSettled` |
| `scroll` | every programmatic scroll; anchoring while rows fold; `ScrollHold` | `userScrolled` |
| `focus` | focus with `preventScroll`; CodeMirror focus; within the user's event | `focused`, `blurred` |
| `input` | pointer, touch, wheel; `preventDefault` decided synchronously from the gesture state | raw streams |
| `keys` | Obsidian `Scope`s and shortcuts per tab or block | key messages |
| `chrome` | body classes, `css-change`, the keyboard inset, the status-bar room, the toolbar, popouts, theme tokens per window | `platform`, `theme`, `keyboard`, `toolbar`, `window` |
| `islands` | CodeMirror, `MarkdownRenderer` output, Obsidian `Modal`: host nodes made once, never diffed | edits, close |
| `overlay host` | the one place every sheet of every screen mounts | — |

The plugin's own menus and sheets are Preact layers.

**Picks.**
1. **A write pick** runs its door call at the tap. The list's change shows when the sheet's close settles (P6 pins the layout under the closing sheet).
2. **A typing pick** renders and focuses its field inside the tap.
3. **A hand-over** is one layer transition.

**Undo** is a door call like any other: instant, its result visible at once, with `canUndo` from the replica's history.

## Resolution

| Class | Where it lands |
|---|---|
| M1 settings tab | its host (slice 6) |
| M2 plugin host | the runtime |
| M3 chrome | `chrome` |
| M4 core reads per draw | door selectors and `rules.*` (P3) |
| M5 sessions | door methods (P7) |
| M6 menus | Preact layers |
| M7, R1 picks and focus | three picks; a user's event handled to the end (P2) |
| M8 one interaction | the layer stack (P6) |
| M9 motion by cause | keyed diff within a context; whole-region transitions across (P5) |
| M10, M11, R2 leaving rows | layout selectors skip them; one transition; revival (P4) |
| M12 continuous values | the transient channel (P5) |
| M13 positions | `motion` in the commit phase |
| M14 scroll | `measure` and `scroll` |
| M15 settle | P6 |
| M16 waits | bounds as messages (P2) |
| M17, R5 settings store | settings are part of the replica, persisted by the same queue, our own echo found by its text |
| M18 network | the network lane (P3) |
| M19 cross-screen renames | one replica for every screen |
| M20 recognition | `recognizers/` |
| M21 service callers | the facade in slice 1 |
| M22, R3, R8 outcome of a write; preview core | the door gives the real outcome at once (P3) |
| M23 key scopes | `keys` |
| R4 identity | `CreatedTask` id at once, bound to the row key (P1) |
| R6, R11 what a context shows meanwhile; events | nothing is waited for; events cached first (P3) |
| R7 guard scope | §Guards |
| R9 calls that read projects-screen state | every core call runs in message order on one replica (P3) |
| R10 a write pick's motion | the closing sheet pins the layout under it (P6) |
| Root, rev 6: reads that write | tidy is the answer's text, persisted like a write (P3) |
| Root, rev 6: preview ids | one replica, one id lineage (P3) |
| Root, rev 6: transactions | gone: views are synchronous (P3) |
| Root, rev 6: the gesture snapshot against D65 and D84 | re-pin on the gesture's own context changes (P6) |
| Root, rev 6: lifecycle | P8 |

## Guards

**Scope.**
- `uiRules` covers `obsidian/ui/next` from slice 2.
- Its rule "core calls only through the runtime" covers all of `obsidian/ui` from the end of slice 1.
- New CSS lives below a `/* next */` marker in `styles.css`; the new style rules apply there, and the freeze covers the old part above it.

`tests/uiRules.test.ts`:
- **Purity:** `model/`, `update/`, `recognizers/` and `view/` import no DOM global, `obsidian`, runtime or driver.
- **Core calls:** only in the runtime. `view/` imports only selectors and `dispatch`.
- **Timers and frames:** only in the runtime and `drivers/`.
- **DOM work, each only in its own driver:**
  - animation and style writes: `motion`;
  - geometry reads: `motion` and `measure`;
  - scroll writes: `scroll`;
  - `.focus(`: `focus`;
  - `ResizeObserver`: `measure`;
  - class and `dataset` writes: `chrome`;
  - scopes: `keys`.

  No JSX `style`, and no code reads a class to decide.
- **Messages:** `Msg` is handled exhaustively.
- **Windows:** no bare `document` or `window`.

`tests/styles.test.ts` (below `/* next */`):
- scans `.tsx`;
- every rule under `.task-calendar`;
- no layout-property transitions;
- no state class or pseudo-element that changes a box's size.

`tests/uiFreeze.test.ts`:
- the old UI and the old CSS may only shrink;
- a fix Max asks for on the old screen while the new one grows needs an entry in `uiFreeze.allow.ts`.

`tests/hostLifecycle.test.ts`: every host mounted and unmounted leaves no listener, observer, scope or timer.

| Impossible by construction | Enforced by |
|---|---|
| A write out of the order Max acted in | runtime tests; the core-call rule |
| A frame mixing generations or contexts | synchronous views (a type: selectors take the replica, not a promise); runtime replay tests |
| A card flashing back after a drop or a rename | runtime tests: a write's outcome is in the same message |
| An outside edit lost, or overwriting a pending write | replay tests: Sync during three pending calls, one of which goes stale |
| Single rows moving across a context; a transition twice | `update` and `motion` tests; the frame recorder |
| Re-rendering at pointer rate | the render-counter test |
| A redraw under the finger | the pin tests |
| A screen going stale under a layer | the layer tests |
| A row remounting from field to card | identity tests |
| Something alive after its host | the lifecycle test |
| Focus scrolling the screen; the keyboard not rising on a pick | `focus` tests; the phone checklist |

## Migration: the runtime first, then hosts

| Slice | What | Release |
|---|---|---|
| 1 | **The runtime and the facade under the old screen:**<ul><li>the replica, door calls, persistence with compare-and-set, replay of pending calls, the network lane;</li><li>`TaskServiceFacade` gives the old screen the same `TaskService`, `DayService`, `UndoService` and settings interfaces over the runtime;</li><li>core: tidy as an answer's text, a parsed-document cache, and anything the door lacks for the plugin (`backend`; the door's existing names and answers unchanged);</li><li>`chrome` and the overlay host shared.</li></ul>The old `act`, `changing`, `Picks`, `WriteQueue`, `Reload` and the services' own file reads go. The old screen keeps drawing as it does, now from one replica in one order. Done in caller groups (lists, quick entry, menus, carry, timeline, projects, settings), each with its own guard. | ★ the race class gone on the old screen |
| 2 | **Guards, freeze, the lifecycle test, the e2e harness.** | — |
| 3 | **The note block, whole, on the new architecture, behind `newBlock`:** Rows and By subprojects, lists, cards, entry, carry in the block, menus, the full card. | ★ after QA |
| 4 | **The leaf as a new screen behind `newScreen` (off).** Built region by region: lists and layouts, the timeline, the ribbon and both swipes, the panel and tree, the carry across them, select mode, search. A smoke subset of e2e per region. | — |
| 5 | **Switch:** once the release gate passes and an independent QA finds nothing, both flags turn on. | ★ with Max's phone checklist |
| 6 | **The settings tab.** | ★ |
| 7 | **Delete** the old screen, the facade, the async services the plugin no longer uses, the flags and the freeze baselines. | ★ |

## Tests

1. **`update` (unit):**
   - every decision 55–87 and fix commit as a replayed message log;
   - every A16 rule;
   - pins (changed, gone, hidden-not-gone, a Sync re-id);
   - identity across create, rename and undo;
   - midnight during a swipe;
   - bounds.
2. **The runtime (unit):**
   - door calls in order;
   - persistence with compare-and-set;
   - our own echo;
   - Sync during pending calls, with one going stale;
   - tidy persisted;
   - settings in the replica;
   - the network lane;
   - the parsed-document cache's budget on a 30 KB file.
3. **Recognizers (unit):** every input of the inventory's section A as a stream.
4. **Views (happy-dom):** what each draws for a model; the render counter; the caret and composition surviving updates.
5. **Drivers (happy-dom):**
   - transitions run once;
   - running motions are cancelled before the next measure;
   - interruption;
   - scroll yields to the user;
   - focus within the event.
6. **End to end (`scripts/e2e/`, CDP, a test Obsidian with a copy of Max's real file):**
   - **Geometry against the design boards** at rest, with a tolerance.
   - **Old against new** at rest where the behaviour is meant to be the same, in one build behind the flags.
   - **Clock and network:** the clock is frozen through the core's clock (never CDP virtual time), and calendars come from fixtures through a stubbed `Http` in the test build.
   - **Frame recorder** from `document.getAnimations()` and the CDP Animation domain, with row boxes sampled. It fails on:
     - motion without a cause;
     - single rows moving across a context;
     - overshoot;
     - a rest more than 0.5 px off;
     - gaps or overlaps;
     - a swipe landing two places away.
   - **Budget, in separate runs:** under 8 ms of script per frame with 300 tasks at 4× CPU; no long task over 16 ms.
   - **Touch** through `Emulation.setTouchEmulationEnabled` and `Input.dispatchTouchEvent`.
   - **Gates:**
     - a risk-ranked subset gates each region;
     - the release gate is every input, in each mode, on desktop and phone view, in light and dark;
     - the full matrix runs before the switch.
7. **Max's phone checklist at each ★** (under 5 minutes): momentum scroll, the rubber band, the real keyboard and its rising on a pick, a lost lift.

## Done when

- The traceability, rerun against the final revision, leaves no row over.
- Every guard is green, and every row of the "impossible" table has its test.
- The release gate passes, the budget holds, an independent QA on a copy of Max's real file finds no defect, and the phone checklist passes at each ★.
- `CalendarScreen` is gone, and `docs/plugin/` is unchanged.

## How it is built

- `backend` makes the core part of slice 1. One `frontend-obsidian` agent per slice or region after that. The lead checks every diff, test and screen.
- After each slice or region, a fresh reviewer gets the diff, the principles and that part's traceability rows, and finds where the code breaks a principle.
- After slices 1, 3, 4 and 5, a fresh QA agent is told to break it.
- A finding is answered by naming the principle or the inventory row that let it through, and fixing that.
