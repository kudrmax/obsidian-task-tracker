# Plugin UI refactor: a model, a timeline, drivers

Issue: kudrmax/obsidian-task-tracker#41 (takes in #40). Branch `ui-refactor`. Revision 4.

**How this revision was made.** Revisions 1–3 were written top-down and each review found new holes. The cause was not too few reviews: the spec never started from what the plugin actually is. So this revision starts from a complete inventory of the current UI, made by reading every file:

- `ui-refactor/inventory-state-effects.md`:
  - 565 state locations; 45 facts held in more than one place;
  - 819 effect call sites, 417 of them ordered by nothing;
  - 180 event sources that redraw.
- `ui-refactor/inventory-behaviour.md`: 203 inputs and gestures, 84 motions, 84 DOM measurements, 52 screen states.

The spec derives a few principles from the root cause and builds the architecture from them. `ui-refactor/traceability.md` maps every inventory row to the mechanism that owns it; an unmapped row is a spec defect. A review finding is answered at the level of the principle or inventory that missed it, never with a one-off rule.

## The root cause

**The UI has no model.** Truth lives in the DOM and in work in flight:

| What should be a model | Where it is today | The defects it produces |
|---|---|---|
| **Facts:** what the screen shows | Class fields, CSS classes, `dataset`, inline styles, the DOM. The day shown lives in 9 places, the place on the strip in 11, an open field in 12. | Parts disagree: a hidden ribbon (D58), a title over old lists (D55), a mode jumping. |
| **Time:** what happens in what order | Promise chains and flags: `act`, `changing`, `turning`, `drawnLanding`, `afterEntry`, `Picks`, `WriteQueue`, `ScreenParts`. 417 calls go through none of them. | Races: a deleted task flashes back (D77), a pick before the close (D81), `endCarry` before the drop (D75). |
| **Geometry:** sizes and places | Read from the live DOM at the moment of need (84 places), often while something animates. | Gaps, jumps, measuring a ghost (A4, D60, D67, D76). |
| **Motion:** what moves and why | Inferred by diffing geometry (FLIP over every row) or by CSS transitions on state classes. | Cards fly in on a context change (A3); rows jump on lift (A5); a context change animated (D61). |
| **Interaction:** what the user is in the middle of | Each gesture's own flags plus an arbiter, and redraws deferred by hand. | A redraw under the finger, debris after a drag, a tap during a settle (D65, D66, c89c7ba8). |

Every past defect traces back to one of these rows. The fix is to give the UI a model and make every one of these things part of it, or an input to it.

## Principles

Each principle is an invariant and has a mechanism that enforces it. The guards are in §Guards.

**P1. One model.**
- Everything the screen shows is a pure function of one `Model` per screen: `view(model)`.
- A fact has exactly one field. A derived fact is computed (a selector), never stored.
- The DOM, CSS classes and inline styles are outputs only, never read back as truth.

**P2. One timeline.**
- The model changes only by messages, processed one at a time in arrival order: `update(model, msg) → [model, commands]`.
- All work outside the model (core services, the vault, Obsidian, timers, the network) is a command. Its outcome comes back as a message.
- File work is one plugin-wide sequence, shared by the leaf and every note block. A read knows the number of the last write before it.
- **An interaction ends only when the read of its write lands.** Until then the interaction itself, which lives in the model (P5), shows its outcome:
  - the dropped card stays where it landed;
  - the renamed text stays typed;
  - the new line stays a row.

  So there is no separate optimistic layer to keep in sync.

**P3. Geometry is input.**
- What only the browser knows (a text's wrapped height, the stage's size, the keyboard, where Obsidian's toolbar is) enters the model as a message from an observer.
- Everything else (widths, shares, stacked heights, the ribbon per place, drop places) is computed from the model and the core's rules.
- Nothing reads geometry to decide anything while drawing.
- Pointer positions are input, like any other.

**P4. Motion is declared by its cause.**
- A message that should move something says so: its result carries a `Transition` (what moves, from what, why), numbered.
- Drivers execute each transition once.
- A change without a transition is drawn in place: another context, an outside read, a re-render.
- No motion is inferred from a diff, and no CSS transition animates layout.

**P5. One interaction at a time, inside the model.** A gesture, typing, an open menu or sheet: each is a state machine in the model, at most one active.
- Messages the interaction itself causes apply at once.
- Outside changes (a vault read it didn't ask for, the minute tick) wait in the model and apply when it ends.
- Who wins and who hands off is a property of the machines, not of an arbiter beside them.

**P6. Imperative code lives only at the edges.**
- `update` and `view` are pure.
- DOM work that can't be declarative (animations, scroll, focus, measuring, Obsidian's `Menu`, `Modal`, CodeMirror, body classes) lives in a few **drivers**: each owns one kind of side effect, takes orders from the model and reports back with messages.
- Services are called only from the **effect runner**.

## Architecture

```
obsidian/ui/next/
  model/      Model, Msg (one discriminated union), selectors          pure
  update/     update(model, msg) → [model, Cmd[]]; machines            pure
  effects/    effect runner: Cmd → services/vault/Obsidian → Msg; the file sequence
  view/       Preact components: view(model, dispatch)                  pure
  drivers/    motion, scroll, focus, measure, input, chrome, islands   the only DOM side effects
  host/       mounting into TaskCalendarView and ProjectBlocks; the plugin-wide runtime
```

**Rendering: Preact 11, TSX.**
- TSX is checked by the project's own TypeScript 7 and bundled by esbuild without a plugin. Tests run in vitest with happy-dom, and the guards already read `.tsx`.
- Svelte was rejected: `svelte-check` requires TypeScript ≤6, and its `animate:flip` infers motion from geometry, which P4 forbids.
- React is the same model at 10× the size.

**The runtime.**
- One per plugin.
- **The file sequence:** shared by every screen; strictly serial; jobs are numbered.
- **The network lane:** calendar events, latest wins, cancelled through `AbortController`.
- **Dispatch:** FIFO, never nested.
- **Notification:** subscribers hear once per microtask, through selectors with an equality check. A component re-renders only when its slice changed, and rows are `memo` with stable props.
- **Action log:** a ring buffer of the last 200 messages, dumped on any failure and attached to QA reports. A race found once becomes a replayed test.

**Drivers.**

| Driver | Owns | Takes from the model | Reports |
|---|---|---|---|
| `motion` | Every animation (WAAPI) and every inline `style` or CSS variable set from the model | numbered `Transition`s; layout variables | `motionSettled(id)` |
| `scroll` | Every programmatic scroll; anchoring while rows fold; `ScrollHold` | a scroll order (`reveal`, `toHour`, `keep`, `edge`) | `userScrolled(scroller)`, which hands scroll ownership to the user |
| `focus` | Focus and the caret: `focus({ preventScroll: true })`; CodeMirror focus | the field to focus | `focused`, `blurred` |
| `measure` | `ResizeObserver` on content boxes; text-width fits | which boxes to observe | `measured(sizes)`, held while a motion runs |
| `input` | Pointer, touch, wheel and keys, turned into messages. Frame-rate positions go straight to the `motion` driver (the transient channel), never through `update`. It calls `preventDefault` synchronously from the active machine. | the active machine (read synchronously) | gesture messages at discrete steps |
| `chrome` | Obsidian's body classes, `css-change`, the keyboard inset, the status bar room, toolbar placement, popout windows | — | `platform`, `theme`, `keyboard`, `toolbar` |
| `islands` | Obsidian `Menu` and `Modal`, `MarkdownRenderer`, `EmbeddedEditor` (CodeMirror): each a host node created once and never diffed | which island is open, with its model | the pick only after the close; edits |

## How the principles answer each part of the inventory

**State (P1).**
- The 45 duplicated facts each become one `Model` field or one selector over the core's answer; `traceability.md` names each.
- The view mode, place, filter and panel stay where the core keeps them (`FunnelView`, `ViewChoice`): the model holds the core's last answer and never copies it into a second field.
- The 565 locations fall into four kinds:
  - **model fields:** facts;
  - **selectors:** derived;
  - **driver-local:** a running `Animation`, an observer, a pointer id;
  - **gone:** caches of the DOM.

**Effects (P2).**
- The 819 call sites become commands, grouped in `traceability.md`: file reads, file writes, view changes, carry calls, undo, settings writes, calendars, Obsidian actions, notices, haptics.
- The eight ordering mechanisms disappear into the timeline:

  | Today | In the new layer |
  |---|---|
  | `act`, `changing`, `WriteQueue` | the file sequence |
  | `Picks` | the islands driver |
  | `afterEntry` | the entry machine holds a day or place switch until its write is read |
  | `turning`, `drawnLanding` | the day-swipe machine |
  | `ScreenParts`, arbiter deferral | P5: outside changes wait in the model |
  | `Reload` | coalescing in the effect runner |

- A write that fails is a `failed` message. The interaction that caused it ends with the old state and a notice command; a `StaleTaskError` or an undo `conflict` take the same path.
- The 180 event sources are the inputs of the runtime: vault, settings, clock, visibility, focus, poll, `css-change`, resize.

**Behaviour: inputs and gestures (P5).**
- The 203 inputs map onto the machines, each a pure reducer inside `update`:
  - **carry:** a card, subtasks, a section, the plus, a tree node, a selection;
  - **timeline:** hold, select, menu, drag, resize, new slot;
  - **ribbon swipe**, with trackpad glide and rubber band;
  - **day swipe**, with the peek;
  - **pinch**;
  - **divider** and **tree divider**;
  - **wheel drag**;
  - **naming:** a section, a project, a new project;
  - **entry:** quick bar, rename, subtask, section field;
  - **menu or sheet:** task, bulk, section, project, event, view, more, sources, the full card, search;
  - **select mode**.
- The arbitration rules A16.1–A16.17 become one table of which machine may start from which, plus explicit hand-offs (hold → drag; long press → pinch on a second finger; a finger down during a settle catches the strip).
- Escape and tap order are functions over the active machine.
- The peek is part of the day-swipe machine's state, a read of its own, so no stale-context rule ever drops it.

**Motions (P4).**
- All 84 motions stay, approved and code-only alike: behaviour does not change. Each becomes a `Transition` kind emitted by the message that causes it, executed by `motion` or `scroll`:
  - list slides, grow-in and fold-away after a user's write, in the lists it touched;
  - the carried card following the pointer;
  - subtasks or a section folding under a lift;
  - a list giving room at its end;
  - the drop flight and the cancel flight;
  - the ribbon between places;
  - the day slide;
  - the docked panel sliding with the columns;
  - the divider snap;
  - stacked heights;
  - menus rising and paging;
  - the quick bar riding the keyboard;
  - fades of overlays and blocks;
  - scroll glides;
  - auto-scroll at an edge.
- A transition runs once, by its number. A re-render never animates.
- `styles.css` keeps transitions only for colour, opacity and press feedback.

**Measurements (P3).**
- Of the 84, the ones only the browser can answer become `measure` messages:
  - text and card heights for the stacked rows and the stops;
  - the note block's height;
  - menu sizes for placement;
  - title widths for the whole-title copy;
  - the stage size;
  - the keyboard inset;
  - the toolbar position.
- Drop places are computed from the model, from measured row heights, at lift time and again after a read the carry asked for.
- The rest are derived from the model and the core's rules (`layoutWidths`, `layoutShareAt`, `stackedLists`, `RibbonColumns`, `swipeLanding`).
- Token reads (C8) are read once per theme change into the model.

**Screens (P1).** The 52 screen states are `view(model)` compositions:
- one layout component per `ViewChoice.layout`;
- the note block as the same view in a block host;
- the missing file, empty states and Done as model states.

## Decisions that follow from the principles

These answer every review finding on revisions 1–3, each from a principle rather than a patch:

1. **Our own write read back by the watcher (P2).** The vault watcher's read is queued in the file sequence like any other. It carries the number of the last write before it, and so the write's transition. The order of arrival cannot change what moves.
2. **Several writes in flight (P2, P5).** Each interaction holds its own outcome until the read with its write's number lands. Two drops show two held cards; nothing has to be merged.
3. **A new task's identity (P1).** A typed row keeps its key for life. The create returns the new task: an additive contract change, `create*` → `CreatedTask` as `createWithId` does today. The model then records `taskId → rowKey`. The field never remounts, and the iPhone keyboard stays.
4. **The ribbon (P3).** It is laid out per place from `RibbonColumns`. A swipe scrubs between the two places' layouts through the transient channel; the distance comes from the core rule, as `swipeLanding` expects.
5. **The day peek (P5).** It is part of the day-swipe machine. When the swipe lands, the new day is read; the peek is never promoted.
6. **Approved motions during a carry (P4).** They are transitions of the carry machine. "Nothing moves under the finger" means nothing moves that the carry didn't cause.
7. **Drop targets after a read the carry asked for (P3, P5).** The carry machine recomputes them from the model when that read lands.
8. **Pointer rate (P6).** Positions go from `input` to `motion` directly. Only discrete steps dispatch, and the render counter test proves it.
9. **Rows heights (P3).** Rows are observed per card. The heights are held while a motion runs and applied on `motionSettled`. The observed boxes never get their size from the result, so there is no loop.
10. **Islands (P6).** A menu's pick is delivered after its close, whatever order Obsidian fires them in.

## Guards

`tests/uiRules.test.ts` covers `obsidian/ui/next`:

- **Pure core:**
  - `model/`, `update/` and `view/` import no DOM global, `obsidian`, service or driver.
  - `view/` imports only `model/` selectors and `dispatch`.
- **Edges:**
  - Services are called only in `effects/`.
  - Timers and animation frames only in `effects/` and `drivers/`.
  - `.animate(`, `.style`, `setProperty`, scroll writes, `.focus(`, `getBoundingClientRect`, `offset*`, `client*` sizes, `getComputedStyle` and `ResizeObserver` only in their own driver. JSX `style` is not used.
- **Classes and data:** `classList` and `dataset` writes only in `chrome`. Classes are computed in JSX, and no code reads a class to decide.
- **Messages:** `Msg` is a union handled with `assertNever`.
- **Windows:** no bare `document` or `window`; everything goes through the node's own window (popouts).

`tests/styles.test.ts` also:
- scans `.tsx`;
- bans `transition` of `height`, `width`, `margin`, `padding`, `top`, `left` and `transform`;
- bans state classes or pseudo-elements that change a box's size.

`tests/uiFreeze.test.ts`: from step 0, `obsidian/ui` outside `next/` and the old rules of `styles.css` may only shrink.
- It checks totals per directory and fails on a new file.
- A growth needs an entry in `uiFreeze.allow.ts` with the commit and the reason.

| "Impossible by construction" | Enforced by |
|---|---|
| Reading the file before an earlier write, in any screen | the file-sequence tests; services only in `effects/` (old callers join in step 1, after which the rule covers the whole of `obsidian/ui`) |
| Moving something no cause declared | `Transition` tests; the frame recorder |
| Animating a context change, or one cause twice | transition-number tests |
| Re-rendering at pointer rate | the render-counter test |
| One fact in two places | the purity and class guards; the `Model` type is the only state; `traceability.md` reviewed |
| A redraw under the finger | the P5 tests: outside reads during each machine |
| Focus scrolling the screen | `focus` driver only, with `preventScroll` |

## Migration

The new layer grows inside the old screen and takes it over part by part. The plugin works after every step, and each step merges green. Releases go out at ★.

| Step | Moves | Replaces |
|---|---|---|
| 0 | Contract: `create*` returns `CreatedTask` (`backend`). The runtime, the effect runner, the drivers' skeletons, the host mount, the guards, the freeze, the e2e harness. | — |
| 1 | `Model`, `update`, the file sequence under the old drawing. Every service caller goes through commands (`CalendarScreen`, `QuickEntryController`, menus, full card, `main.ts`). Failures become messages. | `act`, `changing`, `Picks`, `WriteQueue`, `afterEntry`, the duplicated mode, place, panel and day fields. The old drawing reads the model through one adapter that compares references, so an unchanged read never redraws. |
| 2 | Lists, cards and section headers as components; list transitions; the entry machine. Merged, not released. | `KeyedRows`, FLIP, `EntryRows`, `is-redrawn` |
| 3 ★ | The carry machine with its transitions and computed drop places; tree lift; select mode. | `DragController`, `DragSession`, `ListDrop`, `GroupDrag`, `LongPress`, `BulkController` |
| 4 ★ | Ribbon, both swipes with the peek, pager, divider, wheel, the docked panel slide. | `RibbonLayout`, `ScreenTracks`, `Swipe`, `ScreenPager`, `DayPeek`, `Divider`, `ColumnSwitch`, `turning`, `drawnLanding` |
| 5 | Columns, Rows, By project, the projects panel and tree, the note block. | `ColumnsLayout`, `RowsLayout`, `ByProjectLayout`, `BlockHeight`, `projects/*` |
| 6 ★ | Timeline and pinch; menus and sheets as islands; full card; search. | `Timeline`, `PinchZoom`, `menu/*`, `full/*`, `search/*` |
| 7 ★ | Delete what was replaced; `CalendarScreen` gone; the freeze baselines reach zero. | — |

## Tests

1. **`update` (unit), including each machine:**
   - every row of decisions 55–87 and of the fix commits, replayed as message logs;
   - every arbitration rule A16;
   - the review findings: watcher-first reads; several writes in flight; a failed write; undo conflict; two screens; a stale read; an outside read during each machine; the peek.
2. **The runtime (unit):** sequence numbers; FIFO; coalescing; notification by selector.
3. **Views (happy-dom):** what each draws for a model; the render counter; the caret and composition surviving an update.
4. **Drivers (happy-dom):**
   - a transition runs once;
   - running motions are cancelled before the next one measures;
   - scroll yields to the user;
   - the island order.
5. **End to end (`scripts/e2e/`, CDP against a test Obsidian with a copy of Max's real file):**
   - **Old against new:** the old master and the branch run in turn on twin vaults, with a frozen clock, fixture calendars and the network stubbed. Screenshots are diffed per matrix state, at most 1 px per region, with masks listed.
   - **Frame recorder:** every keyed row's box, relative to its list, and the layout parts, every frame. A row moving without a transition fails, as does overshoot, a rest more than 0.5 px off, gaps or overlaps, or a swipe landing two places away.
   - **Budget:** under 8 ms of script per frame with 300 tasks at 4× CPU, and no long task over 16 ms.
   - **Coverage:** each of the 203 inputs has a case, in modes × desktop and phone view × light and dark.
6. **Max's phone checklist at each ★,** under 5 minutes, for what emulation cannot show: momentum scroll, the rubber band, the real keyboard, a lost lift. Anything found becomes a case above.

## Done when

- `traceability.md` maps every inventory row and the reviewer finds none unmapped.
- Every guard is green, and every row of the "impossible" table has its test.
- The e2e matrix passes old against new, the frame budget holds, an independent QA pass on a copy of Max's real file finds no defect, and the phone checklist passes at every ★.
- `CalendarScreen` is gone, and `docs/plugin/` is unchanged.

## How it is built

- `backend` makes the contract change in step 0. Each later step is one `frontend-obsidian` agent; the lead checks the diff, the tests and the screens.
- After every step a fresh reviewer gets the diff, the principles and the traceability rows of that step. It is told to find where the code breaks a principle, not to list taste.
- After steps 3–7 a fresh QA agent is told to break it on the e2e matrix.
- A finding is answered by naming the principle or the inventory row that let it through and fixing that, never by adding a one-off rule.
