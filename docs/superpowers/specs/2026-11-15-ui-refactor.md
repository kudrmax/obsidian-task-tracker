# Plugin UI refactor: one screen, one mechanism per concern, on the core's door

Issue: kudrmax/obsidian-task-tracker#41 (takes in #40). Branch `ui-refactor`. Revision 11.

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
| 9 | 213 (2 classes: "the core" vs the pure rules; what views a screen needs) | 0: "ready to build from"; five wording fixes, made in revision 10 |
| 10 | 14 (1 class, R23, closed in P3) | 0 by the architect; **1 found by building**: the work was owned by place (§Why revision 11) |
| 11 | 0: every row's owner is now a concern of the one screen, never a place | — |

The faults of revisions 5 and 6 had one cause. The spec treated the core as an asynchronous service the UI waits on, and built machinery around the waiting: read-back, previews, transactions, read-ahead, echoes. The core already has a **synchronous, pure door**, `callDoor(method, args, context) → answer` (`core/application/PhoneCalls.ts`). The iPhone app runs on it, and it covers every `TaskService`, `DayService`, undo, settings and calendar method (a typed coverage map, `PhoneCalls.ts:1077`). On Max's real tasks file (31 KB) a whole funnel view costs about 3 ms through it, JSON included (measured locally). Revision 7 puts the plugin on the same door, and the waiting is gone.

Revision 11 adds four research reports, kept beside the inventories in [`ui-refactor/rev11-research/`](ui-refactor/rev11-research/): **A** an audit of the code built in slices 1–3 (what is generic, place-shaped or host-only); **B** a red team of the three failed "one mechanism" specs, with twenty holes (H1–H20) that pass every guard of revision 10; **C** the map of one screen in every place and form, with the old bugs where a note's block shares the device's state; **D** how production teams make "exists once" hold.

## Why revision 11

Max stopped the work after slice 3. Slice 3 built the new UI around the note's block: a `BlockModel` typed on a note, `BlockLists` as the only shape of what a screen shows, a carry measured in one stack's pixels, and a `BlockHost` that orders the frame, interprets every command, recognises gestures and hit-tests the pointer (report A, §2). The main screen would have needed a second model, a second update, a second host and second driver methods. This is the fourth "one mechanism" that would have become two; the motion spec of 2026-11-08 and the drag spec of 2026-11-09 failed the same way (report B).

**The common cause** (report B, §4): each spec stated "one mechanism" as a principle and then sliced, owned and checked the work **by place**. Each slice was asked to finish a whole place, so it built a whole mechanism for that place. No artifact named the single code owner of each concern for every place to use, and every check that existed tested behaviour or layering, which two correct copies both pass.

So revision 11 moves the guarantee from the principles into the code's shape and into machine checks:

- **The screen is one:** one root, one model type, one message union, one update, one host. A place is data (G1, G2).
- **Each concern has one owner,** named in a frozen table that the guards read; every other file is denied the APIs that concern needs (G3, G4).
- **Use is mandatory:** every concern is exercised in every place and form, in unit tests and in the test Obsidian (G5), and a runtime trap catches what static analysis cannot see (G6).
- **The checks are tested** (G7), **old and new never coexist on master** (G8), and **each stage gets a structural review** whose findings become checks (G9).

The behaviour of revision 10 (P1–P8: the model, the loop, the runtime over the door, the replica, the pending log and its replay, the persistence queue, geometry as input, motion by cause, layers and pins, lifecycle) stands. What changes is who builds it and how its uniqueness is proven.

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
| **Ownership:** which code implements a concern | Nowhere named. The old UI has 4 drag loops, about 8 motion paths, about 9 focus owners, about 14 key handlers, 2 entry engines (report A, §3); the place is read in about 10 branches of `CalendarScreen` (A, §4) | One fix per copy (motion decisions 57–61); a duplicate found only at a merge (motion decision 52); slice 3 shaped for one place |
| **Place:** where the screen is shown | Two booleans and a scope (`ScreenPlace`) read anywhere; a note's block writes the device's filter, place, day and carry | A search in a note clears the main screen's filter (report C, §3) |

The rules themselves stay where they are, in the core: where a task lands, what a drop means, what a menu offers.

## Principles

**P1. One model.**
- What the screen shows is a pure function of the model: `view(model)`.
- **One model type for every place:** `Model`, with the place it is shown in as data (`model.place`, G1). Each mounted screen is one store of that type; no place has a model, a message union or an update of its own.
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
  3. **What the screen needs.** The screen has one pure selector, `needs(model)`. It lists the view answers the screen needs: its root view (the funnel, a note's view or the settings, which `layoutOf` gives as data, G1), the neighbour day or place under a swipe, the task of an open full card or menu, the search's results. The runtime computes one answer per need from the replica, memoised by (replica, minute, need), and hands them to the model as data (`viewsChanged`).
     - Any change of the replica recomputes every mounted need in the same loop, so an open card follows Sync at once.
     - Selectors never call the door. Here "the core" means `callDoor`, the replica and the view answers.
     - The core's **pure rules** (`rules.*`: `snap`, `swipeLanding`, `layoutWidths`, `stackedLists`, `layoutShareAt`…) are plain functions. They are imported by the owner the owner table assigns each to (G4), since they are needed per frame and per pointer move.
  4. `ScreenHost` draws, in one order for every place: render, measure, motion, scroll, focus last (G2).

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
- **The stack:** a stack of modal layers (screen → select mode → full card → field → menu or sheet) plus at most one pointer gesture. It is a statechart, one for every place (`update/layers.ts` and `update/gesture.ts`); the carry is one statechart whatever is carried and wherever it lands (`update/carry.ts`).
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
- **Effect owners** (`drivers/`, one file per concern, §The owner table) own the DOM work that is not declarative; nothing else in `obsidian/` reaches it (G3).
- **Motion has one engine:** no CSS transition, animation or `@keyframes` outside the motion owner's classes (G4).
- **The runtime** owns the replica, the door calls, persistence, the network and Obsidian's events.
- **The core's sessions** (`entry.*`, `sectionName`, `repeatPage`, `description`, the carry) are door methods over the replica, never re-implemented.
- **Host CSS is scoped:**
  - every new rule sits under `.task-calendar`;
  - a scoped reset neutralises Obsidian's and iPadOS's control styles;
  - body classes are written only by `chrome`.

**P8. Everything alive has an owner.**
- `ScreenHost` mounts, owns and disposes every driver, observer, subscription, scope and timer of a screen, the same for every place. An adapter (the leaf, a note, the settings tab) owns only its registration with Obsidian (G2).
- Host readiness (layout ready, Sync loaded, metadata cache resolved) and teardown arrive as messages.
- **Teardown ends what is under way:** a carry gets `endCarry`, so no stale carry stays in device storage.
- **Unload:** Obsidian does not await `onunload` (a BRAT update unloads the plugin). The persistence queue, with its ability to replay, outlives the plugin object until it is empty, and nothing disposes it before that.
- **After the switch** the old `CalendarService` polling is not started; the network lane is the only fetcher.
- **A test** mounts and unmounts each adapter in each form, including mid-gesture, and finds nothing left alive.

## The one mechanism

P1–P8 say what the screen is. G1–G9 say how it is built **once**. Each is enforced by construction (the second thing cannot be written: the compiler or a guard rejects it), by a required matrix (the thing must be used everywhere it applies, or the build fails), or by a runtime trap (a call from the wrong code fails the end-to-end run). Each names which. None rests on a reviewer or on a promise.

**G1. One screen; places are data.**
- The whole UI is one root component, `Screen` (`view/Screen.tsx`), of one model type, `Model` (`model/Model.ts`), changed by one message union, `Msg` (`model/Msg.ts`), through one `update` (`update/update.ts`). The main screen, a note's block and the settings tab are that screen with a different `Place`.
- `Place` (`screen/place.ts`) is closed and data only: no function, no component, no element, no class. Its constructors are the only way to make one: `Places.main()`, `Places.note(path)`, `Places.settings()`.
- `Place` and `form` are read in exactly one module, `screen/layout.ts`, which derives a `Layout` value (§Architecture). Nothing else reads a member of `Place` or anything that names a place; Obsidian's `Platform` is read only by `drivers/chrome.ts`, which reports the form.
- **A capability only gates.** Outside `screen/layout.ts`, a `Layout` field may decide only whether a behaviour happens, never which of two behaviours happens. It is read in exactly two forms, which the guard recognises: an early return of the unchanged input (`if (!layout.gates.x) return unchanged(model)`), or `gated(layout.gates.x, thing)`, which gives one command, message or element or nothing (a carry in a note runs whole and only its `startCarry` command is gated). Two drawings of one thing (the keyboard bar or the desktop capsule; the search sheet or panel) are one kit component taking a variant prop, and only the kit switches on it.
- A note's block owns its own filter, day and carry: they are fields of its own store, gated by its `Layout`. It never writes the device's filter, funnel place or carry (report C, §3, items 1–4).
- Building starts from the main screen, the full case: every region exists there (§Migration's stage order).
- *Enforced by construction:* `tests/onePlace.test.ts` (one `Model`, one `Msg`, one `update`, one `Program` instantiation, `Place` read only by `layout.ts`, the gate-only rule, no identifier or path naming a place or a form outside `screen/place.ts`, `screen/layout.ts`, `drivers/chrome.ts` and `host/adapters/`).

**G2. One generic host; thin adapters.**
- `host/ScreenHost.ts` is the one controller of a mounted screen: it opens the runtime session and the one store, runs the draw order (P2 step 4), interprets every command (an exhaustive table from command kind to the one effect owner that runs it), and routes every input stream into messages. Hit testing is not in it: the target under a pointer is a pure function of measured geometry (`screen/carryGeometry.ts`), called from `update`.
- `ScreenHost` holds no interaction state: its fields are `readonly` and typed as the store, the session or an effect owner's handle; no module-level `let`. Everything the user is in the middle of is in `Model` (P1, P6).
- The adapters `host/adapters/leaf.ts`, `host/adapters/note.ts` and `host/adapters/settings.ts` may only: name a mount target (data: a leaf's content, a Markdown view, a settings tab), give a `Place` from its constructor, run the lifecycle (open, close, rename) and turn Obsidian's events into messages (`placeChanged`, `hostShown`, `hostHidden`).
- *Enforced by construction:* `tests/hosts.test.ts`. An adapter imports only `host/ScreenHost.ts`, `screen/place.ts` and `obsidian` (an allowlist), stays under 120 lines, and declares no class field that is not `readonly`. `ScreenHost` imports only `update/update.ts`, `view/Screen.tsx`, `model/`'s types, `screen/place.ts` (to complete a seed with the form `chrome` reports), the effect owners and `obsidian/runtime/Runtime.ts`, and makes no decision a `Layout`, `Place` or `Msg` field could drive (it switches only on `Command["kind"]`).

**G3. One owner per concern.**
- §The owner table names, for each concern, its one **pure owner** (state, rules, the messages it handles: one file), its one **effect owner** where it reaches the platform (one file), the platform, Obsidian and library APIs only that effect owner may call, and the intent-level names it exports.
- **An owner is one public file.** It may keep private parts in a folder of the same name beside it (`update/carry/…` for `update/carry.ts`), importable only by that file. A folder is never an owner, and any file in `obsidian/ui/next/` that the table does not name (as an owner, an owner's private part, a kit component or a composition of the screen) fails the build. A copy of a concern in a new file is therefore an unknown file.
- **Deny by default across `obsidian/`.** The compiler-based guard (`tests/uiRules.ts`, decision 33) covers all of `obsidian/`, not only `obsidian/ui/next`: the hosts, the adapters, `main.ts`, `compose.ts`, `composeRuntime.ts`, the runtime and the infrastructure. Each listed API is reachable only from its owner. The old UI is exempt only while it is frozen by content (G8).
- **Owners cannot re-export raw calls.** An owner's exports are exactly the intents the table lists: their types hold no DOM, Obsidian or host type (no element, `DOMRect`, `Scope`, `EditorView`), and no callback that receives one. `export … from` of a host module is rejected.
- **Messages and state have one owner each.** `Msg` is the union of each pure owner's own union; the router `ROUTES: { [K in Msg["kind"]]: Concern }` is total, and a kind in two unions fails to compile (`Disjoint<…>`). A pure owner's handler reads the whole model and returns only its own slice of `Model`, its commands and follow-up messages, so a slice has one writer.
- **The table is frozen and protected** as CLAUDE.md protects «Behaviours Max had to ask for twice»: it is data (`tests/guards/owners.ts`) whose hash is pinned in `tests/ownership.test.ts`, a test that names Max in its doc comment. It is never changed, and never routed around, without him. Approving this spec approves the table as written below.
- *Enforced by construction:* `tests/ownership.test.ts` (every row's APIs, the export surfaces, the unknown-file rule, the hash), on `tests/uiRules.ts`.

**G4. A closed kit; motion as data.**
- **Views are built from the kit.** Only `view/kit/` writes intrinsic JSX (`<div>`, `<input>`…). Everything else in `view/` composes kit components. Kit props are closed (discriminated unions and literals; no `string` class, no `style`, no handler, no `any`), as decision 45 already requires for handlers.
- **Intents are data on nodes, and required.** A kit node that can move, take focus, scroll or be measured declares it with a required prop: `motion` (a `MotionKey` or `"none"`), `focus` (a `FocusKey` or `"none"`), `scroll` (a `ScrollKey` or `"none"`), `measure` (a `MeasureKey` or `"none"`). Absence is a compile error, so a list cannot forget to animate and a field cannot forget to ask for focus.
- **Motion causes are a closed union** (`MotionCause`, in `update/motion.ts`): rows within a context, a leave, a context drawn still, a whole-region slide (day, ribbon), the lift, the fold under a lift, room at a list's end, the drop and cancel flights, the panel slide, the divider snap, the keyboard ride, a layer opening and closing, the fade aside of the foot, into view. Only `update/motion.ts` makes one; only `drivers/motion.ts` turns one into an animation, by an exhaustive switch. A new animation is a new member of the union, handled in exactly those two files.
- **CSS has no motion of its own.** Below `/* next */`, `transition`, `animation`, `@keyframes`, `scroll-behavior` and `will-change` appear only in rules whose selector is a class the motion owner declares (`tc-m-…`, listed in `drivers/motion.ts` as `MOTION_CLASSES`), and durations and easings only as `--tc-motion-…` tokens. Decision 34's allowance of opacity and transform transitions on states is revoked, and slice 3's state transition of the foot (`styles.css`, `.tc-n-block.is-carrying > …`) becomes the motion cause `fadeAside`.
- **Geometry arithmetic has three owners.** Every size or position in the model is a branded `Px` (from `screen/px.ts`): `measure` produces it, the pointer's coordinates arrive as it. Arithmetic, `Math.*` or a comparison on a `Px` value, and turning a `Px` into a plain number, are allowed only in `drivers/measure.ts`, `screen/carryGeometry.ts` and `screen/layout.ts` (and in `drivers/motion.ts` to apply them). `update/`, `view/` and the hosts can hold and pass a `Px`, never compute with one.
- **The core's pure rules are required, never redone.** The owner table assigns each rule of `PURE_RULES` to the owner that must call it (`placeAt`, `levelAt`, `gapAt` to carry geometry; `layoutWidths`, `stackedLists`, `swipeLanding`, `dividerAt` to layout; `entryJobStep` to entry…). A rule its owner does not reference fails; a rule referenced by an owner it is not assigned to fails. With arithmetic on geometry denied everywhere else, a second drop rule or width rule has nowhere to be written.
- *Enforced by construction:* `tests/kit.test.ts` (intrinsic JSX, closed props, required intents), `tests/styles.test.ts` (the CSS motion rule), `tests/geometry.test.ts` (the `Px` rule), `tests/pureRules.test.ts` (required use).

**G5. Mandatory use: the concern × place × form matrix.**
- `tests/matrix/registry.ts` is a total type, `Record<Concern, Record<PlaceName, Record<Form, Cell>>>`, over the concerns of the owner table, the constructors of `Places` and both forms. A concern or a place added without its cells does not compile.
- A cell is either scenarios or `notOffered(gate)`. `notOffered` names the `Layout` field that turns the concern off there, and the test checks that `layoutOf` really turns it off for that place and form: "not offered" is proven, not claimed.
- **Unit (model level):** every scenario runs as a message log through the one `update` with that place's model, and checks the model, the commands and the motion causes (`tests/matrix/model.test.ts`).
- **End to end (the test Obsidian):** the same registry drives `scripts/e2e/matrix.ts`, in phone view and a desktop window, in light and dark. Each cell runs its scenarios under the frame recorder (decision 40) and the trap (G6), and the trap's record must show the concern's effect owner was the caller.
- **Across places:** a concern offered in several places runs the same scenario in each, and their frame logs must have the same shape (the same causes, in the same order, on the same keys). Two implementations that each match the old screen no longer pass (report B, U11, H20).
- *Enforced by a required matrix.*

**G6. A runtime trap.**
- The e2e build (decision 37) wraps every API the owner table lists: the prototypes (`Element.prototype.animate`, `focus`, `scrollTo`, `getBoundingClientRect`, `addEventListener` for pointer and key events, `ResizeObserver`…), the globals (`requestAnimationFrame`, timers) and Obsidian's constructors (`Scope`, `Menu`, `Modal`, `Notice`).
- Each call finds its nearest stack frame from the plugin's own source (`obsidian/`), through the e2e build's source map; frames of bundled libraries are skipped, and a call with no frame of ours is Obsidian's and ignored. If that source file is not the API's owner in `tests/guards/owners.ts`, the step fails with the API, the file and the stack.
- It catches what the compiler cannot see on the paths the matrix runs: a cast, a dynamic access, a library we bundle that touches the DOM for us.
- *Enforced by a runtime trap* (`obsidian/e2e/trap.ts`, its own unit test `tests/e2e/trap.test.ts`).

**G7. The guards are tested.**
- **Negative fixtures:** every hole of report B (H1–H20) and every failure of the three earlier specs that code can show is a fixture under `tests/guards/fixtures/<rule>/reject/`, named for it (`H07-leaf-host-targetAt.ts`), and must be rejected by the rule it names. **Positive fixtures** under `…/accept/` must pass.
- **No rule is vacuous:** every rule must match at least one real file of the tree and have at least one reject and one accept fixture (`tests/guards.test.ts`).
- **Mutation testing** (StrykerJS, `npm run test:guards:mutation`) runs over the guard code (`tests/uiRules.ts`, `tests/guards/`, `obsidian/e2e/trap.ts`) and must score 100 %. A mutant that cannot be killed is marked where it lives with a reason; the count of such marks is pinned in `tests/ownership.test.ts` and may only fall.
- **A bypass found later becomes a fixture before its fix:** the commit that fixes it adds the reject fixture first, and the fixture must fail on the commit before.
- **jscpd at threshold 0** over `obsidian/` and the CSS below `/* next */` (`npm run dup`, in `npm test`): a copied block fails, whichever file it is in. Until stage 7 only clones whose both sides lie in the frozen old UI are reported without failing.
- *Enforced by construction:* the guards are code under test like any other.

**G8. No coexistence.**
- **No flags per place.** The old `newBlock` device value (decision 43) and the planned `newScreen` are gone. The new UI is chosen by one build constant, `UI` (`"old" | "next"`, esbuild's `define`), read once in `obsidian/main.ts`; with `next` every adapter mounts the one screen. The release build refuses `next` until stage 7, so Max never runs both.
- **master never contains both.** The work lives on `ui-refactor` (it merges master in as master moves). It reaches master in one merge, at stage 7, which switches to the new UI and deletes the old UI, its CSS above `/* next */`, `UI`, the freeze and its baselines. A tree with both fails `tests/oneSwitch.test.ts` once `UI` is gone.
- **The old code is frozen by content.** `tests/uiFreeze.baseline.ts` lists every old-UI file and the old CSS with the git blob id of its content. On the branch a file may change only to the content master holds for it at a commit the list names (Max's fixes on master, merged in), and every such change carries an entry in `tests/uiFreeze.ported.ts` naming the master commit and the new UI's test that covers the same fix. Otherwise the list may only shrink. The line allowances of decision 35 are gone. Without the history the check fails; it never gives way.
- *Enforced by construction:* `tests/uiFreeze.test.ts`, `tests/oneSwitch.test.ts`.

**G9. Structural review per stage.**
- Besides the behaviour review (§How it is built), each stage gets a fresh reviewer who has not seen the work. It gets the owner table, the whole `obsidian/` tree at the stage's head (never a diff) and the guards, and one task: find a concern implemented twice, or a branch on the place or the form outside `screen/layout.ts`.
- Each finding becomes a G7 reject fixture first, failing on the stage's head, and then the fix; the fix is judged at the principle that let it through (§How it is built).
- A stage ends only when a second fresh reviewer finds nothing.
- The reviewer is how unknown bypasses are found; the guarantee is the fixture each finding leaves behind.

## Architecture

```
obsidian/ui/next/
  screen/      place.ts     Place, its constructors                             pure
               layout.ts    layoutOf(place, view, measured, device) → Layout:
                            the only reader of Place and form; lists, regions,
                            widths, timeline lanes; the layout rules             pure
               carryGeometry.ts  the target under a point, from measured Px     pure
               px.ts        the Px brand                                         pure
  model/       Model.ts (the one model), Msg.ts (the one union), Command.ts,
               selectors that read the model                                    pure
  update/      update.ts (the router) and one file per concern                  pure
  view/        Screen.tsx (the one root), compositions of the kit; kit/         pure
  drivers/     one file per effect owner                                         DOM
  host/        ScreenHost.ts; adapters/leaf.ts, note.ts, settings.ts
obsidian/runtime/
  Runtime      the replica; door calls; pending calls and replay; the
               persistence queue; the network lane; Obsidian's events;
               timers; the action log
```

**`Place`** (start from report C, §4; `form` is filled by `ScreenHost` from `chrome`, the adapter gives the rest):

```ts
/** Where the one screen is shown. Closed, data only; made only by `Places`; read only by `screen/layout.ts`. */
export interface Place {
	/** Obsidian's `is-mobile` as `chrome` reports it (an iPad is "phone"); the core's `wide`. Never decides a gesture:
	 *  the pointer kind travels with each event. */
	readonly form: "phone" | "desktop";
	/** fill: the whole view, each list scrolls by itself. inline: inside a note, as tall as its content up to
	 *  `--tc-block-max-h`, the stack scrolling as one, the note's scroller the outer scroller of edge scroll and reveal. */
	readonly frame: "fill" | "inline";
	/** tab: the view's Scope while it is active. focus: a Scope while the focus is inside, presses kept from the host. */
	readonly keys: "tab" | "focus";
	readonly content: TasksContent | SettingsContent;
}
export interface TasksContent {
	readonly kind: "tasks";
	/** funnel: `tasks.funnelView`, the mode in `state.view`. note: `tasks.projectNoteView(path)`, the mode in `state.noteView`. */
	readonly source: { readonly kind: "funnel" } | { readonly kind: "note"; readonly path: string };
	/** The timeline, events, all-day rows, the now line, zoom, timeline drops, new slots. false: none drawn or needed. */
	readonly calendar: boolean;
	/** any: arrows, the title, day swipes, a find or a typed task may open a day. today: the day list is today's. */
	readonly days: "any" | "today";
	/** The folder button, the panel, tree drops and lift, the left-edge reveal, the device's carry (`startCarry`). */
	readonly tree: boolean;
	/** chosen: the device's node, with title, cross and project menu; a find it hides clears it.
	 *  fixed: the note's project; a find it hides opens on the full card; the device's filter is never written. */
	readonly filter: "chosen" | "fixed";
	/** Whether the screen writes the device's funnel place (`setFunnelPlace`). */
	readonly writesPlace: boolean;
}
export interface SettingsContent { readonly kind: "settings" }

type Seed = Omit<Place, "form">;
export const Places = {
	main: (): Seed => ({ frame: "fill", keys: "tab", content: { kind: "tasks", source: { kind: "funnel" },
		calendar: true, days: "any", tree: true, filter: "chosen", writesPlace: true } }),
	note: (path: string): Seed => ({ frame: "inline", keys: "focus", content: { kind: "tasks", source: { kind: "note", path },
		calendar: false, days: "today", tree: false, filter: "fixed", writesPlace: false } }),
	settings: (): Seed => ({ frame: "fill", keys: "focus", content: { kind: "settings" } }),
} as const;
```

Report C's `sheets` is left out: in every place a sheet (the full card, the search) mounts over the screen's own frame, as today (decision 52). The settings tab is a third place, not a screen of its own, so its row reorder is the one carry and its fields the one entry (report A, §3: `RowReorder` is a fifth drag loop today).

**`Layout`** is what every other part reads instead of the place. `layoutOf` is memoised by its inputs and is a selector, never stored:
- `root`: the view need the screen reads (P2 step 3), and `modeWrite`: the door method that keeps the mode (`tasks.setViewMode`, `tasks.setNoteViewMode` or none). Data, so no part branches to choose them.
- `regions`: what is drawn, in order (ribbon pages, columns, lists with their rows, the timeline lane, the panel, the foot, the settings' groups), with their geometry in `Px`, computed by the layout rules.
- `targets`: where a carry may land (list gaps, plates, titles, the timeline, tree rows, section slots, settings rows); `scrollers`: the scrollers in chain order, inner first (inline: the stack, then the note's).
- `variants`: kit variant props (`entry: "bar" | "capsule"`, `search: "sheet" | "panel"`, `panel: "docked" | "overlay" | null`, `frame`).
- `gates`: capabilities, each turning one behaviour off (`hover`, `modifierPick`, `dayMoves`, `filterClears`, `writesPlace`, `deviceCarry`, `blurEndsEntry`, `searchArrows`…).
- `keys`, read by the keys owner only, and `door`: the facts handed to the core (`wide`).

The core already answers most per-place questions (`FunnelView.panel`, `filter.clearable`, `topRow`, `searchPaths`, `plus`, `ViewChoice.{modes, wheel, ribbon, layout, plates, subprojects}`, report C, §0). `layoutOf` passes the place's facts to the core and takes those answers; it never derives them again.

**The one loop, run by `ScreenHost`:** an input stream from `drivers/input.ts` → the recognizer (`update/gesture.ts`) → `update` → the router → the concern's pure owner → the runtime's door calls (P2) → `needs(model)` → render `Screen` → `measure` → `motion` → `scroll` → `focus`. The same for every place; a place changes only the data `layoutOf` gives.

**Preact 11, TSX.**
- It is checked by TypeScript 7 and bundled by esbuild as is. Svelte is rejected: `svelte-check` needs TypeScript ≤6, and its `animate:flip` infers motion from geometry.
- A user's event renders synchronously (the runtime flushes Preact's `debounceRendering`).

The plugin's own menus and sheets are kit layers in the one overlay.

**Picks.**
1. **A write pick** runs its door call at the tap. The list's change shows when the sheet's close settles (P6 pins the layout under the closing sheet).
2. **A typing pick** renders and focuses its field inside the tap.
3. **A hand-over** is one layer transition.

**Undo** is a door call like any other: instant, its result visible at once, with `canUndo` from the replica's history.

## The owner table

One row per concern. "Pure owner" holds the concern's state slice, its rules, its messages and the commands it asks for. "Effect owner" is the only file in `obsidian/` that may reach the APIs listed. "Required rules" are the core's pure rules the owner must call (G4). "Exports" are its whole public surface. A dash means none: the concern reaches the platform only through another row's intents.

| # | Concern | Pure owner | Effect owner and the only APIs it may call | Required rules | Exports (intents) |
|---|---|---|---|---|---|
| 1 | **Layout** of columns and lists: ribbon pages, columns, lists and their rows, dividers, the timeline's lanes, the panel, the frame, the settings' groups | `screen/layout.ts` (private: `screen/layout/lists.ts` for `funnelList`, `projectsList`, `withBranches`) | — | `layoutWidths`, `layoutShareAt`, `listWidths`, `allColumnsWidths`, `allColumnsShare`, `allColumnsWidthAt`, `allColumnsDividerAt`, `dividerAt`, `stackedLists`, `stackedRows`, `swipeLanding`, `stackTasks`, `stackCorner`, `eventLeft`, `eventLevels`, `funnelPlaceShowing` | `layoutOf`, `Layout`, `Region`, `rowsOf` |
| 2 | **Drag and drop**: the carry of a card, subtasks, picked cards, the plus, a section, a tree node, a settings row, a timeline block; the drop and cancel; hover-open; the door's carry | `update/carry.ts` | — (the float through motion, edge scroll through scroll, `startCarry`/`carryAt`/`drop` as door commands) | `canPick`, `endsSelection`, `sameSlot`, `PROJECTS_HOVER_MS` | carry messages |
| 3 | **Carry geometry**: the target under a point | `screen/carryGeometry.ts` | — | `placeAt`, `levelAt`, `levelRange`, `gapAt`, `gapBranch`, `gapOfPlace`, `placeOfGap`, `placesInGap`, `sameGap`, `projectsDrop`, `projectsGap`, `projectsLevels`, `groupPlaceOf`, `acceptsDrop`, `carriedMiddle`, `gridAt`, `placeOfDrop` | `targetAt`, `Target` |
| 4 | **Motion** | `update/motion.ts`: the only maker of `MotionCause`, transition numbers, the transient channel's values | `drivers/motion.ts`: `Element.animate`, `getAnimations`, `Animation`, `requestAnimationFrame`, `cancelAnimationFrame`, every inline style and custom property write, the `tc-m-…` classes; the only selectors with CSS motion | — | `MotionCause`, `motionSettled`, `motionInterrupted` |
| 5 | **Measurement** | `update/measure.ts`: the `measured` slice, in `Px`, keyed by `MeasureKey` | `drivers/measure.ts`: `getBoundingClientRect`, `getClientRects`, `offset…`/`client…`/`scroll…` reads, `getComputedStyle`, `ResizeObserver`, `IntersectionObserver`, `visualViewport` sizes | — | `measured`, `boxesNow(keys)` (for `motion`'s commit-phase reads) |
| 6 | **Scroll**: reveal, hold while rows fold, edge scroll in a carry, glides, the chain to the host's scroller | `update/scroll.ts` | `drivers/scroll.ts`: `scrollTo`, `scrollBy`, `scrollIntoView`, `scrollTop`/`scrollLeft` writes | — | `ScrollIntent`, `userScrolled`, `scrollSettled` |
| 7 | **Focus** | `update/focus.ts`: the one focus target, taken last in the loop | `drivers/focus.ts`: `focus`, `blur`, `activeElement`, `tabIndex` writes, `hasFocus` | — | `FocusIntent`, `focused`, `blurred` |
| 8 | **Keys**: the key table over the layer stack (the Escape order, A16.16; ⌘Z, ⌘⇧Z, ⌘F, Enter, arrows) | `update/keys.ts` | `drivers/keys.ts`: Obsidian `Scope`, `Keymap`, `keydown`/`keyup` listeners | — | key messages |
| 9 | **Input and gestures**: press, hold, lift, swipe, pinch, wheel, divider drag, double click; the one gesture slot and the arbitration table A16 | `update/gesture.ts` (private: `update/gesture/press.ts`, today's `recognizers/press.ts`) | `drivers/input.ts`: pointer, mouse, touch, wheel, click, double-click and context-menu listeners, `setPointerCapture`, `releasePointerCapture`, `preventDefault`/`stopPropagation` on those events | `SWIPE_FLICK_SPEED`, `DIVIDER_SNAP` | gesture messages |
| 10 | **Entry**: the quick entry, rename, section and project names, the search's query, the full card's subtasks, settings fields | `update/entry.ts` | `drivers/editors.ts` (today's `islands`): CodeMirror (`EditorView`, `EditorState`), `MarkdownRenderer`, Obsidian `Component`, `input`/`beforeinput`/composition events, `value`/`checked` writes, `setSelectionRange`, `Selection`, `Range` | `entryJobStep`, `queuedEntryJobs`, `NO_ENTRY_JOBS`, `projectsEntryLook`, `viewEntryLists`, `oneLine`, `LINE_BREAK` | entry messages, `EditorIntent` |
| 11 | **Menus and layers**: the one layer stack; task, bulk, section, project, event, view, ⋯, sources menus; their pages | `update/layers.ts` | `drivers/overlay.ts`: the one mount node per window, Obsidian `Menu` and `Modal` | `sectionChoice`, `repeatDraft`, `repeatParts`, `repeatValue`, `editRepeat` | `LayerIntent`, `layerGone` |
| 12 | **Search** | `update/search.ts` | — | — | search messages |
| 13 | **Sections**: header menu, naming, lift slots | `update/section.ts` | — | — | section messages |
| 14 | **Selection** | `update/select.ts` | — | — | select messages |
| 15 | **Full card** | `update/full.ts` | — (editors through row 10) | `sameTaskTree` | full-card messages |
| 16 | **Context**: the day, the funnel place, the filter, the mode, Subprojects, the panel open | `update/context.ts` | — (door calls; each write gated by `Layout.gates`, its method from `Layout.modeWrite`) | `stepFunnel`, `funnelPlaceOf`, `viewContext`, `zoomAfterPinch`, `zoomShown`, `fitLevel` | context messages |
| 17 | **Chrome**: the form, theme, keyboard inset, toolbar, status bar, windows, body classes, haptics | `update/chrome.ts` | `drivers/chrome.ts`: Obsidian `Platform`, `body` class writes, `css-change`, `visualViewport` events, popout windows, the haptics port | — | `platform`, `theme`, `keyboard`, `toolbar`, `window` |
| 18 | **Mounting**: Preact's `render`, the screen's node in its host (a leaf's content; after `.cm-contentContainer` or first in `.mod-footer`), writes to Obsidian's nodes (`--tc-block-lift`, `.cm-content`) | — | `drivers/mount.ts`: Preact `render`, `createElement`, `append`/`insertBefore`/`remove` of the screen's own node | — | `MountTarget`, `mount`, `unmount` |
| 19 | **Time** | — | `obsidian/runtime/lifecycle/Timers.ts`: `setTimeout`, `setInterval`, their clears, `requestIdleCallback`, `queueMicrotask` | — | `session.after(ms, msg)`, the minute |
| 20 | **Host services**: notices, opening a note or a link, the reach outside Obsidian | — | `obsidian/hostServices.ts`: Obsidian `Notice`, `workspace.openLinkText`, `getLeaf`, `outside()` (`open`, `browse`, `runScript`, decision 37) | — | `notice`, `openNote`, `outside` |
| 21 | **The tasks file and the core** | the runtime (P3) | `obsidian/runtime/persistence/TasksVault.ts`: `vault.process`, `vault.read`, `vault.create`; `obsidian/runtime/replica/Door.ts`: `callDoor`; `obsidian/runtime/network/CalendarLane.ts`: `Http` | — | `Runtime`, `HostSession` |

Rules that only format what is drawn (`dayTitle`, `dueLabel`, `cardDue`, `dayMonth`, `timeParts`, `durationParts`, colours and paints, `textParts`…) are assigned to `view/` as a whole; stage 3 writes the full assignment of `PURE_RULES` into `tests/guards/owners.ts`, where it is part of the frozen table.

The view kit (`view/kit/`) has one component per thing drawn, each fed by its concern: `Frame`, `Ribbon`, `Column`, `List`, `Card`, `SectionHead`, `Plate`, `Timeline`, `Panel`, `Tree`, `Foot` (capsule, view button, wheel, plus), `Field`, `Bar`, `Sheet`, `Menu`, `Float`, `SearchPanel`, `FullCard`, `SettingsRows`. `view/Screen.tsx` is the one root; it draws `Layout.regions` with them.

## Guarantee

Per concern: the owner, the test files that enforce it, what they rule out, and how anything a static check cannot see is closed. The guards common to every row are `tests/ownership.test.ts` (the APIs, the exports, unknown files, the frozen table), `tests/onePlace.test.ts` (one model, one union, one update; `Place` read once; capabilities only gate), `tests/kit.test.ts`, jscpd, the matrix (G5) and the trap (G6).

| Concern | Owner | Enforced by | Rules out | The rest closed by |
|---|---|---|---|---|
| Layout | `screen/layout.ts` | `onePlace`, `pureRules`, `geometry`, `kit` | a second list builder (`leafRows`, H15); width or share computed in a view; a layout chosen by reading the place (H1) | **construction:** `Px` arithmetic only here; regions are data drawn by one `Screen`; **matrix:** layout × every place × form, frame logs compared across places |
| Drag and drop | `update/carry.ts` | `ownership` (unknown file), `onePlace` (one union, one router) | a second carry statechart (`leafCarry`, H1; four drag loops of the old UI; section drag apart, D-9; the settings' `RowReorder`) | **construction:** one `Carry` payload union; the router routes every carry message here; **matrix:** carry of each payload in each place offering it; **trap:** pointer capture only from `input` |
| Carry geometry | `screen/carryGeometry.ts` | `geometry`, `pureRules`, `hosts` | a host computing the target (H7, BlockHost today); per-host coordinate conversion (H6); drop places redone without `placeAt` (U18) | **construction:** `Px` arithmetic denied elsewhere; required rules; `ScreenHost` holds no state |
| Motion | `update/motion.ts`, `drivers/motion.ts` | `ownership`, `styles`, `kit` (required `motion`), the exhaustive switch | a second FLIP (`ribbonFlip`, H3; `SnapGlide`, `DayTurn` vs `.turn`, M7); CSS state transitions (H4, U16); a cause decided anywhere else | **construction:** closed `MotionCause`; CSS motion only under `tc-m-…`; **trap:** `animate`, `requestAnimationFrame`, style writes; **matrix:** frame recorder per cell, logs equal across places |
| Measurement | `update/measure.ts`, `drivers/measure.ts` | `ownership`, `geometry`, exports frozen | `Measure.leafColumns` beside `Measure.carry` (H6); motion's own box reads (report A: two today); 40 readers of the old UI | **construction:** exports frozen to `measured` and `boxesNow`; **trap:** every geometry read |
| Scroll | `update/scroll.ts`, `drivers/scroll.ts` | `ownership`, `kit` (required `scroll`) | `RibbonGlide` beside `EdgeScroll` (H9); `ScrollHold` and `ScrollGlide` side by side (M4); the native smooth path beside the glide (report A) | **construction:** one file; scroll writes denied elsewhere; **trap:** `scrollTo`, `scrollTop` writes; **matrix:** reveal and edge scroll in each place, with the note's outer scroller |
| Focus | `update/focus.ts`, `drivers/focus.ts` | `ownership`, `hosts` (readonly fields), `kit` (required `focus`) | a host's own `focusing` and `focusNow` (H10); nine focusers of the old UI | **construction:** focus is a model field taken last by the loop; **trap:** `focus`, `blur` |
| Keys | `update/keys.ts`, `drivers/keys.ts` | `ownership`, exports frozen | `Keys.leaf` beside `Keys` (H8); keys registered twice by place (old `TaskCalendarView` and `ProjectBlocks`) | **construction:** the policy is `Layout.keys`, read only here; **trap:** `Scope`, key listeners; **matrix:** keys × place × form |
| Input and gestures | `update/gesture.ts`, `drivers/input.ts` | `ownership`, `hosts` | a host's `pressed`, `finger`, `edge` state (U20); a second recognizer; a place-shaped long-press timer | **construction:** one gesture slot in the model; the long press is a timer command; **trap:** pointer listeners, capture |
| Entry | `update/entry.ts`, `drivers/editors.ts` | `ownership`, `pureRules` (`entryJobStep`) | `leafEntry` with its own look and `coming` (H11); a second engine in the full card (old `FullScreen`); the entry look in a host | **construction:** the look comes from `Layout`; the full card's subtasks route to the same owner; **matrix:** entry in each place and form (the phone bar in a note included) |
| Menus and layers | `update/layers.ts`, `drivers/overlay.ts` | `ownership`, `kit` | `LeafMenu` with its own placement (H12); the separate bulk menu of the old UI | **construction:** one stack, one kit `Menu`; placement is `measure` + `motion`; **trap:** `Menu`, `Modal` |
| Search | `update/search.ts` | `ownership` | `leafSearch` with its own reveal (H13); a per-screen reveal (decision 53) | **construction:** one reveal, gated by `filterClears`, `dayMoves`, `writesPlace`; **matrix:** search × place × form |
| Sections | `update/section.ts` | `ownership` | `leafSection` (H14); headers drawn by two renderers (old `TaskList` and `ProjectTasks`) | **construction:** one kit `SectionHead`; the lift is a carry payload |
| Selection | `update/select.ts` | `ownership` | a second picking path per place | **construction:** ⌘ and Shift picks gated by `modifierPick`; **matrix** |
| Full card | `update/full.ts` | `ownership` | a full card per place | **construction:** one kit `FullCard`, mounted where the screen's frame is; **matrix** |
| Context | `update/context.ts` | `ownership`, `onePlace` | a note writing the device's filter, place or carry (report C, §3); `setNoteViewMode` chosen by a branch | **construction:** the writes are gated; the mode's method is `Layout.modeWrite`; **matrix:** the note's cells assert the device's state unchanged |
| Chrome | `update/chrome.ts`, `drivers/chrome.ts` | `ownership` (`Platform` only here) | `is-mobile` read in six places (old UI); body classes written elsewhere | **construction:** `form` enters once, through `Place`; **trap:** class writes on `body` |
| Mounting | `drivers/mount.ts` | `ownership`, `hosts` | an adapter writing the DOM; a second render root | **construction:** `render` only here; adapters name a target as data |
| Time | `runtime/lifecycle/Timers.ts` | `ownership` | timers in drivers, hosts or views; a host arming its own long press (U20) | **construction:** timers are commands and the session's `after`; **trap:** timer globals |
| Host services | `obsidian/hostServices.ts` | `ownership` | notices and links opened from anywhere | **trap:** `Notice`, `open` |
| The file and the core | the runtime | `architecture.test.ts`, decision 10 | a second replica or core instance (D-6) | **construction:** `Door` instantiated once per runtime |

**The screen as a whole:** one `Model`, one `Msg`, one `update`, one `Program` instantiation, one `Screen`, one `ScreenHost` (`onePlace`, `hosts`); a place is data and a new place is a new constructor plus its matrix column, nothing else (§Migration, stage 5 checks that its diff touches no owner).

## What each earlier failure meets

Every item of report B: the three specs' failures (M1–M9, D-1–D-9, U1–U20) and the twenty holes (H1–H20). Each meets the guarantee at the principle that let it through. The iPhone spec's items (D-…) concern the Swift frontend; what they teach is applied here to the plugin, and their Swift counterparts stay with `frontend-swift`.

| Item | What let a second mechanism in | Killed by |
|---|---|---|
| M1 | "One" meant one per class of jump, not per concern across screens | G3: one row per concern in a frozen table |
| M2 | "One renderer" as a list of places | G1: one `Screen`; G4: the kit is the only renderer |
| M3 | New renderer under the old draws, never removed | G8: one switch deletes the old UI |
| M4 | "Every scroll through one scroll" with no guard | G3 row 6; G6 |
| M5 | Decisions naming new classes with no owner | G3: unknown files fail; G9 |
| M6 | Interruption fixed per class | G4: one motion owner; `motionInterrupted` is one message |
| M7 | Two day turns found at a merge | G3, G7 (jscpd), G9 per stage |
| M8 | Two drop answers, one per frontend | G4: required rules; the core answers once |
| M9 | Done when measured behaviour only | §Done when: the owner table, guards with fixtures, the matrix, the trap |
| D-1 | "One mechanism" scoped to one host | G1, G5: every place in the matrix |
| D-2 | Two core answers for one question | G4: one assigned rule per question |
| D-3 | A drop path kept beside the one | G3 row 2; unknown files |
| D-4 | Custom code allowed if reported | G3: no exemption list; the table frozen |
| D-5 | Removals not revisited after the premise changed | G8: the freeze may only shrink; G9 |
| D-6 | A second core instance | Row 21: one `Door` per runtime |
| D-7 | Divergence written as policy | G1: places differ only in `Place` data |
| D-8 | No check on surviving flags or owners | G3, G8 (`oneSwitch`) |
| D-9 | Section drag a variant held by decisions | G4/G3: the section is a carry payload |
| U1 | Migration by host | G1, §Migration: by concern, the main screen first, the note as data |
| U2 | Flags per place | G8 |
| U3 | Tree split by layer, not concern | G3: files named by concern, unknown files fail |
| U4 | "One model" never defined as one type | G1: one `Model`, one `Program` instantiation |
| U5 | `needs(model)` per screen | P2 step 3: one `needs`; the root need is `Layout` data |
| U6 | No owner of the frame order | G2: `ScreenHost` |
| U7 | The host as effect runner; stores plural | G2; decision 31 rewritten: one store |
| U8 | A block-shaped carry | G3 rows 2–3; decision 54 rewritten |
| U9 | Decisions phrased "in the block" | §Decisions, reviewed |
| U10 | Reviews of one diff against principles | G9: the whole tree, one structural question |
| U11 | E2E old against new, per place | G5: logs compared across places |
| U12 | Done when without ownership | §Done when |
| U13 | Traceability counts rows | Traceability rerun: owners are concerns of the one screen |
| U14 | The freeze lets old code live and grow | G8: content hashes, master's versions only |
| U15 | No uniqueness guard | G3, G1 |
| U16 | CSS state transitions | G4 CSS rule; decision 34 revised |
| U17 | Any file under a driver's folder | G3: an owner is one file |
| U18 | Pure rules listed, not required | G4: required use |
| U19 | Block-shaped driver APIs | G3: exports frozen to intents; `Measure.stack` reshaped (§Migration) |
| U20 | The host holds interaction state | G2: readonly fields; G3 rows 5, 9, 19 |
| H1 | `LeafModel`, `leafCarry`, `LeafMsg` | G1 (one `Model`, `Msg`, `update`; place names banned), G3 (unknown files; one router) |
| H2 | `LeafHost` with its own draw and `run` | G2: adapters import only `ScreenHost`, `place`, `obsidian`; 120 lines |
| H3 | `drivers/motion/ribbonFlip.ts` | G3: an owner is one file; `animate` denied elsewhere; G6 |
| H4 | CSS `transition` on `is-entering` | G4 CSS rule |
| H5 | Two stores for one screen | G1: one `Program` instantiation; decision 31 |
| H6 | `Measure.leafColumns`, per-host coordinates | G3 exports frozen; G4 `Px` |
| H7 | A host's own `targetAt` | G2: host imports; G4 `Px` arithmetic; row 3 |
| H8 | `LeafKey`, `Keys.leaf` | G3 exports frozen; `Layout.keys` |
| H9 | `drivers/scroll/RibbonGlide.ts` | G3: one file; G6 |
| H10 | A host's own focus timing | G2 readonly fields; G3 row 7 |
| H11 | `leafEntry` with its own look | G3 unknown files; the look from `Layout` |
| H12 | `LeafMenu` with its own placement | G3 unknown files; G4 kit `Menu` |
| H13 | `leafSearch` with its own reveal | G3 unknown files; one `needs` |
| H14 | `leafSection` | G3 unknown files |
| H15 | `leafRows` instead of `funnelList` | G3 unknown files; row 1 owns the list builder |
| H16 | A freeze allowance to grow the old UI | G8: allowances gone; content only from master |
| H17 | DOM work outside `obsidian/ui/next` | G3: the guard covers all of `obsidian/`; G6 |
| H18 | A second device flag | G8: one build constant; `oneSwitch` |
| H19 | The reviewer sees only the diff | G9: the whole tree |
| H20 | Each place matches the old one apart | G5: the same scenario across places, logs equal |

## Guards

**Scope.**
- `uiRules` covers all of `obsidian/` (G3). The old UI and the CSS above `/* next */` are frozen by content (G8) and exempt from the other rules until stage 7 deletes them.
- New CSS lives below a `/* next */` marker in `styles.css`.
- The guards' own data (`tests/guards/owners.ts`: the owner table, the API lists, the rule assignments, the kit list) is read by the static guards, the matrix and the trap alike, so the three never disagree.

| Test file | What it checks | G |
|---|---|---|
| `tests/uiRules.ts`, `tests/uiRules.test.ts` | Decision 33's compiler-based reading, deny by default, extended to all of `obsidian/` and to the owner table's API lists; purity of `model/`, `update/`, `screen/`; `callDoor` and the replica only in the runtime; no bare `document` or `window`; `Msg` handled exhaustively. Its `Place` (a file's part and driver) is renamed `PartOf`, so it never reads as the screen's `Place` | G3 |
| `tests/ownership.test.ts` | Every API only from its effect owner; every export surface equal to the table's; no re-export of a host module; every file of `obsidian/ui/next` named by the table; private folders imported only by their owner; the table's hash and the count of mutation marks, pinned (names Max) | G3, G7 |
| `tests/onePlace.test.ts` | One `Model`, one `Msg` (the union of the owners' unions, disjoint), one total router, one `Program` instantiation, one `Screen`; `Place` and `Platform` read only by `screen/layout.ts` and `drivers/chrome.ts`; the gate-only rule; no identifier or path naming a place or a form (`leaf`, `block`, `isNote`, `noteView`, `phone`, `desktop`, `mobile`, `wide`, any case) outside `screen/place.ts`, `screen/layout.ts`, `drivers/chrome.ts` and `host/adapters/`; a timeline's task block is a `slot` in code | G1 |
| `tests/hosts.test.ts` | `ScreenHost`'s imports, readonly fields and its one switch over `Command["kind"]`; each adapter's allowlist and 120 lines | G2 |
| `tests/kit.test.ts` | Intrinsic JSX only in `view/kit/`; kit props closed; `motion`, `focus`, `scroll`, `measure` required | G4 |
| `tests/styles.test.ts` (below `/* next */`) | It scans `.tsx`; every rule under `.task-calendar`; decision 34's names and states; CSS motion only under `tc-m-…` with `--tc-motion-…` tokens; no state class or pseudo-element that changes a box's size | G4 |
| `tests/geometry.test.ts` | `Px` arithmetic, comparisons and unbranding only in the three geometry owners and `motion` | G4 |
| `tests/pureRules.test.ts` | Every rule of `PURE_RULES` assigned to one owner; each referenced by it and by no other owner | G4 |
| `tests/matrix/registry.ts`, `tests/matrix/model.test.ts`; `scripts/e2e/matrix.ts` | The total matrix; `notOffered` proven by `layoutOf`; scenarios at model level and in the test Obsidian; logs equal across places | G5 |
| `obsidian/e2e/trap.ts`, `tests/e2e/trap.test.ts` | The trap, and that it catches a planted call from a non-owner and lets an owner's through | G6 |
| `tests/guards.test.ts`, `tests/guards/fixtures/` | Every reject fixture rejected by its rule, every accept fixture passing; every rule matching a real file and having both kinds | G7 |
| `stryker.config.mjs` (`npm run test:guards:mutation`) | 100 % on the guard code | G7 |
| `.jscpd.json` (`npm run dup`) | No copied block in `obsidian/` or the new CSS | G7 |
| `tests/uiFreeze.test.ts`, `tests/uiFreeze.baseline.ts`, `tests/uiFreeze.ported.ts` | The old UI by blob id, master's versions only, each with its port; the list may only shrink | G8 |
| `tests/oneSwitch.test.ts` | `UI` read once in `main.ts`; no device or synced value chooses a UI; the release build refuses `next` until stage 7; after it, no `UI` and no old UI | G8 |
| `tests/hostLifecycle.test.ts` | Every adapter in each form mounted and unmounted, mid-gesture too, leaves nothing alive (decision 36) | P8 |
| `tests/architecture.test.ts`, `tests/uiDecides.test.ts` | Unchanged: the layers and the UI deciding nothing | — |

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
| A second implementation of a concern | `ownership`, `onePlace`, `kit`, `geometry`, `pureRules`, jscpd; the matrix's cross-place logs; the trap |
| A place deciding anything but data | `onePlace` (the place read once; capabilities only gate); `hosts` |
| A note writing the device's filter, place, day or carry | the note's matrix cells |
| Old and new UI on master together | `oneSwitch`, `uiFreeze` |
| A guard that checks nothing | `guards.test.ts` (non-vacuity), mutation testing |

## Resolution

| Class | Where it lands |
|---|---|
| M1 settings tab | `Places.settings()`: the same screen, its own place (stage 6) |
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
| R7 guard scope | §Guards: all of `obsidian/` (G3) |
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
| R17 two in-memory copies while old and new coexist | never shipped together: one build constant, and the merge that switches deletes the old UI (G8) |
| R18 settings from outside writers | `PluginSettings.get()`, refreshed on `onChange` (P3) |
| R19 entry job order and the refresh rule | synchronous forms in the core (P3) |
| R20 replay rolling back the projects screen | only text, history and ids come from replay (P3) |
| R21 "the core" against the pure rules | the rules are imported directly; `callDoor` stays in the runtime (P2, §Guards) |
| R22 what views a screen needs | `needs(model)` per screen, recomputed on every replica change (P2) |
| R23 kept parts after a replay | `tasks.reconcile(idMap, dropped)` (P3) |
| Root, rev 8: the dispatch loop | P2's loop: door calls right after `update`, answers fed back before render, views reach the model as data |
| Root, rev 10: the work owned by place (report B) | G1–G9; §What each earlier failure meets |
| A note sharing the device's filter, place, day and carry (report C, §3) | the note's `Place` gates them (G1); §Old bugs and contradictions |
| R24 the UI's mechanisms not unique (the traceability's class for revision 11) | §The owner table; every row's owner is a concern of the one screen |

## Migration: by concern, the main screen first, one switch

The old screen keeps its own services, untouched, until it is deleted. Nothing of the new UI reaches master, or Max, before stage 7, which switches every place at once and deletes the old UI in the same merge (G8). Until then the e2e build holds both, behind the build constant `UI`: each sees the other's writes as outside changes and rebases, as the plugin and the iPhone app do (revision 10's reasoning stands). Stages 1 and 2 are built; stages 3–7 replace revision 10's slices 3–7.

**Every stage ends the same way:** every guard green with its fixtures, the matrix complete for the places that exist, the trap clean, mutation at 100 %, jscpd at 0, the behaviour review done and a structural review (G9) clean. A stage that touches the core is led by `backend` first, as revision 10 says.

| Stage | What | Release |
|---|---|---|
| 1 | **The runtime and the core's part** (built, kept as is). | — |
| 2 | **Guards, freeze, the lifecycle test, the e2e harness** (built, kept; extended in stage 3). | — |
| 3 | **The guarantee, and slice 3 reshaped onto the one screen.** <ul><li>The owner table into `tests/guards/owners.ts`, with every guard of §Guards, their fixtures (H1–H20 and the code-shaped items of M, D and U first), mutation, jscpd, the trap, the matrix's registry, `UI`, the content freeze.</li><li>Slice 3's code onto `Model`, `Msg`, `update`, `Screen`, `ScreenHost`, `Layout` and the kit (below), with `Places.main()` the only place: the main screen's Rows and By project lists, cards, sections, entry, menus, selection, search, the full card and the carry between lists, in a fill frame. No note adapter yet.</li></ul> | — |
| 4 | **The main screen, region by region**, each region adding to the existing owners only: <ol><li>the timeline (lanes, events, the now line, zoom, slots, its drops and stretches);</li><li>Two columns and the ribbon, the wheel, both swipes, the day turn, the Done column;</li><li>All columns and the dividers;</li><li>the panel and the tree, the filter and its title, the tree's lift and drops, the hover-open, the left-edge reveal;</li><li>the carry across every target, select mode across columns, the bulk menu, the sources and event menus, the missing file.</li></ol>Each region ends with its matrix cells and its smoke subset. | — |
| 5 | **The note as a `Place`.** `Places.note(path)`, its gates in `layoutOf`, `host/adapters/note.ts` (today's `NoteBlocks` without its DOM work, which goes to `drivers/mount.ts`), the inline frame in the kit's `Frame` and the scroll chain. Its matrix column. **The stage's diff touches no pure owner but `screen/layout.ts`**, and no effect owner but `mount` and `scroll`'s chain: a place that needs more is a missing capability, added at stage 4's owner, never a branch here (`tests/onePlace.test.ts` checks the diff against the stage's base). | — |
| 6 | **The settings tab as a `Place`.** `Places.settings()`, `host/adapters/settings.ts`; its rows reorder as a carry payload, its fields through entry, its menus through layers. Its matrix column. The same diff rule as stage 5. | — |
| 7 | **One switch, and the old UI deleted in the same merge.** The release gate passes, an independent QA on a copy of Max's real file finds nothing, then one merge into master: `main.ts` mounts the new UI for every place; `UI`, the old UI (`CalendarScreen` and everything only it uses), the old CSS above `/* next */`, `Picks`, `Reload`, `WriteQueue`, the old services' plugin wiring, `createServices` for the UI, the freeze and its baselines are deleted; `oneSwitch` turns to its final form. | ★ with Max's phone checklist |

**What of slices 1–3 is kept, renamed or reshaped** (report A):

| Fate | What |
|---|---|
| **Kept as is** | The whole runtime (23 files): `Program`, `Store`, `HostSession` are generic; the `Program` is instantiated once, by `ScreenHost`. `model/`: `answers`, `assertNever`, `card`, `monthGrid`, `section`, `select`, `taskMenu`, `layers`, `search`, `full`, `commands`. `recognizers/press.ts` (as `update/gesture/press.ts`). View leaves `Card`, `List`, `Sheet`, `icons`, `entry/Bar`, `carry/SelectFoot` (into `view/kit/`). Drivers `focus`, `keys`, `overlay`, `chrome`, `input`, `scroll`. The e2e harness, the recorder, the shots, the budget. |
| **Renamed** (the logic is generic, the types say block) | `BlockMsg` → `Msg`, split into the owners' unions; `update/menu`, `full`, `ids`, `fullActs`; `view/menu/TaskMenu`, `full/FullCard`, `carry/CarryFloat`; `drivers/islands` → `drivers/editors`; `BlockKey` → `KeyIntent`; the CSS root `tc-n-block` → `tc-n-screen` with the frame's variant a kit prop. |
| **Reshaped** | `model/block.ts` → `model/Model.ts` (with `place`) and `screen/layout.ts`; `BlockLists` → `Layout.regions`, and its eight hand-written flatteners → `rowsOf(layout)`. `model/lists.ts` → layout's private part. `model/carry`, `carryPlace`, `carryView` → `update/carry.ts` and `screen/carryGeometry.ts`: per-list scrollers, timeline, tree, section and settings targets, `Px`. `model/entry.ts` (`entryLook` from `Layout`), `menuNeeds.ts`. `update/block.ts` → `update/update.ts` (the router), `update/motion.ts` (`withMotion`, `sameRows`) and `update/context.ts` (`modePicked` through `Layout.modeWrite`). `update/search`, `select`, `section`, `acts` read `Layout`, not `noteView(model)`. `view/Block.tsx`, `BlockRoot`, `Layers`, `search/Search` → `view/Screen.tsx` and the kit's `Frame`, `Foot`, `SearchPanel`. `drivers/measure.ts`: `Measure.stack`/`carry(stack)` → boxes per `MeasureKey`. `drivers/motion.ts`: the block frame's height hold → the pin (P6) under the motion cause of the lift; its own box reads → `measure.boxesNow`; the `put`/`inline` helpers → `mount`. `host/block/BlockHost.tsx` → `host/ScreenHost.ts` (`draw`, `run`, the input routing; `blockProgram` and `entryDoor` gone into `update`), its gesture state into `Model`, its long-press timer a command. `NoteBlocks.ts` → `host/adapters/note.ts` (stage 5). `composeRuntime.ts`: no `NewScreens`, the feeds always given. |
| **Deleted** | The `newBlock` device value (`task-calendar:new-screens`), `NewScreens`, every block-shaped name the guard bans. |

## Tests

1. **`update` (unit):**
   - every decision 55–87 and fix commit as a replayed message log;
   - every A16 rule;
   - pins (changed, gone, hidden-not-gone, a Sync re-id);
   - identity across create, rename and undo;
   - midnight during a swipe;
   - bounds;
   - every model-level cell of the matrix (G5), each place's model through the one `update`.
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
   - **Old against new** at rest where the behaviour is meant to be the same, in the e2e build, which alone holds both UIs (G8).
   - **The matrix** (G5): every cell's scenarios, with the frame logs of one concern compared across places, and **the trap** (G6) armed on every e2e run.
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
7. **The guards' own tests** (G7): the fixtures, non-vacuity, mutation at 100 %, jscpd.
8. **Max's phone checklist at the ★** (under 5 minutes): momentum scroll, the rubber band, the real keyboard and its rising on a pick, a lost lift.

## Done when

- Every concern of the owner table has its owner and no other code reaches its APIs; the table's hash is the one Max approved.
- Every guard of §Guards is green; every hole of report B has its reject fixture; every rule matches real files; mutation scores 100 %; jscpd finds nothing.
- The matrix is complete for every place and form, at model level and in the test Obsidian, with logs equal across places and the trap clean.
- The traceability, rerun against the final revision, leaves no row over and maps every row to a concern of the one screen.
- The release gate passes, the budget holds, an independent QA on a copy of Max's real file finds no defect, and the phone checklist passes at the ★.
- The old UI is gone in the merge that switched, master never held both, and `docs/plugin/` says what the screen does (the fixes of §Old bugs included).
- The last structural review found nothing.

## How it is built

- `backend` makes the core part of each stage that needs one. One `frontend-obsidian` agent per stage or region after that. The lead checks every diff, test and screen.
- **Behaviour review:** after each stage or region, a fresh reviewer gets the diff, the principles and that part's traceability rows, and finds where the code breaks a principle.
- **Structural review (G9):** a second fresh reviewer gets the owner table and the whole tree, and finds a concern implemented twice or a branch on place or form outside `screen/layout.ts`. Its findings become reject fixtures before their fixes.
- After stages 3, 4 and 5, a fresh QA agent is told to break it.
- A finding is answered by naming the principle, the guarantee or the inventory row that let it through, and fixing that.

## Old bugs and contradictions, decided

From report C, §3 and §2. Each is decided by `docs/plugin/`; where the docs are silent, by what the screen does today (a rework keeps the current behaviour). The docs that need words are changed in the stage named.

| # | What | Decided | Stage |
|---|---|---|---|
| 1 | A search in a note clears the **main screen's** filter (`CalendarScreen.ts:881`) | `screen.md:99`: a note's block has one project and no cross. With `filter: "fixed"` a find the note's project hides opens on the full card, as a Done find without the ribbon does; the device's filter is never written | 5 |
| 2 | A search in a note moves the main screen's funnel place | `writesPlace: false`: a note never writes it. On the main screen a find still sets the place in every mode, as today | 5 |
| 3 | A note's day list can leave today with no way back (the quick bar's day, a find on another day) | `screen.md:99` shows no day navigation in a note. With `days: "today"`, a task written for another day leaves the list as a card moved by its menu does; a find on another day opens on the full card | 5 |
| 4 | A note starts the device's carry, writing over a main-screen carry in another tab | `tree: false` gates the device's carry (`deviceCarry`); the note's carry lives in its own model | 5 |
| 5 | A note builds and hides a calendar, and fetches its events | `calendar: false`: nothing drawn, no need asked | 5 |
| 6 | A stale comment says the block has no Undo capsule | Gone with the old code; the note's foot has Undo, ⋯, the view button and the plus (`screen.md:99`, decision 29 of the projects spec) | 7 |
| 7 | `screen.md:39` misses the top row of modes without column titles | The core's `topRow` (projects spec decision 22) stands; `screen.md:39` gains the case: in Rows and By project without a filter the folder button stands in a row of its own | 4 |
| 8 | `screen.md:99` omits ⋯ in the note's foot | `screen.md:99` gains it (Search, Select tasks), as the screen does today | 5 |
| 9 | The inventory marks the still layouts' divider desktop only | `screen.md:87` and the code: on the phone too. The traceability notes it on A8.3 | 4 |
| 10 | `wide` is a platform, not a width | The rule stays; its name in the UI is `form` | 3 |
| 11 | A note's first frame lacks the Subprojects row (`firstView` with `branches: false`) | `screen.md:99`: the note's view menu has it. `backend` reads the device's Subprojects in the note's first view | 5 |
| 12 | Double click on free room works in funnel and Rows lists, not in By project | The kit's `List` owns it, so every list has it, By project's parts and the note's lists included; `tasks.md:19` says «списка» for «колонки» | 4 |
| 13 | Not seen on screen: the phone's bar in a note (`--tc-keyboard-room: 0`), and the note scrolling when a carry reaches the window's edge | Entry × note × phone and carry × note × both forms are matrix cells; the bar rides the keyboard as on the main screen, and an edge scroll that reaches the stack's end goes on in the note's scroller (`Layout.scrollers`) | 5 |
| 14 | The full card and the desktop search are confined to the note's frame (report C, §2.4) | Kept: the screen today, and no board shows otherwise. The search's panel scrolls the frame's top into view before it opens (as a menu's `intoView`, decision 50), so it never hangs off-screen | 5 |

## Questions for Max

None. Every place-shaped difference above is answered by `docs/plugin/` or by the screen as it is today; the rest of revision 11 is how the code is built, which Max sees only as the screen staying the same in every place.

## Decisions

**Reviewed for revision 11.** Every decision was read against G1–G9. A decision written "in the block", or allowing several stores, CSS motion, a flag per place or logic in a host, is revoked or rewritten; each keeps its product behaviour, and a rewritten one says so in its first words.

| Decisions | Verdict | Why |
|---|---|---|
| 1–11, 13–18, 20–25, 27–30, 32 | Kept | The runtime: no place, no host, no mechanism of the UI |
| 12 | Rewritten | Polling started "with a mounted screen (slices 3–4)": now with the first screen whose `Layout` draws a calendar |
| 19, 26 | Rewritten | "A host" drew and opened the session: now `ScreenHost`; adapters reach nothing of the runtime |
| 31 | Rewritten | "A host makes its stores": one store per screen, the one `Program` (H5) |
| 33 | Rewritten | Scope all of `obsidian/`; the owner table instead of driver folders (U17, H17); kit-only intrinsic JSX |
| 34 | Rewritten | Names and states kept; CSS motion only in the motion owner's classes (U16, H4) |
| 35 | Revoked | The line freeze with allowances (U14, H16): G8's content freeze |
| 36, 37 | Rewritten | Hosts are the adapters, in both forms; the e2e build holds `UI` and the trap |
| 38–42 | Kept | The fixture, the test Obsidian, the recorder, shots and budget: place-free |
| 43 | Revoked | A device flag for one place (U2, H18): one build constant; readiness kept |
| 44, 56 | Rewritten | "The block's height": the inline frame's, held only by the pin |
| 45, 47, 49, 60 | Kept | Generic already (45 names the kit's `act`) |
| 46, 48 | Rewritten | Variables from the layout owner through `motion`; "the frame" is the region |
| 50, 51, 52, 53, 55 | Rewritten | The column and the look a host handed in, the full card "inside the block's frame", "the search in the block", `islands` and the mount node: now owned by scroll, entry, full card, search (gated by `Layout`), editors and mount |
| 54 | Revoked as written, rewritten | "The carry in the block" (one stack, no tree, no timeline; U8): one carry for every payload and place |
| 57 | Rewritten | The e2e "block run" per place (U11, H20): the matrix run, logs compared across places |
| 58, 59 | Rewritten | The plus's fade aside was a CSS transition: the motion cause `fadeAside`; both are carry payloads |

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
12. *(Revision 11: rewritten.)* **A feed keeps the one record of its last good run** (`CalendarFeed.lastRun()`, `GoogleCalendarFeed`'s own): the lane asks `calendarsRefresh.feedDue` over it and runs the feed (`refresh(true)`) when `ask`/`feedDue` say so, and the old screen's polling reads the same record, so the two never fetch twice for one fact. Polling by the refresh interval (`CalendarPolling`/`keepFresh`) starts with the first mounted screen whose `Layout` draws a calendar, and stops with the last; a place without one asks for no events.
13. **The calendars' files are one set for every day, so the newest read wins**, not the latest ask of a day: the files are read after every feed run, on every change of one of them in the vault (an export, another device), and for each ask; a read overtaken by a newer one is never applied. The phone's export is asked first only when `calendarsRefresh.ask` answers `exportFirst` (Max's Refresh now: `Runtime.refreshCalendars("refresh", true)`), never on polling, an open or a source changing. A file that cannot be read becomes its source's problem. `Runtime.refreshCalendars(reason)` takes no day.
14. **A write that fails** (a disk error, a missing folder) is told once and waits: the next call, a change of the file or of the settings tries again; it never retries on its own. `Runtime.persisted()` resolves once nothing more can be written now, and `Runtime.stuck` says what the queue waits on. On unload the queue runs on until it is empty or stuck.
15. **The pending log is retired by sequence, not by text:** calls whose net effect gives back the text written are in the file, and leave the log.
16. **A read of the file lands only while it is the newest:** every read and every base a write or a replay sets bumps a generation, so a slow read never rolls the replica back.
17. **A refused write leaves `vault.process` by throwing**, so Obsidian writes nothing and tells no change.
18. **The undo history goes with its file:** when the tasks file goes or `tasksFile` names another, the history is cleared.
19. *(Revision 11: rewritten.)* **A store draws its first frame on its own**, in the microtask after it is made (views read, then the render), with no message; when a screen must draw inside the mounting event, `ScreenHost` calls `store.flush()`. No adapter calls it.
20. **`Runtime.ready()`** resolves once the replica is first built or the runtime unloaded first. It rejects if the first build failed (the first read of the file); asked after that, it waits for the first build that works. A runtime unloaded during its start undoes what the start set up and never starts its clock.

21. **Every async outcome carries the generation of what it depended on, and is thrown away if that moved.** The writer keeps a file epoch, moved by every file gone and every file read anew (`tasksFile` changed): a write or a create that lands under an older epoch sets nothing (no base, no history, no echo); a read lands only while it is the newest (decision 16). The lane's reads keep their own tickets (decision 13). The settings listener that follows `tasksFile` is registered before the first read, so a change during it is followed.
22. **The log's base is the whole replica but the pending text calls.** Undo steps that change without the text (an undo that met a conflict) become the base's when nothing is pending, and a pending call when something is, so no rebase brings old steps back.
23. **A read's answer is taken like a call's**, every part (text, settings, Projects screen, ids, history) kept where it is kept; it is only never logged. This holds for every read path: views, the clock's day, the lane's questions. On iOS, `calendars.events`/`known` carrying the choice of calendars over is saved this way.
24. **A failure is kept by its kind.** A read that fails is told once and never marks the writes stuck; a write that fails is what `Runtime.stuck` shows. A read that fails at the start rejects `ready()`.
25. **Nothing outlives unload, nothing rejects unheard.** The lane's silence timers are cleared and its reads land nowhere after unload; every promise the runtime starts on its own ends in the failure path or the action log; the minute's clock re-arms even when a tick fails.
26. *(Revision 11: rewritten.)* **A screen reaches the runtime through its own session** (`Runtime.openHost()` → `HostSession`), opened by `ScreenHost` when it mounts: a carry belongs to the session whose call started it, and a session's teardown ends only its own carry and its own subscriptions. Unload ends any carry. `ScreenHost` imports only `obsidian/runtime/Runtime.ts` of the runtime, which re-exports what it uses (`Store`, `HostSession`, the types, `sectionRef`); the adapters import nothing of it (G2); the old `obsidian/ui` imports nothing of it (`tests/architecture.test.ts`).
27. **A call runs as made, and only a stale answer runs again with fresh keys:** the door finds a task by its key's id wherever the replica's own writes moved it, so `tasks.freshArgs` is needed only when a line changed elsewhere; a replay always uses it. The replica's `fetched` is the sources the runtime was given feeds for.
28. **What depends on the replica starts when the replica is first built, whichever read builds it:** the first read at the start, or a later read after a change of the file when the first one failed. The minute's clock starts then and `ready()` resolves then.
29. **A replay pairs the ids a call gave kind by kind** (`DoorAnswer.createdKinds`): a task's with a task's, a section's with a section's, in order, and a kind only when the replay gave as many of it; an id is never mapped to a line of another kind.
30. **`persisted()`, `drained()` and unload wait for the reads the writer started itself** (after a change event or a write), not only for its writes.
31. *(Revision 11: rewritten.)* **One store per mounted screen,** made by `ScreenHost` through its session (`HostSession.store`), the one instantiation of `Program<Model, Msg>` (G1); the session's teardown disposes it, so no pass already scheduled renders into a gone screen. A screen never splits its model over several stores (report B, H5).
32. **One run per feed at a time:** an ask while a feed runs joins that run, as `CalendarPolling` did.

Made while building slice 2 (the guards, the freeze, the lifecycle test, the e2e harness), revised after its review:

33. *(Revision 11: rewritten.)* **`uiRules` reads the code as the compiler does, and denies by default, across all of `obsidian/`.** The pure parts (`screen/`, `model/`, `update/`) are a project of their own with no DOM and no host (`tsconfig.next-pure.json`, compiled by `npm run build` and by the test): a window, a document, a timer or an element cannot be named there. Everywhere else in `obsidian/` (the old UI only while frozen, G8), TypeScript 7's own API (`typescript/unstable/sync`, its Go compiler; `typescript` pinned to an exact version because the API is marked unstable) resolves every name, member, shorthand property, import (through its alias to what it names) and type to its declaration, so an alias, a string key, a destructuring, a template literal or `Object.assign(el.style, …)` all reach the same declaration. **Anything declared by the host** (the DOM's, the workers' and Node's libraries, Obsidian's module and what it adds to the DOM, Preact's `render`, CodeMirror, and the language's doors to the host and to code named at run time: `globalThis`, `Reflect`, `Function`, `eval`, `Proxy`…) **is reachable only through the owner table** (`tests/guards/owners.ts`): each effect owner its row's APIs beside what every effect owner may (its element's neighbours and own window, data attributes, events as they come, its own listeners); a view the DOM's element and event types and a field's `value`/`checked` and a key event's `key`; `ScreenHost` the effect owners' intents; an adapter Obsidian's view lifecycle and events, leaves and files' names (never files' contents, notices, menus or Obsidian's DOM helpers) and nothing of the DOM. Whatever no row names fails as «deny by default»; `HOST_WORK` names the work a denied reach is, and a few kinds are allowed nowhere (a bare window or document, a door to code named at run time, a class read, a class written whole or from a list, a selector naming a class by `.x` or `[class…]`, an attribute named at run time, the class list taken whole). Attribute names are compared whatever their case. Every class `chrome` writes is a literal `is-…`; every class `motion` writes is a literal `tc-m-…` of `MOTION_CLASSES`. **A host value stays in the host's types** (unchanged: outside the effect owners a value of a DOM, worker or Node type flows only into a type that holds one or Preact's `ContainerNode`; never into a type literal of its own, a cast, `unknown`, `any`, `{}` or a generic helper's `T`; in an effect owner never into `any`, `unknown` or `{}`). A host member named at run time and any access on an untyped value fail. A switch over a `…Msg` union's discriminant, or a `Command`'s, ends in `assertNever`. In a view no `style` or `dangerouslySetInnerHTML`, by JSX, by a spread, or by `h()`/`createElement`, and outside `view/kit/` no intrinsic element (G4). `next/` holds only `.ts` and `.tsx`. A file's part is read by its folder and its owner by its path in the table (`PartOf`, renamed from the guard's old `Place`); a file the table does not name fails (G3). The self-tests are the fixtures of G7.
34. *(Revision 11: rewritten.)* **The new CSS's names and states** stand as revision 10 had them: below `/* next */` a selector names only the new screen's classes (`tc-n-…` for a kit component, `tc-m-…` for the motion owner's, `is-…` for a state, the root `task-calendar`); every rule is under `.task-calendar` named outside any functional pseudo-class; a state is an `is-…` class, any attribute selector, `:has()` anywhere, a pseudo-class of what the user does, or a `body` class Obsidian does not set; no size property under a state; no custom property set under a state and read by a size property; no in-flow pseudo-element given content or a size; a size property is anything that sizes a box or its content (the list of revision 10). **What changes:** `transition`, `animation`, `@keyframes`, `scroll-behavior` and `will-change` appear only in rules whose selector is a `tc-m-…` class, with durations and easings only as `--tc-motion-…` tokens (G4); the opacity and transform transitions revision 10 allowed on states are gone, slice 3's foot fade among them (decision 58).
35. **Revoked by revision 11.** Decision 35's freeze (lines per directory, «shrinking passes», allowances with a commit and a reason) let the old UI grow beside the new (report B, H16). It is replaced by G8's content freeze: every old file by blob id, changed only to master's version with its port recorded, the list only shrinking. The two lines that route the old screen's task links through `outside()` (decision 37) are already in the baseline taken in stage 3.
36. *(Revision 11: rewritten.)* **The lifecycle test's hosts** are the adapters, registered in `HOSTS` (`tests/hostLifecycle.test.ts`) as `mount(context, form) → { startGesture, unmount }`, by their path under `next/host/adapters/`; an adapter not registered fails, and each runs in both forms. `tests/helpers/LeakCounter.ts` counts as revision 10 said (listeners on every target of the window's world, `on…` handler properties, observers, timeouts and intervals, frames, idle callbacks, immediates, microtasks not yet run, running animations, scopes, Obsidian event references, subscriptions), after queued microtasks have run.
37. *(Revision 11: rewritten.)* **The e2e build** is `obsidian/e2e.ts`, built by the harness into `E2E_HOME/build/main.js` (`node esbuild.config.mjs production e2e --outfile=…`; `npm run build:e2e` into `.e2e/build/`) with the first line `// task-calendar <version> e2e`; the root `main.js` is never touched (`--outfile` without `e2e` is refused). It is the only build that holds both UIs (`UI`, G8), and it carries the trap (G6) and its source map. After copying it into the scratch vault the harness checks the copy is this run's build: its first line exactly that of `manifest.json`'s version, written after this run's build started and after the last commit. `createServices` and `createDeps` take the `Http` (default `obsidianHttp`), and the plugin's reach outside Obsidian is one protected method in `obsidian/hostServices.ts` (`outside()`: `open` for links to other apps, `browse` for an address in the browser, `runScript` for the Mac's scripts): the e2e build records them, and takes over `window.open` and `location.assign` in its test window, so nothing opens on Max's Mac.
38. **The fixture** is taken once into `.e2e/fixture/` (gitignored with all of `.e2e/`: it holds Max's tasks, never committed) and kept, so baselines stay comparable; `--refresh-fixture` takes it again, and the baselines are recorded again after it (`--update`). The clock stands at 14:20 of the day it was taken. Google's secrets are replaced (`e2e`), the project notes come as stubs holding only the project tag, and the calendars (Google through the fixture network, the phone's and the work files at the paths the settings name) are made up for that day. Every path the fixture names (the tasks file, a note, a calendar) must stay inside its vault: an absolute one or one climbing out (`..`) is refused, when the fixture is read from Max's vault and when the scratch vault is written.
39. **The test Obsidian of the harness** keeps its profile and vault under `E2E_WORK` (default `.e2e/work`); the harness refuses an `E2E_WORK` or `E2E_HOME` inside `~/Obsidian` or inside the repository outside `.e2e/`, comparing paths as the disk does: the nearest part that exists resolved by `realpath` (links, and on macOS the case the disk holds), the rest appended, then compared without regard to case (so `~/obsidian/e2e` is Max's vault). The vault is written over in place each run (a copy of Max's tasks is never moved to the Bin). A port from 9345 free by `ps` and `lsof`; if another session takes it between the check and the launch, the instance just launched (it has no port of its own then) is ended by its own process id and the launch tried on the next port. A launch in the background (`open -n -g`) with Chromium's switches against an occluded window's throttling, and focus emulation; with those, CDP's own input reaches a window behind others, so every touch, click, wheel and the closing of Obsidian's first dialogs go through `Input.dispatch*`, never a click made in the page. Each platform and theme starts clean: the fixture's tasks file written again, the plugin's device storage cleared, the page reloaded into the platform.
40. **The recorder** keys a row by the key the view gives it (`data-row`, the model's row key; on the old screen `data-card`, its task's id), or by its whole title where it has neither, with a count among rows of the same base; each element keeps the key it was first given, so rows of one title never swap numbers as they move, and a key passes to another element only once its own left the DOM, so a remounted row keeps it. A carried card is named by its key (`__e2e.keyAt`), never by a cut title. Each row is judged from the frame it first shows in; a row's box takes in its margin below (a folded parent's fold); the place is the leftmost column showing plus the day after today, with its distance from the stage's edge (the view's left or a docked panel's right). The rules, each proven on a frame log made to reproduce a past bug (`tests/e2e/frames.test.ts`): a step that never settles; a row gone for some frames and back (a remount's flash); in a context step, any row animated or between its two places (cards flying in on a project switch); a row the step does not move that moves, and any row that leaves its place and comes back (a jump under a lift); in a swipe, each column moving as one (columns may change their widths, RibbonColumns), one way, never more than 120 px between two frames (the All columns jerk); overshoot; a rest off; a swipe resting off its column's edge or two places away; gaps or overlaps; a gesture that moved nothing. A step waits a person's pause (500 ms) before acting; the mouse lifts a card by moving it (holding opens its menu), the finger by holding; a swipe starts clear of the divider; the trackpad's wheel goes at a delta every 8 ms. The smoke set adds All columns tried sideways (nothing may move), a project chosen and all again, and a card lifted and held.
41. **Shots** are clipped to the view (Obsidian's chrome is never compared) and compared at 5 of 255 per channel on at most 0.2 % of the pixels (the timeline 6 on 0.3 %), and no more differing pixels may lie together (8 ways) than 4 CSS pixels' worth at the shot's ratio (36 at 3×): a short label one pixel off on the phone view is a tiny share of the shot but a block of touching pixels along its strokes, while the GPU's rounding scatters single ones. A missing baseline fails unless `--update`. Masks are listed by selector and kept with the baseline.
42. **The budget** comes from a CDP trace of each gesture and a fixed tail of 1.2 s (longer than any transition); the recorder starts before the trace and the wait for rest runs after it, so the harness's polling is never traced. Every harness evaluation marks its run in the page (`console.timeStamp`, `HARNESS` in `frames.ts`), and its script, with the frame sampler's own function, is cut out. From the rest: the page's main thread, its frames (each `FireAnimationFrame`), the script run in each frame (the union of the script events, nested ones once), and every task over 16 ms (the 17–49 ms ones the page's `PerformanceObserver` never tells). It fails a trace with no frame or no script of the page (nothing passes on an empty recording), a frame with 8 ms of script or more and any task over 16 ms, and reports the average over the frames that ran script and the longest frame.

Made while building slice 3 (the note block behind `newBlock`; reviewed above for revision 11):

43. **Revoked by revision 11.** `newBlock` as a device value (`task-calendar:new-screens`) was a flag per place (report B, U2, H18). G8 replaces it with one build constant for every place; no device or synced value chooses a UI. What it carried that is not a flag stays: the runtime's readiness is told when `VaultProjects.ready()` resolves (a plugin loaded into an indexed vault hears no `resolved`), and `core/settings.ts` is not touched. The runtime is composed with its feeds always; a place without a calendar asks for no events (decision 12).
44. *(Revision 11: rewritten.)* **An inline frame's height is the stylesheet's:** with `Layout.variants.frame` `inline` (a note), the kit's `Frame` is a column as tall as its stack up to `--tc-block-max-h`, past which the stack scrolls; nothing is measured for it. During a carry the region holds its height as it stood, by the pin under the lift (P6), a motion cause like any other, never a frame-specific hold. The old block was at times 1 px short of its rows (its stack scrolled by a pixel); the new one is not, and the e2e comparison crops that pixel (`fit`).
45. **Views take no event handlers.** Every press goes through `drivers/input.ts`, which delegates by the kit's `act` (`data-n-act`, with the row's `data-n-key` and a `data-n-value`) and feeds the pointer stream to the one recognizer (`update/gesture.ts`); `update` turns an act into its message. Preact's handlers would stay attached to the nodes it removes, which the lifecycle counter counts. *(Revision 11: kept; the act is a kit prop.)*
46. *(Revision 11: rewritten.)* **Every inline style and CSS variable comes from the model through `motion`:** a row's level and branch offsets, a folded card's room, the select circle's room, the regions' widths, are computed by `screen/layout.ts` (or carry geometry for the float) and written only by `drivers/motion.ts`, on the screen's root key `root/screen`. A variant that sizes a box is a kit component of its own kind with literal classes (a two-line card is as tall as its lines; a branch's end, the fold counter, a meta pair, a repeat-only corner, each panel and row kind), and a class that comes and goes is an `is-…` state that sizes nothing (decision 34).
47. **A card's marks** are the core's `TaskItem.marks`: the dot of a task in progress (`progressDot`, the card's `is-progress`), the description's mark (`description`) and the subtask counter (`count`); the card reads no status or `can` field for them. Its `data-status` paints only the full card's subtasks (done ticked, given up struck through).
48. *(Revision 11: rewritten.)* **Motion within one context** is a FLIP over keyed rows, the motion cause `rows`: `motion` reads boxes in the commit phase through `measure.boxesNow`, then slides what moved and fades in what is new; another context (mode, project, the first read) draws in place. A row that leaves fades where it stood and then its room folds, as the old `Motion.leave`: `motion` keeps its node over the frame, fades it, and the rows under it slide up after the fade while the region holds its height (the e2e step «a card done leaves its list» judges it frame by frame, in every place).
49. **Layers** mount in the overlay host's node, under their own `.task-calendar` root; `motion` places them from measured anchors (`data-n-anchor`) and fades them in and out; the close's end is `layerGone`, which unpins the lists. A write pick runs its door call at the tap and the lists change once the sheet has gone (R10).
50. *(Revision 11: rewritten.)* **The task menu** reads the core's `tasks.menu`/`tasks.bulkMenu` as a view need while open; its copy of the card is measured once per menu (`wholeWidth`, `grownStart`); the panel is placed from measurement, under, over or split (`groupsAbove`), and a page change re-places only the panel; a closing menu keeps what it drew; the repeat page writes once at the close (`repeatPage.end`); the month grid is plain date math (no core rule exists for it). Typing picks (Rename, Add subtask, New section, New project) focus their field inside the tap, once it is visible. As the old menu: it opens once its card is in view, the scroller the card scrolls in gliding it in first in the collapse time (the scroll intent `intoView` over `Layout.scrollers`: a list, a note's stack and then the note itself; a finger on it calls the menu off); on the desktop a second click within 250 ms of the one that opened it renames (the gesture `secondPress`, the old double click); the start of the task's description stands by the copy of its card, over or under it where the panel is not, rendered by Obsidian (an `editors` intent, the old `DescriptionPeek`): a tap on it opens the full card, a note's link opens the note.
51. *(Revision 11: rewritten.)* **The quick entry** runs the core's `entry.*` steps over a session kept in the model, and its jobs in the core's order (`entryJobStep`, `queuedEntryJobs` from `contracts.ts`) in `update/entry.ts` (`runEntryJobs`, after every message). The look (`entryLook`) and the cards about to be drawn for a step that asks for them (`coming`) are computed there from `Layout`, never handed in by a host: `ScreenHost` only runs the door command. The field is Obsidian's editor (`drivers/editors.ts`) restyled by a CodeMirror theme from tokens; on Enter the written card takes the field's box and the next field gets a new row key. While typing, the foot fade is a second element (sizing by state is forbidden); on the phone the room at a list's end is a spacer row. The bar is the kit's `Bar` with `Layout.variants.entry` (`bar` over the keyboard, `capsule` beside the field), and on the phone a blur from the keyboard closing ends the entry (`blurEndsEntry`).
52. *(Revision 11: rewritten.)* **The full card** is a layer inside the screen's frame, in every place, pinned by id and following Sync through the needs `tasks.find`/`tasks.fullTree`; the description runs in Obsidian's editor through the core's `description.*`; its subtasks' circles are drawn as the old full card's (width 0, the card's padding kept); its rows are keyed `full/<id>`; the project line selects the project (`tasks.selectProjectNode`), through `update/context.ts` and so gated where the filter is fixed. Its task and subtasks are read by the screen's filter (`tasks.find(key, text, filter)`, `tasks.fullTree(item, filter)`): fixed to a project, they show no folder mark, as the core decides.
53. *(Revision 11: rewritten.)* **The search reveals a pick** through `tasks.reveal`, one reveal for every place, each step gated by the place's `Layout` (report C, §3): where the filter is chosen, it is cleared when it hides the task (`tasks.filterHides`, `screen.md:114`); where it is fixed (a note), a hidden task opens on the full card and the device's filter is never written. Where the screen writes the funnel place, it moves to the task's (Done, Inbox for Backlog, Soon, the calendar); a note never writes it. Where days move, a task of another day takes the day list to that day; where the day is today's (a note), it opens on the full card. A Done task without the ribbon opens on the full card; any other is ringed and scrolled into view (the scroll intent `reveal`).
54. *(Revision 11: rewritten.)* **The carry is one, for every payload and place** (`update/carry.ts`, `screen/carryGeometry.ts`): a card, its subtasks, the picked cards, the plus, a section, a tree node, a settings row, a timeline slot. The geometry is measured once after the lift renders, per list scroller and target in `Px`, with each scroller's offset, and kept fresh by `measured` while edge scroll moves a scroller; the target is the core's drop rules over it, recomputed on each move and told only when it changes; `carryAt` is called when the target changes and only where `Layout.gates.deviceCarry` holds (the main screen: a note never writes the device's carry); the carried cards' subtasks leave the pinned snapshot; the waiting place is a dashed outline; on a drop the pin goes at once and the float flies onto the landed card, on a cancel the pin stays until the float is back. A long mouse click does nothing, a right click opens the menu.
55. *(Revision 11: rewritten.)* **The editors and the mount**: `drivers/editors.ts` (today's `islands`) holds the title field and the full card's editors; `drivers/mount.ts` makes, places and removes the screen's own node in its host (a leaf's content; after `.cm-contentContainer` or first in `.mod-footer` of a note) and writes Obsidian's nodes around it (`--tc-block-lift`, `.cm-content`'s growth). Adapters and `ScreenHost` write no DOM (decision 33).
56. *(Revision 11: rewritten.)* **A field opened in an inline frame grows it** as any row does, to the CSS's tallest (`--tc-block-max-h`), past which its stack scrolls: the old `BlockHeight` fitted the block to what its stack held, the field among it. Only the pin under a carry holds the region's height. Measured in the test Obsidian (a real click on the plus, the desktop): with Today holding a task the old block grew 571→632 px as the new does; on the e2e fixture, Today empty, the old one stayed 572 px while its stack held 606 px in 558 (`BlockHeight` missed the field row's late height, a race of the old block: its field's bar stood 48 px under the frame's foot, scrolled out), and the new one grows to 620 px. On the phone both grow by 60 px. The new screen keeps the old rule, not its race. The e2e shot of a field open in a note compares the frame top-aligned (`fit` cut at the bottom): the old block's shot stops at the window's foot. The bar's buttons each paint over the one before (`z-index`), as the old bar's: a shrunk shift is covered by the flag. Old defects the e2e run shows and the new screen does not repeat: the written card flashing between field and card (19–21 frames), and the old block sometimes cutting the written card's bottom (4 px) after typing.
57. *(Revision 11: rewritten.)* **The e2e matrix run** (`npm run e2e -- matrix [place form theme]`, G5) runs every cell of the registry, each platform and theme starting clean, every step judged frame by frame by the same rules in every place, with the trap armed; one concern's logs are compared across the places that offer it. The old-against-new comparison stays an input to it: the e2e build records the old UI's baselines (`UI` `old`) and compares the new one with them in the same run on the same copy of the file. A caret's blink (CodeMirror's `cm-blink`) is no motion of the screen's: the recorder and the rest wait leave it out. `npm run e2e -- budget [place]` is the budget: 300 tasks, 4× CPU, in each place.
58. *(Revision 11: rewritten.)* **The plus carried** (the old screen's `beginNew`) is a carry payload: pressed and moved, the plus lifts as a float over the same places as a card, a dashed ring standing in its place (solid and filled while the finger is over it); let go on a place, the field of a new task opens there in the same tap through the core's `entry.openAtDrop` (`openAt` in the projects list, `openAtEnd` at a list's end) and the float lands in the field; let go on its ring or nowhere, it flies home. While a card or the plus is carried the plus and the capsule beside it fade aside: the motion cause `fadeAside`, run by `motion` (no CSS transition, decision 34; the old `QuickEntryController`'s look kept); a lifted section leaves them. The region's height is held from the lift's own drawing, by the pin, so a lift that takes rows out of the lists (a section, a parent's subtasks) never shrinks it.
59. *(Revision 11: rewritten.)* **A section lifted by its header** (the old `GroupDrag`) is a carry payload and waits where it stood, as a carried card does: its header's name and plate's words hidden, their places kept; its landing is the drop line over the slot (`groupPlaceOf`, in carry geometry), and nothing under it moves while it is carried. The old list closed over the lifted section and every row under it left and came back; that is not repeated. Let go on another slot it moves there (`tasks.moveGroup`) and the float folds onto its header. A header tapped opens its menu (Rename, Remove section as the core offers them); the name typed in place ends through the core's `sectionName.end` for Enter, Escape and a tap away alike.
60. **A finger's press the recognizer reads ends with no click after it** (`input` cancels its `touchend`): the browser's click would land on what the tap's outcome put under the finger (the plus hid and the field's room took its place, and the click took the field's focus). The e2e block shots mask Obsidian's status bar and the phone's navigation bar (`.status-bar`, `.mobile-navbar`) where they stand over the block (decision 41). A drawing that moves no rows leaves the motions under way running (a carry's next message must not stop the rows still sliding) and reports no card leaving.
