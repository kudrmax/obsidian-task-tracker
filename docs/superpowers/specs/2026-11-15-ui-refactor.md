# Plugin UI refactor: a model, a timeline, drivers

Issue: kudrmax/obsidian-task-tracker#41 (takes in #40). Branch `ui-refactor`. Revision 5.

## How this spec is made

Revisions 1–3 were written top-down, and every review found new holes: the spec never started from what the plugin actually is. Since revision 4 it starts from a complete inventory of the current UI, made by reading every file:

- [`ui-refactor/inventory-state-effects.md`](ui-refactor/inventory-state-effects.md):
  - 565 state locations; 45 facts held in more than one place;
  - 819 effect call sites, 417 ordered by nothing;
  - 180 event sources.
- [`ui-refactor/inventory-behaviour.md`](ui-refactor/inventory-behaviour.md): 203 inputs, 84 motions, 84 measurements, 52 screen states.

[`ui-refactor/traceability.md`](ui-refactor/traceability.md) maps every one of those 2,032 rows to the mechanism that owns it. A row that does not fit is a defect of a principle, not of the row: revision 4 left 688 rows in 23 classes, and an independent architecture review found seven faults at the root. Revision 5 corrects the principles themselves; §Resolution shows where each of the 23 classes now lands. The traceability is rerun against every revision until no row is left over.

## The root cause

**The UI has no model.** Truth lives in the DOM and in work in flight.

| What should be in the model | Where it is today | Defects |
|---|---|---|
| **Facts:** what the screen shows | Fields, CSS classes, `dataset`, inline styles, the DOM. The shown day sits in 9 places, the strip's place in 11, an open field in 12. | Parts disagree (D58, D55) |
| **Time:** what happens in what order | Eight promise chains and flags (`act`, `changing`, `turning`, `drawnLanding`, `afterEntry`, `Picks`, `WriteQueue`, `ScreenParts`); 417 calls under none | Races (D75, D77, D81) |
| **Consistency:** which data a frame is drawn from | Each read applied as it lands; a frame may mix a new title with old lists, or one list read before a write with another read after it | A frame from two generations (D55, D56, D65, D84, D85) |
| **Geometry:** sizes and places | Read from the live DOM when needed (84 places), often mid-animation | Gaps, jumps, measuring a ghost (A4, D60, D67, D76) |
| **Motion:** what moves and why | Inferred by diffing geometry over every row, or by CSS transitions on state classes | Cards flying on a context change (A3), rows jumping on lift (A5), D61 |
| **Interaction:** what the user is in the middle of | Each gesture's own flags, an arbiter, redraws deferred by hand | A redraw under the finger, debris after a drag, D66 |

Out of scope, and kept so: where a task lands, what a drop means and what a menu offers. These are rules, and they live in the core (`application`).

## Principles

Every principle has a mechanism and a guard (§Guards).

**P1. One model.**
- What the screen shows is a pure function of the model: `view(model)`.
- A fact has one field; a derived fact is a selector.
- The DOM, classes and styles are outputs, never read back as truth.
- The core's answers (`FunnelView`, `ViewChoice`, its sessions) are held as the core gives them, never copied.
- The one exception is **typed text**: while a field has focus, the field owns its text (CodeMirror, an `<input>`). The model receives edits and never writes back into a focused field. This keeps the caret, IME and the iPhone keyboard intact.

**P2. One timeline.**
- The model changes only by messages, one at a time, in arrival order: `update(model, msg) → [model, commands]`.
- Everything outside the model is a command, and its outcome is a message: core services, the vault, Obsidian, timers, the network.
- **Dispatch is synchronous.** A message from a user's event is processed, and its focus and keyboard work is done, inside that same event. iOS raises the keyboard only within the tap.
- **Every wait has a bound.** A command that waits for something has a timeout, and the timeout is a message.

**P3. Every frame is one consistent snapshot.**
- File work is one plugin-wide numbered sequence, shared by the leaf, every note block and the settings tab. A write takes its number **when the user's message is processed**, so the order of writes is the order of what the user did.
- After every write the runtime reads the file back itself, so nothing depends on the vault watcher. Every read carries the number of the last write before it.
- What a screen draws:

  ```
  shown = fold(pending writes, last read)
  ```

  - **A pending write** is the write's patch: the moved card at its landing, the renamed text, the new row. Pending writes are plugin-wide, so every screen shows them.
  - **Retiring a write:** it leaves when a read numbered at or above it lands, and the read then takes over. If the write fails, its patch leaves with a reverse transition and a notice.
  - **Several writes in flight** simply fold one over another.
- **A context change is a transaction:** another filter, mode, day or place. The model keeps the change pending until every read the new context needs has landed, then switches in one message. A frame never mixes contexts.

**P4. Geometry is input.**
- **Sizes from the browser:** what only the browser knows enters the model as a message from an observer, and is never held back: text and card heights, the stage, the keyboard, Obsidian's toolbar, scroll positions where something depends on them.
- **Everything else is computed** from the model and the core's rules: widths, shares, stacked heights, the ribbon per place, drop places.
- **A frame has three phases:**
  1. render the end state;
  2. `measure` reads what changed;
  3. `motion` animates from the declared start to the measured end.

  All three run before the paint.
- No other code reads geometry, ever.

**P5. Motion only within one context.**
- **Context change:** nothing moves; the screen is drawn in place, as `screen.md` says.
- **Within one context:** a row moves only when its keyed position changed between two models (added, moved, removed, Undo, whether the change came from Max or from the file). The model diff decides what moves; DOM geometry only executes it.
- **Interactions declare their own motions as transitions.** The carried card following the pointer, folds under a lift, room at a list's end, the drop and cancel flights, swipes, the panel slide, the divider snap, the keyboard ride. Each transition is numbered and runs once.
- **No motion otherwise:** a re-render, a measurement or a resize without a declared transition is applied in place.
- **Drivers report** `motionSettled(id)` or `motionInterrupted(id, at)`.
- A row that is leaving, or an overlay that is closing, stays in the model until its motion settles.
- Continuous gestures (divider, ribbon scrub, pinch, carry) go through a **transient channel**: the input driver passes the live value to `motion`, which lays out with the same pure selectors over the model plus that value. So there is no second layout engine. When a value crosses a step that changes what is drawn (a pinch zoom level, a divider snap), it dispatches.

**P6. Interactions are layers, and they pin; they never freeze data.**
- **The interaction state** is a stack of modal layers (screen → select mode → full card → field → menu or sheet) plus at most one pointer gesture. It is a statechart.
  - Hand-offs are transitions: hold → drag; long press → pinch on a second finger; a sheet to the next sheet.
  - Escape and tap order are reads of the stack.
  - The arbitration rules A16 are its table.
- **Data always applies at once:** reads, the minute tick, midnight, settings.
- **What a layer pins:** each layer and gesture declares the entities it holds — the carried card with its lift place and drop places, the typed row, the menu's task, the full card's task. A change that touches a pinned entity becomes a message to that layer (`targetChanged`, `targetGone`), and the layer decides: cancel the carry, close the menu, keep the typed text.
- **Only the active pointer gesture defers anything:** a re-layout that would move what is under the finger. Nothing else ever waits.

**P7. Imperative code only at the edges.**
- `update`, selectors and `view` are pure.
- **Drivers** own the DOM work that is not declarative: each owns one kind of side effect, takes orders from the model and reports with messages.
- **The effect runner** owns services.
- **Pure core queries** that every draw or pointer move needs (`snap`, `menu`, `listName`, `relation`, `isPast`…) come through a `CoreQueries` port, with the clock taken from the model. They are allowed in selectors.
- **The core's sessions** (`QuickEntrySession`, `SectionNameEntry`, `RepeatPage`, `DescriptionDraft`, the carry) are the machines themselves. The runtime holds them, a command calls them, and the model holds their latest snapshot. They are never re-implemented.

## Architecture

```
obsidian/ui/next/
  model/       Model, Msg (one union), selectors, CoreQueries port        pure
  update/      update(model, msg) → [model, Cmd[]]; layers; gestures      pure
  recognizers/ pointer, touch and wheel streams → gesture messages        pure
  effects/     the effect runner, the file sequence, pending writes,
               the network lane, the core sessions                        services
  view/        Preact components                                           pure
  drivers/     motion, measure, scroll, focus, input, keys, chrome,
               islands                                                     DOM
  host/        the plugin runtime (main.ts), the leaf host, the note-block
               host, the settings-tab host
```

**Preact 11, TSX.**
- TSX is checked by the project's own TypeScript 7 and bundled by esbuild without a plugin. Tests run in vitest with happy-dom, and the guards already read `.tsx`.
- Svelte is rejected: `svelte-check` requires TypeScript ≤6, and its `animate:flip` infers motion from geometry.

**The plugin runtime** (in `main.ts`, one per plugin):
- **The file sequence** and the pending writes.
- **The settings and device-store writes,** numbered like file writes. An echo of our own write is dropped by its number.
- **The network lane:** calendar events, latest wins per day. A superseded fetch is abandoned (its result is ignored); no contract change is needed.
- **Every screen's store:** dispatch is FIFO and never nested.
  - Subscribers are notified once per microtask, through selectors with an equality check.
  - Rows are `memo` with stable props.
- **Action log:** a ring buffer of the last 200 messages, dumped on any failure and attached to QA reports. A race found once is replayed as a test.

**Drivers.**

| Driver | Owns | From the model | Reports |
|---|---|---|---|
| `motion` | WAAPI animations; every inline style and CSS variable from the model; reading the boxes it animates, in the commit phase only | transitions; layout variables; live values from the transient channel | `motionSettled`, `motionInterrupted` |
| `measure` | `ResizeObserver`; text fits; scroll positions where needed | which boxes | `measured`, `scrolled` (quantised), `scrollSettled` |
| `scroll` | every programmatic scroll; anchoring while rows fold; `ScrollHold` | scroll orders: `reveal`, `toHour`, `keep`, `edge`, `open` | `userScrolled` (ownership passes to the user) |
| `focus` | focus with `preventScroll`; CodeMirror focus; done synchronously within a user event | the field to focus | `focused`, `blurred` |
| `input` | pointer, touch, wheel; `preventDefault` decided synchronously from the gesture state | the gesture state | raw streams for `recognizers/` |
| `keys` | Obsidian `Scope`s, `app.keymap.pushScope`, shortcuts per tab or block | the layer stack | key messages |
| `chrome` | body classes, `css-change`, the keyboard inset, the status-bar room, the toolbar, popout windows, theme tokens per window | what to show in the chrome (body classes such as entering, keyboard up) | `platform`, `theme`, `keyboard`, `toolbar`, `window` |
| `islands` | CodeMirror (`EmbeddedEditor`), `MarkdownRenderer` output, Obsidian `Modal`: host nodes made once, never diffed | which island, with its model | edits, close |

The plugin's own menus and sheets (task, bulk, section, project, event, view, more, sources, search, the full card) are its own DOM, so they become **Preact layers**, not islands.

**Picks**, made explicit:
1. **A write pick** takes its sequence number at the tap. It runs after the closing sheet's motion settles, or immediately when nothing closes.
2. **A typing pick** (rename, a new subtask, a section name) focuses the field synchronously inside the tap, so the iPhone keyboard rises.
3. **A hand-over** (⋯ → Search, a subtask's menu) is one layer transition from one sheet to the next.

## Resolution of the traceability classes

| Class | Rows | Where it lands now |
|---|---|---|
| M1 the settings tab | `SettingsTab`, `SettingsPage`, `RowReorder` | Its own host in the same architecture (step 6). Its writes go through the plugin runtime. |
| M2 the plugin host | `main.ts` | The plugin runtime (architecture). |
| M3 chrome both ways | body classes, tokens | The `chrome` driver takes the classes to show and reports platform and theme. |
| M4 synchronous core reads | `snap`, `menu`, `relation`… | `CoreQueries` in selectors (P7). |
| M5 the core's sessions | `QuickEntrySession`… | They are the machines (P7). |
| M6 menus | the plugin's own menus | Preact layers (architecture). |
| M7 pick timing | `pickNow`, hand-overs | Three kinds of pick; synchronous dispatch (P2). |
| M8 one interaction | select mode, field, menu, full card | A stack of layers plus one gesture (P6). |
| M9 motion by cause | added, moved, removed, Undo | A keyed diff within one context; no motion across contexts (P5). Changes from the file move as they do today. |
| M10 leaving rows, closing overlays | | Stay in the model until `motionSettled` (P5). |
| M11 heights held during motion | D76 | Measurements are never held. The commit phase animates them (P4). |
| M12 continuous values | pinch grid, divider | The transient channel; dispatch on a step (P5). |
| M13 positions as geometry | | `motion` reads the boxes it animates, in the commit phase only (P4). |
| M14 scroll | anchors, peek scroll, carry offsets | `measure` reports scroll; `scroll` owns writes. |
| M15 swipe settle | A7.6 | A tap does not stop a settle; it goes where it lands (`screen.md`). |
| M16 unbounded waits | 1000 ms, 2000 ms, flight + 20 ms | Every wait has a timeout message (P2). |
| M17 the device and settings stores | | Numbered writes, echoes dropped (runtime). |
| M18 the network lane | | Latest wins per day; abandoned, not aborted. |
| M19 cross-screen renames | `RenamedTexts` | Pending writes are plugin-wide (P3). |
| M20 gesture recognition | | `recognizers/`, pure. |
| M21 all service callers | `DayData`, `DayPeek`, `CarryReport`, `ProjectBlocks`, `BottomCapsule`, `viewSettings`, `SearchWindow`, `GroupNameField` and the rest | Every one joins the runtime in step 1. The guard then covers the whole of `obsidian/ui`. |
| M22 a dropped card before its read | | Its pending write's patch (P3). |
| M23 Obsidian key scopes | `pushScope` | The `keys` driver. |

## Guards

`tests/uiRules.test.ts` covers `obsidian/ui/next`:

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

`tests/styles.test.ts` also:
- scans `.tsx`;
- bans a `transition` of `height`, `width`, `margin`, `padding`, `top`, `left` or `transform`;
- bans state classes or pseudo-elements that change a box's size.

`tests/uiFreeze.test.ts`: the old `obsidian/ui` outside `next/` and its rules in `styles.css` may only shrink. It checks totals per directory and fails on a new file. A growth needs an entry in `uiFreeze.allow.ts` with the commit and the reason.

| Impossible by construction | Enforced by |
|---|---|
| A write running out of the order Max acted in; a read before an earlier write | sequence tests; services only in `effects/` (the whole `obsidian/ui` from step 1) |
| A frame mixing two contexts or two generations | transaction and fold tests |
| A card flashing back after a drop or a rename | pending-write tests |
| Motion across a context change; a transition running twice | `update` and `motion` tests; the frame recorder |
| Re-rendering at pointer rate | the render-counter test |
| A redraw under the finger | the gesture tests: a read during each gesture |
| A screen going stale while a menu, field or the full card is open | the layer tests: reads apply under every layer |
| One fact in two places | the purity and class guards; `traceability.md` rerun |
| Focus scrolling the screen; the iPhone keyboard not rising on a pick | the `focus` driver tests; the phone checklist |

## Migration: slices, not layers

Cutting by layer would leave two truths alive for months, the old DOM state beside the new model: the very defect class. The new code is cut by host instead, and each slice is whole.

| Slice | What | Release |
|---|---|---|
| 1 | **The runtime under the old code:**<ul><li>contract change: `create*` → `CreatedTask` (`backend`);</li><li>the file sequence, pending writes and read-back;</li><li>numbered settings writes, the network lane, the action log;</li><li>every service caller in `obsidian/ui` goes through it.</li></ul>Replaces `act`, `changing`, `Picks`, `WriteQueue`, `Reload`. | ★ fixes the race class on its own |
| 2 | **The guards and the freeze; the e2e harness** (old-against-new diff, frame recorder, budget, input driving). | — |
| 3 | **The note block, whole, on the new architecture:** `host/block`, the Rows and By-subprojects layouts, lists, cards, the entry field, carry inside the block, menus, the full card. It has no swipe and stands still (D63, D82). | ★ |
| 4 | **The leaf as a new screen behind a hidden setting** (`newScreen`, off). It is built region by region (lists and layouts, the timeline, the ribbon with both swipes and the peek, the panel and tree, the carry across all of them, select mode, search), with old-against-new e2e in the same build. Max's screen is untouched while it grows. | — |
| 5 | **Switch.** When the leaf's e2e matrix passes and an independent QA finds nothing, `newScreen` turns on by default. | ★ with Max's phone checklist |
| 6 | **The settings tab on the new architecture.** | ★ |
| 7 | **Delete** the old screen, the setting and the freeze baselines. `CalendarScreen` is gone. | ★ |

## Tests

1. **`update` (unit):**
   - every decision 55–87 and fix commit as a replayed message log;
   - every A16 arbitration rule as a layer or gesture transition;
   - the transaction;
   - folding pending writes, with several in flight and with a failure;
   - a read under every layer and every gesture;
   - pinned targets changed or gone;
   - timeouts.
2. **The runtime (unit):** numbers taken at the user's message; read-back; settings echoes; FIFO; notification by selector; the network lane.
3. **Recognizers (unit):** every input of the inventory's section A as a stream.
4. **Views (happy-dom):** what each draws for a model; the render counter; the caret and composition surviving updates.
5. **Drivers (happy-dom):**
   - transitions run once;
   - running motions are cancelled before the next measure;
   - interruption is reported;
   - scroll yields to the user;
   - focus happens within the event.
6. **End to end (`scripts/e2e/`, CDP, a test Obsidian with a copy of Max's real file):**
   - **Old against new** in one build, behind `newScreen`. Twin vaults, a frozen clock, fixture calendars, the network stubbed. Diff per state at most 1 px per region, with masks listed.
   - **Frame recorder:** row boxes relative to their lists, plus the layout parts, every frame. It fails on:
     - motion without a cause;
     - motion across a context;
     - overshoot;
     - a rest more than 0.5 px off;
     - gaps or overlaps;
     - a swipe landing two places away.
   - **Budget:** under 8 ms of script per frame with 300 tasks at 4× CPU; no long task over 16 ms.
   - **Coverage:** each of the 203 inputs has a case, across modes, desktop and phone view, light and dark.
7. **Max's phone checklist at each ★** (under 5 minutes): what emulation cannot show — momentum scroll, the rubber band, the real keyboard and the keyboard rising on a pick, a lost lift. A finding becomes a case above.

## Done when

- `traceability.md`, rerun against this revision, leaves no row over.
- Every guard is green, and every row of the "impossible" table has its test.
- The e2e matrix passes old against new, the budget holds, an independent QA on a copy of Max's real file finds no defect, and the phone checklist passes at each ★.
- `CalendarScreen` is gone, and `docs/plugin/` is unchanged.

## How it is built

- `backend` makes the contract change in slice 1. After that, one `frontend-obsidian` agent per slice or region; the lead checks every diff, test and screen.
- After each slice or region a fresh reviewer gets the diff, the principles and that part's traceability rows, and finds where the code breaks a principle.
- After slices 3, 4 and 5 a fresh QA agent is told to break it on the e2e matrix.
- A finding is answered by naming the principle or the inventory row that let it through, and fixing that.
