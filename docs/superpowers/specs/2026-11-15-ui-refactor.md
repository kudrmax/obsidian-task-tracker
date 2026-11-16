# Plugin UI refactor: one screen, one mechanism per concern, on the core's door

Issue: kudrmax/obsidian-task-tracker#41 (takes in #40). Branch `ui-refactor`. Revision 15.

## How this spec is made

Revisions 1–3 were written top-down, and every review found new holes: the spec never started from what the plugin actually is. Since revision 4 it starts from a complete inventory of the current UI, made by reading every file:

- [`ui-refactor/inventory-state-effects.md`](ui-refactor/inventory-state-effects.md):
  - 565 state locations; 45 facts held in more than one place;
  - 819 effect call sites, 417 ordered by nothing;
  - 180 event sources.
- [`ui-refactor/inventory-behaviour.md`](ui-refactor/inventory-behaviour.md): 203 inputs, 84 motions, 84 measurements, 52 screen states.

[`ui-refactor/traceability.md`](ui-refactor/traceability.md) maps all 2,032 rows to the mechanism that owns each. Each revision is checked two ways: the traceability is rerun from scratch, and a fresh architect who has not seen earlier revisions judges the root against the code. Since revision 15 a third way is added: **spikes** build the riskiest mechanisms for real and measure them, and where a spike contradicts the spec, the spec changes.

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
| 12 | 0 | **An arms race:** two reviews (`rev11-research/R4`, `R5`) found the type machinery partly unbuildable and contorted, built against a deliberately malicious agent |
| 13 | 0 | **Natural routes still open:** thirty-two hurried feature tasks (`R6`) found fifteen leaks, most from the UI still computing a decision; the architect (`R7`) found six build blockers |
| 14 | 0 | **A deny-list again, and no performance architecture:** thirty-eight tasks (`R8`) found eleven leaks and six frictions, most where `noCompute` listed what is forbidden; the architect (`R9`) found six blockers; three spikes (`S1–S3`) measured that a mode switch costs 75–80 ms and that several mechanisms work only in a form the spec did not name |
| 15 | 0 | — : 16 ms for every interaction by a measured render architecture; the UI's operations an allowlist; ownership of writes, of the gateway and of dispatch exact; every tool in the form a spike ran (§Why revision 15) |

The faults of revisions 5 and 6 had one cause. The spec treated the core as an asynchronous service the UI waits on, and built machinery around the waiting: read-back, previews, transactions, read-ahead, echoes. The core already has a **synchronous, pure door**, `callDoor(method, args, context) → answer` (`core/application/PhoneCalls.ts:1301`). The iPhone app runs on it, and it covers every `TaskService`, `DayService`, undo, settings and calendar method (a coverage map by space, `DOOR_COVERAGE`, `PhoneCalls.ts:1280`; stage 3a adds `DoorMethods`, typed per method). On Max's real tasks file (31 KB) a whole funnel view costs about 3 ms through it, JSON included (measured locally). Revision 7 puts the plugin on the same door, and the waiting is gone.

The research behind revisions 11–15 is kept beside the inventories in [`ui-refactor/rev11-research/`](ui-refactor/rev11-research/):
- **A** an audit of the code built in slices 1–3; **B** a red team of the three failed "one mechanism" specs (holes H1–H20); **C** the map of one screen in every place and form; **D** how production teams make "exists once" hold;
- the reviews **R1–R9** of revisions 11–14;
- the spikes **S1** (TypeScript projects, the JSX kit, `noCompute` on today's code), **S2** (render cost at 4× CPU, hidden subtrees, chunking, CodeMirror, a shadow root, iOS support) and **S3** (closure recording, Stryker, CDP popouts, jscpd), with their key logs and sources in `S1-spike/`, `S2-spike/` and `S3-spike/`.

## Why revision 11

Max stopped the work after slice 3. Slice 3 built the new UI around the note's block: a `BlockModel` typed on a note, `BlockLists` as the only shape of what a screen shows, a carry measured in one stack's pixels, and a `BlockHost` that orders the frame, interprets every command, recognises gestures and hit-tests the pointer (report A, §2). The main screen would have needed a second model, a second update, a second host and second driver methods. This is the fourth "one mechanism" that would have become two; the motion spec of 2026-11-08 and the drag spec of 2026-11-09 failed the same way (report B).

**The common cause** (report B, §4): each spec stated "one mechanism" as a principle and then sliced, owned and checked the work **by place**. Each slice was asked to finish a whole place, so it built a whole mechanism for that place. No artifact named the single code owner of each concern for every place to use, and every check that existed tested behaviour or layering, which two correct copies both pass.

So the guarantee moves from the principles into the code's construction:

- **The screen is one:** one root, one model type, one message union, one router, one host; the pure UI code cannot name the host at all (C1).
- **Each concern that touches the platform has one engine,** in a frozen table; only that engine's module may reach the host APIs it needs (C2).
- **The UI decides nothing:** its operations are an allowlist that cannot compute, order or address by position; every decision is the core's, as data (C3). **A value that selects behaviour has one reader** per layer (C4).
- **Use is mandatory:** every concern in every place, form and payload, in unit tests and in the test Obsidian (G5); a runtime trap and its effect ledger catch what the checker cannot type, and every change to a guard that weakens it is made visible (C5); **old and new never coexist on master** (G8); **each stage gets a structural review** whose findings become checks (G9).

**Revisions 12–14.** Revision 12 answered three reviews of revision 11 (`R1–R3`) by making the UI code unable to *express* an effect, a core rule or a read of the place, instead of listing what is forbidden; it added P9. Its type machinery was partly unbuildable and aimed at a malicious agent (`R4`, `R5`). Revision 13 stated the threat model (§Guarantee): **one implementation of each concern by architecture; every natural route to a second one caught by a machine check; deliberate circumvention made visible, never silent**, and dropped what answered only sabotage. Revision 14 answered thirty-two hurried feature tasks (`R6`) and the architect (`R7`) with four rules: the UI decides nothing; a read that selects behaviour has one reader; ownership is named exactly and the unowned denied; weakening is visible and additions silent.

## Why revision 15

Two reviews of revision 14 and three spikes. The reviews: `R8` traced thirty-eight more feature tasks of a hurried agent and found eleven leaks (nine causes) and six frictions; `R9`, the architect, found six blockers, leftovers of earlier revisions, and **no architecture for render cost**: a mode switch would cost 50 ms and the spec allowed it. The spikes built the mechanisms for real, in throwaway worktrees, on today's code and Max's real file:

- **S1** built the four TypeScript projects with `tsc -b`, the JSX kit with one memoising runtime through esbuild and Vitest, and `noCompute` on `typescript/unstable/sync`, then ran it on slice 3's code: 167 hits, each classified as a decision for the core (58 hits at 31 places), plumbing (62) or geometry (47).
- **S2** measured 307 cards at 4× CPU in the test Obsidian: a cold render 75–80 ms, dominated by style recalculation against Obsidian's 5,077 rules; a shadow root cuts style 3.3×; `content-visibility` and chunking bring a mode switch to 11–16 ms; a new Obsidian editor costs 20–60 ms and a warm one re-keys in 9–11 ms; `requestIdleCallback` does not exist on iOS.
- **S3** recorded a guard closure through Vitest, Node and esbuild, ran Stryker against Vitest 5, trapped a popout over CDP, and ran jscpd on today's code: each works, but only in a form the spec had not named.

The spikes are facts: where revision 14 contradicted them, revision 15 changes. Revision 15 answers at the level of principles:

1. **Performance is an architecture, not a budget line** (P9): 16 ms for every interaction at 4× CPU, and no 50 ms budget anywhere. The lists render in a shadow root; cards carry `content-visibility: auto`; the place's other contexts are kept laid out and hidden, and are updated with every write through structural sharing; anything drawn new is drawn in chunks; one warm editor per screen; the card's answer is split into a position and a cached face.
2. **The UI's operations are an allowlist** (C3): pure and kit code may filter, find, map and compare for equality, and nothing else; plumbing goes through two small modules, `screen/seq.ts` and `screen/text.ts`; every decision the spikes found in today's code has a named core rule in stage 3a.
3. **Ownership is exact where a decision is made** (C2–C4): a door write is built only by its owning concern; a gateway export is one forwarding call; dispatch has no code per kind of need; a core answer value is never a condition in the UI but for `can.*` and `kind`; a selector of behaviour is a type with one reader per layer; a timer cycle is refused.
4. **Every tool is specified in the form a spike ran,** and every claim not yet run says so and names the stage that proves it first (§Unverified).

The product is unchanged. The behaviour of revision 10 (P1–P8: the model, the loop, the runtime over the door, the replica, the pending log and its replay, the persistence queue, geometry as input, motion by cause, layers and pins, lifecycle) stands.

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
| **Host:** Obsidian's and iOS's CSS and chrome | Unscoped rules meet Obsidian's and iPadOS's own; every card is styled against Obsidian's 5,077 rules | iPad padding (f623d869), Live Preview stretching the block (D80), a cold render of 300 cards at 75–80 ms (S2) |
| **Ownership:** which code implements a concern | Nowhere named. The old UI has 4 drag loops, about 8 motion paths, about 9 focus owners, about 14 key handlers, 2 entry engines (report A, §3); the place is read in about 10 branches of `CalendarScreen` (A, §4) | One fix per copy (motion decisions 57–61); a duplicate found only at a merge (motion decision 52); slice 3 shaped for one place |
| **Place:** where the screen is shown | Two booleans and a scope (`ScreenPlace`) read anywhere; a note's block writes the device's filter, place, day and carry | A search in a note clears the main screen's filter (report C, §3) |

The rules themselves stay where they are, in the core: where a task lands, what a drop means, what a menu offers.

## Principles

**P1. One model.**
- What the screen shows is a pure function of the model: `view(model)`.
- **One model type for every place:** `Model`, with the place it is shown in as data (`model.place`, a record whose fields only `screen/layout.ts` reads, C4). Each mounted screen is one store of that type; no place has a model, a message union or an update of its own.
- A fact has one field; a derived fact is a selector.
- The DOM, classes and styles are outputs, never read back as truth.
- **Identity is model state:** a row's key (`RowKey`, a brand made only by the identity concern or from a core id, C1) is given when the user's message makes the row. The core's `CreatedTask` id (known at once, P3) is bound to that key, so one row lives from field to card.
- **Typed text is the one exception:** while a field has focus, the field owns its text. The model receives edits and never writes back into it.
- **Values the screen writes are model state; the store only keeps them:** the list share, zoom, tree width and device choices.

**P2. One timeline.**
- The model changes only by messages, one at a time: `update(model, msg) → [model, commands]`.
- Work outside the model is a command, and its outcome is a message.
- **The dispatch loop.** One loop, the same for every message:
  1. `update` returns the next model and its commands.
  2. The runtime runs the door commands at once, synchronously, and feeds each answer back as the next message, until the chain is drained.
  3. **What the screen needs.** The screen has one pure selector, `needs(model)`. It lists the view answers the screen needs: its root view (the funnel, a note's view or the settings, which `layoutOf` gives as data, C4), **the contexts the place keeps laid out** (its other modes, the neighbour days, P9), the task of an open full card or menu, the search's results. The runtime computes one answer per need from the replica, cached on the replica parts the need reads (P9), and hands them to the model as data (`viewsChanged`).
     - Any change of the replica recomputes every mounted need **in the same loop**, kept contexts included, so an open card follows Sync at once and no kept context is ever from an older replica. Nothing is computed at idle.
     - Selectors never call the door. Here "the core" means `callDoor`, the replica and the view answers.
     - The core's **pure rules** (`rules.*`: `snap`, `swipeLanding`, `layoutWidths`, `stackedLists`, `layoutShareAt`…) are plain functions. They are reached only through one gateway, `screen/rules.ts` (C3), since they are needed per frame and per pointer move.
  4. `ScreenHost` draws, in one order for every place: measure first, render, editors, measure last, motion, scroll, focus last (§Architecture).

  The chain has a bound on its depth; hitting it is a failure with the action log dumped.

  A user's event runs the whole loop inside the event, which is what lets the iPhone keyboard rise on a typing pick and makes a write's outcome visible in the same frame. Messages from elsewhere run it once per microtask. Asynchronous work (persistence, the network, timers) is a command whose outcome comes back later as a message. What the loop commits in one task is bounded by P9: a region drawn new commits its first chunk in the event and the rest in the following frames.
- **Every wait on something the user sees has a bound,** and the bound is a message.

**P3. The core is a pure, synchronous function over a replica the runtime holds.**
- **The replica:** the plugin runtime holds one `DoorContext` (`PhoneCalls.ts:93`): the tasks text, the settings text, the undo history, the projects-screen state, the id state, the calendars' texts and the project notes. Every screen shares it.
- **Calls:** every core call (a view, a write, a carry step, a session step, an undo, a settings change) is `callDoor(method, args, replica)`, in-process, without JSON, the same door the iPhone app calls.
  - A call is synchronous and runs inside the message that asks for it, in message order.
  - Its answer gives the result and **only the parts of the replica the call changed** (tasks, settings, history, projects screen, ids); a part left out is unchanged and keeps its identity (stage 3a makes every part follow this, P9).
- **Consequences:**
  - **Views are runtime computations over the replica,** cached on the parts each reads and delivered to the model as data (`viewsChanged`, P2). Selectors read only the model. Another filter, mode, day or place is drawn from the same replica in the same message, so a frame can never mix generations or contexts. There is nothing to wait for and nothing to read ahead.
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
  - **Reconciliation:** after any replay that remapped an id or dropped a call, the runtime calls `tasks.reconcile(idMap, dropped)` in the same message as the model's remap. It maps the carry's keys and cards through the id map, and reverses a dropped call's effect on the projects screen: a node renamed by a dropped call goes back to its name.
  - A call that now fails (`staleTask`) is dropped with a notice and a reverse transition.
  - **Bounds:** at most two replays per write. Past that, the replica takes the file as it is, and the pending calls are dropped with a notice. The iPhone app's "busy after two tries" works this way, for one call at a time.
  - **A missing or moved file:** `fn` also checks that the file still sits at `tasksFile`, because `vault.process` holds a `TFile` that follows a rename. If the file has gone, the pending calls are dropped with a notice and the screen offers to create the file, as today.
  - **Our own echo:** our write's change event finds our text and does nothing.
  - **`tasksFile` changed** (by another device's settings) is handled like a file that has gone.
- **Tidy.** The core tidies inside its view reads (`ask` → `normalize`). The runtime calls `tasks.normalize` whenever the base changes or the core's day boundary passes (not midnight as such), before any view is drawn:
  - it adopts the answer's text and ids;
  - at the day boundary it enters the log as an entry with its own `nowMs`, so calls from before the boundary replay over a base tidied for the new day;
  - on a new base it runs before the replay and stays out of the log.
- **Readiness.** The runtime builds the replica only after the host is ready (P8): the layout is ready and Obsidian's metadata cache is resolved. It hands the door `projectsReady`, so the one move to projects never runs on an incomplete list (57562189).
- **Facts the door is told about its host,** added to `DoorContext` by `backend`; the app's defaults stay: `host` (the calendar choice carries over only on iOS, as `composeCore` does today), `feedProblems` (Google failing or silent, for the sources dot), `projectsReady`.
- **Core classes the door leaves to the host:**
  - `CalendarPolling` is run by the runtime over its ports, unchanged.
  - The quick entry's job order (`QuickEntrySession`) and the calendars' refresh rule (open, refresh, peek, the 15 s silence) have synchronous forms in the core: the job order as a step function over the door's `EntryAnswer`; the refresh rule as a pure decision the network lane asks, over the replica's calendar state. The rules stay the core's, never rewritten in the UI.
- **Calendars:** the network lane fetches events, latest wins per day, a superseded fetch abandoned. Their files go into the replica as data, cached first and fresh when they land.
- **Cost.**
  - Each door call today rebuilds its world: it parses the settings, builds the rules and identity, and parses and tidies the text. A view costs 2–3 ms on Max's file; a pure state change such as `endCarry` costs 1.6 ms.
  - `backend` adds a cross-call cache keyed by (text, settings reading, today). It covers the parsed document, the tree, the identity reading and the parsed settings, and state-only calls reuse it. **A write seeds the cache** with the document it produced, keyed by its new text, so the views that follow a write never parse again.
  - **The card's face is cached on exactly its inputs** (P9): the task's line, its child and description lines, the settings reading and today.
  - **`carryAt`** is called when the target under the finger changes, not on every move (as `CarryReport` does today).
  - **Budget tests** (stage 3a, §Migration): on the synthetic 30 KB fixture, warm, in Node on the reference machine, unthrottled: a view, a write and a carry step under 1 ms each; a state-only call under 0.3 ms; **a write plus the recompute of every view the main screen keeps (at most six) under 3 ms in all**, which is about 12 ms at 4×, leaving the render its share of 16 ms (P9). *Unverified: the fan-out figure is a target, first measured in 3a.*

**P4. Geometry is input.**
- **Sizes from the browser:** what only the browser knows enters the model as a message from an observer, never held back: text and card heights, the stage, the keyboard, the toolbar, scroll positions where something depends on them.
- **Everything else is computed** by the core's rules from the model, or executed by an engine (C2).
- **A frame has three phases, all before the paint:** render the end state; `measure` reads what changed; `motion` animates from the declared start to the measured end.
- **Leaving rows:** layout selectors skip them. A fold and the heights that depend on it are one transition (D76). A key that returns mid-fold revives its entry.
- **Cards off screen** carry `content-visibility: auto` (P9), so a card never drawn on screen measures at its intrinsic size (the one-line card's height token) until it nears the viewport; the measure engine's `ResizeObserver` reports its real size then. Motion measures only on-screen keys, and the carry's edge scroll brings a row on screen before it can be a target, so no decision reads an intrinsic size. *Unverified: that FLIP and the hit test never read a placeholder size is first proven in 3c1's matrix cells with two-line cards off screen.*
- No other code reads geometry.

**P5. Motion follows the change; a context change moves as a whole or not at all.**
- **Within one context:** a row moves only when its keyed position changed between two models (added, moved, removed, Undo), whether the change came from Max or from the file.
- **Across contexts:** no row moves on its own. Another project, mode or filter draws in place. A day or place change is one whole-region transition between two complete views (the day slide, the ribbon), as `screen.md` says.
- **Interactions declare their motions as numbered transitions:** the carried card, folds under a lift, room at a list's end, the drop and cancel flights, the panel slide, the divider snap, the keyboard ride. Each runs once.
- **Everything else** (a re-render, a measurement, a resize) applies in place.
- **The motion engine reports** `motionSettled(id)` or `motionInterrupted(id, at)`.
- **Continuous gestures** go through a transient channel. The input engine advances the one gesture machine (C2) and passes the live value (the finger's place, a glide's offset, a pinch's scale) to the motion engine, which applies it to the layout the same selectors computed. Only the machine's **semantic outputs** are messages: a lift, a target change, a step crossed, a drop, a cancel. So the model changes at the gesture's rate, never at the pointer's.

**P6. Interactions are layers; what moves pins what is under it; data never freezes.**
- **The stack:** a stack of modal layers (screen → select mode → full card → field → menu or sheet) plus at most one pointer gesture per window. It is a statechart, one for every place (the layers and gesture concerns); the carry is one statechart whatever is carried and wherever it lands (the carry concern).
  - Hand-offs are transitions: hold → drag; long press → pinch; one sheet to the next.
  - Escape and tap order are reads of the stack. The arbitration rules A16 are its table.
  - A tap during a swipe's settle does not stop it; the tap goes where it lands (`screen.md`).
- **Data applies at once:** the replica, the minute tick, settings.
- **Pins:** each layer and gesture declares the entities it holds. A change to one is a message to that layer:
  - a carried card deleted from the file fades and the carry ends;
  - a menu's task deleted closes the menu;
  - a field whose task was deleted keeps its text until commit, which then fails with today's notice;
  - pins hold ids, and a commit takes the task's current key, so a line Sync edited in place commits normally;
  - a pinned card's content (its face) updates inside the pinned layout; only its place waits;
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
- **Host CSS is scoped by a shadow root** (P9): the screen's lists and the window's layers render inside shadow roots that adopt only our stylesheet, so neither Obsidian's nor iPadOS's rules reach a card; `overflow-anchor` and `scroll-snap-type` `none` on the root; body classes are written only by `chrome`, which mirrors them onto each host.

**P8. Everything alive has an owner.**
- `ScreenHost` mounts, owns and disposes every engine, observer, subscription, scope and timer of a screen, the same for every place; `WindowHost` owns what spans a window's screens (§Architecture). An adapter (the leaf, a note, the settings tab) owns only its registration with Obsidian.
- Host readiness (layout ready, Sync loaded, metadata cache resolved) and teardown arrive as messages.
- **Teardown ends what is under way:** a carry gets `endCarry`, so no stale carry stays in device storage; a chunked draw under way is cancelled.
- **Unload:** Obsidian does not await `onunload` (a BRAT update unloads the plugin). The persistence queue, with its ability to replay, outlives the plugin object until it is empty, and nothing disposes it before that.
- **After the switch** the old `CalendarService` polling is not started; the network lane is the only fetcher.
- **A test** mounts and unmounts each adapter and `WindowHost` in each form, including mid-gesture and mid-chunk, and finds nothing left alive.

**P9. Every interaction commits within 16 ms at 4× CPU.** This is a budget on every main-thread task, on the phone view and the desktop, with 300 tasks: no interaction, first open included, has a task over 16 ms; a continuous gesture runs under 8 ms of script per frame. There is no 50 ms budget anywhere. Spike S2 measured what this takes (307 cards, 4× CPU, Apple M4 Pro, Obsidian 1.15.1 on Chromium 150): a cold render of a new context costs 75–80 ms, three fifths of it style recalculation against Obsidian's 5,077 rules, so no budget can be met by rendering faster; it is met by the architecture below.

- **The lists render inside a shadow root.**
  - The mount engine attaches an open shadow root to the screen's node and to the window's overlay node; the render engine draws into those roots only.
  - Our stylesheet (the `/* next */` part of `styles.css`) is one `CSSStyleSheet` per document, adopted by every root through `adoptedStyleSheets` (Safari 16.4 and later; Chromium). The `--tc-…` tokens stay on `body` and inherit into the roots.
  - The chrome engine mirrors `body`'s classes onto each host. The 29 rules written `body.<class> …` today become `:host(.<class>) …`; **never `:host-context()`**, which Safari lacks.
  - Measured: style recalculation falls 3.3× (48 → 14–15 ms for 2,772 elements); card pixels are identical to the light DOM's (S2, «Shadow root»).
  - **Obsidian's own editors and rendered Markdown stay islands outside the shadow root:** inside it, Obsidian's editor CSS does not apply, CodeMirror's focus is lost and the `[[` note suggestion does not open (S2). The editors engine mounts each island as a light-DOM child of the shadow host, projected into its row through a named `<slot>` the kit row renders, so it stands in the row's flow and the document's styles, focus and suggestions apply. *Unverified: S2 measured an island outside the root, not slotted; 3c1 proves the slot first. If slotting breaks Obsidian's editor, the island is placed over its row from measured boxes, as S2 ran it.*
- **Cards carry `content-visibility: auto`** with `contain-intrinsic-size: auto <the one-line card's height token>` (Safari 18 and later, complete in 26; P4 says what it means for geometry).
- **The place keeps its other contexts laid out.** `layoutOf` names the contexts a place keeps (on the main screen: the offered modes of the current filter that are not shown, and the day before and after; at most six; in a note: its other mode; on a settings list: none). Each is a need (P2) and a region of its own, stacked in the frame's one grid cell, hidden by `content-visibility: hidden` and `visibility: hidden` under the region's `is-shown` state (decision 34).
  - **Updated in the same loop on every write, with structural sharing**, so a reveal never shows an older replica. Sharing is mandatory: a one-card write re-renders 1.5–2.7 ms with it and 6–8 ms without, per kept context (S2).
  - **Revealing one is a state change.** Measured in the shadow root with `content-visibility: auto` cards: 11.4–15.3 ms on both forms (S2).
  - A kept context must have been laid out once before it is revealed cheaply: one mounted hidden from the start costs a full cold frame (S2). It is laid out once, in chunks, as it is drawn hidden. *Unverified: that a context laid out under `visibility: hidden` keeps its layout through `content-visibility: hidden` as a visible pass does; 3c1's mode-switch budget proves it first.*
- **Anything drawn new is drawn in chunks:** first open, a kept context, a filter or project change, a search's results, a neighbour. The render engine commits a region whose kit element carries `chunk` in steps: the first step at least the measured visible count plus a margin (the rows that fit the scroller's measured height at the one-line card height, plus `ChunkSpec.margin`; a first chunk of 30 measured both forms with no pop-in), then about 20 rows per frame (`ChunkSpec.perFrame`), each step **after** the frame on the time engine, never inside it. `view(model)` still describes the whole list; only the commit is spread. Measured: 13.7–16.0 ms longest, every card drawn in 119–129 ms (S2). Rows not yet committed have no box, so the hit test finds no target there until they are drawn.
- **First open** runs as separate tasks, each under 16 ms: the replica's first build, the first views, then the first chunk. *Unverified: the first build of the replica on a 30 KB file at 4×; 3c1's first-open budget proves it.*
- **Day and place neighbours** are kept contexts: drawn in chunks in the frames after a swipe settles, kept current with sharing. A swipe onto a drawn neighbour costs 3–14 ms per frame (S2).
- **One warm editor per screen.** Obsidian's title field costs 20–28 ms new and 53–63 ms the first time in a session (the spec's earlier "5–15 ms" was a bare `EditorView`); re-keying a warm one costs 9–11 ms (S2). The editors engine makes one title field and one description editor per screen, in the frames after the screen's first draw, and re-keys them to the next row on Enter, a typing pick or an opened full card; no interaction builds an editor. *Unverified: the description editor's re-key and the description peek's Markdown render; 3c2's full-card budget proves them.*
- **There is no idle.** `requestIdleCallback` is not shipped in iOS WebKit (S2: caniuse, MDN). The time engine's `afterFrame` (formerly `idle`) posts through a `MessageChannel` after the frame, falling back to `setTimeout(0)`; every chunk and every editor warm-up runs there, bounded by the same 16 ms.
- **The card's answer is split** (`R9` B1): a list answer is a positional list of `{ id, key }`; the face (`CardFace`: everything the card draws) is a core answer cached on exactly its inputs (P3). Cards take the id and the face; an act carries the id, and the key is resolved at commit (`tasks.keyOf`, as pins do). An insert at a list's top changes the keys below it and re-renders no card.
- **Every derived structure is memoised by one mechanism:** the selector memoiser of `ScreenHost` (C4), keyed on the identity of the model slices and answer parts a selector reads; `needs(model)`, `regionsOf`'s regions and `geometryOf` go through it, and a need's identity is a key built once from its kind and ids, never a serialisation (today's `ViewAnswers` stringifies every need's arguments, `ViewAnswers.ts:25`, and drops every answer on any new replica, `:40-45`).
- **The layout is split in three:** `layoutOf(place, root, chrome)` the concerns' parts; `regionsOf(model, parts)` what is drawn; `geometryOf(parts, measured)` the geometry. A change of `measured` (a scroll, a resize, edge scroll under a carry) rebuilds no region.
- **Every kit component is memoised on its props** by the one JSX runtime (`tc-jsx`, C1; S1 measured one card of three re-rendering); the render engine writes a custom property only when its value differs.
- **Motion measures only what its cause names.** A motion cause carries the keys it may move; the measure engine reads only those boxes.
- **Windowed lists stay rejected:** they need estimated heights for rows not drawn, which breaks P4, FLIP and the hit test, and they grow the window during iOS's momentum scroll. Chunks end within about 130 ms and `contain-intrinsic-size: auto` remembers real sizes.
- **Budget tests** (`tests/budget/` and `npm run e2e -- budget`, 300 tasks, 4× CPU, both forms, on the `--ui=next` production bundle): for each interaction, the longest task under 16 ms and the first changed frame the next frame:
  - first open; a filter or project change; a mode switch; a search keystroke; a day or place swipe and its landing (continuous: under 8 ms of script per frame); the minute;
  - a write by a tap (a menu pick, a drop's landing, Undo): it re-renders exactly the cards whose face changed, in every kept context (counted by the render counter);
  - a tap that opens a menu or the full card;
  - a typing pick and Enter: no editor built in the event;
  - **the pointer path:** a carry's pointer move sends at most one message to the store, and during a carry no list or card component re-renders but the target's indicator and the float;
  - P3's per-call budgets.

  *All of S2's numbers are Chromium's. WebKit's style cost and its `content-visibility` caching were not measured, and CDP cannot attach to Obsidian on iOS: the phone's frame rate is observed only in Max's phone checklist at the ★ (§Tests 8).*

## The one mechanism

P1–P9 say what the screen is. C1–C5 say how it is built **once**, and §Guarantee says what that rests on.

Revision 11 listed what is forbidden, and the list leaked (`R1–R3`). Revision 12 answered with type machinery against an author who sets out to defeat it (`R4`, `R5`). Revision 13 built as production teams do (report D) and stated its threat model. Revisions 14 and 15 close the natural routes at the level of rules that each say one thing:

1. **The UI decides nothing** (C3): its operations are an allowlist that can filter, find, map and compare, never compute, order or address by position; decisions come from the core as data.
2. **A read that selects behaviour has exactly one reader per layer** (C4), and a core answer is never a condition but where the core said it is one.
3. **Ownership is named exactly, and anything unowned is denied** (C1, C2, decision 34): host APIs per engine, door writes per concern, the gateway's exports as forwarding calls.
4. **A change that weakens a guard is visible; an addition the machine checks is not noise** (C5).

Each part says how it is enforced: by **construction** (the architecture has one place for it), by the **checker** (a rule of `uiRules`, each with its reject and accept fixtures, §Guards), by the **matrix** (it must be used everywhere it applies), or by the **trap** (an effect the plugin did not order fails the run).

**C1. One screen, pure by construction.**
- **One screen.** The whole UI is one root, `Screen` (`view/Screen.tsx`), of one model type, `Model`, changed by one message union, `Msg`, through one `update`. The main screen, a note's block, a settings list and every data surface (§Architecture) are that screen with a different `Place` (C4).
- **Projects by reference, in one direction** (built and run in S1). Four TypeScript projects, each `composite` with `declaration`, `emitDeclarationOnly` and an `outDir` of its own under `.tsbuild/` (gitignored), built with `tsc -b`; each consumes the one below as declarations, references followed transitively:
  1. **core** (`core/tsconfig.json`, today `noEmit` and extending the root: it becomes composite and extends `tsconfig.base.json`);
  2. **pure**: `screen/`, `model/`, `update/` (`tsconfig.next-pure.json`): `lib: ["es2024"]`, `types: []`, no DOM, Obsidian, Preact or CodeMirror, no JSX. A window, an element, an event, a hook or a timer cannot be named there;
  3. **kit**: `view/` but the real runtime (`tsconfig.next-kit.json`): the same libraries, `jsxImportSource: "tc-jsx"` resolved by `paths` to the kit's type view;
  4. **host**: `engines/`, `host/`, `view/jsx/jsx-runtime.ts`, `obsidian/runtime/` and the rest of `obsidian/` (`tsconfig.json`, the only file esbuild reads, so the bundle compiles the kit against the real runtime). The host, the leaf, is the only project that may be `noEmit`.

  Every project `extends` `tsconfig.base.json`, never the host. `npm run build`'s `tsc --noEmit` becomes `tsc -b` (S1: a `tsc -p … --noEmit` before the build fails with TS6305). Each project is its `include` roots, so the partition is by folder; a check finds every input of esbuild's metafile under exactly one project's roots. **Packages are denied by default:** `paths: { "*": ["./blocked/none"] }` in pure and kit sends every package a project does not name to `blocked/none.ts`, an **existing** file in no project's `include` (S1: a missing stub falls back to `node_modules` and leaks; an existing one fails with TS6307); `skipLibCheck` is off in pure and kit. A relative import leaving a project's roots (`../../node_modules/preact/…`, which S1 showed compiles) is refused by the checker (`roots`).
- **One JSX runtime that memoises** (S1). Every `.tsx` compiles against one runtime, `tc-jsx`. The kit's type view (`view/jsx/kit-jsx.ts`) declares `JSX.Element` as an opaque brand, `KitNode`, and the intrinsic elements the kit allows; the real runtime (`view/jsx/jsx-runtime.ts`, host) wraps each kit function component once in a `memo` kept in a `WeakMap` (`memo` from `preact/compat`; Preact 11.2.0's core has none) and holds the **one crossing** between `KitNode` and Preact's `VNode`: `cross()`, an overload pair with no cast, importable only by the runtime and the render engine (`reach`). Vitest does not read `paths`, so its config aliases `tc-jsx/jsx-runtime` and `tc-jsx/jsx-dev-runtime` to the runtime, which exports `jsxDEV`. The kit's type view is an allowlist of elements and closed attributes: no `style`, `on…`, `autofocus`, `tabindex`, `popover`, `draggable`, `contenteditable`, no `<a>`, `<button>`, `<input>`, `<select>`, `<textarea>`, `<form>`, `<dialog>`, `<details>` or SVG animation; `class` typed as the kit's `tc-n-…` or `is-…` literals; `role` and the `aria-…` attributes as closed values; **`key` typed `RowKey`**, a brand made only by the identity concern or from a core id, so an index is not a key (`R8` L7); **`vars`**, a closed prop of typed custom properties (`{ fill?: Fraction; tint?: Color }`, one entry per `--tc-v-…` name the CSS declares), written by the render engine only on a change, the one path from a model value to a per-element CSS value (`R8` F3: typed `attr()` is not in WebKit). Kit components are plain functions of their props (no `this` parameter). Measured cost of `memo`: +5.1 KB minified, already paid by slice 3.
- **Intents are typed data on kit elements.** A kit element that can move, take focus, scroll, be measured or be drawn in chunks carries a required prop for it: `motion`, `focus`, `scroll`, `measure` (a key, or `"none"`), `chunk` on a list, and a repeating motion its `ambient` (`"pulse"`, `"spin"`, `"none"`). Absence does not compile. The render engine turns them into data attributes the engines read.
- **The UI's own types are closed data.** `Model`, `Msg`, `Command`, the kit's props and `Layout` hold no function, `any`, `unknown` or index signature, and every discriminant is a string literal (`tests/types/closed.ts`, `AssertClosed<T>`). `Model` is deep-readonly. The core's answers are typed per door method by `DoorMethods` (stage 3a), never `unknown`.
- **No module state** in the pure and kit projects: a module's top level holds functions, types and literal data (`as const` over literals, checked recursively: no `new`, no call), and no property is written onto a function.
- **Messages route once; the root `update` is written by hand.** `Msg` is the union of each concern's own union; `ROUTES: { [K in Msg["kind"]]: Concern }` is total, and a kind in two unions does not compile (`Disjoint`). `update.ts` routes a message to its concern, delivers the **runtime broadcasts** (`viewsChanged`, `rebased`, `fileGone`, `minute`, `shown`, `hidden`, `chrome`, `toDevice`) to every concern, and holds the **cross-concern steps** explicitly, in the order they run, each a call of the owning concern's exported function.
- **Slice ownership** (checker): a field of the slice of concern `X` is constructed, spread or assigned only inside `update/X/`.
- **One fact, one field** (checker, not a type test: TypeScript's aliases are structural): every field of a slice is declared with a type declared in that concern's own `model/<concern>.ts`, or a primitive of the core's (`LocalDate`, a key); a field whose type is declared in another concern's module needs an import the checker sees, and fails. A fresh alias of the same base type is the structural reviewer's question (G9).

**C2. Engines: one per concern, named exactly.**
- **One engine per concern that touches the platform, one module each** (§The engine table). The table is data (`tests/guards/engines.ts`): each row's concern, modules, the **exact** packages it may import (`@codemirror/view`, never `@codemirror/*`), the **exact** declarations it may reach (Obsidian's per declaration: `Scope` in keys, `Menu.addItem` in registration, never "Obsidian"), and the event types it listens to. The checker resolves every name, member, alias and import to its declaration and allows a host declaration only in the module whose row names it. **Anything no row names is denied**: an event type (every DOM event type is owned, `mouse*`, `pointer*`, `drag*` and `touch*` by `input`), an npm package, an Obsidian declaration.
- **A deprecated API's recorded replacement is not a weakening** (`R8` F6). A row may record `replaces: "<declaration>"`; when the installed `obsidian.d.ts` marks the replaced declaration `@deprecated` and names the new one (`MarkdownRenderer.renderMarkdown` → `render`, `obsidian.d.ts:6066`), `guards:pin` classifies the row change as an addition.
- **No `any` in host code either.** In the host project an expression of type `any` may not be called or have a member read, and `as any`/`as unknown as` are refused. Obsidian's private APIs get one typed declaration file per engine row (`engines/<row>.private.d.ts`), the only place an ambient augmentation of `obsidian` may stand, inside the guards' closure.
- **Closed specs.** The motion engine runs an `AnimationSpec` per `MotionCause` and an `AmbientSpec` per `ambient` value; the scroll engine a `ScrollSpec` (`behavior: "instant"`; a glide a kind it steps frame by frame); the focus engine a `FocusSpec`; the editors engine an `EditorSpec`, the closed set of CodeMirror extensions it builds (no `autocompletion()`, no default keymap, no tooltip of CodeMirror's: a suggestion list is a kit layer fed by a core answer); the render engine a `ChunkSpec`. A new kind is a new variant of its engine's spec.
- **Class names belong to their owners.** A string literal holding `tc-n-` is legal only in the kit, `tc-m-` only in the motion engine, `task-calendar` only in the mount engine.
- **Engines execute; they do not decide** (`execute`, `R9` §4). An engine may use arithmetic, ordering and `Math` to execute geometry: a FLIP's inversion, a float at the finger minus its grab, a glide's step and its end, a pinch's distance, the edge-scroll speed from its depth, a chunk's size. What makes this safe is what an engine may **dispatch**: a `Msg` created in an engine is one of the closed `EngineOut` union, the gesture machine's outputs, a measurement or a lifecycle event, never a value the engine chose. A constant an engine compares with is an **execution tolerance**, a token of its closed spec (`AnimationSpec.minDelta` for a sub-pixel FLIP, `ChunkSpec.margin`, `ScrollSpec.settle`), compared only through one predicate, `beyond(value, t: ExecutionToken)` (`engines/tolerance.ts`); a bare number in an engine's comparison is refused (`R8` F2). Edge zones are measured: the measure engine makes each scroller's edge zones as `MeasuredShape`s from the edge-zone token; the machine reports only "in zone X", and the scroll engine computes depth and speed itself (`R9` §4).
- **The gesture is one pure machine.** `update/gesture/machine.ts` (press, hold, slop, flick, second press, dwell, pinch, edge zone; pure, unit-tested; grown from `recognizers/press.ts`) is the only recogniser. **One input engine per window**, held by its `WindowHost`, holds one value of the machine's state type and advances it only by calling the machine; it delegates presses across every screen of the window by their acts (reading `composedPath()[0]` across shadow roots), dispatches only the machine's semantic outputs to the screen they concern, and sends continuous values to the motion engine through the transient channel (P5). Timed steps (the hold, the second press, the dwell) are timers the machine arms through the time engine; the dwell's duration is the core's `PROJECTS_HOVER_MS` from `rules.constants` (`R9` H7), the hold and the second press design tokens. Every other engine, `ScreenHost` and `WindowHost` hold only `readonly` handles; a mutable binding in the host project's engines and hosts has a handle type or a machine-state type (the input engine's gesture state, the render engine's `ChunkState`).
- **`preventDefault` is decided synchronously,** from the machine's state as it stands after the event's own pass: dispatch inside an event is synchronous (P2).
- **Engines see through shadow roots; pure code is unaffected** (S2). Focus is read and moved through `getRootNode()` (`ShadowRoot.activeElement`, never `document.activeElement`); what is under a point is asked of the root (`shadowRoot.elementFromPoint`); a listener on the document or window reads `composedPath()[0]`, never `target`; keys reach Obsidian's keymap with the host as their target, which is what the keys engine's `Scope` handles, while an island's field is Obsidian's own and is seen as such.
- **Libraries come in through one engine, configured by a closed spec.** CodeMirror lives only in `editors` (`EditorSpec`); `MarkdownRenderer` only in `editors`. Obsidian's `Menu` and `Modal` are **not constructed** by the screen: every menu and sheet is a kit layer in the one layer stack; the registration row may only add items to the `Menu` Obsidian hands to `file-menu` and `editor-menu` (`menu.addItem`, checked in `obsidian.d.ts` 1.14.4). Obsidian's `Setting` and, for the tab's confirmations, `Modal` live only in the settings chrome row (`R8` F5: the tab is Obsidian's chrome, §The settings tab).
- **Repeating work has one home** (`rearm`, `R8` L3). The checker builds the graph message kind → the timer commands its handler issues → the kinds those timers deliver, over every pure handler, and refuses **any cycle**, not only a timer re-arming its own kind. A ticking display reads the runtime's clock, which broadcasts at declared granularities (`minute` today; a new granularity is a new broadcast, an addition), or is an `AmbientSpec`.
- **The frozen table freezes concerns and engines, not file names.** Any change to a row is a weakening change (C5) but a recorded replacement of a deprecated declaration. Pure code is organised by concern (`update/<concern>/`, any files).

**C3. The UI decides nothing.**
CLAUDE.md's rule (the UI gets the decision ready and only draws and turns gestures into places) becomes an **allowlist of operations** in pure and kit code, checked by type with no dataflow tracking (`noCompute`; run on today's code in S1: 0.2 s for the whole folder):
- **Allowed:** the array methods `map`, `filter`, `find`, `some`, `every`, `includes`, `flatMap` and `join` (callbacks of one parameter: no index parameter); `===` and `!==`; the logical operators on booleans; a literal index (`xs[0]`, `slice(1)`, `-1`); `.length` read to draw it or to compare it with a literal (`xs.length === 0`); template literals; calls of the project's own functions, of `screen/seq.ts`, `screen/text.ts`, `screen/records.ts`, the gateway and `screen/predicates.ts`.
- **Refused, everything else**, and by name: anything that **reorders** (`sort`, `toSorted`, `reverse`, `toReversed`, `localeCompare`, `Intl.Collator`); anything that **accumulates** (`reduce`, compound assignment, `++`, `--`); anything that **addresses by a computed position** (an index from a variable, `at`/`slice`/`splice`/`with`/`fill` with a non-literal, `indexOf`, `findIndex`, `findLast`, an index callback parameter); **state-carrying `let`, `for`, `while` and `do`** (pure code is `const` and expressions); arithmetic and ordering on a number; `Math`, `Date`, `Number`, `parseInt`, `parseFloat`, unary `+`; any other built-in method, and `new` of a built-in; string methods outside `screen/text.ts`. Sequence numbers (a transition's number, an editor's replace sequence) are stamped by the store on each loop, never incremented in pure code.
- **Plumbing has two modules** (S1, `R9` §4). `screen/seq.ts`: `first`, `last`, `isMany` (more than one), `sameSeq(a, b, eq)`, `zip`, `after(xs, pred)`, `splitWhere(xs, pred)`, `numbered(xs)` (an ordinal to draw). `screen/text.ts`: `stripPrefix(s, prefix)`, `splitOnce(s, sep)`, and the string helpers the kit draws with. Both are exempt from `noCompute`, in the guards' closure, and each export has its accept and reject fixtures; a `seq` export accepts no geometry type and no number field of a core answer (checker). S1 rewrote two of slice 3's sites with them: 8 hits became 0, and the code was shorter. Emptiness needs no helper (`xs.length === 0`).
- **Decisions come from the core through the gateway, as data.** `screen/rules.ts` is the UI's one module that reaches the core's values, and **each export is exactly one forwarding call**: its body calls one imported core function with its parameters passed through unchanged (`gateway`, an AST shape, `R8` L8). Such an export is a machine-checked addition, pinned silently; anything else in the gateway is refused. What the UI computes until now becomes a core rule `backend` adds in stage 3a, each named with its file and line in §Migration: S1's 58 decision hits at 31 places, `R9` B5's list, and the timeline's in stage 4. A threshold that decides an **outcome** (a flick that commits, a card swipe that postpones, a snap, the hover-open's dwell) is a core rule's own constant, reached only by calling that rule or through `rules.constants`.
- **Gestures decide only whether they are gestures yet.** `screen/predicates.ts` (exempt, in the closure, its five exports frozen: a change is a weakening) gives the gesture machine the only comparisons on geometry in the UI: `exceeds(d: Distance, t: GestureToken)`, `within(p: Point, s: MeasuredShape)` and `axis(d: Delta): "x" | "y"`, and two measures, `delta(a, b)` and `distance(a, b)`, whose results pure code can only hand to a predicate or a core rule. A `GestureToken` is made only in `screen/tokens.ts`, from the press slop, the one gesture token in pixels; the same module holds the hold's and the second press's durations, which pure code only hands to a timer command (C2); each equals its CSS token (`--tc-gesture-…`, checked by `styles.test.ts`). The edge zone is the measure engine's. The geometry types (`Px`, `Ms`, `Point`, `Distance`, `Delta`, `Velocity`, `MeasuredShape`) are declared in `screen/geometry.ts` (types only) and made by the measure and input engines. Which list or row is under the finger is `within` over the measured boxes; where in it a card lands is the core's (`placeAt`, `levelAt`, `gapAt`, `nearestSlot`…).
- **The same rule holds wherever answers or control values are handled** (`answers`): `obsidian/runtime/dispatch/` (a need is exactly one door method; **no branch on a need's kind at all**: the parts a need reads and its identity come from `DoorMethods`' `reads`, and one generic cache uses them, so a new need is a `DoorMethods` entry and nothing else, `R8` L9; identity equality on replica parts and need ids is allowed, `R9` M2), `host/settings.ts` (it draws the door's settings view, `settings.page`, and sends raw control values to `settings.*`; no comparison or branch on an answer's value but an exhaustive `switch` on a row's kind), `host/registration.ts` and `host/adapters/`. The runtime's own mechanism (the queue's bounds, generations, the replay's limit, the network lane's silence) is P3's and keeps its named constants.
- **The swipe lands once.** `tests/guards/swipeOnce.test.ts`, naming Max, asserts at model level that in every swipe cell the place the model lands on equals `rules.swipeLanding` for that swipe's inputs; the e2e recorder fails a swipe resting two places away; `tests/application/swipeLanding.test.ts` stays as CLAUDE.md protects it.

**C4. A read that selects behaviour has exactly one reader per layer.**
- **A core answer is never a condition in the UI** (`answerOps`, `R8` L5). In pure and kit code, an expression whose type is declared in `core/` may not be the operand of a condition (`if`, `?:`, `&&`, `||`, `!`, `switch`, `===`, `!==`) nor what a predicate callback of `filter`, `find`, `some` or `every` returns, with three exceptions: the core's **decision records**, listed in `tests/guards/readers.ts` (`can.*` and `marks.*` today); a `kind` discriminant; and a **presence test** of an optional value (`=== null`, `=== undefined`, `?.`, `??`), which draws what is there. A place fact of a core answer (`filter.clearable`, `panel`, `topRow`, `plus`, `ViewChoice.*`, the root answer's `kind`) is read only by its one reader below. This retires `tests/uiDecides.test.ts`'s regex list for `next/`: a new answer field is covered the day it exists. Adding a decision record is a weakening; it is added in the core, where the decision is made.
- **A selector of behaviour is a type, read in a condition by one module per layer** (`oneReader`, `R8` L6, `R9` H9). Each variant's closed union is declared once, as a type alias in its concern's `model/<concern>.ts`; the checker keys a read on the alias of the condition's operand type (`aliasSymbol`, exposed by `typescript/unstable/sync`, `dist/api/sync/api.d.ts:427`; *declared, not yet run: proven first in 3b1*), so a prop, a destructured local and a copy count as the same selector. `tests/guards/readers.ts` records, per alias, **one module in `update/<concern>/` and one kit component** (the pure behaviour and its drawing); a third reader fails, and a structurally equal literal union declared elsewhere fails (`closed.ts`). `Place`, its fields and the chrome's place facts (`form`, the keyboard, the toolbar) have one reader in all: `screen/layout.ts`; the pointer's kind: the gesture machine. **Every field that comes from settings is a selector of behaviour** with one reader per layer. Passing a value along is not a read; a condition is.
- **`Layout` is split by concern, and the router hands each concern only its part:** `handle(model, msg, parts[concern])`. `layoutOf(place, root, chrome)` derives the parts from the place, including the contexts the place keeps (P9); `regionsOf(model, parts)` derives what is drawn (the open field, the carry's waiting place, the layers, the pins, the kept contexts); `geometryOf(parts, measured)` the geometry. The model holds no `Layout`.
- **One selector memoiser** (`R8` F1). Selectors are declared as data, `{ reads: [the slices and parts], fn }`, pure; `ScreenHost` memoises every declared selector by the identity of what it reads (`needs`, `regionsOf`'s regions, `geometryOf`, a card's face lookup). Pure code holds no cache.
- **Real alternatives are closed variants**: `search.reveal: "clearFilter" | "openFull"`, `search.dayOfFind: "moveDay" | "openFull"`, `context.writesPlace: "write" | "keep"`, `carry.device: "report" | "silent"`, `full.projectTap: "closeAndFilter" | "close"`, `entry.bar: "keyboardBar" | "capsule"`, `entry.placeMoves: "follow" | "stay"`, `scroll.chain: Scroller[]`, `keys.policy: "tab" | "focus" | "none"`.
- **A door write is built only by its owning concern** (`owners`, `R8` L4). `tests/guards/owners.ts` maps every door method whose `writes` is not empty to one concern (`{ [M in WriteMethod]: Concern }`, total by type): `tasks.create*` and the entry's steps to `entry`, the carry's steps to `carry`, `settings.*` to the settings tab, and so on. A command carrying a write method is constructed only in its owner's folder; another concern that needs the write sends the owner's message (a search's "Create task" opens the entry with the query, it does not create). Adding a method with its owner is an addition; changing an owner is a weakening. Focus, scroll and motion requests stay open to every concern (one execution engine per kind, below).
- **Writes of device state need a capability, derived from data.** Device state is every key of `SETTINGS_FILE.device` (`obsidian/settingsFile.ts`) and the projects screen. `DoorMethods` marks each method's `writes` as a list of parts (`"tasks"`, `"settings"`, `"device"`; a drop can write the tasks and the device at once, `R9` M3), and a `placeWrite` command, the only command that can carry a method whose `writes` holds `"device"` or a device patch, requires a `PlaceWrite` value; `PlaceWrite` is made only in `screen/layout.ts`, and `layoutOf` puts it in the parts of the places that may write (absent in a note). The runtime checks it again by data: an answer that changed a device key or the projects screen for a screen holding no `PlaceWrite` is not adopted, and the trap reports it. A note that should act on the main screen (a menu's "Show on the main screen") sends a `toDevice` intent to its `WindowHost`, which hands it to the main screens, and each writes with its own `PlaceWrite`. The note's matrix cells assert every device key and the projects screen unchanged **by writes made with the note's own capability**; the `toDevice` cell has its own expectation: the main screen changed (`R9` M1).
- **Execution is one per kind.** Several concerns legitimately ask for focus, a scroll or a motion; one engine runs each kind, in one phase of the loop, the focus engine taking the topmost layer's request when two arrive in one loop.
- **The matrix compares like with like** (G5): one concern's logs across the cells whose variant values are equal, projected onto key roles.

**C5. Guards: checked, tested, and every weakening visible.**
- **The guards' closure** (`guards/manifest.json`) holds the hash of every guard file: everything `npm test`'s guard project, `npm run build`, `npm run release` and `npm run e2e` load or read, **minus** the product's own inputs (the metafile's), **plus** every file a rule exempts or names by path (the gateway, `screen/layout.ts`, `screen/tokens.ts`, `screen/geometry.ts`, `screen/predicates.ts`, `screen/seq.ts`, `screen/text.ts`, `screen/records.ts`, each `engines/<row>.private.d.ts`, `engines/tolerance.ts`, `view/jsx/`; the checker emits that list). It is **recorded**, in the form S3 ran:
  - **Vitest** (the guard project, and the budget project's config too): a Vite plugin records `load` and `transform` of every module and, through `configResolved`, `configFileDependencies` (the config and what it imports), with `test.fsModuleCache: false` (in Vitest 5.0.5 a top-level option, default `true`: a warm run records nothing); a setup file wraps `fs` and `fs/promises` (`readFileSync`, `readFile`, `existsSync`, `statSync`, `readdirSync`, `openSync`, `createReadStream`) and calls `syncBuiltinESMExports()`, so the fixtures, `rows.json`, `styles.css` and every file a test reads are recorded; a `globalSetup`, if one is added, wraps `fs` too.
  - **Plain Node scripts** (`guards:pin`, the release script, the e2e harness): `node --import guards/node-closure.mjs`, which installs **`module.registerHooks`** (synchronous; Node 22.15 and later, present in 22.22) and the same `fs` wrap. `module.register`, which revision 14 named, misses `require()` and every `fs` read (S3).
  - **The build:** the metafile's inputs plus the Node hook's log over `esbuild.config.mjs` (its plugins and what they read are not in the metafile).
  - `node_modules/` and Vitest's snapshot probes are filtered; the lockfile is in the closure. **The pin refuses an empty recorded closure.** The floor files (`guards/mutation-floor.json`, `guards/coverage-floor.json`) are read by the release but explicitly excluded: they are ratchets, below.
  - The guard tests are their own Vitest project (`tests/guards/`, `tests/types/`, `tests/matrix/`, `tests/uiRules*.ts`, `tests/styles.test.ts`, `tests/architecture.test.ts`, `tests/uiDecides.test.ts`, `tests/hostLifecycle.test.ts`, `tests/budget/`, `tests/e2e/`, the tests that name Max); an ordinary unit test is product, not a guard. The manifest is not part of its own closure.
- **The reference** a change is classified against is the manifest at the previous stage's merge on `ui-refactor`, recorded as a tag (`ui-refactor/stage-3a`, `…-3b1`, …); after stage 7, the manifest at the last release tag and at master's head (`R9` B2: until stage 7, master and the release tags predate the guards).
- **Pinning classifies.** `npm test` and `npm run build` fail when a closure file differs from the manifest. `npm run guards:pin` compares the change with the reference and splits it:
  - **additions the machine checks** are pinned silently: a new row of `rows.json` with its scenarios, a new matrix cell, a new reader for a new alias, a new fixture, a new gateway export of the forwarding shape, a new write method with its owner, a folder added to `ported`, a recorded replacement of a deprecated declaration;
  - **weakening** is printed, written into the commit message and into the release notes: a row or cell removed, a cell turned `notOffered`, a scenario's assertions fewer, a row of the engine table added or changed, a reader moved, an owner changed, a decision record added, a folder removed from `ported`, a rule's code, an exemption, a config, a dependency.
- **The rules apply to a growing `ported` list from the first stage** (`guards/ported.json`, `R9` B4). Every rule runs on product code from 3b1, over the folders on the list: a folder joins it when its concern is written or ported (the `screen/` folder in 3b1; each concern's folders in 3c1 and 3c2). No stage ends with a switch.
- **Visibility.** Before a merge the lead reports every weakening change to Max in product words ("the rule that keeps a note from writing the main screen's state now also lets the note change the zoom: …"). This informs the owner that a protection changed; it is not asking him how to write tests. A fresh structural reviewer per stage (G9) reads the diff and the weakening changes.
- **Mutation testing** runs over the guard code with Stryker's Vitest runner and **no checker** (TypeScript 7.0.2's package exports no classic compiler API, only `typescript/unstable/*`). S3 ran `@stryker-mutator/core` and `vitest-runner` 10.1.1 against Vitest 5.0.5 and Vite 8.3.5: they install only with `npm i --legacy-peer-deps` (npm 10.9.4 crashes on Vitest 5's peer set), and the runner has no project option, so Stryker gets a Vitest config holding only the guard project (`vitest.guards.config.mts`). It runs incrementally (4 s full, 1 s reused on S3's toy), apart from `npm test`. *Unverified: its cost on `uiRules`, whose fixtures run through `tsgo` over RPC; 3b2 proves it.* Its floor (`guards/mutation-floor.json`) is a ratchet: the run fails under it, the release fails if it fell since the last tag.
- **Coverage is a ratchet too.** The pure project's line, function and branch coverage over the model-level matrix may only rise (`guards/coverage-floor.json`), and every `Msg` and `Command` kind is exercised by some scenario. No gate waits on 100 %.
- **No escape hatches** (checker, every scanned file): no `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `jscpd:ignore`, `eslint-disable`, `Stryker disable`; no `.skip`, `.only` or `.todo`; no triple-slash directive; no ambient declaration outside `view/jsx/` and the engines' private declaration files. In the pure and kit projects: no `as` but `as const` and the **brand constructors**, each in the one module that may make its brand (`PlaceWrite` in `screen/layout.ts`, `GestureToken` in `screen/tokens.ts`, `RowKey` in the identity concern's `update/identity/keys.ts`); no `any` (annotation or an expression of type `any`, `JSON.parse` included); no `this` parameter. `screen/records.ts` gives typed `keys`, `entries` and `fromEntries`.
- **The scope is the bundle.** The checker opens each of the four projects (S1: opening one loads its references' sources, so the guards need no `tsc -b` first) and reads every input of esbuild's metafile that is not in `node_modules`; an input that is not `.ts` or `.tsx` under a project's roots is refused. Outside `obsidian/` that is `core/`, under its own architecture rules. `obsidian/ui/next` may not import the old UI, nor the old UI the new.
- **The trap runs on the bundle that ships.** `npm run build -- --ui=next` makes the production-mode bundle (the release's esbuild options, `UI` defined `next`) into `.e2e/next/main.js`; only `npm run release` refuses `next` before stage 7, so from stage 3c1 the matrix, the trap and the budgets run on the release recipe. **Every seam is in `hostServices` and ships inert** (the clock, `Http`, `outside()`, `window.open`), reached by the injected script through one declared global the host-services row owns. The harness arms them over CDP, in the form S3 ran: on the **browser-level** session (`/json/version`), `Target.setDiscoverTargets` and `Target.setAutoAttach({ autoAttach: true, waitForDebuggerOnStart: true, flatten: true })`; on each `Target.attachedToTarget`, `Page.addScriptToEvaluateOnNewDocument({ source, runImmediately: true })` and `Runtime.runIfWaitingForDebugger`. It resumes **every** waiting target, not only pages (service workers and others wait too, and an unresumed one hangs), installs idempotently (auto-attach re-attaches existing pages), and stays responsive: while it waits, every `window.open` in Obsidian waits. S3 showed the trap in a popout's realm before `window.open` returned, in Electron 39 and Chrome 157. *Unverified: Obsidian's own popout path; 3b2's self-test cell opens a popout and requires its "armed" report.* Coverage comes from CDP's profiler. The e2e build that holds both UIs (decision 37) remains only for the old-against-new comparison until stage 7.
- **The effect ledger judges the screen's own subtree.** In each frame, every scroll-offset change of a scroller in the screen, every focus move within it, every new animation on one of its nodes and every style, class or attribute mutation of one of its nodes must be explained by: a command its engine ran in that loop; a user's input on that scroller in the last 1 s (a wheel, a touch, and the momentum and rubber band after it); a clamp (the scroller's `scrollHeight` shrank); or, for a style or class, the render or motion engine's write whose model change came from input, a door answer, a broadcast or the minute. An effect inside an editors island, or inside an adopted settings row's Obsidian controls (they change their own classes, `R9` M4), is the library's; focus leaving the screen for Obsidian's own UI is not the screen's. The ledger observes each shadow root as well as the light DOM.
- **jscpd** (5.4.3, threshold 0, the default 50 tokens; installed in 3b2, run in 0.6 s on today's `next/`) is a backstop. It finds three real clones today, each fixed in stage 3c: Obsidian's editor interfaces declared twice in `drivers/islands.ts`, `LINE_COMMANDS` in both `drivers/islands.ts` and `drivers/keys.ts` (3c1), and the carry-start record built twice in `update/carry.ts` (3c2).

**The settings tab.** It keeps Obsidian's own chrome and look (the design excepts Obsidian's chrome, and a rework keeps today's behaviour): `host/settings.ts` builds it from Obsidian's `Setting`, its toggles, dropdowns, sliders, colour wells and buttons, from the door's settings view (`settings.page`, added by `backend` in stage 6), registers no key scope, sends raw control values to `settings.*`, and reaches the clipboard, Google's sign-in and the Scriptable loader through `hostServices`. A confirmation the tab needs (a reset to defaults) is Obsidian's `Modal`, built only by this row (`R8` F5). Only its three reorderable lists (priorities, labels, presets) move rows, and they move them with **the one carry and the one motion engine**: each list mounts one `ScreenHost` at `Places.rows(list)`. That place's `Layout` has one region, `adopted`: the mount engine **adopts** the rows Obsidian's `Setting` drew (it tags each with its row's key and its grip with an act), so the measure, input and motion engines work on them as on any kit element, and the screen draws nothing of its own (so it needs no shadow root). The carry's payload is `settingsRow`, its look `self` (the row follows the finger, the others step aside: the motion cause `stepAside`), and its grip starts the carry on a press with no hold (`settings.md:9`). The drop's door call (`settings.move…`) runs when the drop's flight settles, so the settings change that makes the tab redraw comes after the motion. **Obsidian's `display()` rebuilds the tab's DOM:** each time it runs, the adapter disposes the lists' `ScreenHost`s and mounts new ones on the new rows (no carry is under way then), and the tab scrolls in Obsidian's `.vertical-tab-content`, the first scroller of its `scroll.chain`. Keys: `keys.policy` `none`.

## Architecture

```
tsconfig.base.json             the options every project extends
core/tsconfig.json             project 1 (composite)
tsconfig.next-pure.json        project 2
tsconfig.next-kit.json         project 3
tsconfig.json                  project 4, the host (esbuild reads it)
blocked/none.ts                the stub every unnamed package resolves to; in no project
.tsbuild/                      the projects' declarations (gitignored)
obsidian/ui/next/
  screen/      layout.ts     Place, Places, PlaceWrite; layoutOf, regionsOf,
                             geometryOf → the Layout parts; the place's kept contexts  pure
               rules.ts      the gateway: one forwarding call per core rule           pure
               predicates.ts the five gesture predicates and measures                 pure
               geometry.ts   the geometry types (no functions)                        pure
               tokens.ts     the gesture tokens: slop, hold, second press (= CSS)     pure
               seq.ts        sequence plumbing: first, last, isMany, sameSeq, zip,
                             after, splitWhere, numbered                              pure
               text.ts       string plumbing: stripPrefix, splitOnce…                 pure
               records.ts    typed keys, entries, fromEntries                         pure
  model/       Model, Msg, Command, the broadcasts, each concern's slice and
               variant types                                                          pure (types)
  update/      update.ts (the router, the broadcasts, the cross-concern steps);
               <concern>/ any files; gesture/ (the machine); identity/ (RowKey)       pure
  view/        Screen.tsx; kit/ (the kit's components)                                kit
  view/jsx/    kit-jsx.ts (the type view, KitNode)                                    kit
               jsx-runtime.ts (the one runtime: memo, cross)                          host
  engines/     one module per engine (§The engine table); tolerance.ts;
               <row>.private.d.ts                                                     host
  host/        WindowHost.ts; ScreenHost.ts (the loop, the selector memoiser);
               adapters/leaf.ts, note.ts; settings.ts; registration.ts                host
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
export function layoutOf(place: Place, root: RootAnswer, chrome: ChromeState): LayoutParts;      // the concerns' parts and the kept contexts, from the place
export function regionsOf(model: Model, parts: LayoutParts): Regions;                            // what is drawn: lists, kept contexts, the open field, waiting places, layers, pins
export function geometryOf(parts: LayoutParts, measured: Measured): LayoutGeometry;              // the parts that read `measured`
```

Report C's `sheets` is left out: a sheet (the full card, the search) mounts over the screen's own frame in every place, as today (decision 52).

**`Layout`**, one part per concern, each handed only to its concern by the router: `regions` (`regionsOf`'s, to `Screen`: what is drawn, in order, each region memoised by the selector memoiser), `root` (the view need, the kept contexts and `modeWrite`, data), `carry` (targets, the device variant, the look per payload, the `PlaceWrite` where the place may write), `scroll` (the scroller chain, inner first), `search`, `context`, `full`, `entry`, `keys`, `door` (the facts handed to the core). Geometry is `geometryOf`'s, kept apart so that a scroll or a resize rebuilds no region (P9). A place without a project (a note not attached to one) has a `Layout` with no regions: the screen draws nothing.

**The one loop, run by `ScreenHost`:** an engine's message → `update` (the router, a concern's handler with its `Layout` part, the cross-concern steps) → the runtime's door calls (P2) → `needs(model)` (memoised) → **measure first** (the boxes of the keys the loop's motion causes name, one layout read before anything is written: a FLIP's "first") → render `Screen` (a new region's first chunk only, P9) → `editors` (a warm island re-keyed into, or out of, the slot the render made, inside the same event, so a typing pick's field exists before focus) → **measure last** (the same keys again, and what the observers report) → `motion` (from first to last) → `scroll` → `focus`. The same for every place. No box is kept between loops but the measured geometry the model holds (P4); the old driver's map of every row's box goes. The remaining chunks commit after the following frames, each through the same render engine.

**`ScreenHost`** (`host/ScreenHost.ts`) is the one controller of a mounted screen: it opens the session and the one store, completes the place's seed with the form, runs the loop's draw order, memoises the declared selectors, hands each command to the one engine its kind names (a total table over `Command["kind"]`), checks each `placeWrite` against the place's capability (C4), registers with its window's `WindowHost`, and passes each engine's messages to the store. It holds no state but `readonly` handles. **Its public surface is frozen to lifecycle intents:** `mount(target, seed)`, `renamed(path)`, `shown()`, `hidden()`, `command(c: HostCommand)` (a closed union: `undo`, `redo`, `find`, `newTask`), `dispose()`; and, toward its `WindowHost` only, two questions: its carry targets' measured shapes and whether it took the last input. No `dispatch` and no `Msg` reach an adapter.

**`WindowHost`** (`host/WindowHost.ts`), one per window realm, owns what spans the screens of a window, so no screen reaches another, and **holds only a read-only set of `ScreenHost` handles and its handles to the window's engines** (`R9` H6): the window's **input engine** (one gesture per window: outside presses, the active screen as the one the machine last pressed in, the carry across screens), the **frame clock** (the time engine's `onFrame` bound to that window, so a popout's motion never waits on an occluded main window; the minute stays the runtime's), the window's overlay root (through `mount`), and the **`toDevice` intents** a screen without `PlaceWrite` sends, handed to the main screens, each writing with its own capability. The carry across screens: at the lift the input engine asks the window's screens for their measured carry targets, the machine's hit test finds the target among them, and the drop is the target screen's door call with its own `PlaceWrite`. (A drag from a note onto the main screen's calendar is not part of this refactor's product; it has this home when Max asks for it.)

**The adapters** register with Obsidian and nothing else. `host/registration.ts` holds the plugin's registrations (`registerView`, `addCommand`, `addRibbonIcon`, `registerObsidianProtocolHandler`, `addSettingTab`) and **the workspace's events**, each turned into a lifecycle intent of the screens it concerns. A command declares **no default hotkey**; its callback hands a `HostCommand` to the window's active screen, where it enters the keys concern as a key intent and passes through the same key table and `keys.policy` as a key press. **Data surfaces** Obsidian offers (a status bar item through `addStatusBarItem`, `obsidian.d.ts:7172`) mount a `ScreenHost` at a place of their own (`Places.statusBar()`, an inline frame with one region); items in Obsidian's own file and editor menus are added through `menu.addItem` on the `Menu` the `file-menu`/`editor-menu` events hand in, their callbacks `HostCommand`s. The events: `layout-change`, `active-leaf-change` and `file-open` mount, unmount, show or hide a note's screen; `vault.rename` is `renamed(path)`. The window's `resize` is the chrome engine's, a screen's own size the measure engine's `ResizeObserver`. `host/adapters/leaf.ts` (an `ItemView`) mounts one `ScreenHost` per leaf at `Places.main()`. `host/adapters/note.ts` (a `MarkdownRenderChild`) mounts **one `ScreenHost` per Markdown view**, at `Places.note(path)`; whether the note belongs to a project is the root answer (the core's project-note index, P3), and a note that does not draws nothing. Live Preview and Reading re-rendering around the screen, and the status bar's room, are the mount engine's `MutationObserver`. The mount engine places the screen's node among Obsidian's (a leaf's content; after `.cm-contentContainer` or first in `.mod-footer`) and attaches its shadow root.

**Accessibility** has owners like any concern: kit elements carry `role` and the `aria-…` values as closed props, drawn by the render engine from the model; keyboard reach is the keys concern's table; the focus engine alone writes `tabindex`, as a roving index on the focused key. A `forced-colors` token block (decision 34) gives high contrast its colours. VoiceOver reads what the render engine wrote; nothing else writes it.

**Preact 11, TSX.**
- It is checked by TypeScript 7 and bundled by esbuild as is (S1). Svelte is rejected: `svelte-check` needs TypeScript ≤6, and its `animate:flip` infers motion from geometry.
- A user's event renders synchronously (the runtime flushes Preact's `debounceRendering`); S2 rendered Preact into a shadow root unchanged.
- Preact is reached only by the render engine and the one JSX runtime (C1).

**Picks.**
1. **A write pick** runs its door call at the tap. The list's change shows when the sheet's close settles (P6 pins the layout under the closing sheet).
2. **A typing pick** renders, re-keys the warm field into its slot and focuses it inside the tap.
3. **A hand-over** is one layer transition.

**Undo** is a door call like any other: instant, its result visible at once, with `canUndo` from the replica's history.

## The engine table

The frozen set, kept as data in `tests/guards/engines.ts` and read by the checker. One row per engine: the concern it serves, its modules, the exact packages it may import, and the declarations only its modules may reach (named one by one in the data; grouped here for reading). An event type, a package or a declaration no row names is denied. Concerns with no engine (layout, carry, search, sections, selection, full card, context, entry's rules, the layers' stack, the gesture machine, identity) are pure concerns under `update/<concern>/`; they reach the platform only through the commands these engines run.

| # | Engine | Module | Packages | Declarations only it reaches | Serves |
|---|---|---|---|---|---|
| 1 | **Render** | `engines/render.ts`, `view/jsx/jsx-runtime.ts` | `preact`, `preact/compat` (`memo`, `createPortal`) | Preact's `render`, `jsx`, `memo`; `cross()`; drawing into the screen's and the overlay's shadow roots; the chunked commit (`ChunkSpec`, `ChunkState`); static custom properties and `vars`, written only on difference; `role`/`aria-…` from kit props | the screen and the kit; layout's regions and kept contexts; every kit component memoised by `tc-jsx` |
| 2 | **Motion** | `engines/motion.ts` | — | `Element.animate`, `getAnimations`, the transient channel's variables, the `tc-m-…` classes; CSS motion only under `tc-m-…` | motion: one `AnimationSpec` per `MotionCause`, one `AmbientSpec` per `ambient` value |
| 3 | **Measure** | `engines/measure.ts` | — | `getBoundingClientRect`, `getClientRects`, `offset…`/`client…`/`scroll…` reads, `getComputedStyle`, `ResizeObserver`, `IntersectionObserver`, `scroll` listeners; makes `Px`, `MeasuredShape` and the edge zones | measurement; the boxes motion asks for |
| 4 | **Scroll** | `engines/scroll.ts` | — | `scrollTo` (`behavior: "instant"`; glides frame by frame on the time engine), `scrollTop`/`scrollLeft` writes | scroll: reveal, hold, edge scroll (its depth and speed), glides, the chain to a note's or the settings' scroller |
| 5 | **Focus** | `engines/focus.ts` | — | `focus({ preventScroll })`, `blur`, `getRootNode()`'s `activeElement`, `tabindex` writes, `focus*`/`blur` listeners | focus, taken last in the loop |
| 6 | **Keys** | `engines/keys.ts` | `obsidian` | Obsidian `Scope`, `Keymap`, `key*` listeners | keys: the key table is the keys concern's (pure) |
| 7 | **Input** | `engines/input.ts`, one per window | — | the `pointer*`, `mouse*`, `touch*` and `drag*` families, `wheel`, `click`, `dblclick`, `contextmenu` listeners on the window and its screens' roots, `composedPath()`, a shadow root's `elementFromPoint`; `setPointerCapture`; `preventDefault`; holds the gesture machine's state (C2); makes `Px` and `Ms` | input: the machine is the gesture concern's (pure) |
| 8 | **Editors** | `engines/editors.ts` | `@codemirror/view`, `@codemirror/state`, `obsidian` (`MarkdownRenderer`, `Component`) | `EditorView`, `EditorState` built only from the closed `EditorSpec`, `MarkdownRenderer.render` (`replaces: "renderMarkdown"`), Obsidian `Component`; the islands in the light DOM, slotted into their rows; `input`/`beforeinput`/composition events; `value`/`checked` writes; `setSelectionRange`, `Selection`, `Range` | entry, the full card's description, the description peek; runs after render in the loop; one warm title field and one warm description editor per screen (P9) |
| 9 | **Mount** | `engines/mount.ts` | `obsidian` (views' DOM only) | the screen's own node in its host and its `attachShadow`; adopting a settings list's rows; writes to Obsidian's nodes around it (`--tc-block-lift`, `.cm-content`'s growth); the one overlay node per window and its shadow root; `MutationObserver` | mounting, the layer host, Obsidian's re-renders around the screen |
| 10 | **Chrome** | `engines/chrome.ts` | `obsidian` | Obsidian `Platform`; `body` class writes and their mirror onto every host; the one `CSSStyleSheet` per document and `adoptedStyleSheets`; per-window theme and card-size tokens and the colour preview (`<style>` per document); `css-change`, `visibilitychange`, window `focus` and `resize`, the phone keyboard's show and hide, popout windows; Capacitor haptics | chrome: form, theme, keyboard, toolbar, status bar, visibility, haptics |
| 11 | **Time** | `obsidian/runtime/lifecycle/Time.ts` | — | `requestAnimationFrame` (`onFrame`, one clock per window, bound by its `WindowHost`), `MessageChannel` and `setTimeout` (`afterFrame`, `after`, the minute), `setInterval`, their cancels; no `requestIdleCallback` | the frame clock per window and the timers for every engine and the runtime |
| 12 | **Host services** | `obsidian/hostServices.ts` | `obsidian` | `Notice`, `workspace.openLinkText`, `getLeaf`, the clipboard, Google's sign-in through `GoogleAuth`, `outside()` (`open`, `browse`, `runScript`); **every seam** (the clock, `Http`, `outside()`, `window.open`) and the one global the injected script arms them through | notices, links, copy, sign-in; the e2e seams |
| 13 | **Settings chrome** | `host/settings.ts` | `obsidian` | `PluginSettingTab`, `Setting` and its toggles, dropdowns, sliders, colour wells and buttons, `Modal` (its confirmations), `setIcon`, the tab's own DOM; no key scope | the settings tab in Obsidian's own look; its reorderable lists mount `Places.rows(list)` |
| 14 | **Registration** | `host/registration.ts`, `host/adapters/`, `obsidian/main.ts` | `obsidian` | `Plugin` (extended by `main.ts`), `ItemView` (by the leaf adapter), `MarkdownRenderChild` (by the note adapter), `registerView`, `addCommand` (no `hotkeys`), `addRibbonIcon`, `registerObsidianProtocolHandler`, `addSettingTab`, `addStatusBarItem`, `workspace.on` (`file-menu` and `editor-menu` with `Menu.addItem` only), `vault.on` | the plugin's registrations, the workspace's events as lifecycle intents, data surfaces mounted at their places |
| 15 | **The file and the core** | `obsidian/runtime/persistence/TasksVault.ts`, `replica/Door.ts`, `network/CalendarLane.ts` | `obsidian` | `vault.process`/`read`/`create`; `callDoor` (one `Door` per runtime); `Http` | P3 |

Rules the core must give, each a core function the UI reaches through the gateway: the layout rules (`layoutWidths`, `layoutShareAt`, `allColumnsWidths`, `dividerAt`, `stackedLists`, `swipeLanding`, `stackTasks`, `eventLeft`…), the drop rules (`placeAt`, `levelAt`, `gapAt`, `projectsDrop`, `groupPlaceOf`, `acceptsDrop`…), the entry's job order (`entryJobStep`), the zoom (`zoomAfterPinch`), the constants (`rules.constants`, the dwell among them), and every rule stage 3a and each stage-4 region add (§Migration).

## Guarantee

### The threat model

The four earlier "one mechanism" specs failed by **ordinary development**, never by sabotage: slicing the work by place, a flag per place, a model named after a place, old and new side by side, CSS motion beside the motion engine, logic owned by a host. The guarantee is built against that, in three tiers, and claims exactly what each tier gives.

1. **By architecture, each concern has exactly one implementation, and every place reaches it by the same path.** One screen, one `Model`, one `Msg`, one `update`, one `ScreenHost`; one engine per concern that touches the platform; one input engine and gesture per window; the rules in the core; the place read in one file (C1–C4). A second implementation needs a deliberately built parallel path: a second engine module, a second slice and its messages, a second package. It never comes out of an ordinary change, because an ordinary change finds the one path already there and the guards below in its way.
2. **A machine check catches every natural route to the platform, to a decision and to the place:** what an agent writing ordinary code under a deadline would do (`R6` and `R8` traced seventy such tasks), and every lazy bypass. The compiler, the checker (`uiRules`), the type tests, the CSS allowlist, the matrix and the trap fail on: a host API, event type, listener or package no row names, or used outside its row; `any` reaching the host; a hook, a raw element, module state or a timer cycle in the UI; **any operation of pure UI code outside the allowlist** (computing, ordering, accumulating, addressing by position, a state-carrying loop); an engine dispatching anything but its typed outputs, or comparing with a bare number; a core rule reached around the gateway, or a gateway export that is not one forwarding call; **a core answer used as a condition** but a decision record, a kind or a presence test; a selector of behaviour read in a condition by a second module of its layer; a door write built outside its owning concern; a device write without its capability; a branch on a need's kind; a fact held in two slices or written outside its concern; a key that is not a `RowKey`; something drawn over the screen that is not a layer, a state styling another element, CSS motion or a moving property under a state; an effect in the screen that no command ordered; an inventory row left unused in a place; a task over 16 ms; old and new together; and the lazy bypasses: a suppression comment, `any`, `as`, `.skip`, `.only`, a triple-slash directive. **Duplicated pure plumbing** that computes nothing (a second statechart in one concern's folder, a variant branching into a copy behind its one reader) is not a route a type rule names: it is tier 3's (the structural reviewer's first question) and jscpd's when copied.
3. **Deliberate circumvention is made visible.** It needs either a change to a protected rule or code that no ordinary change looks like (a lying type guard, a value smuggled through `JSON.stringify`, a stateful `this`). The first is detected: the guards are a recorded closure whose hashes `npm test`, `npm run build` and `npm run release` check; `guards:pin` pins machine-checked additions silently and lists every **weakening** change in its commit and in the release notes, and the lead reports each weakening to Max in product words before the merge. The second is read: a fresh structural reviewer per stage (G9), who did not write the code, reads the whole diff and every guard change. This is the production pattern (report D): CODEOWNERS, lint and an independent review. The spec makes no claim that types stop an author who sets out to defeat them.

### Per concern

"Pure" in the second column means the concern's handler, selectors and kit components compile in the pure or kit project.

| Concern | By architecture and machine check | Beyond that |
|---|---|---|
| **Layout** of columns and lists | Pure, inside the allowlist: widths, shares, landings and order are core rules reached only through the gateway (C3); regions and kept contexts are `regionsOf`'s, drawn by one `Screen`, memoised by the one memoiser; the place read in a condition only in `layout.ts` (C4) | matrix: every region in every place and form; budgets |
| **Rendering cost** | One render engine, drawing into shadow roots; kept contexts updated with sharing; chunks for anything new; cards `content-visibility: auto`; the face cached in the core (P9) | budgets: every interaction, both forms, 4× CPU |
| **Drag and drop** | Pure: one `Carry` slice and one set of messages, written only in `update/carry/` (C1), its door writes owned by it (C4); what is under the finger is `within` over measured boxes, drops and landings core rules (C3); across screens through the window's input engine; each payload's look and start a closed variant; the device's carry written only with `PlaceWrite` (C4) | matrix keyed by the inventory's payload × target × place × form; trap: pointer capture only from `input` |
| **Motion** | Only the motion engine's module reaches `animate` and the transient channel, over a closed `AnimationSpec` or `AmbientSpec`; causes are a closed union; a timer cycle refused; tolerances are spec tokens; no CSS motion outside `tc-m-…`, no moving property under a state (decision 34); kit elements declare `motion` | trap: an animation or a style write the ledger cannot match fails; frame recorder per cell |
| **Measurement** | Only the measure and input engines read geometry; pure code passes it along and compares it only through `screen/predicates.ts`; the loop measures a cause's keys first and last | trap: geometry reads |
| **Scroll** | Only the scroll engine's module writes a scroll position, with `behavior: "instant"`; edge-scroll depth and speed the scroll engine's; `overflow-anchor` and `scroll-snap-type` `none` on the root; focus never scrolls (`preventScroll`); CodeMirror's scroll requests become intents | trap: a scroll change the ledger cannot match; matrix: reveal and edge scroll with the note's and the settings' scroller |
| **Focus** | Only the focus engine's module moves focus or writes `tabindex`, reading focus through the root node; the kit has no `autofocus`, `tabindex`, `<button>`, `<input>`, `<a>` or `<form>`; CodeMirror's focus requests become intents; two requests in a loop: the topmost layer's | trap: a focus move the ledger cannot match |
| **Keys** | Only the keys engine's module makes a `Scope` or hears a key; CodeMirror has no default keymap; the key table is one pure concern, its policy one variant | matrix: keys × place × form (the settings rows: none) |
| **Input and gestures** | One pure gesture machine; one input engine per window holds only its state and dispatches its semantic outputs (C2); engines dispatch only `EngineOut`; geometry compared only through the five predicates, so an outcome needs a core rule; the dwell the core's; every event type owned or denied; the pointer kind read in one module | budget: at most one message per carried pointer move; trap: listeners |
| **Entry** | One field engine (`editors`), warm, re-keyed, its islands slotted outside the shadow root; the entry's rules are the core's `entry.*` and `entryJobStep`; every task create is the entry's (C4) | matrix: entry in every place and form; budget: typing pick and Enter |
| **Menus and layers** | One layer stack in the window's overlay root; `Menu` and `Modal` never constructed by the screen; the kit has no `<dialog>`, `popover` or `<details>`; fixed positioning and `z-index` only on the kit's layer and over families (decision 34); the panel's placement the core's | matrix; trap: no Obsidian menu is constructed |
| **Search** | Pure, one concern; its reveal's alternatives closed variants, each read once per layer; a write of device state needs `PlaceWrite`; the step through results the core's; "create task" the entry's | matrix, equal-variant cells compared |
| **Sections** | Pure, one concern; the lift is a carry payload; one kit `SectionHead`; a section's span the core's | matrix |
| **Selection** | Pure, one concern; ⌘ and Shift picks are the gesture machine's intents; the Shift range the core's | matrix |
| **Full card** | Pure, one concern; one kit `FullCard`; its project tap a closed variant | matrix; budget: open |
| **Context** | Pure, one concern; device writes need `PlaceWrite`, absent in a note; the mode's door method is data | matrix: a note's cells assert device state unchanged by the note's own writes |
| **Chrome** | `Platform`, `body` classes and their mirror onto hosts only in `chrome`; the form read in a condition only in `layout.ts`; token-override blocks only for `theme-light`, the phone form and `forced-colors` | trap: class writes on `body` |
| **Mounting** | `render` only in the render engine; shadow roots and Obsidian's DOM around the screen only in `mount`; adapters reach `ScreenHost`'s lifecycle surface only | lifecycle test |
| **Time** | Only the time engine's module reaches `requestAnimationFrame`, `MessageChannel` and the timers; one frame clock per window; no idle | trap: timer globals |
| **The file and the core** | One `Door` per runtime; `callDoor` only in the runtime; a need is one door method with no code per kind; the core's values in the UI only through the gateway | runtime tests |
| **Commands** | Declared without hotkeys; a `HostCommand` enters the key table and its policy as a key intent; the active screen is the window's input engine's | matrix: keys cells per command and place |
| **Settings** | The tab draws the door's `settings.page` and sends raw values; no branch on an answer's value but a row kind's `switch`; its confirmations Obsidian's `Modal` | runtime and settings tests |
| **Accessibility** | `role` and `aria-…` closed kit props written by render; `tabindex` only by focus; keyboard reach the key table; `forced-colors` tokens | matrix: keys cells |

**The screen as a whole:** one `Model`, `Msg`, `update`, `Screen` and `ScreenHost`; a new place is a new constructor in `screen/layout.ts`, its variants' values and its matrix column, nothing else.

**Code the matrix never runs** is covered by requiring each cell to show its concern's whole signature, every `Msg` and `Command` kind exercised by some scenario, and a coverage ratchet on the pure project over the model-level matrix (C5). **Duplicated plumbing in pure code** cannot compute geometry, landings or order (C3) and cannot select by a second reader (C4); a copy is jscpd's, and the rest is the structural reviewer's first question (G9, tier 3).

## Unverified

Every buildability claim of this revision was checked against the spikes or the installed packages (`.worktrees/ui-refactor-slice3-carry2/node_modules`: TypeScript 7.0.2, Preact 11.2.0, Vitest 5.0.5, Vite 8.3.5, esbuild 0.28.2, Obsidian 1.14.4, happy-dom 21.0.4; Node 22.22.0). What is not yet run is listed here with the stage that proves it first; a claim that fails there changes the spec before the stage ends.

| Claim | Why unverified | Proven first in |
|---|---|---|
| A write plus every kept view under 3 ms unthrottled (P3) | The face cache and the fan-out do not exist yet | 3a's budget tests |
| `oneReader` keyed on `aliasSymbol` through `typescript/unstable/sync` | Declared in `dist/api/sync/api.d.ts:427`; not run | 3b1 |
| Stryker's cost over `uiRules` (fixtures through `tsgo` RPC) | S3 ran a toy module | 3b2 |
| The trap in Obsidian's own popout | S3 ran a generic Electron app's `window.open("about:blank")` | 3b2's self-test cell |
| jscpd in the repository | Not installed; S3 ran 5.4.3 in a scratch folder | 3b2 |
| Obsidian's editor slotted into a shadow root's row | S2 measured an island outside the root, not slotted | 3c1 |
| A kept context laid out under `visibility: hidden` reveals as cheaply as one shown once | S2 measured contexts shown once, then hidden | 3c1's mode-switch budget |
| First open in tasks under 16 ms (the replica's first build at 4×) | Not measured | 3c1's first-open budget |
| The main screen's columns at S2's costs | S2 drew the note's block frame | 3c1, then each stage-4 region's budget |
| Placeholder sizes of off-screen cards never reach FLIP or the hit test (P4) | Not measured | 3c1's matrix cells with two-line cards off screen |
| Keys and Obsidian's hotkeys with focus inside a shadow root | S2 saw keys reach Obsidian with the host as target; commands not run | 3c1's keys cells |
| The warm description editor's re-key and the peek's Markdown render under 16 ms | S2 measured the title field only | 3c2's full-card budget |
| WebKit: style cost, `content-visibility` caching, the frame rate on iOS | All of S2 is Chromium; CDP cannot attach to Obsidian on iOS | Not by machine: Max's phone checklist at the ★ (stage 7) |

## What each finding meets

Every attack of the red teams on revisions 11 and 12 (R1: S1-1–S1-6, S2-1–S2-12, S3-1–S3-2, U-1–U-6; R4: F1–F14 and its unbuildable items 1–11), every task, root and note of the scenario reviews of revisions 13 and 14 (R6, R8), every architect finding (R2, R5, R7, R9), every behaviour finding (R3), the twenty holes of report B (H1–H20) and the three earlier specs' failures (M, D, U of report B). **Rejected** marks a proposal that answers only deliberate sabotage; the route it names is then covered by tier 3 (§Guarantee). Every table states its answers as revision 15 holds them; where a later revision replaced an answer, the cell names the current part.

**The reviews of revision 14.** `R8` traced thirty-eight feature tasks of a hurried agent (11 LEAK, 6 FRICTION, 11 CAUGHT, 10 SAFE); `R9` is the architect's review, cited by its own numbering. Three spikes ran beside them.

| Finding | What it found | Answer in revision 15 |
|---|---|---|
| R8 task 1, L1 | Sorting and other ordering by methods `noCompute` did not list | **Taken, as a principle:** `noCompute` is an allowlist; reordering, accumulating and addressing by position are refused whatever the operand (C3) |
| R8 task 2, L2 | A neighbour by a `let prev` loop | **Taken.** No state-carrying `let` or loop in pure code; the neighbour from the core (`rules.neighbourKey`, 3a) (C3) |
| R8 task 3, L3 | A two-kind timer ping-pong | **Taken.** `rearm` refuses any cycle; ticking displays read a runtime clock broadcast or an `AmbientSpec` (C2) |
| R8 tasks 4, 5, L4 | A second create path from paste and from search | **Taken.** Every door write has one owning concern; a create is the entry's (C4) |
| R8 tasks 6, 7, L5 | Filtering and counting on core fields the regex list missed | **Taken.** A core answer is never a condition but a decision record, a kind or a presence test; settings-derived fields are selectors; counts are core answers (C4) |
| R8 task 8, L6 | A variant read again through a prop | **Taken.** Readers keyed on the variant's type alias, one per layer (C4) |
| R8 task 9, L7 | Index keys | **Taken.** The kit's `key` is a `RowKey` (C1) |
| R8 task 10, L8 | Arithmetic in the gateway, drowned in noise | **Taken.** Each gateway export one forwarding call, checked by shape and pinned silently (C3) |
| R8 task 11, L9 | Per-kind caching in `ViewAnswers` | **Taken.** No branch on a need's kind; reads and identity from `DoorMethods` (C3) |
| R8 task 12, F1 | No home for memoisation | **Taken.** One selector memoiser in `ScreenHost` (C4) |
| R8 task 13, F2 | A sub-pixel tolerance | **Taken.** Execution tolerances are spec tokens compared through `beyond` (C2) |
| R8 task 14, F3 | No path for a per-element CSS value | **Taken.** The kit's closed `vars` prop (C1) |
| R8 task 15, F4 | Per-form token values; `forced-colors` | **Taken.** Token-override blocks for `body.tc-form-phone` (mirrored to `:host`) and `forced-colors` (decision 34) |
| R8 task 16, F5 | A confirmation in the settings tab | **Taken.** The settings chrome row may build `Modal` (§The settings tab) |
| R8 task 17, F6 | API renames as weakening noise; `Plugin`, `ItemView`, `MarkdownRenderChild` unowned | **Taken.** A recorded deprecated replacement is an addition; the base classes in the registration row (C2, engine row 14) |
| R8 tasks 18, 26, 27 | Arithmetic for overflow, limits, positions | Caught by the allowlist; the core gives the answer |
| R8 tasks 19, 20 | CSS transition and keyframes on states | Caught by decision 34; a `MotionCause` |
| R8 task 21 | A flag in the editors engine | Caught by `execute`: mutable bindings only of a handle or machine-state type; a `descriptionRendered` message |
| R8 task 22 | `matchMedia` for reduced motion | Caught by `reach`; a chrome fact, read by type once per layer (C4) |
| R8 task 23 | `scrollIntoView` | Caught by `reach`; the scroll engine's `reveal` |
| R8 tasks 24, 25 | `date-fns`, `fuse.js`, `substring` | Caught by `packages` and the allowlist (string methods only in `screen/text.ts`) |
| R8 task 28 | `dataTransfer` read | Caught by `reach`; a row change is a visible weakening |
| R8 tasks 29–34, 36–38 | Status bar count, reorder start, ⌘A, a saving mark, the now line, a snap haptic, copy link, double-tap to top, a fifth ribbon place | Safe, as R8 traced |
| R8 task 35 | Alt-click folds all: N commands, N undo steps | Safe as a mechanism; the fold of all is one core method, one undo step (a G9 question if written as N) |
| R8 buildability 1–6 | `aliasSymbol`; `requestIdleCallback`; popouts on the browser session; Stryker on Vitest 5; typed `attr()`; base classes | 1: §Unverified (3b1); 2: no idle, `MessageChannel` (P9); 3: browser-level auto-attach, run in S3 (C5); 4: run in S3, `--legacy-peer-deps` (C5); 5: `vars` (C1); 6: engine row 14 |
| R9 B1 | `TaskItem` cached by (id, line) is wrong | **Taken.** A positional list of `{id, key}` and a face cached on exactly its inputs (P3, P9) |
| R9 B2 | No reference manifest before stage 7 | **Taken.** A tag per stage merge on `ui-refactor` (C5) |
| R9 B3 | `fs` reads not recorded | **Taken, as S3 ran it:** the `fs` wrap in Vitest and Node, `module.registerHooks`; floor files excluded (C5) |
| R9 B4 | Rules only on fixtures until a big-bang switch | **Taken.** A growing `ported` list from 3b1 (C5) |
| R9 B5 | 3a's rule list incomplete | **Taken.** S1's 31 decision sites and B5's list named with file and line in 3a; each stage-4 region opens with its own (§Migration) |
| R9 B6 | Kit JSX against the host; emit settings | **Taken, as S1 ran it:** `KitNode` and one `cross()`; `emitDeclarationOnly` and an `outDir` per project; a base config (C1) |
| R9 H2 | Neighbours at idle against the same-loop recompute | **Taken.** Kept contexts are needs recomputed in the same loop; only their first drawing is chunked; nothing at idle (P2, P9) |
| R9 H3 | 50 ms against decision 42's 16 ms | **Taken.** 16 ms everywhere (P9, decision 42) |
| R9 H4 | Traceability leftovers (`rules.*` imported directly, edge speed a token, stage 3 words, the core's hit test, recorded settings, "render, drivers, focus") | **Taken.** The traceability rewritten; the whole spec and traceability reread for leftovers |
| R9 H5 | Spec leftovers of revisions 11–13 | **Taken.** Every table answers as revision 15 holds it; stale cells rewritten |
| R9 H6 | `WindowHost` holding state; the outside press outside `input` | **Taken.** A read-only set of `ScreenHost` handles and one input engine per window (§Architecture, C2) |
| R9 H7 | The dwell's two sources | **Taken.** `PROJECTS_HOVER_MS` from `rules.constants` (C2) |
| R9 M1 | Note cells against `toDevice` | **Taken.** Scoped to the note's own writes; the `toDevice` cell its own (C4) |
| R9 M2 | `answers` forbids the caches' identity checks | **Taken.** Identity equality on parts and need ids allowed (C3) |
| R9 M3 | One-valued `writes` | **Taken.** `writes` a list of parts (C4, 3a) |
| R9 M4 | The ledger flags Obsidian's adopted controls | **Taken.** A library subtree (C5) |
| R9 L1 | `as` exception unlisted; times compared as distances | **Taken.** Brand constructors named in `hatches`; timed steps are timers, `GestureToken` pixels only (C3, C5) |
| R9 §3 performance | Budgets above 16 ms; interactions with no budget; idle unsound | **Taken, measured by S2:** P9 rewritten; budgets for every interaction |
| R9 §4 clean code | Plumbing contorted; edge scroll inexpressible; `execute` contorts engines; one reader per field a god file | **Taken.** `seq.ts`/`text.ts`; measured edge zones; engines execute with typed dispatch; one reader per layer (C2–C4) |
| R9 §5 buildability | Projects not run; checker API by RPC; `.js` inputs; the closure's two configs; CDP; Stryker; jscpd | **Taken, run in S1 and S3**; `.js` inputs refused (C5); remaining items in §Unverified |
| R9 §6 migration and the guesses of a 3a agent | 3b too big; registry before unions; 3c switch; stage-4 lists; stage 5 against bugs 3 and 11; nine guesses | **Taken.** 3b split into 3b1 and 3b2; the registry scoped to ported concerns; every guess answered in 3a; bugs 3 and 11's core parts in 3a (§Migration) |
| S1 | Composite projects need emit and an existing stub; `cross()`; Vite aliases; 167 hits classified | Taken throughout C1 and C3; the 31 decision sites are 3a's |
| S2 | Cold render 75–80 ms; shadow root 3.3×; `cv:hidden` reveal; chunking; editor costs; no `requestIdleCallback` on iOS | P9 rewritten on these numbers |
| S3 | `fsModuleCache`; `registerHooks`; Stryker peers; browser-level auto-attach; three jscpd clones | C5 rewritten in the form S3 ran |

**The reviews of revision 13.** `R6` traced thirty-two feature tasks of a hurried agent; `R7` is the architect's review.

| Finding | What it found | Answer, as revision 15 holds it |
|---|---|---|
| R6 L1 (tasks 2, 9, 15, 24) | Pure code computes with bare core numbers, `Date`, index callbacks, `entries()`, `for` counters | The operation allowlist (C3); the week's days, the month grid and the share done are core rules |
| R6 L2 (tasks 3, 20) | The gesture folder's exemption holds any decision | No folder computes; five predicates in `screen/predicates.ts`, typed so a threshold is a `GestureToken`; an outcome needs a core rule (C3) |
| R6 L3 (tasks 1, 6, 20, 9b) | "One consumer per variant" unchecked | Readers by type alias, one per layer, recorded in `readers.ts` (C4) |
| R6 L4 (tasks 12, 14) | Overlays and hover content outside the layer stack | Positioning roles owned by the kit's layer, over and decoration families; a state styles only its own element; every event type owned or denied; hover is the machine's dwell (decision 34, C2) |
| R6 L5 (tasks 17, 18, 5, 22) | `any` and private Obsidian APIs in host code | No `any` call or member and no `as any` in host code; one private declaration file per row, in the closure (C2) |
| R6 L6 (task 19) | Capabilities listed by call | `PlaceWrite` derived from `SETTINGS_FILE.device` and the door's `writes`; the runtime re-checks by data (C4) |
| R6 L7 (tasks 2, 5) | Logic in the runtime's needs and in the settings tab | A need is one door method with no code per kind; the tab draws `settings.page` and sends raw values (C3) |
| R6 L8 (tasks 16, 17, 22, 27) | Packages and APIs named loosely; class strings anywhere | Exact packages and declarations; `EditorSpec`; class prefixes owned by kit, motion and mount (C2) |
| R6 tasks 4, 6, 7, 16, 25–28, 30–32 | Caught or safe | Kept; the checker's messages name the rule to use and say when a change is a weakening (§Guards) |
| R6 task 8 | Drag from a note to the main screen has no home | The window's input engine: the carry across screens (§Architecture) |
| R6 task 10 | Obsidian hotkeys a second key path | Commands declare no hotkeys and enter the key table as intents (§Architecture) |
| R6 task 11 | No home for a pulse; a self-re-arming timer passes | `AmbientSpec`; timer cycles refused; the ledger attributes render writes (C2, C5) |
| R6 task 13 | One frame clock for every window | A frame clock per window, bound by `WindowHost` (engine row 11) |
| R6 task 20 | `@media` in the token block decides layout | The token blocks' `@media` only `prefers-*` and `forced-colors` (decision 34) |
| R6 task 21 | Status bar and Obsidian's menus have no home | Data surfaces at their places; `menu.addItem` on handed-in menus (§Architecture) |
| R6 task 23 | Easing math accumulates in `units.ts`; exempt files outside the closure | Springs and easings are `AnimationSpec` kinds, glides `ScrollSpec` kinds, executed by engines; `units.ts` retired; every exempt file in the closure (C2, C5) |
| R6 task 29 | No path from a note to the main screen | `toDevice` intents through `WindowHost` (C4) |
| R6 S1 | Every feature pins; a weakening drowns | `guards:pin` classifies: additions silent, weakening reported (C5) |
| R6 S2 | Exempt product files are not guard files | The checker emits its exemptions into the closure (C5) |
| R6 S3 | Node loader hooks miss Vitest's graph | A Vite plugin with `fsModuleCache: false` and an `fs` wrap, run in S3 (C5) |
| R6 B1 | Projects need references | R7 B3 |
| R6 B2 | `AssertNoForeignFacts` cannot be a type test | The `slices` rule over declared types and imports; a fresh alias is G9's (C1) |
| R6 B3 | `tc-jsx` re-exporting Preact never memoises | The runtime wraps each kit component in a cached `memo`, measured in S1 (C1) |
| R6 B4 | — | R6 S3 |
| R6 B5 | The trap misses popouts | Browser-level `Target.setAutoAttach`, run in S3 (C5) |
| R6 B6 | The phone form is emulated | Named in G5 and §Tests: the emulated phone view in Chromium, and Max's checklist on the device before a release |
| R6 B7 | Stryker's TypeScript checker cannot load TS 7 | Stryker with the Vitest runner and no checker, run in S3 (C5) |
| R6 B8 | No arithmetic in engines forces math elsewhere | Engines execute with arithmetic and ordering (C2) |
| R6 B9 | Per package is not a guard | R6 L8 |
| R7 B1 | The release build refuses `next` | `npm run build -- --ui=next` into `.e2e/next/`; only release refuses (C5) |
| R7 B2 | The e2e seams contradict each other | Every seam in `hostServices`, inert until the injected script arms it (C5, decision 37) |
| R7 B3 | Three projects cannot partition | Four composite projects by reference, run in S1 (C1) |
| R7 B4 | No typed coverage map | `DoorMethods` in `PhoneCalls.ts` (3a), with a type test equal to `doorMethods()` |
| R7 B5 | FLIP has no "first" boxes | Measure first before render, last after (§Architecture, decision 48) |
| R7 B6 | Zero root re-renders against `regions` | `regionsOf(model, parts)` memoised; the pointer-path budget (P9) |
| R7 H1 | A 100 % coverage gate left | A coverage ratchet plus every kind exercised (C5) |
| R7 H2 | Fixtures demanded for rejected findings | Fixtures for **Taken** findings; rejected ones are G9's checklist |
| R7 H3 | Tier 2 claims more than it gives | Tier 2 names routes to the platform, a decision and the place; duplicated plumbing is tier 3 (§Guarantee) |
| R7 H4, H5 | Leftovers (`rules.*` imported directly; memo key) | Fixed (§Resolution, P3, P9) |
| R7 H6 | 3a gives `backend` frontend work | 3a is the core only; `ViewAnswers` is reworked in 3c1 (§Migration) |
| R7 H7 | 3b's violation list is a baseline | No baseline: rules run on the `ported` folders from 3b1 (C5) |
| R7 H8 | The registry tied to every union member | Two checks: every inventory row maps to a member; every member appears in a scenario (G5) |
| R7 H9 | Decision 50's month grid against C3 | `rules.monthGrid` in the core (3a); decision 50 rewritten |
| R7 K1 | No arithmetic in engines | Engines execute; dispatch typed (C2) |
| R7 K2 | Dataflow on `.length`/`indexOf` | The allowlist by type, no dataflow (C3) |
| R7 K3 | Property-read ban makes `layout.ts` a god file | Only reads in a condition count, one module per layer (C4) |
| R7 K4 | Decision 33's enumeration | Dropped; each rule is a row of §Guards' rule table with its fixture |
| R7 K5 | Key roles undefined | `tests/matrix/roles.ts` (G5) |
| R7 performance: Enter and typing picks | A new `EditorView` per field; a write misses the parse cache | Warm editors re-keyed, measured in S2; the write seeds the cache (P9, P3) |
| R7 performance: mode switch and swipe | A new context renders every card | Kept contexts in a shadow root and chunked drawing, measured in S2 (P9) |
| R7 performance: the minute tick | Recomputes every need | Needs cached on their parts; the face cached; the minute's budget (P9) |
| R7 migration | `ViewAnswers` not "kept"; 3c too big; `preact/compat` direct; the motion box map | Reshaped in 3c1; 3c split; `compat` behind `tc-jsx`; the box map goes (§Migration) |
| R7 "what a 3a agent would guess" | `DoorMethods`' shape, which rules move, the cache, the project-note index, the budgets, `tasks.keyOf` | Answered in stage 3a; `tasks.keyOf` exists (`PhoneCalls.ts:681`) |

**The reviews of revision 12.**

| Finding | What it found | Answer, as revision 15 holds it |
|---|---|---|
| R5 F1 | Units as phantom objects still allow `<`, `+a`, `Number(a)`; "no bare `number` in `Model`" collides with the core's answers | Pure code computes nothing (the allowlist, C3); the geometry types are made only by engines and compared only through `screen/predicates.ts`; closed types only for the UI's own types, answers typed by `DoorMethods` (C1) |
| R5 F2 | Stateless engines plus a message per event run the whole loop at pointer rate | The input engine holds the gesture machine's state and dispatches only semantic outputs; continuous values through the transient channel; the pointer-path budget (C2, P5, P9) |
| R5 F3 | Press slop, hold and edge speed are not product rules | The slop and the hold are design tokens of the one machine, the dwell the core's, edge zones measured and their speed the scroll engine's; the core keeps what lands where (C2, C3) |
| R5 F4 | Two JSX dialects not buildable; Preact in every kit file | One runtime (`tc-jsx`), the kit's type view and the host's real runtime crossed by `cross()` (C1) |
| R5 F5 | Opaque core-answer fields need a contract rewrite | `Place`'s fields and the place facts of `contracts.ts` read only in `layout.ts` (`oneReader`); `contracts.ts` unchanged by it (C4) |
| R5 F6 | Fourteen per-engine projects duplicate the checker and leak | Four projects by reference plus the reachability rule over the engine table as data (C1, C2) |
| R5 F7 | Generated router and `Screen` are ceremony | Root `update` and `Screen` hand-written; cross-concern steps explicit; slice ownership by the checker; `ROUTES` total and `Disjoint` (C1) |
| R5 F8 | P9 insufficient | `needs()` and regions through one memoiser with ids computed once; `layoutOf` and `geometryOf` split; no serialised keys (P9, C4) |
| R5 F9 | The effect ledger fails on clamps, momentum, Obsidian's own focus and CodeMirror | The ledger judges the screen's subtree; input within 1 s and clamps explain scrolls; library effects by subtree (C5) |
| R5 F10 | No home for `MutationObserver`, the editors in the loop, re-adoption, accessibility, workspace events, `preventDefault` | `MutationObserver` in `mount`; editors after render; `display()` remounts the lists' screens; accessibility owners; registration row 14; the synchronous `preventDefault` invariant |
| R5 F11 | Stage 3 has no green middle; open-ended gates | Stages 3a, 3b1, 3b2, 3c1, 3c2; coverage on the model-level matrix; a risk-ranked e2e subset per region and the full matrix at the release gate; mutation a ratchet (§Migration) |
| R5 F12 | "One call site per API" is beaten by a wrapper | Module ownership: only the engine's module reaches the API (C2) |
| R5 F13 | Declared variance is a second behaviour spec | Only equal-variant cells are compared; each variant value has its own scenarios (C4, G5) |
| R4 F1 | `any`, type predicates, `+x`, `JSON.parse`, `Object.entries(place)` open units and `Place` | **Partly taken.** No `any` (annotation or expression), no `as`, no `this` in pure and kit; `Number`, `parseInt`, `parseFloat` and unary `+` refused by the allowlist; `records.ts`. **Rejected:** `#private` classes or `WeakMap`s for `Place`, a ban on type predicates: a lying predicate or `JSON.stringify(place).includes('"note"')` is sabotage, met by tier 3 |
| R4 F2 | A second swipe landing by `indexOf` and `.length` | Ordinal rules are the core's; `indexOf` and computed positions refused by the allowlist; `swipeOnce.test.ts` naming Max; the recorder's "two places away" (C3) |
| R4 F3 | The trailer is self-authored; the manifest is a list that leaks; a hash cycle | A recorded closure; the manifest outside its own closure, referenced at the previous stage's tag; every weakening in its commit, the release notes and the lead's report to Max (C5) |
| R4 F4 | Every concern can emit any effect, and a note can write the device's filter | **Taken for writes:** a `PlaceWrite` capability only `layoutOf` issues, and since revision 15 each door write built only by its owning concern (C4). **Rejected** for focus, scroll and motion requests: a typing pick, the entry and a reveal all rightly ask for them; uniqueness is one execution engine per kind |
| R4 F5 | Engines keep state in closures; a wrapper keeps one call site | **Taken in its natural part:** mutable bindings in engines only of a handle or a machine-state type; engines dispatch only typed outputs; module ownership instead of call sites (C2). **Rejected:** generated listener tables and engines as a `switch` only |
| R4 F6 | Kit functions get a stateful `this`; `as const` holding a `Map`; expandos; native `<a>`/`<button>` | No `this` parameter; module-level `as const` literal-only; no property written on a function; `<a>`, `<button>`, `<input>`, `<select>`, `<textarea>` not in the kit view (C1, C5). **Rejected:** a vnode format of our own |
| R4 F7 | The matrix registry follows the code's unions | The registry is derived from the inventory's rows (G5) |
| R4 F8 | `types: []` does not stop imports; new npm packages unscanned; `next` may import the old UI; the core's rules reachable around the gateway | `paths` to an existing stub per project; relative imports out of a project's roots refused (`roots`); no triple-slash directives; `skipLibCheck` off in pure and kit; packages per engine row; no imports between `next` and the old UI; core values only through the gateway. **Rejected:** an ES-library allowlist for `(() => 0).constructor`-style doors: sabotage |
| R4 F9 | Place leaks through the root answer's shape, reused variants, form-correlated messages, a variant gating a whole copy | The root answer's `kind` is a place fact read only in `layout.ts`; input kinds only to the gesture concern (C4). **Rejected:** variants only as keys into data tables; a variant branching into a copy is the structural reviewer's question, and the copy is jscpd's |
| R4 F10 | The trap tests another bundle; input swallows the ledger; style writes unwatched; branch coverage only | The matrix and trap on the release bundle, injected over CDP; the ledger attributes scrolls to input on that scroller; style, class and attribute mutations judged; line, function and branch coverage (C5) |
| R4 F11 | The generator and the gateway follow their inputs | No generator remains; every script the commands load is in the closure; each gateway export one forwarding call (C3). **Rejected:** "one core rule per inventory decision" as a check: the core's rules are reviewed as the core |
| R4 F12 | One fact in two slices | `slices` (C1) |
| R4 F13 | `ScreenHost`, registration and the note adapter hold logic in closures | The engines' binding rule covers the hosts and the adapters (C2); the rest is G9's |
| R4 F14 | `transform`/`inset` under a state; `:has()` with a variant class | Under a state only paint properties are allowed; `:has()` may not name a variant class (decision 34) |
| R4 unbuildable 1 | No bare `number` against the core's answers | R5 F1 |
| R4 unbuildable 2 | The manifest's hash cycle | R4 F3 |
| R4 unbuildable 3 | 100 % mutation with no `Stryker disable` | A ratchet (C5) |
| R4 unbuildable 4 | Engines that compare nothing | Engines execute with ordering; equality on `deltaMode` in the input engine; `preventDefault` from the machine's state (C2) |
| R4 unbuildable 5 | One `focus` call site against CodeMirror | Module ownership: the focus engine asks `editors` by key for its field (C2) |
| R4 unbuildable 6 | The kit's JSX free of Preact | One runtime in the render engine's row (C1) |
| R4 unbuildable 7 | Add/remove sets cannot express divergent follow-ups | Equal-variant cells only (C4) |
| R4 unbuildable 8 | No `as` and no predicates force casts | `records.ts`; predicates allowed; brand constructors named (C5) |
| R4 unbuildable 9 | Per-engine projects cannot split the DOM | Four projects; members by the checker (C1, C2) |
| R4 unbuildable 10 | `display()` orphans adopted rows; the settings scroller | `display()` remounts; `.vertical-tab-content` first in the chain |
| R4 unbuildable 11 | Every stage needs a re-pin by Max | No approval gate: the lead reports weakening; the floors outside the manifest (C5) |

**The reviews of revision 11 and earlier.**

| Finding | What let it through | Killed by |
|---|---|---|
| R1 S1-1 | A private folder holds a second FLIP or a second carry | C2: only the motion engine's module reaches `animate`, over closed specs; C3: pure code computes nothing; slice ownership of the carry |
| R1 S1-2 | `Px` opt-in; bare numbers free; motion allowed arithmetic | C3: the operation allowlist; engines execute only closed specs and dispatch typed outputs (C2) |
| R1 S1-3 | Gate-only by code shape; which-of-two needed | Closed variants with one reader per layer, per-concern `Layout` parts (C4); equal-variant cells compared |
| R1 S1-4 | Place proxies (core answer fields, pointer kind, chrome, `closest`) | C4: place facts read only in `layout.ts`; a core answer never a condition; input kinds only to the gesture concern; `mount` alone sees Obsidian's DOM |
| R1 S1-5 | CodeMirror and `Menu`/`Modal` carry whole concerns | C2: libraries configured to delegate; `Menu`/`Modal` not built by the screen; the ledger judges library effects by subtree |
| R1 S1-6 | The guards' guards in the agent's write path | C5: a recorded closure stops tests, builds and releases on an unpinned change; a weakening is listed, reported to Max and reviewed; escape hatches banned |
| R1 S2-1 | Engines hold state and recognise | C2: handles or the machine's state only; dispatch only `EngineOut` |
| R1 S2-2 | Any engine may add any listener | C2: listeners by event type |
| R1 S2-3 | Hooks, module state, native behaviours in the kit | C1: the kit's type view; no hooks in reach; literal-only module scope; no `this` |
| R1 S2-4 | CSS motion and place branches the rule did not name | Decision 34: the CSS an allowlist; paint-only under a state; no host ancestors or media queries but the token blocks |
| R1 S2-5 | A structural type of an engine's own hides a host call | C2: the checker resolves every member to its declaration |
| R1 S2-6 | Unscanned `.js`, `.d.ts`, files outside `obsidian/` | C5: scope by the metafile, `.js` inputs refused; no ambient declarations or triple-slash directives; the trap per realm |
| R1 S2-7 | Popouts, effects with no call, unrun paths | C5: the trap per realm on the release bundle; the ledger; coverage over the model-level matrix |
| R1 S2-8 | The matrix satisfied trivially | G5: cells from the inventory; each shows its concern's signature; `notOffered` cells run and assert absence; empty logs fail |
| R1 S2-9 | A new cause with its own engine; causes with free payloads | C2: one motion engine, specs of tokens; causes carry keys only |
| R1 S2-10 | `model/` and the router as logic zones | C1: `model/` holds types; the root `update` routes, broadcasts and holds the cross-concern steps; slice ownership |
| R1 S2-11 | Adapters dispatch messages | `ScreenHost`'s surface frozen to lifecycle intents |
| R1 S2-12 | Dynamic kinds, bags, casts | C1: closed UI types, deep-readonly model; C5: no `as`, no `any` |
| R1 S3-1 | A master "fix" keeps the old UI alive | G8: a ported entry names a test that must exist, sit in the matrix and fail when the new UI's fix is reverted |
| R1 S3-2 | jscpd sold as a guarantee | A backstop only |
| R1 U-1 | Gate-only against decision 53 | C4 variants |
| R1 U-2 | The trap fails CodeMirror's own listeners | C5: library effects judged by subtree |
| R1 U-3 | The `Px` rule against the recognizer, edge scroll, pinch | C3: `screen/predicates.ts`; the slop a token; edge zones measured, their speed the scroll engine's |
| R1 U-4 | Name bans hit host and core names | No name bans; the checker resolves declarations |
| R1 U-5 | A frozen table of every file name | C2: concerns and engines frozen, pure files free |
| R1 U-6 | 100 % mutation at once | C5: a ratchet |
| R2.1, R2.10 | A write re-renders every card | P9 |
| R2.2 | One route per kind against `rebased`/`viewsChanged` | C1: broadcasts |
| R2.3 | The note adapter cannot decide or scale | One `ScreenHost` per Markdown view; "not a project" draws nothing; the check indexed (P3) |
| R2.4 | rAF and timers in "kept" drivers | The time engine; §Migration's kept list corrected |
| R2.5, R2.6 | Arithmetic ban misplaces code; gates can't express alternatives | C3: the allowlist, `seq.ts`, `text.ts` and `screen/predicates.ts`; C4 variants |
| R2.7, R3 §4 | The settings tab as a full place | §The settings tab |
| R2.8 | Registration, commands, clipboard, visibility, outside press, keyboard events, haptics, external drop | §The engine table rows 7, 10, 12, 14 |
| R2.9 | Name ban too broad | Dropped |
| R2.11 | Stage 3 too big; the note hostless | §Migration: 3a–3c2; the note mounted from stage 3c1 |
| R2.12 | God files | Pure concerns are folders with any files; engines are small translators |
| R3 §1.1–1.6 | Settings lumped; reorder as a transition; wrong cause; fit frame measured; stale words; stage 6 rule | Traceability rerun; §The settings tab; `stepAside`; decision 44; §Migration |
| R3 decisions 51, 52, 54 | Undeclared product changes | Decisions 51, 52, 54 rewritten; §Old bugs 15–17 |
| R3 old bug 3 | The open field in a note | §Old bugs 3 |
| M1–M9, D-1–D-9 | "One" per class or per host; parity by cross-reference; custom code allowed | C1–C3: one screen, one engine per concern, rules in the core; the frozen table has no exemption list |
| U1–U20 | Migration and ownership by place; host-owned logic; flags; per-place e2e | C1, C2, C4, G5, G8, G9; §Migration |
| H1 | `LeafModel`, `leafCarry`, `LeafMsg` | C1: one `Model`, one `Msg` routed once, slice ownership |
| H2 | `LeafHost` with its own draw and `run` | `ScreenHost` is the one controller; adapters reach only its lifecycle surface |
| H3 | `drivers/motion/ribbonFlip.ts` | C2: only the motion engine's module reaches `animate`, over closed specs |
| H4 | CSS `transition` on a state | Decision 34: motion only under `tc-m-…`, never with a state |
| H5 | Two stores for one screen | C1: one `Program` instantiation, in `ScreenHost` |
| H6 | `Measure.leafColumns`, per-host coordinates | C3: geometry types made only by engines, compared only through `screen/predicates.ts` |
| H7 | A host's own `targetAt` | `ScreenHost` holds handles only; the hit test is the gesture machine's |
| H8 | `Keys.leaf` | C2: only the keys engine makes a `Scope`; the policy a variant |
| H9 | `RibbonGlide` | C2: only the scroll engine writes a position; glides on the one frame clock |
| H10 | A host's own focus timing | C2: only the focus engine moves focus, last in the loop |
| H11 | `leafEntry` with its own look | C4: the look is the entry's `Layout` part |
| H12 | `LeafMenu` with its own placement | One layer stack; placement by the core's rule from measured boxes |
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
| `tsconfig.base.json`, `core/tsconfig.json`, `tsconfig.next-pure.json`, `tsconfig.next-kit.json`, `tsconfig.json`, `blocked/none.ts`; `tests/guards/projects.test.ts` | The four composite projects built with `tsc -b`, each emitting declarations into its own `outDir`; `paths` to the existing stub; `skipLibCheck` off in pure and kit; every metafile input under exactly one project's `include` roots | C1 |
| `view/jsx/` | The type view (`KitNode`, closed attributes, `RowKey`, `vars`) and the one runtime (memo, `cross()`) | C1 |
| `tests/types/closed.ts` | The UI's own types closed; `ROUTES` total and `Disjoint`; no variant union declared twice; `DoorMethods` equal to `doorMethods()` (in the core's tests, 3a) | C1, C4 |
| `tests/uiRules.ts` and its rule table below | The checker, by declaration, over the metafile's inputs, on the `ported` folders | C1–C5 |
| `tests/guards/engines.ts`, `readers.ts`, `owners.ts`, `guards/ported.json`, `tests/engines.test.ts` | The engine table, the readers and decision records, the write owners and the ported folders as data, and equal to the code | C2, C4, C5 |
| `screen/seq.ts`, `screen/text.ts`, `screen/predicates.ts`, `engines/tolerance.ts` and their fixtures | The exempt plumbing, predicates and tolerance, each export with accept and reject fixtures | C2, C3 |
| `tests/guards/swipeOnce.test.ts` | Names Max: every swipe lands where `rules.swipeLanding` says | C3 |
| `tests/styles.test.ts` (below `/* next */`) | Decision 34's allowlist; the token blocks; every `vars` name declared; `screen/tokens.ts` equal to the CSS's gesture token | C1, C2 |
| `tests/matrix/rows.json`, `registry.ts`, `roles.ts`, `model.test.ts`, `scripts/e2e/matrix.ts` | G5 below | — |
| `scripts/e2e/trap.ts`, `tests/e2e/trap.test.ts` | The trap and its effect ledger, injected per realm (popouts by browser-level auto-attach) into the `--ui=next` production bundle | C5 |
| `tests/guards.test.ts`, `tests/guards/fixtures/` | Every rule has reject and accept fixtures, and matches a real input; every **Taken** finding that code can show is a reject fixture of the rule that kills it | — |
| `guards/manifest.json`, `guards/node-closure.mjs`, the guard project's recorder plugin and `fs` setup, `npm run guards:closure`, `guards:pin` | The recorded closure, its hashes, and the classification of a change against the stage tag | C5 |
| `stryker.config.mjs`, `vitest.guards.config.mts`, `guards/mutation-floor.json`, `guards/coverage-floor.json` | The two ratchets | C5 |
| `.jscpd.json` | A backstop: no copied block (threshold 0, 50 tokens) | — |
| `tests/uiFreeze.test.ts`, `tests/oneSwitch.test.ts` | G8 below | — |
| `tests/hostLifecycle.test.ts` | Every adapter and `WindowHost` in each form, mid-gesture and mid-chunk too, leaves nothing alive | P8 |
| `tests/budget/`, `npm run e2e -- budget` | P9's budgets for every interaction | P9 |
| `tests/architecture.test.ts`, `tests/uiDecides.test.ts` | Unchanged for the old UI and the core; `answerOps` does `uiDecides`' work for `next/` | — |

**The checker's rules.** Each is one rule over declarations, types or the import graph, with its own reject and accept fixtures (`tests/guards/fixtures/<rule>/`). Its message names what to do instead, and, for a change to its own data, whether the change is an addition or a weakening.

| Rule | Says | Part |
|---|---|---|
| `reach` | A host declaration (DOM, Node, Obsidian, Preact, CodeMirror, any package, `globalThis`, `Reflect`, `Function`, `eval`, `Proxy`, `cross()`) only in the modules whose row names it; anything no row names is denied | C2 |
| `events` | A listener's event type only in its owning engine; an event type no row names is denied | C2 |
| `packages` | An import of a package only where its row names it exactly | C2 |
| `roots` | No relative import leaving its project's `include` roots | C1 |
| `hostAny` | In host code, no call or member read on an expression of type `any`, no `as any`, no `as unknown as` | C2 |
| `ambient` | Ambient declarations only in `view/jsx/` and `engines/<row>.private.d.ts`; no triple-slash directive | C2, C5 |
| `classes` | `tc-n-` literals only in the kit, `tc-m-` only in motion, `task-calendar` only in mount | C2 |
| `execute` | In engines and hosts: a `Msg` created only from `EngineOut`; a comparison with a constant only through `beyond` and an `ExecutionToken`; mutable bindings only of a handle or a machine-state type | C2 |
| `rearm` | No cycle in the graph message kind → timer command → delivered kind | C2 |
| `noCompute` | In the pure and kit projects: only the allowlisted operations (C3); `seq` exports take no geometry type and no number field of a core answer | C3 |
| `gateway` | The core's values reached from the UI only through `screen/rules.ts`; each of its exports one forwarding call; a `GestureToken` made only in `screen/tokens.ts` | C3 |
| `answers` | In `obsidian/runtime/dispatch/`, `host/settings.ts`, `host/registration.ts` and `host/adapters/`: no comparison or branch on an answer's or a control's value but an exhaustive `switch` on a row's kind and identity equality on replica parts and need ids; no branch on a need's kind; a need is one door method | C3 |
| `answerOps` | In pure and kit code, a value of a type declared in `core/` is not a condition operand nor a predicate's result, but a decision record, a `kind`, a presence test, or a place fact in its one reader | C4 |
| `oneReader` | A variant alias, a place fact or a settings-derived field read in a condition or as a computed key only by its recorded reader of each layer; a `Layout` part's variant missing from `readers.ts` fails | C4 |
| `owners` | A command carrying a door write method built only in its owning concern's folder | C4 |
| `placeWrite` | `PlaceWrite` made only in `screen/layout.ts`; a method whose `writes` holds `"device"`, or a device patch, only in a `placeWrite` command | C4 |
| `slices` | A slice's fields built only in its concern's folder; a slice field's type declared in that concern's module | C1 |
| `moduleState` | Module scope in pure and kit code: functions, types, literal `as const` data; no expando | C1 |
| `boundaries` | No imports between `obsidian/ui/next` and the old UI | C5 |
| `hatches` | No suppression comment, `.skip`, `.only`, `.todo`; in pure and kit code no `as` but `as const` and the brand constructors in their modules, no `any`, no `this` parameter; no metafile input but `.ts` and `.tsx` | C5 |

**Dropped in revision 15**, each with what does its work now: the 50 ms mode-switch budget (16 ms everywhere, P9); "neighbours at idle" and `requestIdleCallback` (kept contexts recomputed in the same loop, first drawn in chunks after the frame on `MessageChannel`); the `TaskItem` cache keyed by (id, line) (a positional list and a face cached on its inputs); "a new `EditorView` costs 5–15 ms" (S2's 20–60 ms for Obsidian's field, and warm editors); `noCompute` as a list of forbidden operators (an allowlist); the gateway's predicates and its free body (`screen/predicates.ts`; forwarding calls only); a dwell, a hold or a second press compared as a distance (timers; the dwell the core's); "no ordering in engines" (engines execute; dispatch typed; tolerances through `beyond`); one input engine per screen (one per window); `WindowHost` holding the active screen and the screens' geometry (it asks its screens); `uiDecides`' regex list for `next/` (`answerOps`); one reader per field (one per variant type and layer); `module.register` (`module.registerHooks`); the reference manifest at the last release tag before stage 7 (a tag per stage); the end-of-3c2 switch of every rule (`ported`); a single-valued `writes` (a list of parts); one 3b (3b1 and 3b2). Revision 14 had dropped `units.ts` and the unit-operand rule, the `update/gesture/` exemption, the dataflow rule on `.length`/`indexOf`, the property-read ban on place facts, `AssertNoForeignFacts` as a type test, the `--listFiles` partition, decision 33's list of kinds, fixtures for rejected findings, the 100 % coverage gate and a violation list for slice 3's code. Revision 13 had dropped the phantom units, the second JSX dialect, the per-engine projects, the generators, the opaque answer fields, call-site counting, the declared-variance comparator, the core's gesture rules, the trailer and the manifest's self-hash.

**G5. The matrix.** `tests/matrix/rows.json` maps every inventory row a concern must show in a place to its cell: (concern, payload or variant, place, form). `tests/matrix/registry.ts` is derived from it, with **two checks**, scoped to the concerns on the `ported` list (a concern not yet ported has no unions to check against): every row maps to a member of the code's unions (a row naming a member the code lacks fails, so shrinking a union cannot delete a cell), and every member of a concern's closed unions (a carry's payload × target kinds, every `MotionCause`, every message and command kind) appears in some scenario, inventoried or not. A cell is scenarios, or `notOffered(variant)`, which runs the same scenarios and asserts the concern's commands and causes are absent. Each cell must show its concern's signature. **Key roles** (`tests/matrix/roles.ts`) are a closed type, `lifted`, `target`, `neighbour`, `landed`, `other`; a log is projected onto them, and one concern's projected logs are compared across the cells whose variant values are equal; an empty log fails. Scenarios run as message logs through the one `update` (model level, every cell, under the coverage ratchet) and in the test Obsidian under the frame recorder, the trap and the budgets on the `--ui=next` production bundle (a risk-ranked subset per stage; every cell, desktop and the **emulated** phone view, light and dark, at the release gate). The settings rows have their own cells: carry, motion (`stepAside`, the drop), measure and input at `Places.rows(list)` in both forms; every other concern `notOffered` there. **What the emulation leaves out** (CDP cannot attach to Obsidian on iOS's WKWebView): WebKit's rendering and its cost, the real keyboard and its rising on a pick, momentum scroll and the rubber band, safe areas and Capacitor's haptics. Max's phone checklist covers them on the device before each release (§Tests 8).

**G8. No coexistence.** No flags per place: one build constant, `UI` (`"old" | "next"`), read once in `main.ts`; `npm run release` refuses `next` until stage 7 (`npm run build -- --ui=next` makes the test bundle). master never holds both: the work reaches master in one merge, at stage 7, which switches and deletes the old UI, its CSS, `UI` and the freeze. Until then the old UI is frozen by content: every old file by blob id, changed on the branch only to master's version at a commit the list names, each change with a port in `tests/uiFreeze.ported.ts` whose named test must exist, sit in the matrix and fail when the new UI's fix is reverted; otherwise the list may only shrink.

**G9. Structural review per stage.** A fresh reviewer, who wrote none of the stage's code, gets the engine table, the whole tree at the stage's head, the guards and the stage's weakening changes, and one task: find a concern implemented twice, an effect the plugin did not order, a decision computed in the UI, a selector of behaviour read twice in a layer, a variant branching into a second implementation, or a guard changed to let something through. Its checklist also holds every **rejected** finding of §What each finding meets (a lying type guard, a value smuggled through `JSON.stringify`, a fresh alias holding another concern's fact). Each finding becomes a reject fixture first, then a fix at the part (C1–C5) that let it through. A stage ends when a second fresh reviewer finds nothing.

| Impossible by construction | Enforced by |
|---|---|
| A write out of the order Max acted in | runtime tests; the core-call rule |
| A frame mixing generations or contexts, a kept context from an older replica | synchronous views computed in the dispatch loop before render, kept contexts among them; runtime replay tests |
| A card flashing back after a drop or a rename | runtime tests: a write's outcome is in the same message |
| An outside edit lost, or overwriting a pending write | replay tests: Sync during three pending calls, one of which goes stale |
| Single rows moving across a context; a transition twice | `update` and `motion` tests; the frame recorder |
| Re-rendering at pointer rate; every card re-rendered by one write | the pointer-path and render-counter budgets (P9) |
| A task over 16 ms in any interaction | the budgets (P9), both forms, 4× CPU |
| A redraw under the finger | the pin tests |
| A screen going stale under a layer | the layer tests |
| A row remounting from field to card | identity tests; `RowKey` |
| Something alive after its host | the lifecycle test |
| Focus scrolling the screen; the keyboard not rising on a pick | the focus engine; the phone checklist |
| A swipe landing two places away | `swipeOnce.test.ts`, the core's `swipeLanding` test, the recorder |
| A second implementation of a concern | §Guarantee: the architecture, the checker, the matrix and the trap; G9 |
| A place deciding anything but its variants | C4: every selector of behaviour read in a condition by one module per layer |
| A decision computed in the UI | C3: the allowlist, the gateway, the predicates; C4: `answerOps` |
| A second path for a door write | C4: `owners` |
| A note writing any device state | `PlaceWrite` from data, the runtime's check (C4); the note's matrix cells |
| Old and new UI on master together | `oneSwitch`, `uiFreeze` |
| A guard weakened unseen | C5: the recorded closure's hashes, the pin's classification against the stage tag, the release notes, the lead's report, G9 |

## Resolution

| Class | Where it lands |
|---|---|
| M1 settings tab | Obsidian's own `Setting` chrome; its row reorder on the one carry at `Places.rows(list)` (stage 6) |
| M2 plugin host | the runtime |
| M3 chrome | `chrome` |
| M4 core reads per draw | view answers through `needs(model)`; `rules.*` through the gateway `screen/rules.ts` (C3) |
| M5 sessions | door methods (P7) |
| M6 menus | Preact layers in the window's overlay root |
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
| M20 recognition | the gesture machine (`update/gesture/`), held by the window's input engine |
| M21 service callers | new screens call only the runtime; the old screen keeps its services until deleted |
| M22, R3, R8 outcome of a write; preview core | the door gives the real outcome at once (P3) |
| M23 key scopes | `keys` |
| R4 identity | `CreatedTask` id at once, bound to the `RowKey` (P1) |
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
| Root, rev 7: per-call cost | the cross-call cache, the face cache, budget tests, `carryAt` on a target change (P3) |
| Root, rev 8: the log's references and rollback | ids mapped and resolved on replay; entries carry their inputs; only text, history and ids come from replay (P3) |
| R17 two in-memory copies while old and new coexist | never shipped together: one build constant, and the merge that switches deletes the old UI (G8) |
| R18 settings from outside writers | `PluginSettings.get()`, refreshed on `onChange` (P3) |
| R19 entry job order and the refresh rule | synchronous forms in the core (P3) |
| R20 replay rolling back the projects screen | only text, history and ids come from replay (P3) |
| R21 "the core" against the pure rules | the rules through the gateway only; `callDoor` stays in the runtime (P2, C3) |
| R22 what views a screen needs | `needs(model)` per screen, kept contexts included, recomputed on every replica change (P2) |
| R23 kept parts after a replay | `tasks.reconcile(idMap, dropped)` (P3) |
| Root, rev 8: the dispatch loop | P2's loop: door calls right after `update`, answers fed back before render, views reach the model as data |
| Root, rev 10: the work owned by place (report B) | C1–C5, G5, G8, G9; §What each finding meets |
| Root, rev 11: the guarantee enumerated what is forbidden (R1–R3) | C1–C5: one owner per concern, enforced by the checker over declarations |
| Root, rev 12: the guarantee's type machinery unbuildable and contorted (R4, R5) | §Guarantee's threat model: architecture, machine checks of every natural route, visible circumvention |
| Root, rev 13: natural routes still open, the UI computing decisions; six build blockers (R6, R7) | §The one mechanism's four rules; `WindowHost`; the blockers fixed |
| Root, rev 14: a deny-list again; no performance architecture; tools in forms never run (R8, R9, S1–S3) | P9's measured architecture; C3's allowlist; exact ownership of writes, the gateway and dispatch; C5 in the form S3 ran; §Unverified |
| R2.1 render cost | P9 |
| A note sharing the device's filter, place, day and carry (report C, §3) | the note's `Layout` variants (C4); §Old bugs and contradictions |
| R24 the UI's mechanisms not unique (the traceability's class for revisions 11–12) | §The one mechanism, §The engine table; every row's owner is a concern of the one screen |

## Migration: by concern, the main screen first, one switch

The old screen keeps its own services, untouched, until it is deleted. Nothing of the new UI reaches master, or Max, before stage 7, which switches every place at once and deletes the old UI in the same merge (G8). Until then the e2e build holds both, behind the build constant `UI`: each sees the other's writes as outside changes and rebases, as the plugin and the iPhone app do. Stages 1 and 2 are built; stages 3–7 replace revision 10's slices 3–7.

**Every stage ends the same way:** the compiler and every check of §Guards green on the `ported` folders; the model-level matrix complete for the ported concerns and the places and payloads that exist; the coverage and mutation scores at or above their floors (the floors raised to them); the stage's risk-ranked e2e subset and its budgets passing on the `--ui=next` production bundle with the trap and its ledger clean (from 3c1); the behaviour review done; a structural review (G9) clean; every weakening change of the stage reported to Max by the lead; the stage's merge tagged on `ui-refactor` (C5). A stage that needs the core starts with `backend`.

| Stage | What | Release |
|---|---|---|
| 1 | **The runtime and the core's part** (built, kept). | — |
| 2 | **Guards, freeze, the lifecycle test, the e2e harness** (built; reshaped in stage 3). | — |
| 3a | **The core's part, the core only** (`backend`; green on the core's own tests and budgets), detailed below. | — |
| 3b1 | **The construction, the compiler and the checker** (frontend-obsidian): `tsconfig.base.json` and the four composite projects with `tsc -b` (core's config made composite; `.tsbuild/` gitignored; `npm run build` on `tsc -b`); `blocked/none.ts`; `view/jsx/` (the type view with `KitNode`, `RowKey`, `vars`; the runtime with memo and `cross()`); the Vite aliases and `jsxDEV`; `screen/rules.ts`, `predicates.ts`, `geometry.ts`, `tokens.ts`, `seq.ts`, `text.ts`, `records.ts`; the engine table, `readers.ts`, `owners.ts` and `ported.json` as data; every rule of the checker's table with its reject and accept fixtures, running on the `ported` folders (`screen/` from now); the closed-type test; the CSS allowlist with the token blocks. First proves `aliasSymbol` (§Unverified). | — |
| 3b2 | **The construction, the closure and the run** (frontend-obsidian): the recorded closure (the guard project's plugin with `fsModuleCache: false` and its `fs` setup, `guards/node-closure.mjs` with `module.registerHooks`, the metafile, in both Vitest configs), `guards:pin`'s classification against the stage tag and the release script's check; Stryker (`--legacy-peer-deps`, `vitest.guards.config.mts`) and jscpd installed; the coverage and mutation floors at their first scores; the trap with its ledger (shadow roots observed) and the seams in `hostServices`, armed over the browser-level session, with the popout self-test cell; `--ui=next` builds; the matrix registry and roles, scoped to the ported concerns; the budget harness for every interaction; `UI` and the content freeze. | — |
| 3c1 | **The main screen's lists and entry, onto the construction:** `Places.main()` and `Places.note(path)` both mounted under `UI=next` (the note adapter one `ScreenHost` per Markdown view), `WindowHost` with the window's input engine, the shadow roots and the adopted sheet (the 29 `body.<class>` rules as `:host(.<class>)`), `content-visibility` cards, the kept contexts and chunked drawing, lists, cards (the face from the core), sections, entry with the warm editors slotted outside the root, the gesture machine, `ViewAnswers` reworked (P9: per-part caches, need ids computed once, no code per kind); the jscpd clones in `islands.ts` and `keys.ts` fixed; each ported folder added to `ported`. First proves the slot, the hidden layout, first open, the main columns' costs, placeholder sizes and keys in a shadow root (§Unverified). | — |
| 3c2 | **The carry, menus, selection, search and the full card** onto the construction, each concern's folder added to `ported` as it is ported; the carry-start clone fixed. First proves the description editor's re-key and the peek. | — |
| 4 | **The main screen, region by region**, each adding to the existing concerns and engines, **each region opening with its `backend` list of core rules** for what the region would otherwise compute: <ol><li>the timeline (lanes, events, the now line, zoom, slots, its drops and stretches): `rules.timelineGrid(hourPx)` for the minor and major lines (traceability A.2.264-265), `rules.minuteY(minute, zoom, dayStart)` for the now line and every time's place (A.2.7-9, A.2.66), `rules.eventPaint(color, theme)` for event colours (A.2.107, today `obsidian/ui/eventColors.ts`);</li><li>Two columns and the ribbon, the wheel, both swipes, the day turn, the Done column;</li><li>All columns and the dividers;</li><li>the panel and the tree, the filter and its title, the tree's lift and drops, the hover-open, the left-edge reveal;</li><li>the carry across every target, select mode across columns, the bulk menu, the sources and event menus, the missing file.</li></ol>Each region ends with its matrix cells, its budgets and its smoke subset. | — |
| 5 | **The note completed.** Its variants (§Old bugs 1–5, 13, 14), the inline frame, the scroll chain to the note's scroller, its matrix column complete. Its diff adds values to existing variants and nothing else: no new concern, engine, message or command kind, and no core change, since old bugs 3 and 11 take their core parts in 3a. | — |
| 6 | **The settings tab.** First the behaviour inventory gains the tab's inputs it lacks (the colour well's live preview, the code field, swatches, bins, Add buttons, sliders, dropdowns, More's rows, the login row, Copy; R3 §4). Then `host/settings.ts` on Obsidian's `Setting` as today, its confirmations on `Modal`, and `Places.rows(list)` with the adopted rows (a library subtree to the ledger), the `settingsRow` payload, its `self` look and `stepAside`. Its matrix cells. | — |
| 7 | **One switch, and the old UI deleted in the same merge.** The release gate passes (the full e2e matrix and every budget on the release bundle), an independent QA on a copy of Max's real file finds nothing, then one merge into master: `main.ts` mounts the new UI everywhere; `UI`, the old UI (`CalendarScreen` and everything only it uses, the old `SettingsTab`), the old CSS above `/* next */`, `Picks`, `Reload`, `WriteQueue`, the old services' plugin wiring, the freeze and its baselines are deleted; `obsidian/ui/failureText.ts` has moved out of the old UI first. From now the guards' reference is the release tag and master's head. | ★ with Max's phone checklist |

**Stage 3a in full** (`backend`, the core only; `docs/door.md` gains every method, field and rule it adds, since the door is the iPhone's contract too; additions to `contracts.ts` types are additive only and are the ones named here, which is the whole team's decision CLAUDE.md asks for):

1. **`DoorMethods`** in `PhoneCalls.ts` (not `contracts.ts`), one entry per method `doorMethods()` lists, `rules.*` and `rules.constants` included (the iPhone calls them through the door; the plugin reaches them in-process through the gateway, never by `callDoor`), with a type test that the two agree:
   ```ts
   type Part = "tasks" | "settings" | "history" | "projectsScreen" | "ids" | "calendars" | "projectNotes" | "today";
   type Write = "tasks" | "settings" | "device";          // "device": the projects screen or a device key
   interface DoorMethods {
   	"tasks.move":   { args: readonly [TaskKey, MoveTarget]; answer: MovedTask;  reads: readonly ["tasks", "settings", "today"]; writes: readonly ["tasks"] };
   	"tasks.drop":   { args: readonly [CarryDrop];           answer: DropAnswer; reads: readonly ["tasks", "settings", "projectsScreen", "today"]; writes: readonly ["tasks", "device"] };
   	"tasks.selectProjectNode": { args: readonly [ProjectNode]; answer: ProjectsView; reads: readonly ["tasks", "projectsScreen"]; writes: readonly ["device"] };
   	"rules.monthGrid": { args: readonly [LocalDate, LocalDate, LocalDate | null]; answer: MonthPage; reads: readonly []; writes: readonly [] };
   	…
   }
   ```
   `callDoor` gains an overload typed by `DoorMethods` (`callDoor<M extends keyof DoorMethods>(method: M, args: DoorMethods[M]["args"], context): DoorAnswerOf<M>`); the handlers' internal argument reads stay as they are, and `callDoorJson`, the phone's entry, is unchanged. A method that takes `unknown[]` today gets its argument types from its handler's reads.
2. **Answers carry only the parts a call changed** (P3): a call that did not change the history, the projects screen or the ids leaves them out, so identity is kept by omission, never by a deep compare; a budget test asserts a state-only call answers no `tasks`, `history` or `ids`.
3. **The face** (`CardFace`, today `model/card.ts:39` and `faceOf` at `:78`, moved into the core and answered as `TaskItem.face`): the tint, the stripes (`card.ts:81,89`: up to `MOST_CARD_COLORS`, striped when more than one), folded, status, the line over the title, the title's parts, the project mark, the meta, the due corner (`cardDue`, `dueLabel`), the stage mark. It is cached in the door's cross-call cache on exactly its inputs: the task's line, its child and description lines, the settings reading and today. List answers carry `rows: readonly { id, key }[]` beside the items.
4. **The rules the UI computes today**, each a pure core rule under `rules.*` (or a field of an answer), with S1's sites (`rev11-research/S1-spike/classification.txt`) and `R9` B5's:
   - `monthGrid(month, today, selected) → { title, weekdays, cells }` and `monthAfter(month, "next" | "previous")`, weeks from Monday as today (`model/monthGrid.ts:13-38`; the title from `model/taskMenu.ts:391`'s month slicing);
   - `weekDays(day) → LocalDate[]`, Monday first;
   - `stepPick(hits: TaskKey[], picked: TaskKey | null, step: "next" | "previous") → TaskKey | null`, clamped at both ends (`model/search.ts:82`, `update/search.ts:41`);
   - `pickRange(column: TaskKey[], from, to) → TaskKey[]` (`update/select.ts:39`);
   - `subtreeOf(rows, key) → TaskKey[]`: the following rows of a deeper level (`update/carry.ts:39-40`);
   - `sectionSpan(rows, head) → TaskKey[]`: a section's rows up to the next head (`update/carry.ts:226-228`);
   - `nearestSlot(slots: { id, top, bottom }[], y) → id` and `plusRingReach(ring: Box, at: Point) → boolean` (`model/carryPlace.ts:101-138`), in px or pt as `projectsDrop` takes them;
   - `branchPasses(rows) → passes per row` (`model/lists.ts:104`);
   - the entry's field: `EntryAnswer.field: { list, after: RowRef | null, level }` and the plates it removes (`model/entry.ts:170-190, 220`), and `EntryAnswer` honouring the place's `placeMoves` (old bug 3: the field stays and the task is written in the chosen list);
   - `tileRows(tiles) → tiles[][]`, rows of at most three as even as they go, written twice today (`model/entry.ts:274-276`, `model/taskMenu.ts:268-270`), and the status tiles' `four` (`taskMenu.ts:255`) as a field of `tasks.menu`'s answer;
   - `menuPlacement(panel: Box, anchor: Box, room: Box) → { side: "under" | "over" | "split", groupsAbove }` (`view/menu/TaskMenu.tsx:298`);
   - `carriedStack(carried, folded, face) → { count, stacked }` (`model/carryView.ts:69`);
   - `neighbourKey(rows, key, "next" | "previous") → TaskKey | null` for the key table (`R8` L2);
   - a project's open-task count in the tree's rows (`R8` task 7);
   - old bug 11: the note's first view reads the device's Subprojects.

   Plumbing S1 found is not the core's: emptiness, `isMany`, sequence stamps (the store's), string key parsing (`screen/text.ts`), the search row's ordinal (`numbered`), and the drop line's width, which the CSS draws from the core's `left` and `right` with `calc()` and `max()` (`model/carryView.ts:45`).
5. **The project-note index:** `projectNoteView` (`PhoneCalls.ts:487`) answers from a map of path → project kept in a one-entry cache keyed by the identity of the context's `projects` array, which the runtime replaces only when the vault's project notes change; `DOOR_CACHE` (`PhoneCalls.ts:244`, keyed by text, settings and today) is not used for it.
6. **The budget fixture:** `tests/fixtures/budget-30k.md`, about 30 KB, generated deterministically by `scripts/fixtures/budget.mjs` and committed: 300 tasks across Inbox, Backlog, Soon, Now and Done, 12 sections, 60 subtasks to depth 3, 30 dated, 20 timed, 15 repeating, 40 with descriptions, 10 projects with stub notes, priorities and labels. Never Max's file.
7. **The budgets** run in Vitest's budget project in Node on the reference machine (the Apple M4 Pro the spikes ran on), unthrottled (CPU throttling is CDP's, not Node's), as the median of 100 warm calls: P3's figures, and one write keeping every unchanged face's identity. The 4× budgets are the e2e harness's, in the test Obsidian on the same machine.

`tasks.keyOf` exists already (`PhoneCalls.ts:681`).

**What of slices 1–3 is kept, renamed or reshaped** (report A, corrected by R2.4):

| Fate | What |
|---|---|
| **Kept as is** | The runtime but `ViewAnswers`: `Program`, `Store`, `HostSession` are generic; the `Program` is instantiated once, by `ScreenHost`. Pure models `answers`, `assertNever`, `section`, `select`, `layers`, `search`, `full`, `commands`, into their concerns' folders, rewritten inside the allowlist. `recognizers/press.ts`, grown into the gesture machine (`update/gesture/machine.ts`). The e2e harness, the recorder, the shots, the budget. |
| **Moved to the core (3a)** | `model/monthGrid.ts`; `faceOf` and its helpers of `model/card.ts`; `tileRows` of `model/taskMenu.ts` and its copy in `model/entry.ts`; the decision sites of §Stage 3a. |
| **Reshaped in 3c1** | `obsidian/runtime/dispatch/ViewAnswers.ts`: it stringifies every need's arguments (`:25`) and drops every answer on any new replica (`:40-45`); it becomes P9's per-part cache with need identities computed once and no code per kind (C3). |
| **Kept, reshaped at their edges** | The drivers become engines: `focus` (through `getRootNode()`), `keys`, `overlay` (into `mount`, with its shadow root), `chrome` (with the host mirror and the adopted sheet). `scroll` (its frames and timeouts, `scroll.ts:43,130-134`, go to the time engine), `input` (one per window; its timeout, `input.ts:281`, goes to the time engine; its comparisons to the gesture machine, whose state it holds; `composedPath()`), `islands` → `editors` (its timeout, `islands.ts:124`, to the time engine; warm, slotted outside the shadow root; its duplicated interfaces and `LINE_COMMANDS` made one). The view leaves `Card`, `List`, `Sheet`, `icons`, `entry/Bar`, `carry/SelectFoot` into `view/kit/` under the kit's type view. |
| **Renamed** | `BlockMsg` → `Msg`, split into the concerns' unions; `update/menu`, `full`, `ids`, `fullActs`; `view/menu/TaskMenu`, `full/FullCard`, `carry/CarryFloat`; `BlockKey` → a key intent; the CSS root `tc-n-block` → `tc-n-screen`. |
| **Reshaped** | `model/block.ts` → `Model` (with `place`, read only in `screen/layout.ts`) and `screen/layout.ts`; `BlockLists` → `Layout.regions`, its eight flatteners → one selector of the layout concern; `model/carry`, `carryPlace`, `carryView` → the carry concern, its hit test through `screen/predicates.ts` and its decisions through the core's rules; `update/block.ts` → the hand-written root `update`, the motion concern (`withMotion`) and the context concern (`modePicked` through `root.modeWrite`); `update/search`, `select`, `section`, `acts` read their `Layout` parts, `acts` through `screen/text.ts`; `view/Block.tsx`, `BlockRoot`, `Layers`, `search/Search` → the hand-written `Screen` and kit elements; `drivers/measure.ts` → boxes per key and edge zones; `drivers/motion.ts` → one `animate` over specs, its map of every row's box (`:67`) gone for the loop's first and last measures of the cause's keys, its height hold → the pin, its box reads → measure, its `put`/`inline` → mount; `preact/compat` (`Card.tsx`, `BlockRoot.tsx`) only behind `tc-jsx` and the render engine; `BlockHost.tsx` → `ScreenHost.ts` (`blockProgram`, `entryDoor` into `update`; its `feed`/`over` gesture state (`BlockHost.tsx:269-345`) into the window's input engine as the gesture machine's state; its long-press timer the machine's hold on the time engine); `NoteBlocks.ts` → `host/adapters/note.ts`; `composeRuntime.ts`: no `NewScreens`, the feeds always given. |
| **Deleted** | The `newBlock` device value (`task-calendar:new-screens`), `NewScreens`. |

## Tests

1. **`update` (unit):**
   - every decision 55–87 and fix commit as a replayed message log;
   - every A16 rule;
   - pins (changed, gone, hidden-not-gone, a Sync re-id);
   - identity across create, rename and undo;
   - midnight during a swipe;
   - bounds;
   - every model-level cell of the matrix (G5), each place's model through the one `update`, under the coverage ratchet;
   - `swipeOnce`: every swipe cell lands where `rules.swipeLanding` says;
   - P9's render counts: one write re-renders only the cards whose face changed, in every kept context.
2. **The runtime (unit):**
   - a dependent call after a create that the replay gives a new id;
   - a pin on a created task surviving a replay re-id; ids never reused;
   - a section renamed on another device while calls are pending;
   - reconciliation after a dropped call;
   - Sync changing the task of an open full card, and the card and every kept context updating in the same loop;
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
   - the parsed-document and face caches' budgets on the 30 KB fixture.
3. **The gesture machine (unit):** every input of the inventory's section A as a stream, and its semantic outputs; at most one output per pointer move; timed steps as timers.
4. **Views (happy-dom):** what each draws for a model; the render counter; the caret and composition surviving updates.
5. **Engines (happy-dom):**
   - transitions run once;
   - running motions are cancelled before the next measure;
   - interruption;
   - scroll yields to the user;
   - focus within the event, read through the root node;
   - a chunked draw: the first chunk in the event, the rest after frames, cancelled on dispose;
   - `EngineOut` only.
6. **End to end (`scripts/e2e/`, CDP, a test Obsidian with a copy of Max's real file):**
   - **Geometry against the design boards** at rest, with a tolerance.
   - **Old against new** at rest where the behaviour is meant to be the same, in the e2e build, which alone holds both UIs (G8).
   - **The matrix** (G5): every cell's scenarios on the release bundle, with the frame logs of one concern compared across equal-variant cells, and **the trap** (C5) injected over CDP on every e2e run.
   - **Clock, network and the outside:** every seam is in `hostServices` and ships inert in every bundle; the script injected over the browser-level session before the plugin loads (and into every popout by auto-attach) arms them: the clock frozen through the core's clock (never CDP virtual time), calendars from fixtures through the `Http` seam, `outside()` and `window.open` recorded so nothing opens on Max's Mac. A run whose seams are not armed is refused by the harness before the first step.
   - **Frame recorder** from `document.getAnimations()` (and each shadow root's) and the CDP Animation domain, with row boxes sampled. It fails on: motion without a cause; single rows moving across a context; overshoot; a rest more than 0.5 px off; gaps or overlaps; a swipe landing two places away.
   - **Budget, in separate runs, on the `--ui=next` production bundle:** P9's budgets per interaction, 300 tasks at 4× CPU, both forms.
   - **Touch** through `Emulation.setTouchEmulationEnabled` and `Input.dispatchTouchEvent`.
   - **Gates:** a risk-ranked subset gates each region; the release gate is every input, in each mode, on desktop and the emulated phone view, in light and dark (what emulation leaves out: G5); the full matrix runs before the switch.
7. **The guards' own tests:** each rule's reject and accept fixtures, non-vacuity, `seq.ts`/`text.ts`/`predicates.ts`/`tolerance.ts` fixtures, mutation at or above its floor (Stryker's Vitest runner on the guard-only config, no checker, incremental, apart from `npm test`), jscpd as a backstop, the recorded closure (an empty one refused) and its hashes, `guards:pin`'s classification on recorded diffs against a stage tag, the projects' partition.
8. **Max's phone checklist at the ★** (under 5 minutes), the device-only part the emulation cannot see (G5): no visible stall on a mode switch, a filter change, a swipe or a typing pick; momentum scroll, the rubber band, the real keyboard and its rising on a pick, safe areas, a haptic on a lift, a lost lift.

## Done when

- The engine table, the readers, the owners and the ported folders (as data) are the code's; the guards' closure matches its manifest, and every weakening change since the base was reported to Max before the merge.
- The core, pure, kit and host projects build with `tsc -b` and partition the bundle; every check of §Guards is green on every folder of `obsidian/ui/next`; every **Taken** finding of §What each finding meets that code can show has its reject fixture; the coverage and mutation scores are at or above their floors.
- The matrix is complete for every inventory row, place, form and payload, and every union member is in a scenario: at model level, and in the test Obsidian on the `--ui=next` production bundle at the release gate, projected logs equal across equal-variant cells, the trap and its ledger clean in every realm.
- P9's budgets hold for every interaction on both forms: no task over 16 ms at 4× CPU.
- §Unverified is empty but for what only the device shows, and the phone checklist passed it.
- The traceability, rerun against the final revision, leaves no row over and maps every row to a concern of the one screen.
- The release gate passes, an independent QA on a copy of Max's real file finds no defect, and the phone checklist passes at the ★.
- The old UI is gone in the merge that switched, master never held both, and `docs/plugin/` says what the screen does (§Old bugs' doc changes included); `docs/door.md` documents every door addition.
- The last structural review found nothing.

## How it is built

- `backend` makes the core part of each stage that needs one. One `frontend-obsidian` agent per stage or region after that. The lead checks every diff, test and screen.
- **Behaviour review:** after each stage or region, a fresh reviewer gets the diff, the principles and that part's traceability rows, and finds where the code breaks a principle.
- **Structural review (G9):** a second fresh reviewer, who wrote none of the code, gets the engine table, the whole tree, the stage's weakening changes and the checklist of rejected findings. Its findings become reject fixtures before their fixes.
- **Weakening reaches Max as information:** before each merge into the branch's next stage and at stage 7, the lead tells Max in product words which protection was weakened and why ("a note may now change the zoom of the main screen"). Additions the machine checks are not reported. He is not asked how to write a test.
- After stages 3, 4 and 5, a fresh QA agent is told to break it.
- A finding is answered by naming the principle, the part of C1–C5 or the inventory row that let it through, and fixing that. A finding that only sabotage could produce is answered at tier 3 (§Guarantee), not with new machinery. A claim of §Unverified that fails its stage changes the spec first.

## Old bugs and contradictions, decided

From report C (§3, §2) and review R3. Each is decided by `docs/plugin/`; where the docs are silent, by what the screen does today (a rework keeps the current behaviour). The variant that carries each decision is named.

| # | What | Decided | Variant | Stage |
|---|---|---|---|---|
| 1 | A search in a note clears the **main screen's** filter (`CalendarScreen.ts:881`) | `screen.md:99`: a note has one project and no cross. A find the note's project hides opens full in the note; the device's filter is never written. This is the old bug's fix, and it is what a note shows instead | `search.reveal` `openFull` | 5 |
| 2 | A search in a note moves the main screen's funnel place | A note never writes it; on the main screen a find sets the place in every mode, as today | `context.writesPlace` | 5 |
| 3 | A note's day list can leave today with no way back | `screen.md:99`: no day navigation in a note. A find on another day opens full in the note. A field whose place the bar sets to another day **stays open where it is and writes there**, By project's rule (`tasks.md`: «поле остаётся на месте, а задача пишется в выбранный список»); the written card leaves the list as a card moved by its menu does. The entry's answer honours `placeMoves` from 3a | `search.dayOfFind` `openFull`; `entry.placeMoves` `stay` | 3a (core), 5 |
| 4 | A note starts the device's carry | A note's carry is its own; the device's carry is never written from it | `carry.device` `silent` | 5 |
| 5 | A note builds and hides a calendar | Nothing drawn, no need asked | `regions` | 5 |
| 6 | A stale comment: the block has no Undo capsule | Gone with the old code; the note's foot has Undo, ⋯, the view button and the plus | — | 7 |
| 7 | `screen.md:39` misses the top row of modes without column titles | The core's `topRow` stands; `screen.md:39` gains the case | — | 4 |
| 8 | `screen.md:99` omits ⋯ in the note's foot | `screen.md:99` gains it | — | 5 |
| 9 | The inventory marks the still layouts' divider desktop only | `screen.md:87` and the code: the phone too | — | 4 |
| 10 | `wide` is a platform, not a width | The rule stays; the UI calls it `form` | — | 3 |
| 11 | A note's first frame lacks the Subprojects row | `backend` reads the device's Subprojects in the note's first view | — | 3a (core), 5 |
| 12 | Double click on free room missing in By project | The kit's `List` owns it, so every list has it: a new task at the end of the section double-clicked, else of the last part; `tasks.md:19` says «списка» | — | 4 |
| 13 | Not seen: the phone's bar in a note; the note scrolling under a carry at the window's edge | Matrix cells; the bar rides the keyboard as on the main screen; edge scroll goes on in the note's scroller | `scroll.chain` | 5 |
| 14 | The full card and the desktop search confined to the note's frame | Kept, as today; the search's panel first scrolls the frame's top into view | — | 5 |
| 15 | The full card's project line: `tasks.md` (Задача на весь экран) says the tap opens the project's note in a new tab; the code closes the card and filters the main screen to the project | The code's behaviour stands: on the main screen the tap closes the card and selects the project in the filter; in a note it closes the card. `tasks.md`'s line is corrected to say so | `full.projectTap` `closeAndFilter` / `close` | 3 (doc), 5 |
| 16 | The settings tab's look | Obsidian's own `Setting` rows, as today | — | 6 |
| 17 | Blur and the entry | A blur ends the entry on both forms, as today (the window losing focus excepted); no variant | — | 3 |

## Questions for Max

None. Every place-shaped difference is answered by `docs/plugin/` or by the screen as it is today; the rest is how the code is built, which Max sees only as the screen staying the same in every place, and faster.

## Decisions

**Reviewed for revisions 11 to 15.** Every decision was read against C1–C5 and P9. A decision written "in the block", or allowing several stores, CSS motion, a flag per place, logic in a host or an engine, or an Obsidian `Menu`/`Modal` in the screen, is revoked or rewritten; each keeps its product behaviour (revision 11's three undeclared changes, to decisions 51, 52 and 54, are withdrawn), and a rewritten one says so in its first words.

| Decisions | Verdict | Why |
|---|---|---|
| 1–11, 13–18, 20–25, 27–30, 32 | Kept | The runtime: no place, no host, no mechanism of the UI |
| 12 | Rewritten | Polling starts with the first screen that draws a calendar |
| 19, 26 | Rewritten | `ScreenHost` draws first and opens the session; adapters reach nothing of the runtime |
| 31 | Rewritten | One store per screen, the one `Program` (H5) |
| 33 | Rewritten (15) | Four composite projects emitting declarations, built with `tsc -b`; one checker over the bundle's metafile; its rules a table, each with its fixtures |
| 34 | Rewritten (15) | The CSS an allowlist inside shadow roots; `:host(.x)` for body classes; token-override blocks; `content-visibility` |
| 35 | Revoked | The line freeze with allowances: G8's content freeze |
| 36 | Rewritten (15) | Hosts are the adapters and `WindowHost` in both forms, mid-chunk too |
| 37 | Rewritten (15) | The e2e build for the old-against-new comparison only; the trap armed over the browser-level session |
| 38–41 | Kept | The fixture, the test Obsidian, the recorder, shots |
| 42 | Rewritten (15) | The budget: no task over 16 ms in any interaction |
| 43 | Revoked | A device flag for one place: one build constant; readiness kept |
| 44 | Rewritten | The inline frame's height, held only by the pin |
| 45 | Rewritten (15) | Acts are kit props; one input engine per window holds the machine |
| 46 | Rewritten (15) | Static values and `vars` by the render engine, time by motion |
| 47, 49, 60 | Kept | Generic already |
| 48 | Rewritten (14) | Motion measures only named keys, first before the render and last after |
| 50 | Rewritten (15) | No Obsidian `Menu`; the month grid, the tile rows and the panel's placement the core's |
| 51 | Rewritten (15) | The look from the entry's `Layout` part; a warm field; a blur ends the entry on both forms, as today |
| 52 | Rewritten | The project line keeps today's behaviour (close and filter; in a note close); the help page corrected |
| 53 | Rewritten | The reveal's alternatives are closed variants; the note's are old bugs 1–3's fix |
| 54 | Rewritten (13) | One carry, each payload keeping today's look and start; the hit test the gesture machine's |
| 55 | Rewritten (15) | The editors engine's islands slotted outside the shadow root; the mount engine attaches the roots |
| 56 | Rewritten (14) | The same, and the bar's buttons painted by DOM order |
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

33. *(Revision 15: rewritten.)* **One checker reads the code as the compiler does, and its scope is the bundle.** The compiler first: four composite projects (core, pure, kit, host), each emitting declarations only into its own `outDir` under `.tsbuild/`, extending `tsconfig.base.json`, built with `tsc -b` (C1; S1 built them in 0.28 s cold, 0.12 s warm). `uiRules` covers what configuration cannot: it opens each project with TypeScript 7's own API (`typescript/unstable/sync`; `typescript` pinned exactly), reads every input of esbuild's metafile outside `node_modules` (a `.js` input is refused), and resolves every name, member, shorthand, import and type to its declaration, so an alias, a string key, a destructuring, a wrapper or `Object.assign(el.style, …)` reaches the same declaration. S1 ran `noCompute` this way over the whole of today's `next/` in about 0.2 s, typing operands with one batched RPC per file. Its rules are the rows of §Guards' rule table, each one rule with its own reject and accept fixtures and a message that names what to use instead. Its data (the engine table, the readers, the owners, the ported folders) is read from `tests/guards/` and `guards/`; a change to it is classified by `guards:pin` (C5).
34. *(Revision 15: rewritten.)* **The new CSS is an allowlist, adopted into shadow roots.** Below `/* next */`: the token block on `body` and its override blocks, then the components. The override blocks redefine existing tokens only and define no new names: `body.theme-light`, the phone form `body.tc-form-phone` (written by `chrome`), and `@media (forced-colors: active)`; the token block's other `@media` are only `prefers-*` (the colour scheme, reduced motion). Outside the token blocks no `@media` or `@container`: a width, a platform or a form is never a CSS condition of a component (decision 10). The component rules are adopted by every shadow root: `:host` and `.task-calendar` stand at their left; a body class (`theme-light`, the form, `tc-cancelling`) is read as `:host(.<class>)`, never `:host-context()` (Safari lacks it). A selector names only the kit's `tc-n-…`, the motion engine's `tc-m-…`, an `is-…` state or the root; a state is an `is-…` class, an attribute selector, `:has()`, a pseudo-class of what the user does, or a mirrored body class Obsidian does not set; `:has()` never names a variant class; **a state, a variant or a user-action pseudo-class styles only its own element**: it stands in the rightmost compound, and no combinator follows it; **under a state only paint properties are allowed** (colours, `background`, `border-color`, `outline`, `opacity`, `visibility`, `filter`, `box-shadow`, `cursor`, `text-decoration`, and `content-visibility` on a kept context's region, which stands in the frame's one stacked cell and moves nothing around it), so neither a size nor a position changes with a state, and no custom property set under a state is read by a property outside that list; no in-flow pseudo-element given content or a size. Cards set `content-visibility: auto` and `contain-intrinsic-size: auto var(<one-line card height token>)`. `vars` names are `--tc-v-…` and declared in the token block. **Positioning has three owners, all the kit's:** `position: fixed`, `inset` and `z-index` only on the **layer** family (`tc-n-layer…`); `position: absolute` with offsets and `z-index` only on the **over** family (`tc-n-over…`); `position: absolute` with offsets but no `z-index` only on pseudo-elements and the **deco** family (`tc-n-deco…`), which takes no act and no children and sets `pointer-events: none`. **Time and scroll belong to engines:** any property whose effect is time- or scroll-driven (transitions, animations, `@keyframes`, `@starting-style`, view transitions, scroll timelines, scroll snapping, `scroll-behavior`, `will-change`, longhands included) appears only under a `tc-m-…` class and never combined with a state; durations and easings only as `--tc-motion-…` tokens. The root states `overflow-anchor: none` and `scroll-snap-type: none`. Slice 3's classes are renamed into these families in 3c1, and its foot fade on a state becomes the motion cause `fadeAside` (decision 58).
35. **Revoked by revision 11.** Decision 35's freeze (lines per directory, «shrinking passes», allowances with a commit and a reason) let the old UI grow beside the new (report B, H16). It is replaced by G8's content freeze. The two lines that route the old screen's task links through `outside()` (decision 37) are already in the baseline taken in stage 3.
36. *(Revision 15: rewritten.)* **The lifecycle test's hosts** are the adapters and `WindowHost`, registered in `HOSTS` (`tests/hostLifecycle.test.ts`) as `mount(context, form) → { startGesture, startChunk, unmount }`, by their path under `next/host/`; a host not registered fails, and each runs in both forms. `tests/helpers/LeakCounter.ts` counts listeners on every target of the window's world and every shadow root, `on…` handler properties, observers, timeouts, intervals, message-channel posts, frames, immediates, microtasks not yet run, running animations, scopes, Obsidian event references, subscriptions and adopted sheets, after queued microtasks have run.
37. *(Revision 15: rewritten.)* **The e2e build** is `obsidian/e2e.ts`, built by the harness into `E2E_HOME/build/main.js` (`node esbuild.config.mjs production e2e --outfile=…`; `npm run build:e2e` into `.e2e/build/`) with the first line `// task-calendar <version> e2e`; the root `main.js` is never touched (`--outfile` without `e2e` is refused). It is the only build that holds both UIs (`UI`, G8), and it serves only the old-against-new comparison until stage 7. **The matrix, the trap and the budget run on the production recipe:** `npm run build -- --ui=next` builds the bundle with the release's esbuild options and `UI` defined `next` into `.e2e/next/main.js` (first line `// task-calendar <version> next`); only `npm run release` refuses `next` before stage 7. The trap with its effect ledger is injected over the **browser-level** CDP session: `Target.setDiscoverTargets`, `Target.setAutoAttach` with `waitForDebuggerOnStart` and `flatten`, then on each attached target `Page.addScriptToEvaluateOnNewDocument` with `runImmediately` and `Runtime.runIfWaitingForDebugger`, every waiting target resumed, installs idempotent (S3). Coverage comes from CDP's profiler. After copying it into the scratch vault the harness checks the copy is this run's build: its first line exactly that of `manifest.json`'s version, written after this run's build started and after the last commit. **Every seam lives in `obsidian/hostServices.ts` and ships inert in every bundle:** the clock, the `Http` (default `obsidianHttp`), `outside()` (`open`, `browse`, `runScript`) and `window.open`/`location.assign`. Only the injected script arms them, through the one global the host-services row owns, and the harness refuses to start a run whose seams did not report armed, so nothing opens on Max's Mac.
38. **The fixture** is taken once into `.e2e/fixture/` (gitignored with all of `.e2e/`: it holds Max's tasks, never committed) and kept, so baselines stay comparable; `--refresh-fixture` takes it again, and the baselines are recorded again after it (`--update`). The clock stands at 14:20 of the day it was taken. Google's secrets are replaced (`e2e`), the project notes come as stubs holding only the project tag, and the calendars (Google through the fixture network, the phone's and the work files at the paths the settings name) are made up for that day. Every path the fixture names (the tasks file, a note, a calendar) must stay inside its vault: an absolute one or one climbing out (`..`) is refused, when the fixture is read from Max's vault and when the scratch vault is written.
39. **The test Obsidian of the harness** keeps its profile and vault under `E2E_WORK` (default `.e2e/work`); the harness refuses an `E2E_WORK` or `E2E_HOME` inside `~/Obsidian` or inside the repository outside `.e2e/`, comparing paths as the disk does: the nearest part that exists resolved by `realpath` (links, and on macOS the case the disk holds), the rest appended, then compared without regard to case (so `~/obsidian/e2e` is Max's vault). The vault is written over in place each run (a copy of Max's tasks is never moved to the Bin). A port from 9345 free by `ps` and `lsof`; if another session takes it between the check and the launch, the instance just launched (it has no port of its own then) is ended by its own process id and the launch tried on the next port. A launch in the background (`open -n -g`) with Chromium's switches against an occluded window's throttling, and focus emulation; with those, CDP's own input reaches a window behind others, so every touch, click, wheel and the closing of Obsidian's first dialogs go through `Input.dispatch*`, never a click made in the page. Each platform and theme starts clean: the fixture's tasks file written again, the plugin's device storage cleared, the page reloaded into the platform.
40. **The recorder** keys a row by the key the view gives it (`data-row`, the model's row key; on the old screen `data-card`, its task's id), or by its whole title where it has neither, with a count among rows of the same base; each element keeps the key it was first given, so rows of one title never swap numbers as they move, and a key passes to another element only once its own left the DOM, so a remounted row keeps it. It reads rows inside every shadow root. A carried card is named by its key (`__e2e.keyAt`), never by a cut title. Each row is judged from the frame it first shows in; a row's box takes in its margin below (a folded parent's fold); the place is the leftmost column showing plus the day after today, with its distance from the stage's edge (the view's left or a docked panel's right). The rules, each proven on a frame log made to reproduce a past bug (`tests/e2e/frames.test.ts`): a step that never settles; a row gone for some frames and back (a remount's flash); in a context step, any row animated or between its two places (cards flying in on a project switch); a row the step does not move that moves, and any row that leaves its place and comes back (a jump under a lift); in a swipe, each column moving as one (columns may change their widths, RibbonColumns), one way, never more than 120 px between two frames (the All columns jerk); overshoot; a rest off; a swipe resting off its column's edge or two places away; gaps or overlaps; a gesture that moved nothing. Rows a chunk has not yet committed are not judged until they show. A step waits a person's pause (500 ms) before acting; the mouse lifts a card by moving it (holding opens its menu), the finger by holding; a swipe starts clear of the divider; the trackpad's wheel goes at a delta every 8 ms. The smoke set adds All columns tried sideways (nothing may move), a project chosen and all again, and a card lifted and held.
41. **Shots** are clipped to the view (Obsidian's chrome is never compared) and compared at 5 of 255 per channel on at most 0.2 % of the pixels (the timeline 6 on 0.3 %), and no more differing pixels may lie together (8 ways) than 4 CSS pixels' worth at the shot's ratio (36 at 3×): a short label one pixel off on the phone view is a tiny share of the shot but a block of touching pixels along its strokes, while the GPU's rounding scatters single ones. A missing baseline fails unless `--update`. Masks are listed by selector and kept with the baseline. A shot waits until every chunk has committed.
42. *(Revision 15: rewritten.)* **The budget** comes from a CDP trace of each interaction (P9's list) and a fixed tail of 1.2 s (longer than any transition and any chunked draw); the recorder starts before the trace and the wait for rest runs after it, so the harness's polling is never traced. Every harness evaluation marks its run in the page (`console.timeStamp`, `HARNESS` in `frames.ts`), and its script, with the frame sampler's own function, is cut out. From the rest: the page's main thread, its frames (each `FireAnimationFrame`), the script run in each frame (the union of the script events, nested ones once), every task, and the first commit after the interaction's mark. It fails a trace with no frame or no script of the page (nothing passes on an empty recording), **any task over 16 ms**, a continuous gesture's frame with 8 ms of script or more, and a first changed frame later than the frame after the event; it reports the average over the frames that ran script and the longest task. The CPU is throttled 4× (`Emulation.setCPUThrottlingRate`), 300 tasks, both forms. There is no other threshold.

Made while building slice 3 (the note block behind `newBlock`; reviewed above):

43. **Revoked by revision 11.** `newBlock` as a device value (`task-calendar:new-screens`) was a flag per place (report B, U2, H18). G8 replaces it with one build constant for every place; no device or synced value chooses a UI. What it carried that is not a flag stays: the runtime's readiness is told when `VaultProjects.ready()` resolves (a plugin loaded into an indexed vault hears no `resolved`), and `core/settings.ts` is not touched. The runtime is composed with its feeds always; a place without a calendar asks for no events (decision 12).
44. *(Revision 11: rewritten.)* **An inline frame's height is the stylesheet's:** with the frame `inline` (a note's `Place`, read in `screen/layout.ts`), the kit's `Frame` is a column as tall as its stack up to `--tc-block-max-h`, past which the stack scrolls; nothing is measured for it. During a carry the region holds its height as it stood, by the pin under the lift (P6), a motion cause like any other, never a frame-specific hold. The old block was at times 1 px short of its rows (its stack scrolled by a pixel); the new one is not, and the e2e comparison crops that pixel (`fit`).
45. *(Revision 15: rewritten.)* **Views take no event handlers.** A kit element that can be pressed carries an `act` prop (with its key and value); the render engine writes it as data attributes; the window's input engine delegates by them across the screens' shadow roots (`composedPath()[0]`), makes geometry values of the event's numbers and advances the gesture machine (`update/gesture/machine.ts`, grown from `press.ts`), whose state it holds; only the machine's semantic outputs (a press on an act, a lift, a target change, a drop) become messages, and `update` turns an act into its message (its key parsed through `screen/text.ts`). The kit's type view has no `on…` attribute at all.
46. *(Revision 15: rewritten.)* **Inline styles and CSS variables come from the model, split by time.** Values at rest (a row's level and branch offsets, a folded card's room, the select circle's room, the regions' widths, a time's place on the timeline) are computed by the core's rules and written by the render engine as custom properties, only when they differ; a per-element data value (a fraction, a project's colour) is a `vars` entry, written the same way. Values that change over time (a transition, the transient channel) are the motion engine's. A variant that sizes a box is a kit element of its own kind with literal classes, and a class that comes and goes is an `is-…` state that sizes nothing (decision 34).
47. **A card's marks** are the core's `TaskItem.marks`: the dot of a task in progress (`progressDot`, the card's `is-progress`), the description's mark (`description`) and the subtask counter (`count`); the card reads no status or `can` field for them. Its `data-status` paints only the full card's subtasks (done ticked, given up struck through).
48. *(Revision 14: rewritten.)* **Motion within one context** is a FLIP over keyed rows, the motion cause `rows`, which names the keys it may move: the loop measures those boxes only, once before the render (first) and once after it (last), and the motion engine slides what moved from first to last and fades in what is new, through its one `animate` over the cause's `AnimationSpec`; another context (mode, project, the first read) draws in place. A row that leaves fades where it stood and then its room folds, as the old `Motion.leave`: the engine keeps its node over the frame, fades it, and the rows under it slide up after the fade while the region holds its height (the e2e step «a card done leaves its list» judges it frame by frame, in every place).
49. **Layers** mount in the overlay host's node, under their own `.task-calendar` root; `motion` places them from measured anchors (`data-n-anchor`) and fades them in and out; the close's end is `layerGone`, which unpins the lists. A write pick runs its door call at the tap and the lists change once the sheet has gone (R10).
50. *(Revision 15: rewritten.)* **The task menu** is a kit layer in the one layer stack (no Obsidian `Menu`). It reads the core's `tasks.menu`/`tasks.bulkMenu` as a view need while open, its tiles already in rows (`rules.tileRows`; the status tiles' `four` a field of the answer); its copy of the card is measured once per menu (`wholeWidth`, `grownStart`); the panel is placed by the core's `rules.menuPlacement` from measured boxes, under, over or split (`groupsAbove`), and a page change re-places only the panel; a closing menu keeps what it drew; the repeat page writes once at the close (`repeatPage.end`); the month page is the core's `rules.monthGrid` with its title (added in 3a; the iPhone draws a month too), never date math in the UI. Typing picks (Rename, Add subtask, New section, New project) focus their field inside the tap, once it is visible. As the old menu: it opens once its card is in view, the card's scroller gliding it in first in the collapse time (the scroll intent `intoView` over the scroll concern's chain: a list, a note's stack and then the note itself; a finger on it calls the menu off); on the desktop a second click within 250 ms of the one that opened it renames (the gesture `secondPress`, the old double click); the start of the task's description stands by the copy of its card, over or under it where the panel is not, rendered by Obsidian through the editors engine (the old `DescriptionPeek`, an island outside the shadow root): a tap on it opens the full card, a note's link opens the note.
51. *(Revision 15: rewritten.)* **The quick entry** runs the core's `entry.*` steps over a session kept in the model, and its jobs in the core's order (`entryJobStep`, `queuedEntryJobs`) in the entry concern (`runEntryJobs`, after every message). The field's place is the entry answer's `field` (3a). The look (`entryLook`) and the cards about to be drawn for a step that asks for them (`coming`) come from the entry's `Layout` part, never handed in by a host. The field is Obsidian's editor, the screen's one warm title field re-keyed into the row's slot (the editors engine), restyled by a CodeMirror theme from tokens; on Enter the written card takes the field's box and the warm field moves to the next row's new row key. While typing, the foot fade is a second element (sizing by state is forbidden); on the phone the room at a list's end is a spacer row. The bar is the kit's with the variant `entry.bar` (`keyboardBar` on the phone, `capsule` on the desktop). **A blur ends the entry on both forms, as today** (the window losing focus excepted).
52. *(Revision 12: rewritten.)* **The full card** is a layer inside the screen's frame, in every place, pinned by id and following Sync through the needs `tasks.find`/`tasks.fullTree`; the description runs in Obsidian's editor (the screen's warm description editor, re-keyed) through the core's `description.*`; its subtasks' circles are drawn as the old full card's (width 0, the card's padding kept); its rows are keyed `full/<id>`. **A tap on its project line keeps today's behaviour:** on the main screen it closes the card and selects the project in the filter (`tasks.selectProjectNode`); in a note it closes the card and writes nothing (the variant `full.projectTap`: `closeAndFilter`, `close`). `tasks.md`'s line that says the tap opens the project's note is corrected (§Old bugs 15). Its task and subtasks are read by the screen's filter (`tasks.find(key, text, filter)`, `tasks.fullTree(item, filter)`): fixed to a project, they show no folder mark, as the core decides.
53. *(Revision 12: rewritten.)* **The search reveals a pick** through `tasks.reveal`, one reveal for every place; each alternative is a closed variant of the search's `Layout` part (C4). `reveal`: `clearFilter` (the main screen: a filter that hides the task is cleared, `screen.md:114`) or `openFull` (a note: the task opens full in the note; the device's filter is never written). `dayOfFind`: `moveDay` (the day list goes to the task's day) or `openFull` (a note). The funnel place moves to the task's (Done, Inbox for Backlog, Soon, the calendar) where `context.writesPlace` is `write`. A Done task without the ribbon opens full; any other is ringed and scrolled into view (the scroll intent `reveal`). The step through results is the core's `rules.stepPick`. The note's choices are the fix of old bugs 1–3.
54. *(Revision 13: rewritten.)* **The carry is one, for every payload and place:** a card, its subtasks, the picked cards, the plus, a section, a tree node, a settings row, a timeline slot, with one slice, one set of messages, the gesture machine's one hit test and the core's drop rules. **Each payload keeps today's look and start, as a closed variant:** a card, the picked cards, the plus and a timeline slot lift on a finger's hold or a mouse's move, fly as a float and leave a dashed waiting place, and no other card moves; a section floats and waits where it stood, its landing a drop line (decision 59); a tree node's row follows the finger with a line where it will land (`screen.md:52`); a settings row follows the finger itself, starting on a press of its grip with no hold, while the rows it passes step aside (`stepAside`, `settings.md:9`). The geometry is measured once after the lift renders, per scroller and target, and kept fresh by `measured` while edge scroll moves a scroller; the target is the hit test's list or row and the core's place in it, recomputed by the gesture machine on each move and told only when it changes; the device's carry is reported (`startCarry`, `carryAt` on a target change, with the place's `PlaceWrite`) only where `carry.device` is `report` (the main screen); the carried cards' subtasks (`rules.subtreeOf`) leave the pinned snapshot; on a drop the pin goes at once and the float flies onto the landed card, on a cancel the pin stays until the float is back. A long mouse click does nothing, a right click opens the menu.
55. *(Revision 15: rewritten.)* **The editors and the mount**: the editors engine holds the screen's warm title field, its warm description editor and the description peek, each an island in the light DOM, a child of the shadow host projected into its row through a named `<slot>` (S2: inside the root Obsidian's editor loses its styles, its focus and its `[[` suggestion), with CodeMirror configured to delegate its keys, focus and scroll; the mount engine makes, places and removes the screen's own node in its host (a leaf's content; after `.cm-contentContainer` or first in `.mod-footer` of a note), attaches its shadow root and the overlay node's per window, and adopts the rows of a settings list; it writes Obsidian's nodes around the screen (`--tc-block-lift`, `.cm-content`'s growth). Adapters and `ScreenHost` write no DOM.
56. *(Revision 14: rewritten.)* **A field opened in an inline frame grows it** as any row does, to the CSS's tallest (`--tc-block-max-h`), past which its stack scrolls: the old `BlockHeight` fitted the block to what its stack held, the field among it. Only the pin under a carry holds the region's height. Measured in the test Obsidian (a real click on the plus, the desktop): with Today holding a task the old block grew 571→632 px as the new does; on the e2e fixture, Today empty, the old one stayed 572 px while its stack held 606 px in 558 (`BlockHeight` missed the field row's late height, a race of the old block: its field's bar stood 48 px under the frame's foot, scrolled out), and the new one grows to 620 px. On the phone both grow by 60 px. The new screen keeps the old rule, not its race. The e2e shot of a field open in a note compares the frame top-aligned (`fit` cut at the bottom): the old block's shot stops at the window's foot. The bar's buttons each paint over the one before by their order in the DOM (no `z-index` inside the bar: decision 34), as the old bar's: a shrunk shift is covered by the flag. Old defects the e2e run shows and the new screen does not repeat: the written card flashing between field and card (19–21 frames), and the old block sometimes cutting the written card's bottom (4 px) after typing.
57. *(Revision 14: rewritten.)* **The e2e matrix run** (`npm run e2e -- matrix [place form theme]`, G5) runs every cell of the registry on the `--ui=next` production bundle, each platform and theme starting clean, every step judged frame by frame by the same rules in every place, with the trap injected; one concern's logs, projected onto the key roles of `tests/matrix/roles.ts`, are compared across the cells whose variant values are equal. The old-against-new comparison stays an input to it: the e2e build records the old UI's baselines (`UI` `old`) and compares the new one with them in the same run on the same copy of the file. A caret's blink (CodeMirror's `cm-blink`) is no motion of the screen's: the recorder and the rest wait leave it out. `npm run e2e -- budget [place]` is the budget (decision 42).
58. *(Revision 11: rewritten.)* **The plus carried** (the old screen's `beginNew`) is a carry payload: pressed and moved, the plus lifts as a float over the same places as a card, a dashed ring standing in its place (solid and filled while the finger is over it, `rules.plusRingReach`); let go on a place, the field of a new task opens there in the same tap through the core's `entry.openAtDrop` (`openAt` in the projects list, `openAtEnd` at a list's end) and the float lands in the field; let go on its ring or nowhere, it flies home. While a card or the plus is carried the plus and the capsule beside it fade aside: the motion cause `fadeAside`, run by `motion` (no CSS transition, decision 34; the old `QuickEntryController`'s look kept); a lifted section leaves them. The region's height is held from the lift's own drawing, by the pin, so a lift that takes rows out of the lists (a section, a parent's subtasks) never shrinks it.
59. *(Revision 11: rewritten.)* **A section lifted by its header** (the old `GroupDrag`) is a carry payload and waits where it stood, as a carried card does: its header's name and plate's words hidden, their places kept; its rows are the core's `rules.sectionSpan`; its landing is the drop line over the slot (`groupPlaceOf`, in carry geometry), and nothing under it moves while it is carried. The old list closed over the lifted section and every row under it left and came back; that is not repeated. Let go on another slot it moves there (`tasks.moveGroup`) and the float folds onto its header. A header tapped opens its menu (Rename, Remove section as the core offers them); the name typed in place ends through the core's `sectionName.end` for Enter, Escape and a tap away alike.
60. **A finger's press the recognizer reads ends with no click after it** (`input` cancels its `touchend`): the browser's click would land on what the tap's outcome put under the finger (the plus hid and the field's room took its place, and the click took the field's focus). The e2e block shots mask Obsidian's status bar and the phone's navigation bar (`.status-bar`, `.mobile-navbar`) where they stand over the block (decision 41). A drawing that moves no rows leaves the motions under way running (a carry's next message must not stop the rows still sliding) and reports no card leaving.
