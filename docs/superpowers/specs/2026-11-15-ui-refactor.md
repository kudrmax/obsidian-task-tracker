# Plugin UI refactor: one screen, one mechanism per concern, on the core's door

Issue: kudrmax/obsidian-task-tracker#41 (takes in #40). Branch `ui-refactor`. Revision 14.

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
| 11 | 0: every row's owner a concern of the one screen | **The guarantee did not hold:** three reviews (`rev11-research/R1–R3`) found it enumerated what is forbidden, and every list leaked |
| 12 | 0 | **An arms race:** two reviews (`rev11-research/R4`, `R5`) found the type machinery partly unbuildable (units still compare, two JSX dialects esbuild cannot build, a hash cycle) and contorted, built against a deliberately malicious agent |
| 13 | 0 | **Natural routes still open:** thirty-two hurried feature tasks (`rev11-research/R6`) found fifteen leaks, most from the UI still computing a decision; the architect (`R7`) found six build blockers |
| 14 | 0 | — : the UI decides nothing, a selector of behaviour has one reader, ownership named exactly, weakening made visible (§The one mechanism) |

The faults of revisions 5 and 6 had one cause. The spec treated the core as an asynchronous service the UI waits on, and built machinery around the waiting: read-back, previews, transactions, read-ahead, echoes. The core already has a **synchronous, pure door**, `callDoor(method, args, context) → answer` (`core/application/PhoneCalls.ts`). The iPhone app runs on it, and it covers every `TaskService`, `DayService`, undo, settings and calendar method (a coverage map by space, `DOOR_COVERAGE`, `PhoneCalls.ts:1280`; stage 3a adds `DoorMethods`, typed per method). On Max's real tasks file (31 KB) a whole funnel view costs about 3 ms through it, JSON included (measured locally). Revision 7 puts the plugin on the same door, and the waiting is gone.

Revision 11 adds four research reports, kept beside the inventories in [`ui-refactor/rev11-research/`](ui-refactor/rev11-research/): **A** an audit of the code built in slices 1–3 (what is generic, place-shaped or host-only); **B** a red team of the three failed "one mechanism" specs, with twenty holes (H1–H20) that pass every guard of revision 10; **C** the map of one screen in every place and form, with the old bugs where a note's block shares the device's state; **D** how production teams make "exists once" hold.

## Why revision 11

Max stopped the work after slice 3. Slice 3 built the new UI around the note's block: a `BlockModel` typed on a note, `BlockLists` as the only shape of what a screen shows, a carry measured in one stack's pixels, and a `BlockHost` that orders the frame, interprets every command, recognises gestures and hit-tests the pointer (report A, §2). The main screen would have needed a second model, a second update, a second host and second driver methods. This is the fourth "one mechanism" that would have become two; the motion spec of 2026-11-08 and the drag spec of 2026-11-09 failed the same way (report B).

**The common cause** (report B, §4): each spec stated "one mechanism" as a principle and then sliced, owned and checked the work **by place**. Each slice was asked to finish a whole place, so it built a whole mechanism for that place. No artifact named the single code owner of each concern for every place to use, and every check that existed tested behaviour or layering, which two correct copies both pass.

So the guarantee moves from the principles into the code's construction:

- **The screen is one:** one root, one model type, one message union, one router, one host; the pure UI code cannot name the host at all (C1).
- **Each concern that touches the platform has one engine,** in a frozen table; only that engine's module may reach the host APIs it needs (C2).
- **The UI decides nothing:** it computes no number and no order; every decision is the core's, as data (C3). **A value that selects behaviour has one reader**, the place's in the one function that derives its layout (C4).
- **Use is mandatory:** every concern in every place, form and payload, in unit tests and in the test Obsidian (G5); a runtime trap and its effect ledger catch what the checker cannot type, and every change to a guard is made visible (C5); **old and new never coexist on master** (G8); **each stage gets a structural review** whose findings become checks (G9).

**Revision 12.** Three independent reviews of revision 11 (`rev11-research/R1-redteam-rev11.md`, `R2-architect-rev11.md`, `R3-behaviour-rev11.md`) showed that the guarantee did not hold: a red team found twenty changes that pass every check, because revision 11 listed what is forbidden (APIs per owner, place names, CSS properties, private folders, the shape of a condition), and a list always leaks. Revision 12 keeps the decided product and turns the guarantee around: the UI code **cannot express** an effect, a rule of the core or a read of the place, so nothing has to be forbidden one by one (§The one mechanism, C1–C5). It adds P9 (render cost scales with what changed), keeps the settings tab on Obsidian's own chrome with only its row reorder on the one carry, and withdraws three product changes revision 11 had made without saying so.

**Revision 13.** Revisions 11 and 12 got into an arms race. Each red team modelled a *deliberately malicious* agent (`JSON.stringify(place).includes('"note"')`, `function n(x: any)`, forged JSON units, `this.base.animate`), and each revision answered with more type machinery: opaque units, a JSX dialect of its own, generated routers, no `number` in pure code, fourteen TypeScript projects. The architect of revision 12 (`R5`) found that machinery partly unbuildable (TypeScript allows `<` on a phantom object type; esbuild reads one `tsconfig`; the manifest's hash held its own hash) and contorted, and Max rejects contorted code as hard as duplicated logic. No language whose type system can be argued with stops a determined author who can also edit the guards, and production teams do not try (report D, §3). Revision 13 states what it guarantees and how (§Guarantee): **one implementation of each concern by architecture; every natural route to a second one caught by a machine check; deliberate circumvention made visible, never silent.** It drops the machinery that answered only sabotage, applies `R5`'s fixes (branded numbers with one checker rule, a gesture machine the input engine may hold, one JSX runtime, three TypeScript projects, a hand-written root `update` with slice ownership, P9 completed, the effect ledger by subtree, stage 3 split) and takes from `R4` every finding that closes a natural route (ordinal list rules from the core, a capability for writes of place-owned state, the matrix registry from the inventory, imports and npm packages per project, the trap on the release bundle, the CSS gaps, the manifest as a computed closure without a cycle). The product of revision 12 is unchanged.

**Revision 14.** Two reviews of revision 13 (`rev11-research/R6-scenarios-rev13.md`, `R7-architect-rev13.md`) kept its threat model and found the natural routes still open: a hurried agent doing ordinary feature work leaked in fifteen of thirty-two tasks, and most leaks had one cause, the UI computing a decision (a week's days, a swipe that commits, a share done, a neighbour by index), with the rest from a value that selects behaviour being read in several places, from loosely named ownership, and from guard noise that would hide a weakening. Revision 14 answers at the level of principles, not leak by leak: **the UI decides nothing** as one type-based rule (no arithmetic, ordering, `Math`, `Date` or computed index in pure UI code; decisions from the core as data); **a read that selects behaviour has exactly one reader**; **ownership is named exactly, and the unowned is denied**; **weakening is visible and additions are silent**. It gives legitimate features their homes (a `WindowHost` per window, ambient motion, data surfaces) and fixes every blocker of `R7` (the production `--ui=next` build, inert seams, project references, `DoorMethods`, FLIP's first boxes, `regionsOf`). The product is unchanged.

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
- **One model type for every place:** `Model`, with the place it is shown in as data (`model.place`, a record whose fields only `layoutOf` reads, C4). Each mounted screen is one store of that type; no place has a model, a message union or an update of its own.
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
  3. **What the screen needs.** The screen has one pure selector, `needs(model)`. It lists the view answers the screen needs: its root view (the funnel, a note's view or the settings, which `layoutOf` gives as data, C4), the neighbour day or place under a swipe, the task of an open full card or menu, the search's results. The runtime computes one answer per need from the replica, cached on the replica parts the need reads (P9), and hands them to the model as data (`viewsChanged`).
     - Any change of the replica recomputes every mounted need in the same loop, so an open card follows Sync at once.
     - Selectors never call the door. Here "the core" means `callDoor`, the replica and the view answers.
     - The core's **pure rules** (`rules.*`: `snap`, `swipeLanding`, `layoutWidths`, `stackedLists`, `layoutShareAt`…) are plain functions. They are reached through one gateway, `screen/rules.ts` (C3), since they are needed per frame and per pointer move.
  4. `ScreenHost` draws, in one order for every place: render, measure, motion, scroll, focus last (§Architecture).

  The chain has a bound on its depth; hitting it is a failure with the action log dumped.

  A user's event runs the whole loop inside the event, which is what lets the iPhone keyboard rise on a typing pick and makes a write's outcome visible in the same frame. Messages from elsewhere run it once per microtask. Asynchronous work (persistence, the network, timers) is a command whose outcome comes back later as a message.
- **Every wait on something the user sees has a bound,** and the bound is a message.

**P3. The core is a pure, synchronous function over a replica the runtime holds.**
- **The replica:** the plugin runtime holds one `DoorContext` (`PhoneCalls.ts:93`): the tasks text, the settings text, the undo history, the projects-screen state, the id state, the calendars' texts and the project notes. Every screen shares it.
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
  - The log is replayed through the door, in order. Each entry runs over the new text with its own recorded inputs. Before it runs, every id in its arguments is mapped through the ids that earlier replayed creates produced, then resolved to that task's current key (`tasks.keyOf(id)`, `PhoneCalls.ts:681`).
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

  Views are memoised by the replica parts each need reads, and the minute (P9).
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
- **Synchronous rules** used per frame or per pointer move (`rules.*`: `snap`, `swipeLanding`, `layoutWidths`, `stackedLists`…) are called in-process through the gateway (C3). They are pure.
- **Cost.**
  - Each door call today rebuilds its world: it parses the settings, builds the rules and identity, and parses and tidies the text. A view costs 2–3 ms on Max's file; a pure state change such as `endCarry` costs 1.6 ms.
  - `backend` adds a cross-call cache keyed by (text, settings reading, today). It covers the parsed document, the tree, the identity reading and the parsed settings, and state-only calls reuse it.
  - **A write seeds the cache** with the document it produced, keyed by its new text, so the views that follow a write never parse again.
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
- **The motion engine reports** `motionSettled(id)` or `motionInterrupted(id, at)`.
- **Continuous gestures** go through a transient channel. The input engine advances the one gesture machine (C2) and passes the live value (the finger's place, a glide's offset, a pinch's scale) to the motion engine, which applies it to the layout the same selectors computed. Only the machine's **semantic outputs** are messages: a lift, a target change, a step crossed, a drop, a cancel. So the model changes at the gesture's rate, never at the pointer's.

**P6. Interactions are layers; what moves pins what is under it; data never freezes.**
- **The stack:** a stack of modal layers (screen → select mode → full card → field → menu or sheet) plus at most one pointer gesture. It is a statechart, one for every place (the layers and gesture concerns); the carry is one statechart whatever is carried and wherever it lands (the carry concern).
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
- **Engines** (`engines/`, one file per concern, §The engine table) own the DOM work that is not declarative; nothing else in the bundle can name it (C1, C2).
- **Motion has one engine:** no time- or scroll-driven CSS outside the motion engine's classes (C2, decision 34).
- **The runtime** owns the replica, the door calls, persistence, the network and Obsidian's events.
- **The core's sessions** (`entry.*`, `sectionName`, `repeatPage`, `description`, the carry) are door methods over the replica, never re-implemented.
- **Host CSS is scoped:**
  - every new rule sits under `.task-calendar`;
  - a scoped reset neutralises Obsidian's and iPadOS's control styles;
  - body classes are written only by `chrome`.

**P8. Everything alive has an owner.**
- `ScreenHost` mounts, owns and disposes every engine, observer, subscription, scope and timer of a screen, the same for every place. An adapter (the leaf, a note, the settings tab) owns only its registration with Obsidian (§Architecture).
- Host readiness (layout ready, Sync loaded, metadata cache resolved) and teardown arrive as messages.
- **Teardown ends what is under way:** a carry gets `endCarry`, so no stale carry stays in device storage.
- **Unload:** Obsidian does not await `onunload` (a BRAT update unloads the plugin). The persistence queue, with its ability to replay, outlives the plugin object until it is empty, and nothing disposes it before that.
- **After the switch** the old `CalendarService` polling is not started; the network lane is the only fetcher.
- **A test** mounts and unmounts each adapter in each form, including mid-gesture, and finds nothing left alive.

**P9. Render cost scales with what changed.** A write of one line must not redraw every card (review R2.1: today `ViewAnswers` caches on the whole replica's identity, every need is recomputed, fresh `TaskItem` objects break every card's memo, and motion reads every row's box).
- **Structural sharing from the core.** The door and the replica give the same object for what did not change: a task line unchanged (by id and line) keeps its `TaskItem`; the ids, the history and the projects screen keep their identity when a call did not change them (`Replica.update` compares those parts by value, not by identity). `backend` makes the door's answers share, in stage 3.
- **Each need is cached on the parts it reads.** A need declares the replica parts it reads (the tasks text, the projects screen, settings, the calendars, the minute); it is recomputed only when one of them changed. A carry step that writes only the projects screen recomputes no list.
- **`needs(model)` is memoised** on the model slices it reads, and each need's identity is computed once, when the need is made (a key built from its kind and the ids it names), never by serialising its arguments on each pass (today's `ViewAnswers` stringifies every need's arguments, `ViewAnswers.ts:25`, and drops every answer on any new replica, `:40-45`). The entry's door steps read their views once per call.
- **The layout is split in three:** `layoutOf(place, root, chrome)` the concerns' parts; `regionsOf(model, parts)` what is drawn, each region memoised on the slices and parts it reads; `geometryOf(parts, measured)` the geometry. A change of `measured` (a scroll, a resize, edge scroll under a carry) rebuilds no region.
- **Every kit component is memoised on its props** by the one JSX runtime (`tc-jsx` swaps each function component for a cached `memo`, C1); the render engine writes a custom property only when its value differs. The root function may run on any message; what must not run is a list or a card whose props did not change.
- **One warm editor per screen.** The editors engine keeps one CodeMirror `EditorView` per screen and re-keys it to the next row on Enter or a typing pick, so no field builds an editor inside the event (a new `EditorView` costs about 5–15 ms on a throttled phone).
- **Neighbours at idle.** The neighbours of the current day and place under a swipe are a standing need, computed and rendered at idle (the time engine's `idle`) beside the current one, as the ribbon already lays them out, so a swipe starts and lands on drawn views; the views of the modes the switch offers are computed at idle too, so a mode switch only renders. Windowed lists were weighed and rejected: they need estimated heights for rows not drawn, which breaks P4 (geometry is input), FLIP and the hit test over rows outside the window, and they grow the window during iOS's momentum scroll.
- **Every other derived structure is memoised on its inputs:** the lists, a card's face.
- **Motion measures only what its cause names.** A motion cause carries the keys it may move; the measure engine reads only those boxes.
- **Budget tests** (`tests/budget/`, 300 tasks, 4× CPU):
  - one write re-renders at most the cards whose line changed or whose place moved (counted by the render counter);
  - **the pointer path:** a carry's pointer move sends at most one message to the store, and during a carry no list or card component re-renders but the target's indicator and the float;
  - **a typing pick and Enter:** no `EditorView` built in the event; under 16 ms from the event to the paint;
  - **the minute:** no card re-renders whose face did not change;
  - **a swipe:** every frame under 8 ms of script, the neighbour already drawn; **a mode switch** (a tap, no motion running): under 50 ms from the event to the paint, no long task over 50 ms;
  - P3's per-call budgets stand.

## The one mechanism

P1–P9 say what the screen is. C1–C5 say how it is built **once**, and §Guarantee says what that rests on.

Revision 11 listed what is forbidden, and the list leaked (`rev11-research/R1–R3`). Revision 12 answered with type machinery against an author who sets out to defeat it; it was partly unbuildable and contorted (`R4`, `R5`). Revision 13 built as production teams do (report D) and stated its threat model; a year of hurried feature work traced against it (`R6`) still found fifteen leaks, and most had one cause: **the UI could still compute a decision**, and a value that selects behaviour could still be read anywhere. Revision 14 closes the natural routes at that level, with a few rules that each say one thing:

1. **The UI decides nothing** (C3): pure UI code passes numbers along and never computes or orders them; decisions come from the core as data.
2. **A read that selects behaviour has exactly one reader** (C4).
3. **Ownership is named exactly, and anything unowned is denied** (C1, C2, decision 34).
4. **A change that weakens a guard is visible; an addition the machine checks is not noise** (C5).

Each part says how it is enforced: by **construction** (the architecture has one place for it), by the **checker** (a rule of `uiRules`, each with its reject and accept fixtures, §Guards), by the **matrix** (it must be used everywhere it applies), or by the **trap** (an effect the plugin did not order fails the run).

**C1. One screen, pure by construction.**
- **One screen.** The whole UI is one root, `Screen` (`view/Screen.tsx`), of one model type, `Model`, changed by one message union, `Msg`, through one `update`. The main screen, a note's block, a settings list and every data surface (§Architecture) are that screen with a different `Place` (C4).
- **Projects by reference, in one direction.** Four TypeScript projects, each `composite`, built with `tsc -b` (TypeScript 7.0.2 has `--build`, `composite` and `--listFiles`, checked in `node_modules`), each consuming the one below it as declarations:
  1. **core** (`core/tsconfig.json`, as today);
  2. **pure**: `screen/`, `model/`, `update/` (`tsconfig.next-pure.json`): `lib: ["es2024"]`, `types: []`, no DOM, Obsidian, Preact or CodeMirror, no JSX. A window, an element, an event, a hook or a timer cannot be named there;
  3. **kit**: `view/` (the kit and `Screen.tsx`, `tsconfig.next-kit.json`): the same libraries, plus the kit's JSX type view;
  4. **host**: `engines/`, `host/`, `view/jsx/jsx-runtime.ts`, `obsidian/runtime/` and the rest of `obsidian/` (`tsconfig.json`).

  Each project is its `include` roots, so the partition is by folder; a check finds every input of esbuild's metafile under exactly one project's roots. `paths` sends every package a project does not name to a blocked stub; `skipLibCheck` is off in the pure and kit projects.
- **One JSX runtime that memoises.** Every `.tsx` compiles against one runtime, `tc-jsx` (`view/jsx/jsx-runtime.ts`, read by esbuild from the root `tsconfig.json`). Its `jsx(type, props)` hands an element to Preact's `jsx` with each function component swapped for a `memo(type)` kept in a `WeakMap`, so every kit component is memoised where it is created and nothing else registers it (`memo` comes from `preact/compat`; Preact 11.2.0's core has none, checked). The kit's *type view* is an allowlist of elements and closed attributes: no `style`, `on…`, `autofocus`, `tabindex`, `popover`, `draggable`, `contenteditable`, no `<a>`, `<button>`, `<input>`, `<select>`, `<textarea>`, `<form>`, `<dialog>`, `<details>` or SVG animation; `class` typed as the kit's `tc-n-…` or `is-…` literals; `role` and the `aria-…` attributes as closed values. `preact/hooks` and `preact/compat` are in no pure or kit `paths`. Kit components are plain functions of their props (no `this` parameter).
- **Intents are typed data on kit elements.** A kit element that can move, take focus, scroll or be measured carries a required prop for it: `motion`, `focus`, `scroll`, `measure` (a key, or `"none"`), and a repeating motion its `ambient` (`"pulse"`, `"spin"`, `"none"`). Absence does not compile. The render engine turns them into data attributes the engines read.
- **The UI's own types are closed data.** `Model`, `Msg`, `Command`, the kit's props and `Layout` hold no function, `any`, `unknown` or index signature, and every discriminant is a string literal (`tests/types/closed.ts`, `AssertClosed<T>`). `Model` is deep-readonly. The core's answers are typed per door method by `DoorMethods` (stage 3a), never `unknown`.
- **No module state** in the pure and kit projects: a module's top level holds functions, types and literal data (`as const` over literals, checked recursively: no `new`, no call), and no property is written onto a function.
- **Messages route once; the root `update` is written by hand.** `Msg` is the union of each concern's own union; `ROUTES: { [K in Msg["kind"]]: Concern }` is total, and a kind in two unions does not compile (`Disjoint`). `update.ts` routes a message to its concern, delivers the **runtime broadcasts** (`viewsChanged`, `rebased`, `fileGone`, `minute`, `shown`, `hidden`, `chrome`, `toDevice`) to every concern, and holds the **cross-concern steps** explicitly, in the order they run, each a call of the owning concern's exported function.
- **Slice ownership** (checker): a field of the slice of concern `X` is constructed, spread or assigned only inside `update/X/`.
- **One fact, one field** (checker, not a type test: TypeScript's aliases are structural, `R6` B2): every field of a slice is declared with a type declared in that concern's own `model/<concern>.ts`, or a primitive of the core's (`LocalDate`, a key); a field whose type is declared in another concern's module needs an import the checker sees, and fails. A fresh alias of the same base type is the structural reviewer's question (G9).

**C2. Engines: one per concern, named exactly.**
- **One engine per concern that touches the platform, one module each** (§The engine table). The table is data (`tests/guards/engines.ts`): each row's concern, module, the **exact** packages it may import (`@codemirror/view`, never `@codemirror/*`), the **exact** declarations it may reach (Obsidian's per declaration: `Scope` in keys, `Menu.addItem` in registration, never "Obsidian"), and the event types it listens to. The checker resolves every name, member, alias and import to its declaration and allows a host declaration only in the module whose row names it. **Anything no row names is denied**: an event type (every DOM event type is owned, `mouse*`, `pointer*`, `drag*` and `touch*` by `input`; one no row names fails), an npm package, an Obsidian declaration.
- **No `any` in host code either.** In the host project an expression of type `any` may not be called or have a member read, and `as any`/`as unknown as` are refused. Obsidian's private APIs get one typed declaration file per engine row (`engines/<row>.private.d.ts`), the only place an ambient augmentation of `obsidian` may stand, inside the guards' closure; the API then resolves to a declaration that row owns.
- **Closed specs.** The motion engine runs an `AnimationSpec` per `MotionCause` (a keyframe kind, a duration token, an easing token, `linear()` easings and springs from tokens among them) and an `AmbientSpec` per `ambient` value (a repeating motion: a pulse, a spinner); the scroll engine a `ScrollSpec` (`behavior: "instant"`, a glide a `ScrollSpec` kind the engine steps frame by frame); the focus engine a `FocusSpec`; the editors engine an `EditorSpec`, the closed set of CodeMirror extensions it builds (no `autocompletion()`, no default keymap, no tooltip of CodeMirror's: a suggestion list is a kit layer fed by a core answer). A new kind is a new variant of its engine's spec.
- **Class names belong to their owners.** A string literal holding `tc-n-` is legal only in the kit, `tc-m-` only in the motion engine, `task-calendar` only in the mount engine (Obsidian's `createDiv({ cls })` included, since the checker reads the literal).
- **Engines execute; they do not decide** (checker): an engine may do arithmetic to execute geometry (a FLIP's inversion, a float at the finger minus its grab, a glide's step, a pinch's distance, a box relative to its scroller), and may make **no ordering comparison and no condition on a number** (`<`, `>`, `<=`, `>=`, `Math.min`/`max`, a number in `if`, `?:`, `&&`, `||`, `??`); equality with a literal or an identity stays (`deltaMode`, a touch's `identifier`). What is decided from a number is decided by the gesture machine (C3) or the core.
- **The gesture is one pure machine.** `update/gesture/machine.ts` (press, hold, slop, flick, second press, dwell, pinch, edge scroll; pure, unit-tested; grown from `recognizers/press.ts`) is the only recogniser. The input engine **holds one value of the machine's state type and advances it only by calling the machine**; it dispatches only the machine's semantic outputs (a press on an act, a lift, a target change, a step crossed, a hover's dwell, a drop, a cancel), and sends continuous values (the finger, a glide, a pinch's scale) to the motion engine through the transient channel (P5). Every other engine, `ScreenHost` and `WindowHost` hold only `readonly` maps of the host handles they made (checker: a mutable binding in the host project's engines and hosts has a handle type or a machine-state type).
- **`preventDefault` is decided synchronously,** from the machine's state as it stands after the event's own pass: dispatch inside an event is synchronous (P2).
- **Libraries come in through one engine, configured by a closed spec.** CodeMirror lives only in `editors` (`EditorSpec`); `MarkdownRenderer` only in `editors`. Obsidian's `Menu` and `Modal` are **not constructed**: every menu and sheet is a kit layer in the one layer stack; the registration row may only add items to the `Menu` Obsidian hands to `file-menu` and `editor-menu` (`menu.addItem`, checked in `obsidian.d.ts` 1.14.4). Obsidian's `Setting` lives only in the settings adapter.
- **Repeating work has one home.** A pure handler that issues a timer command whose message is its own kind (a timer re-arming itself) is refused; a repeating motion is an `AmbientSpec`, the minute is the runtime's clock.
- **The frozen table freezes concerns and engines, not file names.** Any change to a row is a weakening change (C5): reported to Max, read by the structural reviewer. Pure code is organised by concern (`update/<concern>/`, any files).

**C3. The UI decides nothing.**
CLAUDE.md's rule (the UI gets the decision ready and only draws and turns gestures into places) becomes one type-based rule of the checker, with no dataflow tracking:
- **Pure UI code passes numbers along and never computes them.** In the pure and kit projects (`screen/`, `model/`, `update/`, `view/`) no operator of arithmetic or order takes a number (`+`, `-`, `*`, `/`, `%`, `**`, `<`, `>`, `<=`, `>=`, unary `+`/`-`, `++`, `--`, compound assignment), there is no `Math`, no `Date`, no element access with a numeric index that is not a literal, and no `at`, `slice`, `splice`, `with` or `fill` with an argument that is not a literal. Equality and emptiness stay (`===`, `xs.length === 0`); an element is reached by identity or by iteration, and its neighbour comes from the core. Sequence numbers (a transition's number) are stamped by the store on each loop, never incremented in pure code.
- **Decisions come from the core through the gateway, as data.** `screen/rules.ts` is the UI's one module that reaches the core's values; each export is one call of one core rule. What the UI computed until now becomes a core rule `backend` adds in stage 3a (§Migration names each): the month grid and the week's days, the search's step through its results, the Shift range of a pick, a section's span under a lift, the slot nearest the finger, the branch lines' passes, where the entry's field stands. A threshold that decides an **outcome** (a flick that commits, a card swipe that postpones, a snap) is a core rule's own constant, reached only by calling that rule.
- **Gestures decide only whether they are gestures yet.** The gateway gives the gesture machine three predicates, the only comparisons on geometry in the UI: `exceeds(d: Distance, t: GestureToken)`, `within(p: Point, s: MeasuredShape)` and `axis(d: Delta): "x" | "y"`, and two measures, `delta(a: Point, b: Point)` and `distance(a: Point, b: Point)`, whose results pure code can only hand to a predicate or a core rule. A `GestureToken` is made only from the gesture tokens (`screen/tokens.ts`: the press slop, the hold, the dwell, the edge zone, checked equal to the CSS's `--tc-gesture-…` by `styles.test.ts`, as `DESIGN` is today), so no outcome can be decided with them: an outcome needs a core rule. The geometry types (`Px`, `Ms`, `Point`, `Distance`, `Delta`, `Velocity`, `MeasuredShape`) are declared in `screen/geometry.ts` (types only) and made by the measure and input engines. Which list or row is under the finger is `within` over the measured boxes; where in it a card lands is the core's (`placeAt`, `levelAt`, `gapAt`…). This retires `units.ts` and the `update/gesture/` folder's exemption: no folder of the UI computes, and the gateway is the one exempt module (in the guards' closure, C5).
- **The same rule holds wherever answers or control values are handled:** `obsidian/runtime/dispatch/` (a need is exactly one door method from `DoorMethods`, its arguments the need's; `ViewAnswers` has no code per kind of need), `host/settings.ts` (it draws the door's settings view, `settings.page`: the rows, what each offers, what is disabled, its messages, and sends raw control values to `settings.*` door methods; no comparison or branch on an answer's value but an exhaustive `switch` on a row's kind), `host/registration.ts` and `host/adapters/`. The runtime's own mechanism (the queue's bounds, generations, the replay's limit, the network lane's silence) is P3's and keeps its named constants.
- **The swipe lands once.** `tests/guards/swipeOnce.test.ts`, naming Max, asserts at model level that in every swipe cell the place the model lands on equals `rules.swipeLanding` for that swipe's inputs; the e2e recorder fails a swipe resting two places away; `tests/application/swipeLanding.test.ts` stays as CLAUDE.md protects it.

**C4. A read that selects behaviour has exactly one reader.**
- **One rule for every selector of behaviour** (checker, the `uiDecides` pattern, counting conditions only): `Place`'s fields, the chrome's place facts (`form`, the keyboard, the toolbar), the place facts of `contracts.ts` types (`filter.clearable`, `panel`, `topRow`, `plus`, `ViewChoice.*`, the root answer's `kind`), **every field of a `Layout` part** and **the pointer's kind** may be read in a condition (`if`, `?:`, `&&`, `||`, `??`, `switch`, or as a computed key into a lookup) in exactly one module. `tests/guards/readers.ts` records that module per field (`Place` and the place facts: `screen/layout.ts`; the pointer kind: the gesture machine; each variant: its concern's one module). Passing a value along, or drawing it, is not a read. A second reader fails, so a variant picks between two behaviours at one point only, and a flag per place cannot spread.
- **`Layout` is split by concern, and the router hands each concern only its part:** `handle(model, msg, parts[concern])`. `layoutOf(place, root, chrome)` derives the parts from the place; `regionsOf(model, parts)` derives what is drawn (the open field, the carry's waiting place, the layers, the pins); `geometryOf(parts, measured)` the geometry. The model holds no `Layout`.
- **Real alternatives are closed variants**: `search.reveal: "clearFilter" | "openFull"`, `search.dayOfFind: "moveDay" | "openFull"`, `context.writesPlace: "write" | "keep"`, `carry.device: "report" | "silent"`, `full.projectTap: "closeAndFilter" | "close"`, `entry.bar: "keyboardBar" | "capsule"`, `entry.placeMoves: "follow" | "stay"`, `scroll.chain: Scroller[]`, `keys.policy: "tab" | "focus" | "none"`.
- **Writes of device state need a capability, derived from data.** Device state is every key of `SETTINGS_FILE.device` (`obsidian/settingsFile.ts`: today the list share, the zoom, the tree width) and the projects screen (the funnel place, the filter, the chosen node, the carry). `DoorMethods` marks each method that may write either (`writes: "device"`), and a `placeWrite` command, the only command that can carry such a method or a device patch, requires a `PlaceWrite` value; `PlaceWrite` is made only in `screen/layout.ts`, and `layoutOf` puts it in the parts of the places that may write (absent in a note). A new device key or a new marked method is covered the day it is added. The runtime checks it again by data: an answer that changed a device key or the projects screen for a screen holding no `PlaceWrite` is not adopted, and the trap reports it. The note's matrix cells assert **every** device key and the projects screen unchanged. A note that should act on the main screen (a menu's "Show on the main screen") sends a `toDevice` intent to its `WindowHost`, which broadcasts it to the main screens, and each writes with its own `PlaceWrite`.
- **Execution is one per kind.** Several concerns legitimately ask for focus, a scroll or a motion; one engine runs each kind, in one phase of the loop, the focus engine taking the topmost layer's request when two arrive in one loop.
- **The matrix compares like with like** (G5): one concern's logs across the cells whose variant values are equal, projected onto key roles.

**C5. Guards: checked, tested, and every weakening visible.**
- **The guards' closure.** `guards/manifest.json` holds the hash of every guard file: what `npm test`'s guard project, `npm run build`, `npm run release` and `npm run e2e` load, **minus** the product's own inputs (the metafile's), **plus** every file a rule exempts or names by path (the gateway, `screen/layout.ts`, `screen/tokens.ts`, `screen/geometry.ts`, each `engines/<row>.private.d.ts`, `view/jsx/`; the checker emits that list). It is recorded, not listed by hand: under Vitest 5.0.5, which runs test and source modules through Vite's module runner (checked: `vitest/dist/module-evaluator.js` uses `vite/module-runner`), by a Vite plugin in the guard project's config whose `transform` hook notes every module (Vitest's caches off for the run); for the build by esbuild's metafile; for the plain Node scripts by `module.register` loader hooks (Node 22.22 has them, checked). The guard tests are their own Vitest project (`tests/guards/`, `tests/types/`, `tests/matrix/`, `tests/uiRules*.ts`, `tests/styles.test.ts`, `tests/architecture.test.ts`, `tests/uiDecides.test.ts`, `tests/hostLifecycle.test.ts`, `tests/budget/`, `tests/e2e/`, the tests that name Max); an ordinary unit test is product, not a guard. The manifest is not part of its own closure; its reference is the manifest at the last release tag and at master's head.
- **Pinning classifies.** `npm test` and `npm run build` fail when a closure file differs from the manifest. `npm run guards:pin` compares the change with the reference and splits it:
  - **additions the machine checks** are pinned silently: a new row of `rows.json` with its scenarios, a new matrix cell, a new reader for a new field, a new fixture;
  - **weakening** is printed, written into the commit message and into the release notes: a row or cell removed, a cell turned `notOffered`, a scenario's assertions fewer, a row of the engine table added or changed, a reader moved, a rule's code, an exemption, a config, a dependency.
- **Visibility.** Before a merge the lead reports every weakening change to Max in product words ("the rule that keeps a note from writing the main screen's state now also lets the note change the zoom: …"). This informs the owner that a protection changed; it is not asking him how to write tests. A fresh structural reviewer per stage (G9) reads the diff and the weakening changes. CODEOWNERS plus lint plus independent review (report D).
- **Mutation testing** runs over the guard code with Stryker's Vitest runner and **without its TypeScript checker** (TypeScript 7.0.2's package exports no classic compiler API, only `typescript/unstable/*`, checked; Stryker is not installed yet: `@stryker-mutator/vitest-runner` 10.1.1 declares `vitest >=2`, read from the registry, not run). It runs incrementally, apart from `npm test`. Its floor (`guards/mutation-floor.json`, outside the manifest) is a ratchet: the run fails under it, the release fails if it fell since the last tag.
- **Coverage is a ratchet too.** The pure project's line, function and branch coverage over the model-level matrix may only rise (`guards/coverage-floor.json`), and every `Msg` and `Command` kind is exercised by some scenario. No gate waits on 100 %.
- **No escape hatches** (checker, every scanned file): no `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `jscpd:ignore`, `eslint-disable`, `Stryker disable`; no `.skip`, `.only` or `.todo`; no triple-slash directive; no ambient declaration outside `view/jsx/` and the engines' private declaration files. In the pure and kit projects: no `as` but `as const` (outside `screen/layout.ts`), no `any` (annotation or an expression of type `any`, `JSON.parse` included), no `this` parameter. `screen/records.ts` gives typed `keys`, `entries` and `fromEntries`, so no cast is ever needed.
- **The scope is the bundle.** The checker reads esbuild's metafile: every input that is not in `node_modules`, whatever its folder or extension. Outside `obsidian/` that is `core/`, under its own architecture rules. `obsidian/ui/next` may not import the old UI, nor the old UI the new.
- **The trap runs on the bundle that ships.** `npm run build -- --ui=next` makes the production-mode bundle (the release's esbuild options, `UI` defined `next`) into `.e2e/next/main.js`; only `npm run release` refuses `next` before stage 7, so from stage 3c1 the matrix, the trap and the budgets run on the release recipe. **Every seam is in `hostServices` and ships inert** (the clock, `Http`, `outside()`, `window.open`): the CDP-injected script arms them (`Page.addScriptToEvaluateOnNewDocument`), with `Target.setAutoAttach({ autoAttach: true, waitForDebuggerOnStart: true, flatten: true })` so a popout window gets the script before it runs (from the CDP protocol reference; the harness does not use it yet). Unarmed, the seams are the real clock, network and `open`. Coverage comes from CDP's profiler. The e2e build that holds both UIs (decision 37) remains only for the old-against-new comparison until stage 7.
- **The effect ledger judges the screen's own subtree.** In each frame, every scroll-offset change of a scroller in the screen, every focus move within it, every new animation on one of its nodes and every style, class or attribute mutation of one of its nodes must be explained by: a command its engine ran in that loop; a user's input on that scroller in the last 1 s (a wheel, a touch, and the momentum and rubber band after it); a clamp (the scroller's `scrollHeight` shrank); or, for a style or class, the render or motion engine's write whose model change came from input, a door answer, a broadcast or the minute. An effect inside an editors island is the editors engine's; focus leaving the screen for Obsidian's own UI is not the screen's.

**The settings tab.** It keeps Obsidian's own chrome and look (the design excepts Obsidian's chrome, and a rework keeps today's behaviour): `host/settings.ts` builds it from Obsidian's `Setting`, its toggles, dropdowns, sliders, colour wells and buttons, from the door's settings view (`settings.page`, added by `backend` in stage 6: the rows, what each offers, what is disabled, the messages, an invalid code's revert), registers no key scope, sends raw control values to `settings.*`, and reaches the clipboard, Google's sign-in and the Scriptable loader through `hostServices`. Only its three reorderable lists (priorities, labels, presets) move rows, and they move them with **the one carry and the one motion engine**: each list mounts one `ScreenHost` at `Places.rows(list)`. That place's `Layout` has one region, `adopted`: the mount engine **adopts** the rows Obsidian's `Setting` drew (it tags each with its row's key and its grip with an act), so the measure, input and motion engines work on them as on any kit element, and the screen draws nothing of its own. The carry's payload is `settingsRow`, its look `self` (the row follows the finger, the others step aside: the motion cause `stepAside`), and its grip starts the carry on a press with no hold (`settings.md:9`). The drop's door call (`settings.move…`) runs when the drop's flight settles, so the settings change that makes the tab redraw comes after the motion. **Obsidian's `display()` rebuilds the tab's DOM:** each time it runs, the adapter disposes the lists' `ScreenHost`s and mounts new ones on the new rows (no carry is under way then), and the tab scrolls in Obsidian's `.vertical-tab-content`, the first scroller of its `scroll.chain`. A live preview of a card (should one be wanted) is a `ScreenHost` at `Places.preview()` drawing kit cards, never DOM the tab builds. Keys: `keys.policy` `none`.

## Architecture

```
obsidian/ui/next/
  screen/      layout.ts    Place, Places, PlaceWrite; layoutOf, regionsOf,
                            geometryOf → the Layout parts                        pure
               rules.ts     the gateway: the core's rules, the three gesture
                            predicates                                           pure
               geometry.ts  the geometry types (no functions)                    pure
               tokens.ts    the gesture tokens (equal to the CSS's)              pure
               records.ts   typed keys, entries, fromEntries                     pure
  model/       Model, Msg, Command, the broadcasts, each concern's slice type    pure (types)
  update/      update.ts (the router, the broadcasts, the cross-concern steps);
               <concern>/ any files; gesture/ (the machine)                      pure
  view/        Screen.tsx; kit/ (the kit's components)                           kit
  view/jsx/    jsx-runtime.ts (the one runtime, with memo); the kit's type view  host / kit
  engines/     one module per engine (§The engine table); <row>.private.d.ts     host
  host/        WindowHost.ts; ScreenHost.ts; adapters/leaf.ts, note.ts;
               settings.ts; registration.ts
obsidian/runtime/
  Runtime      the replica; door calls; pending calls and replay; the
               persistence queue; the network lane; Obsidian's events;
               the time engine; the action log
```

**`Place`** (report C, §4), in `screen/layout.ts`; its fields are read only there (C4):

```ts
export interface Place {
	readonly form: "phone" | "desktop";        // from `chrome`; an iPad is "phone"; the core's `wide`
	readonly frame: "fill" | "inline";         // inline: as tall as its content up to `--tc-block-max-h`
	readonly content:
		| { readonly kind: "tasks";
		    readonly source: { readonly kind: "funnel" } | { readonly kind: "note"; readonly path: string };
		    readonly calendar: boolean; readonly days: "any" | "today"; readonly tree: boolean;
		    readonly filter: "chosen" | "fixed"; readonly writesPlace: boolean;
		    readonly keys: "tab" | "focus" }
		| { readonly kind: "rows"; readonly list: "priorities" | "labels" | "presets" };
}
export const Places = {
	main: (): Seed => …,            // fill; funnel; calendar, any day, tree, chosen filter, writes the place; tab keys
	note: (path: string): Seed => …,// inline; note; no calendar, today, no tree, fixed filter, keeps the place; focus keys
	rows: (list: …): Seed => …,     // the adopted rows of a settings list; no keys
};
export function layoutOf(place: Place, root: RootAnswer, chrome: ChromeState): LayoutParts;      // the concerns' parts, from the place
export function regionsOf(model: Model, parts: LayoutParts): Regions;                            // what is drawn: lists, the open field, waiting places, layers, pins
export function geometryOf(parts: LayoutParts, measured: Measured): LayoutGeometry;              // the parts that read `measured`
```

Report C's `sheets` is left out: a sheet (the full card, the search) mounts over the screen's own frame in every place, as today (decision 52).

**`Layout`**, one part per concern, each handed only to its concern by the router: `regions` (`regionsOf`'s, to `Screen`: what is drawn, in order, each region memoised on the model slices and parts it reads), `root` (the view need and `modeWrite`, data), `carry` (targets, the device variant, the look per payload, the `PlaceWrite` where the place may write), `scroll` (the scroller chain, inner first), `search`, `context`, `full`, `entry`, `keys`, `door` (the facts handed to the core). Geometry in `Px` from the layout rules is `geometryOf`'s, kept apart so that a scroll or a resize rebuilds no region (P9). A place without a project (a note not attached to one) has a `Layout` with no regions: the screen draws nothing.

**The one loop, run by `ScreenHost`:** an engine's message → `update` (the router, a concern's handler with its `Layout` part, the cross-concern steps) → the runtime's door calls (P2) → `needs(model)` → **measure first** (the boxes of the keys the loop's motion causes name, one layout read before anything is written: a FLIP's "first") → render `Screen` → `editors` (CodeMirror mounted into, or taken out of, the islands the render made, inside the same event, so a typing pick's field exists before focus) → **measure last** (the same keys again, and what the observers report) → `motion` (from first to last) → `scroll` → `focus`. The same for every place. No box is kept between loops but the measured geometry the model holds (P4); the old driver's map of every row's box goes.

**`ScreenHost`** (`host/ScreenHost.ts`) is the one controller of a mounted screen: it opens the session and the one store, completes the place's seed with the form, runs the loop's draw order, hands each command to the one engine its kind names (a total table over `Command["kind"]`), checks each `placeWrite` against the place's capability (C4), registers its screen with its window's `WindowHost`, and passes each engine's messages to the store. It holds no state but `readonly` handles. **Its public surface is frozen to lifecycle intents:** `mount(target, seed)`, `renamed(path)`, `shown()`, `hidden()`, `command(c: HostCommand)` (a closed union: `undo`, `redo`, `find`, `newTask`), `dispose()`. No `dispatch` and no `Msg` reach an adapter.

**`WindowHost`** (`host/WindowHost.ts`), one per window realm, is the owner of what spans the screens of a window, so no screen reaches another: the window's **frame clock** (the time engine's `onFrame` bound to that window, so a popout's motion never waits on an occluded main window; the minute stays the runtime's), the window's overlay node (through `mount`), the **outside press**, **which screen is active** (the one a command reaches), the **`toDevice` intents** a screen without `PlaceWrite` sends (broadcast to the main screens, each writing with its own capability), and the **carry across screens**: every mounted screen registers its carry targets' measured geometry, and the originating screen's gesture machine finds the target among them; the drop is the target screen's door call with its own `PlaceWrite`. It holds only `readonly` handles; its surface faces `ScreenHost`s and the registration only. (A drag from a note onto the main screen's calendar is not part of this refactor's product; it has this home when Max asks for it.)

**The adapters** register with Obsidian and nothing else. `host/registration.ts` holds the plugin's registrations (`registerView`, `addCommand`, `addRibbonIcon`, `registerObsidianProtocolHandler`, `addSettingTab`) and **the workspace's events**, each turned into a lifecycle intent of the screens it concerns. A command declares **no default hotkey**; its callback hands a `HostCommand` to the window's active screen, where it enters the keys concern as a key intent and passes through the same key table and `keys.policy` as a key press (the matrix's keys cells include each command in each place). **Data surfaces** Obsidian offers (a status bar item through `addStatusBarItem`, checked in `obsidian.d.ts` 1.14.4) mount a `ScreenHost` at a place of their own (`Places.statusBar()`, an inline frame with one region); items in Obsidian's own file and editor menus are added through `menu.addItem` on the `Menu` the `file-menu`/`editor-menu` events hand in, their callbacks `HostCommand`s. The events: `layout-change`, `active-leaf-change` and `file-open` mount, unmount, show or hide a note's screen; `vault.rename` is `renamed(path)`; a command reaches the active screen's `ScreenHost.command` through its window's `WindowHost`. The window's `resize` is the chrome engine's, a screen's own size the measure engine's `ResizeObserver`. `host/adapters/leaf.ts` mounts one `ScreenHost` per leaf at `Places.main()`. `host/adapters/note.ts` mounts **one `ScreenHost` per Markdown view**, at `Places.note(path)`; whether the note belongs to a project is the root answer (the core's project-note check, indexed by path in the door's cache, so each view's check is cheap), and a note that does not draws nothing. Live Preview and Reading re-rendering around the screen, and the status bar's room, are the mount engine's `MutationObserver`, which re-places the node and reports what changed. `host/settings.ts` is the settings tab (the settings tab in §The one mechanism). The mount engine places the screen's node among Obsidian's (a leaf's content; after `.cm-contentContainer` or first in `.mod-footer`).

**Accessibility** has owners like any concern: kit elements carry `role` and the `aria-…` values as closed props, drawn by the render engine from the model (selected, expanded, pressed, a label); keyboard reach is the keys concern's table (it moves the selection and opens what is selected); the focus engine alone writes `tabindex`, as a roving index on the focused key. VoiceOver reads what the render engine wrote; nothing else writes it.

**Preact 11, TSX.**
- It is checked by TypeScript 7 and bundled by esbuild as is. Svelte is rejected: `svelte-check` needs TypeScript ≤6, and its `animate:flip` infers motion from geometry.
- A user's event renders synchronously (the runtime flushes Preact's `debounceRendering`).
- Preact is reached only by the render engine and the one JSX runtime (C1).

**Picks.**
1. **A write pick** runs its door call at the tap. The list's change shows when the sheet's close settles (P6 pins the layout under the closing sheet).
2. **A typing pick** renders, mounts and focuses its field inside the tap.
3. **A hand-over** is one layer transition.

**Undo** is a door call like any other: instant, its result visible at once, with `canUndo` from the replica's history.

## The engine table

The frozen set, kept as data in `tests/guards/engines.ts` and read by the checker. One row per engine: the concern it serves, its module, the exact packages it may import, and the declarations only its module may reach (named one by one in the data; grouped here for reading). An event type, a package or a declaration no row names is denied. Concerns with no engine (layout, carry, search, sections, selection, full card, context, entry's rules, the layers' stack, the gesture machine) are pure concerns under `update/<concern>/`; they reach the platform only through the commands these engines run.

| # | Engine | Module | Packages | Declarations only it reaches | Serves |
|---|---|---|---|---|---|
| 1 | **Render** | `engines/render.ts`, `view/jsx/jsx-runtime.ts` | `preact`, `preact/compat` (`memo`, `createPortal`) | Preact's `render`, `jsx`, `memo`; static custom properties (layout at rest), written only on difference; `role`/`aria-…` from kit props | the screen and the kit; layout's regions; every kit component memoised by `tc-jsx` |
| 2 | **Motion** | `engines/motion.ts` | — | `Element.animate`, `getAnimations`, the transient channel's variables, the `tc-m-…` classes; CSS motion only under `tc-m-…` | motion: one `AnimationSpec` per `MotionCause` (springs and `linear()` easings from tokens among them), one `AmbientSpec` per `ambient` value |
| 3 | **Measure** | `engines/measure.ts` | — | `getBoundingClientRect`, `getClientRects`, `offset…`/`client…`/`scroll…` reads, `getComputedStyle`, `ResizeObserver`, `IntersectionObserver`, `scroll` listeners; makes `Px` | measurement; the boxes motion asks for |
| 4 | **Scroll** | `engines/scroll.ts` | — | `scrollTo` (`behavior: "instant"`; glides frame by frame on the time engine), `scrollTop`/`scrollLeft` writes | scroll: reveal, hold, edge scroll, glides, the chain to a note's or the settings' scroller |
| 5 | **Focus** | `engines/focus.ts` | — | `focus({ preventScroll })`, `blur`, `activeElement`, `tabindex` writes, `focus*`/`blur` listeners | focus, taken last in the loop |
| 6 | **Keys** | `engines/keys.ts` | `obsidian` | Obsidian `Scope`, `Keymap`, `key*` listeners | keys: the key table is the keys concern's (pure) |
| 7 | **Input** | `engines/input.ts` | — | the `pointer*`, `mouse*`, `touch*` and `drag*` families, `wheel`, `click`, `dblclick`, `contextmenu` listeners on the screen's root and the window (outside presses, through `WindowHost`); `setPointerCapture`; `preventDefault`; holds the gesture machine's state (C2); makes `Px` and `Ms` | input: the machine is the gesture concern's (pure) |
| 8 | **Editors** | `engines/editors.ts` | `@codemirror/view`, `@codemirror/state`, `obsidian` (`MarkdownRenderer`, `Component`) | `EditorView`, `EditorState` built only from the closed `EditorSpec`, `MarkdownRenderer`, Obsidian `Component`; `input`/`beforeinput`/composition events; `value`/`checked` writes; `setSelectionRange`, `Selection`, `Range` | entry, the full card's description, the description peek; runs after render in the loop; one warm `EditorView` per screen, re-keyed to the next row on Enter (P9) |
| 9 | **Mount** | `engines/mount.ts` | `obsidian` (views' DOM only) | the screen's own node in its host; adopting a settings list's rows; writes to Obsidian's nodes around it (`--tc-block-lift`, `.cm-content`'s growth); the one overlay node per window; `MutationObserver` | mounting, the layer host, Obsidian's re-renders around the screen |
| 10 | **Chrome** | `engines/chrome.ts` | `obsidian` | Obsidian `Platform`; `body` class writes; per-window theme and card-size tokens and the colour preview (`<style>` per document); `css-change`, `visibilitychange`, window `focus` and `resize`, the phone keyboard's show and hide, popout windows; Capacitor haptics | chrome: form, theme, keyboard, toolbar, status bar, visibility, haptics |
| 11 | **Time** | `obsidian/runtime/lifecycle/Time.ts` | — | `requestAnimationFrame` (`onFrame`, one clock per window, bound by its `WindowHost`), `setTimeout`/`setInterval` (`after`, the minute), `requestIdleCallback` (`idle`), their cancels | the frame clock per window and the timers for every engine and the runtime; engines get it as a handle from their `ScreenHost` |
| 12 | **Host services** | `obsidian/hostServices.ts` | `obsidian` | `Notice`, `workspace.openLinkText`, `getLeaf`, the clipboard, Google's sign-in through `GoogleAuth`, `outside()` (`open`, `browse`, `runScript`); **every seam** (the clock, `Http`, `outside()`, `window.open`), inert unless the e2e script arms it | notices, links, copy, sign-in; the e2e seams |
| 13 | **Settings chrome** | `host/settings.ts` | `obsidian` | `PluginSettingTab`, `Setting` and its toggles, dropdowns, sliders, colour wells and buttons, `setIcon`, the tab's own DOM; no key scope | the settings tab in Obsidian's own look; its reorderable lists mount `Places.rows(list)` |
| 14 | **Registration** | `host/registration.ts` | `obsidian` | `registerView`, `addCommand` (no `hotkeys`), `addRibbonIcon`, `registerObsidianProtocolHandler`, `addSettingTab`, `addStatusBarItem`, `workspace.on` (`file-menu` and `editor-menu` with `Menu.addItem` only), `vault.on` | the plugin's registrations, the workspace's events as lifecycle intents, data surfaces mounted at their places |
| 15 | **The file and the core** | `obsidian/runtime/persistence/TasksVault.ts`, `replica/Door.ts`, `network/CalendarLane.ts` | `obsidian` | `vault.process`/`read`/`create`; `callDoor` (one `Door` per runtime); `Http` | P3 |

Rules the core must give, each a core function the UI reaches through the gateway: the layout rules (`layoutWidths`, `layoutShareAt`, `allColumnsWidths`, `dividerAt`, `stackedLists`, `swipeLanding`, `stackTasks`, `eventLeft`…), the drop rules (`placeAt`, `levelAt`, `gapAt`, `projectsDrop`, `groupPlaceOf`, `acceptsDrop`…), the entry's job order (`entryJobStep`), the zoom (`zoomAfterPinch`), and, added in stage 3a, every rule the UI computes today (§Migration, stage 3a). The press slop, the hold, the dwell and the edge zone are the gesture machine's tokens (C3); the edge scroll's speed is the scroll engine's execution of the depth the machine reports.

## Guarantee

### The threat model

The four earlier "one mechanism" specs failed by **ordinary development**, never by sabotage: slicing the work by place, a flag per place, a model named after a place, old and new side by side, CSS motion beside the motion engine, logic owned by a host. The guarantee is built against that, in three tiers, and claims exactly what each tier gives.

1. **By architecture, each concern has exactly one implementation, and every place reaches it by the same path.** One screen, one `Model`, one `Msg`, one `update`, one `ScreenHost`; one engine per concern that touches the platform; the rules in the core; the place read in one file (C1–C4). A second implementation needs a deliberately built parallel path: a second engine module, a second slice and its messages, a second package. It never comes out of an ordinary change, because an ordinary change finds the one path already there and the guards below in its way.
2. **A machine check catches every natural route to the platform, to a decision and to the place:** what an agent writing ordinary code under a deadline would do (`R6` traced thirty-two such tasks), and every lazy bypass. The compiler, the checker (`uiRules`), the type tests, the CSS allowlist, the matrix and the trap fail on: a host API, event type, listener or package no row names, or used outside its row; `any` reaching the host; a hook, a raw element, module state or a self-re-arming timer in the UI; **any arithmetic, ordering, `Math`, `Date` or computed index in pure UI code**, and any ordering or numeric condition in an engine; a core rule reached around the gateway; a value that selects behaviour read in a condition by a second module; a device write without its capability; a fact held in two slices or written outside its concern; something drawn over the screen that is not a layer, a state styling another element, CSS motion or a moving property under a state; an effect in the screen that no command ordered; an inventory row left unused in a place; old and new together; and the lazy bypasses: a suppression comment, `any`, `as`, `.skip`, `.only`, a triple-slash directive. **Duplicated pure plumbing** that computes nothing (a second statechart in one concern's folder, a variant branching into a copy that the one-reader rule lets through because the copy sits behind the one reader) is not a route a type rule names: it is tier 3's (the structural reviewer's first question) and jscpd's when copied.
3. **Deliberate circumvention is made visible.** It needs either a change to a protected rule or code that no ordinary change looks like (a lying type guard, a value smuggled through `JSON.stringify`, a stateful `this`). The first is detected: the guards are a computed closure whose hashes `npm test`, `npm run build` and `npm run release` check; `guards:pin` pins machine-checked additions silently and lists every **weakening** change in its commit and in the release notes, and the lead reports each weakening to Max in product words before the merge, so a weakened guard is not lost among the many features that only add rows. The second is read: a fresh structural reviewer per stage (G9), who did not write the code, reads the whole diff and every guard change. This is the production pattern (report D): CODEOWNERS, lint and an independent review. The spec makes no claim that types stop an author who sets out to defeat them; that claim would be false, and the machinery built for it is what made revision 12 contorted.

### Per concern

"Pure" in the second column means the concern's handler, selectors and kit components compile in the pure or kit project.

| Concern | By architecture and machine check | Beyond that |
|---|---|---|
| **Layout** of columns and lists | Pure, with no arithmetic: widths, shares, landings and order are core rules reached only through the gateway (C3); regions are `regionsOf`'s, drawn by one `Screen`; the place read in a condition only in `layout.ts` (C4) | matrix: every region in every place and form |
| **Drag and drop** | Pure: one `Carry` slice and one set of messages, routed once, written only in `update/carry/` (C1); what is under the finger is `within` over measured boxes, drops and landings core rules (C3); across screens through `WindowHost`; each payload's look and start a closed variant (`float+place`, `float+line`, `self+stepAside`; `hold` or `press`); the device's carry written only with `PlaceWrite` (C4) | matrix keyed by the inventory's payload × target × place × form; trap: pointer capture only from `input` |
| **Motion** | Only the motion engine's module reaches `animate` and the transient channel, over a closed `AnimationSpec` or `AmbientSpec`; causes are a closed union; a timer re-arming itself refused; no CSS motion outside `tc-m-…`, no moving property under a state (decision 34); no animation library in any row; kit elements declare `motion` | trap: an animation or a style write the ledger cannot match fails; frame recorder per cell |
| **Measurement** | Only the measure and input engines read geometry; pure code passes it along and compares it only through the gesture predicates; the loop measures a cause's keys first and last | trap: geometry reads |
| **Scroll** | Only the scroll engine's module writes a scroll position, with `behavior: "instant"`; `overflow-anchor` and `scroll-snap-type` `none` on the root; focus never scrolls (`preventScroll`); CodeMirror's scroll requests become intents | trap: a scroll change in the screen the ledger cannot match; matrix: reveal and edge scroll with the note's and the settings' scroller |
| **Focus** | Only the focus engine's module moves focus or writes `tabindex` (an editor's field through the editors engine, in the focus phase); the kit has no `autofocus`, `tabindex`, `<button>`, `<input>`, `<a>` or `<form>`; CodeMirror's focus requests become intents; two requests in a loop: the topmost layer's | trap: a focus move in the screen the ledger cannot match |
| **Keys** | Only the keys engine's module makes a `Scope` or hears a key; CodeMirror has no default keymap; the key table is one pure concern, its policy one `Layout` variant | matrix: keys × place × form (the settings rows: none) |
| **Input and gestures** | One pure gesture machine; the input engine holds only its state and dispatches its semantic outputs (C2); no ordering in engines; geometry compared only by the gateway's three predicates against gesture tokens, so an outcome needs a core rule; hover is the machine's dwell; every event type owned or denied; the pointer kind read in one module | budget: at most one message per carried pointer move; trap: listeners |
| **Entry** | One field engine (`editors`), run after render in the loop; the entry's rules are the core's `entry.*` and `entryJobStep`; the full card's subtasks and every field route to the same concern | matrix: entry in every place and form |
| **Menus and layers** | One layer stack; `Menu` and `Modal` never constructed (Obsidian's own menus only receive items); the kit has no `<dialog>`, `popover` or `<details>`; fixed positioning and `z-index` only on the kit's layer and over families (decision 34); CodeMirror's tooltips not in `EditorSpec` | matrix; trap: no Obsidian menu is constructed |
| **Search** | Pure, one concern; its reveal's alternatives closed variants (`reveal`, `dayOfFind`), each read in one module; a write of device state needs `PlaceWrite`; the step through results the core's | matrix, equal-variant cells compared |
| **Sections** | Pure, one concern; the lift is a carry payload; one kit `SectionHead` | matrix |
| **Selection** | Pure, one concern; ⌘ and Shift picks are the gesture machine's intents; the Shift range the core's | matrix |
| **Full card** | Pure, one concern; one kit `FullCard`; its project tap a closed variant | matrix |
| **Context** | Pure, one concern; device writes need `PlaceWrite`, derived from the device keys and the door's marks, absent in a note; the mode's door method is data | matrix: a note's cells assert every device key and the projects screen unchanged |
| **Chrome** | `Platform` and `body` classes only in `chrome`; the form read in a condition only in `layout.ts`; the token block's `@media` only `prefers-*` | trap: class writes on `body` |
| **Mounting** | `render` only in the render engine; Obsidian's DOM around the screen only in `mount`; adapters reach `ScreenHost`'s lifecycle surface only | lifecycle test |
| **Time** | Only the time engine's module reaches `requestAnimationFrame`, idle callbacks and the timers; one frame clock per window | trap: timer globals |
| **The file and the core** | One `Door` per runtime; `callDoor` only in the runtime; a need is one door method; the core's values in the UI only through the gateway | runtime tests |
| **Commands** | Declared without hotkeys; a `HostCommand` enters the key table and its policy as a key intent; the active screen is `WindowHost`'s | matrix: keys cells per command and place |
| **Settings** | The tab draws the door's `settings.page` and sends raw values; no branch on an answer's value but a row kind's `switch` | runtime and settings tests |
| **Accessibility** | `role` and `aria-…` closed kit props written by render; `tabindex` only by focus; keyboard reach the key table | matrix: keys cells |

**The screen as a whole:** one `Model`, `Msg`, `update`, `Screen` and `ScreenHost`; a new place is a new constructor in `screen/layout.ts`, its variants' values and its matrix column, nothing else.

**Code the matrix never runs** is covered by requiring each cell to show its concern's whole signature, every `Msg` and `Command` kind exercised by some scenario, and a coverage ratchet on the pure project over the model-level matrix (C5). **Duplicated plumbing in pure code** cannot compute geometry, landings or order (C3) and cannot select by a second reader (C4); a copy is jscpd's, and the rest is the structural reviewer's first question (G9, tier 3).

## What each finding meets

Every attack of the red teams on revisions 11 and 12 (R1: S1-1–S1-6, S2-1–S2-12, S3-1–S3-2, U-1–U-6; R4: F1–F14 and its unbuildable items 1–11), every task, root and note of the scenario review of revision 13 (R6), every architect finding (R2, R5, R7), every behaviour finding (R3), the twenty holes of report B (H1–H20) and the three earlier specs' failures (M, D, U of report B). **Rejected** marks a proposal that answers only deliberate sabotage; the route it names is then covered by tier 3 (§Guarantee): a guard change is visible, and code no ordinary change looks like is read by the structural reviewer.

**The reviews of revision 13.** `R6` traced thirty-two feature tasks of a hurried agent; `R7` is the architect's review. Their findings are met at the level of the four rules (§The one mechanism), not one by one.

| Finding | What it found | Answer in revision 14 |
|---|---|---|
| R6 L1 (tasks 2, 9, 15, 24) | Pure code computes with bare core numbers, `Date`, index callbacks, `entries()`, `for` counters | **Taken, as a principle:** pure UI code has no arithmetic, ordering, `Math`, `Date` or computed index at all (C3); the week's days, the month grid and the share done are core rules; no dataflow tracking |
| R6 L2 (tasks 3, 20) | The gesture folder's exemption holds any decision | **Taken.** No folder computes; three gesture predicates in the gateway, typed so a threshold is a `GestureToken`; an outcome needs a core rule (C3) |
| R6 L3 (tasks 1, 6, 20, 9b) | "One consumer per variant" unchecked | **Taken.** Every `Layout` field and the pointer kind read in a condition by one module, recorded in `readers.ts` (C4) |
| R6 L4 (tasks 12, 14) | Overlays and hover content outside the layer stack | **Taken.** Positioning roles owned by the kit's layer, over and decoration families; a state styles only its own element; every event type owned or denied; hover is the machine's dwell (decision 34, C2) |
| R6 L5 (tasks 17, 18, 5, 22) | `any` and private Obsidian APIs in host code | **Taken.** No `any` call or member and no `as any` in host code; one private declaration file per row, in the closure (C2) |
| R6 L6 (task 19) | Capabilities listed by call | **Taken.** `PlaceWrite` derived from `SETTINGS_FILE.device` and the door's `writes: "device"` marks; the runtime re-checks by data; note cells assert every device key (C4) |
| R6 L7 (tasks 2, 5) | Logic in the runtime's needs and in the settings tab | **Taken.** A need is one door method; the tab draws `settings.page` and sends raw values; the same rule for registration and adapters (C3) |
| R6 L8 (tasks 16, 17, 22, 27) | Packages and APIs named loosely; class strings anywhere | **Taken.** Exact packages and declarations; `EditorSpec`; class prefixes owned by kit, motion and mount (C2) |
| R6 tasks 4, 6, 7, 16, 25–28, 30–32 | Caught or safe | Kept; the checker's messages name the rule to use and say when a change is a weakening (§Guards) |
| R6 task 8 | Drag from a note to the main screen has no home | `WindowHost`: the carry across screens (§Architecture) |
| R6 task 10 | Obsidian hotkeys a second key path | Commands declare no hotkeys and enter the key table as intents (§Architecture) |
| R6 task 11 | No home for a pulse; a self-re-arming timer passes | `AmbientSpec`; self-re-arming timers refused; the ledger attributes render writes (C2, C5) |
| R6 task 13 | One frame clock for every window | A frame clock per window, bound by `WindowHost` (engine row 11) |
| R6 task 20 | `@media` in the token block decides layout | The token block's `@media` tests only `prefers-*` (decision 34) |
| R6 task 21 | Status bar and Obsidian's menus have no home | Data surfaces at their places; `menu.addItem` on handed-in menus (§Architecture) |
| R6 task 23 | Easing math accumulates in `units.ts`; exempt files outside the closure | Springs and easings are `AnimationSpec` kinds, glides `ScrollSpec` kinds, executed by engines with arithmetic (K1); `units.ts` retired; every exempt file in the closure (C5) |
| R6 task 29 | No path from a note to the main screen | `toDevice` intents through `WindowHost` (C4) |
| R6 S1 | Every feature pins; a weakening drowns | **Taken.** `guards:pin` classifies: additions silent, weakening reported (C5) |
| R6 S2 | Exempt product files are not guard files | **Taken.** The checker emits its exemptions into the closure (C5) |
| R6 S3 | Node loader hooks miss Vitest's graph | **Taken, verified:** Vitest 5.0.5 runs modules through Vite's module runner; a Vite plugin records the guard project's modules (C5) |
| R6 B1 | Projects need references | R7 B3 |
| R6 B2 | `AssertNoForeignFacts` cannot be a type test | **Taken.** A checker rule over declared types and imports; a fresh alias is G9's (C1) |
| R6 B3 | `tc-jsx` re-exporting Preact never memoises | **Taken.** `jsx` swaps function components for cached `memo(type)` (C1) |
| R6 B4 | — | R6 S3 |
| R6 B5 | The trap misses popouts | `Target.setAutoAttach` (C5) |
| R6 B6 | The phone form is emulated | **Taken.** Named in G5 and §Tests: the emulated phone view in Chromium, and Max's checklist on the device before a release |
| R6 B7 | Stryker's TypeScript checker cannot load TS 7 | **Taken, verified:** TS 7.0.2 exports no classic API; Stryker runs with the Vitest runner and no checker, incrementally (C5) |
| R6 B8 | No arithmetic in engines forces math into `units.ts` | R7 K1 |
| R6 B9 | Per package is not a guard | R6 L8 |
| R7 B1 | The release build refuses `next` | **Taken.** `npm run build -- --ui=next` into `.e2e/next/`; only release refuses (C5) |
| R7 B2 | The e2e seams contradict each other | **Taken.** Every seam in `hostServices`, inert until the injected script arms it; `Target.setAutoAttach`; §Tests and decision 37 rewritten |
| R7 B3 | Three projects cannot partition | **Taken, verified:** composite project references core → pure → kit → host with `tsc -b`; `Screen.tsx` in the kit; partition by `include` roots (C1) |
| R7 B4 | No typed coverage map | **Taken.** `DoorMethods` in `PhoneCalls.ts` (3a), with a type test equal to `doorMethods()`; line references corrected (`DoorContext` `:93`, `DOOR_COVERAGE` `:1280`) |
| R7 B5 | FLIP has no "first" boxes | **Taken.** Measure first before render, last after (§Architecture, decision 48) |
| R7 B6 | Zero root re-renders against `regions` | **Taken.** `regionsOf(model, parts)`; the budget: during a carry no list or card component re-renders but the target's indicator and the float (P9) |
| R7 H1 | A 100 % coverage gate left | **Taken.** A coverage ratchet plus every kind exercised (C5) |
| R7 H2 | Fixtures demanded for rejected findings | **Taken.** Fixtures for **Taken** findings; rejected ones are G9's checklist |
| R7 H3 | Tier 2 claims more than it gives | **Taken.** Tier 2 names routes to the platform, a decision and the place; duplicated plumbing is tier 3 (§Guarantee) |
| R7 H4, H5 | Leftovers (`rules.*` imported directly; memo key) | Fixed (§Resolution, P3) |
| R7 H6 | 3a gives `backend` frontend work | **Taken.** 3a is the core only; `ViewAnswers` is reworked in 3c1 (§Migration) |
| R7 H7 | 3b's violation list is a baseline | **Taken.** 3b runs the rules on fixtures only; they switch onto `next` at the end of 3c2 in one step |
| R7 H8 | The registry tied to every union member | **Taken.** Two checks: every inventory row maps to a member; every member appears in a scenario (G5) |
| R7 H9 | Decision 50's month grid against C3 | **Taken.** `rules.monthGrid` in the core (3a); decision 50 rewritten |
| R7 K1 | No arithmetic in engines | **Taken.** Engines compute to execute, never order or branch on a number (C2) |
| R7 K2 | Dataflow on `.length`/`indexOf` | **Taken.** Replaced by C3's type rule: no arithmetic or computed index in pure code at all |
| R7 K3 | Property-read ban makes `layout.ts` a god file | **Taken.** Only reads in a condition count (C4) |
| R7 K4 | Decision 33's enumeration | **Taken.** Dropped; each rule is a row of §Guards' rule table with its fixture |
| R7 K5 | Key roles undefined | **Taken.** `tests/matrix/roles.ts`: the roles and the log projection as types (G5) |
| R7 performance: Enter and typing picks | A new `EditorView` per field; a write misses the parse cache | **Taken.** One warm editor per screen; the write seeds the cache (P9, P3) |
| R7 performance: mode switch and swipe | A new context renders every card | **Taken: neighbours at idle**, not windowed lists (P9 says why) |
| R7 performance: the minute tick | Recomputes every need | Budget test added; structural sharing keeps `TaskItem` identity (P9) |
| R7 migration | `ViewAnswers` not "kept"; 3c too big; `preact/compat` direct; the motion box map | **Taken.** Moved to reshaped; 3c split in two; `compat` behind `tc-jsx`; the box map goes (§Migration) |
| R7 "what a 3a agent would guess" | `DoorMethods`' shape, which rules move, where the `TaskItem` cache lives, the project-note index, the budgets, `tasks.keyOf` | **Taken.** Named in stage 3a; `tasks.keyOf` exists (`PhoneCalls.ts:681`), P3 corrected |

Rows below name the answers of revisions 12 and 13; where revision 14 replaced one (branded units and `units.ts`, the gesture folder's comparisons, the place-fact property ban, three projects without references, 100 % coverage), the table above says what replaced it.

**The reviews of revision 12.**

| Finding | What it found | Answer in revision 13 |
|---|---|---|
| R5 F1 | Units as phantom objects still allow `<`, `+a`, `Number(a)`; "no bare `number` in `Model`" collides with the core's answers | **Taken.** Branded numbers; one checker rule against operators, comparisons and conversions on a unit operand outside `units.ts` and the gateway; comparing operations importable only by `update/gesture/`; closed types only for the UI's own types, answers typed per need from the coverage map (C1, C3). Units are kept, not dropped: pure code holds geometry, and arithmetic on it is the natural route to a second drop rule |
| R5 F2 | Stateless engines plus a message per event run the whole loop at pointer rate | **Taken.** The input engine holds the gesture machine's state and dispatches only semantic outputs; continuous values through the transient channel; the pointer-path budget (C2, P5, P9) |
| R5 F3 | Press slop, hold and edge speed are not product rules | **Taken.** Design tokens of the one gesture machine; the core keeps what lands where; the hit test is the gesture concern's (C3) |
| R5 F4 | Two JSX dialects not buildable; Preact in every kit file | **Taken.** One runtime (`tc-jsx`), three type views by `paths`, kit components as values, `memo` in render (C1) |
| R5 F5 | Opaque core-answer fields need a contract rewrite | **Taken.** `Place`'s fields and the place facts of `contracts.ts` read only in `layout.ts`, by a `uiDecides`-style rule; `contracts.ts` unchanged (C4) |
| R5 F6 | Fourteen per-engine projects duplicate the checker and leak | **Taken.** Three projects (pure, kit, host) plus the reachability rule over the engine table as data; `--listFiles` partition check (C1, C2) |
| R5 F7 | Generated router and `Screen` are ceremony; cross-concern steps become an event bus | **Taken.** Root `update` and `Screen` hand-written; cross-concern steps explicit in the root; slice ownership by the checker; `ROUTES` total and `Disjoint` kept (C1) |
| R5 F8 | P9 insufficient: answers dropped on every replica, needs stringified, `layoutOf` rebuilt by `measured` | **Taken.** `needs()` memoised with ids computed once; `layoutOf` and `geometryOf` split; root memo on regions; no serialised keys (P9) |
| R5 F9 | The effect ledger fails on clamps, momentum, Obsidian's own focus and CodeMirror | **Taken.** The ledger judges the screen's subtree; input within 1 s and clamps explain scrolls; library effects by subtree (C5) |
| R5 F10 | No home for `MutationObserver`, the editors in the loop, re-adoption, accessibility, workspace events, `preventDefault` | **Taken.** `MutationObserver` in `mount`; editors after render; `display()` remounts the lists' screens; accessibility owners; registration row 14; the synchronous `preventDefault` invariant (§Architecture, C2, the settings tab) |
| R5 F11 | Stage 3 has no green middle; open-ended gates | **Taken.** Stages 3a, 3b, 3c; coverage on the model-level matrix; the e2e matrix a risk-ranked subset per region and in full at the release gate; mutation a ratchet (§Migration) |
| R5 F12 | "One call site per API" is beaten by a wrapper | **Taken.** Module ownership: only the engine's module reaches the API (C2) |
| R5 F13 | Declared variance is a second behaviour spec | **Taken.** Only equal-variant cells are compared; each variant value has its own scenarios (C4, G5) |
| R4 F1 | `any`, type predicates, `+x`, `JSON.parse`, `Object.entries(place)` open units and `Place` | **Partly taken.** Cheap bans: no `any` (annotation or expression), no `as`, no `this` in pure and kit; conversions on unit operands are in R5 F1's rule; `records.ts` so no cast is needed. **Rejected:** `#private` classes or `WeakMap`s for units and `Place`, a ban on type predicates, "an opaque value flows only into its own type". A lying predicate or `JSON.stringify(place).includes('"note"')` is no ordinary code: it is sabotage, met by tier 3 |
| R4 F2 | A second swipe landing by `indexOf` and `.length` | **Taken.** Ordinal rules are the core's; no arithmetic on an index or a length in pure and kit code, no array of the core's places built outside the gateway; `swipeOnce.test.ts` naming Max at model level; the recorder's "two places away" (C3) |
| R4 F3 | The trailer is self-authored; the manifest is a list that leaks; a hash cycle | **Taken, reframed.** A computed closure (scripts, setup files, helpers, the lockfile included); the manifest outside its own closure, referenced at the last tag and master's head; the trailer dropped; every guard change in its commit, the release notes and the lead's report to Max; the structural reviewer reads it. The claim "outside the agent's reach" is withdrawn (C5) |
| R4 F4 | Every concern can emit any effect, and a note can write the device's filter | **Taken for writes:** a `PlaceWrite` capability only `layoutOf` issues, checked again by `ScreenHost` (C4). **Rejected:** each command kind constructible only by its owning concern; a typing pick, the entry and a reveal all rightly ask for focus or a scroll. Uniqueness is one **execution** mechanism per kind, run in one phase of the loop |
| R4 F5 | Engines keep state in closures; a wrapper keeps one call site | **Taken in its natural part:** mutable bindings in engines only of a handle or a machine-state type; no arithmetic or ordering in engines; module ownership instead of call sites (C2). **Rejected:** generated listener tables and engines as a `switch` only; they contort the engines for no natural route |
| R4 F6 | Kit functions get a stateful `this`; `as const` holding a `Map`; expandos; native `<a>`/`<button>` | **Taken.** No `this` parameter; module-level `as const` literal-only; no property written on a function; `<a>`, `<button>`, `<input>`, `<select>`, `<textarea>` not in the kit view (C1, C5). **Rejected:** a vnode format of our own (it costs P9) |
| R4 F7 | The matrix registry follows the code's unions, so a shrunk union deletes cells | **Taken.** The registry is derived from the inventory's rows: a row mapping to a missing member, or a member no row maps to, fails (G5) |
| R4 F8 | `types: []` does not stop imports; new npm packages unscanned; `next` may import the old UI; the core's rules reachable around the gateway | **Taken.** `paths` per project with `--listFiles`; no triple-slash directives; `skipLibCheck` off in pure and kit; npm packages per engine row; no imports between `next` and the old UI; core values only through the gateway (C1–C3, C5). **Rejected:** an ES-library allowlist for `(() => 0).constructor`-style doors: sabotage |
| R4 F9 | Place leaks through the root answer's shape, reused variants, form-correlated messages, a variant gating a whole copy | **Taken:** the root answer's `kind` is a place fact read only in `layout.ts`; input kinds only to the gesture concern (C4). **Rejected:** variants only as keys into data tables (it contorts every handler); a variant branching into a second implementation is the structural reviewer's question, and the copy is jscpd's |
| R4 F10 | The trap tests another bundle; input swallows the ledger; style writes unwatched; branch coverage only | **Taken.** The matrix and trap on the release bundle, the trap injected over CDP; the ledger attributes scrolls to input on that scroller; style, class and attribute mutations judged; line, function and branch coverage of the pure project (C5, §Guarantee) |
| R4 F11 | The generator and the gateway follow their inputs | **Taken.** No generator remains; every script the commands load is in the closure; the gateway is hand-written and a change to it is a guard change. **Rejected:** "one core rule per inventory decision" as a check: the core's rules are reviewed as the core |
| R4 F12 | One fact in two slices | **Taken.** Slice ownership and `AssertNoForeignFacts` (C1) |
| R4 F13 | `ScreenHost`, registration and the note adapter hold logic in closures | **Taken.** The engines' binding rule covers `ScreenHost` and the adapters (C2); the rest is G9's |
| R4 F14 | `transform`/`inset` under a state; `:has()` with a variant class | **Taken.** Under a state only paint properties are allowed (an allowlist); `:has()` may not name a variant class (decision 34) |
| R4 unbuildable 1 | No bare `number` against the core's answers | R5 F1 |
| R4 unbuildable 2 | The manifest's hash cycle | R4 F3 |
| R4 unbuildable 3 | 100 % mutation with no `Stryker disable` | A ratchet, no 100 % gate (C5) |
| R4 unbuildable 4 | Engines that compare nothing | Equality allowed; `deltaMode` by `units.fromWheel`; `preventDefault` from the machine's state (C2) |
| R4 unbuildable 5 | One `focus` call site against CodeMirror | Module ownership: the focus engine asks `editors` by key for its field; a field's own focus is the editors engine's module (C2) |
| R4 unbuildable 6 | The kit's JSX free of Preact | One runtime in the render engine's row (C1) |
| R4 unbuildable 7 | Add/remove sets cannot express divergent follow-ups | Equal-variant cells only (C4) |
| R4 unbuildable 8 | No `as` and no predicates force casts | `records.ts`; predicates allowed (C5) |
| R4 unbuildable 9 | Per-engine projects cannot split the DOM | Three projects; members by the checker (C1, C2) |
| R4 unbuildable 10 | `display()` orphans adopted rows; the settings scroller | `display()` remounts; `.vertical-tab-content` first in the chain (the settings tab) |
| R4 unbuildable 11 | Every stage needs a re-pin by Max | No approval gate: the lead reports guard changes; the mutation floor outside the manifest (C5) |

**The reviews of revision 11 and earlier.**

| Finding | What let it through | Killed by |
|---|---|---|
| R1 S1-1 | A private folder holds a second FLIP or a second carry | C2: only the motion engine's module reaches `animate`, over closed specs; C3: pure code can compute no geometry outside the gesture concern; slice ownership of the carry |
| R1 S1-2 | `Px` opt-in; bare numbers free; motion allowed arithmetic | C3: branded units, one checker rule; engines do no arithmetic; `motion` gets finished specs |
| R1 S1-3 | Gate-only by code shape; which-of-two needed | Closed variants with one consumer, per-concern `Layout` parts (C4); equal-variant cells compared |
| R1 S1-4 | Place proxies (core answer fields, pointer kind, chrome, `closest`) | C4: place facts read only in `layout.ts`; input kinds only to the gesture concern; `mount` alone sees Obsidian's DOM |
| R1 S1-5 | CodeMirror and `Menu`/`Modal` carry whole concerns | C2: libraries configured to delegate; `Menu`/`Modal` not used; the ledger judges library effects by subtree |
| R1 S1-6 | The guards' guards in the agent's write path | C5: a computed closure stops tests, builds and releases on an unpinned change; a pinned one is listed, reported to Max and reviewed; escape hatches banned |
| R1 S2-1 | Engines hold state and recognise | C2: handles or the machine's state only; no arithmetic or ordering; semantic outputs only |
| R1 S2-2 | Any engine may add any listener | C2: listeners by event type |
| R1 S2-3 | Hooks, module state, native behaviours in the kit | C1: the kit's type view; no hooks in reach; literal-only module scope; no `this` |
| R1 S2-4 | CSS motion and place branches the rule did not name | Decision 34: the CSS an allowlist; paint-only under a state; `overflow-anchor`/`scroll-snap-type` `none`; no host ancestors or media queries |
| R1 S2-5 | A structural type of an engine's own hides a host call | C2: the checker resolves every member to its declaration; a host declaration only in its row's module |
| R1 S2-6 | Unscanned `.js`, `.d.ts`, files outside `obsidian/` | C5: scope by the metafile; no ambient declarations or triple-slash directives; the trap per realm |
| R1 S2-7 | Popouts, effects with no call, unrun paths | C5: the trap per realm on the release bundle; the ledger; coverage over the model-level matrix |
| R1 S2-8 | The matrix satisfied trivially | G5: cells from the inventory; each shows its concern's signature; `notOffered` cells run and assert absence; empty logs fail |
| R1 S2-9 | A new cause with its own engine; causes with free payloads | C2: one motion engine, specs of tokens; causes carry keys only |
| R1 S2-10 | `model/` and the router as logic zones | C1: `model/` holds types; the root `update` routes, broadcasts and holds the cross-concern steps; slice ownership |
| R1 S2-11 | Adapters dispatch messages | `ScreenHost`'s surface frozen to lifecycle intents |
| R1 S2-12 | Dynamic kinds, bags, casts | C1: closed UI types, deep-readonly model; C5: no `as`, no `any` |
| R1 S3-1 | A master "fix" keeps the old UI alive | G8: a ported entry names a test that must exist, sit in the matrix and fail when the new UI's fix is reverted; `failureText` moves out of the old UI before stage 7 |
| R1 S3-2 | jscpd sold as a guarantee | A backstop only |
| R1 U-1 | Gate-only against decision 53 | C4 variants |
| R1 U-2 | The trap fails CodeMirror's own listeners | C5: library effects judged by subtree |
| R1 U-3 | The `Px` rule against the recognizer, edge scroll, pinch | C3: unit operations; comparisons in `update/gesture/`; slop and speed the machine's tokens |
| R1 U-4 | Name bans hit host and core names | No name bans; the checker resolves declarations |
| R1 U-5 | A frozen table of every file name | C2: concerns and engines frozen, pure files free |
| R1 U-6 | 100 % mutation at once | C5: a ratchet |
| R2.1, R2.10 | A write re-renders every card | P9 |
| R2.2 | One route per kind against `rebased`/`viewsChanged` | C1: broadcasts |
| R2.3 | The note adapter cannot decide or scale | §Architecture: one `ScreenHost` per Markdown view; "not a project" draws nothing; the check indexed |
| R2.4 | rAF and timers in "kept" drivers | The time engine; §Migration's kept list corrected |
| R2.5, R2.6 | Arithmetic ban misplaces code; gates can't express alternatives | C3 units and the gesture concern; C4 variants |
| R2.7, R3 §4 | The settings tab as a full place | the settings tab in §The one mechanism |
| R2.8 | Registration, commands, clipboard, visibility, outside press, keyboard events, haptics, external drop | §The engine table rows 7, 10, 12, 14 |
| R2.9 | Name ban too broad | Dropped |
| R2.11 | Stage 3 too big; the note hostless | §Migration: 3a–3c2; the note mounted from stage 3c1 |
| R2.12 | God files | Pure concerns are folders with any files; engines are small translators |
| R3 §1.1–1.6 | Settings lumped; reorder as a transition; wrong cause; fit frame measured; stale words; stage 6 rule | Traceability rerun; the settings tab in §The one mechanism; `stepAside`; decision 44; §Migration |
| R3 decisions 51, 52, 54 | Undeclared product changes | Decisions 51, 52, 54 rewritten; §Old bugs 15–17 |
| R3 old bug 3 | The open field in a note | §Old bugs 3 |
| M1–M9, D-1–D-9 | "One" per class or per host; parity by cross-reference; custom code allowed | C1–C3: one screen, one engine per concern, rules in the core; the frozen table has no exemption list |
| U1–U20 | Migration and ownership by place; host-owned logic; flags; per-place e2e | C1, C2, C4, G5, G8, G9; §Migration |
| H1 | `LeafModel`, `leafCarry`, `LeafMsg` | C1: one `Model`, one `Msg` routed once, slice ownership; a second carry has no slice, no messages and no geometry to compute with |
| H2 | `LeafHost` with its own draw and `run` | `ScreenHost` is the one controller; adapters reach only its lifecycle surface |
| H3 | `drivers/motion/ribbonFlip.ts` | C2: only the motion engine's module reaches `animate`, over closed specs |
| H4 | CSS `transition` on a state | Decision 34: motion only under `tc-m-…`, never with a state |
| H5 | Two stores for one screen | C1: one `Program` instantiation, in `ScreenHost` |
| H6 | `Measure.leafColumns`, per-host coordinates | C3: units made only by engines; geometry compared only by the gesture concern's one hit test |
| H7 | A host's own `targetAt` | `ScreenHost` holds handles only; the hit test is the gesture concern's |
| H8 | `Keys.leaf` | C2: only the keys engine makes a `Scope`; the policy a variant |
| H9 | `RibbonGlide` | C2: only the scroll engine writes a position; glides on the one frame clock |
| H10 | A host's own focus timing | C2: only the focus engine moves focus, last in the loop |
| H11 | `leafEntry` with its own look | C4: the look is the entry's `Layout` part |
| H12 | `LeafMenu` with its own placement | One layer stack; placement by measure and motion |
| H13–H15 | `leafSearch`, `leafSection`, `leafRows` | C1/C4: one concern each, routed once, its alternatives variants |
| H16 | A freeze allowance | G8 |
| H17 | DOM work outside `obsidian/ui/next` | C2: the engine table covers the bundle; C5: scope by metafile |
| H18 | A second flag | G8: one build constant |
| H19 | The reviewer sees only the diff | G9: the whole tree and every guard change |
| H20 | Each place matches the old one apart | G5: logs equal across equal-variant cells |

## Guards

The compiler and the checker carry the guarantee's second tier; these are their parts. Every file listed, and every file a rule exempts by path, is in the guards' closure (C5).

| Check | What it checks | Part |
|---|---|---|
| `core/tsconfig.json`, `tsconfig.next-pure.json`, `tsconfig.next-kit.json`, `tsconfig.json`; `tests/guards/projects.test.ts` | The four composite projects built with `tsc -b`, each consuming the one below as declarations; `paths` per project; `skipLibCheck` off in pure and kit; every metafile input under exactly one project's `include` roots | C1 |
| `view/jsx/` | The one runtime (memoising every function component) and the kit's type view | C1 |
| `tests/types/closed.ts` | The UI's own types closed; `ROUTES` total and `Disjoint`; `DoorMethods` equal to `doorMethods()` (in the core's tests, 3a) | C1 |
| `tests/uiRules.ts` and its rule table below | The checker, by declaration, over the metafile's inputs | C1–C5 |
| `tests/guards/engines.ts`, `tests/guards/readers.ts`, `tests/engines.test.ts` | The engine table and the readers as data, and equal to the code | C2, C4 |
| `tests/guards/swipeOnce.test.ts` | Names Max: every swipe lands where `rules.swipeLanding` says | C3 |
| `tests/styles.test.ts` (below `/* next */`) | Decision 34's allowlist; `screen/tokens.ts` equal to the CSS's gesture tokens | C1, C2 |
| `tests/matrix/rows.json`, `registry.ts`, `roles.ts`, `model.test.ts`, `scripts/e2e/matrix.ts` | G5 below | — |
| `scripts/e2e/trap.ts`, `tests/e2e/trap.test.ts` | The trap and its effect ledger, injected per realm (popouts by auto-attach) into the `--ui=next` production bundle | C5 |
| `tests/guards.test.ts`, `tests/guards/fixtures/` | Every rule has reject and accept fixtures, and matches a real input; every **Taken** finding that code can show is a reject fixture of the rule that kills it | — |
| `guards/manifest.json`, `npm run guards:closure`, `guards:pin` | The closure, its hashes, and the classification of a change into silent additions and reported weakening | C5 |
| `stryker.config.mjs`, `guards/mutation-floor.json`, `guards/coverage-floor.json` | The two ratchets | C5 |
| `.jscpd.json` | A backstop: no copied block | — |
| `tests/uiFreeze.test.ts`, `tests/oneSwitch.test.ts` | G8 below | — |
| `tests/hostLifecycle.test.ts` | Every adapter and `WindowHost` in each form, mid-gesture too, leaves nothing alive | P8 |
| `tests/budget/` | P9's budgets: a write, the pointer path, a typing pick, the minute, a mode switch, a swipe | P9 |
| `tests/architecture.test.ts`, `tests/uiDecides.test.ts` | Unchanged | — |

**The checker's rules.** Each is one rule over declarations, types or the import graph, with its own reject and accept fixtures (`tests/guards/fixtures/<rule>/`). Its message names what to do instead, and, for a change to its own data, that the change is a weakening the lead reports.

| Rule | Says | Part |
|---|---|---|
| `reach` | A host declaration (DOM, Node, Obsidian, Preact, CodeMirror, any package, `globalThis`, `Reflect`, `Function`, `eval`, `Proxy`) only in the module whose row names it; anything no row names is denied | C2 |
| `events` | A listener's event type only in its owning engine; an event type no row names is denied | C2 |
| `packages` | An import of a package only where its row names it exactly | C2 |
| `hostAny` | In host code, no call or member read on an expression of type `any`, no `as any`, no `as unknown as` | C2 |
| `ambient` | Ambient declarations only in `view/jsx/` and `engines/<row>.private.d.ts`; no triple-slash directive | C2, C5 |
| `classes` | `tc-n-` literals only in the kit, `tc-m-` only in motion, `task-calendar` only in mount | C2 |
| `execute` | In engines and hosts: no ordering operator, no `Math.min`/`max`, no number in a condition; mutable bindings only of a handle or a machine-state type | C2 |
| `rearm` | No pure handler issues a timer whose message is its own kind | C2 |
| `noCompute` | In the pure and kit projects: no arithmetic or ordering on a number, no `Math`, no `Date`, no computed numeric index, no `at`/`slice`/`splice`/`with`/`fill` with a non-literal argument | C3 |
| `gateway` | The core's values reached from the UI only through `screen/rules.ts`; a `GestureToken` made only in `screen/tokens.ts` | C3 |
| `answers` | In `obsidian/runtime/dispatch/`, `host/settings.ts`, `host/registration.ts` and `host/adapters/`: no comparison or branch on an answer's or a control's value, but an exhaustive `switch` on a kind; a need is one door method | C3 |
| `oneReader` | A field listed in `readers.ts` (the place, its facts, every `Layout` field, the pointer kind) read in a condition or as a computed key only in its one module; a `Layout` field missing from `readers.ts` fails | C4 |
| `placeWrite` | `PlaceWrite` made only in `screen/layout.ts`; a door method marked `writes: "device"` or a device patch only in a `placeWrite` command | C4 |
| `slices` | A slice's fields built only in its concern's folder; a slice field's type declared in that concern's module | C1 |
| `moduleState` | Module scope in pure and kit code: functions, types, literal `as const` data; no expando | C1 |
| `boundaries` | No imports between `obsidian/ui/next` and the old UI | C5 |
| `hatches` | No suppression comment, `.skip`, `.only`, `.todo`; in pure and kit code no `as` (but `as const`), no `any`, no `this` parameter | C5 |

**Dropped in revision 14**, each with what does its work now: `units.ts` and the unit-operand rule (C3's `noCompute`: no arithmetic in pure code at all); the `update/gesture/` exemption (the gateway's three typed predicates); the dataflow rule on `.length`/`indexOf` (`noCompute`); the property-read ban on place facts (reads in a condition only); "no arithmetic in engines" (`execute`: arithmetic yes, ordering no); `AssertNoForeignFacts` as a type test (`slices`); the `--listFiles` partition (project references and `include` roots); decision 33's list of kinds allowed nowhere (the rule table); fixtures for rejected findings (G9's checklist); the 100 % coverage gate (a ratchet); a violation list for slice 3's code in 3b (the rules switch on at the end of 3c2). Revision 13 had dropped the phantom units, the second JSX dialect, the per-engine projects, the generators, the opaque answer fields, call-site counting, the declared-variance comparator, the core's gesture rules, the trailer and the manifest's self-hash.

**G5. The matrix.** `tests/matrix/rows.json` maps every inventory row a concern must show in a place to its cell: (concern, payload or variant, place, form). `tests/matrix/registry.ts` is derived from it, with **two checks**: every row maps to a member of the code's unions (a row naming a member the code lacks fails, so shrinking a union cannot delete a cell), and every member of a concern's closed unions (a carry's payload × target kinds, every `MotionCause`, every message and command kind) appears in some scenario, inventoried or not (`motionSettled` and `viewsChanged` need no inventory row). A cell is scenarios, or `notOffered(variant)`, which runs the same scenarios and asserts the concern's commands and causes are absent. Each cell must show its concern's signature. **Key roles** (`tests/matrix/roles.ts`) are a closed type, `lifted`, `target`, `neighbour`, `landed`, `other`; a log is projected onto them (each message, command and motion cause with its keys replaced by their roles), and one concern's projected logs are compared across the cells whose variant values are equal; an empty log fails. Scenarios run as message logs through the one `update` (model level, every cell, under the coverage ratchet) and in the test Obsidian under the frame recorder and the trap on the `--ui=next` production bundle (a risk-ranked subset per stage; every cell, desktop and the **emulated** phone view, light and dark, at the release gate). The settings rows have their own cells: carry, motion (`stepAside`, the drop), measure and input at `Places.rows(list)` in both forms; every other concern `notOffered` there. **What the emulation leaves out** (CDP cannot attach to Obsidian on iOS's WKWebView): the real keyboard and its rising on a pick, momentum scroll and the rubber band, safe areas and Capacitor's haptics. Max's phone checklist covers them on the device before each release (§Tests 8), and the recorder's swipe and edge rules run on the emulated touch stream.

**G8. No coexistence.** No flags per place: one build constant, `UI` (`"old" | "next"`), read once in `main.ts`; `npm run release` refuses `next` until stage 7 (`npm run build -- --ui=next` makes the test bundle). master never holds both: the work reaches master in one merge, at stage 7, which switches and deletes the old UI, its CSS, `UI` and the freeze. Until then the old UI is frozen by content: every old file by blob id, changed on the branch only to master's version at a commit the list names, each change with a port in `tests/uiFreeze.ported.ts` whose named test must exist, sit in the matrix and fail when the new UI's fix is reverted; otherwise the list may only shrink.

**G9. Structural review per stage.** A fresh reviewer, who wrote none of the stage's code, gets the engine table, the whole tree at the stage's head, the guards and the stage's weakening changes, and one task: find a concern implemented twice, an effect the plugin did not order, a decision computed in the UI, a selector of behaviour read twice, a variant branching into a second implementation, or a guard changed to let something through. Its checklist also holds every **rejected** finding of §What each finding meets (a lying type guard, a value smuggled through `JSON.stringify`, a fresh alias holding another concern's fact). Each finding becomes a reject fixture first, then a fix at the part (C1–C5) that let it through. A stage ends when a second fresh reviewer finds nothing.

| Impossible by construction | Enforced by |
|---|---|
| A write out of the order Max acted in | runtime tests; the core-call rule |
| A frame mixing generations or contexts | synchronous views computed in the dispatch loop before render; runtime replay tests |
| A card flashing back after a drop or a rename | runtime tests: a write's outcome is in the same message |
| An outside edit lost, or overwriting a pending write | replay tests: Sync during three pending calls, one of which goes stale |
| Single rows moving across a context; a transition twice | `update` and `motion` tests; the frame recorder |
| Re-rendering at pointer rate; every card re-rendered by one write | the pointer-path and render-counter budgets (P9) |
| A redraw under the finger | the pin tests |
| A screen going stale under a layer | the layer tests |
| A row remounting from field to card | identity tests |
| Something alive after its host | the lifecycle test |
| Focus scrolling the screen; the keyboard not rising on a pick | the focus engine; the phone checklist |
| A swipe landing two places away | `swipeOnce.test.ts`, the core's `swipeLanding` test, the recorder |
| A second implementation of a concern | §Guarantee: the architecture, the checker, the matrix and the trap; G9 |
| A place deciding anything but its variants | C4: every selector of behaviour read in a condition by one module |
| A decision computed in the UI | C3: `noCompute`, the gateway, the gesture predicates |
| A note writing any device state | `PlaceWrite` from data, the runtime's check (C4); the note's matrix cells |
| Old and new UI on master together | `oneSwitch`, `uiFreeze` |
| A guard weakened unseen | C5: the closure's hashes, the pin's classification, the release notes, the lead's report, G9 |

## Resolution

| Class | Where it lands |
|---|---|
| M1 settings tab | Obsidian's own `Setting` chrome; its row reorder on the one carry at `Places.rows(list)` (stage 6) |
| M2 plugin host | the runtime |
| M3 chrome | `chrome` |
| M4 core reads per draw | view answers through `needs(model)`; `rules.*` through the gateway `screen/rules.ts` (C3) |
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
| M20 recognition | the gesture machine (`update/gesture/`), held by the input engine |
| M21 service callers | new screens call only the runtime; the old screen keeps its services until deleted |
| M22, R3, R8 outcome of a write; preview core | the door gives the real outcome at once (P3) |
| M23 key scopes | `keys` |
| R4 identity | `CreatedTask` id at once, bound to the row key (P1) |
| R6, R11 what a context shows meanwhile; events | nothing is waited for; events cached first (P3) |
| R7 guard scope | §Guards: the bundle's metafile (C5) |
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
| R21 "the core" against the pure rules | the rules through the gateway; `callDoor` stays in the runtime (P2, C3) |
| R22 what views a screen needs | `needs(model)` per screen, recomputed on every replica change (P2) |
| R23 kept parts after a replay | `tasks.reconcile(idMap, dropped)` (P3) |
| Root, rev 8: the dispatch loop | P2's loop: door calls right after `update`, answers fed back before render, views reach the model as data |
| Root, rev 10: the work owned by place (report B) | C1–C5, G5, G8, G9; §What each finding meets |
| Root, rev 11: the guarantee enumerated what is forbidden (R1–R3) | C1–C5: one owner per concern, enforced by the checker over declarations |
| Root, rev 12: the guarantee's type machinery unbuildable and contorted, built against sabotage (R4, R5) | §Guarantee's threat model: architecture, machine checks of every natural route, visible circumvention; C1–C5 simplified |
| Root, rev 13: natural routes still open, the UI computing decisions; six build blockers (R6, R7) | §The one mechanism's four rules; `WindowHost`; the blockers fixed (§What each finding meets) |
| R2.1 render cost | P9 |
| A note sharing the device's filter, place, day and carry (report C, §3) | the note's `Layout` variants (C4); §Old bugs and contradictions |
| R24 the UI's mechanisms not unique (the traceability's class for revisions 11–12) | §The one mechanism, §The engine table; every row's owner is a concern of the one screen |

## Migration: by concern, the main screen first, one switch

The old screen keeps its own services, untouched, until it is deleted. Nothing of the new UI reaches master, or Max, before stage 7, which switches every place at once and deletes the old UI in the same merge (G8). Until then the e2e build holds both, behind the build constant `UI`: each sees the other's writes as outside changes and rebases, as the plugin and the iPhone app do. Stages 1 and 2 are built; stages 3–7 replace revision 10's slices 3–7.

**Every stage ends the same way:** the compiler and every check of §Guards green, the model-level matrix complete for the places and payloads that exist, the coverage and mutation scores at or above their floors (the floors raised to them), the stage's risk-ranked e2e subset passing on the `--ui=next` production bundle with the trap and its ledger clean (from 3c1), the behaviour review done, a structural review (G9) clean, and every weakening change of the stage reported to Max by the lead. A stage that needs the core starts with `backend`.

| Stage | What | Release |
|---|---|---|
| 1 | **The runtime and the core's part** (built, kept). | — |
| 2 | **Guards, freeze, the lifecycle test, the e2e harness** (built; reshaped in stage 3). | — |
| 3a | **The core's part, the core only** (`backend`; green on the core's own tests and budgets): <ul><li>**`DoorMethods`** in `PhoneCalls.ts` (not `contracts.ts`, which CLAUDE.md freezes): `interface DoorMethods { "tasks.move": { args: readonly [TaskKey, MoveTarget]; answer: MovedTask; writes: "tasks" }; "tasks.selectProjectNode": { args: …; answer: …; writes: "device" }; … }`, one entry per method `doorMethods()` lists (`writes`: `"none"`, `"tasks"`, `"settings"` or `"device"`), with a type test that the two agree, and `callDoor` typed by it; `writes: "device"` on every method that may change the projects screen or a device key.</li><li>**Structural sharing:** a `TaskItem` cache keyed by (id, line text) in the door's cross-call cache (`DOOR_CACHE`), so an unchanged line keeps its object across texts; the ids, the history and the projects screen keep their identity when a call did not change them; a write seeds the parse cache with its new document.</li><li>**The rules the UI computes today**, each a pure core rule under `rules.*`: `monthGrid` and `weekDays` (from `model/monthGrid.ts`), `stepPick` (the search's step and clamp, `model/search.ts:82`, `update/search.ts:41`), `pickRange` (the Shift range, `update/select.ts:37-39`), `sectionSpan` (a section's rows under a lift, `update/carry.ts:225-244`), `nearestSlot` and the plus ring's reach (`model/carryPlace.ts:101-138`), `branchPasses` (`model/lists.ts:104`), and the entry field's row (`model/entry.ts:181-225`, as `entry.*`'s answer).</li><li>**The project-note index:** `projectNoteView` (`PhoneCalls.ts:487`) answers from a map of path → project kept in the cross-call cache, rebuilt when the project notes change.</li><li>**Budgets** (30 KB file, warm): a view, a write and a carry step under 1 ms; a state-only call under 0.3 ms; one write keeps every unchanged `TaskItem`'s identity.</li></ul>`tasks.keyOf` exists already (`PhoneCalls.ts:681`). | — |
| 3b | **The construction, proven on fixtures** (frontend-obsidian): the four projects with `tsc -b`; `tc-jsx` with `memo` and the kit's type view; `screen/rules.ts`, `geometry.ts`, `tokens.ts`, `records.ts`; the engine table and `readers.ts` as data; every rule of the checker's table with its reject and accept fixtures, run **on the fixtures only**; the CSS allowlist; the closed-type test; the matrix registry and roles; the trap with its ledger and the seams in `hostServices`, armed over CDP with auto-attach; `--ui=next` builds; the guards' closure (the Vite plugin, the metafile, the loader hooks), `guards:pin`'s classification and the release script's check; the coverage and mutation floors at their first scores; `UI` and the content freeze. No violation list: slice 3's code is not yet under the rules. | — |
| 3c1 | **The main screen's lists and entry, onto the construction:** `Places.main()` and `Places.note(path)` both mounted under `UI=next` (the note adapter one `ScreenHost` per Markdown view), `WindowHost`, lists, cards, sections, entry with the warm editor, the gesture machine in the input engine, `ViewAnswers` reworked (P9: per-part caches, need ids computed once). | — |
| 3c2 | **The carry, menus, selection, search and the full card** onto the construction. Ends by switching every rule of the checker onto `obsidian/ui/next` in one step, all green. | — |
| 4 | **The main screen, region by region**, each adding to the existing concerns and engines: <ol><li>the timeline (lanes, events, the now line, zoom, slots, its drops and stretches);</li><li>Two columns and the ribbon, the wheel, both swipes, the day turn, the Done column;</li><li>All columns and the dividers;</li><li>the panel and the tree, the filter and its title, the tree's lift and drops, the hover-open, the left-edge reveal;</li><li>the carry across every target, select mode across columns, the bulk menu, the sources and event menus, the missing file.</li></ol>Each region ends with its matrix cells and its smoke subset. | — |
| 5 | **The note completed.** Its variants (§Old bugs 1–5, 13, 14), the inline frame, the scroll chain to the note's scroller, its matrix column complete. Its diff adds values to existing variants and nothing else: no new concern, engine, message or command. | — |
| 6 | **The settings tab.** First the behaviour inventory gains the tab's inputs it lacks (the colour well's live preview, the code field, swatches, bins, Add buttons, sliders, dropdowns, More's rows, the login row, Copy; R3 §4). Then `host/settings.ts` on Obsidian's `Setting` as today, and `Places.rows(list)` with the adopted rows, the `settingsRow` payload, its `self` look and `stepAside` (the settings tab in §The one mechanism). Its matrix cells. | — |
| 7 | **One switch, and the old UI deleted in the same merge.** The release gate passes (the full e2e matrix on the release bundle), an independent QA on a copy of Max's real file finds nothing, then one merge into master: `main.ts` mounts the new UI everywhere; `UI`, the old UI (`CalendarScreen` and everything only it uses, the old `SettingsTab`), the old CSS above `/* next */`, `Picks`, `Reload`, `WriteQueue`, the old services' plugin wiring, the freeze and its baselines are deleted; `obsidian/ui/failureText.ts` has moved out of the old UI first. | ★ with Max's phone checklist |

**What of slices 1–3 is kept, renamed or reshaped** (report A, corrected by R2.4):

| Fate | What |
|---|---|
| **Kept as is** | The runtime but `ViewAnswers`: `Program`, `Store`, `HostSession` are generic; the `Program` is instantiated once, by `ScreenHost`. Pure models `answers`, `assertNever`, `card`, `section`, `select`, `taskMenu`, `layers`, `search`, `full`, `commands`, into their concerns' folders. `recognizers/press.ts`, grown into the gesture machine (`update/gesture/machine.ts`), its distance through the gateway's predicates. `model/monthGrid.ts` goes to the core (3a). The e2e harness, the recorder, the shots, the budget. |
| **Reshaped in 3c1** | `obsidian/runtime/dispatch/ViewAnswers.ts`: it stringifies every need's arguments (`:25`) and drops every answer on any new replica (`:40-45`); it becomes P9's per-part cache with need identities computed once, and a need is one door method (C3). |
| **Kept, reshaped at their edges** | The drivers become engines: `focus`, `keys`, `overlay` (into `mount`), `chrome`. `scroll` (its frames and timeouts, `scroll.ts:43,130-134`, go to the time engine), `input` (its timeout, `input.ts:281`, goes to the time engine; its comparisons to the gesture machine, whose state it holds), `islands` → `editors` (its timeout, `islands.ts:124`, to the time engine; CodeMirror configured to delegate keys, focus and scroll). The view leaves `Card`, `List`, `Sheet`, `icons`, `entry/Bar`, `carry/SelectFoot` into `view/kit/` under the kit's type view. |
| **Renamed** | `BlockMsg` → `Msg`, split into the concerns' unions; `update/menu`, `full`, `ids`, `fullActs`; `view/menu/TaskMenu`, `full/FullCard`, `carry/CarryFloat`; `BlockKey` → a key intent; the CSS root `tc-n-block` → `tc-n-screen`. |
| **Reshaped** | `model/block.ts` → `Model` (with `place`, read only in `screen/layout.ts`) and `screen/layout.ts`; `BlockLists` → `Layout.regions`, its eight flatteners → one selector of the layout concern; `model/carry`, `carryPlace`, `carryView` → the carry concern, its geometry through the gesture concern's hit test (today's `carryPlace.ts:57`, moved) and units; `update/block.ts` → the hand-written root `update`, the motion concern (`withMotion`) and the context concern (`modePicked` through `root.modeWrite`); `update/search`, `select`, `section`, `acts` read their `Layout` parts; `view/Block.tsx`, `BlockRoot`, `Layers`, `search/Search` → the hand-written `Screen` and kit elements; `drivers/measure.ts` → boxes per key, units made here; `drivers/motion.ts` → one `animate` over specs, its map of every row's box (`:67`) gone for the loop's first and last measures of the cause's keys, its height hold → the pin, its box reads → measure, its `put`/`inline` → mount; `preact/compat` (`Card.tsx`, `BlockRoot.tsx`) only behind `tc-jsx` and the render engine; `BlockHost.tsx` → `ScreenHost.ts` (`blockProgram`, `entryDoor` into `update`; its `feed`/`over` gesture state (`BlockHost.tsx:269-345`) into the input engine as the gesture machine's state, which already dispatches only a lift, a target change and a drop; its long-press timer the machine's hold on the time engine); `NoteBlocks.ts` → `host/adapters/note.ts`, one `ScreenHost` per Markdown view; `composeRuntime.ts`: no `NewScreens`, the feeds always given. |
| **Deleted** | The `newBlock` device value (`task-calendar:new-screens`), `NewScreens`. |

## Tests

1. **`update` (unit):**
   - every decision 55–87 and fix commit as a replayed message log;
   - every A16 rule;
   - pins (changed, gone, hidden-not-gone, a Sync re-id);
   - identity across create, rename and undo;
   - midnight during a swipe;
   - bounds;
   - every model-level cell of the matrix (G5), each place's model through the one `update`, covering every line, function and branch of the pure project;
   - `swipeOnce`: every swipe cell lands where `rules.swipeLanding` says;
   - P9's render counts: one write re-renders only the cards it changed.
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
3. **The gesture machine (unit):** every input of the inventory's section A as a stream, and its semantic outputs; at most one output per pointer move.
4. **Views (happy-dom):** what each draws for a model; the render counter; the caret and composition surviving updates.
5. **Engines (happy-dom):**
   - transitions run once;
   - running motions are cancelled before the next measure;
   - interruption;
   - scroll yields to the user;
   - focus within the event.
6. **End to end (`scripts/e2e/`, CDP, a test Obsidian with a copy of Max's real file):**
   - **Geometry against the design boards** at rest, with a tolerance.
   - **Old against new** at rest where the behaviour is meant to be the same, in the e2e build, which alone holds both UIs (G8).
   - **The matrix** (G5): every cell's scenarios on the release bundle, with the frame logs of one concern compared across equal-variant cells, and **the trap** (C5) injected over CDP on every e2e run.
   - **Clock, network and the outside:** every seam is in `hostServices` and ships inert in every bundle; the script injected over CDP before the plugin loads (and into every popout by `Target.setAutoAttach`) arms them: the clock frozen through the core's clock (never CDP virtual time), calendars from fixtures through the `Http` seam, `outside()` and `window.open` recorded so nothing opens on Max's Mac. A run whose seams are not armed is refused by the harness before the first step.
   - **Frame recorder** from `document.getAnimations()` and the CDP Animation domain, with row boxes sampled. It fails on:
     - motion without a cause;
     - single rows moving across a context;
     - overshoot;
     - a rest more than 0.5 px off;
     - gaps or overlaps;
     - a swipe landing two places away.
   - **Budget, in separate runs, on the `--ui=next` production bundle:** P9's budgets per gesture (a continuous gesture under 8 ms of script per frame and no long task over 16 ms; a typing pick under 16 ms to the paint; a mode switch under 50 ms) with 300 tasks at 4× CPU.
   - **Touch** through `Emulation.setTouchEmulationEnabled` and `Input.dispatchTouchEvent`.
   - **Gates:**
     - a risk-ranked subset gates each region;
     - the release gate is every input, in each mode, on desktop and the emulated phone view, in light and dark (what emulation leaves out: G5);
     - the full matrix runs before the switch.
7. **The guards' own tests:** each rule's reject and accept fixtures, non-vacuity, mutation at or above its floor (Stryker's Vitest runner, no TypeScript checker, incremental, apart from `npm test`), jscpd as a backstop, the closure and its hashes, `guards:pin`'s classification on recorded diffs, the projects' partition.
8. **Max's phone checklist at the ★** (under 5 minutes), the device-only part the emulation cannot see (G5): momentum scroll, the rubber band, the real keyboard and its rising on a pick, safe areas, a haptic on a lift, a lost lift.

## Done when

- The engine table and the readers (as data) are the code's; the guards' closure matches its manifest, and every weakening change since the base was reported to Max before the merge.
- The core, pure, kit and host projects build with `tsc -b` and partition the bundle; every check of §Guards is green; every **Taken** finding of §What each finding meets that code can show has its reject fixture; the coverage and mutation scores are at or above their floors.
- The matrix is complete for every inventory row, place, form and payload, and every union member is in a scenario: at model level, and in the test Obsidian on the `--ui=next` production bundle at the release gate, projected logs equal across equal-variant cells, the trap and its ledger clean in every realm.
- P9's budgets hold, per gesture: the pointer path, a typing pick, the minute, a swipe, a mode switch.
- The traceability, rerun against the final revision, leaves no row over and maps every row to a concern of the one screen.
- The release gate passes, an independent QA on a copy of Max's real file finds no defect, and the phone checklist passes at the ★.
- The old UI is gone in the merge that switched, master never held both, and `docs/plugin/` says what the screen does (§Old bugs' doc changes included).
- The last structural review found nothing.

## How it is built

- `backend` makes the core part of each stage that needs one. One `frontend-obsidian` agent per stage or region after that. The lead checks every diff, test and screen.
- **Behaviour review:** after each stage or region, a fresh reviewer gets the diff, the principles and that part's traceability rows, and finds where the code breaks a principle.
- **Structural review (G9):** a second fresh reviewer, who wrote none of the code, gets the engine table, the whole tree, the stage's weakening changes and the checklist of rejected findings (G9). Its findings become reject fixtures before their fixes.
- **Weakening reaches Max as information:** before each merge into the branch's next stage and at stage 7, the lead tells Max in product words which protection was weakened and why ("a note may now change the zoom of the main screen"). Additions the machine checks are not reported. He is not asked how to write a test.
- After stages 3, 4 and 5, a fresh QA agent is told to break it.
- A finding is answered by naming the principle, the part of C1–C5 or the inventory row that let it through, and fixing that. A finding that only sabotage could produce is answered at tier 3 (§Guarantee), not with new machinery.

## Old bugs and contradictions, decided

From report C (§3, §2) and review R3. Each is decided by `docs/plugin/`; where the docs are silent, by what the screen does today (a rework keeps the current behaviour). The variant that carries each decision is named.

| # | What | Decided | Variant | Stage |
|---|---|---|---|---|
| 1 | A search in a note clears the **main screen's** filter (`CalendarScreen.ts:881`) | `screen.md:99`: a note has one project and no cross. A find the note's project hides opens full in the note; the device's filter is never written. This is the old bug's fix, and it is what a note shows instead | `search.reveal` `openFull` | 5 |
| 2 | A search in a note moves the main screen's funnel place | A note never writes it; on the main screen a find sets the place in every mode, as today | `context.writesPlace` | 5 |
| 3 | A note's day list can leave today with no way back | `screen.md:99`: no day navigation in a note. A find on another day opens full in the note. A field whose place the bar sets to another day **stays open where it is and writes there**, By project's rule (`tasks.md`: «поле остаётся на месте, а задача пишется в выбранный список»); the written card leaves the list as a card moved by its menu does | `search.dayOfFind` `openFull`; `entry.placeMoves` `stay` | 5 |
| 4 | A note starts the device's carry | A note's carry is its own; the device's carry is never written from it | `carry.device` `silent` | 5 |
| 5 | A note builds and hides a calendar | Nothing drawn, no need asked | `regions` | 5 |
| 6 | A stale comment: the block has no Undo capsule | Gone with the old code; the note's foot has Undo, ⋯, the view button and the plus | — | 7 |
| 7 | `screen.md:39` misses the top row of modes without column titles | The core's `topRow` stands; `screen.md:39` gains the case | — | 4 |
| 8 | `screen.md:99` omits ⋯ in the note's foot | `screen.md:99` gains it | — | 5 |
| 9 | The inventory marks the still layouts' divider desktop only | `screen.md:87` and the code: the phone too | — | 4 |
| 10 | `wide` is a platform, not a width | The rule stays; the UI calls it `form` | — | 3 |
| 11 | A note's first frame lacks the Subprojects row | `backend` reads the device's Subprojects in the note's first view | — | 5 |
| 12 | Double click on free room missing in By project | The kit's `List` owns it, so every list has it: a new task at the end of the section double-clicked, else of the last part; `tasks.md:19` says «списка» | — | 4 |
| 13 | Not seen: the phone's bar in a note; the note scrolling under a carry at the window's edge | Matrix cells; the bar rides the keyboard as on the main screen; edge scroll goes on in the note's scroller | `scroll.chain` | 5 |
| 14 | The full card and the desktop search confined to the note's frame | Kept, as today; the search's panel first scrolls the frame's top into view | — | 5 |
| 15 | The full card's project line: `tasks.md` (Задача на весь экран) says the tap opens the project's note in a new tab; the code closes the card and filters the main screen to the project | The code's behaviour stands: on the main screen the tap closes the card and selects the project in the filter; in a note it closes the card. `tasks.md`'s line is corrected to say so | `full.projectTap` `closeAndFilter` / `close` | 3 (doc), 5 |
| 16 | The settings tab's look | Obsidian's own `Setting` rows, as today | — | 6 |
| 17 | Blur and the entry | A blur ends the entry on both forms, as today (the window losing focus excepted); no variant | — | 3 |

## Questions for Max

None. Every place-shaped difference is answered by `docs/plugin/` or by the screen as it is today; the rest is how the code is built, which Max sees only as the screen staying the same in every place.

## Decisions

**Reviewed for revisions 11 to 14.** Every decision was read against C1–C5. A decision written "in the block", or allowing several stores, CSS motion, a flag per place, logic in a host or an engine, or an Obsidian `Menu`/`Modal`, is revoked or rewritten; each keeps its product behaviour (revision 11's three undeclared changes, to decisions 51, 52 and 54, are withdrawn), and a rewritten one says so in its first words.

| Decisions | Verdict | Why |
|---|---|---|
| 1–11, 13–18, 20–25, 27–30, 32 | Kept | The runtime: no place, no host, no mechanism of the UI |
| 12 | Rewritten | Polling starts with the first screen that draws a calendar |
| 19, 26 | Rewritten | `ScreenHost` draws first and opens the session; adapters reach nothing of the runtime |
| 31 | Rewritten | One store per screen, the one `Program` (H5) |
| 33 | Rewritten (14) | Four projects by reference and one checker over the bundle's metafile; its rules a table, each with its fixtures; no enumeration of kinds |
| 34 | Rewritten (14) | The CSS an allowlist; time and scroll only under the motion engine's classes; only paint properties under a state, which styles only its own element; positioning owned by the kit's layer, over and deco families; `@media` only `prefers-*` |
| 35 | Revoked | The line freeze with allowances: G8's content freeze |
| 36 | Rewritten | Hosts are the adapters in both forms |
| 37 | Rewritten (14) | The e2e build holds `UI` for the old-against-new comparison only; the matrix and the trap run on the `--ui=next` production bundle; every seam inert in `hostServices`, armed by the injected script |
| 38–42 | Kept | The fixture, the test Obsidian, the recorder, shots and budget |
| 43 | Revoked | A device flag for one place: one build constant; readiness kept |
| 44 | Rewritten | The inline frame's height, held only by the pin |
| 56 | Rewritten (14) | The same, and the bar's buttons painted by DOM order |
| 45 | Rewritten (13) | Acts are kit props; the gesture machine, held by the input engine, recognises |
| 46 | Rewritten | Static values by the render engine, time by motion |
| 48 | Rewritten (14) | Motion measures only named keys, first before the render and last after |
| 47, 49, 60 | Kept | Generic already |
| 50 | Rewritten (14) | No Obsidian `Menu`; the month grid the core's |
| 55 | Rewritten | The editors engine delegates; the mount engine adopts and places |
| 51 | Rewritten | The look from the entry's `Layout` part; **a blur ends the entry on both forms, as today** |
| 52 | Rewritten | **The project line keeps today's behaviour** (close and filter; in a note close); the help page corrected |
| 53 | Rewritten | The reveal's alternatives are closed variants; the note's are old bugs 1–3's fix |
| 54 | Rewritten (13) | One carry, **each payload keeping today's look and start** (a settings row follows the finger, the others step aside, no hold); the hit test the gesture concern's |
| 57 | Rewritten (14) | The matrix run on the `--ui=next` production bundle, projected logs compared across equal-variant cells |
| 58, 59 | Rewritten | The foot's fade a motion cause; both are carry payloads |

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
26. *(Revision 11: rewritten.)* **A screen reaches the runtime through its own session** (`Runtime.openHost()` → `HostSession`), opened by `ScreenHost` when it mounts: a carry belongs to the session whose call started it, and a session's teardown ends only its own carry and its own subscriptions. Unload ends any carry. `ScreenHost` imports only `obsidian/runtime/Runtime.ts` of the runtime, which re-exports what it uses (`Store`, `HostSession`, the types, `sectionRef`); the adapters import nothing of it (§Architecture); the old `obsidian/ui` imports nothing of it (`tests/architecture.test.ts`).
27. **A call runs as made, and only a stale answer runs again with fresh keys:** the door finds a task by its key's id wherever the replica's own writes moved it, so `tasks.freshArgs` is needed only when a line changed elsewhere; a replay always uses it. The replica's `fetched` is the sources the runtime was given feeds for.
28. **What depends on the replica starts when the replica is first built, whichever read builds it:** the first read at the start, or a later read after a change of the file when the first one failed. The minute's clock starts then and `ready()` resolves then.
29. **A replay pairs the ids a call gave kind by kind** (`DoorAnswer.createdKinds`): a task's with a task's, a section's with a section's, in order, and a kind only when the replay gave as many of it; an id is never mapped to a line of another kind.
30. **`persisted()`, `drained()` and unload wait for the reads the writer started itself** (after a change event or a write), not only for its writes.
31. *(Revision 11: rewritten.)* **One store per mounted screen,** made by `ScreenHost` through its session (`HostSession.store`), the one instantiation of `Program<Model, Msg>` (C1); the session's teardown disposes it, so no pass already scheduled renders into a gone screen. A screen never splits its model over several stores (report B, H5).
32. **One run per feed at a time:** an ask while a feed runs joins that run, as `CalendarPolling` did.

Made while building slice 2 (the guards, the freeze, the lifecycle test, the e2e harness), revised after its review:

33. *(Revision 14: rewritten.)* **One checker reads the code as the compiler does, and its scope is the bundle.** The compiler first: four composite projects (core, pure, kit, host) built with `tsc -b`, each consuming the one below as declarations (C1). `uiRules` covers what configuration cannot: it reads every input of esbuild's metafile outside `node_modules` (any folder, `.js` and `.d.ts` included) with TypeScript 7's own API (`typescript/unstable/sync`; `typescript` pinned exactly), resolving every name, member, shorthand, import and type to its declaration, so an alias, a string key, a destructuring, a wrapper or `Object.assign(el.style, …)` reaches the same declaration. Its rules are the rows of §Guards' rule table, **each one rule with its own reject and accept fixtures** and a message that names what to use instead; revision 13's list of "kinds allowed nowhere" is gone (a bare window or document is `reach`'s, a door to code named at run time is `reach`'s, a class read or written whole is `classes`' and `reach`'s). Its data (the engine table, the readers) is read from `tests/guards/`; any change to it is a weakening (C5).
34. *(Revision 14: rewritten.)* **The new CSS is an allowlist.** Below `/* next */`: `.task-calendar` is every rule's leftmost compound (no `body` or host-class ancestor but the theme's `theme-light`); no `@media` or `@container` outside the token block, and there only `prefers-*` conditions (the colour scheme, reduced motion): a width, a platform or a form is never a CSS condition (decision 10: `wide` is a platform, read in `layout.ts`); a selector names only the kit's `tc-n-…`, the motion engine's `tc-m-…`, an `is-…` state or the root; a state is an `is-…` class, an attribute selector, `:has()`, a pseudo-class of what the user does, or a `body` class Obsidian does not set; `:has()` never names a variant class; **a state, a variant or a user-action pseudo-class styles only its own element**: it stands in the rightmost compound, and no combinator follows it (so `:hover .preview` and `.is-blend .tc-n-card` are refused: a kit component puts the state on each element it paints); **under a state only paint properties are allowed** (an allowlist: colours, `background`, `border-color`, `outline`, `opacity`, `visibility`, `filter`, `box-shadow`, `cursor`, `text-decoration`), so neither a size nor a position (`transform`, `translate`, `inset`, `top`…) changes with a state, and no custom property set under a state is read by a property outside that list; no in-flow pseudo-element given content or a size. **Positioning has three owners, all the kit's:** `position: fixed`, `inset` and `z-index` only on the **layer** family (`tc-n-layer…`: menus, sheets, the float, the panel, the backdrop, the lifted copy, a popover); `position: absolute` with offsets and `z-index` only on the **over** family (`tc-n-over…`: the frame's own overlays, the foot's controls, its fade, the drop line); `position: absolute` with offsets but no `z-index` only on pseudo-elements and the **deco** family (`tc-n-deco…`: the progress dot, the branch lines), which takes no act and no children and sets `pointer-events: none`. Everything else is static or relative, so anything drawn over other content is a layer or the frame's own overlay, never a popover inside a list. Slice 3's classes are renamed into these families in 3c1. **Time and scroll belong to engines:** any property whose effect is time- or scroll-driven (transitions, animations, `@keyframes`, `@starting-style`, view transitions, scroll timelines, scroll snapping, `scroll-behavior`, `will-change`, longhands included) appears only under a `tc-m-…` class and never combined with a state or a user-action pseudo-class; durations and easings only as `--tc-motion-…` tokens. A variant class styles its own element only. The root states `overflow-anchor: none` and `scroll-snap-type: none`. Slice 3's foot fade on a state becomes the motion cause `fadeAside` (decision 58).
35. **Revoked by revision 11.** Decision 35's freeze (lines per directory, «shrinking passes», allowances with a commit and a reason) let the old UI grow beside the new (report B, H16). It is replaced by G8's content freeze: every old file by blob id, changed only to master's version with its port recorded, the list only shrinking. The two lines that route the old screen's task links through `outside()` (decision 37) are already in the baseline taken in stage 3.
36. *(Revision 11: rewritten.)* **The lifecycle test's hosts** are the adapters, registered in `HOSTS` (`tests/hostLifecycle.test.ts`) as `mount(context, form) → { startGesture, unmount }`, by their path under `next/host/adapters/`; an adapter not registered fails, and each runs in both forms. `tests/helpers/LeakCounter.ts` counts as revision 10 said (listeners on every target of the window's world, `on…` handler properties, observers, timeouts and intervals, frames, idle callbacks, immediates, microtasks not yet run, running animations, scopes, Obsidian event references, subscriptions), after queued microtasks have run.
37. *(Revision 14: rewritten.)* **The e2e build** is `obsidian/e2e.ts`, built by the harness into `E2E_HOME/build/main.js` (`node esbuild.config.mjs production e2e --outfile=…`; `npm run build:e2e` into `.e2e/build/`) with the first line `// task-calendar <version> e2e`; the root `main.js` is never touched (`--outfile` without `e2e` is refused). It is the only build that holds both UIs (`UI`, G8), and it serves only the old-against-new comparison until stage 7. **The matrix, the trap and the budget run on the production recipe:** `npm run build -- --ui=next` builds the bundle with the release's esbuild options and `UI` defined `next` into `.e2e/next/main.js` (first line `// task-calendar <version> next`); only `npm run release` refuses `next` before stage 7. The trap with its effect ledger is injected over CDP (`Page.addScriptToEvaluateOnNewDocument`) in every window realm before the plugin loads, popouts included through `Target.setAutoAttach` with `waitForDebuggerOnStart`, and coverage comes from CDP's profiler. After copying it into the scratch vault the harness checks the copy is this run's build: its first line exactly that of `manifest.json`'s version, written after this run's build started and after the last commit. **Every seam lives in `obsidian/hostServices.ts` and ships inert in every bundle:** the clock, the `Http` (default `obsidianHttp`), `outside()` (`open`, `browse`, `runScript`) and `window.open`/`location.assign`. Only the injected script arms them (the frozen clock, the fixture network, recording instead of opening), and the harness refuses to start a run whose seams did not report armed, so nothing opens on Max's Mac.
38. **The fixture** is taken once into `.e2e/fixture/` (gitignored with all of `.e2e/`: it holds Max's tasks, never committed) and kept, so baselines stay comparable; `--refresh-fixture` takes it again, and the baselines are recorded again after it (`--update`). The clock stands at 14:20 of the day it was taken. Google's secrets are replaced (`e2e`), the project notes come as stubs holding only the project tag, and the calendars (Google through the fixture network, the phone's and the work files at the paths the settings name) are made up for that day. Every path the fixture names (the tasks file, a note, a calendar) must stay inside its vault: an absolute one or one climbing out (`..`) is refused, when the fixture is read from Max's vault and when the scratch vault is written.
39. **The test Obsidian of the harness** keeps its profile and vault under `E2E_WORK` (default `.e2e/work`); the harness refuses an `E2E_WORK` or `E2E_HOME` inside `~/Obsidian` or inside the repository outside `.e2e/`, comparing paths as the disk does: the nearest part that exists resolved by `realpath` (links, and on macOS the case the disk holds), the rest appended, then compared without regard to case (so `~/obsidian/e2e` is Max's vault). The vault is written over in place each run (a copy of Max's tasks is never moved to the Bin). A port from 9345 free by `ps` and `lsof`; if another session takes it between the check and the launch, the instance just launched (it has no port of its own then) is ended by its own process id and the launch tried on the next port. A launch in the background (`open -n -g`) with Chromium's switches against an occluded window's throttling, and focus emulation; with those, CDP's own input reaches a window behind others, so every touch, click, wheel and the closing of Obsidian's first dialogs go through `Input.dispatch*`, never a click made in the page. Each platform and theme starts clean: the fixture's tasks file written again, the plugin's device storage cleared, the page reloaded into the platform.
40. **The recorder** keys a row by the key the view gives it (`data-row`, the model's row key; on the old screen `data-card`, its task's id), or by its whole title where it has neither, with a count among rows of the same base; each element keeps the key it was first given, so rows of one title never swap numbers as they move, and a key passes to another element only once its own left the DOM, so a remounted row keeps it. A carried card is named by its key (`__e2e.keyAt`), never by a cut title. Each row is judged from the frame it first shows in; a row's box takes in its margin below (a folded parent's fold); the place is the leftmost column showing plus the day after today, with its distance from the stage's edge (the view's left or a docked panel's right). The rules, each proven on a frame log made to reproduce a past bug (`tests/e2e/frames.test.ts`): a step that never settles; a row gone for some frames and back (a remount's flash); in a context step, any row animated or between its two places (cards flying in on a project switch); a row the step does not move that moves, and any row that leaves its place and comes back (a jump under a lift); in a swipe, each column moving as one (columns may change their widths, RibbonColumns), one way, never more than 120 px between two frames (the All columns jerk); overshoot; a rest off; a swipe resting off its column's edge or two places away; gaps or overlaps; a gesture that moved nothing. A step waits a person's pause (500 ms) before acting; the mouse lifts a card by moving it (holding opens its menu), the finger by holding; a swipe starts clear of the divider; the trackpad's wheel goes at a delta every 8 ms. The smoke set adds All columns tried sideways (nothing may move), a project chosen and all again, and a card lifted and held.
41. **Shots** are clipped to the view (Obsidian's chrome is never compared) and compared at 5 of 255 per channel on at most 0.2 % of the pixels (the timeline 6 on 0.3 %), and no more differing pixels may lie together (8 ways) than 4 CSS pixels' worth at the shot's ratio (36 at 3×): a short label one pixel off on the phone view is a tiny share of the shot but a block of touching pixels along its strokes, while the GPU's rounding scatters single ones. A missing baseline fails unless `--update`. Masks are listed by selector and kept with the baseline.
42. **The budget** comes from a CDP trace of each gesture and a fixed tail of 1.2 s (longer than any transition); the recorder starts before the trace and the wait for rest runs after it, so the harness's polling is never traced. Every harness evaluation marks its run in the page (`console.timeStamp`, `HARNESS` in `frames.ts`), and its script, with the frame sampler's own function, is cut out. From the rest: the page's main thread, its frames (each `FireAnimationFrame`), the script run in each frame (the union of the script events, nested ones once), and every task over 16 ms (the 17–49 ms ones the page's `PerformanceObserver` never tells). It fails a trace with no frame or no script of the page (nothing passes on an empty recording), a frame with 8 ms of script or more and any task over 16 ms, and reports the average over the frames that ran script and the longest frame.

Made while building slice 3 (the note block behind `newBlock`; reviewed above):

43. **Revoked by revision 11.** `newBlock` as a device value (`task-calendar:new-screens`) was a flag per place (report B, U2, H18). G8 replaces it with one build constant for every place; no device or synced value chooses a UI. What it carried that is not a flag stays: the runtime's readiness is told when `VaultProjects.ready()` resolves (a plugin loaded into an indexed vault hears no `resolved`), and `core/settings.ts` is not touched. The runtime is composed with its feeds always; a place without a calendar asks for no events (decision 12).
44. *(Revision 11: rewritten.)* **An inline frame's height is the stylesheet's:** with `Layout.variants.frame` `inline` (a note), the kit's `Frame` is a column as tall as its stack up to `--tc-block-max-h`, past which the stack scrolls; nothing is measured for it. During a carry the region holds its height as it stood, by the pin under the lift (P6), a motion cause like any other, never a frame-specific hold. The old block was at times 1 px short of its rows (its stack scrolled by a pixel); the new one is not, and the e2e comparison crops that pixel (`fit`).
45. *(Revision 13: rewritten.)* **Views take no event handlers.** A kit element that can be pressed carries an `act` prop (with its key and value); the render engine writes it as data attributes; the input engine delegates by them, makes units of the event's numbers and advances the gesture machine (`update/gesture/machine.ts`, grown from `press.ts`), whose state it holds; only the machine's semantic outputs (a press on an act, a lift, a target change, a drop) become messages, and `update` turns an act into its message. The kit's type view has no `on…` attribute at all.
46. *(Revision 12: rewritten.)* **Inline styles and CSS variables come from the model, split by time.** Values at rest (a row's level and branch offsets, a folded card's room, the select circle's room, the regions' widths) are computed by the core's rules through the layout concern and written by the render engine, only when they differ. Values that change over time (a transition, the transient channel) are the motion engine's. A variant that sizes a box is a kit element of its own kind with literal classes (a two-line card is as tall as its lines; a branch's end, the fold counter, a meta pair, a repeat-only corner, each panel and row kind), and a class that comes and goes is an `is-…` state that sizes nothing (decision 34).
47. **A card's marks** are the core's `TaskItem.marks`: the dot of a task in progress (`progressDot`, the card's `is-progress`), the description's mark (`description`) and the subtask counter (`count`); the card reads no status or `can` field for them. Its `data-status` paints only the full card's subtasks (done ticked, given up struck through).
48. *(Revision 14: rewritten.)* **Motion within one context** is a FLIP over keyed rows, the motion cause `rows`, which names the keys it may move: the loop measures those boxes only, once before the render (first) and once after it (last), and the motion engine slides what moved from first to last and fades in what is new, through its one `animate` over the cause's `AnimationSpec`; another context (mode, project, the first read) draws in place. A row that leaves fades where it stood and then its room folds, as the old `Motion.leave`: the engine keeps its node over the frame, fades it, and the rows under it slide up after the fade while the region holds its height (the e2e step «a card done leaves its list» judges it frame by frame, in every place).
49. **Layers** mount in the overlay host's node, under their own `.task-calendar` root; `motion` places them from measured anchors (`data-n-anchor`) and fades them in and out; the close's end is `layerGone`, which unpins the lists. A write pick runs its door call at the tap and the lists change once the sheet has gone (R10).
50. *(Revision 14: rewritten.)* **The task menu** is a kit layer in the one layer stack (no Obsidian `Menu`). It reads the core's `tasks.menu`/`tasks.bulkMenu` as a view need while open; its copy of the card is measured once per menu (`wholeWidth`, `grownStart`); the panel is placed from measurement, under, over or split (`groupsAbove`), and a page change re-places only the panel; a closing menu keeps what it drew; the repeat page writes once at the close (`repeatPage.end`); the month grid is the core's `rules.monthGrid` (added in 3a; the iPhone draws a month too), never date math in the UI. Typing picks (Rename, Add subtask, New section, New project) focus their field inside the tap, once it is visible. As the old menu: it opens once its card is in view, the card's scroller gliding it in first in the collapse time (the scroll intent `intoView` over the scroll concern's chain: a list, a note's stack and then the note itself; a finger on it calls the menu off); on the desktop a second click within 250 ms of the one that opened it renames (the gesture `secondPress`, the old double click); the start of the task's description stands by the copy of its card, over or under it where the panel is not, rendered by Obsidian through the editors engine (the old `DescriptionPeek`): a tap on it opens the full card, a note's link opens the note.
51. *(Revision 12: rewritten.)* **The quick entry** runs the core's `entry.*` steps over a session kept in the model, and its jobs in the core's order (`entryJobStep`, `queuedEntryJobs`) in the entry concern (`runEntryJobs`, after every message). The look (`entryLook`) and the cards about to be drawn for a step that asks for them (`coming`) are computed there from the entry's `Layout` part, never handed in by a host. The field is Obsidian's editor (the editors engine) restyled by a CodeMirror theme from tokens; on Enter the written card takes the field's box and the next field gets a new row key. While typing, the foot fade is a second element (sizing by state is forbidden); on the phone the room at a list's end is a spacer row. The bar is the kit's with the variant `entry.bar` (`keyboardBar` on the phone, `capsule` on the desktop). **A blur ends the entry on both forms, as today** (the window losing focus excepted); revision 11's phone-only gate is withdrawn.
52. *(Revision 12: rewritten.)* **The full card** is a layer inside the screen's frame, in every place, pinned by id and following Sync through the needs `tasks.find`/`tasks.fullTree`; the description runs in Obsidian's editor through the core's `description.*`; its subtasks' circles are drawn as the old full card's (width 0, the card's padding kept); its rows are keyed `full/<id>`. **A tap on its project line keeps today's behaviour:** on the main screen it closes the card and selects the project in the filter (`tasks.selectProjectNode`); in a note it closes the card and writes nothing (the variant `full.projectTap`: `closeAndFilter`, `close`). `tasks.md`'s line that says the tap opens the project's note is corrected (§Old bugs 15). Its task and subtasks are read by the screen's filter (`tasks.find(key, text, filter)`, `tasks.fullTree(item, filter)`): fixed to a project, they show no folder mark, as the core decides.
53. *(Revision 12: rewritten.)* **The search reveals a pick** through `tasks.reveal`, one reveal for every place; each alternative is a closed variant of the search's `Layout` part (C4). `reveal`: `clearFilter` (the main screen: a filter that hides the task is cleared, `screen.md:114`) or `openFull` (a note: the task opens full in the note; the device's filter is never written). `dayOfFind`: `moveDay` (the day list goes to the task's day) or `openFull` (a note). The funnel place moves to the task's (Done, Inbox for Backlog, Soon, the calendar) where `context.writesPlace` is `write`. A Done task without the ribbon opens full; any other is ringed and scrolled into view (the scroll intent `reveal`). The note's choices are the fix of old bugs 1–3.
54. *(Revision 13: rewritten.)* **The carry is one, for every payload and place:** a card, its subtasks, the picked cards, the plus, a section, a tree node, a settings row, a timeline slot, with one slice, one set of messages, the gesture concern's one hit test and the core's drop rules. **Each payload keeps today's look and start, as a closed variant:** a card, the picked cards, the plus and a timeline slot lift on a finger's hold or a mouse's move, fly as a float and leave a dashed waiting place, and no other card moves; a section floats and waits where it stood, its landing a drop line (decision 59); a tree node's row follows the finger with a line where it will land (`screen.md:52`); a settings row follows the finger itself, starting on a press of its grip with no hold, while the rows it passes step aside (`stepAside`, `settings.md:9`). The geometry is measured once after the lift renders, per scroller and target, and kept fresh by `measured` while edge scroll moves a scroller; the target is the hit test's list or row and the core's place in it, recomputed by the gesture machine on each move and told only when it changes; the device's carry is reported (`startCarry`, `carryAt` on a target change, with the place's `PlaceWrite`) only where `carry.device` is `report` (the main screen); the carried cards' subtasks leave the pinned snapshot; on a drop the pin goes at once and the float flies onto the landed card, on a cancel the pin stays until the float is back. A long mouse click does nothing, a right click opens the menu.
55. *(Revision 12: rewritten.)* **The editors and the mount**: the editors engine holds the title field, the full card's editors and the description peek, with CodeMirror configured to delegate its keys, focus and scroll; the mount engine makes, places and removes the screen's own node in its host (a leaf's content; after `.cm-contentContainer` or first in `.mod-footer` of a note), the overlay node per window and the adopted rows of a settings list, and writes Obsidian's nodes around the screen (`--tc-block-lift`, `.cm-content`'s growth). Adapters and `ScreenHost` write no DOM.
56. *(Revision 14: rewritten.)* **A field opened in an inline frame grows it** as any row does, to the CSS's tallest (`--tc-block-max-h`), past which its stack scrolls: the old `BlockHeight` fitted the block to what its stack held, the field among it. Only the pin under a carry holds the region's height. Measured in the test Obsidian (a real click on the plus, the desktop): with Today holding a task the old block grew 571→632 px as the new does; on the e2e fixture, Today empty, the old one stayed 572 px while its stack held 606 px in 558 (`BlockHeight` missed the field row's late height, a race of the old block: its field's bar stood 48 px under the frame's foot, scrolled out), and the new one grows to 620 px. On the phone both grow by 60 px. The new screen keeps the old rule, not its race. The e2e shot of a field open in a note compares the frame top-aligned (`fit` cut at the bottom): the old block's shot stops at the window's foot. The bar's buttons each paint over the one before by their order in the DOM (no `z-index` inside the bar: decision 34), as the old bar's: a shrunk shift is covered by the flag. Old defects the e2e run shows and the new screen does not repeat: the written card flashing between field and card (19–21 frames), and the old block sometimes cutting the written card's bottom (4 px) after typing.
57. *(Revision 14: rewritten.)* **The e2e matrix run** (`npm run e2e -- matrix [place form theme]`, G5) runs every cell of the registry on the `--ui=next` production bundle, each platform and theme starting clean, every step judged frame by frame by the same rules in every place, with the trap injected; one concern's logs, projected onto the key roles of `tests/matrix/roles.ts`, are compared across the cells whose variant values are equal. The old-against-new comparison stays an input to it: the e2e build records the old UI's baselines (`UI` `old`) and compares the new one with them in the same run on the same copy of the file. A caret's blink (CodeMirror's `cm-blink`) is no motion of the screen's: the recorder and the rest wait leave it out. `npm run e2e -- budget [place]` is the budget: 300 tasks, 4× CPU, in each place.
58. *(Revision 11: rewritten.)* **The plus carried** (the old screen's `beginNew`) is a carry payload: pressed and moved, the plus lifts as a float over the same places as a card, a dashed ring standing in its place (solid and filled while the finger is over it); let go on a place, the field of a new task opens there in the same tap through the core's `entry.openAtDrop` (`openAt` in the projects list, `openAtEnd` at a list's end) and the float lands in the field; let go on its ring or nowhere, it flies home. While a card or the plus is carried the plus and the capsule beside it fade aside: the motion cause `fadeAside`, run by `motion` (no CSS transition, decision 34; the old `QuickEntryController`'s look kept); a lifted section leaves them. The region's height is held from the lift's own drawing, by the pin, so a lift that takes rows out of the lists (a section, a parent's subtasks) never shrinks it.
59. *(Revision 11: rewritten.)* **A section lifted by its header** (the old `GroupDrag`) is a carry payload and waits where it stood, as a carried card does: its header's name and plate's words hidden, their places kept; its landing is the drop line over the slot (`groupPlaceOf`, in carry geometry), and nothing under it moves while it is carried. The old list closed over the lifted section and every row under it left and came back; that is not repeated. Let go on another slot it moves there (`tasks.moveGroup`) and the float folds onto its header. A header tapped opens its menu (Rename, Remove section as the core offers them); the name typed in place ends through the core's `sectionName.end` for Enter, Escape and a tap away alike.
60. **A finger's press the recognizer reads ends with no click after it** (`input` cancels its `touchend`): the browser's click would land on what the tap's outcome put under the finger (the plus hid and the field's room took its place, and the click took the field's focus). The e2e block shots mask Obsidian's status bar and the phone's navigation bar (`.status-bar`, `.mobile-navbar`) where they stand over the block (decision 41). A drawing that moves no rows leaves the motions under way running (a carry's next message must not stop the rows still sliding) and reports no card leaving.
