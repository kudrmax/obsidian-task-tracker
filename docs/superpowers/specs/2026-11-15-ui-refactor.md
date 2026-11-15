# Plugin UI refactor: the plugin becomes a host of the core's door

Issue: kudrmax/obsidian-task-tracker#41 (takes in #40). Branch `ui-refactor`. Revision 10.

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
| 7 | 158 (5 classes) | 3 (settings persistence, the pending log, per-call cost) |
| 8 | 133 (4 classes) | 2 (the pending log's references and rollback; the dispatch loop) |
| 10 | 14 (1 class, R23, closed below) | 0 |
| 9 | 213 (2 classes: "the core" vs the pure rules; what views a screen needs) | 0: "ready to build from"; five wording fixes, made in revision 10 |

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
- **The dispatch loop.** One loop, the same for every message:
  1. `update` returns the next model and its commands.
  2. The runtime runs the door commands at once, synchronously, and feeds each answer back as the next message, until the chain is drained.
  3. **What each screen needs.** Each screen has a pure selector, `needs(model)`. It lists the view answers that screen needs: its context's view, the neighbour day or place under a swipe, the task of an open full card or menu, the search's results. The runtime computes one answer per need from the replica, memoised by (replica, minute, need), and hands them to the model as data (`viewsChanged`).
     - Any change of the replica recomputes every mounted need in the same loop, so an open card follows Sync at once.
     - Selectors never call the door. Here "the core" means `callDoor`, the replica and the view answers.
     - The core's **pure rules** (`rules.*`: `snap`, `swipeLanding`, `layoutWidths`, `stackedLists`, `layoutShareAt`…) are plain functions. They may be imported by `update/`, selectors and `motion`, since they are needed per frame and per pointer move.
  4. Render, then the drivers, then focus last.

  The chain has a bound on its depth; hitting it is a failure with the action log dumped.

  A user's event runs the whole loop inside the event, which is what lets the iPhone keyboard rise on a typing pick and makes a write's outcome visible in the same frame. Messages from elsewhere run it once per microtask. Asynchronous work (persistence, the network, timers) is a command whose outcome comes back later as a message.
- **Every wait on something the user sees has a bound,** and the bound is a message.

**P3. The core is a pure, synchronous function over a replica the runtime holds.**
- **The replica:** the plugin runtime holds one `DoorContext` (`PhoneCalls.ts:85`): the tasks text, the settings text, the undo history, the projects-screen state, the id state, the calendars' texts and the project notes. Every screen shares it.
- **Calls:** every core call (a view, a write, a carry step, a session step, an undo, a settings change) is `callDoor(method, args, replica)`, in-process, without JSON, the same door the iPhone app calls.
  - A call is synchronous and runs inside the message that asks for it, in message order.
  - Its answer gives the result and the new parts of the replica: tasks, settings, history, projects screen, ids.
- **Consequences:**
  - **Views are runtime computations over the replica,** memoised by its identity and delivered to the model as data (`viewsChanged`, P2). Selectors read only the model. Another filter, mode, day or place is drawn from the same replica in the same message, so a frame can never mix generations or contexts. There is nothing to wait for and nothing to read ahead.
  - **A write is visible at once,** with its real outcome: where the card landed, the new task's id. There is no preview to compute and no optimistic layer.
  - **Tidying the file** (today a hidden write inside a read) is the answer's new `tasks` text with `step: false`. It is persisted like any write, and the read stays pure.
  - **Ids have one lineage,** carried in the replica.
- **The replica's parts and where each is kept:**

  | Part | Kept in | Written by | Outside writers |
  |---|---|---|---|
  | **Tasks text** | the vault file at `tasksFile` | a serial queue. Each write runs inside `vault.process(fn)`, and `fn` checks that the current text is the base. If not, it returns the text unchanged and the runtime replays. A missing file is created through the door's `createFile`. | Sync, agents, other devices, the old screen during the migration |
  | **Synced settings** | `data.json` | a per-key patch: the runtime compares the answer's settings with what it handed in and calls `PluginSettings.update(patch)`, which merges over a fresh read | All of them: Sync reloading `data.json`, `GoogleAuth`'s refresh token, the place hand-over, the calendars' migration, the old screen. The replica's settings are `PluginSettings.get()`, refreshed on its `onChange`. |
  | **Device values** (`DEVICE_KEYS`: list share, zoom, tree width…) | device storage, never `data.json` | the same per-key patch, routed by `PluginSettings.partition` | — |
  | **Projects screen** | device storage | on every change | The old leaf during the migration. One shared `LocalProjectsScreenStore` instance gains a change signal, and the replica follows it. |
  | **Undo history, id state** | memory, as today | the answers | — |
  | **Calendar texts** | their files, read through the adapters | the network lane | the Scriptable and Shortcuts exports |
- **The pending log.** It holds every call that changed the tasks text and is not yet persisted. Each entry records:
  - its method and arguments, with every task referred to by **id**, never by a stored key;
  - the **inputs it read** besides the text: its own `nowMs`, and the projects screen as it stood when it ran;
  - the ids its creates produced.

  The log is based on the persisted text with the undo history and id state that went with it.
- **Outside changes.** When the file's text differs from the last text persisted or read:
  - It becomes the new base, with the id state the core settles on reading it.
  - The log is replayed through the door, in order. Each entry runs over the new text with its own recorded inputs. Before it runs, every id in its arguments is mapped through the ids that earlier replayed creates produced, then resolved to that task's current key (`tasks.keyOf(id)`, added to the door if missing).
  - **Only the text, the undo history and the ids are taken from the replay.** Every other part of the replica (projects screen, carry, settings) stays as it is now, so a pick or a carry made after the base is never rolled back.
  - **Ids after a replay:**
    - The replay returns one map from old id to new id. It is applied to the whole model in one message: row keys, pins, the selection, an open card or menu, an entry's target.
    - Ids are never reused within a runtime's life. The replay continues from the current replica's id counter, so a line Sync added can never take an id a pin still holds.
  - **Inputs on replay:** each entry runs with its own recorded `nowMs` and projects screen (what the user saw), but with the **current** settings, which shape the file: section names, the day start.
  - **The tidy on a new base** runs before the replay and is not an entry of the log.
  - **Reconciliation:** after any replay that remapped an id or dropped a call, the runtime calls `tasks.reconcile(idMap, dropped)` in the same message as the model's remap. This is a door method `backend` adds in slice 1. It maps the carry's keys and cards through the id map, and reverses a dropped call's effect on the projects screen: a node renamed by a dropped call goes back to its name.
  - A call that now fails (`staleTask`) is dropped with a notice and a reverse transition.
  - **Bounds:** at most two replays per write. Past that, the replica takes the file as it is, and the pending calls are dropped with a notice. The iPhone app's "busy after two tries" works this way, for one call at a time.
  - **A missing or moved file:** `fn` also checks that the file still sits at `tasksFile`, because `vault.process` holds a `TFile` that follows a rename. If the file has gone, the pending calls are dropped with a notice and the screen offers to create the file, as today.
  - **Our own echo:** our write's change event finds our text and does nothing.
  - **`tasksFile` changed** (by another device's settings) is handled like a file that has gone.
- **Tidy.** The core tidies inside its view reads (`ask` → `normalize`). The runtime calls `tasks.normalize` whenever the base changes or the core's day boundary passes (not midnight as such), before any view is drawn:
  - it adopts the answer's text and ids;
  - at the day boundary it enters the log as an entry with its own `nowMs`, so calls from before the boundary replay over a base tidied for the new day;
  - on a new base it runs before the replay and stays out of the log.

  Views are memoised by (replica, minute).
- **Readiness.** The runtime builds the replica only after the host is ready (P8): the layout is ready and Obsidian's metadata cache is resolved. It hands the door `projectsReady`, so the one move to projects never runs on an incomplete list (57562189).
- **Facts the door is told about its host.** These are added to `DoorContext` by `backend`; the app's defaults stay:
  - `host`: the calendar choice carries over only on iOS, as `composeCore` does today;
  - `feedProblems`: Google failing or silent, for the sources dot;
  - `projectsReady`.
- **Core classes the door leaves to the host:**
  - `CalendarPolling` is run by the runtime over its ports, unchanged.
  - The quick entry's job order (`QuickEntrySession`) and the calendars' refresh rule (open, refresh, peek, the 15 s silence) are today written around async services and their own state. So `backend` gives each a synchronous form in the core:
    - the job order as a step function over the door's `EntryAnswer`;
    - the refresh rule as a pure decision the network lane asks, over the replica's calendar state.

    The rules stay the core's, never rewritten in the UI.
- **Calendars:** the network lane fetches events, latest wins per day, a superseded fetch abandoned. Their files go into the replica as data, cached first and fresh when they land.
- **Synchronous rules** used per frame or per pointer move (`rules.*`: `snap`, `swipeLanding`, `layoutWidths`, `stackedLists`…) are called directly. They are pure.
- **Cost.**
  - Each door call today rebuilds its world: it parses the settings, builds the rules and identity, and parses and tidies the text. A view costs 2–3 ms on Max's file; a pure state change such as `endCarry` costs 1.6 ms.
  - `backend` adds a cross-call cache keyed by (text, settings reading, today). It covers the parsed document, the tree, the identity reading and the parsed settings, and state-only calls reuse it.
  - **Budget tests:** a view, a write and a carry step under 1 ms each on a 30 KB file once warm.
  - **`carryAt`** is called when the target under the finger changes, not on every move (as `CarryReport` does today).

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
  - pins hold ids, and a commit takes the task's current key, so a line Sync edited in place commits normally;
  - a pinned card's content (its text, its marks) updates inside the pinned layout; only its place waits;
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
- **Teardown ends what is under way:** a carry gets `endCarry`, so no stale carry stays in device storage.
- **Unload:** Obsidian does not await `onunload` (a BRAT update unloads the plugin). The persistence queue, with its ability to replay, outlives the plugin object until it is empty, and nothing disposes it before that.
- **After the switch** the old `CalendarService` polling is not started; the network lane is the only fetcher.
- **A test** mounts and unmounts each host, including mid-gesture, and finds nothing left alive.

## Architecture

```
obsidian/ui/next/
  model/       Model, Msg (one union), selectors over the model          pure
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
| M4 core reads per draw | view answers through `needs(model)`; `rules.*` imported directly (P2) |
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
| M17, R5 settings store | `PluginSettings.get()`, refreshed on `onChange`; per-key patches (P3) |
| M18 network | the network lane (P3) |
| M19 cross-screen renames | one replica for every screen |
| M20 recognition | `recognizers/` |
| M21 service callers | new screens call only the runtime; the old screen keeps its services until deleted |
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
| R12 door answering as the phone's host | host facts in `DoorContext` (P3) |
| R13 one persistence target | the table of the replica's parts (P3) |
| R14 a replayed create's new id | row keys belong to the call and are rebound on replay (P3) |
| R15 the facade changing the old screen | no facade: the old screen keeps its services (Migration) |
| R16 core classes outside the door | `CalendarPolling` unchanged; synchronous core forms for the entry job order and the refresh rule (P3) |
| Root, rev 7: settings persistence | per-key patches; device keys in device storage (P3) |
| Root, rev 7: the pending log | entries by id with their inputs; text, history and ids from replay; bounds; a missing file (P3) |
| Root, rev 7: per-call cost | the cross-call cache, budget tests, `carryAt` on a target change (P3) |
| Root, rev 8: the log's references and rollback | ids mapped and resolved on replay; entries carry their inputs; only text, history and ids come from replay (P3) |
| R17 two in-memory copies while old and new coexist | never shipped together: both flags switch at once (Migration) |
| R18 settings from outside writers | `PluginSettings.get()`, refreshed on `onChange` (P3) |
| R19 entry job order and the refresh rule | synchronous forms in the core (P3) |
| R20 replay rolling back the projects screen | only text, history and ids come from replay (P3) |
| R21 "the core" against the pure rules | the rules are imported directly; `callDoor` stays in the runtime (P2, §Guards) |
| R22 what views a screen needs | `needs(model)` per screen, recomputed on every replica change (P2) |
| R23 kept parts after a replay | `tasks.reconcile(idMap, dropped)` (P3) |
| Root, rev 8: the dispatch loop | P2's loop: door calls right after `update`, answers fed back before render, views reach the model as data |

## Guards

**Scope.**
- `uiRules` covers `obsidian/ui/next` from slice 2.
- The old screen is frozen and exempt until slice 7, which deletes it.
- New CSS lives below a `/* next */` marker in `styles.css`; the new style rules apply there, and the freeze covers the old part above it.

`tests/uiRules.test.ts`:
- **Purity:** `model/`, `update/`, `recognizers/` and `view/` import no DOM global, `obsidian`, runtime or driver. They may import the core's types (`ScreenView`, `TaskKey`…) and its pure rules.
- **Core calls:** `callDoor` and the replica only in the runtime. Outside it, the core may be imported only for the pure rules, which are listed in the guard. `view/` imports only selectors and `dispatch`.
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
- **Deny by default:** anything the host declares (the DOM, Node, Obsidian, `globalThis`, `Reflect`, `Function`, `eval`) is reachable only through an allowlist of its part or driver, and a host value stays in the host's types outside the drivers (decision 33).

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
| A frame mixing generations or contexts | synchronous views computed in the dispatch loop before render; runtime replay tests |
| A card flashing back after a drop or a rename | runtime tests: a write's outcome is in the same message |
| An outside edit lost, or overwriting a pending write | replay tests: Sync during three pending calls, one of which goes stale |
| Single rows moving across a context; a transition twice | `update` and `motion` tests; the frame recorder |
| Re-rendering at pointer rate | the render-counter test |
| A redraw under the finger | the pin tests |
| A screen going stale under a layer | the layer tests |
| A row remounting from field to card | identity tests |
| Something alive after its host | the lifecycle test |
| Focus scrolling the screen; the keyboard not rising on a pick | `focus` tests; the phone checklist |

## Migration: the new screens beside the old one, no parity layer

The old screen keeps its own services, untouched, until it is deleted. **Old and new never run side by side for Max.** The new note block and the new leaf switch on together, in one release. Two copies of the core's in-memory state (undo history, ids, projects screen) would make undo skip the other screen's changes and cards fade instead of moving, so that pairing is never shipped. The flags exist for building and for the e2e comparison, never as a mixed setup. The new screens run on the runtime. In development and e2e builds, where both may run, they write the same file safely: each sees the other's writes as outside changes, and both rebase, as the plugin and the iPhone app do. The old services already do this inside `vault.process`, and the plugin and the iPhone app live this way today. No layer imitates the old services, so the old screen stays exactly as it is.

| Slice | What | Release |
|---|---|---|
| 1 | **The runtime and the core's part.** <ul><li>The replica, its stores, the pending log with replay and bounds, the network lane, readiness.</li><li>`backend`: the cross-call cache with budget tests; the host facts in `DoorContext`.</li></ul>Tested on its own, with nothing in the plugin using it yet. | — |
| 2 | **Guards, freeze, the lifecycle test, the e2e harness.** | — |
| 3 | **The note block, whole, behind `newBlock` (off):** Rows and By subprojects, lists, cards, entry, carry in the block, menus, the full card. QA on the block. | — |
| 4 | **The leaf as a new screen behind `newScreen` (off).** Built region by region: lists and layouts, the timeline, the ribbon and both swipes, the panel and tree, the carry across them, select mode, search. A smoke subset per region. | — |
| 5 | **Switch:** once the release gate passes and an independent QA finds nothing, `newBlock` and `newScreen` turn on together. | ★ with Max's phone checklist |
| 6 | **The settings tab.** | ★ |
| 7 | **Delete** the old screen, its services' plugin wiring, `Picks`, `Reload`, `WriteQueue`, the flags and the freeze baselines. `CalendarScreen` is gone. | ★ |

## Tests

1. **`update` (unit):**
   - every decision 55–87 and fix commit as a replayed message log;
   - every A16 rule;
   - pins (changed, gone, hidden-not-gone, a Sync re-id);
   - identity across create, rename and undo;
   - midnight during a swipe;
   - bounds.
2. **The runtime (unit):**
   - a dependent call after a create that the replay gives a new id;
   - a pin on a created task surviving a replay re-id; ids never reused;
   - a section renamed on another device while calls are pending;
   - reconciliation after a dropped call;
   - Sync changing the task of an open full card, and the card updating in the same loop;
   - create, lift, Sync adding a line above, a drop on a tree row: the drop lands;
   - Sync during a carry with a write pending (the carry and the chosen node stay);
   - calls from before the day boundary replayed over a base tidied for the new day;
   - a file renamed mid-write;
   - the queue drained on unload;
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
- After slices 3, 4 and 5, a fresh QA agent is told to break it.
- A finding is answered by naming the principle or the inventory row that let it through, and fixing that.

## Decisions

Made while building slice 1's runtime (`obsidian/runtime/`), each from the closest existing pattern:

1. **A section in a call's arguments is a `SectionRef` (`{ sectionRef: id }`)**, resolved to its name by `tasks.sectionOf` every time the call runs, the first time and on replay. A screen never hands a section's name to a writing call.
2. **A task in a call's or a view's arguments is named by its key, and the door finds it by the key's id** (decision 27 for how): a call runs as made, and only a `staleTask` answer (its line changed elsewhere) runs again through `tasks.freshArgs`, which makes every key current; a replay always runs through it. So a pin commits on the task's current key (P6), and a view need naming a task follows a line Sync edited in place. The runtime never recognises a key or reads an id. A failure handed to `calendarsRefresh.problem` goes as plain data (`{ problem }` or `{ message }`), since `freshArgs` makes every argument plain.
3. **The pending log's base keeps its ids** with its text and history. A new base is read with `ids.continueFrom(base ids, replica ids)`, not with the replica's current ids: those describe the pending writes, so the pending calls' tasks would not be found in the new text and they would drop. Ids still never repeat.
4. **The ids a call gave anew** are its answer's `created`; on replay they are paired in order with the call's recorded ones. Every create counts: `createWithId`, `createSection`, a repeating task's next occurrence.
5. **`tasks.createFile` is not a pending call:** with no file the writer creates the text the door made; a file Sync brought meanwhile becomes the base instead.
6. **The runtime tells screens three events:** `rebased` (the id map and the dropped calls, their `seq` naming the call whose reverse transition runs), `fileGone`, `minute`. `tasks.reconcile` runs before `rebased` is told, so the remap and the reconciled projects screen reach a store's model in one pass of its loop.
7. **Values a screen writes** (list share, zoom, tree width) go through `Runtime.updateSettings(patch)`: the same per-key patch, device keys to device storage.
8. **Projects becoming ready mid-session** (the metadata cache settles late) is a `tasks.normalize` call, a pending call like the day-boundary tidy, so the one move to projects runs then.
9. **Notices** are said in one place, `obsidian/ui/failureText.ts` (`NOTICE_WORDS`, `noticeText`): the runtime tells a `RuntimeNotice` (`stale`, `busy`, `gone`, `failed`) and the composition words it. The old screen keeps its words exactly: a dropped call "The task changed in the file; the view was refreshed"; a file gone "Tasks file not found: <path>". Past two replays is new wording, since the old screen has no such case: "The tasks file kept changing; your last changes were not saved".
10. **`obsidian/runtime` imports** the core's `application`, `core/settings.ts` and Obsidian's packages only; Obsidian's vault, `PluginSettings`, `LocalProjectsScreenStore` and the feeds reach it as structural ports, composed in `obsidian/` root. `infrastructure` and `ui` may not import it (`tests/architecture.test.ts`).
11. **`LocalProjectsScreenStore.set` of the state it holds** writes nothing and tells nobody; `compose.ts` exposes the one instance as `Services.projectsScreenStore`.
12. **A feed keeps the one record of its last good run** (`CalendarFeed.lastRun()`, `GoogleCalendarFeed`'s own): the lane asks `calendarsRefresh.feedDue` over it and runs the feed (`refresh(true)`) when `ask`/`feedDue` say so, and the old screen's polling reads the same record, so the two never fetch twice for one fact. Polling by the refresh interval (`CalendarPolling`/`keepFresh`) starts with a mounted screen (slices 3–4), as the old screen's does today.
13. **The calendars' files are one set for every day, so the newest read wins**, not the latest ask of a day: the files are read after every feed run, on every change of one of them in the vault (an export, another device), and for each ask; a read overtaken by a newer one is never applied. The phone's export is asked first only when `calendarsRefresh.ask` answers `exportFirst` (Max's Refresh now: `Runtime.refreshCalendars("refresh", true)`), never on polling, an open or a source changing. A file that cannot be read becomes its source's problem. `Runtime.refreshCalendars(reason)` takes no day.
14. **A write that fails** (a disk error, a missing folder) is told once and waits: the next call, a change of the file or of the settings tries again; it never retries on its own. `Runtime.persisted()` resolves once nothing more can be written now, and `Runtime.stuck` says what the queue waits on. On unload the queue runs on until it is empty or stuck.
15. **The pending log is retired by sequence, not by text:** calls whose net effect gives back the text written are in the file, and leave the log.
16. **A read of the file lands only while it is the newest:** every read and every base a write or a replay sets bumps a generation, so a slow read never rolls the replica back.
17. **A refused write leaves `vault.process` by throwing**, so Obsidian writes nothing and tells no change.
18. **The undo history goes with its file:** when the tasks file goes or `tasksFile` names another, the history is cleared.
19. **A store draws its first frame on its own**, in the microtask after it is made (views read, then the render), with no message; a host that must draw inside the mounting event calls `store.flush()`.
20. **`Runtime.ready()`** resolves once the replica is first built or the runtime unloaded first. It rejects if the first build failed (the first read of the file); asked after that, it waits for the first build that works. A runtime unloaded during its start undoes what the start set up and never starts its clock.

21. **Every async outcome carries the generation of what it depended on, and is thrown away if that moved.** The writer keeps a file epoch, moved by every file gone and every file read anew (`tasksFile` changed): a write or a create that lands under an older epoch sets nothing (no base, no history, no echo); a read lands only while it is the newest (decision 16). The lane's reads keep their own tickets (decision 13). The settings listener that follows `tasksFile` is registered before the first read, so a change during it is followed.
22. **The log's base is the whole replica but the pending text calls.** Undo steps that change without the text (an undo that met a conflict) become the base's when nothing is pending, and a pending call when something is, so no rebase brings old steps back.
23. **A read's answer is taken like a call's**, every part (text, settings, Projects screen, ids, history) kept where it is kept; it is only never logged. This holds for every read path: views, the clock's day, the lane's questions. On iOS, `calendars.events`/`known` carrying the choice of calendars over is saved this way.
24. **A failure is kept by its kind.** A read that fails is told once and never marks the writes stuck; a write that fails is what `Runtime.stuck` shows. A read that fails at the start rejects `ready()`.
25. **Nothing outlives unload, nothing rejects unheard.** The lane's silence timers are cleared and its reads land nowhere after unload; every promise the runtime starts on its own ends in the failure path or the action log; the minute's clock re-arms even when a tick fails.
26. **A host reaches the runtime through its own session** (`Runtime.openHost()` → `HostSession`): a carry belongs to the session whose call started it, and a session's teardown ends only its own carry and its own subscriptions. Unload ends any carry. Hosts live in `obsidian/ui/next/host` and import only `obsidian/runtime/Runtime.ts`, which re-exports what they use (`Store`, `HostSession`, the types, `sectionRef`); the old `obsidian/ui` imports nothing of the runtime (`tests/architecture.test.ts`).
27. **A call runs as made, and only a stale answer runs again with fresh keys:** the door finds a task by its key's id wherever the replica's own writes moved it, so `tasks.freshArgs` is needed only when a line changed elsewhere; a replay always uses it. The replica's `fetched` is the sources the runtime was given feeds for.
28. **What depends on the replica starts when the replica is first built, whichever read builds it:** the first read at the start, or a later read after a change of the file when the first one failed. The minute's clock starts then and `ready()` resolves then.
29. **A replay pairs the ids a call gave kind by kind** (`DoorAnswer.createdKinds`): a task's with a task's, a section's with a section's, in order, and a kind only when the replay gave as many of it; an id is never mapped to a line of another kind.
30. **`persisted()`, `drained()` and unload wait for the reads the writer started itself** (after a change event or a write), not only for its writes.
31. **A host makes its stores through its session (`HostSession.store`), and the session's teardown disposes them,** so no pass already scheduled renders into a gone host.
32. **One run per feed at a time:** an ask while a feed runs joins that run, as `CalendarPolling` did.

Made while building slice 2 (the guards, the freeze, the lifecycle test, the e2e harness), revised after its review:

33. **`uiRules` reads the code as the compiler does, and denies by default.** The pure parts (`model/`, `update/`, `recognizers/`) are a project of their own with no DOM and no host (`tsconfig.next-pure.json`, compiled by `npm run build` and by the test): a window, a document, a timer or an element cannot be named there. Everywhere in `next/`, TypeScript 7's own API (`typescript/unstable/sync`, its Go compiler; no new dependency, `typescript` pinned to an exact version because the API is marked unstable) resolves every name, member, shorthand property (`{ document }`), import (through its alias to what it names) and type to its declaration, so an alias, a string key, a destructuring, a template literal or `Object.assign(el.style, …)` all reach the same declaration. **Anything declared by the host** (the DOM's, the workers' and Node's libraries, Obsidian's module and what it adds to the DOM, and the language's doors to the host and to code named at run time: `globalThis`, `Reflect`, `Function`, `eval`, `Proxy`…) **is reachable only through an allowlist**: the pure parts none; a view the DOM's element and event types for its handlers and a field's `value`/`checked` and a key event's `key`; a host Obsidian's API as hosts use it (the views it extends and their lifecycle, the vault's and the workspace's events, leaves, files' names; never files' contents, notices, menus or Obsidian's DOM helpers) and the DOM tree read; each driver its row of §Architecture (`DRIVER_ALLOW`) beside what every driver may (its element's neighbours and own window, data attributes, events as they come, its own timers and listeners). A host never writes the DOM: the node it mounts is made and placed by a driver (`islands`, `overlay`). Whatever no list names fails as «deny by default»; `HOST_WORK` names the work a denied reach is, and a few kinds are allowed nowhere (a bare window or document, a door to code named at run time, a class read, a class written whole or from a list, a selector naming a class by `.x` or `[class…]`, an attribute named at run time, the class list taken whole). Attribute names are compared whatever their case. Every class chrome writes, by any API, is a literal `is-…` (`add`/`remove` with every argument, `toggle`, `replace` with both, Obsidian's `addClass`/`toggleClass`). **A host value stays in the host's types:** outside the drivers a value of a DOM, worker or Node type (or a list, map or object holding one) may flow only into a type that holds one (or Preact's `ContainerNode`, the element it renders into) — never into a type literal of its own, a cast, `unknown`, `any`, `{}` or a generic helper's `T` (judged by the helper's declared parameter); in a driver never into `any`, `unknown` or `{}`. Obsidian's own objects pass as structural ports, as the runtime takes them (decision 10). A host member named at run time (`win[k]`) and any access on an untyped value fail. A switch whose subject's type is made of the literals of a `…Msg` union's discriminant (through any variable: `const k = msg.kind`), or over a member of such a union, ends in `assertNever`. In a view no `style` or `dangerouslySetInnerHTML`, by JSX, by a spread, or by `h()`/`createElement`; a `class` given only sometimes must be an `is-…` state, read from the text (conditions, templates, a list joined) or from a value typed as string literals, and a class name made at run time fails. `next/` holds only `.ts` and `.tsx`, and imports only its own parts, Preact, the core's contracts (values: the pure rules), the runtime's door (hosts), Obsidian (hosts and drivers) and CodeMirror (islands). The parts are read by folder: `next/model`, `update`, `recognizers`, `view`, `host`, and `drivers/<driver>` (a folder or a file named for it; the overlay host is `drivers/overlay`). The self-tests lay every hole each review probed as an in-memory file importing its givens from `tests/guards/given.ts`, and each must be caught; clean samples of each part must pass.
34. **The new CSS's names and states.** Below `/* next */` a selector names only the new screens' classes: `tc-n-…` for a component, `is-…` for its state, and the root `task-calendar` (the old screen's `tc-…` and Obsidian's classes are never selected from there). Every rule is under `.task-calendar` named outside any functional pseudo-class (inside `:not()`, `:has()` or `:is()` it scopes nothing). The chrome driver writes only literal `is-…` classes and a view gives a class only sometimes only as an `is-…` (`uiRules`), so every class that comes and goes is a state. A state is an `is-…` class, any attribute selector, `:has()` anywhere, a pseudo-class of what the user does, or a `body` class Obsidian does not set (its platform and theme classes are not states). No size property under a state; no custom property set under a state and read by a size property; no in-flow pseudo-element (one not `absolute` or `fixed`) given content or a size. A size property is anything that sizes a box or its content: its sizes, margins, paddings, borders (their width and style), the font (any `font-…`), line height and spacing, wrapping and clamping (`white-space`, `text-wrap`, `word-break`, `-webkit-line-clamp`…), overflow, `aspect-ratio`, `zoom`, `box-sizing`, `float`, containment and intrinsic sizes, flex and grid flow, alignment, `display`. Transitions written as tokens are read through the tokens; a keyframe of a layout property counts as its transition.
35. **The freeze** measures lines per directory of the files git tracks in `obsidian/ui` outside `next/`, and bytes of `styles.css` above `/* next */`, against `tests/uiFreeze.baseline.ts`: facts taken at 76d85642, never a commit looked up, so the freeze holds in a shallow clone. Shrinking passes without lowering the baseline (no ratchet: parallel fixes on the old screen would fight over it). An allowance in `uiFreeze.allow.ts` names a commit and a reason of ten characters or more, and carries lines of one directory, one new file, or CSS bytes; the commit must exist, except in a shallow clone, where its lookup gives way with a note to the rest of the check. The first allowance: the two lines that route the old screen's task links through `outside()` (decision 37).
36. **The lifecycle test's hosts** are registered in `HOSTS` (`tests/hostLifecycle.test.ts`) as `mount(context) → { startGesture, unmount }`, by their path under `next/host/` (found recursively); a host file not registered fails. Until slice 3 a reference host stands in, making every living kind a host makes. `tests/helpers/LeakCounter.ts` counts listeners on every target of the window's world (nodes, the window, media queries with both kinds of listener, the visual viewport; never the test runner's abort signals), `on…` handler properties set since install (on the window, its document and every element in it, the visual viewport, the media queries asked), observers (`PerformanceObserver` too), timeouts and intervals (one pool of handles, as in a browser: `clearTimeout` ends an interval; handles kept as they are, Node's being objects), frames, idle callbacks, Node's immediates, microtasks not yet run, animations started since install that still run or wait (an infinite one too), scopes pushed through its `keymap`, Obsidian event references (`events(target)`) and any method answering its unsubscribe (`subscriptions(target, method)`). It is checked after queued microtasks have run, so only one that keeps queueing itself stays alive. A promise's reactions are not counted: a chain either ends before the check or keeps queueing itself, and then no macrotask runs again and the test fails on its timeout.
37. **The e2e build** is `obsidian/e2e.ts`, built by the harness into `E2E_HOME/build/main.js` (`node esbuild.config.mjs production e2e --outfile=…`; `npm run build:e2e` into `.e2e/build/`) with the first line `// task-calendar <version> e2e`; the root `main.js` is never touched (`--outfile` without `e2e` is refused). After copying it into the scratch vault the harness checks the copy is this run's build: its first line exactly that of `manifest.json`'s version, written after this run's build started and after the last commit. `createServices` and `createDeps` take the `Http` (default `obsidianHttp`), and the plugin's reach outside Obsidian is one protected method (`outside()`: `open` for links to other apps, `browse` for an address in the browser — a task's link on the old screen, Google's login —, `runScript` for the Mac's scripts): the e2e build records them, and takes over `window.open` and `location.assign` in its test window, so nothing opens on Max's Mac (Shortcuts, the iPhone app, Google's login, a task's link, Calendar).
38. **The fixture** is taken once into `.e2e/fixture/` (gitignored with all of `.e2e/`: it holds Max's tasks, never committed) and kept, so baselines stay comparable; `--refresh-fixture` takes it again, and the baselines are recorded again after it (`--update`). The clock stands at 14:20 of the day it was taken. Google's secrets are replaced (`e2e`), the project notes come as stubs holding only the project tag, and the calendars (Google through the fixture network, the phone's and the work files at the paths the settings name) are made up for that day. Every path the fixture names (the tasks file, a note, a calendar) must stay inside its vault: an absolute one or one climbing out (`..`) is refused, when the fixture is read from Max's vault and when the scratch vault is written.
39. **The test Obsidian of the harness** keeps its profile and vault under `E2E_WORK` (default `.e2e/work`); the harness refuses an `E2E_WORK` or `E2E_HOME` inside `~/Obsidian` or inside the repository outside `.e2e/`, comparing paths as the disk does: the nearest part that exists resolved by `realpath` (links, and on macOS the case the disk holds), the rest appended, then compared without regard to case (so `~/obsidian/e2e` is Max's vault). The vault is written over in place each run (a copy of Max's tasks is never moved to the Bin). A port from 9345 free by `ps` and `lsof`; if another session takes it between the check and the launch, the instance just launched (it has no port of its own then) is ended by its own process id and the launch tried on the next port. A launch in the background (`open -n -g`) with Chromium's switches against an occluded window's throttling, and focus emulation; with those, CDP's own input reaches a window behind others, so every touch, click, wheel and the closing of Obsidian's first dialogs go through `Input.dispatch*`, never a click made in the page. Each platform and theme starts clean: the fixture's tasks file written again, the plugin's device storage cleared, the page reloaded into the platform.
40. **The recorder** keys a row by the key the view gives it (`data-row`, the model's row key; on the old screen `data-card`, its task's id), or by its whole title where it has neither, with a count among rows of the same base; each element keeps the key it was first given, so rows of one title never swap numbers as they move, and a key passes to another element only once its own left the DOM, so a remounted row keeps it. A carried card is named by its key (`__e2e.keyAt`), never by a cut title. Each row is judged from the frame it first shows in; a row's box takes in its margin below (a folded parent's fold); the place is the leftmost column showing plus the day after today, with its distance from the stage's edge (the view's left or a docked panel's right). The rules, each proven on a frame log made to reproduce a past bug (`tests/e2e/frames.test.ts`): a step that never settles; a row gone for some frames and back (a remount's flash); in a context step, any row animated or between its two places (cards flying in on a project switch); a row the step does not move that moves, and any row that leaves its place and comes back (a jump under a lift); in a swipe, each column moving as one (columns may change their widths, RibbonColumns), one way, never more than 120 px between two frames (the All columns jerk); overshoot; a rest off; a swipe resting off its column's edge or two places away; gaps or overlaps; a gesture that moved nothing. A step waits a person's pause (500 ms) before acting; the mouse lifts a card by moving it (holding opens its menu), the finger by holding; a swipe starts clear of the divider; the trackpad's wheel goes at a delta every 8 ms. The smoke set adds All columns tried sideways (nothing may move), a project chosen and all again, and a card lifted and held.
41. **Shots** are clipped to the view (Obsidian's chrome is never compared) and compared at 5 of 255 per channel on at most 0.2 % of the pixels (the timeline 6 on 0.3 %), and no more differing pixels may lie together (8 ways) than 4 CSS pixels' worth at the shot's ratio (36 at 3×): a short label one pixel off on the phone view is a tiny share of the shot but a block of touching pixels along its strokes, while the GPU's rounding scatters single ones. A missing baseline fails unless `--update`. Masks are listed by selector and kept with the baseline.
42. **The budget** comes from a CDP trace of each gesture and a fixed tail of 1.2 s (longer than any transition); the recorder starts before the trace and the wait for rest runs after it, so the harness's polling is never traced. Every harness evaluation marks its run in the page (`console.timeStamp`, `HARNESS` in `frames.ts`), and its script, with the frame sampler's own function, is cut out. From the rest: the page's main thread, its frames (each `FireAnimationFrame`), the script run in each frame (the union of the script events, nested ones once), and every task over 16 ms (the 17–49 ms ones the page's `PerformanceObserver` never tells). It fails a trace with no frame or no script of the page (nothing passes on an empty recording), a frame with 8 ms of script or more and any task over 16 ms, and reports the average over the frames that ran script and the longest frame.

Made while building slice 3 (the note block behind `newBlock`):

43. **`newBlock` is a device value of its own** (`task-calendar:new-screens` in Obsidian's device storage, `obsidian/composeRuntime.ts`), never synced and off by default: `core/settings.ts` is a shared contract and stays as it is. With it on, `main.ts` composes the runtime (no feed: the block shows no calendar, so the old screen's polling stays the only fetcher until slice 4) and mounts `NoteBlocks` instead of the old `ProjectBlocks`; the metadata's readiness is told when `VaultProjects.ready()` (a plugin loaded into an indexed vault hears no `resolved`).
44. **The block's height is the stylesheet's:** the frame is a column as tall as its stack up to `--tc-block-max-h`, past which the stack scrolls; nothing is measured. During a carry `motion` holds the frame's height as it stood (P6). The old block was at times 1 px short of its rows (its stack scrolled by a pixel); the new one is not, and the e2e comparison crops that pixel (`fit`).
45. **Views take no event handlers.** Every press goes through the `input` driver, which delegates by `data-n-act` (with the row's `data-n-key` and a `data-n-value`) and feeds the pointer stream to the pure press recognizer (`recognizers/press.ts`); `update/acts.ts` turns an act into its message. Preact's handlers would stay attached to the nodes it removes, which the lifecycle counter counts.
46. **Every inline style and CSS variable comes from the model through `motion`:** a row's level and branch offsets, a folded card's room, the select circle's room (`rowVars`, `carryVars`, `menuVars`, `rootVars`); a variant that sizes a box is an element of its own kind with literal classes (a two-line card is as tall as its lines; a branch's end, the fold counter, a meta pair, a repeat-only corner, each panel and row kind), and a class that comes and goes is an `is-…` state that sizes nothing (decision 34).
47. **A card's marks** are painted from the item: the dot of a task in progress by `data-status`, the description's mark from `!can.addDescription` (the core's «a description may be added: there is none»). A ready `TaskItem.card.marks` from the core would replace both (asked of `backend`).
48. **Motion within one context** is a FLIP over keyed rows (`motion.before` reads boxes in the commit phase, `after` slides what moved and fades in what is new); another context (mode, project, the first read) draws in place. A row that leaves fades where it stood and then its room folds, as the old `Motion.leave`: `motion` keeps its node over the frame, fades it, and the rows under it slide up after the fade while the frame holds its height (the e2e step «a card done leaves its list» judges it frame by frame).
49. **Layers** mount in the overlay host's node, under their own `.task-calendar` root; `motion` places them from measured anchors (`data-n-anchor`) and fades them in and out; the close's end is `layerGone`, which unpins the lists. A write pick runs its door call at the tap and the lists change once the sheet has gone (R10).
50. **The task menu** reads the core's `tasks.menu`/`tasks.bulkMenu` as a view need while open; its copy of the card is measured once per menu (`wholeWidth`, `grownStart`); the panel is placed from measurement, under, over or split (`groupsAbove`), and a page change re-places only the panel; a closing menu keeps what it drew; the repeat page writes once at the close (`repeatPage.end`); the month grid is plain date math (no core rule exists for it). Typing picks (Rename, Add subtask, New section, New project) focus their field inside the tap, once it is visible. As the old menu: it opens once its card is in view, the column the card scrolls in (the block's stack or the note's scroller) gliding it in first in the collapse time (`intoView`, the old `scrollIntoColumn`; a finger on the column calls the menu off); on the desktop a second click within 250 ms of the one that opened it renames (`secondPress`, the old double click); the start of the task's description stands by the copy of its card, over or under it where the panel is not, rendered by Obsidian (`Rendered` island, the old `DescriptionPeek`): a tap on it opens the full card, a note's link opens the note.
51. **The quick entry** runs the core's `entry.*` steps over a session kept in the model and the job order through the runtime facade's re-export of `entryJobStep` (update may import only `contracts.ts`, which does not export it: asked of `backend`). The field is Obsidian's editor as an island restyled by a CodeMirror theme from tokens; on Enter the written card takes the field's box and the next field gets a new row key. While typing, the foot fade is a second element (sizing by state is forbidden); on the phone the room at a list's end is a spacer row.
52. **The full card** is a layer inside the block's frame, pinned by id and following Sync through the needs `tasks.find`/`tasks.fullTree`; the description runs in Obsidian's editor through the core's `description.*`; its subtasks' circles are drawn as the old full card's (width 0, the card's padding kept); its rows are keyed `full/<id>`; the project line selects the project (`tasks.selectProjectNode`). Its subtasks show no folder mark while the block is fixed to a project (the core's `find`/`fullTree` mark by the main screen's filter: a filter argument asked of `backend`).
53. **The search in the block** reveals a pick (`tasks.reveal`): as the old block's (`CalendarScreen.reveal`): the main screen's project filter is cleared when it hides the task (`tasks.filterHides`), the funnel's place moves to the task's (Done, Inbox for Backlog, Soon, the calendar), a task of another day takes the block's day list to that day; a Done task opens on the full card, any other is ringed and scrolled into view.
54. **The carry in the block:** the geometry is measured once after the lift renders, from offsets in the stack's content pixels; the target is the core's drop rules over it, recomputed on each move and told only when it changes; `carryAt` is never called (a block has no tree); the carried cards' subtasks leave the pinned snapshot; the waiting place is a dashed outline; on a drop the pin goes at once and the float flies onto the landed card, on a cancel the pin stays until the float is back. A long mouse click does nothing, a right click opens the menu.
55. **The islands driver** holds the title field (`Islands`) and the full card's editors (`Editors`) and makes, places and removes the block's mount node (`MountNode`): hosts write no DOM (decision 33).
56. **A field opened in the block grows the block** as any row does, to the CSS's tallest (`--tc-block-max-h`), past which its stack scrolls: the old `BlockHeight` fitted the block to what its stack held, the field among it. Only a carry holds the frame's height (`holdsHeight`). Measured in the test Obsidian (a real click on the plus, the desktop): with Today holding a task the old block grew 571→632 px as the new does; on the e2e fixture, Today empty, the old one stayed 572 px while its stack held 606 px in 558 (`BlockHeight` missed the field row's late height, a race of the old block: its field's bar stood 48 px under the frame's foot, scrolled out), and the new one grows to 620 px. On the phone both grow by 60 px. The new block keeps the old rule, not its race. The e2e shot of a field open compares the block top-aligned (`fit` cut at the bottom): the old block's shot stops at the window's foot. The bar's buttons each paint over the one before (`z-index`), as the old bar's: a shrunk shift is covered by the flag. Old defects the e2e run shows and the new block does not repeat: the written card flashing between field and card (19–21 frames), and the old block sometimes cutting the written card's bottom (4 px) after typing.
57. **The e2e block run** (`npm run e2e -- block [platform theme]`) records the old block's baselines (`newBlock` off) and compares the new block with them in the same run on the same copy of the file, each platform and theme starting clean; every step is judged frame by frame, the new block's steps by the same rules as the old's. A caret's blink (CodeMirror's `cm-blink`) is no motion of the screen's: the recorder and the rest wait leave it out. `npm run e2e -- block-budget` is the block's budget: 300 tasks in the note's project, 4× CPU.
