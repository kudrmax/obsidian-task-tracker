# Plugin UI refactor: one screen, one mechanism per concern, on the core's door

Issue: kudrmax/obsidian-task-tracker#41 (takes in #40). Branch `ui-refactor`. Revision 12.

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
| 12 | 0 | — : the guarantee is the compiler's (§The one mechanism) |

The faults of revisions 5 and 6 had one cause. The spec treated the core as an asynchronous service the UI waits on, and built machinery around the waiting: read-back, previews, transactions, read-ahead, echoes. The core already has a **synchronous, pure door**, `callDoor(method, args, context) → answer` (`core/application/PhoneCalls.ts`). The iPhone app runs on it, and it covers every `TaskService`, `DayService`, undo, settings and calendar method (a typed coverage map, `PhoneCalls.ts:1077`). On Max's real tasks file (31 KB) a whole funnel view costs about 3 ms through it, JSON included (measured locally). Revision 7 puts the plugin on the same door, and the waiting is gone.

Revision 11 adds four research reports, kept beside the inventories in [`ui-refactor/rev11-research/`](ui-refactor/rev11-research/): **A** an audit of the code built in slices 1–3 (what is generic, place-shaped or host-only); **B** a red team of the three failed "one mechanism" specs, with twenty holes (H1–H20) that pass every guard of revision 10; **C** the map of one screen in every place and form, with the old bugs where a note's block shares the device's state; **D** how production teams make "exists once" hold.

## Why revision 11

Max stopped the work after slice 3. Slice 3 built the new UI around the note's block: a `BlockModel` typed on a note, `BlockLists` as the only shape of what a screen shows, a carry measured in one stack's pixels, and a `BlockHost` that orders the frame, interprets every command, recognises gestures and hit-tests the pointer (report A, §2). The main screen would have needed a second model, a second update, a second host and second driver methods. This is the fourth "one mechanism" that would have become two; the motion spec of 2026-11-08 and the drag spec of 2026-11-09 failed the same way (report B).

**The common cause** (report B, §4): each spec stated "one mechanism" as a principle and then sliced, owned and checked the work **by place**. Each slice was asked to finish a whole place, so it built a whole mechanism for that place. No artifact named the single code owner of each concern for every place to use, and every check that existed tested behaviour or layering, which two correct copies both pass.

So the guarantee moves from the principles into the code's construction:

- **The screen is one:** one root, one model type, one message union, one router, one host; the UI code cannot name the host at all (C1).
- **Each concern that touches the platform has one engine,** in a frozen table; only that engine is compiled with the host types it needs (C2).
- **Rules live in the core, numbers are units** the UI cannot compute with (C3), and **the place is opaque** outside the one function that derives its layout (C4).
- **Use is mandatory:** every concern in every place, form and payload, in unit tests and in the test Obsidian (G5); a runtime trap and its effect ledger catch what the compiler cannot type, and the guards sit outside the code's reach (C5); **old and new never coexist on master** (G8); **each stage gets a structural review** whose findings become checks (G9).

**Revision 12.** Three independent reviews of revision 11 (`rev11-research/R1-redteam-rev11.md`, `R2-architect-rev11.md`, `R3-behaviour-rev11.md`) showed that the guarantee did not hold: a red team found twenty changes that pass every check, because revision 11 listed what is forbidden (APIs per owner, place names, CSS properties, private folders, the shape of a condition), and a list always leaks. Revision 12 keeps the decided product and turns the guarantee around: the UI code **cannot express** an effect, a rule of the core or a read of the place, so nothing has to be forbidden one by one (§The one mechanism, C1–C5). It adds P9 (render cost scales with what changed), keeps the settings tab on Obsidian's own chrome with only its row reorder on the one carry, and withdraws three product changes revision 11 had made without saying so.

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
- **One model type for every place:** `Model`, with the place it is shown in as data (`model.place`, an opaque token, C4). Each mounted screen is one store of that type; no place has a model, a message union or an update of its own.
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
  3. **What the screen needs.** The screen has one pure selector, `needs(model)`. It lists the view answers the screen needs: its root view (the funnel, a note's view or the settings, which `layoutOf` gives as data, C4), the neighbour day or place under a swipe, the task of an open full card or menu, the search's results. The runtime computes one answer per need from the replica, memoised by (replica, minute, need), and hands them to the model as data (`viewsChanged`).
     - Any change of the replica recomputes every mounted need in the same loop, so an open card follows Sync at once.
     - Selectors never call the door. Here "the core" means `callDoor`, the replica and the view answers.
     - The core's **pure rules** (`rules.*`: `snap`, `swipeLanding`, `layoutWidths`, `stackedLists`, `layoutShareAt`…) are plain functions. They are reached through one gateway, `screen/rules.ts` (C3), since they are needed per frame and per pointer move.
  4. `ScreenHost` draws, in one order for every place: render, measure, motion, scroll, focus last (§Architecture).

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
- **The motion engine reports** `motionSettled(id)` or `motionInterrupted(id, at)`.
- **Continuous gestures** go through a transient channel. The input engine passes the live value, as units, to the motion engine, which applies it to the layout the same selectors computed (the core's rules through the gateway). Crossing a step that changes what is drawn dispatches.

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
- **Every derived structure is memoised on its inputs:** `layoutOf`, the lists, a card's face. The render engine writes a custom property only when its value differs.
- **Motion measures only what its cause names.** A motion cause carries the keys it may move; the measure engine reads only those boxes.
- **Budget tests** (`tests/budget/`): one write on a 300-task file at 4× CPU re-renders at most the cards whose line changed or whose place moved (counted by the render counter), and a carry step re-renders none but the float and the target's indicator; P3's per-call budgets stand.

## The one mechanism

P1–P9 say what the screen is. C1–C5 say why it can be built only **once**.

Revision 11 listed what is forbidden: APIs per owner, names, CSS properties, private folders, shapes of a condition. Three reviews (`rev11-research/R1–R3`) showed that such a list always leaks. A name ban misses `"tasks.setNoteViewMode"` written as a string; a gate rule misses `?? openFull`; a folder rule invites `drivers/motion/ribbonFlip.ts` back. Revision 12 works the other way, as Elm, Google's safe types and the design systems of report D do: **the UI code cannot express an effect, a decision of the core or a read of the place at all**, so there is nothing to forbid one by one. The compiler is the guard; the few rules left guard the compiler's configuration and the edges the compiler cannot type.

Each part below says how it is enforced: by **construction** (the second thing does not compile), by the **matrix** (the thing must be used everywhere it applies, or the build fails), or by the **trap** (an effect the plugin did not order fails the end-to-end run). None rests on a reviewer or on a promise.

**C1. The UI is pure by construction.**
- **One screen.** The whole UI is one root, `Screen` (`view/Screen.tsx`), of one model type, `Model`, changed by one message union, `Msg`, through one `update`. The main screen, a note's block and a settings list are that screen with a different `Place` (C4).
- **Pure code cannot name the host.** `screen/`, `model/`, `update/` and `view/Screen.tsx` are one TypeScript project (`tsconfig.next-pure.json`, extended to the views) with `lib: ["es2024"]`, `types: []` and no DOM, Obsidian, Preact or CodeMirror types. A window, an element, an event, `Scope`, `Menu`, a hook or a timer cannot be named there: it does not compile.
- **The screen's JSX knows only the kit.** The pure project's `jsxImportSource` is the plugin's own (`view/screen-jsx`), whose `JSX.IntrinsicElements` holds only the kit's elements (`<tc-list>`, `<tc-card>`, `<tc-field>`…) with closed props. A raw `<div>`, `autofocus`, `<dialog>`, `draggable`, `<form>`, SVG `<animate>` or an `onClick` does not compile. No hooks exist to import.
- **The kit draws, and only draws.** `view/kit/` is a project of its own with a second JSX dialect (`view/kit-jsx`): an allowlist of DOM elements and attributes (no `style`, `autofocus`, `popover`, `draggable`, `contenteditable`, `tabindex`, `<form>`, `<dialog>`, `<details>`, SVG animation), classes typed as `tc-n-…` or `is-…` literals, and no `preact/hooks` in its paths. A kit component is a function from its props to elements.
- **Intents are typed data on kit elements.** A kit element that can move, take focus, scroll or be measured carries a required prop for it: `motion`, `focus`, `scroll`, `measure` (a key, or `"none"`). Absence does not compile. The render engine turns them into data attributes the engines read.
- **Everything that crosses is closed data.** `Model`, `Msg`, `Command`, the kit's props and `Layout` hold no function, `any`, `unknown`, index signature or bare `number`, and every discriminant is a string literal. A type test (`tests/types/closed.ts`, `AssertClosed<T>`) fails to compile otherwise. `Model` is deep-readonly.
- **No module state.** In the pure project and the kit, a module's top level holds only declarations: functions, types and `as const` data.
- **Messages route once.** `Msg` is the union of each concern's own union. `ROUTES: { [K in Msg["kind"]]: Concern }` is total, and a kind in two unions does not compile (`Disjoint`). A concern's handler returns only its own slice of `Model`, its commands and its follow-up messages. **Runtime events** (`viewsChanged`, `rebased`, `fileGone`, `minute`, `shown`, `hidden`, `chrome`) are a closed class of broadcasts, delivered to every concern, each returning only its own slice (P3's re-id map reaches every slice in one pass).
- **The router and the root do nothing else.** `update.ts` is `ROUTES[msg.kind]` plus the broadcast loop; `Screen.tsx` maps `Layout.regions` to kit elements. Both are generated from the concern list (`npm run gen:screen`), and the test fails if the checked-in file differs from what the generator writes.

**C2. Engines: a closed, frozen set.**
- **One engine per concern that touches the platform, one file each, no private folders** (§The engine table). An engine is the only module compiled with the host types its row names: each is its own TypeScript project, its `types` and `paths` limited to its row (only `editors` sees CodeMirror; only `render` sees Preact; only `chrome`, `keys`, `mount` and `editors` see Obsidian's module), and `uiRules` (decision 33) limits its DOM members to its row.
- **An engine is a function of data.** It takes declarative data only: kit props (through the render engine's attributes) and commands. It keeps no gesture state; what a gesture is in the middle of is model state, through messages. Its only fields are `readonly` maps of the host handles it made, keyed by model keys. Each event it hears becomes exactly one message carrying unit-branded raw data (C3); it compares nothing.
- **One call site per effect API.** `animate`, `scrollTo`, `focus`, `requestAnimationFrame`, `setTimeout`, `new ResizeObserver`, `getBoundingClientRect`, `new Scope`… each has exactly one call site in the bundle, inside its engine, fed by a closed spec (`AnimationSpec`: a keyframe kind, a duration token, an easing token; `ScrollSpec` with `behavior: "instant"`). A second FLIP needs a second call site or a new spec kind, and the spec kinds are the engine's frozen variants.
- **Listeners are owned by event type:** `pointer*`, `touch*`, `wheel`, `click`, `dblclick`, `contextmenu`, `dragover`, `drop` by `input`; `key*` by `keys`; `scroll` by `measure`; `focus*`/`blur` by `focus`; `animation*`/`transition*` by `motion`; `visibilitychange`, window `focus`, `css-change` and the phone keyboard's events by `chrome`.
- **Libraries come in through one engine, configured to delegate.** CodeMirror lives only in `editors`, with no default keymap (its keys emit intents to the key table), `EditorView.scrollHandler` and focus requests turned into scroll and focus intents, and its own measuring confined to its own subtree. `MarkdownRenderer` lives only in `editors`. Obsidian's `Menu` and `Modal` are **not used**: every menu and sheet is a kit layer in the one layer stack. Obsidian's `Setting` lives only in the settings adapter (the settings tab in §The one mechanism).
- **The frozen table freezes concerns and engines, not file names.** `tests/guards/engines.ts` lists each concern, its engine file, the host types and packages it is compiled with and the effect APIs it may call. It is protected as CLAUDE.md protects «Behaviours Max had to ask for twice»: a test that names Max (`tests/engines.test.ts`) pins it through the manifest (C5), and it is never changed or routed around without him. Pure code is organised by concern (`update/<concern>/`, any files), which Max never has to approve.

**C3. Rules live in the core; numbers are units.**
- **Every rule that decides** a place, a landing, a drop, a width, a share, a snap, a slop, a flick, an edge speed or a zoom **is a core function**: a door call, or one of the core's pure rules (`rules.*`) for what runs per frame and per pointer move. The UI never computes one. Rules the UI still computes today (the press slop, the edge-scroll speed, the hit test of a point against measured lists and the tree) move to the core, added by `backend` in stage 3.
- **The core's pure rules are reached only through one gateway**, `screen/rules.ts`: each export is one call of one core rule, its arguments unwrapped from units and its result wrapped (a generated file, checked like `Screen.tsx`).
- **Numbers are units.** Every quantity in `Model`, `Msg`, `Command`, `Layout` and kit props is an opaque unit (`Px`, `Ms`, `Minutes`, `Ratio`, `Count`), declared in `screen/units.ts` as a phantom object type. TypeScript refuses `+`, `-`, `<` and `Math.*` on an object type, so a unit cannot be computed with or compared at all, except through the module's few operations:
  - `delta(a, b)`, `offset(p, d)`, `speed(d, t)`, `ratio(a, b)`, `scale(d, r)`;
  - `exceeds(v, limit)`, where a `Limit` is made only by the gateway from a core constant (the slop, `SWIPE_FLICK_SPEED`, `DIVIDER_SNAP`).
  Units are made only by the measure and input engines (from `DOMRect`, `clientX`, `timeStamp`) and unwrapped only by the engines and the gateway (`screen/units.ts` exports `raw` to those importers only, the import graph's one rule for it). So the recognizer's slop, the edge speed and the pinch ratio are unit operations, and a second drop rule, width rule or swipe landing has no numbers to be written with.

**C4. The place is opaque.**
- `Place` is an opaque token. Its record and its constructors (`Places.main()`, `Places.note(path)`, `Places.rows(list)`) and `layoutOf` live in one file, `screen/layout.ts`, which exports the token type but not its record: nothing else can read a field of it, by type.
- **Every input that correlates with the place or the form has exactly one reader, by type:** the chrome slice (`form`, the keyboard, the toolbar) and the root answer's place facts (`filter.clearable`, `panel`, `topRow`, `plus`, `ViewChoice.*`) are opaque tokens opened only by `layoutOf`; the pointer kind of an input message is opened only by the gesture concern. Owners see the root answer without its place facts.
- **`Layout` is split by concern, and the router hands each concern only its part:** `handle(model, msg, layoutOf(model.place, …)[concern])`. The model holds no `Layout`. A concern cannot see another concern's part, and the `Screen` sees only `regions`.
- **Real alternatives are closed variants with one consumer each**, never booleans to branch on in many places: `search.reveal: "clearFilter" | "openFull"`, `search.dayOfFind: "moveDay" | "openFull"`, `context.writesPlace: "write" | "keep"`, `carry.device: "report" | "silent"`, `full.projectTap: "closeAndFilter" | "close"`, `entry.bar: "keyboardBar" | "capsule"`, `entry.placeMoves: "follow" | "stay"`, `scroll.chain: Scroller[]`, `keys.policy: "tab" | "focus" | "none"`. A variant changes only its own concern's behaviour.
- **The matrix's comparator follows the variants.** Across places, forms and payloads, one concern's logs must be equal after removing exactly the differences its declared variants predict for that cell (each variant value lists the commands and motion causes it adds or removes, in the registry). A difference no variant declares fails (G5 of revision 11, made consistent).

**C5. The guards are outside the code's reach.**
- **A manifest of hashes** (`guards.manifest.json`) covers every guard file, the engine table, the matrix registry, the trap, every `tsconfig*.json`, the JSX dialects, `vitest*.config*`, `esbuild.config.mjs`, `stryker.config.mjs`, `.jscpd.json`, `package.json`'s scripts and the mutation floor. `npm test` and `npm run release` stop when any of them differs from the manifest. The manifest is re-pinned only by `npm run guards:pin`, which refuses a commit without a `Guards-approved-by: Max` trailer quoting his message, and `tests/engines.test.ts`, which names Max, checks the manifest's own hash. No guard changes silently.
- **No escape hatches** (`uiRules`, in every scanned file): no `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `jscpd:ignore`, `eslint-disable`, `Stryker disable`; no `.skip`, `.only` or `.todo` in tests; no `as` cast except `as const` (and inside `screen/units.ts`); no ambient `declare global`/`declare module` outside the dialect files.
- **The scope is the bundle.** The guard reads esbuild's metafile: every input that is not in `node_modules` is scanned, whatever its folder or extension (`.js` and `.d.ts` included). Outside `obsidian/` that is `core/`, under its own architecture rules.
- **The trap sees every window and every frame.** It is installed in each window realm before a screen mounts there, and counts every frame outside `node_modules` as ours; a library's frame counts as the engine that admitted the library.
- **Mutation testing** runs over the guard code; its score may only rise (a floor in the manifest), from stage 3's first score to 100 % by stage 7.

**The settings tab.** It keeps Obsidian's own chrome and look (the design excepts Obsidian's chrome, and a rework keeps today's behaviour): `host/settings.ts` builds it from Obsidian's `Setting`, its toggles, dropdowns, sliders, colour wells and buttons, registers no key scope, and reaches the clipboard, Google's sign-in and the Scriptable loader through `hostServices`. Only its three reorderable lists (priorities, labels, presets) move rows, and they move them with **the one carry and the one motion engine**: each list mounts one `ScreenHost` at `Places.rows(list)`. That place's `Layout` has one region, `adopted`: the mount engine **adopts** the rows Obsidian's `Setting` drew (it tags each with its row's key and its grip with an act), so the measure, input and motion engines work on them as on any kit element, and the screen draws nothing of its own. The carry's payload is `settingsRow`, its look `self` (the row follows the finger, the others step aside: the motion cause `stepAside`), and its grip starts the carry on a press with no hold (`settings.md:9`). The drop is the door's `settings.move…`; the adapter then redraws its `Setting` rows, as today. Keys: `keys.policy` `none`.

## Architecture

```
obsidian/ui/next/
  screen/      layout.ts    Place (opaque), Places, layoutOf → Layout parts      pure
               units.ts     the units and their operations                       pure
               rules.ts     the gateway to the core's pure rules (generated)     pure
  model/       Model, Msg, Command, the broadcasts                               pure (types)
  update/      update.ts (generated router); <concern>/ any files                pure
  view/        Screen.tsx (generated); screen-jsx/, kit-jsx/ (the dialects);
               kit/ (the kit's components)                                       pure / kit
  engines/     one file per engine (§The engine table)                           host
  host/        ScreenHost.ts; adapters/leaf.ts, note.ts; settings.ts;
               registration.ts
obsidian/runtime/
  Runtime      the replica; door calls; pending calls and replay; the
               persistence queue; the network lane; Obsidian's events;
               the time engine; the action log
```

**`Place`** (report C, §4), private to `screen/layout.ts`:

```ts
/** Opaque outside this file: the record is not exported. */
declare const placeToken: unique symbol;
export type Place = { readonly [placeToken]: true };

interface PlaceRecord {
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
export function layoutOf(place: Place, root: RootAnswer, chrome: ChromeState, measured: Measured): Layout;
```

Report C's `sheets` is left out: a sheet (the full card, the search) mounts over the screen's own frame in every place, as today (decision 52).

**`Layout`**, one part per concern, each handed only to its concern by the router: `regions` (to `Screen`: what is drawn, in order, with its geometry in `Px` from the layout rules), `root` (the view need and `modeWrite`, data), `carry` (targets, the device variant, the look per payload), `scroll` (the scroller chain, inner first), `search`, `context`, `full`, `entry`, `keys`, `door` (the facts handed to the core). A place without a project (a note not attached to one) has a `Layout` with no regions: the screen draws nothing.

**The one loop, run by `ScreenHost`:** an engine's message → the router → a concern's handler with its `Layout` part → the runtime's door calls (P2) → `needs(model)` → render `Screen` → `measure` (only the keys the loop's motion causes name, and what the observers report) → `motion` → `scroll` → `focus`. The same for every place.

**`ScreenHost`** (`host/ScreenHost.ts`) is the one controller of a mounted screen: it opens the session and the one store, completes the place's seed with the form, runs the loop's draw order, hands each command to the one engine its kind names (a total table over `Command["kind"]`), and passes each engine's messages to the store. It holds no state but `readonly` handles. **Its public surface is frozen to lifecycle intents:** `mount(target, seed)`, `renamed(path)`, `shown()`, `hidden()`, `command(c: HostCommand)` (a closed union: `undo`, `redo`, `find`, `newTask`), `dispose()`. No `dispatch` and no `Msg` reach an adapter.

**The adapters** register with Obsidian and nothing else. `host/registration.ts` holds the plugin's registrations (`registerView`, `addCommand`, `addRibbonIcon`, `registerObsidianProtocolHandler`, `addSettingTab`, the workspace's events) and routes a command to the active screen's `ScreenHost.command`. `host/adapters/leaf.ts` mounts one `ScreenHost` per leaf at `Places.main()`. `host/adapters/note.ts` mounts **one `ScreenHost` per Markdown view**, at `Places.note(path)`, and tells it `renamed` and `shown` on a rename, a mode switch (Live Preview, Reading) or a view change; whether the note belongs to a project is the root answer (the core's project-note check, indexed by path in the door's cache, so each view's check is cheap), and a note that does not draws nothing. `host/settings.ts` is the settings tab (the settings tab in §The one mechanism). The mount engine places the screen's node among Obsidian's (a leaf's content; after `.cm-contentContainer` or first in `.mod-footer`).

**Preact 11, TSX.**
- It is checked by TypeScript 7 and bundled by esbuild as is. Svelte is rejected: `svelte-check` needs TypeScript ≤6, and its `animate:flip` infers motion from geometry.
- A user's event renders synchronously (the runtime flushes Preact's `debounceRendering`).
- Preact is reached only by the render engine; the two JSX dialects compile to its calls there.

**Picks.**
1. **A write pick** runs its door call at the tap. The list's change shows when the sheet's close settles (P6 pins the layout under the closing sheet).
2. **A typing pick** renders and focuses its field inside the tap.
3. **A hand-over** is one layer transition.

**Undo** is a door call like any other: instant, its result visible at once, with `canUndo` from the replica's history.

## The engine table

The frozen set. One row per engine: the concern it serves, its file, the host types and packages its project is compiled with, and the effect APIs it alone calls (each from one call site). Concerns with no engine (layout, carry, search, sections, selection, full card, context, entry's rules, layers' stack) are pure concerns under `update/<concern>/`; they reach the platform only through the commands these engines run.

| # | Engine | File | Compiled with | The only effect APIs it calls | Serves |
|---|---|---|---|---|---|
| 1 | **Render** | `engines/render.ts` | DOM, Preact | Preact's `render`; static custom properties (layout at rest), written only on difference | the screen and the kit; layout's regions |
| 2 | **Motion** | `engines/motion.ts` | DOM | `Element.animate`, `getAnimations`, the transient channel's variables, the `tc-m-…` classes; CSS motion only under `tc-m-…` | motion: one `AnimationSpec` per `MotionCause` |
| 3 | **Measure** | `engines/measure.ts` | DOM | `getBoundingClientRect`, `getClientRects`, `offset…`/`client…`/`scroll…` reads, `getComputedStyle`, `ResizeObserver`, `IntersectionObserver`, `scroll` listeners; makes `Px` | measurement; the boxes motion asks for |
| 4 | **Scroll** | `engines/scroll.ts` | DOM | `scrollTo` (`behavior: "instant"`; glides frame by frame on the time engine), `scrollTop`/`scrollLeft` writes | scroll: reveal, hold, edge scroll, glides, the chain to a note's scroller |
| 5 | **Focus** | `engines/focus.ts` | DOM | `focus({ preventScroll })`, `blur`, `activeElement`, `focus*`/`blur` listeners | focus, taken last in the loop |
| 6 | **Keys** | `engines/keys.ts` | DOM, Obsidian | Obsidian `Scope`, `Keymap`, `key*` listeners | keys: the key table is the keys concern's (pure) |
| 7 | **Input** | `engines/input.ts` | DOM | pointer, touch, wheel, click, double-click, context-menu, external `dragover`/`drop` listeners on the screen's root and the window (outside presses); `setPointerCapture`; `preventDefault` decided from model data; makes `Px` and `Ms` | input and gestures: the recognizer is the gesture concern's (pure) |
| 8 | **Editors** | `engines/editors.ts` | DOM, CodeMirror, Obsidian | `EditorView`, `EditorState`, `MarkdownRenderer`, Obsidian `Component`; `input`/`beforeinput`/composition events; `value`/`checked` writes; `setSelectionRange`, `Selection`, `Range` | entry, the full card's description, the description peek |
| 9 | **Mount** | `engines/mount.ts` | DOM, Obsidian (views' DOM only) | the screen's own node in its host; adopting a settings list's rows; writes to Obsidian's nodes around it (`--tc-block-lift`, `.cm-content`'s growth); the one overlay node per window | mounting, the layer host |
| 10 | **Chrome** | `engines/chrome.ts` | DOM, Obsidian | Obsidian `Platform`; `body` class writes; per-window theme and card-size tokens and the colour preview (`<style>` per document); `css-change`, `visibilitychange`, window `focus`, the phone keyboard's show and hide, popout windows; Capacitor haptics | chrome: form, theme, keyboard, toolbar, status bar, visibility, haptics |
| 11 | **Time** | `obsidian/runtime/lifecycle/Time.ts` | DOM | `requestAnimationFrame` (`onFrame`), `setTimeout`/`setInterval` (`after`, the minute), their cancels | the frame clock and timers for every engine and the runtime; engines get it as a handle from `ScreenHost` |
| 12 | **Host services** | `obsidian/hostServices.ts` | Obsidian | `Notice`, `workspace.openLinkText`, `getLeaf`, the clipboard, Google's sign-in through `GoogleAuth`, `outside()` (`open`, `browse`, `runScript`) | notices, links, copy, sign-in |
| 13 | **Settings chrome** | `host/settings.ts` | DOM, Obsidian | `PluginSettingTab`, `Setting` and its toggles, dropdowns, sliders, colour wells and buttons, `setIcon`, the tab's own DOM; no key scope | the settings tab in Obsidian's own look; its reorderable lists mount `Places.rows(list)` |
| 14 | **The file and the core** | `obsidian/runtime/persistence/TasksVault.ts`, `replica/Door.ts`, `network/CalendarLane.ts` | Obsidian | `vault.process`/`read`/`create`; `callDoor` (one `Door` per runtime); `Http` | P3 |

Rules the core must give, each a core function the UI reaches through the gateway: the layout rules (`layoutWidths`, `layoutShareAt`, `allColumnsWidths`, `dividerAt`, `stackedLists`, `swipeLanding`, `stackTasks`, `eventLeft`…), the drop rules (`placeAt`, `levelAt`, `gapAt`, `projectsDrop`, `groupPlaceOf`, `acceptsDrop`…), the entry's job order (`entryJobStep`), the zoom (`zoomAfterPinch`), and, added in stage 3, the hit test of a point against measured lists and the tree, the press slop and hold, and the edge-scroll speed.

## Guarantee

Per concern: what makes a second implementation **impossible to write** (C1–C5), and what the matrix and the trap cover beyond that. "Pure" in the second column means the concern's handler, selectors and kit components compile in the pure or kit project.

| Concern | A second implementation cannot be written because | Beyond that |
|---|---|---|
| **Layout** of columns and lists | Pure: it can compute no width, share or landing (units; C3); the rules are reachable only through the gateway; regions are one `Layout` part drawn by one generated `Screen`; places are opaque | matrix: every region in every place and form; logs equal across places |
| **Drag and drop** | Pure: one `Carry` slice and one set of messages, routed once (C1); hit test, drop and landing are core rules (C3); each payload's look and start are a closed variant (`float+place`, `float+line`, `self+stepAside`; `hold` or `press`) | matrix keyed by payload × target × place × form; logs equal across payloads after the declared look; trap: pointer capture only from `input` |
| **Motion** | Every animation is `engines/motion.ts`'s one `animate` call over a closed `AnimationSpec`; causes are a closed union; no CSS motion outside `tc-m-…`; kit elements declare `motion`; the frame clock is one call site | trap: an animation the ledger cannot match to a command fails; frame recorder per cell |
| **Measurement** | Only the measure and input engines make units; pure code cannot read a box; `motion` measures only the keys its cause names | trap: geometry reads |
| **Scroll** | One `scrollTo` call site with `behavior: "instant"`; `overflow-anchor` and `scroll-snap-type` set to `none` on the root and nothing else may set them (CSS); focus never scrolls (`preventScroll`); CodeMirror's scroll requests become intents | trap: a scroll offset change the ledger cannot match to a command or the user's input fails; matrix: reveal and edge scroll with the note's outer scroller |
| **Focus** | One `focus` call site; the kit dialect has no `autofocus`, `tabindex`, `<label for>` or `<form>`; CodeMirror's focus requests become intents | trap: an `activeElement` change the ledger cannot match |
| **Keys** | One `Scope` constructor and one key listener, in `keys`; CodeMirror has no default keymap; the key table is one pure concern, its policy one `Layout` variant | matrix: keys × place × form (the settings rows: none) |
| **Input and gestures** | `input` only translates (no comparison, no state); the recognizer is one pure concern whose slop, hold and flick are core limits (C3); listeners by event type | trap: listeners |
| **Entry** | One field engine (`editors`); the entry's rules are the core's `entry.*` and `entryJobStep`; the full card's subtasks and every field route to the same concern | matrix: entry in every place and form |
| **Menus and layers** | One layer stack; no `Menu` or `Modal` (not in any engine's row); the kit dialect has no `<dialog>`, `popover` or `<details>` | matrix; trap: no Obsidian menu is constructed |
| **Search** | Pure, one concern; its reveal's alternatives are closed variants (`reveal`, `dayOfFind`) with one consumer | matrix with declared variance |
| **Sections** | Pure, one concern; the lift is a carry payload; one kit `SectionHead` | matrix |
| **Selection** | Pure, one concern; ⌘ and Shift picks are input data read by one concern | matrix |
| **Full card** | Pure, one concern; one kit `FullCard`; its project tap a closed variant | matrix |
| **Context** | Pure, one concern; the place's writes are variants (`writesPlace`, the filter), the mode's door method is data | matrix: a note's cells assert the device's filter, place and carry unchanged |
| **Chrome** | `Platform` and `body` classes only in `chrome`; the form enters once, through the opaque place | trap: class writes on `body` |
| **Mounting** | `render` only in `render`; adapters name a target as data and reach `ScreenHost`'s lifecycle surface only | — |
| **Time** | One `requestAnimationFrame` and one `setTimeout` call site | trap: timer globals |
| **The file and the core** | One `Door` per runtime; `callDoor` only in the runtime | runtime tests |

**The screen as a whole:** one `Model`, `Msg`, router, `Screen` and `ScreenHost`; a new place is a new constructor in `screen/layout.ts`, its variants' values and its matrix column, nothing else.

**What the compiler cannot type, and how it is closed.** Effects with no call (a CSS transition, scroll anchoring, a library's own scroll or focus) are caught by the trap's **effect ledger**: in each frame, every changed scroll offset, every change of `activeElement` and every new entry of `document.getAnimations()` must match a command its engine ran in that loop, or a user's input. Code the matrix never runs is covered by requiring each cell to show its concern's whole signature (every message and command of the concern at least once across the cell) and by 100 % branch coverage of `obsidian/ui/next` over the matrix in the e2e build. Duplicated plumbing in pure code (two statecharts in one concern's folder) cannot compute anything (C3) and is caught by the matrix's equal logs across places, forms and payloads.

## What each finding meets

Every attack of the red team on revision 11 (R1: S1-1–S1-6, S2-1–S2-12, S3-1–S3-2, and its unbuildable items U-1–U-6), every architect finding (R2), every behaviour finding (R3), the twenty holes of report B (H1–H20) and the three earlier specs' failures (M, D, U of report B).

| Finding | What let it through | Killed by |
|---|---|---|
| R1 S1-1 | A private folder holds a second FLIP or a second carry | C2: engines are one file, one call site per API over a closed spec; C3: a pure folder can compute nothing; matrix equality across payloads |
| R1 S1-2 | `Px` opt-in; bare numbers free; motion allowed arithmetic | C1/C3: no bare `number` crosses; units are opaque objects with no operators; `motion` gets finished specs |
| R1 S1-3 | Gate-only by code shape; which-of-two needed | Dropped: closed variants with one consumer, per-concern `Layout` parts (C4); the comparator follows declared variance |
| R1 S1-4 | Place proxies (core answer fields, pointer kind, chrome, `closest`) | C4: every correlated input opaque, one reader by type; engines traverse only inside their root, `mount` alone sees Obsidian's DOM |
| R1 S1-5 | CodeMirror and `Menu`/`Modal` carry whole concerns | C2: libraries configured to delegate; `Menu`/`Modal` not used; the ledger judges library effects |
| R1 S1-6 | The guards' guards in the agent's write path | C5: the manifest stops tests and releases; suppressions, skips and casts banned |
| R1 S2-1 | Engines hold state and recognise | C2: engines translate only, fields are handles, one message per event, no comparison (units) |
| R1 S2-2 | Any engine may add any listener | C2: listeners by event type |
| R1 S2-3 | Hooks, module state, native behaviours in the kit | C1: the two JSX dialects, no hooks in reach, declarations-only module scope |
| R1 S2-4 | CSS motion and place branches the rule did not name | §Guards: the CSS rule is an allowlist; `overflow-anchor`/`scroll-snap-type` `none`; no host ancestors or media queries |
| R1 S2-5 | A structural type of an engine's own hides a host call | C2: a host value flows only into host-declared types, engines included; one call site per API |
| R1 S2-6 | Unscanned `.js`, `.d.ts`, files outside `obsidian/` | C5: scope by the metafile; no ambient declarations; the trap counts every non-`node_modules` frame |
| R1 S2-7 | Popouts, effects with no call, unrun paths | C5: the trap per realm; the effect ledger; branch coverage over the matrix |
| R1 S2-8 | The matrix satisfied trivially | G5: cells keyed by the concerns' closed unions; each cell shows the concern's signature; `notOffered` cells run and assert absence; logs by key roles, empty logs fail |
| R1 S2-9 | A new cause with its own engine; causes with free payloads | C2: one `animate` call site, specs of tokens; causes carry keys only (no units) |
| R1 S2-10 | `model/` and the router as logic zones | C1: `model/` holds types; router and `Screen` generated |
| R1 S2-11 | Adapters dispatch messages | C1: `ScreenHost`'s surface frozen to lifecycle intents |
| R1 S2-12 | Dynamic kinds, bags, casts | C1: closed types (`AssertClosed`), deep-readonly model; C5: no `as` |
| R1 S3-1 | A master "fix" keeps the old UI alive | G8: a ported entry names a test that must exist, sit in the matrix and fail when the new UI's fix is reverted; `failureText` moves out of the old UI before stage 7 |
| R1 S3-2 | jscpd sold as a guarantee | Kept as a backstop only; uniqueness is C1–C3 |
| R1 U-1 | Gate-only against decision 53 | C4 variants |
| R1 U-2 | The trap fails CodeMirror's own listeners | C2/C5: the library's frames count as `editors`; its own subtree is its own |
| R1 U-3 | The `Px` rule against the recognizer, edge scroll, pinch | C3: unit operations; slop and speed are core limits and rules |
| R1 U-4 | Name bans hit host and core names | Dropped: no name bans; opaque types do the work |
| R1 U-5 | A frozen table of every file name | C2: concerns and engines frozen, pure files free |
| R1 U-6 | 100 % mutation at once | C5: a floor that only rises |
| R2.1, R2.10 | A write re-renders every card | P9 |
| R2.2 | One route per kind against `rebased`/`viewsChanged` | C1: broadcasts |
| R2.3 | The note adapter cannot decide or scale | §Architecture: one `ScreenHost` per Markdown view; "not a project" draws nothing; the check indexed |
| R2.4 | rAF and timers in "kept" drivers | The time engine; §Migration's kept list corrected |
| R2.5, R2.6 | Arithmetic ban misplaces code; gates can't express alternatives | C3 units; C4 variants |
| R2.7, R3 §4 | The settings tab as a full place | the settings tab in §The one mechanism |
| R2.8 | Registration, commands, clipboard, visibility, outside press, keyboard events, haptics, external drop | §The engine table rows 7, 10, 12; `host/registration.ts` |
| R2.9 | Name ban too broad | Dropped |
| R2.11 | Stage 3 too big; the note hostless | §Migration: mutation floor; the note mounted from stage 3 |
| R2.12 | God files | Pure concerns are folders with any files; engines are small translators |
| R3 §1.1–1.6 | Settings lumped; reorder as a transition; wrong cause; fit frame measured; stale words; stage 6 rule | Traceability rerun; the settings tab in §The one mechanism; `stepAside`; decision 44; §Migration |
| R3 decisions 51, 52, 54 | Undeclared product changes | Decisions 51, 52, 54 rewritten; §Old bugs 15–17 |
| R3 old bug 3 | The open field in a note | §Old bugs 3 |
| M1–M9, D-1–D-9 | "One" per class or per host; parity by cross-reference; custom code allowed | C1–C3: one screen, one engine per concern, rules in the core; the frozen table has no exemption list |
| U1–U20 | Migration and ownership by place; host-owned logic; flags; per-place e2e | C1, C2, C4, G5, G8, G9; §Migration |
| H1 | `LeafModel`, `leafCarry`, `LeafMsg` | C1: one `Model`, one `Msg` routed once; a second carry has no slice, no messages and no rules to compute |
| H2 | `LeafHost` with its own draw and `run` | `ScreenHost` is the one controller; adapters reach only its lifecycle surface |
| H3 | `drivers/motion/ribbonFlip.ts` | C2: one file, one `animate` call site, closed specs |
| H4 | CSS `transition` on a state | CSS allowlist: motion only under `tc-m-…`, never with a state |
| H5 | Two stores for one screen | C1: one `Program` instantiation, in `ScreenHost` |
| H6 | `Measure.leafColumns`, per-host coordinates | C3: only engines make and unwrap units; the hit test is the core's |
| H7 | A host's own `targetAt` | `ScreenHost` holds handles only; the hit test is the core's |
| H8 | `Keys.leaf` | C2: one `Scope` call site; the policy a variant |
| H9 | `RibbonGlide` | C2: one `scrollTo` call site; glides on the one frame clock |
| H10 | A host's own focus timing | C2: one `focus` call site; focus taken last by the loop |
| H11 | `leafEntry` with its own look | C4: the look is the entry's `Layout` part |
| H12 | `LeafMenu` with its own placement | One layer stack; placement by measure and motion |
| H13–H15 | `leafSearch`, `leafSection`, `leafRows` | C1/C4: one concern each, routed once, its alternatives variants |
| H16 | A freeze allowance | G8 |
| H17 | DOM work outside `obsidian/ui/next` | C2: the engine table covers the bundle; C5: scope by metafile |
| H18 | A second flag | G8: one build constant |
| H19 | The reviewer sees only the diff | G9 |
| H20 | Each place matches the old one apart | G5: logs equal across places after declared variance |

## Guards

The guarantee is the compiler's; these keep the compiler's configuration honest and cover what it cannot type. Every file listed is in the manifest (C5).

| Check | What it checks | Part |
|---|---|---|
| `tsconfig.next-pure.json`, `view/screen-jsx` | The pure project: no host types; the screen's JSX knows only the kit | C1 |
| `tsconfig.next-kit.json`, `view/kit-jsx` | The kit's dialect: allowed elements, attributes and class literals | C1 |
| `tsconfig.engine-<name>.json` | Each engine's host types and packages | C2 |
| `tests/types/closed.ts` | `Model`, `Msg`, `Command`, kit props, `Layout`: closed, no bare `number`; `ROUTES` total and `Disjoint` | C1, C3 |
| `npm run gen:screen` check | `update.ts`, `Screen.tsx` and `screen/rules.ts` equal what the generator writes | C1, C3 |
| `tests/uiRules.ts` (decision 33) | Deny by default over the metafile's inputs: each engine's DOM members, listeners by event type, one call site per effect API, a host value only into host-declared types; module scope declarations only; the import graph's two rules (`units.raw` and the core's pure rules only through their gateway); no suppressions, skips, `as` or ambient declarations | C2, C3, C5 |
| `tests/engines.test.ts` | The engine table equals the code's; names Max; checks the manifest's hash | C2, C5 |
| `tests/styles.test.ts` (below `/* next */`) | An allowlist: `.task-calendar` the leftmost compound; no `body` or host-class ancestor but the theme's; no `@media`/`@container` outside the tokens; time- or scroll-driven properties (transitions, animations, keyframes, `@starting-style`, view transitions, scroll timelines, scroll snapping, `scroll-behavior`, `will-change`) only under `tc-m-…`, never combined with a state or a user-action pseudo-class; a variant class styles its own element only; `overflow-anchor: none` and `scroll-snap-type: none` on the root; decision 34's names, states and size rule | C1, C2 |
| `tests/matrix/registry.ts`, `tests/matrix/model.test.ts`, `scripts/e2e/matrix.ts` | G5 below | — |
| `obsidian/e2e/trap.ts`, `tests/e2e/trap.test.ts` | The trap and its effect ledger, per realm | C5 |
| `tests/guards.test.ts`, `tests/guards/fixtures/` | Every finding above that code can show is a reject fixture of the check that kills it; accept fixtures pass; every check matches a real input | — |
| `stryker.config.mjs` | The mutation floor | C5 |
| `.jscpd.json` | A backstop: no copied block | — |
| `tests/uiFreeze.test.ts`, `tests/oneSwitch.test.ts` | G8 below | — |
| `tests/hostLifecycle.test.ts` | Every adapter in each form, mid-gesture too, leaves nothing alive | P8 |
| `tests/budget/` | P9's budgets | P9 |
| `tests/architecture.test.ts`, `tests/uiDecides.test.ts` | Unchanged | — |

**Dropped as redundant** (each was a list that leaked; the compiler now does its work): the identifier and path bans on place names (C4's opaque types); the rule that only `layout.ts` reads `Place`'s members (the record is not exported); the gate-only shape rule (variants); the `Px` arithmetic allowances and `geometry.test` (opaque units); `kit.test`'s intrinsic-JSX and closed-props checks (the dialects); the per-API lists for pure code (no host types there); the unknown-file rule and the private-folder exception (engines are one file; pure code is free within its concern); `pureRules`' reference counting (the gateway); the export-surface freeze of pure owners; jscpd as a guarantee.

**G5. The matrix.** `tests/matrix/registry.ts` is a total type over the concerns, the places' constructors, both forms and each concern's own closed unions (a carry's payload × target kinds, every `MotionCause`, every message kind of the concern), so a new payload, cause, message or place adds required cells by type. A cell is scenarios, or `notOffered(variant)`, which runs the same scenarios and asserts the concern's commands and causes are absent. Each cell must show its concern's signature. Scenarios run as message logs through the one `update` (model level) and in the test Obsidian under the frame recorder and the trap (both forms, light and dark). One concern's logs are compared across places, forms and payloads by key roles (lifted, landed on, neighbour), after removing exactly what its variants declare; an empty log fails. The settings rows have their own cells: carry, motion (`stepAside`, the drop), measure and input at `Places.rows(list)` in both forms; every other concern `notOffered` there.

**G8. No coexistence.** No flags per place: one build constant, `UI` (`"old" | "next"`), read once in `main.ts`; the release build refuses `next` until stage 7. master never holds both: the work reaches master in one merge, at stage 7, which switches and deletes the old UI, its CSS, `UI` and the freeze. Until then the old UI is frozen by content: every old file by blob id, changed on the branch only to master's version at a commit the list names, each change with a port in `tests/uiFreeze.ported.ts` whose named test must exist, sit in the matrix and fail when the new UI's fix is reverted; otherwise the list may only shrink.

**G9. Structural review per stage.** A fresh reviewer gets the engine table, the whole tree at the stage's head and the guards, and one task: find a concern implemented twice, an effect the plugin did not order, or a place read outside `layoutOf`. Each finding becomes a reject fixture first, then a fix at the part (C1–C5) that let it through. A stage ends when a second fresh reviewer finds nothing.

| Impossible by construction | Enforced by |
|---|---|
| A write out of the order Max acted in | runtime tests; the core-call rule |
| A frame mixing generations or contexts | synchronous views computed in the dispatch loop before render; runtime replay tests |
| A card flashing back after a drop or a rename | runtime tests: a write's outcome is in the same message |
| An outside edit lost, or overwriting a pending write | replay tests: Sync during three pending calls, one of which goes stale |
| Single rows moving across a context; a transition twice | `update` and `motion` tests; the frame recorder |
| Re-rendering at pointer rate; every card re-rendered by one write | the render-counter test; P9's budget |
| A redraw under the finger | the pin tests |
| A screen going stale under a layer | the layer tests |
| A row remounting from field to card | identity tests |
| Something alive after its host | the lifecycle test |
| Focus scrolling the screen; the keyboard not rising on a pick | the focus engine's one call; the phone checklist |
| A second implementation of a concern | C1–C3 (the compiler), one call site per effect API, the matrix's equal logs, the trap's ledger |
| A place deciding anything but its variants | C4 (opaque place, one reader per correlated input) |
| A note writing the device's filter, place, day or carry | the note's matrix cells |
| Old and new UI on master together | `oneSwitch`, `uiFreeze` |
| A guard changed or switched off | C5: the manifest, the bans on escape hatches |

## Resolution

| Class | Where it lands |
|---|---|
| M1 settings tab | Obsidian's own `Setting` chrome; its row reorder on the one carry at `Places.rows(list)` (stage 6) |
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
| R21 "the core" against the pure rules | the rules are imported directly; `callDoor` stays in the runtime (P2, §Guards) |
| R22 what views a screen needs | `needs(model)` per screen, recomputed on every replica change (P2) |
| R23 kept parts after a replay | `tasks.reconcile(idMap, dropped)` (P3) |
| Root, rev 8: the dispatch loop | P2's loop: door calls right after `update`, answers fed back before render, views reach the model as data |
| Root, rev 10: the work owned by place (report B) | C1–C5, G5, G8, G9; §What each finding meets |
| Root, rev 11: the guarantee enumerated what is forbidden (R1–R3) | C1–C5: the compiler is the guard |
| R2.1 render cost | P9 |
| A note sharing the device's filter, place, day and carry (report C, §3) | the note's `Layout` variants (C4); §Old bugs and contradictions |
| R24 the UI's mechanisms not unique (the traceability's class for revisions 11–12) | §The one mechanism, §The engine table; every row's owner is a concern of the one screen |

## Migration: by concern, the main screen first, one switch

The old screen keeps its own services, untouched, until it is deleted. Nothing of the new UI reaches master, or Max, before stage 7, which switches every place at once and deletes the old UI in the same merge (G8). Until then the e2e build holds both, behind the build constant `UI`: each sees the other's writes as outside changes and rebases, as the plugin and the iPhone app do. Stages 1 and 2 are built; stages 3–7 replace revision 10's slices 3–7.

**Every stage ends the same way:** the compiler and every check of §Guards green, the matrix complete for the places and payloads that exist, the trap and its ledger clean, the mutation score at or above its floor (raised to it), the behaviour review done and a structural review (G9) clean. A stage that needs the core starts with `backend`.

| Stage | What | Release |
|---|---|---|
| 1 | **The runtime and the core's part** (built, kept). | — |
| 2 | **Guards, freeze, the lifecycle test, the e2e harness** (built; reshaped in stage 3). | — |
| 3 | **The construction, and slice 3 reshaped onto it.** <ul><li>`backend`: structural sharing and per-part need caches (P9); the hit test, the press slop and hold, and the edge-scroll speed as core rules (C3); the project-note check indexed by path.</li><li>The pure, kit and engine projects; the two JSX dialects; `units`, the gateway and the generators; the engine table and the manifest; `uiRules` over the metafile; the CSS allowlist; the closed-type test; the trap with its ledger; the matrix registry; the reject fixtures of every finding in §What each finding meets; the mutation floor at its first score; `UI` and the content freeze.</li><li>Slice 3's code onto them, with `Places.main()` and `Places.note(path)` both mounted under `UI=next` from the start (the note adapter one `ScreenHost` per Markdown view): lists, cards, sections, entry, menus, selection, search, the full card, the carry between lists.</li></ul> | — |
| 4 | **The main screen, region by region**, each adding to the existing concerns and engines: <ol><li>the timeline (lanes, events, the now line, zoom, slots, its drops and stretches);</li><li>Two columns and the ribbon, the wheel, both swipes, the day turn, the Done column;</li><li>All columns and the dividers;</li><li>the panel and the tree, the filter and its title, the tree's lift and drops, the hover-open, the left-edge reveal;</li><li>the carry across every target, select mode across columns, the bulk menu, the sources and event menus, the missing file.</li></ol>Each region ends with its matrix cells and its smoke subset. | — |
| 5 | **The note completed.** Its variants (§Old bugs 1–5, 13, 14), the inline frame, the scroll chain to the note's scroller, its matrix column complete. Its diff adds values to existing variants and nothing else: no new concern, engine, message or command. | — |
| 6 | **The settings tab.** First the behaviour inventory gains the tab's inputs it lacks (the colour well's live preview, the code field, swatches, bins, Add buttons, sliders, dropdowns, More's rows, the login row, Copy; R3 §4). Then `host/settings.ts` on Obsidian's `Setting` as today, and `Places.rows(list)` with the adopted rows, the `settingsRow` payload, its `self` look and `stepAside` (the settings tab in §The one mechanism). Its matrix cells. | — |
| 7 | **One switch, and the old UI deleted in the same merge.** The release gate passes, an independent QA on a copy of Max's real file finds nothing, the mutation score is 100 %, then one merge into master: `main.ts` mounts the new UI everywhere; `UI`, the old UI (`CalendarScreen` and everything only it uses, the old `SettingsTab`), the old CSS above `/* next */`, `Picks`, `Reload`, `WriteQueue`, the old services' plugin wiring, the freeze and its baselines are deleted; `obsidian/ui/failureText.ts` has moved out of the old UI first. | ★ with Max's phone checklist |

**What of slices 1–3 is kept, renamed or reshaped** (report A, corrected by R2.4):

| Fate | What |
|---|---|
| **Kept as is** | The whole runtime (23 files): `Program`, `Store`, `HostSession` are generic; the `Program` is instantiated once, by `ScreenHost`. Pure models `answers`, `assertNever`, `card`, `monthGrid`, `section`, `select`, `taskMenu`, `layers`, `search`, `full`, `commands`, into their concerns' folders. `recognizers/press.ts`, into the gesture concern. The e2e harness, the recorder, the shots, the budget. |
| **Kept, reshaped at their edges** | The drivers become engines: `focus`, `keys`, `overlay` (into `mount`), `chrome`. `scroll` (its frames and timeouts, `scroll.ts:43,130-134`, go to the time engine), `input` (its timeout, `input.ts:281`, goes to the time engine; its comparisons to the gesture concern), `islands` → `editors` (its timeout, `islands.ts:124`, to the time engine; CodeMirror configured to delegate keys, focus and scroll). The view leaves `Card`, `List`, `Sheet`, `icons`, `entry/Bar`, `carry/SelectFoot` into `view/kit/` under the kit dialect. |
| **Renamed** | `BlockMsg` → `Msg`, split into the concerns' unions; `update/menu`, `full`, `ids`, `fullActs`; `view/menu/TaskMenu`, `full/FullCard`, `carry/CarryFloat`; `BlockKey` → a key intent; the CSS root `tc-n-block` → `tc-n-screen`. |
| **Reshaped** | `model/block.ts` → `Model` (with the opaque `place`) and `screen/layout.ts`; `BlockLists` → `Layout.regions`, its eight flatteners → one selector of the layout concern; `model/carry`, `carryPlace`, `carryView` → the carry concern, its geometry through the core's hit test and units; `update/block.ts` → the generated router, the motion concern (`withMotion`) and the context concern (`modePicked` through `root.modeWrite`); `update/search`, `select`, `section`, `acts` read their `Layout` parts; `view/Block.tsx`, `BlockRoot`, `Layers`, `search/Search` → the generated `Screen` and kit elements; `drivers/measure.ts` → boxes per key, units made here; `drivers/motion.ts` → one `animate` over specs, its height hold → the pin, its box reads → measure, its `put`/`inline` → mount; `BlockHost.tsx` → `ScreenHost.ts` (`blockProgram`, `entryDoor` into `update`; its gesture state into `Model`; its long-press timer a command); `NoteBlocks.ts` → `host/adapters/note.ts`, one `ScreenHost` per Markdown view; `composeRuntime.ts`: no `NewScreens`, the feeds always given. |
| **Deleted** | The `newBlock` device value (`task-calendar:new-screens`), `NewScreens`. |

## Tests

1. **`update` (unit):**
   - every decision 55–87 and fix commit as a replayed message log;
   - every A16 rule;
   - pins (changed, gone, hidden-not-gone, a Sync re-id);
   - identity across create, rename and undo;
   - midnight during a swipe;
   - bounds;
   - every model-level cell of the matrix (G5), each place's model through the one `update`;
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
3. **Recognizers (unit):** every input of the inventory's section A as a stream.
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
   - **The matrix** (G5): every cell's scenarios, with the frame logs of one concern compared across places, and **the trap** (C5) armed on every e2e run.
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
7. **The guards' own tests:** the fixtures, non-vacuity, mutation at or above its floor, jscpd as a backstop, the manifest.
8. **Max's phone checklist at the ★** (under 5 minutes): momentum scroll, the rubber band, the real keyboard and its rising on a pick, a lost lift.

## Done when

- The engine table is the code's, its hash the one Max approved, and the manifest unchanged since his last approval.
- The pure, kit and engine projects compile under their configurations; every check of §Guards is green; every finding of §What each finding meets has its reject fixture; mutation is at 100 %.
- The matrix is complete for every place, form and payload, at model level and in the test Obsidian, logs equal after declared variance, branch coverage 100 %, the trap and its ledger clean in every realm.
- P9's budgets hold.
- The traceability, rerun against the final revision, leaves no row over and maps every row to a concern of the one screen.
- The release gate passes, an independent QA on a copy of Max's real file finds no defect, and the phone checklist passes at the ★.
- The old UI is gone in the merge that switched, master never held both, and `docs/plugin/` says what the screen does (§Old bugs' doc changes included).
- The last structural review found nothing.

## How it is built

- `backend` makes the core part of each stage that needs one. One `frontend-obsidian` agent per stage or region after that. The lead checks every diff, test and screen.
- **Behaviour review:** after each stage or region, a fresh reviewer gets the diff, the principles and that part's traceability rows, and finds where the code breaks a principle.
- **Structural review (G9):** a second fresh reviewer gets the engine table and the whole tree. Its findings become reject fixtures before their fixes.
- After stages 3, 4 and 5, a fresh QA agent is told to break it.
- A finding is answered by naming the principle, the part of C1–C5 or the inventory row that let it through, and fixing that.

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

**Reviewed for revisions 11 and 12.** Every decision was read against C1–C5. A decision written "in the block", or allowing several stores, CSS motion, a flag per place, logic in a host or an engine, or an Obsidian `Menu`/`Modal`, is revoked or rewritten; each keeps its product behaviour (revision 11's three undeclared changes, to decisions 51, 52 and 54, are withdrawn), and a rewritten one says so in its first words.

| Decisions | Verdict | Why |
|---|---|---|
| 1–11, 13–18, 20–25, 27–30, 32 | Kept | The runtime: no place, no host, no mechanism of the UI |
| 12 | Rewritten | Polling starts with the first screen that draws a calendar |
| 19, 26 | Rewritten | `ScreenHost` draws first and opens the session; adapters reach nothing of the runtime |
| 31 | Rewritten | One store per screen, the one `Program` (H5) |
| 33 | Rewritten | The compiler first; the guard over the bundle's metafile; one call site per effect API; no escape hatches |
| 34 | Rewritten | The CSS an allowlist; time and scroll only under the motion engine's classes |
| 35 | Revoked | The line freeze with allowances: G8's content freeze |
| 36, 37 | Rewritten | Hosts are the adapters in both forms; the e2e build holds `UI`, the trap per realm with its ledger |
| 38–42 | Kept | The fixture, the test Obsidian, the recorder, shots and budget |
| 43 | Revoked | A device flag for one place: one build constant; readiness kept |
| 44, 56 | Rewritten | The inline frame's height, held only by the pin |
| 45, 46, 48 | Rewritten | Acts are kit props; static values by the render engine, time by motion; motion measures only named keys |
| 47, 49, 60 | Kept | Generic already |
| 50, 55 | Rewritten | No Obsidian `Menu`; the editors engine delegates; the mount engine adopts and places |
| 51 | Rewritten | The look from the entry's `Layout` part; **a blur ends the entry on both forms, as today** |
| 52 | Rewritten | **The project line keeps today's behaviour** (close and filter; in a note close); the help page corrected |
| 53 | Rewritten | The reveal's alternatives are closed variants; the note's are old bugs 1–3's fix |
| 54 | Rewritten | One carry, **each payload keeping today's look and start** (a settings row follows the finger, the others step aside, no hold) |
| 57 | Rewritten | The matrix run, logs compared after declared variance |
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

33. *(Revision 12: rewritten.)* **The guard reads the code as the compiler does, and its scope is the bundle.** The guarantee is first the compiler's (C1–C3): the pure project (`screen/`, `model/`, `update/`, `view/Screen.tsx`) and the kit project have no host types, and each engine is a project compiled only with its row's (`tsconfig.engine-<name>.json`). `uiRules` covers what configuration cannot: it reads every input of esbuild's metafile outside `node_modules` (any folder, `.js` and `.d.ts` included) with TypeScript 7's own API (`typescript/unstable/sync`; `typescript` pinned exactly), resolving every name, member, shorthand, import and type to its declaration, so an alias, a string key, a destructuring or `Object.assign(el.style, …)` reaches the same declaration. **Deny by default:** anything the host declares (the DOM's, Node's, Obsidian's, Preact's and CodeMirror's declarations and the language's doors to code named at run time: `globalThis`, `Reflect`, `Function`, `eval`, `Proxy`…) is reachable only from the engine whose row names it; listeners only by the engine that owns their event type; each effect API from exactly one call site. **A host value stays in host-declared types everywhere,** engines included (no type literal of an engine's own can carry a host call, R1 S2-5). A few kinds are allowed nowhere (a bare window or document, a door to code named at run time, a class read, a class written whole, an attribute named at run time). The rest of its rules: module scope holds only declarations in the pure and kit projects; `screen/units.ts`'s `raw` is imported only by engines and the gateway, and the core's pure rules only by the gateway; no `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `jscpd:ignore`, `eslint-disable` or `Stryker disable`, no `.skip`/`.only`/`.todo`, no `as` but `as const` (and inside `units.ts`), no ambient declarations outside the dialect files. Its self-tests are the fixtures of §Guards.
34. *(Revision 12: rewritten.)* **The new CSS is an allowlist.** Below `/* next */`: `.task-calendar` is every rule's leftmost compound (no `body` or host-class ancestor but the theme's `theme-light`); no `@media` or `@container` outside the token block; a selector names only the kit's `tc-n-…`, the motion engine's `tc-m-…`, an `is-…` state or the root; a state is an `is-…` class, an attribute selector, `:has()`, a pseudo-class of what the user does, or a `body` class Obsidian does not set; no size property under a state, and no custom property set under a state and read by a size property; no in-flow pseudo-element given content or a size; a size property is anything that sizes a box or its content (revision 10's list). **Time and scroll belong to engines:** any property whose effect is time- or scroll-driven (transitions, animations, `@keyframes`, `@starting-style`, view transitions, scroll timelines, scroll snapping, `scroll-behavior`, `will-change`, longhands included) appears only under a `tc-m-…` class and never combined with a state or a user-action pseudo-class; durations and easings only as `--tc-motion-…` tokens. A variant class styles its own element only. The root states `overflow-anchor: none` and `scroll-snap-type: none`. Slice 3's foot fade on a state becomes the motion cause `fadeAside` (decision 58).
35. **Revoked by revision 11.** Decision 35's freeze (lines per directory, «shrinking passes», allowances with a commit and a reason) let the old UI grow beside the new (report B, H16). It is replaced by G8's content freeze: every old file by blob id, changed only to master's version with its port recorded, the list only shrinking. The two lines that route the old screen's task links through `outside()` (decision 37) are already in the baseline taken in stage 3.
36. *(Revision 11: rewritten.)* **The lifecycle test's hosts** are the adapters, registered in `HOSTS` (`tests/hostLifecycle.test.ts`) as `mount(context, form) → { startGesture, unmount }`, by their path under `next/host/adapters/`; an adapter not registered fails, and each runs in both forms. `tests/helpers/LeakCounter.ts` counts as revision 10 said (listeners on every target of the window's world, `on…` handler properties, observers, timeouts and intervals, frames, idle callbacks, immediates, microtasks not yet run, running animations, scopes, Obsidian event references, subscriptions), after queued microtasks have run.
37. *(Revision 12: rewritten.)* **The e2e build** is `obsidian/e2e.ts`, built by the harness into `E2E_HOME/build/main.js` (`node esbuild.config.mjs production e2e --outfile=…`; `npm run build:e2e` into `.e2e/build/`) with the first line `// task-calendar <version> e2e`; the root `main.js` is never touched (`--outfile` without `e2e` is refused). It is the only build that holds both UIs (`UI`, G8), and it carries the trap with its effect ledger, installed in every window realm before a screen mounts there, its source map and the coverage counters. After copying it into the scratch vault the harness checks the copy is this run's build: its first line exactly that of `manifest.json`'s version, written after this run's build started and after the last commit. `createServices` and `createDeps` take the `Http` (default `obsidianHttp`), and the plugin's reach outside Obsidian is one protected method in `obsidian/hostServices.ts` (`outside()`: `open`, `browse`, `runScript`): the e2e build records them, and takes over `window.open` and `location.assign` in its test window, so nothing opens on Max's Mac.
38. **The fixture** is taken once into `.e2e/fixture/` (gitignored with all of `.e2e/`: it holds Max's tasks, never committed) and kept, so baselines stay comparable; `--refresh-fixture` takes it again, and the baselines are recorded again after it (`--update`). The clock stands at 14:20 of the day it was taken. Google's secrets are replaced (`e2e`), the project notes come as stubs holding only the project tag, and the calendars (Google through the fixture network, the phone's and the work files at the paths the settings name) are made up for that day. Every path the fixture names (the tasks file, a note, a calendar) must stay inside its vault: an absolute one or one climbing out (`..`) is refused, when the fixture is read from Max's vault and when the scratch vault is written.
39. **The test Obsidian of the harness** keeps its profile and vault under `E2E_WORK` (default `.e2e/work`); the harness refuses an `E2E_WORK` or `E2E_HOME` inside `~/Obsidian` or inside the repository outside `.e2e/`, comparing paths as the disk does: the nearest part that exists resolved by `realpath` (links, and on macOS the case the disk holds), the rest appended, then compared without regard to case (so `~/obsidian/e2e` is Max's vault). The vault is written over in place each run (a copy of Max's tasks is never moved to the Bin). A port from 9345 free by `ps` and `lsof`; if another session takes it between the check and the launch, the instance just launched (it has no port of its own then) is ended by its own process id and the launch tried on the next port. A launch in the background (`open -n -g`) with Chromium's switches against an occluded window's throttling, and focus emulation; with those, CDP's own input reaches a window behind others, so every touch, click, wheel and the closing of Obsidian's first dialogs go through `Input.dispatch*`, never a click made in the page. Each platform and theme starts clean: the fixture's tasks file written again, the plugin's device storage cleared, the page reloaded into the platform.
40. **The recorder** keys a row by the key the view gives it (`data-row`, the model's row key; on the old screen `data-card`, its task's id), or by its whole title where it has neither, with a count among rows of the same base; each element keeps the key it was first given, so rows of one title never swap numbers as they move, and a key passes to another element only once its own left the DOM, so a remounted row keeps it. A carried card is named by its key (`__e2e.keyAt`), never by a cut title. Each row is judged from the frame it first shows in; a row's box takes in its margin below (a folded parent's fold); the place is the leftmost column showing plus the day after today, with its distance from the stage's edge (the view's left or a docked panel's right). The rules, each proven on a frame log made to reproduce a past bug (`tests/e2e/frames.test.ts`): a step that never settles; a row gone for some frames and back (a remount's flash); in a context step, any row animated or between its two places (cards flying in on a project switch); a row the step does not move that moves, and any row that leaves its place and comes back (a jump under a lift); in a swipe, each column moving as one (columns may change their widths, RibbonColumns), one way, never more than 120 px between two frames (the All columns jerk); overshoot; a rest off; a swipe resting off its column's edge or two places away; gaps or overlaps; a gesture that moved nothing. A step waits a person's pause (500 ms) before acting; the mouse lifts a card by moving it (holding opens its menu), the finger by holding; a swipe starts clear of the divider; the trackpad's wheel goes at a delta every 8 ms. The smoke set adds All columns tried sideways (nothing may move), a project chosen and all again, and a card lifted and held.
41. **Shots** are clipped to the view (Obsidian's chrome is never compared) and compared at 5 of 255 per channel on at most 0.2 % of the pixels (the timeline 6 on 0.3 %), and no more differing pixels may lie together (8 ways) than 4 CSS pixels' worth at the shot's ratio (36 at 3×): a short label one pixel off on the phone view is a tiny share of the shot but a block of touching pixels along its strokes, while the GPU's rounding scatters single ones. A missing baseline fails unless `--update`. Masks are listed by selector and kept with the baseline.
42. **The budget** comes from a CDP trace of each gesture and a fixed tail of 1.2 s (longer than any transition); the recorder starts before the trace and the wait for rest runs after it, so the harness's polling is never traced. Every harness evaluation marks its run in the page (`console.timeStamp`, `HARNESS` in `frames.ts`), and its script, with the frame sampler's own function, is cut out. From the rest: the page's main thread, its frames (each `FireAnimationFrame`), the script run in each frame (the union of the script events, nested ones once), and every task over 16 ms (the 17–49 ms ones the page's `PerformanceObserver` never tells). It fails a trace with no frame or no script of the page (nothing passes on an empty recording), a frame with 8 ms of script or more and any task over 16 ms, and reports the average over the frames that ran script and the longest frame.

Made while building slice 3 (the note block behind `newBlock`; reviewed above):

43. **Revoked by revision 11.** `newBlock` as a device value (`task-calendar:new-screens`) was a flag per place (report B, U2, H18). G8 replaces it with one build constant for every place; no device or synced value chooses a UI. What it carried that is not a flag stays: the runtime's readiness is told when `VaultProjects.ready()` resolves (a plugin loaded into an indexed vault hears no `resolved`), and `core/settings.ts` is not touched. The runtime is composed with its feeds always; a place without a calendar asks for no events (decision 12).
44. *(Revision 11: rewritten.)* **An inline frame's height is the stylesheet's:** with `Layout.variants.frame` `inline` (a note), the kit's `Frame` is a column as tall as its stack up to `--tc-block-max-h`, past which the stack scrolls; nothing is measured for it. During a carry the region holds its height as it stood, by the pin under the lift (P6), a motion cause like any other, never a frame-specific hold. The old block was at times 1 px short of its rows (its stack scrolled by a pixel); the new one is not, and the e2e comparison crops that pixel (`fit`).
45. *(Revision 12: rewritten.)* **Views take no event handlers.** A kit element that can be pressed carries an `act` prop (with its key and value); the render engine writes it as data attributes; the input engine delegates by them and turns each event into one message of unit-branded raw data; the gesture concern recognises presses (`press.ts`) and `update` turns an act into its message. The kit dialect has no `on…` attribute at all.
46. *(Revision 12: rewritten.)* **Inline styles and CSS variables come from the model, split by time.** Values at rest (a row's level and branch offsets, a folded card's room, the select circle's room, the regions' widths) are computed by the core's rules through the layout concern and written by the render engine, only when they differ. Values that change over time (a transition, the transient channel) are the motion engine's. A variant that sizes a box is a kit element of its own kind with literal classes (a two-line card is as tall as its lines; a branch's end, the fold counter, a meta pair, a repeat-only corner, each panel and row kind), and a class that comes and goes is an `is-…` state that sizes nothing (decision 34).
47. **A card's marks** are the core's `TaskItem.marks`: the dot of a task in progress (`progressDot`, the card's `is-progress`), the description's mark (`description`) and the subtask counter (`count`); the card reads no status or `can` field for them. Its `data-status` paints only the full card's subtasks (done ticked, given up struck through).
48. *(Revision 12: rewritten.)* **Motion within one context** is a FLIP over keyed rows, the motion cause `rows`, which names the keys it may move: the motion engine asks the measure engine for those boxes only, in the commit phase, then slides what moved and fades in what is new, through its one `animate` over the cause's `AnimationSpec`; another context (mode, project, the first read) draws in place. A row that leaves fades where it stood and then its room folds, as the old `Motion.leave`: the engine keeps its node over the frame, fades it, and the rows under it slide up after the fade while the region holds its height (the e2e step «a card done leaves its list» judges it frame by frame, in every place).
49. **Layers** mount in the overlay host's node, under their own `.task-calendar` root; `motion` places them from measured anchors (`data-n-anchor`) and fades them in and out; the close's end is `layerGone`, which unpins the lists. A write pick runs its door call at the tap and the lists change once the sheet has gone (R10).
50. *(Revision 12: rewritten.)* **The task menu** is a kit layer in the one layer stack (no Obsidian `Menu`). It reads the core's `tasks.menu`/`tasks.bulkMenu` as a view need while open; its copy of the card is measured once per menu (`wholeWidth`, `grownStart`); the panel is placed from measurement, under, over or split (`groupsAbove`), and a page change re-places only the panel; a closing menu keeps what it drew; the repeat page writes once at the close (`repeatPage.end`); the month grid is plain date math (no core rule exists for it). Typing picks (Rename, Add subtask, New section, New project) focus their field inside the tap, once it is visible. As the old menu: it opens once its card is in view, the card's scroller gliding it in first in the collapse time (the scroll intent `intoView` over the scroll concern's chain: a list, a note's stack and then the note itself; a finger on it calls the menu off); on the desktop a second click within 250 ms of the one that opened it renames (the gesture `secondPress`, the old double click); the start of the task's description stands by the copy of its card, over or under it where the panel is not, rendered by Obsidian through the editors engine (the old `DescriptionPeek`): a tap on it opens the full card, a note's link opens the note.
51. *(Revision 12: rewritten.)* **The quick entry** runs the core's `entry.*` steps over a session kept in the model, and its jobs in the core's order (`entryJobStep`, `queuedEntryJobs`) in the entry concern (`runEntryJobs`, after every message). The look (`entryLook`) and the cards about to be drawn for a step that asks for them (`coming`) are computed there from the entry's `Layout` part, never handed in by a host. The field is Obsidian's editor (the editors engine) restyled by a CodeMirror theme from tokens; on Enter the written card takes the field's box and the next field gets a new row key. While typing, the foot fade is a second element (sizing by state is forbidden); on the phone the room at a list's end is a spacer row. The bar is the kit's with the variant `entry.bar` (`keyboardBar` on the phone, `capsule` on the desktop). **A blur ends the entry on both forms, as today** (the window losing focus excepted); revision 11's phone-only gate is withdrawn.
52. *(Revision 12: rewritten.)* **The full card** is a layer inside the screen's frame, in every place, pinned by id and following Sync through the needs `tasks.find`/`tasks.fullTree`; the description runs in Obsidian's editor through the core's `description.*`; its subtasks' circles are drawn as the old full card's (width 0, the card's padding kept); its rows are keyed `full/<id>`. **A tap on its project line keeps today's behaviour:** on the main screen it closes the card and selects the project in the filter (`tasks.selectProjectNode`); in a note it closes the card and writes nothing (the variant `full.projectTap`: `closeAndFilter`, `close`). `tasks.md`'s line that says the tap opens the project's note is corrected (§Old bugs 15). Its task and subtasks are read by the screen's filter (`tasks.find(key, text, filter)`, `tasks.fullTree(item, filter)`): fixed to a project, they show no folder mark, as the core decides.
53. *(Revision 12: rewritten.)* **The search reveals a pick** through `tasks.reveal`, one reveal for every place; each alternative is a closed variant of the search's `Layout` part (C4). `reveal`: `clearFilter` (the main screen: a filter that hides the task is cleared, `screen.md:114`) or `openFull` (a note: the task opens full in the note; the device's filter is never written). `dayOfFind`: `moveDay` (the day list goes to the task's day) or `openFull` (a note). The funnel place moves to the task's (Done, Inbox for Backlog, Soon, the calendar) where `context.writesPlace` is `write`. A Done task without the ribbon opens full; any other is ringed and scrolled into view (the scroll intent `reveal`). The note's choices are the fix of old bugs 1–3.
54. *(Revision 12: rewritten.)* **The carry is one, for every payload and place:** a card, its subtasks, the picked cards, the plus, a section, a tree node, a settings row, a timeline slot, with one slice, one set of messages and the core's hit test and drop rules. **Each payload keeps today's look and start, as a closed variant:** a card, the picked cards, the plus and a timeline slot lift on a finger's hold or a mouse's move, fly as a float and leave a dashed waiting place, and no other card moves; a section floats and waits where it stood, its landing a drop line (decision 59); a tree node's row follows the finger with a line where it will land (`screen.md:52`); a settings row follows the finger itself, starting on a press of its grip with no hold, while the rows it passes step aside (`stepAside`, `settings.md:9`). The geometry is measured once after the lift renders, per scroller and target, and kept fresh by `measured` while edge scroll moves a scroller; the target is the core's, recomputed on each move and told only when it changes; the device's carry is reported (`startCarry`, `carryAt` on a target change) only where `carry.device` is `report` (the main screen); the carried cards' subtasks leave the pinned snapshot; on a drop the pin goes at once and the float flies onto the landed card, on a cancel the pin stays until the float is back. A long mouse click does nothing, a right click opens the menu.
55. *(Revision 12: rewritten.)* **The editors and the mount**: the editors engine holds the title field, the full card's editors and the description peek, with CodeMirror configured to delegate its keys, focus and scroll; the mount engine makes, places and removes the screen's own node in its host (a leaf's content; after `.cm-contentContainer` or first in `.mod-footer` of a note), the overlay node per window and the adopted rows of a settings list, and writes Obsidian's nodes around the screen (`--tc-block-lift`, `.cm-content`'s growth). Adapters and `ScreenHost` write no DOM.
56. *(Revision 11: rewritten.)* **A field opened in an inline frame grows it** as any row does, to the CSS's tallest (`--tc-block-max-h`), past which its stack scrolls: the old `BlockHeight` fitted the block to what its stack held, the field among it. Only the pin under a carry holds the region's height. Measured in the test Obsidian (a real click on the plus, the desktop): with Today holding a task the old block grew 571→632 px as the new does; on the e2e fixture, Today empty, the old one stayed 572 px while its stack held 606 px in 558 (`BlockHeight` missed the field row's late height, a race of the old block: its field's bar stood 48 px under the frame's foot, scrolled out), and the new one grows to 620 px. On the phone both grow by 60 px. The new screen keeps the old rule, not its race. The e2e shot of a field open in a note compares the frame top-aligned (`fit` cut at the bottom): the old block's shot stops at the window's foot. The bar's buttons each paint over the one before (`z-index`), as the old bar's: a shrunk shift is covered by the flag. Old defects the e2e run shows and the new screen does not repeat: the written card flashing between field and card (19–21 frames), and the old block sometimes cutting the written card's bottom (4 px) after typing.
57. *(Revision 11: rewritten.)* **The e2e matrix run** (`npm run e2e -- matrix [place form theme]`, G5) runs every cell of the registry, each platform and theme starting clean, every step judged frame by frame by the same rules in every place, with the trap armed; one concern's logs are compared across the places that offer it. The old-against-new comparison stays an input to it: the e2e build records the old UI's baselines (`UI` `old`) and compares the new one with them in the same run on the same copy of the file. A caret's blink (CodeMirror's `cm-blink`) is no motion of the screen's: the recorder and the rest wait leave it out. `npm run e2e -- budget [place]` is the budget: 300 tasks, 4× CPU, in each place.
58. *(Revision 11: rewritten.)* **The plus carried** (the old screen's `beginNew`) is a carry payload: pressed and moved, the plus lifts as a float over the same places as a card, a dashed ring standing in its place (solid and filled while the finger is over it); let go on a place, the field of a new task opens there in the same tap through the core's `entry.openAtDrop` (`openAt` in the projects list, `openAtEnd` at a list's end) and the float lands in the field; let go on its ring or nowhere, it flies home. While a card or the plus is carried the plus and the capsule beside it fade aside: the motion cause `fadeAside`, run by `motion` (no CSS transition, decision 34; the old `QuickEntryController`'s look kept); a lifted section leaves them. The region's height is held from the lift's own drawing, by the pin, so a lift that takes rows out of the lists (a section, a parent's subtasks) never shrinks it.
59. *(Revision 11: rewritten.)* **A section lifted by its header** (the old `GroupDrag`) is a carry payload and waits where it stood, as a carried card does: its header's name and plate's words hidden, their places kept; its landing is the drop line over the slot (`groupPlaceOf`, in carry geometry), and nothing under it moves while it is carried. The old list closed over the lifted section and every row under it left and came back; that is not repeated. Let go on another slot it moves there (`tasks.moveGroup`) and the float folds onto its header. A header tapped opens its menu (Rename, Remove section as the core offers them); the name typed in place ends through the core's `sectionName.end` for Enter, Escape and a tap away alike.
60. **A finger's press the recognizer reads ends with no click after it** (`input` cancels its `touchend`): the browser's click would land on what the tap's outcome put under the finger (the plus hid and the field's room took its place, and the click took the field's focus). The e2e block shots mask Obsidian's status bar and the phone's navigation bar (`.status-bar`, `.mobile-navbar`) where they stand over the block (decision 41). A drawing that moves no rows leaves the motions under way running (a carry's next message must not stop the rows still sliding) and reports no card leaving.
