# Plugin UI refactor: one state, one queue, motion by cause, layout from rules

Issue: kudrmax/obsidian-task-tracker#41 (takes in #40). Branch `ui-refactor`. Revision 3, after four adversarial reviews: architecture; the bug history of decisions 55–87 and 34 fix commits; Obsidian, iPhone and migration risk; a fresh review of revision 2. Their findings are folded in below. The appendices list what each past defect maps to.

## Why

`obsidian/ui` (141 files, 17,914 lines, 106 classes) keeps breaking in layout, motion and ordering. Decisions 55–87 of `2026-11-12-projects-one-view-design.md` are almost all patches of such defects. The causes are structural (the issue has them with file:line):

- one fact lives in several places;
- there are eight ordering mechanisms;
- every read redraws everything and guesses what changed;
- motion is derived from geometry over every row;
- layout comes from live measurements taken while animations run;
- the 1,688-line `CalendarScreen` has no test.

**Goal:** each class of defect that hurt is either impossible by construction (a mechanism plus a guard test) or caught by a named test before a release. **What Max sees does not change.** The core, the contracts, the door, the iPhone app and the design stay.

## What stays (the bar)

- Every behaviour in `docs/plugin/` and every approved board, pixel for pixel, desktop and phone, light and dark. Appendix A lists the behaviours most at risk; each gets an e2e case.
- The guarded behaviours: `rules.swipeLanding` (one swipe, one place) and Inbox and Soon split in half. Their tests are not touched.
- `core/`, `settings.ts` and the door stay.
- `contracts.ts` changes once, additively: every create returns the new task (`CreatedTask`, as `createWithId` does today: `createInList`, `createInSoon`, `createAtTime`, `create`, `createSubtask`). It is the `backend` agent's step 0; the iPhone app is not affected.
- The guards `architecture.test.ts`, `uiDecides.test.ts` and `styles.test.ts` only get stricter.
- The motions Max approved stay as they are:
  - a lifted card's subtasks fold under it;
  - a lifted section folds;
  - a list gives room at its end;
  - the docked panel slides with the columns;
  - the divider snaps;
  - the quick bar rides the keyboard;
  - a dropped card flies to its place, a cancelled one back.

## Decision 1: Preact 11 with TSX

Checked on a prototype (`obsidian/ui/next`, `tests/ui/next/prototype.test.tsx`):

- **Preact:**
  - TSX is checked by the project's own `tsc` (TypeScript 7) and bundled by esbuild without a plugin.
  - Tests run in vitest with happy-dom, and `architecture.test.ts` and `uiDecides.test.ts` already read `.tsx`.
  - About 4 KB in the bundle.
- **Svelte 5, rejected:**
  - `svelte-check` declares `typescript ^5 || ^6`. `.svelte` files would sit outside `tsc --noEmit` and outside the guards.
  - `animate:flip` moves by geometry, the very rule being replaced.
- **React:** the same model, about 10× the size.

No state library: the store is ours, about 100 lines, fully tested.

## Architecture

```
input adapter ──► action ──► reduce(state, action) ──► state ──► selectors ──► components (Preact)
   │ (pointer at frame rate)        │
   └──► transient channel           └──► effects ──► lanes (file: plugin-wide, serial · network: latest wins) ──► result actions
        (refs → CSS variables)
```

### 1. The store

- **Actions:** one discriminated union, handled exhaustively (`assertNever`). An unknown action does not compile.
- **Dispatch:** FIFO. An action dispatched while another is being reduced, or from an effect, is queued, never nested.
- **Notification:** subscribers are notified once per microtask, through **selectors with an equality check** (`useSelector`). A component re-renders only when its slice changed.
- **Testing:** `idle()` settles only once every lane is empty, re-checking after each piece of work.
- **Action log:** the last 200 actions are kept in a ring buffer. A failure dumps it to the console. QA reports attach it, and a race QA finds becomes a replayed reducer test.
- **The reducer is pure.** No services, `obsidian` or DOM imports in `next/state/`; `architecture.test.ts` guards it. The clock and new ids come in on actions.

### 2. One screen state

`ScreenState` is the only place each fact lives:

- **The day:** the selected date, today, the boundary.
- **The view:** the core's `FunnelView`/`ViewChoice` as last read. Mode, place, filter, panel and subprojects are never copied into fields or classes.
- **The lists:** what `DayData` reads today, with each list's `Cause` (§5).
- **A peek context:** the neighbouring day's lists, read while a day swipe is under way (`DayPeek`'s read). It is its own context, never dropped as stale while that swipe lives.
- **Events:** the events and their sources' status.
- **Pending writes and patches:** the writes in flight with their optimistic patches (§3).
- **Gestures:** one machine at most is active (§6), and its discrete state lives here.
- **Text entry:** the entry machine (§7).
- **Scroll:** a `ScrollOwner` per scroller (§8).
- **Chrome:** platform (mobile or desktop), theme, keyboard inset, popout window. The chrome adapter fills it from Obsidian's body classes, `css-change` and the keyboard. Nothing else reads Obsidian's classes.
- **Sizes:** stage and content sizes, from `ResizeObserver` actions.
- **Interaction:** selection, the open island (menu, modal, full card, search), zoom.

CSS classes only reflect state (in JSX). Only the chrome adapter writes classes outside JSX, on `body` and `contentEl`, as `styles.test.ts` expects today.

### 3. Work: lanes, sequence, optimism, failures

- **The file lane is one per plugin, not per screen.** The leaf and every note block (`ProjectBlocks.ts:32`) share it, so a read in any screen sees every write queued before it in any screen. Strictly serial.
  - It carries: writes, reads of the view and lists, view changes, carry calls, undo and redo.
  - It replaces: `act`, `changing`, `turning`, `Picks.settled`, `afterEntry`, `drawnLanding`, the `ScreenParts` deferrals, the quick bar's `WriteQueue`, and the 41 direct `deps.tasks.*` calls.
- **The network lane:** calendar events, latest wins (`AbortController`). It never holds up a write.
- **Sequence, not file hashes.** Every job in the file lane gets a number when it is queued.
  - **Reads:** a read, including the one the vault watcher queues after our own write (`VaultPathWatcher.ts:21`), carries `after`: the number of the last write that ran before it. A read's result also depends on project notes, the stored view, settings and the day, so reads are never dropped as duplicates. `Reload` only coalesces reads that are still waiting in the queue.
  - **Causes:** a read with `after` greater than what the screen last drew takes the union of the causes of the writes in between (their lists). It does not matter whether it came from the write's own request or from the watcher.
  - **Several screens:** after a write, every screen queues its read in the same lane (coalesced). A change made in the leaf also shows in a note block, and the other way round.
- **Optimistic patches.**
  - Some writes would otherwise show the old state until the reread: a drop (D84), a rename (dd934060), a typed line becoming a card (D86). Such a write carries a patch, a pure function over the read lists.
  - The shown lists are `fold(patches of writes not yet read back, last read)`, recomputed for every read. With several writes in flight, every unconfirmed patch is re-applied over each read.
  - A patch is dropped once a read with `after ≥` its write's number lands.
  - Tests: three writes in flight with their reads landing; a toggle then undo producing the same text.
- **Failures.**
  - Every effect ends in `done` or `failed(error)`. `failed` removes the patch, queues a read, and asks the notice effect to show `failureText`; the reducer never shows anything itself.
  - A `StaleTaskError` and undo's `conflict` take this path.
- **Context commits are atomic.** A change of filter, mode or day commits the view and its lists in one reduce. The new title never shows over the old lists (D55, D56).
- **Stale results.** A read carries the context it was asked for. A result whose context is neither the state's nor the live peek's is dropped. When a day swipe lands, the new day is read again: the peek is never promoted to the day's lists.
- **Reads during a gesture.**
  - Reads the gesture asks for itself apply at once (`carryAt`, the pause over a project, the peek: D65, D85). The carry then takes a `retarget` step: it snapshots the drop targets again after that drawing, before the next pointer frame.
  - Outside reads (Sync, an agent edit) wait in `pending` and apply in the reduce that ends the gesture.
- **Coalescing:** `Reload`'s coalescing of vault events stays, as part of the read effect.
- **Timers:** effects never wait on an animation frame. Hidden pages get none, as `ScreenPager`'s `FRAME_SLACK_MS` already handles.

### 4. Drawing and performance

- Every part becomes a Preact component of the state. `ModeLayout` stays as the boundary: one component per `ViewChoice.layout`.
- Rows are keyed (task id, section id, entry draft key) and wrapped in `memo`, with stable props: no inline closures per row.
- **Islands Preact never diffs:**
  - `EmbeddedEditor` (CodeMirror), `MarkdownRenderer` output, Obsidian's `Menu` and `Modal`.
  - Each is a component that owns one host node, created once. Re-creating it would drop the iOS keyboard.
  - The state opens and closes an island. The island adapter buffers a pick and dispatches it only after it has dispatched the close, whatever order Obsidian fires them in. Picks are actions; only the writes they cause enter the lane (decision 81 without `Picks`).
  - CodeMirror's `focus()` takes no options, so the editor island is exempt from the `preventScroll` rule and reveals itself through `ScrollMotion`.
- **Popouts:** every document, window, timer, frame and observer comes from the node's `ownerDocument.defaultView` (as `BlockHeight.ts:17-37` does). A guard bans bare `document` and `window` in `next/`.
- **Budget:** a frame under 8 ms of script with 300 tasks at 4× CPU throttle, and no long task over 16 ms. The e2e harness measures it on every milestone.
- **Render counter:** in tests, a counter of component renders per dispatch. A test drives 120 pointer moves of a carry and a swipe and asserts zero list renders.

### 5. Motion: few owners, each by cause

Each list's `Cause` carries a monotonically increasing `rev`. A component animates a cause **once**, when its `rev` is new. Any later re-render (a keystroke, a resize, a selection) never animates.

```
Cause = write{ rev, lists, entered, left }   // a user's write: only the lists it touched move
      | context{ rev }                       // another filter, mode, day, the first read: drawn in place
      | still{ rev }                         // an outside read: drawn in place
```

When one reduce sees both a context change and a write, context wins.

**Motion owners.** These are the only code allowed to animate or to write `style`; `uiRules.test.ts` lists them and fails on any other.

| Owner | What it moves | Driven by |
|---|---|---|
| `ListMotion` (`KeyedList`) | rows sliding, growing in, folding away, in lists a `write` touched | `Cause` |
| `CarryMotion` | the carried card following the pointer; its subtasks or section folding under it; the list giving room at its end; the drop flight; the cancel flight | carry machine + transient channel |
| `LayoutMotion` | the docked panel sliding with the columns, the divider snap, the ribbon between places, rows' stacked heights | layout cause (panel, divider, place) from state |
| `ScrollMotion` | every programmatic scroll: reveal a field, scroll to the hour, auto-scroll at an edge, `ScrollHold` | the scroll owner (§8) |
| `KeyboardMotion` | the quick bar riding the keyboard | chrome keyboard inset |

`ListMotion` rules:
- **Measuring:** running slides are cancelled before the snapshot (as `Motion.ts:160-164` does). Positions are taken relative to the scroller, and only for the rows in view, and only when the cause lets the list move.
- **Focus:** a row holding focus is never moved or reordered; the others are put around it (today's `KeyedRows` rule).
- **Keys never change.** A row typed into the entry keeps its draft key for life. When the create returns the task's `CreatedTask`, the state records an alias `taskId → rowKey`. `ListMotion` and the focus rule resolve ids through it, so the field never remounts and the iPhone keyboard stays.
- **Enter:** a row grows in.
- **Leave:** a row stays until its fold ends and never takes part in measuring.
- **Cross-list:** a task moved from one list to another leaves one list and enters the other. With a carry, `CarryMotion` flies the card itself.

**CSS transitions** are only for colour, opacity and press feedback. `styles.test.ts` fails on a `transition` of `height`, `width`, `margin`, `padding`, `top`, `left` or `transform` outside the motion owners' classes, and on a state class or pseudo-element that changes a box's size during a carry (the `.is-dragging ::after` jump, A5).

### 6. Gestures: machines with a transient channel

- **One machine at most is active.** `GestureArbiter`'s holder becomes the active machine.
  - It is readable synchronously, so `touchmove` can call `preventDefault` before Obsidian sees the touch.
  - Hand-off between machines keeps `pass`: a hold that becomes a drag, a long press that a second finger turns into a pinch.
- **The machines**, each a pure reducer with its own tests:
  - **Carry:** `idle → pressed → lifted(snapshot of drop targets) → over(target) → dropping → idle`, or `cancelled`. It drives the core's carry session. A card, a section, the plus, a tree node or a selection can be carried.
  - **Ribbon swipe:** `idle → tracking → settling(landing) → idle`. A finger or a tap during settling catches the strip where it is. Arrow turns queue behind a settle.
  - **Day swipe**, with the peek context.
  - **Pinch zoom:** around the finger's anchor.
  - **Divider drag:** snaps to the centre with haptics, and the width is saved on release.
  - **Column-switch drag.**
  - **Timeline:** hold, then select, menu and drag; resize by the dots; new slot on a long tap.
  - **Inline naming.**
  - **Tree lift.**
  - **Edge hold:** auto-scroll after a dwell.
- **Only discrete steps go through the store:** lifted, over another target, dropped, cancelled, a settle's landing, a zoom commit.
  - The pointer position, the swipe offset, the divider width and the pinch scale go through the **transient channel**: the input adapter calls the owner's method once per frame (`CarryMotion.follow`, `LayoutMotion.scrub`, `LayoutMotion.divider`, `ZoomMotion.scale`), and only the owner writes.
  - Nothing at pointer rate re-renders Preact.
- **Drop targets** are snapshotted on lift; nothing measures during the carry.
- **A layout without a swipe track attaches no wheel or touch listener for swiping.** This prevents the sideways jerk in All columns (A1, D63).

### 7. Text entry

- **The machine:** `idle → typing(place, draftKey) → writing(draftKey) → landed(taskId) → idle`.
- **One row:** the create returns the new task's id (the contract change above). The row keeps its draft key, aliased to that id (§5). The field, the waiting text and the card are one keyed row (D86). Nothing flies in from a corner (5cca0ad9).
- **The machine owns:**
  - the room under the field (D57, D69);
  - when the list grows (D59);
  - the keyboard hand-off between fields;
  - when the field is released.
- **Fields are uncontrolled while focused.** The text lives in the field, never re-set by a render. So the caret, IME composition (`isComposing`) and the browser's own undo history (`fieldUndo.ts`) survive, and the draft is dispatched on commit and blur.

### 8. Scroll

- **Owner:** each scroller has `ScrollOwner = user | follow(id) | settle`.
  - A programmatic scroll is one `ScrollMotion` effect.
  - Any wheel or touch from the user switches the owner to `user`. A typed field is followed only until a hand scrolls (D78), and a smooth scroll yields to a finger (2332d99f, 997ab15d).
- **Focus** always uses `focus({ preventScroll: true })` followed by an explicit reveal. Focusing a field in an unseen column never slides the screen (1d4261f8).
- **Anchor:** `ListMotion` keeps the anchor row's offset while rows above it fold (9920b7e9). `ScrollHold` stops a shrinking list's clamp-jump on iOS.
- **Guard:** `uiRules` bans `.focus(` without `preventScroll`, and any write to `scrollTop` or `scrollTo` outside `ScrollMotion`.

### 9. Layout

- **The ribbon is laid out per place**, from the core's `RibbonColumns` widths (Inbox and Soon half and half; Today by the divider) as CSS variables.
  - A swipe interpolates between the two places' layouts, the way `StripTrack` scrubs today (`ScreenTracks.ts:133-167`). `LayoutMotion.scrub(fraction)`, called by the swipe machine each frame, interpolates `RibbonColumns(from)` and `RibbonColumns(to)`. The values come from state, not from `getComputedStyle`. A test checks that Inbox and Soon stay half and half at every fraction.
  - The swipe distance is the one the core rule defines, and `swipeLanding` gets that same distance.
- **Columns and By project:** CSS Grid with widths from `layoutWidths`/`layoutShareAt`.
- **Rows:**
  - `stackedLists` needs each list's wanted height and each card's bottom (`core/application/stackedRows.ts:42-54`).
  - **Measuring:** every row is observed, and the stops are computed from the reported sizes. The flow is `ResizeObserver` → action → core rule → `LayoutMotion` variable.
  - **No feedback:** the observed boxes never get their size from the result, so the loop cannot oscillate; a test proves it.
  - **During motion:** the latest measurement per list is kept while a motion runs and applied on `motionSettled`. An entry's growth ends a motion like any other.
- **Note block:** its height is measured the same way (`BlockHeight` keeps its rule) and is never refit during a carry.
- **Small layout logic left in the UI** moves into pure tested functions under `next/layout/`: the docked panel giving way on a narrow view (D79), the menu's height (6ce87a3c), the narrow arrows (D74).
- **Platform quirks each get an adapter** with a test of its output: Obsidian's toolbar position (80ae0259), Live Preview stretching the block (D80), the keyboard inset, the status-bar room.

### 10. Guards: rot stays out by test

`tests/uiRules.test.ts` covers `obsidian/ui/next`:

- **Calls and timers:**
  - No `TaskService`, `DayService` or other service call outside the effect runner.
  - No `setTimeout`, `setInterval` or `requestAnimationFrame` outside the effect runner, the input adapter and the motion owners.
- **Measuring and animation:**
  - No `getBoundingClientRect`, `offsetTop/Left/Width/Height`, `clientWidth/Height` or `getComputedStyle` outside the motion owners, the carry snapshot and the `ResizeObserver` adapter. Pointer-event fields (`clientX`, `clientY`) are read only in the input adapter.
  - No `.animate(` and no `.style` or `setProperty` writes outside the motion owners. Every CSS variable set from state is written by `LayoutMotion` (or `CssVars` under it). JSX `style={…}` is banned outright.
- **DOM state:**
  - No `classList` or `dataset` writes outside the chrome adapter.
  - No reads of classes to decide anything.
- **Focus and scroll:** no `.focus(` without `preventScroll`, and no `scrollTop` or `scrollTo` writes outside `ScrollMotion`.
- **Globals:** no bare `document` or `window`.
- **Boundaries:**
  - Components import selectors and `dispatch` only, never `Store` or services.
  - `next/state/` imports no DOM, `obsidian` or services; `architecture.test.ts` guards this.
- **Old code is frozen:** from step 0, `obsidian/ui` outside `next/` and the old classes' rules in `styles.css` may only shrink.
  - The test holds each directory's total lines at or below its baseline, and fails on a new file outside `next/`.
  - A growth is admitted only by an entry in `tests/uiFreeze.allow.ts` naming the commit and the reason: the steps' adapters, a defect fix on master.

`tests/styles.test.ts` grows:
- The code scanner reads `.tsx` too, so variables set from TSX count.
- The transition and box-size rules of §5.

## Migration

The new layer grows inside the old screen (strangler). Each step merges into master green and checked. **Releases go out at milestones** (★), so Max never runs a half-moved part.

| Step | What moves | Replaces | Notes |
|---|---|---|---|
| 0 | Contract: creates return `CreatedTask` (`backend`). `Store` (lanes, sequence numbers, FIFO, selectors, action log), effect runner, input adapter, chrome adapter, Preact mount, guards, e2e harness | — | Old files frozen from here. |
| 1 | `ScreenState`, reducer, the plugin-wide file lane under the existing drawing; patches and failures. Every service caller joins the lane: `CalendarScreen`, `QuickEntryController`, menus, full card, `main.ts` commands | `act`, `changing`, `Picks`, `afterEntry`, the duplicated mode, panel and place fields | The old drawing gets the state through an adapter that compares references, so an unchanged read never redraws (keeps what `DayData`'s diff gives). `turning` and `drawnLanding` stay until step 4. A test fails on any `TaskService` call outside the effect runner, old code included, from the end of this step. |
| 2 | `TaskList`, `TaskCard`, section headers with `ListMotion`; the text-entry machine and quick bar | `KeyedRows`, FLIP, `EntryRows`, `is-redrawn`, `WriteQueue` | Merged, not released: the old drag would toggle classes on nodes Preact owns. `ListMotion` stays off in Rows until step 5, so old `RowsLayout` never measures a folding row. |
| 3 ★ | Carry machine, `CarryMotion`, drop targets, edge hold, tree lift, bulk carry | `DragController`, `DragSession`, `ListDrop` hit tests, `GroupDrag`, `LongPress` WeakMap | First release with the new lists: cards and carry go out together. |
| 4 ★ | Ribbon, both swipes, day peek, pager, divider, column switch, wheel, `LayoutMotion` | `RibbonLayout`, `StripTrack`, `Swipe`, `ScreenPager`, `DayPeek`, `turning`, `drawnLanding` | One step: they can't ship apart. |
| 5 | Columns, Rows, By project, the projects panel and tree, the note block | `ColumnsLayout`, `RowsLayout`, `ByProjectLayout`, `BlockHeight` measuring, `projects/*` | |
| 6 ★ | Timeline and pinch, menus and islands, full card, search, bulk menu, settings effects | `Timeline`, `TaskMenu`/`MenuPanel` DOM, `FullScreen`, `SearchWindow`, `BulkController` | |
| 7 ★ | Delete everything replaced; `CalendarScreen` gone | — | The freeze test's baselines reach zero. |

## Tests

**Reducer and lanes (unit).** Every race in Appendix B is a test, replayed as an action log. Also:
- delete, then switch project;
- a pick during a menu's close;
- carry, cancel, switch mode;
- our own write's watcher read landing before the write's read, with rows still sliding;
- a stale context's read dropped;
- an outside read during a carry, applied at the drop;
- a failed write rolled back with a notice;
- undo conflict;
- two screens sharing the file lane.

**Components (happy-dom):**
- what each component draws for a state;
- motion once per `rev`;
- no motion on re-render;
- the focused row never moved;
- caret and composition survive a store update.

**Machines (unit):** every transition of every gesture.

**End to end (`scripts/e2e/`, CDP against the test Obsidian on port 9333, a copy of Max's real file):**
1. **Old against new:** the old master and the branch run in turn, each on its own copy of the same vault, since both are one plugin id.
   - The clock is frozen, the calendars come from fixtures and the network is stubbed.
   - Screenshots are diffed per matrix state, at most 1 px per region, with the masks listed in the harness (the now line, the caret).
   - This is the pixel-for-pixel bar.
2. **Frame recorder:** a recorder logs every keyed row's box, the carried card, the ribbon parts and the wheel on every frame. A run fails on:
   - a row moving outside the write's lists, measured relative to its own list's box (layout motion is recorded and checked on its own);
   - overshoot or non-monotonic travel;
   - rest more than 0.5 px off;
   - gaps or overlaps beyond the gap token;
   - a swipe landing two places away;
   - a long task over 16 ms at 4× throttle with 200+ tasks.
3. **Input:** CDP touch events (tap, long press, carry to an edge with a dwell, two-finger pinch) and trackpad wheel streams with their glide.
4. **Matrix:** modes × gestures × transitions × desktop and phone view × light and dark. It runs before every merge.

**What automation cannot see.** `emulateMobile` is not the iPhone's WebKit: there is no momentum scroll, rubber band, real keyboard or lost-lift. At each ★ release Max gets a short checklist of those cases to run on his phone (under 5 minutes). Anything he finds becomes an e2e case or a machine test.

## Done when

- **Impossible by construction, each with its guard or test:**

  | Claim | Enforced by |
  |---|---|
  | Reading the file before an earlier write, in any screen | the lane tests; the no-service-call-outside-the-runner rule (from step 1) |
  | Moving a row no write touched | `ListMotion` tests; the frame recorder |
  | Animating a change of context; animating one cause twice | `rev` tests |
  | Re-rendering at pointer rate | the render counter test |
  | One fact in two places | no `classList` or `dataset` writes, no state fields in components (guard); `ScreenState` is the only store, and the view itself stays in the core |
  | A box changing size from a CSS state class during a carry | `styles.test.ts` box-size rule; the frame recorder |
  | Focus scrolling the screen | the `preventScroll` guard |

- **Checked by Max on the phone, not by automation:** a code scroll yielding to a finger with momentum, the rubber band, the real keyboard, a lost lift.
- `CalendarScreen` is gone. The state, the effects, the machines and the components are separate and tested.
- The e2e matrix passes, old against new, pixel for pixel. The frame budget holds on the phone view. An independent QA pass on a copy of Max's real file finds no defect. Max's phone checklist passes at every ★.
- `docs/plugin/` is unchanged. Any behaviour that changed is a defect.

## How it is built

- The `backend` agent makes the step 0 contract change. After that only `obsidian/` and `tests/` change, so one `frontend-obsidian` agent per step. The lead checks each step's diff, tests and screens before the next.
- Steps 1–6 each end with a fresh QA agent told to break it, running the e2e matrix and the Appendix A list.
- A rule found missing from the core goes to Max first as a contract change.

## Appendix A: behaviours most at risk (each gets an e2e case)

1. The day swipe with the next day's peek; the header names whichever day is nearer.
2. The rubber-band give at the row's ends (`edgeGive`).
3. Done reached only through search.
4. A trackpad two-finger swipe, glide included.
5. A tap during a settle frees the screen; a finger catches a moving strip where it is.
6. Arrow turns queue behind a running settle.
7. The wheel turns with the swipe.
8. The divider snaps to the centre with haptics; the width is saved on release.
9. Pinch around the anchor; whole-day fit; the zoom is remembered.
10. Auto-scroll at list edges after a dwell; its bottom edge is the switch row.
11. A second finger cancels a long press and turns it into a pinch.
12. Mouse: a drag after a few pixels; a long click opens the menu; right-click; double-click renames.
13. Timeline: hold, then select and menu, then move to drag; resize by the dots; a long tap on empty time makes a slot.
14. Carrying with the plus; section carry; tree lift; subtasks fold under a lifted card; a list gives room at its end.
15. Escape cancels a carry; the cancelled card flies back; the dropped card flies to where it landed.
16. Bulk selection; Cmd+Z, Cmd+Shift+Z and Cmd+F scoped to the tab or the block.
17. The quick bar rides the keyboard; the list glides to the new field.
18. Scroll fades never lie on a whole card; `ScrollHold`.
19. The now line ticks every minute, deferred while a gesture holds or the view is hidden.
20. The poll wakes on focus and visibility; events are recoloured on a theme change.
21. The note block's height is measured, never refit during a carry.
22. Status-bar room; Obsidian's toolbar hidden while typing.
23. Touches never reach Obsidian's own gestures.
24. Popout windows.
25. The docked panel slides with the columns; it gives way on a narrow view.

## Appendix B: past defects and what stops them

| Defect | Stopped by |
|---|---|
| A3 cards fly in on a project switch | `context` cause, drawn in place (§5) |
| D58 hidden ribbon outside Columns | place lives once in state (§2) |
| D66 debris after a failed drag | carry machine `cancelled` (§6) |
| D75 `endCarry` before the drop's write; D77 delete, then project; D81 pick during the menu close; 6f66a071 | one file lane; islands' close and pick as ordered actions (§3, §4) |
| 50cf7279 rows not kept per id | keyed `memo` rows (§4) |
| d53657d2, c89c7ba8 tap during a settle | swipe machine `settling` (§6) |
| D55, D56 title over the old lists; empty column first | atomic context commit (§3) |
| D84 drop flashes back; dd934060 pending rename not shown; D86 field, waiting text and card | optimistic patches confirmed by sequence; the entry draft key (§3, §7) |
| D65, D85 a node opened mid-carry, its list read in the pause | gesture's own reads apply at once (§3) |
| D64 panel slides with the columns; 28080aba a day's swipe moves only the day | `LayoutMotion` (§5) |
| A1, D63 sideways jerk in All columns | no swipe listener without a track (§6) |
| A5, D62 rows jump on lift; D61 context animated by CSS | `styles.test.ts` transition and box-size rules (§5) |
| A2, D68, D71, 61682604, cfbb4575 fades over cards, foot fade, fades growing | e2e fade-over-card check; fades from state (§9, Tests) |
| A4, D60, D67, D76 gaps; rows measured during fades and ghosts | content-box `ResizeObserver`, no measuring during motion (§9) |
| D57, D59, D69 typing room, list growth, keyboard | entry machine (§7) |
| D78, 2332d99f, 997ab15d, 1d4261f8, 9920b7e9 scroll and focus | scroll owner, `preventScroll`, anchor (§8) |
| D70 edge auto-scroll after a dwell | edge-hold machine (§6) |
| 43889a14, 5cca0ad9 drag flicker; line flying from the corner | `CarryMotion`; draft key (§5, §7) |
| D79, 6ce87a3c, D74 panel on narrow, menu height, arrows | pure layout functions, tested (§9) |
| D80, 80ae0259 Live Preview stretch, toolbar position | platform adapters, tested (§9) |
| D82 drop room in the note block | `CarryMotion` room rule + e2e (§5) |
