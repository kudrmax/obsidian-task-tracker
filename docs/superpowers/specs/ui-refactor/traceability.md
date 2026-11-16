# UI refactor: traceability

This file maps every row of the two inventories to the mechanism of `../2026-11-15-ui-refactor.md` (**revision 11**: one screen, places as data, one owner per concern) that owns it, the principle behind it and the stage that rebuilds it.

Inputs:
- `inventory-state-effects.md`: A.1 (45 facts), A.2 (565 locations), B.1–B.5 (819 effect call sites), B.6 (180 event sources);
- `inventory-behaviour.md`: A (203 inputs), B (84 motions), C (84 measurements), D (52 screen states).

Doubts were checked in code at `aa0c20f6`:
- `core/application`: `PhoneCalls.ts` (the door), `composeCore.ts`, `TaskServiceImpl.ts`, `CalendarServiceImpl.ts`, `calendarDay.ts`, `UndoHistory.ts`, `TaskIdentity.ts`, `TaskRules.ts`, `UndoSteps.ts`, `QuickEntrySession.ts`, `CalendarPolling.ts`, `SettingsServiceImpl.ts`, `contracts.ts` (`TaskKey`, `ProjectsScreenState`, `CarryState`), `projectsScreen.ts`, `screenPlaces.ts`, `viewLayout.ts`, `stackedRows.ts`;
- `obsidian/`: `main.ts`, `compose.ts`, `infrastructure/` (`VaultTaskFileStore`, `PluginSettings`, `LocalProjectsScreenStore`, `VaultProjects`, `GoogleAuth`), `ui/` (`CalendarScreen`, `DayData`, `DayPeek`, `Reload`, `Swipe`, `layouts/`, `SettingsTab`, `kit/Panel`).

**Revision 11's rerun.** Every row was re-examined for one question: is its owner a concern of the one screen, or a place? Revision 10's owners were already mechanisms (a driver, the layer stack, a gesture, a selector, the runtime), with one exception: the lines owned by "the block host", "the settings-tab host" or `model.place = {kind: "block"…}` (31 lines of the tables below: 20 of the note, 11 of the settings tab).
- Rows of embedding a note (its registry, placement among Live Preview and Reading view, `--tc-block-lift`, presses kept from the editor) are owned by the note adapter and `drivers/mount.ts`, the only per-place code G2 allows; their stage is 5. Every other row of the note (its height, its keys, its focus, its modes) is owned by the same concern as on the main screen, with the note's `Place` gating it (`Layout`).
- Rows of the settings tab are owned by the one screen at `Places.settings()`: its row reorder by the one carry, its step aside and settle by `motion`'s causes, its rects by carry geometry; stage 6.
- `islands` is renamed `editors`, `recognizers/` is the input concern's private part, and `motion` reads boxes through `measure.boxesNow` (the owner table).
- Stage numbers are revision 11's (below). Rows tagged 3 were built for the block in slice 3 and are reshaped onto the one screen in stage 3; nothing in a row's owner changes with that.
- A new class, R24 (§Earlier classes), records the ownership fault and its resolution. No row is left over.

**How revision 10's rerun was made.** Every row was re-examined against revision 10, not only the 213 rows left over from revision 9.
- Owners were rewritten in revision 10's words:
  - P2 step 3: each screen has a pure `needs(model)` listing the view answers it draws (its context's view, the neighbour day or place under a swipe, an open full card's or menu's task, the search's results); the runtime computes one answer per need, memoised by (replica, minute, need), and every replica change recomputes every mounted need in the same loop. So "view answers in the model" became **view answers for the screen's `needs(model)`**, and the full card, menus, search and the day peek name their need;
  - P2 step 3 and §Guards: "the core" a selector may not call is `callDoor`, the replica and the view answers; the pure rules (`rules.*`) may be imported by `update/`, selectors and `motion`. Rows that use them say so and lose their tag;
  - the dispatch chain has a depth bound;
  - replay: entries run with their recorded `nowMs` and projects screen but the current settings; the tidy on a new base runs first and is not a log entry; the replay's old→new id map is applied to the whole model (row keys, pins, selection, an open card or menu, an entry's target), and ids are never reused; the kept parts are reconciled by a door call after a dropped call; a changed `tasksFile` counts as a file that has gone;
  - P8: on unload the persistence queue outlives the plugin object until it is empty; after the switch the old `CalendarService` polling is not started, the network lane is the only fetcher.
- Principles keep their numbers. P2 is added where an owner names `needs(model)`; P3 where it names the re-id map or reconciliation; P8 where it names the queue outliving the plugin object or the only fetcher.
- Slices are revision 9's. The reconciliation door call is placed in slice 1 by this file, with `tasks.keyOf` and the synchronous forms, as `backend`'s core part.
- R1–R22, M1–M23 and the faults at the root of revisions 6, 7 and 8 were checked against revision 10's own text and the code it relies on (§Earlier classes against revision 10).
- New classes are numbered on from R23. Their rows carry `[R#]` in the owner column and are gathered in **Rows that do not fit**.

The script checked that every row id appears exactly once in the mapping tables. It found 0 rows unmapped and 0 mapped twice.

## The door against what the plugin calls

Revisions 7 to 10 rest on one claim: the door covers every core call the plugin makes. It was checked three ways.

**Every service method by name.** All methods of `TaskService` (128), `DayService` (8), `UndoService` (5), `CalendarService` (6), `SettingsService` (31) and `ScreenSettingsStore` (2) were listed from `contracts.ts`. Each is either in the door's `SPACES` or in a `HOST_*` list (`DOOR_COVERAGE`, `PhoneCalls.ts:1076`); `tests/application/PhoneCalls.test.ts` keeps it so. What the plugin's UI calls that the door leaves to the host:

| Method | Called from | Who does it in revision 11 |
|---|---|---|
| `TaskService.onChange` | `CalendarScreen.ts:445`, `ProjectBlocks.ts:104` | the runtime's outside-change handling (the pending log replayed by id); the old screen keeps its service until stage 7 deletes it; the two never run together for Max (G8) |
| `UndoService.onChange` | `BottomCapsule.ts:33` | `canUndo`, a view answer over the replica's history (`viewsChanged`); the old screen keeps its service until stage 7 deletes it; the two never run together for Max (G8) |
| `CalendarService.onChange`, `keepFresh` | `CalendarScreen.ts:449, 477` | the runtime's file watch and the network lane, the only fetcher after the switch (P8); `CalendarPolling` run unchanged; the refresh rule as the core's pure decision the network lane asks |
| `DayService.onDayChange`, `catchUp` | `CalendarScreen.ts:451, 504` | the runtime's clock |
| `ScreenSettingsStore.onChange` | `viewSettings.ts:117` | `PluginSettings.get()` in the replica, refreshed on its `onChange` |
| `SettingsService.bindClientSecret` | `SettingsTab.ts` | the settings adapter (`host/adapters/settings.ts`); the call through the runtime |
| `GoogleAccount`, `WorkCalendarSetup` | `SettingsTab.ts` | host-owned (`DOOR_COVERAGE`); the token goes through the runtime's settings port (P3) |

**The classes the UI imports from `contracts.ts`.** `QuickEntrySession`, `SectionNameEntry`, `RepeatPage`, `DescriptionDraft` and `DayBoundary`, and the pure rules. The door answers the sessions as `entry.*`, `sectionName.end`, `repeatPage.end`, `description.*` and `boundary.*`, and every rule the UI calls as `rules.*`. `QuickEntrySession`'s job runner is not a door method; revision 10 has `backend` give it a synchronous form, a step function over `EntryAnswer` (checked: `QuickEntrySession.ts:10-49` runs over a `TaskService`-shaped port today, so the form is new core code, not the class run unchanged).

**The same answers.** The door runs the same `TaskReads`, `TaskWrites` and `UndoSteps` as the services, over the context handed in. Differences found:
- three places where the door answers as the phone's host: the calendar carry-over, a feed's problem, the project notes' readiness. Revisions 8 to 10 add them to `DoorContext` as `host`, `feedProblems` and `projectsReady` (R12 resolved);
- shapes: events in milliseconds, `days.boundary` as `{startHour}`, `calendars.isPast` taking `{endMs}`, the entry as `EntryAnswer`. With no facade, only the new screens see them.

**The two UIs side by side: only while building.** Revision 11 never ships them together: the new UI is chosen by one build constant (`UI`), only the e2e build holds both, and the merge that switches to the new UI deletes the old one (G8). While it is built, in the test Obsidian and the e2e comparison, the old screen keeps `composeCore`'s services and the new screen runs on the runtime. Checked in code:
- **The file is safe.** `TaskServiceImpl.mutate` applies its operation to the current text inside `vault.process` (`TaskServiceImpl.ts:694-716`), and `UndoHistory.step` takes a step back over the file as it is now. The runtime's `fn` returns the text unchanged when the base moved, and replays. Each screen sees the other's writes as outside changes. No write is lost, and a stale one fails with today's notice.
- **Tidy does not loop** while both read the settings the same way: both tidy with the same core, so each tidy is a no-op for the other. Revision 10 makes the runtime's settings `PluginSettings.get()`, refreshed on `onChange`, so both read the same settings.
- **What is not in the file** is held twice: the undo history, the ids and the Projects screen state. Today the leaf and every block share them (one `composeCore`, `compose.ts:61-73`; `ProjectBlocks` gets the same `deps`). Revision 10 accepts two copies only while building and never ships the pair (R17 resolved).
- **Settings** go through one `PluginSettings` for both (`main.ts:36-45`), which merges over a fresh read, so none is lost. The runtime reads its settings from it (R18 resolved).
- **After the switch** no old screen and no old settings tab remain (stage 7 deletes them in the same merge). What of `createServices` stays for `main.ts` (`main.ts:71-98`) is plugin plumbing, not UI: the place hand-over (`setFunnelPlace` through the shared `LocalProjectsScreenStore`, which the replica follows) and the protocol actions (login writes the token through `PluginSettings`; the Sync action runs Obsidian Sync). None of them keeps an undo history or ids a screen shows, so nothing of R17 comes back.
- **Nothing is left unowned while the old screen is frozen.** Every old-screen row keeps today's owner until the one screen replaces it in stages 3–6, and is deleted in 7.

## Vocabulary used in the owner column

The spec names the layers but not every field, so this file proposes the field names. Every name below is a proposal.

**Model (one type for every place, P1):**
- `model.read`: the door's view for the shown context (`ScreenView`, with `funnel` (view, place, filter, panel), `projects`, `missing` and `context`), a view answer the runtime computes from the replica in step 3 of the loop for a need of the screen's `needs(model)` and hands the model (`viewsChanged`, memoised by replica, minute and need; P2, P3); `day`, the key of that view.
- `model.day`, `model.now`, `model.visible`, `model.events[day]` (a view answer over the replica's calendar texts, `viewsChanged`).
- `model.settings` (`ScreenSettings`, a view answer over the replica's `PluginSettings.get()`) and `model.device` (the device's values; the store only keeps them).
- `model.platform`, `model.theme`, `model.chrome` (`keyboard`, `statusBar`).
- `model.canUndo` (a view answer over the replica's history), `model.selection` (`mode`, `picked`, `anchor`), `model.found`, `model.timeline` (`selected`, `anchor`), `model.zoom`.
- `model.measured`: row heights, text widths, the stage, menu sizes, all from `measure`.
- `model.entry`: the door's last `EntryAnswer` for the quick entry.
- `model.rowKeys`: `rowKey(taskId)`, given when the user's message makes a row, bound by `CreatedTask` and remapped by the replay's old→new id map with every other id in the model (P1, P3).
- `needs(model)`, one for the screen: the view answers it draws, its root need given by `Layout` (P2 step 3).
- `model.overlay`, `model.sheet.full`: layers.
- `model.place`: a `Place` (`Places.main()`, `Places.note(path)`, `Places.settings()`), read only by `screen/layout.ts`, which derives `Layout` (G1).

**Runtime (plugin-wide, `obsidian/runtime/`):**
- the **replica** (`DoorContext`): tasks text, settings (`PluginSettings.get()`, refreshed on `onChange`), undo history, Projects-screen state (following the shared `LocalProjectsScreenStore`), ids, calendar texts, project notes;
- **the dispatch loop** (P2): door calls run right after `update`, their answers fed back as messages until drained; the chain bounded in depth; then one view answer per need of each mounted screen's `needs(model)`, computed from the replica and handed to the model (`viewsChanged`); then render, drivers, focus;
- the **stores**: the tasks queue (`vault.process`, the base checked inside `fn`; `createFile` for a missing file), settings as per-key patches through `PluginSettings.update`, device values and the Projects screen in device storage;
- the **pending log**: each unpersisted call that changed the text, tasks referred to by id, with its recorded inputs (`nowMs`, projects screen, settings) and the ids its creates produced; on an outside change the new base is tidied first (not an entry), then the log replayed in order, each entry with its recorded `nowMs` and projects screen and the current settings, ids mapped and resolved to current keys (`tasks.keyOf`), only text, history and ids taken, the old→new id map applied to the whole model, ids never reused, the kept parts reconciled by a door call after a dropped call, at most twice; tidy on the core's day boundary is an entry; a changed `tasksFile` counts as a file gone;
- the **persistence queue**, which outlives the plugin object on unload until it is empty (P8);
- the cross-call cache (`backend`);
- the network lane, which hands each feed's problem to the door (`feedProblems`), the only fetcher after the switch;
- readiness: the replica is built once the layout is ready and the metadata cache resolved (`projectsReady`);
- Obsidian's events;
- the action log;
- the core classes the door leaves to the host: `CalendarPolling` run unchanged; the entry's job order and the refresh rule as synchronous forms in the core (`backend`), called by the runtime and the network lane.

**Interaction (P6):**
- **Layers:** select mode, field (entry, rename, naming), menu (task, bulk, section, project, event, view, ⋯, sources, search), the full card.
- **Gestures:** carry (a card, subtasks, the plus, the picked cards; the door's carry methods), section lift, tree lift, timeline hold, select, resize and new slot, ribbon swipe, day swipe, wheel drag, pinch, divider, tree divider.
- Each layer and gesture pins its entities by id and gets `targetChanged` / `targetGone`; a pinned card's content updates in place, only its place waits; a commit takes the current key. Anything moving (a pointer gesture, a closing sheet, a sliding region) also pins the layout under it and draws it while it moves.

**Commands (P2):**
- door calls (`write`, `carry`, `carryAt`, `undo`) run right after `update` in the same loop; their texts go to the tasks queue, their settings to `PluginSettings.update`;
- `device.set`;
- network-lane fetches;
- `notice`, `haptic`, `obsidian.open`, `openInCalendar`, `createFile`;
- timers, each with a timeout message.

**Edges (P7, P8):**
- the effect owners of the owner table (`motion`, `measure`, `scroll`, `focus`, `input`, `keys`, `chrome`, `editors`, `overlay`, `mount`), the runtime's timers and `hostServices`; the pure owners `screen/layout.ts`, `screen/carryGeometry.ts` and `update/<concern>.ts`;
- `update/gesture.ts` (its recognizer) (pure);
- view answers for each screen's `needs(model)` (`viewsChanged`) and `rules.*` (pure, clock from `model.now`, imported by `update/`, selectors and `motion`; P2 step 3);
- `host/ScreenHost.ts`, owning what a mounted screen starts and ending what is under way on teardown, and the adapters `host/adapters/{leaf,note,settings}.ts`, which own only their registration with Obsidian (P8, G2).

**Other names:**
- **Transient channel:** live values from `input` to `motion`, laid out by the same selectors (P5).
- **Pure rules:** `rules.*` of the door, imported by `update/`, selectors and `motion`; the guard lists them.

**P** is the principle:
- P1 one model, identity included;
- P2 one timeline: the dispatch loop, a user's event running it to the end;
- P3 the core is a pure, synchronous function over a replica the runtime holds;
- P4 geometry is input;
- P5 motion follows the change, and a context change moves as a whole;
- P6 interactions are layers; what moves pins what is under it;
- P7 imperative code only at the edges;
- P8 everything alive has an owner.

**Stage** is the stage of revision 11 that rebuilds the row (the spec's §Migration):
- 1: the runtime and the core's part (built): the replica, its stores, the pending log with replay and bounds, the network lane, readiness; `backend`: the cross-call cache with budget tests, the host facts in `DoorContext`, the synchronous forms of the entry's job order and the refresh rule, `tasks.keyOf` and the reconciliation door call.
- 2: the guards, the freeze, the lifecycle test, the e2e harness (built; extended in 3).
- 3: the guarantee (the owner table, every guard and its fixtures, the matrix, the trap, `UI`, the content freeze), and slice 3's code reshaped onto the one screen at `Places.main()`: lists, cards, sections, the field, the carry between lists, menus, selection, search, the full card.
- 4: the rest of the main screen, region by region, into the same owners: the timeline, the ribbon and both swipes, All columns and the dividers, the panel and tree, the carry across every target, the day.
- 5: the note as a `Place` (`Places.note(path)`, its adapter, the inline frame); its diff touches no owner but layout, mount and scroll's chain.
- 6: the settings tab as a `Place` (`Places.settings()`).
- 7: one switch, and in the same merge the deletion of the old screen, its services' plugin wiring, `Picks`, `Reload`, `WriteQueue`, `UI` and the freeze.

"3, 4" means built in stage 3 and extended by a stage-4 region. "1, 3" means the runtime part is built in stage 1 and first used by the screen in stage 3. "3, 5" means the concern is built in 3 and the note's gate of it is set in 5. "Gone" means the new code makes the state unnecessary; it is deleted with the old code in stage 7 if not earlier.

## A.1 The 45 facts held in more than one place

Each fact gets one field or one selector. "Seeded" means the field starts from a core answer before the first read; it is still one field.

| # | Fact | Single owner | P | Stage |
|---|---|---|---|---|
| 1 | The day the screen shows | `model.day` (one field). The read's own day is `model.read.day`, the key of that read, not a copy. Title: selector `dayTitle`. Drawn-day caches go (P5 decides motion by cause). The incoming day of a swipe or turn is a need of the screen's `needs(model)`, a view answer for that day (`viewsChanged`), a different fact. | P1, P2, P3 | 4 |
| 2 | The day the header names during a swipe | Selector `headerDay(model)` = `daySwipe.nearer ? neighbourDay : model.day`; `nearer` is set by one discrete message when the slide crosses half. | P1, P3, P6 | 4 |
| 3 | A tick or draw missed while hidden or held | Gone as a store: data applies at once (P6); anything moving draws the layout it pinned; `model.visible` from `chrome`. | P6 | 4 |
| 4 | Where the strip stands | `model.read.funnel.place` (the core's answer) plus the ribbon gesture's in-flight `target`; selector `shownPlace`. `atDone` = `shownPlace === "done"`. `firstPlace` seeds `model.read` before the first read. `rightMode` is a one-time host hand-over (plugin runtime). | P1, P3 | 4 |
| 5 | The view mode and its layout | `model.read.funnel.view` (`ViewChoice`); selector `layoutMode`. `firstView` seeds it before the first read. Mounted layout = the layout component chosen by `layoutMode`. `drawnContext` goes: update compares `read.context` to decide that no transition is emitted. | P1, P5 | 4 |
| 6 | The project filter | `model.read.funnel.filter`; selector `filterNode`. The node a carry was lifted on is carry-gesture state `carry.liftedOn` (a different fact: what to put back). | P1 | 4 |
| 7 | The projects panel open / docked | `model.read.funnel.panel` (`open`, `docked`). The mid-slide state is a running `Transition` (dock slide), not a field. | P1, P5 | 4 |
| 8 | The tasks read from the file | `model.read` (`ScreenView`: tasks, day, projects, missing). Menus and the bulk menu hold only keys (`overlay.task.key`, `overlay.bulk.keys`), remapped by the replay's old→new id map; their models, the full card's levels and a neighbour day or place are needs of the screen's `needs(model)`, recomputed on every replica change (`viewsChanged`). Element maps go. | P1, P2, P3 | 4 |
| 9 | The tasks file is missing | `model.read.missing`; every hidden part is JSX from it. | P1 | 3, 4 |
| 10 | A card waiting for a new section's name | Naming layer `interaction.naming = {kind: "section", column, card}`. | P6 | 3 |
| 11 | The day's calendar events | `model.events[day]` (keyed by day: a view answer over the replica's calendar texts, `viewsChanged`, cached first, fresh when the network lane lands). The parsed-document cache stays in the core. | P1, P2, P3 | 1 |
| 12 | The sources' alert | Selector `sourcesDot(model.events[model.day])`. | P1 | 4 |
| 13 | Extra all-day rows | Selector `allDayExtraRows(model.events[day])`; a neighbour day, a need of the screen's `needs(model)`, uses the same selector. | P1, P2, P3 | 4 |
| 14 | The timeline card selected | `model.timeline.selected: TaskKey or null`. | P1, P6 | 4 |
| 15 | List cards picked | `model.selection = {mode, picked: TaskKey[], anchor}`; count and button state are selectors. | P1 | 4 |
| 16 | A drag holds the screen | `model.interaction.gesture` (the one gesture slot); `isDragging` is a selector. | P6 | 4 |
| 17 | A carry to a project is under way | carry gesture `carry.reportsToCore` (the door's carry methods over the replica). [R23] | P3, P6, P7 | 3 |
| 18 | The card a drop is landing on | The drop is a door call in its own message (`tasks.drop` over the replica, with the carry in `projectsScreen`): its outcome, the cards' new places and keys, is in the replica at once; its text goes to the tasks queue. | P3 | 1, 3 |
| 19 | Where a held card would land | carry gesture `carry.target` (list gap and level, plate, title, timeline start, tree row), computed from `model.measured` and the core's rules. | P4, P6 | 4 |
| 20 | A timeline card being stretched | Resize gesture `interaction.resize = {key, edge, span}`. | P6 | 4 |
| 21 | A swipe or turn is running | Ribbon / day-swipe gesture state; the run after release is a numbered `Transition` in `motion`. | P5, P6 | 4 |
| 22 | Which swipe or turn is current | Transition numbers (a stale `motionSettled` is ignored by number); each swipe or turn is its own message. | P2, P5 | 4 |
| 23 | A landed day drawn over the screen | A context change: the incoming day or place is drawn from the view answers of the same message's loop (P2); nothing waits. | P3, P6 | 4 |
| 24 | The timeline's hour height | `model.zoom = {hourPx, wholeDay}` (seeded from device settings); the pinch's live scale rides the transient channel; dispatch on a step. | P1, P4 | 4 |
| 25 | The timeline's scroll position | Driver-local in `scroll` keyed `timeline`; the opening anchor is `model.timeline.anchor = {minute, fraction}` (`scroll` orders; `measure` reports scroll). | P1, P7 | 4 |
| 26 | A list's scroll / held room | Driver-local in `scroll` (positions, ScrollHold, glides) keyed by scroller id; the entry's `follow` flag is field-layer state (`scroll` orders; `measure` reports scroll). | P7 | 3 |
| 27 | The day list's share | `model.device.listShare` (the settings answer); live drag value on the transient channel; widths are selectors over the pure rules (`RibbonColumns`, `layoutWidths`, imported directly, P2 step 3). | P1, P2, P4 | 4 |
| 28 | The project tree's width | `model.device.treeWidth`; live drag value on the transient channel. | P1, P4 | 4 |
| 29 | A field is open for typing | `model.entry` = the door's last `EntryAnswer` (`entry.*`); every flag (`is-entering`, plus hidden, folder locked, card `is-renaming`) is a selector. | P1, P3, P7 | 3 |
| 30 | Which field has the focus | `model.focus` (owner id) reported by `focus`; Obsidian's `activeEditor` is `editors`-local. | P1, P7 | 3 |
| 31 | The entry's priority tint | Selector `entryTint(model.entry)`. | P1 | 3 |
| 32 | The repeat being edited | One draft per editor: `overlay.page.repeat` (task menu, the core `RepeatPage` answer) or `entry.repeat` (bar). Never both for one editor. | P1, P7 | 3 |
| 33 | A description being edited | `sheet.full.description = {draft, dirty}` (the core `DescriptionDraft` answer, a door session over the replica); the CodeMirror doc is `editors`-local; the 600 ms save is a timer command. | P1, P3, P7 | 3 |
| 34 | The search window is open | `model.overlay` stack entry `{kind: "search", phase}`. | P6 | 4 |
| 35 | A task is on the whole screen | `model.sheet.full = {stack, phase}`. | P6 | 3 |
| 36 | A menu / sheet is open or closing | `model.overlay` (stack of `{kind, phase: open or closing, page, picked}`); a write pick's door call at the tap. | P3, P6 | 3 |
| 37 | The card ringed after a search | `model.found = {key, scrollPending}`. | P1 | 4 |
| 38 | Whether undo is possible | `model.canUndo`, a view answer over the replica's history (`viewsChanged`); the old screen keeps `UndoService` until stage 7 deletes it (G8). | P1, P2, P3 | 1, 3 |
| 39 | The settings the screen draws | `model.settings` (`ScreenSettings` answer) and `model.device` (device view settings). Body tokens per window come from `chrome` (`chrome` takes it from the model). | P1 | 3, 4 |
| 40 | Phone or desktop | `model.platform.wide` from `chrome`. | P4 | 3, 4 |
| 41 | Obsidian's status bar over the view | `model.chrome.statusBar` from `chrome`. | P4 | 4 |
| 42 | Popout windows that get the styles | Plugin runtime's window set (host), fed to `chrome`; not a screen fact. | P7, P8 | 1 |
| 43 | Which note a block shows | `model.place`, from `Places.note(path)` (G1); the note's project is in its view answer; the blocks map is the note adapter's. | P1 | 5 |
| 44 | Writes waiting to run | The runtime's one replica; door calls run right after `update`, in message order (P2's loop, its chain bounded); the tasks queue writes their texts in that order inside `vault.process`, `fn` checking the base and that the file still sits at `tasksFile` (a changed `tasksFile` counts as gone); the pending log (entries by id with their recorded inputs and the ids their creates produced) holds what is not yet written; replay with recorded `nowMs` and projects screen, current settings, ids remapped over the whole model; on unload the persistence queue outlives the plugin object until empty (P8). | P2, P3, P8 | 1, 3 |
| 45 | Who holds the screen | `model.interaction.gesture` (one slot); pointer captures are `input`-local. | P6 | 3, 4 |

## A.2 State locations (565)

Row ids number the rows of each domain table of `inventory-state-effects.md` in file order, A.2.1 to A.2.565.

### day/clock

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.1 | `CS.selectedDate` | `model.day` | P1 | 4 |
| A.2.2 | `CS.titleDay` | selector `headerDay` over `daySwipe.nearer` | P1 | 4 |
| A.2.3 | `CS.missedTick` | `tick` applies at once to `model.now`; ticks missed while hidden caught up on `visible` | P2, P6 | 1, 4 |
| A.2.4 | minute interval | runtime clock source → `tick(now)` → `model.now` | P2, P8 | 1 |
| A.2.5 | `DayData.state.date` | `model.read.day` (key of the read) | P1 | 4 |
| A.2.6,10 | `Timeline.drawnDate`, `TaskList.drawnDay` | gone: a day change emits no transition (P5) | P5 | 3, 4 |
| A.2.7-9 | now line, hidden labels, now pill | selectors over `model.now` (`isToday`, core `labelHidesNearNow`); `--tc-y` via `motion` layout variables | P1, P7 | 4 |
| A.2.11 | DayNav title | selector `dayTitle` | P1 | 4 |

### view/mode/place/filter/panel

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.12,14 | `CS.shownMode`, `CS.atDone` | ribbon gesture `target` + selector `shownPlace` | P1, P6 | 4 |
| A.2.13,15 | `CS.firstPlace`, `CS.firstView` | initial `model.read` seeded by core `firstPlace`/`firstView` at mount | P1 | 4 |
| A.2.16 | `CS.layout` | layout component chosen by selector `layoutMode` | P1 | 3, 4 |
| A.2.17,24 | `CS.drawnContext`, `is-redrawn` | gone: update compares `read.context`; a context change emits no transition | P5 | 4 |
| A.2.18 | `CS.swipe` presence | selector `hasPages(layoutMode)`; `input` attaches the swipe `update/gesture.ts` (its recognizer) while true | P1, P7 | 4 |
| A.2.19 | parts built once | view components | P1 | 7 |
| A.2.20 | `folder.el.disabled` | selector `panelLocked(model.entry)` | P1 | 4 |
| A.2.21-23,25 | root classes `is-note`, `has-wheel`, `has-top-row`, `has-head-lead`, `has-tree`, `has-dock`, `is-block` | kit variant props from `Layout` (`layoutOf(model.place, …)`), `read.funnel.view`, `read.funnel.panel` | P1 | 4 |
| A.2.26 | `DayData.state.funnel` | `model.read.funnel` | P1 | 4 |
| A.2.27 | `DayData.state.projects` | `model.read.projects` | P1 | 4 |
| A.2.28 | StripTrack temporary place classes | gone: strip geometry per place computed (`RibbonColumns`, (P4)) | P4 | 4 |
| A.2.29 | full card parent / project buttons | JSX from `sheet.full` tree | P1 | 3 |
| A.2.30-31 | `ViewButton.view`, hidden, icon | selector `viewButton(read.funnel.view)` | P1 | 3, 4 |
| A.2.32-33 | tree `is-missing`, panel open | JSX from `read.missing`, `read.funnel.panel.open` | P1 | 4 |
| A.2.34-37 | `ProjectTree.drawn/rowsByNode/drawnRows/rowEls` | gone: rows from `read.funnel.panel.rows`; hit areas computed from measured row heights | P1, P4 | 4 |
| A.2.38 | tree row classes | JSX from the core row model | P1 | 4 |
| A.2.39-40 | `FilterTitle.filter` and its classes | selector `filterTitle`; renaming from naming layer | P1, P6 | 4 |
| A.2.41,44,46 | column / backlog titles text | selector over list names (view answers for the screen's `needs(model)`, `viewsChanged`, and `rules.*`) | P1, P2, P3 | 3, 4 |
| A.2.42-43 | `RibbonLayout.place`, `is-lists/is-inbox/is-done` | selector `shownPlace` → JSX class | P1 | 4 |
| A.2.45 | shared nav / timeline placement | view composition per layout | P1 | 3, 4 |

### lists data

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.47 | `CS.drawnRead` | first read emits no transition (`model.read` was null) | P5 | 4 |
| A.2.48,53 | missing box, `DayData.state.missing` | `model.read.missing`; JSX | P1 | 3, 4 |
| A.2.49-50 | `CS.naming`, header slot | naming layer `{kind: section}` | P6 | 3 |
| A.2.51 | card `dataset.menuFrom/card` | row props from the core row model | P1 | 3, 4 |
| A.2.52 | `DayData.state` | `model.read` | P1 | 4 |
| A.2.54 | `FullScreen.tree` | `sheet.full.levels[].tree`: the open full card's task is a need of the screen's `needs(model)`; its answer recomputed on every replica change (`viewsChanged`) | P1, P2, P3, P6 | 3 |
| A.2.55-63 | `ProjectTasks.*` maps | selectors over `read.projects` (`projectsEntryLook`); element maps gone | P1 | 3, 4 |
| A.2.64,67,69 | `Timeline.tasks`, `is-over`, block meta | selectors (`slotted`, `stackTasks`, `stackCorner`) | P1 | 4 |
| A.2.65,68 | `Timeline.blocks`, DOM order | gone: Preact keys, JSX order from `stackTasks` | P7 | 4 |
| A.2.66 | block `--tc-y/len/x` | `motion` layout variables from selector | P7 | 3 |
| A.2.70-78 | `TaskList.*` bookkeeping | selectors (`listView`, `columnSections`); element maps gone | P1 | 3 |
| A.2.79 | card `--tc-level` | `motion` layout variable | P7 | 3 |
| A.2.80-81,83 | header, plate text, branch lines | selectors (`branchOf`) | P1 | 3 |
| A.2.82 | keyed empty-plate presence | plate ↔ first card is a transition kind (B1.9) | P5 | 3 |
| A.2.84-91 | card colours, classes, marks, link data | JSX from `TaskItem` | P1 | 3 |
| A.2.92,94-95 | `KeyedRows.rows/drawing/order` | gone: Preact keyed rows; focused field kept by key (`rowKey(taskId)` bound by `CreatedTask`, remapped by the replay's old→new id map, ids never reused) | P1, P3, P5, P7 | 1, 3 |
| A.2.93 | `KeyedRows.leaving` | leaving rows: skipped by layout selectors; fold and dependent heights one transition; a returning key revives the entry (P4) | P4, P5 | 3 |
| A.2.96-97 | prototype `KeyedList` | replaced by `next/` | — | 7 |

### events

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.98 | `CS.poll` | `CalendarPolling` run by the runtime, unchanged, its fetches on the network lane, the only fetcher after the switch (the old `CalendarService` polling not started), `model.visible` | P2, P3, P8 | 1 |
| A.2.99-100 | `DayData.dayEvents`, `state.calendars` | `model.events[day]`, `read.calendars` | P1 | 4 |
| A.2.101 | `DayData.around` | network-lane request parameter (network lane, latest per day) | P2 | 1 |
| A.2.102 | `DayPeek.events` | `model.events[day]` for the incoming day: the neighbour day under a swipe is a need of the screen's `needs(model)`, a view answer over the replica's calendar texts (`viewsChanged`) | P1, P2, P3 | 4 |
| A.2.103-104 | wheel dots | selector `sourcesDot` | P1 | 4 |
| A.2.105-106,109 | `Timeline.events`, event block placement | selector `timedEvents` (`layoutEvents`) + `motion` variables | P1, P7 | 4 |
| A.2.107 | event colours | selector `paintEvent(model.theme)` → `motion` variables | P1, P7 | 4 |
| A.2.108 | `is-past` | selector over `model.now` (view answers for the screen's `needs(model)`, clock from `model.now`) | P1, P2, P3 | 4 |

### selection

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.110,116-119 | `BulkController.selection`, `TaskSelection.*` | `model.selection {picked, anchor}`; element maps gone | P1 | 4 |
| A.2.111-112 | count / ⋯ buttons | selectors | P1 | 4 |
| A.2.113-114 | `selecting`, `is-selecting` | `model.selection.mode` (select-mode layer) | P6 | 4 |
| A.2.115 | bulk menu `items` closure | `overlay.bulk.keys` remapped by write answers | P1 | 4 |
| A.2.120-121 | `is-selected`, `.tc-pick` | JSX | P1 | 4 |
| A.2.122-124 | `Timeline.selected`, ring, grips | `model.timeline.selected`; grips via `motion` variables | P1, P6 | 4 |

### carry/drag

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.125 | `CS.carrying` | carry gesture `reportsToCore` [R23] | P6 | 3 |
| A.2.126,216 | root `is-dragging` (and its read in BlockHeight) | JSX class / selector from `interaction.gesture` | P1 | 3, 4 |
| A.2.127-129 | `QEC.dragging/carrying/droppedOn` | carry gesture `payload` and outcome; selector `plusHidden` | P6 | 4 |
| A.2.130,135-139,143-146,149 | press records, pointer captures, document listeners of drags and holds | `input`-local; discrete messages out | P7, P8 | 3 |
| A.2.131-132,192 | plus ring, `is-hot` | JSX from carry gesture `payload`, `target` | P1 | 4 |
| A.2.133 | body `tc-cancelling` | `chrome` body class from carry target (`chrome` takes it from the model) | P7 | 3 |
| A.2.134 | `DragController.live` | `interaction.gesture` | P6 | 3 |
| A.2.140-142,158 | `is-lifted/is-waiting/is-folded` | JSX from carry / section-lift gesture; folds are transitions | P1, P5 | 3 |
| A.2.147-148 | resize closures | resize gesture `{minute, span}` | P6 | 3 |
| A.2.150-157 | `CardListDrop` state | carry gesture `target` computed from `model.measured` and core rules (`placeAt`, `placesInGap`) | P4, P6 | 3 |
| A.2.159-160 | section lift capture / listeners | `input`-local | P7, P8 | 3 |
| A.2.161-162,215,219 | `SectionSlots`, `TaskList.landing`, `KeyedRows.marks` | section-lift gesture `slot`; JSX mark row | P6 | 3 |
| A.2.163-164,170-176,178,193 | section / card / plus floats and their styles | JSX float component; position on the transient channel; width, flight, fade as transitions | P5, P7 | 3 |
| A.2.165 | static `DragSession.landing` | the replica after the door's answer (P3) + running transition numbers | P3, P5 | 3 |
| A.2.166-169 | `DragSession.current/done/cut/cleared` | carry gesture phase | P6 | 3 |
| A.2.177,179 | flight timers | `motion` → `motionSettled` (timeout message) | P5, P8 | 3 |
| A.2.180-182,198-199 | drop lines, tree `is-drop` | JSX from `carry.target`; line steps are transitions | P1, P5 | 4 |
| A.2.183-184 | `TimelineDrop.start/last` | carry gesture `target.timeline` | P6 | 4 |
| A.2.185-186 | `ArrivingCard` | the door's answer in the drop's own message: the arriving card (P3) | P3, P5 | 1, 3 |
| A.2.187-191 | `LongPress` state and timer | `update/gesture.ts` (its recognizer) (pure); delay from `model.settings` | P7, P8 | 3 |
| A.2.194 | `ProjectTasks.away` | selector hiding `carry.lifted` across node change | P1 | 4 |
| A.2.195 | by-project row classes | JSX | P1 | 3, 4 |
| A.2.196 | `TreeDrop.result` | carry gesture `target.tree` | P6 | 4 |
| A.2.197 | `ProjectsListDrop.readOn` | carry gesture `targetsReadNo` (pinned drop places, `targetChanged` (P6)) | P4, P6 | 3 |
| A.2.200-203 | `TreeLift` claim, `at`, float, listeners | tree-lift gesture; float on transient channel; `input` | P6, P8 | 4 |
| A.2.204-205 | `CarryReport.last/timer` | effect runner: `carryAt` command with dedupe and a timer command | P2, P8 | 4 |
| A.2.206-207 | `ProjectsCarry.drops/nodes` | carry gesture `rows`, `liftedOn` | P6 | 4 |
| A.2.208-212,214 | timeline drop line and stretch state | carry / resize gesture state; JSX; `motion` variables | P6, P7 | 4 |
| A.2.213 | `is-lifted` read in Timeline | selector from `carry.lifted` (no class reads) | P1 | 4 |
| A.2.217-218 | `is-drop-room`, hover hook | selector `dropRoom(list)` from `carry.target` | P4 | 3, 4 |

### swipe/pager

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.220 | `CS.landing` | day-swipe gesture `landing`; the incoming day is a view answer for a need of the screen's `needs(model)` (`viewsChanged`), so the switch does not wait | P2, P3, P6 | 4 |
| A.2.221 | `drawnWaits` + 1000 ms timer | gone: every day, near or far, is drawn from the view answers of the same message's loop (P2) (P3) | P2, P3, P8 | 4 |
| A.2.222 | `CS.turning` | gone: each turn applies in its own message; a new swipe catches the settle | P3, P6 | 4 |
| A.2.223,542 | `CarefulPace`, `PointerSpeed` | `update/gesture.ts` (its recognizer) | P7 | 4 |
| A.2.224-230 | `Swipe` press, stream, timer, holds, round, listeners, capture | `update/gesture.ts` (its recognizer) + ribbon / day-swipe gesture; `round` → transition numbers | P6, P7, P8 | 4 |
| A.2.231-236 | `ScreenPager` state | swipe gesture + transient channel; settle is a `Transition`; `catches` → transition numbers (a tap leaves the settle running) | P5 | 4 |
| A.2.237-238,240 | edge / day / strip track styles and scrub | `motion` (transient channel, scrub between two computed layouts) | P5, P7 | 4 |
| A.2.239 | `DayTrack.nearer` | day-swipe `nearer`, one message at half | P6 | 4 |
| A.2.241-243 | `DayPeek.day/removed/el` | the incoming day's view: the neighbour day a swipe can uncover is a need of the screen's `needs(model)`, computed when the swipe starts (`viewsChanged`); the view draws it | P2, P3, P6 | 4 |
| A.2.244 | `ColumnSwitch.icons` | view | P1 | 4 |
| A.2.245-247,251 | wheel press, hold timer, swallowed click, capture | wheel-drag gesture + `input` | P6, P7, P8 | 4 |
| A.2.248,252-253 | wheel `is-settling`, ribbon `is-switching` | transitions (wheel settle, ribbon slide) | P5 | 4 |
| A.2.249-250 | `ColumnSwitch.at`, wheel window properties | selector of `shownPlace`; live drag on transient channel; `motion` variables | P1, P7 | 4 |

### zoom

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.254-255 | `CS.hourPx`, `CS.wholeDay` | `model.zoom {hourPx, wholeDay}` | P1 | 4 |
| A.2.256,261 | `zoomFrame`, `PinchZoom.scaled` | transient channel; dispatch on a step | P4, P8 | 4 |
| A.2.257-260,262-263 | pinch pointers, wheel timer, anchor, limits, capture | pinch gesture + `update/gesture.ts` (its recognizer); wheel settle timer command | P6, P7, P8 | 4 |
| A.2.264-265 | `Timeline.minor/grid` | selector `gridAt(hourPx)` (transient channel; dispatch on a step) | P1 | 4 |
| A.2.266-267 | `hourShown`, `--tc-hour` | `motion` variable | P7 | 4 |

### scroll

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.268 | `CS.scrolledFor` | gone: update emits a scroll order on a day change | P2 | 4 |
| A.2.269-270,283 | timeline / day list / peek scroll positions | `scroll`-local, keyed scroller ids (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| A.2.271-276 | `QEC.follow/revealedAt/revealing/handScrolledAt/watchedScroller`, scrollTop | field layer (the door's `entry.*` session; the job order the core's step function) `follow`; `scroll` `reveal` orders; `userScrolled` ends follow | P3, P6, P7 | 1, 3 |
| A.2.277,297-302 | `ScrollGlide`, `ScrollHold`, `GLIDES` | `scroll`-local | P7 | 3 |
| A.2.278-282 | `AutoScroll` state | `scroll` `edge` order from the carry gesture; scroll offsets back to the carry (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| A.2.284 | `LiftedMenu.stopScroll` | overlay `revealing` + `scroll` cancel (`scroll` orders; `measure` reports scroll) | P6, P7 | 3 |
| A.2.285 | `PanelPages.scrolls` | `scroll`-local per page key | P7 | 3 |
| A.2.286-287 | by-project / tree scroll keep or reset | `scroll` orders `keep` or `reset` on node change (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| A.2.288 | `Timeline.frame` | computed from the stage size from `measure` and `scrolled` | P4, P8 | 4 |
| A.2.289,292 | `Timeline.room`, `--tc-room-*` | selector + `motion` variables | P4, P7 | 4 |
| A.2.290 | `Timeline.anchor` | `model.timeline.anchor` (`scroll` orders; `measure` reports scroll) | P1 | 4 |
| A.2.291 | timeline scrollTop writes | `scroll` | P7 | 4 |
| A.2.293-296 | `ScrollEdges` state and classes | `scroll`-local; fade output ownership (`scroll` orders; `measure` reports scroll) | P7 | 3 |

### text entry/quick bar

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.303,353-356 | `activeEditor`, `EmbeddedEditor` state, CodeMirror doc | `editors` | P7 | 3 |
| A.2.304 | `WriteQueue.tail` | message order on the replica; the tasks queue and the pending log | P2, P3 | 1 |
| A.2.305 | `QEC.state` | `model.entry` (the door's `EntryAnswer`) | P1, P3, P7 | 3 |
| A.2.306,329 | `QEC.field`, `quiet` | `editors` (editor handle; owner set text is not input) | P7 | 3 |
| A.2.307,339,479 | `QEC.focused`, group name focus, field focus | `focus` | P7 | 3 |
| A.2.308 | `QEC.turning` | field layer (the door's `entry.*` session; the job order the core's step function) flag while the bar turns the wheel | P3, P6, P7 | 1, 4 |
| A.2.309 | `QEC.draws` | gone: the view is drawn in the message (P3) | P2, P3 | 3 |
| A.2.310,340 | `pressEnding`, `FreeRoomDoubleClick.mouse` | `update/gesture.ts` (its recognizer) | P7 | 3 |
| A.2.311,313-314,316-317,319-325,327-328,330-331 | bar and field look (`is-entering`, bar state, buttons, tint, placeholder, plus hidden) | selectors over `model.entry` → JSX | P1 | 3 |
| A.2.315,326 | `QuickBar.leaving`, pointer-events while fading | presence transition: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6 | 4 |
| A.2.318 | bar `is-gliding` | keyboard transition | P5 | 3 |
| A.2.312 | field element parent | view: row by key; field island mounted in it | P1, P7 | 3 |
| A.2.332-336 | `EntryRows.*` | `model.entry` + `model.rowKeys` (`rowKey(taskId)` bound by `CreatedTask`, remapped by the replay's old→new id map, ids never reused) | P1, P2, P3 | 1, 3 |
| A.2.337-338,352 | `RenamedTexts` | one plugin-wide replica; the door's answer applied at once (P3) | P3 | 1, 3 |
| A.2.341-343 | `TaskMenu.stackRow/fieldRow/fieldClosed` | overlay + field and entry layers (stack spot) (layer stack; data applies at once) | P6 | 3 |
| A.2.344-346 | `FullScreen.editing/draft/saveTimer` | `editors` + `sheet.full.description` (door session) + debounce timer command | P3, P7, P8 | 3 |
| A.2.347-351 | `FullScreen.state/field/focused/titleField/leavingTitle` | `sheet.full.entry` (a second core entry session); `focus` | P1 | 3 |
| A.2.357 | `markdown-rendered` | `editors` | P7 | 3 |
| A.2.358 | tree `askProjectName` slot | naming layer `{kind: newProject, gap, depth}` | P6 | 4 |
| A.2.359-361 | `Timeline.field`, `is-renaming`, field box | selector over `model.entry` in the timeline; `motion` variables | P1, P7 | 4 |
| A.2.362-363 | `TaskList.slot`, card `is-renaming` | naming layer; JSX | P1, P6 | 3 |

### menus/overlays/full/search

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.364,373 | `CS.search`, `BulkController.menu` | `model.overlay` stack entries | P6 | 4 |
| A.2.365,422-426 | `CS.full`, `FullScreen.stack/reading/closed/Escape/is-shown` | `model.sheet.full`; its levels are needs of the screen's `needs(model)`, recomputed on every replica change (`viewsChanged`); Escape order function; presence: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P2, P3, P6 | 4 |
| A.2.366,377 | menu `current`, `TaskMenu.context` | `overlay.task.key` remapped by write answers | P1 | 3 |
| A.2.367 | `QEC.stack` | overlay + entry (stack spot) (layer stack; data applies at once) | P6 | 3 |
| A.2.368-372 | bar panel state | field layer (the door's `entry.*` session; the job order the core's step function) `panel {kind, page}` (nested overlay); side from `measure` | P3, P4, P6, P7 | 1, 3 |
| A.2.374-376 | `FoundCard` | `model.found {key, scrollPending}`; `scroll` reveal | P1 | 4 |
| A.2.378-392 | `TaskMenu` parts, pages, asking, labelling, Enter, double-press, classes | menu layer `{kind: task, key, page, asking, labelling}`; parts are view (a Preact layer); boxes via `measure` (`motion` reads its boxes in the commit phase) | P1, P6 | 3 |
| A.2.393-403 | `LiftedMenu.gone`, `Overlay.*` | overlay `phase`; presence: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6); Escape order over the stack (layer stack; data applies at once) | P5, P6 | 3 |
| A.2.404-407 | `Picks.*`, `giveUp` | write pick: its door call at the tap; the closing sheet pins the layout under it, and the list's change moves when the close settles | P2, P3, P6 | 1, 3 |
| A.2.408-412 | `Panel.shown`, `PanelPages`, `MORPHS` | overlay `page`; page morph transition (B1.14) (a Preact layer) | P5 | 3 |
| A.2.413 | switch knob flipped before the write | the door's answer over the replica, at once (P3) | P3 | 1, 3 |
| A.2.414 | menu tiles | JSX from the core menu model | P1 | 3 |
| A.2.415-421 | `BulkMenu`, project menu asking, `DescriptionPeek` placement | menu layer; peek side from `measure` | P4, P6 | 4 |
| A.2.427-430 | `SearchWindow.rows/picked/asked/closed` | `overlay.search {query, answer, picked}`; door call `tasks.search` in the message, memoised by query | P2, P3, P6 | 4 |

### layout sizes

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.431 | `is-docking` + timer | dock-slide transition | P5, P8 | 4 |
| A.2.432-436 | desktop capsule room, anchor, away, glide start, position | selectors from `measure` (field box) + `chrome`; `motion` variables | P4, P7 | 3 |
| A.2.437 | `ObsidianChrome.statusBar` | `chrome` | P7 | 4 |
| A.2.438 | Settings colour rows wrap | the screen at `Places.settings()`, the one model; the colour rows' wrap from `measure` | P1, P4 | 6 |
| A.2.439-441 | peek column styles, invisible, all-day | view draws the neighbour day's layout from its need's answer (the screen's `needs(model)`) | P2, P3, P4 | 4 |
| A.2.442-444 | `Divider.press/glide`, capture | divider gesture; snap glide transition; `input` | P5, P6 | 4 |
| A.2.445-447,491 | menu field row / copy raised over the keyboard | selector from `model.chrome.keyboard` + `measure`; `motion` variables | P4, P7 | 3 |
| A.2.448-452 | menu placement, `is-long`, search / sources positions, `LiftedCopy.rect` | selectors over `measure` sizes and the computed layout; window room from `chrome` | P4 | 3, 4 |
| A.2.453-454 | `--tree-width`, `seen` | `model.device.treeWidth` + transient channel; panel width from `measure` | P4 | 4 |
| A.2.455-458 | hour labels, lines, stack end, all-day rows | selectors | P1 | 4 |
| A.2.459 | `--tc-list-width` | selector (`RibbonColumns`, listShare) → `motion` variable | P4, P7 | 4 |
| A.2.460-466 | `RowsLayout` holds, fit timers, heights | selector `stackedLists(model.measured)`; heights move in the fold's own transition | P4, P5, P8 | 3, 4 |
| A.2.467-469 | foot fade edge, row labels, field row presence | selectors | P1 | 3, 4 |
| A.2.470 | `is-leaving` read | gone: a leaving row is skipped by layout selectors | P4 | 3, 4 |
| A.2.471 | still-layout column widths | selector `layoutWidths` | P4 | 4 |
| A.2.472-474 | `SnapGlide` | `motion` | P5, P7 | 4 |

### platform/theme/keyboard

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.475 | `activeElement` read for Cmd+Z | `model.focus` | P7 | 3 |
| A.2.476-477 | `is-mobile`, `theme-light` | `chrome` → `model.platform`, `model.theme` | P4 | 3, 4 |
| A.2.478,489-490 | popout windows | plugin runtime window set; `chrome` per window | P7, P8 | 1 |
| A.2.480,483 | bar `is-desk`, `is-keyboard-up` | JSX from `model.platform`, `model.chrome.keyboard` | P1 | 3 |
| A.2.481 | IME composing | `input` | P7 | 3 |
| A.2.482,484,494 | key scopes (field, tab, rendered editor) | `keys` driver (Obsidian `Scope`s) | P7 | 3, 4 |
| A.2.485-488 | `StatusBarRoom` | `chrome` | P7 | 4 |
| A.2.492-493 | full card `is-typing`, search focus | selector over `model.focus`; `focus` | P1, P7 | 4 |

### settings

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.495 | `CS.seen` | update compares `model.settings` before / after (settingsEffect as an update rule) | P1 | 4 |
| A.2.496-497 | plugin settings in memory, `rightMode` | plugin runtime (`obsidian/runtime/`, `main.ts`): settings held as `PluginSettings.get()` in the replica, refreshed on its `onChange`; the `rightMode` hand-over writes through the shared `LocalProjectsScreenStore`, whose change signal the replica follows; until stage 7 `main.ts` keeps the old services' hand-over | P3, P7 | 1, 7 |
| A.2.498-500 | view settings stores | `model.device`; device storage only keeps it, through `PluginSettings.partition` (P1) | P2, P3, P7 | 1 |
| A.2.501-502,509-512 | Settings tab page, colour preview, row reorder | the screen at `Places.settings()`: page and preview from the model; the row reorder is a declared transition | P1, P5 | 6 |
| A.2.503-508 | card size and priority colour body tokens | `chrome` per window from settings (`chrome` takes it from the model) | P7 | 3, 4 |
| A.2.513-516 | repeat page / editor | overlay page `repeat` (core `RepeatPage`) | P6, P7 | 3 |

### note blocks

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.517,519-523 | `ViewWatch.frame`, block registry, `asks` | the note adapter (`host/adapters/note.ts`): its block registry; `asks` go: `projectNoteView` a view answer for a need of the screen's `needs(model)` (`viewsChanged`) | P2, P3, P7, P8 | 5 |
| A.2.518 | block key scope | `keys`, its policy `Layout.keys` `focus` (Obsidian `Scope`s) | P7 | 5 |
| A.2.524 | block position, `--tc-block-lift` | `drivers/mount.ts` placement; lift from `measure` | P4, P7 | 5 |
| A.2.525 | focus in block | `focus` | P7 | 5 |
| A.2.526-527 | `BlockHeight` | gone: the inline frame's height is the stylesheet's, held by the pin under a carry (decision 44) | P4 | 5 |

### undo

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.528 | undo button off | `model.canUndo` | P1 | 3, 4 |

### other

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A.2.529,538 | teardown list, tab's screen | runtime / `ScreenHost` and `drivers/mount.ts` | P7, P8 | 1, 3 |
| A.2.530 | `CS.changing` | message order on the replica; the tasks queue and the pending log | P2, P3 | 1 |
| A.2.531 | arbiter claim `naming` | naming layer | P6 | 3 |
| A.2.532 | `services` for console | plugin runtime (`obsidian/runtime/`) | P7 | 1 |
| A.2.533 | `DayData.shown` | gone: notification by selector equality | P2 | 4 |
| A.2.534-536 | `Reload` state | a write's answer in the replica in the same message (P3); `rowKey(taskId)` bound by `CreatedTask`, remapped by the replay's old→new id map, ids never reused | P1, P2, P3 | 1, 3 |
| A.2.537 | `ScreenParts.waiting` | gone: data applies at once; anything moving draws the layout it pinned when it began | P6 | 3, 4 |
| A.2.539 | `FramePass` | `measure` / `scroll` frame scheduling | P7 | 3 |
| A.2.540-541 | arbiter holder, idle listeners | `interaction.gesture`; pinned layout snapshot applied on its end (P6) | P6, P8 | 3 |
| A.2.543-544 | `MonthPicker` month, day marks | overlay page `{month}`; JSX | P6 | 4 |
| A.2.545 | click listener per render | `editors` (MarkdownRenderer, created once) | P7, P8 | 3 |
| A.2.546 | kit `Button` classes | JSX | P1 | 3 |
| A.2.547,551 | per-block / per-row `listening` | gone: Preact listeners | P7 | 3 |
| A.2.548,550 | ribbon / stage `tc-hidden` | JSX from `read.missing` | P1 | 4 |
| A.2.549 | `RowsLayout.destroyed` | gone | P7, P8 | 3, 4 |
| A.2.552-561 | `Motion` styles and WeakMaps | `motion`-local | P7 | 3 |
| A.2.562 | `pinTo` inline boxes | `motion` variables | P7 | 3 |
| A.2.563-565 | prototype `Store` | replaced by the runtime | — | 1, 7 |

## B.1–B.6 Effects (819) and event sources (180)

Row ids number the rows of each table in file order: B.1.1–142, B.2.1–244, B.3.1–135, B.4.1–174, B.5.1–124, B.6.1–180.

### B.1 G0: CalendarScreen, main.ts, compose.ts

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| B.1.1-4,6-8,10-13,16,60-61,66,73,75-79,82-83,85,87,89-91,95-104,107,113-115,118-119,121,123 | task writes (`act`) | door call in message order; its answer in the replica at once; `staleTask` → notice; its text to the tasks queue (`vault.process`, the base checked inside `fn`) [R23] | P2, P3 | 1, 3 |
| B.1.17-18 | `startCarry`, `endCarry` | door carry calls (`startCarry`, `endCarry`) in message order over the replica [R23] | P2, P3, P7 | 1, 3 |
| B.1.5,9,14-15,19-20,22-26,28-30,53,55-56,93,122 | synchronous service reads (`bulkMenu`, `carried`, `snap`, `stretch`, `firstPlace`, `relation`, `today`, `boundary`, `shownSpan`, `isPast`, `dropSpan`, `newSlot`, `findIn`, `listName`, `stepFunnel`, `columnSections`, `menu`, `openAt`) | view answers for the screen's `needs(model)` (`viewsChanged`) and `rules.*` (clock from `model.now`) | P2, P3, P7 | 1, 3 |
| B.1.27,34,39,63,81,84,92,94 | event, sources, more, search, section, project menus; full card; task menu | `model.overlay` / `model.sheet` (a Preact layer) | P6 | 4 |
| B.1.31 | quick entry shows the day it wrote to | Msg `entryShowsDay` → `model.day` ; its view a view answer for a need of the screen's `needs(model)` (`viewsChanged`) | P2, P3 | 3 |
| B.1.32,38,48,50,71 | rereads (fresh, after undo, load, day passed, after failure) | a view answer the runtime computes from the replica for a need of the screen's `needs(model)` and hands the model (`viewsChanged`, memoised by replica, minute and need) | P2, P3 | 1, 3 |
| B.1.33,57 | wheel turned, swipe landed on a place | ribbon / wheel gesture → Cmd `setFunnelPlace` | P6 | 4 |
| B.1.35,44-47,52 | calendar poll and refresh | network lane, latest per day; a feed's problem handed to the door as `feedProblems`; refresh or not by the core's pure refresh decision (P3) | P2, P3 | 1 |
| B.1.36 | undo / redo | door call `history.undo` in message order; `canUndo` from the view answers over the replica's history (`viewsChanged`) | P2, P3 | 1, 3 |
| B.1.37,69-70 | notices | Cmd `notice` | P2 | 1 |
| B.1.40-43 | service subscriptions | runtime inputs → `fileChanged`, `calendarsChanged`, `settingsChanged`, `dayChanged` | P2, P8 | 1 |
| B.1.49 | `Timeline.tickNow` | `tick` → `model.now` (applies at once (P6)) | P6 | 1 |
| B.1.51 | select today on day moved | update rule on `dayChanged` | P2 | 4 |
| B.1.54,72,120 | view settings writes (`listShare`, `zoom`, `treeWidth`) | Cmd `device.set`: a per-key patch that `PluginSettings.partition` routes to device storage; the store only keeps `model.device` (P1) | P2, P3 | 1 |
| B.1.21,58-59 | day step, day swipe landed, day turn | day-swipe gesture; the new day's view a view answer for a need of the screen's `needs(model)` (`viewsChanged`) | P2, P3, P6 | 4 |
| B.1.62 | haptics | Cmd `haptic` | P7 | 1 |
| B.1.64-65,108 | `reveal`, `filterHides`, `lineOf` (async reads) | a door call in the message, over the replica | P2, P3 | 1, 3 |
| B.1.67 | after reveal: day, wheel, place | update on `revealed` | P2 | 4 |
| B.1.68 | `Timeline.select(null)` | update on `pressedElsewhere` | P6 | 4 |
| B.1.74 | `projectsDropPreview` | the door's answer over the replica, at once (P3) (landing card at the line, A6.14) | P3 | 1, 3 |
| B.1.80 | section name field + scrollIntoView | naming layer; `focus`; `scroll` reveal | P6, P7 | 3 |
| B.1.86 | NoteSearch modal | `editors` (Obsidian `Modal`) | P7 | 3 |
| B.1.88,109-111 | open note / file / link / URL | Cmd `obsidian.open` | P7 | 1 |
| B.1.105-106 | rename / add subtask | field layer (the door's `entry.*` session; the job order the core's step function) open | P3, P6, P7 | 1, 3 |
| B.1.112 | `funnelView` / `projectNoteView` in each read | view answers for the screen's `needs(model)` (`viewsChanged`) | P2, P3 | 1, 3 |
| B.1.116-117 | `projectsTakes`, `projectsPlusPlace` (pure) | core pure rules (`rules.*`), imported by `update/` | P4 | 3 |
| B.1.124-126 | interval, landing / dock timers, pinch rAF | runtime clock; timer Cmds; transient channel; dispatch on a step | P3, P7, P8 | 1 |
| B.1.127 | `StatusBarRoom.hold` | `chrome` | P7 | 4 |
| B.1.128-139,141-142 | plugin load, settings file, code watcher, registrations, protocol, login, sync, device storage, place hand-over, open view, popouts, sync notice, core timers | plugin runtime (`obsidian/runtime/`): lifecycle and readiness (P8: the replica built once the layout is ready and the metadata cache resolved; on unload the persistence queue outlives the plugin object until it is empty), protocol actions, login (the token through `PluginSettings`, which the replica follows), the place hand-over (through the shared `LocalProjectsScreenStore`); until stage 7 the old services keep their own wiring here, never beside the new screens | P3, P7, P8 | 1, 7 |
| B.1.140 | osascript (open event in Calendar) | Cmd `openInCalendar` | P7 | 1 |

### B.2 G1

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| B.2.1-3 | calendar events fetch and cache | network lane, latest per day; a feed's problem handed to the door as `feedProblems`; refresh or not by the core's pure refresh decision (P3) | P2, P3 | 1 |
| B.2.4-6 | task reads (`funnelView`, `screen`, `projectsScreen`) | a view answer the runtime computes from the replica for a need of the screen's `needs(model)` and hands the model (`viewsChanged`, memoised by replica, minute and need) | P2, P3 | 1, 3 |
| B.2.7-9 | `onUpdate`, ScreenParts, draw | notification by selector; the `ScreenParts` hold is gone (P6) | P2, P6 | 1, 3 |
| B.2.10,29-65 | quick entry session construction and every session call | field layer = the door's `entry.*` session over the replica; its jobs are door calls in message order | P2, P3, P6, P7 | 3 |
| B.2.11-19 | entry helpers (`placementOf`, `parseTitle`, `isBlank`, …) | core pure rules (`rules.*`), imported by `update/` and selectors | P1 | 3 |
| B.2.20-23 | session writes (`createSection`, `edit`, `unfoldAbove`, `createWithId`) | the entry's job order: the core's synchronous step function over `EntryAnswer` (`backend`), called by the runtime inside its messages (P3) | P2, P3 | 1, 3 |
| B.2.24 | `list.adopt(created.id)` | `model.rowKeys` (`rowKey(taskId)` bound by `CreatedTask`, remapped by the replay's old→new id map, ids never reused) | P1, P3 | 1, 3 |
| B.2.25-27,109,111-112 | `listName`, `placementTitle`, `placementOfDay` | view answers for the screen's `needs(model)` (`viewsChanged`) and `rules.*` (clock from `model.now`) | P2, P3, P7 | 3 |
| B.2.28 | `newProject` from the bar | Cmd write | P2, P3 | 1, 3 |
| B.2.66-67 | entry `fresh` reads | a view answer the runtime computes from the replica for a need of the screen's `needs(model)` and hands the model (`viewsChanged`, memoised by replica, minute and need) | P2, P3 | 1, 3 |
| B.2.68,71 | entry render requests | notification by selector | P2 | 3 |
| B.2.69-70 | lock panel, forget typed | selectors; entry end | P1 | 3 |
| B.2.72 | bar turns the wheel | entry + ribbon gestures (layer stack; data applies at once) | P6 | 4 |
| B.2.73 | bar shows another day | `model.day`, after the entry's door calls in message order; its view a view answer for a need of the screen's `needs(model)` (`viewsChanged`) | P2, P3 | 3 |
| B.2.74-77 | plus drag (and aside on by project) | carry gesture `payload: plus` | P6 | 3 |
| B.2.78-86 | menu stack and timeline field calls | overlay + field and entry layers; selectors (layer stack; data applies at once) | P6 | 4 |
| B.2.87 | bar show / hide / follow | JSX from `model.entry` + `measure` | P1, P4 | 3 |
| B.2.88,242 | field / name input focus | `focus` | P7 | 3 |
| B.2.89-91 | reveal scroll, glide, wait for growth | `scroll` reveal; `motionSettled` | P5, P7 | 3 |
| B.2.92 | blur check timer | `focus` reports `blurred`; update decides | P7, P8 | 3 |
| B.2.93-95 | entry listeners and observers | `input` / `measure` | P7, P8 | 3 |
| B.2.96,100,103-108,110 | bar button callbacks | entry Msgs | P6 | 3 |
| B.2.97,101-102 | bar panel open / redraw / pick | nested overlay in the field layer (the door's `entry.*` session; the job order the core's step function) (a Preact layer) | P3, P6, P7 | 1, 3 |
| B.2.98 | document press while panel open | `input` → `pressedElsewhere` | P7 | 3 |
| B.2.99,113-114 | bar panel and capsule appear / fade | presence transitions: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6 | 3 |
| B.2.115-121 | title field editor | `editors` (EmbeddedEditor); key scope (`keys` driver) | P7 | 3 |
| B.2.122-124 | plus press, tap, drag | `input` → carry / entry | P7 | 3 |
| B.2.125-126 | ring, `tc-cancelling` | JSX; `chrome` body class (`chrome` takes it from the model) | P1, P7 | 3 |
| B.2.127-129 | `ScrollGlide` | `scroll` | P7 | 3 |
| B.2.130 | status bar query | `chrome` | P7 | 4 |
| B.2.131-133 | `EntryRows` drawing | view + `model.rowKeys` | P1 | 3 |
| B.2.134-135 | keyboard will show / hide | `chrome` → `model.chrome.keyboard`; keyboard transition | P4, P5 | 3 |
| B.2.136-141 | view settings file / store | Cmd `device.set`: a per-key patch that `PluginSettings.partition` routes to device storage; the store only keeps `model.device` (P1) | P2, P3 | 1 |
| B.2.142,145-147 | tab: screen create / open / close / resize | the leaf adapter (`host/adapters/leaf.ts`), `ScreenHost`, `drivers/mount.ts`; `measure` | P7, P8 | 1, 3 |
| B.2.143-144 | tab key scope, undo / find keys | `keys` driver (Obsidian `Scope`s) → Msgs | P7 | 3, 4 |
| B.2.148-149 | `ViewWatch` | the note adapter (`host/adapters/note.ts`) with `drivers/mount.ts` | P7 | 5 |
| B.2.150,152,154-157,159-160,162-163,165-166,168-170 | note block lifecycle, placement, events | the note adapter (`host/adapters/note.ts`) with `drivers/mount.ts` | P7, P8 | 5 |
| B.2.151,158 | block key scope | `keys`, its policy `Layout.keys` `focus` (Obsidian `Scope`s) | P7 | 5 |
| B.2.153 | block focus | `focus` | P7 | 5 |
| B.2.161,164 | block `onChange`, `projectNoteView` | runtime input; `projectNoteView` a view answer for a need of the screen's `needs(model)` (`viewsChanged`) | P2, P3 | 5 |
| B.2.167 | `--tc-block-lift` | `drivers/mount.ts` placement, lift from `measure` | P4 | 5 |
| B.2.171-223 | Settings tab and its pages | the screen at `Places.settings()`: until stage 7 the old tab keeps `SettingsServiceImpl` over the shared `PluginSettings`, an outside writer the replica follows through `onChange`; then its calls are door calls, their settings persisted as per-key patches | P2, P3, P7 | 6 |
| B.2.224-225,228 | undo button: `canUndo`, `onUndo` | `model.canUndo` (a view answer over the replica's history, `viewsChanged`); Msg `undo` | P1, P2, P3 | 1, 3 |
| B.2.226 | ⋯ pressed | overlay `more` | P6 | 3 |
| B.2.227 | `UndoService.onChange` | `model.canUndo` from the view answers over the replica's history (`viewsChanged`) (the old screen keeps `UndoService.onChange` until stage 7, never beside the new screens) | P2 | 1, 3 |
| B.2.229-230 | `StatusBarRoom` observers, body class | `chrome` | P7, P8 | 4 |
| B.2.231-235 | card size, priority colours, label paint on body | `chrome` per window (`chrome` takes it from the model) | P7 | 3, 4 |
| B.2.236-237 | haptics | Cmd `haptic` | P7 | 1 |
| B.2.238 | `execCommand` undo | `input` | P7 | 3 |
| B.2.239-241 | `SectionNameEntry` | naming layer = the door session (a door session over the replica) | P3, P6, P7 | 3 |
| B.2.243 | `FramePass` | driver frame scheduling | P7 | 3 |
| B.2.244 | popout listener | `ScreenHost` / `chrome` | P7, P8 | 1, 3 |

### B.3 G2

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| B.3.1-3,8,34-36,72-73,85-88 | `snap`, `stretch`, `carried`, `dropSpan`, `newSlot`, `bulkMenu`, peek reads (`shownSpan`, `isPast`, `relation`, `columnSections`) | view answers for the screen's `needs(model)` (`viewsChanged`) and `rules.*` (clock from `model.now`) | P2, P3, P7 | 4 |
| B.3.4-5,9-11,38,62-71,96,102 | writes through deps (resize, drop, fold, mark, move section, bulk, place) | door call in message order; its text to the tasks queue (`vault.process`, the base checked inside `fn`) [R23] | P2, P3 | 1, 3 |
| B.3.6-7 | `startCarry`, `endCarry` via deps | door carry calls, in message order [R23] | P2, P3, P7 | 1, 3 |
| B.3.12-15,19,40,74,103 | task / event / group / bulk menus, sources popover | `model.overlay` | P6 | 4 |
| B.3.16-18 | timeline selection set / cleared | `model.timeline.selected` | P1, P6 | 4 |
| B.3.20 | rename on second click | overlay → entry | P6 | 3 |
| B.3.21-22 | new slot gesture | timeline new-slot gesture → entry | P6 | 4 |
| B.3.23-24 | `layoutTasks`, `stretchTo` | selectors + transitions | P1, P5 | 3 |
| B.3.25,41,109 | haptics | Cmd `haptic` | P7 | 1 |
| B.3.26-27 | `onDragging`, `moved` → carryAt | carry Msgs; `carryAt` Cmd | P2, P6 | 3 |
| B.3.28 | `onError` → reportFailure | the door's `staleTask` or `failed` answer → notice | P2, P3 | 1, 3 |
| B.3.29,39 | `console.error` | action log | P2 | 1, 3 |
| B.3.30,51-55 | floats, plus float, drop line | JSX + transient channel + transitions | P5, P7 | 3 |
| B.3.31 | `DragSession.landNow` | `motion` finishes the running flight when a new carry starts | P5 | 3 |
| B.3.32-33 | plus drop result, targets cleared | carry gesture outcome → entry open | P6 | 3 |
| B.3.37 | `timeline.showDrop` | JSX | P1 | 4 |
| B.3.42-44 | section landing, settle, float animation | section-lift gesture; transitions | P5, P6 | 3 |
| B.3.45-50 | `DragSession` float phases, end, return, targets | carry gesture + `motion` | P5, P6 | 3 |
| B.3.56-58 | auto-scroll | `scroll` `edge`; offsets back to carry (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| B.3.59 | `ArrivingCard` toggles | the door's answer over the replica, at once (P3) | P3 | 1, 3 |
| B.3.60-61 | `LongPress` timer, outcomes | `update/gesture.ts` (its recognizer) | P7, P8 | 3 |
| B.3.75-79 | bulk capsule, ring, count, pick circles | JSX from `model.selection` | P1 | 4 |
| B.3.80-81 | found card scroll | `scroll` reveal | P7 | 4 |
| B.3.82-84 | peek reads (`dayView`, `events`, `fresh`) | gone as reads: a neighbour day's tasks and cached events are needs of the screen's `needs(model)` (`viewsChanged`); fresh events through the network lane | P2, P3 | 4 |
| B.3.89-90 | peek render, align | view for the neighbour day, from its need's answer (the screen's `needs(model)`) | P1, P2, P3 | 4 |
| B.3.91,93-95 | swipe → pager follow / settle / frames | swipe gestures + transient channel + settle transition (a tap leaves the settle running) | P5, P6 | 4 |
| B.3.97-101 | strip / day tracks | `motion`; day-swipe `nearer`, `landing` | P5 | 4 |
| B.3.104,106 | wheel dot, label | selectors | P1 | 4 |
| B.3.105 | wheel timers | `update/gesture.ts` (its recognizer) / timer Cmd | P7, P8 | 4 |
| B.3.107,110 | divider and pinch settings writes | Cmd `device.set`: a per-key patch that `PluginSettings.partition` routes to device storage; the store only keeps `model.device` (P1) | P2, P3 | 1 |
| B.3.108 | divider width live | transient channel; dispatch on a step | P4 | 4 |
| B.3.111 | pinch scale | transient channel; dispatch on a step | P4 | 4 |
| B.3.112-113 | wheel preventDefault, wheel zoom settle | `input`; `update/gesture.ts` (its recognizer) timer | P7 | 4 |
| B.3.114-117 | settings row reorder | the one carry (`update/carry.ts`, a settings-row payload) and its motion causes, at `Places.settings()` | P5, P6 | 6 |
| B.3.118 | free-room double click | `input` → entry `openAtEnd` | P7 | 3 |
| B.3.92 | horizontal wheel preventDefault | `input` | P7 | 4 |
| B.3.119-135 | pure core rules (`placeAt`, `swipeLanding`, `dividerAt`, …) | pure rules (`rules.*`), imported by `update/` and selectors | P4 | 4 |

### B.4 G3

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| B.4.1-5,36-39,79,105 | menu models, `fullTree`, `listName` | an open menu's keys and the full card's task are needs of the screen's `needs(model)` (`viewsChanged`, recomputed on every replica change); `rules.*` imported directly (clock from `model.now`) | P2, P3, P7 | 4 |
| B.4.6-18,40-51,54,56,59-60,173 | menu writes | write pick: its door call at the tap; the closing sheet pins the layout under it (P6) | P2, P3, P6 | 1, 3 |
| B.4.19-22 | `RepeatPage` | overlay page = a door session (`repeatPage.end`); its write a door call when the page closes; the closing sheet pins the layout | P3, P6, P7 | 3 |
| B.4.23,28,58,68 | open link / in Obsidian / note / in Calendar | Cmd `obsidian.open` / `openInCalendar` | P7 | 1 |
| B.4.24-26,29,53,55,57 | typing picks (`pickNow`): rename, description, subtask, new section, project rename, attach note | typing picks: the user's event handled to the end, focus last [R23] | P2, P6, P7 | 3 |
| B.4.27,31 | open full card from menu / peek | overlay pick → `model.sheet.full` | P6 | 4 |
| B.4.30,66 | subtask menu over the same sheet; ⋯ → Search | hand-over: one layer transition | P6 | 3, 4 |
| B.4.32,52,62,133,166 | lifted copy, bulk close, link closes menu, view menu, project menu | menu layer (a Preact layer) | P6 | 3 |
| B.4.33 | second press within double click | overlay → entry rename | P6 | 3 |
| B.4.34 | menu closed while typing | entry Msg (layer stack; data applies at once) | P6 | 3 |
| B.4.35,69,129,132,134-135,141-144,146-147 | pure rules (`labelTitle`, `grownStart`, `editRepeat`, `projectsEntryLook`, `projectsDrop`, …) | pure rules (`rules.*`), imported by `update/` and selectors | P1 | 3, 4 |
| B.4.61,85,87,91-92,111-128 | MarkdownRenderer, EmbeddedEditor, ObsidianMarkdown, line commands, scopes | `editors` (key scopes (`keys` driver)) | P7 | 3 |
| B.4.63-65 | month pick, view mode, Subprojects | overlay page; door call after the entry's door calls, in message order | P2, P3, P6 | 3 |
| B.4.67 | Select tasks | `model.selection.mode` (layer stack; data applies at once) | P6 | 4 |
| B.4.70 | menu waits for the column to scroll the card in | overlay `revealing` + `scroll` (`scroll` orders; `measure` reports scroll) | P6, P7 | 3 |
| B.4.71,77,84,86,88-89,93-98,100-101 | full card entry session and description draft | `sheet.full` = the door sessions (a door session over the replica) | P3, P6, P7, P8 | 3 |
| B.4.72 | `RenamedTexts.add` | one plugin-wide replica; the door's answer applied at once (P3) | P3 | 1, 3 |
| B.4.73-76 | full card capsule (undo, ⋯, plus) | `model.canUndo`; overlay; entry | P1, P6 | 3 |
| B.4.78,83 | `find` (async) | the search query is a need of the screen's `needs(model)`; its results a view answer (`viewsChanged`) | P2, P3 | 3 |
| B.4.80,90 | `toggleDone`, `setDescription` (debounced) | Cmd write; debounce timer Cmd | P2, P3 | 1, 3 |
| B.4.81-82 | subtask menu, project line | overlay; Cmd + close | P6 | 3 |
| B.4.99 | title field | `editors` | P7 | 3 |
| B.4.102-103 | full card close / error | Msgs | P6 | 3 |
| B.4.104 | search | door call `tasks.search` in the message, memoised by query | P2, P3 | 4 |
| B.4.106-107 | search pick / close | overlay → `revealed` | P6 | 4 |
| B.4.108 | search takes the ⋯ sheet | hand-over: search takes the ⋯ sheet | P6 | 4 |
| B.4.109 | field's own undo | `input` | P7 | 3 |
| B.4.110 | Refresh now | network lane | P2 | 1 |
| B.4.130-131 | repeat change / remove | overlay page Msgs | P6 | 3 |
| B.4.136-140,145 | by-project reads of the model and handlers | selectors; JSX handlers | P1 | 3, 4 |
| B.4.148-149,151-152,161,167 | tree / list drops, close dim, pick node, move project, clear filter | Cmd write | P2, P3 | 1, 3 |
| B.4.150,155,160 | haptics | Cmd `haptic` | P7 | 1 |
| B.4.153 | panel width → frame | `measure` | P4, P8 | 4 |
| B.4.154 | tree width save | Cmd `device.set`: a per-key patch that `PluginSettings.partition` routes to device storage; the store only keeps `model.device` (P1) | P2, P3 | 1 |
| B.4.156 | tree width read | `model.device.treeWidth` | P1 | 4 |
| B.4.157,168 | new project / rename project name field | naming layer [R23] | P6 | 3, 4 |
| B.4.158-159 | tree row tap, row lift attach | Msg; tree-lift gesture | P6 | 4 |
| B.4.162-165 | `carryAt`, reread, clock, error | door call `carryAt` + timer in message order; `model.now`; `staleTask` | P2, P3, P7 | 3 |
| B.4.169 | carry deps | carry gesture | P6 | 3 |
| B.4.170-172 | note search modal | `editors` | P7 | 4 |
| B.4.174 | grips | `input` → resize gesture | P7 | 3 |

### B.5 G4

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| B.5.1-9,12,22,65,68,73-74,83,96,100 | timeline / list core reads (`DayBoundary`, `shownSpan`, `relation`, clock, `isPast`, `listName`, `stepFunnel`) | view answers for the screen's `needs(model)` (`viewsChanged`) and `rules.*` (clock from `model.now`); clock → `model.now` | P2, P3, P7 | 3, 4 |
| B.5.10-11,13-21,23,40-41,60,63-64,79,90-91,95,103 | pure rules | pure rules (`rules.*`), imported by selectors | P1, P4 | 3, 4 |
| B.5.24-26,39,42-46,48-50,53,75,81-82,102,104-105 | reads of screen state through deps | selectors | P1 | 3, 4 |
| B.5.27-29,47,51-52,54,76,107-110 | handlers attached per row / block | JSX handlers → `input` Msgs | P7 | 3 |
| B.5.30,66,121 | timeline resize, block scroller, block fit frame | `measure` | P4, P8 | 3, 4 |
| B.5.31 | grips attach | `input` | P7 | 3 |
| B.5.32 | drop line in body | JSX portal | P1 | 3 |
| B.5.33-37 | timeline block motions on render | transitions by cause (keyed diff within one context); leaving rows skipped by layout selectors; fold and heights one transition (P4) | P4, P5 | 4 |
| B.5.38,61 | `RenamedTexts.shown` | one plugin-wide replica; the door's answer applied at once (P3) | P3 | 1, 3 |
| B.5.55 | `EntryRows` | view + `model.rowKeys` | P1 | 3 |
| B.5.56,58,117-118 | ScrollHold, ScrollEdges, glides | `scroll` | P7 | 3 |
| B.5.57 | grow room under a plate | transition B1.9 | P5 | 3 |
| B.5.59 | landing render | JSX from section-lift gesture | P1 | 3 |
| B.5.62,72 | icons, kit buttons | JSX | P1 | 3, 4 |
| B.5.67 | `CARD_HEIGHTS.max` | constant | P1 | 3 |
| B.5.69-71 | day arrows, Today | day-swipe Msgs | P6 | 4 |
| B.5.77,80,93,106 | divider live width, haptics | transient channel; Cmd `haptic` | P4, P7 | 4 |
| B.5.78,92 | share saves | Cmd `device.set`: a per-key patch that `PluginSettings.partition` routes to device storage; the store only keeps `model.device` (P1) | P2, P3 | 1 |
| B.5.84-86 | ribbon day track / follow / arrive | swipe gestures | P6 | 4 |
| B.5.87-88 | `is-switching` timers | ribbon slide transition | P5, P8 | 4 |
| B.5.89,94,101 | shared nav placement, by-project mount | view composition | P1, P8 | 3, 4 |
| B.5.97-99 | rows heights motion, fit frame, settle refit | the fold and the heights that depend on it, one transition; layout selectors skip leaving rows; heights never held | P4, P5, P8 | 3, 4 |
| B.5.111-116 | keyed rows motion | transitions by cause (keyed diff within one context); leaving rows skipped by layout selectors; fold and heights one transition (P4) | P4, P5 | 3 |
| B.5.119-120 | `SnapGlide` | `motion` | P5 | 4 |
| B.5.122-124 | prototype | replaced by the runtime | — | 1, 7 |

### B.6 event sources

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| B.6.1 | `TaskService.onChange` | `fileChanged` → the runtime takes the new base (with the id state the core settles on it) and replays the pending log in order, ids mapped through earlier creates and resolved to current keys (`tasks.keyOf`), each entry with its recorded `nowMs` and projects screen and the current settings; the new base tidied first, outside the log; only text, history and ids taken; the old→new id map applied to the whole model, ids never reused; kept parts reconciled after a dropped call; at most twice; a moved file or a changed `tasksFile` checked (P3); the full card's levels are view answers (a need of the screen's `needs(model)`, recomputed on every replica change) (layer stack; data applies at once) | P2, P3, P8 | 1, 3 |
| B.6.2,13 | calendar change, poll | network lane | P2, P8 | 1 |
| B.6.3,47-48 | settings / view settings change | settings in the replica as `PluginSettings.get()`, refreshed on its `onChange`; written as a per-key patch through `PluginSettings.update`, which merges over a fresh read (P3) | P2, P3, P8 | 1 |
| B.6.4 | day change | `dayChanged` (applies at once (P6)) | P6, P8 | 4 |
| B.6.5-7 | focus, visibility, active leaf | `chrome` → `model.visible`; poll wake | P4, P8 | 3, 4 |
| B.6.8 | document pointerdown ×3 | `input` → `pressedElsewhere` | P7, P8 | 3 |
| B.6.9 | document keydown (bulk) | `input` | P7, P8 | 4 |
| B.6.10,95 | arbiter idle | gone: when the motion ends, the move from its pinned layout to the current one is a keyed transition | P5, P6, P8 | 3, 4 |
| B.6.11 | `css-change` | `chrome` → `model.theme` | P4, P8 | 3, 4 |
| B.6.12,155 | minute interval, tick | clock → `model.now` | P2, P8 | 1, 3 |
| B.6.14,50 | view resize | `measure` stage size | P4, P8 | 4 |
| B.6.15-19,49 | plugin settings, visibility, vault raw, popouts, sync leave | plugin runtime inputs → messages to every screen's store | P2, P7, P8 | 1 |
| B.6.20 | DayData driven by calls | runtime | P2, P8 | 1, 3 |
| B.6.21,97-99 | session `onChange` / `fresh` / `renamed` | entry / full card = door sessions (a door session over the replica) | P3, P6, P7, P8 | 3 |
| B.6.22-24,35-36 | tap away, press ending, bar presses | `input` | P7, P8 | 3 |
| B.6.25-26 | root scroll, hand scroll | `scroll` `userScrolled` | P7, P8 | 3 |
| B.6.27,34,37 | transitionend, fade finish | `motionSettled` | P5, P8 | 3 |
| B.6.28-29,38 | resize observers, panel place | `measure` | P4, P8 | 4 |
| B.6.30 | field growth finished | `motionSettled` | P5, P8 | 3 |
| B.6.31,104 | blur timers | `focus` → `blurred` | P7, P8 | 3 |
| B.6.32-33 | FramePass, ScrollGlide frames | drivers | P7, P8 | 3 |
| B.6.39 | bar repeat panel change | entry Msg | P6, P8 | 3 |
| B.6.40-44 | field editor change, keys, IME, focus | `editors` + `input` (scopes (`keys` driver)) | P7, P8 | 3 |
| B.6.45 | plus pointer | `input` | P7, P8 | 3 |
| B.6.46 | keyboard events | `chrome` | P4, P8 | 4 |
| B.6.51,59 | tab / block key scopes | `keys`, its policy `Layout.keys` (`tab` for the leaf, `focus` for a note; Obsidian `Scope`s) | P7, P8 | 3, 5 |
| B.6.52-58 | note block events | the note adapter (`host/adapters/note.ts`) with `drivers/mount.ts` | P7, P8 | 5 |
| B.6.60,106 | `UndoService.onChange` | `model.canUndo` from the view answers over the replica's history (`viewsChanged`) (the old screen keeps `UndoService.onChange` until stage 7, never beside the new screens) | P2, P8 | 3, 4 |
| B.6.61 | status bar observer | `chrome` | P7, P8 | 4 |
| B.6.62-66 | Settings tab events | the screen at `Places.settings()`: inputs → messages through `input` and `editors` | P2, P7, P8 | 6 |
| B.6.67 | popout opens | `ScreenHost` / `chrome` (`chrome` takes it from the model) | P7, P8 | 1, 3 |
| B.6.68 | section name field keys / blur | naming layer (door session) | P3, P6, P7, P8 | 3 |
| B.6.69 | field undo keys | `input` | P7, P8 | 3 |
| B.6.70-78 | card / block / event / canvas / drag / resize / section / long-press pointer events | `input` → carry, timeline and section-lift gestures | P6, P7, P8 | 4 |
| B.6.79 | auto-scroll frame | `scroll` (`scroll` orders; `measure` reports scroll) | P7, P8 | 3 |
| B.6.80-81 | flight timers, section float finished | `motionSettled` (timeout message) | P5, P8 | 3 |
| B.6.82-83 | peek reads resolve | gone: nothing to read ahead; the neighbour day is a need of the screen's `needs(model)`; `eventsLanded` Msg from the network lane | P2, P3, P8 | 4 |
| B.6.84-86 | swipe pointer, wheel stream timer, pager frame | `update/gesture.ts` (its recognizer) + `motion` | P7, P8 | 4 |
| B.6.87-88 | pinch pointer / wheel, wheel settle | `input` + pinch gesture | P7, P8 | 4 |
| B.6.89-90 | wheel pointer, click, keys, timers | `input` + wheel-drag gesture | P7, P8 | 4 |
| B.6.91,165 | divider gestures (ribbon) | `input` + divider gesture | P7, P8 | 4 |
| B.6.166 | divider gestures (still layouts) | `input` + divider gesture | P7, P8 | 4 |
| B.6.92 | settings row reorder | the one carry (a settings-row payload) through `input` and `update/gesture.ts`; the order write a door call (`settings.move*`), persisted as a per-key patch | P3, P6, P7, P8 | 6 |
| B.6.93,159-161 | free room double click, plates | `input` → entry | P7, P8 | 3 |
| B.6.94 | found card frame | `scroll` reveal | P7, P8 | 4 |
| B.6.96,100-103 | full card refresh, title rename end, description save, focus, Escape | `sheet.full` Msgs; Escape order (layer stack; data applies at once) | P6, P8 | 3 |
| B.6.105,112-113 | full card / overlay show and remove frames | presence: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6, P8 | 3 |
| B.6.107-109 | search input, keys, row click | overlay search | P6, P8 | 4 |
| B.6.110-111 | overlay Escape, backdrop | `input` → overlay close | P7, P8 | 3 |
| B.6.114 | `Picks.giveUp` | (timeout message) bounded wait | P2, P8 | 3, 4 |
| B.6.115-117,121-127 | menu events (Enter, double press, copy click, peek, view menu frame, month arrows, switch, toggles) | overlay Msgs (a Preact layer) | P6, P8 | 4 |
| B.6.118 | stack field row grows | transition | P5, P8 | 3 |
| B.6.119 | menu after the column scroll | overlay `revealing` + `scroll` (`scroll` orders; `measure` reports scroll) | P6, P8 | 3 |
| B.6.120 | page morph finished | `motionSettled` | P5, P8 | 3 |
| B.6.128-132 | embedded editor focus, update, keys, rendered click | `editors` | P7, P8 | 3 |
| B.6.133,135 | tree panel resize, tree divider | `measure`; tree-divider gesture | P4, P6, P8 | 4 |
| B.6.134,136,141-143 | dim, tree row, filter title, plate | Msgs [R23] | P6, P8 | 4 |
| B.6.137-138 | tree lift | `input` + tree-lift gesture | P7, P8 | 4 |
| B.6.139-140 | carry report timer, move / end | door call `carryAt` + timer, in message order | P2, P3, P7, P8 | 3 |
| B.6.144 | repeat editor buttons | overlay page Msg | P6, P8 | 3 |
| B.6.145 | view button | overlay `view` | P6, P8 | 3 |
| B.6.146 | note chosen | `editors` → Cmd write | P2, P3, P8 | 3 |
| B.6.147-148,152 | grips, kit buttons | `input` | P7, P8 | 3 |
| B.6.149 | timeline resize observer | `measure`; anchor held (`scroll` orders; `measure` reports scroll) | P4, P8 | 4 |
| B.6.150-151 | wheel / touch drop the anchor | `input` → `userScrolled(timeline)` | P7, P8 | 4 |
| B.6.153,156-158 | ScrollEdges, ScrollHold | `scroll` (`scroll` orders; `measure` reports scroll) | P7, P8 | 3 |
| B.6.154,173-174 | motion finished (block gone, row grown / left) | `motionSettled`; leaving rows skipped by layout selectors (P4) | P4, P5, P8 | 3 |
| B.6.162-164 | note block observers and frame | `measure` | P4, P8 | 5 |
| B.6.167-168 | strip track callbacks, slide end | `motion` | P5, P8 | 4 |
| B.6.169-171 | rows observer, fit frame, settle | `measure`; `motionSettled`; heights never held | P4, P5, P8 | 3, 4 |
| B.6.172 | drop hover in rows | carry target | P6, P8 | 3, 4 |
| B.6.175-176 | glide stopped by a finger, glide end | `scroll` `userScrolled`, `scrollSettled` (`scroll` orders; `measure` reports scroll) | P7, P8 | 3 |
| B.6.177 | `SnapGlide` frames | `motion` | P5, P8 | 4 |
| B.6.178-180 | prototype | replaced by the runtime | — | 1, 7 |

## Behaviour (203 inputs, 84 motions, 84 measurements, 52 screen states)

Row ids are the ids of `inventory-behaviour.md` (it has no C1.16; C1 holds 23 rows).

### A. Inputs and gestures

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| A1.1-2 | open the tab (ribbon icon, command) | the leaf adapter opens the view; `ScreenHost` mounts the one screen with `Places.main()` | P7 | 1, 3 |
| A1.3 | note block appears | the note adapter mounts the one screen with `Places.note(path)` | P7 | 5 |
| A1.4 | several tabs, popouts | one runtime per plugin: one replica, one tasks queue, one pending log; `chrome` per window | P2, P3, P7, P8 | 1 |
| A2.1 | tap a card → task menu after reveal | tap `update/gesture.ts` (its recognizer) → overlay `task` with `revealing` (`scroll` orders; `measure` reports scroll) | P6 | 3 |
| A2.2 | counter tap folds subtasks | Cmd `toggleCollapsed`; fold motion by cause (keyed diff within one context) | P2, P5 | 3 |
| A2.3 | folder mark tap → filter | Cmd `selectProjectNode` | P2 | 3 |
| A2.4,8-9 | right click / click with selection → bulk or task menu | tap order function over `model.selection`; overlay | P6 | 4 |
| A2.5 | double click → rename | overlay `task` → entry rename (second press within 250 ms) | P6 | 3 |
| A2.6-7,10 | Cmd-click, Shift-click, tap in select mode | `model.selection`; select mode (layer stack; data applies at once) | P6 | 4 |
| A2.11-15 | long press / mouse drag lift, cancel, second finger, redraw during press | `update/gesture.ts` (its recognizer) → carry gesture; hand-off to pinch | P6, P7 | 3 |
| A2.16-17 | Done / immovable by-project cards | card `can` from the core; tap only | P1 | 3, 4 |
| A2.18-21 | double click free room, plates | `input` → entry `openAtEnd` / `openIn` | P6 | 3, 4 |
| A2.22 | select text in the lifted copy | view (native selection) | P1 | 3 |
| A2.23 | link in the copy | overlay pick → Cmd `obsidian.open` | P6 | 3 |
| A3.1 | section header tap | overlay `section` | P6 | 3 |
| A3.2 | section lift | section-lift gesture | P6 | 3 |
| A3.3-4 | rename section, new section name | naming layer | P6 | 3 |
| A4.1-3 | timeline tap, double click, mark | tap `update/gesture.ts` (its recognizer) → overlay / entry / Cmd | P6 | 4 |
| A4.4-5 | finger hold → menu, then drag with no free moment | hold gesture + overlay at once, then hand-off (layer stack; data applies at once) | P6 | 3 |
| A4.6 | mouse drag of a block | carry gesture (grab offset) | P6 | 3 |
| A4.7-8 | long click, right click → select with menu | `model.timeline.selected` + overlay | P6 | 4 |
| A4.9 | stretch dots | resize gesture | P6 | 3 |
| A4.10 | event menu | overlay `event` | P6 | 4 |
| A4.11 | new slot on canvas | new-slot gesture → entry | P6 | 3 |
| A4.12-13 | pinch, ctrl-wheel zoom | pinch gesture; transient channel; dispatch on a step | P4, P6 | 4 |
| A4.14 | touch / wheel drops the opening anchor | `userScrolled(timeline)` clears `model.timeline.anchor` (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| A4.15 | press elsewhere clears the block selection | `pressedElsewhere` | P6 | 3 |
| A5.1-2,12 | plus tap / keyboard; ignored while hidden | entry `openFromPlus`; selector `plusHidden` | P6 | 3 |
| A5.3-8 | carry the plus; ring cancel; drop in gap, timeline, title, by project | carry gesture `payload: plus` | P6 | 4 |
| A5.9 | plus in the tree gap → project name | carry → naming `newProject` | P6 | 4 |
| A5.10-11 | plus at the left edge / over a tree row | the door's carry methods over the replica | P3, P6, P7 | 4 |
| A6.1-5,7,9,11-13 | drag moves, targets, cancel, cross ring, tree drop | carry gesture; targets computed from `model.measured` and the core's rules; pinned by id, `targetChanged` when the replica changes; its content updates in place [R23] | P3, P4, P6 | 3, 4 |
| A6.6 | auto-scroll at edges | `scroll` `edge`; offsets back to the carry (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| A6.8 | hover a tree row 600 ms → node opens | core carry; the door's answer to `carryAt` applies at once (pinned drop places, `targetChanged` (P6)) | P3, P6 | 4 |
| A6.10 | let go → write, then flight to the real place | the door's answer in the drop's own message (P3) + flight transition | P3, P5 | 1, 3 |
| A6.14 | let go among by-project cards | the door's answer: the landing card at the line, in the drop's own message (P3) | P3 | 1, 3 |
| A6.15 | new drag while a copy flies | `motion` finishes the running flight | P5 | 3 |
| A6.16 | no redraw under a gesture | the carry draws the layout it pinned; a node opened by the held card re-pins it as one whole-region transition (D65) | P5, P6 | 3, 4 |
| A6.17 | iOS lost lift | `input` (new primary finger ends the gesture) | P7 | 3 |
| A6.18 | view closed mid-drag | `ScreenHost`'s teardown ends the carry (`endCarry`) and cancels the layer (P8) | P7, P8 | 3 |
| A6.19 | lifted block leaves the timeline stack | selector `stackTasks` without `carry.lifted`; transition | P1, P5 | 4 |
| A7.1-5 | finger swipe, vertical scroll, trackpad swipe, ctrl-wheel, rubber band | ribbon swipe gesture + `update/gesture.ts` (its recognizer) | P6, P7 | 4 |
| A7.6 | finger down while the screen runs | a tap leaves the settle running and goes to what it hit | P5, P6 | 4 |
| A7.7 | new swipe during a run | ribbon swipe catches the running transition | P5, P6 | 4 |
| A7.8 | no swipe in other modes / block | selector `hasPages` | P1 | 4 |
| A7.9-14 | wheel tap, quick / slow drag, long press, arrows, cancel | wheel-drag gesture; careful pace `update/gesture.ts` (its recognizer) | P6 | 4 |
| A7.15 | leaving Done | update rule on place change | P2 | 4 |
| A7.16-18 | ‹ ›, title → today, repeated taps | day-swipe gesture; each turn drawn from the view answers of its own message's loop (P2) | P3, P6 | 4 |
| A7.19 | switch day / place with a field open | the field's door calls run first, in message order; the switch is drawn from the view answers of the same message's loop (P2); a bar place keeps the field layer | P3, P6 | 4 |
| A8.1-2 | ribbon divider, snap glide | divider gesture; snap transition | P5, P6 | 4 |
| A8.3 | still layouts' divider | divider gesture | P6 | 4 |
| A8.4 | tree divider | tree-divider gesture; lists give way live (transient channel; dispatch on a step) | P6 | 4 |
| A8.5 | fixed halves | view (not draggable) | P1 | 4 |
| A9.1-3,6 | folder button, tree row, dim, cross | Cmd writes (`setProjectsPanel`, `pickProjectNode`, `clearProjectFilter`) | P2, P3 | 4 |
| A9.4 | project lift | tree-lift gesture | P6 | 4 |
| A9.5,8,10-11 | project menu, folder switch, note, delete | overlay `project` (a Preact layer) | P6 | 3 |
| A9.7 | rename project | naming layer | P6 | 3, 4 |
| A9.9 | attach note | `editors` (Obsidian `FuzzySuggestModal`), opened by a typing pick | P6, P7 | 3 |
| A10.1-3 | view button, mode, Subprojects | overlay `view`; Cmd writes after the entry ends | P2, P3, P6 | 3 |
| A11.1 | undo | door call `history.undo`; motion of what it changed (keyed diff within one context) | P2, P3, P5 | 1, 3 |
| A11.2-3 | ⋯ menu, Search on the same sheet | menu layer `more` → `search` by one hand-over | P6 | 4 |
| A11.4-6 | select mode | `model.selection.mode` (layer stack; data applies at once) | P6 | 4 |
| A11.7 | press outside clears selection | `pressedElsewhere` | P6 | 4 |
| A11.8-11 | search typing, keys, pick, cancel | overlay `search`; door call `tasks.search` in the message, memoised by query | P2, P3, P6 | 4 |
| A11.12-13 | Cmd+F, Cmd+Z in the view | `keys` driver (Obsidian `Scope`s) → Msgs | P7 | 3, 4 |
| A11.14 | Cmd+Z in a plain field | `input` | P7 | 3 |
| A11.15 | any press clears the found ring | `pressedElsewhere` → `model.found = null` | P6 | 4 |
| A12.1-3 | backdrop, Escape, Enter confirms | menu layer; Escape order over the stack (layer stack; data applies at once) | P6 | 3 |
| A12.4 | first pick, action after the fade | overlay `picked`; write pick: its door call at the tap, the list's change shown as the close settles (P6) | P2, P3, P6 | 3 |
| A12.5 | pick that types | typing pick: the user's event handled to the end, focus last | P2, P6, P7 | 3 |
| A12.6-10 | label tiles, project page, repeat page, date picker, reminder | overlay pages redrawn (a Preact layer) | P6 | 3 |
| A12.11 | subtask menu over the same sheet | hand-over: one layer transition to the subtask's sheet | P6 | 3 |
| A12.12-13 | description peek, Refresh now | overlay → sheet; network lane | P2, P6 | 4 |
| A13.1-14,16,18-19 | field typing, keys, IME, `[[`, line hotkeys, paste, tap away, blur, bar | field layer = the door's `entry.*` session over the replica; `editors`; `input`; `focus` | P3, P6, P7 | 3 |
| A13.15 | bar panels | nested overlay inside the entry (layer stack; data applies at once) | P6 | 3 |
| A13.17 | place tile / date in the bar | field layer + a context change (ribbon / day) after the field's door calls, in message order | P3, P6 | 4 |
| A13.20 | rename via menu (list, timeline, stack) | overlay → entry | P6 | 3, 4 |
| A13.21 | add subtask on a timeline-only task | overlay + entry at once (layer stack; data applies at once) | P6 | 4 |
| A13.22 | hand scroll stops following the field | `scroll` `userScrolled` → entry `follow = false` | P7 | 3 |
| A14.1-10 | full card: close, Escape, Done, circles, subtasks, parent, project, description, bottom row, rename | `model.sheet.full` + sessions (a door session over the replica) + overlay (layer stack; data applies at once) | P3, P6, P7 | 3 |
| A15.1-3 | note block presses, focus, key scope | the note adapter's presses kept from the editor by `input`; `focus`; `keys` (`Layout.keys` `focus`) | P7 | 5 |
| A15.4-5 | touchmove / touchstart prevented | `input` (synchronous preventDefault) | P7 | 4 |
| A15.6 | focus, visibility, active leaf | `chrome` → `model.visible` | P4 | 3, 4 |
| A15.7 | theme change | `chrome` → `model.theme` | P4 | 3, 4 |
| A15.8 | view resize | `measure` stage size | P4 | 4 |
| A15.9 | keyboard shows / hides | `chrome` → keyboard transition | P4, P5 | 3 |
| A15.10 | Create file | Cmd `createFile` | P2 | 3, 4 |
| A15.11 | settings rows drag | the one carry (a settings-row payload), at `Places.settings()` | P6 | 6 |
| A16.1,3 | one gesture at a time; no start while busy | `interaction.gesture` slot + start table | P6 | 3 |
| A16.2 | hold → drag hand-off | explicit hand-off in the layer table | P6 | 3 |
| A16.4 | swipe settling counts as free; finger releases the claim | a tap leaves the settle running; only a new swipe catches it (`motionInterrupted`) | P5, P6 | 4 |
| A16.5-6 | pointer kinds, sideways vs vertical | `update/gesture.ts` (its recognizer) | P7 | 3, 4 |
| A16.7-8 | wheel claim fails, divider claims on down | start table; `input` preventDefault | P6, P7 | 4 |
| A16.9 | pinch hand-off on a second finger | explicit hand-off | P6 | 4 |
| A16.10-11 | grip stops propagation, canvas declines blocks | `input` hit targets | P7 | 3 |
| A16.12 | naming holds the screen | naming layer + keyed field (`rowKey(taskId)` bound by `CreatedTask`, remapped by the replay's old→new id map, ids never reused) | P1, P3, P6 | 1, 3 |
| A16.13 | project menu refuses while busy | start table | P6 | 3 |
| A16.14 | redraws and tick wait while busy | gone: data applies at once; anything moving draws the layout it pinned when it began | P6 | 3, 4 |
| A16.15 | writes in order, after a closing pick | message order: every door call runs in the message that asks for it; a pick's at the tap | P2, P3 | 1, 3 |
| A16.16 | Escape order | function over the layer stack (layer stack; data applies at once) | P6 | 3 |
| A16.17 | tap order on a card | function over the active gestures | P6 | 3 |

### B. Motions

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| B1.1-4 | row grows in, leaves, mark row folds, kept row slides (FLIP) | list transitions by cause (keyed diff within one context); leaving rows skipped by layout selectors; fold and heights one transition (P4) | P4, P5 | 3 |
| B1.5 | row comes back while leaving | a returning key revives its leaving entry (one entry per key) | P4, P5 | 3 |
| B1.6-8 | timeline block moved, new, gone | timeline transitions by cause (keyed diff within one context; leaving rows skipped by layout selectors) | P4, P5 | 4 |
| B1.9 | plate replaced by first card | transition (room grows under the stand-in) | P5 | 3 |
| B1.10,12 | bar panel fades, desktop bar leaves | presence: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6 | 3 |
| B1.11 | desktop bar appears | appear transition | P5 | 3 |
| B1.13 | float width from the card | carry lift transition | P5 | 3 |
| B1.14 | menu page morph | overlay page transition (a Preact layer) | P5 | 3 |
| B1.15-16 | section copy lands / flies back / sinks | section-lift transitions | P5 | 3 |
| B1.17 | strip scrub between places | transient channel between two computed layouts (computed per place, (P4)) | P4, P5 | 4 |
| B1.18 | stack field row grows | transition | P5 | 3 |
| B2.1 | fade room height when a field opens | entry transition (WAAPI; layout transition banned in CSS) | P5 | 3 |
| B2.2 | plus / capsule / wheel hide (scale) | transition on gesture / entry / select start | P5 | 3 |
| B2.3-5,7 | wheel settle, ribbon `is-switching` | ribbon / wheel transitions | P5 | 4 |
| B2.6,22-23,27,29 | popover, peek, panel, sheet, search rise | presence transitions (transform moves to WAAPI): the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6 | 4 |
| B2.8-10 | fold on lift (cards, slot, plate) | carry / section-lift transitions | P5 | 3 |
| B2.11-12 | list drop line moves, level | carry target transitions | P5 | 3 |
| B2.13 | timeline drop line steps | carry target transition | P5 | 4 |
| B2.14-16 | plus / card float flights, stack fade | flight transitions (the door's answer, P3) | P3, P5 | 1, 3 |
| B2.17-19 | backdrop, level shadow, copies fade | CSS opacity stays; presence: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6 | 3 |
| B2.20-21 | select circles slide in, dots hide | select-mode transition | P5 | 4 |
| B2.24 | folder switch knob | overlay transition; the door's answer over the replica, at once (P3) | P3, P5 | 1, 3 |
| B2.25 | bar rides the keyboard | keyboard transition | P5 | 3 |
| B2.26 | desktop capsule away (opacity) | CSS opacity stays; presence: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6 | 3 |
| B2.28 | settings rows step aside | `motion`: the fold under a lift, the carry's cause, at `Places.settings()` | P5 | 6 |
| B2.30-31 | phone tree panel slide, dim | panel transition | P5 | 4 |
| B2.32-33 | docked panel and columns slide | dock transition | P5 | 4 |
| B2.34 | view button hides / moves with the wheel | transition with the ribbon | P5 | 4 |
| B2.35 | rows heights (delayed while a card fades) | Rows heights move with the fold in one transition (layout selectors skip the leaving row) | P4, P5 | 3, 4 |
| B2.36 | another context: heights jump | no transition on a context change | P5 | 3, 4 |
| B2.37 | press feedback | CSS stays | P5 | 3 |
| B3.1-4 | pager run, day track, strip follow, rubber band | swipe gestures + `motion` (transient channel) (a tap leaves the settle running) | P5 | 4 |
| B3.5 | divider glide into / out of the middle | snap transition | P5 | 4 |
| B3.6 | column scrolls the card in, then the menu | overlay `revealing` + `scroll` (`scroll` orders; `measure` reports scroll) | P6, P7 | 3 |
| B3.7 | search reveals a card | `scroll` reveal | P7 | 4 |
| B3.8 | field follows into sight | `scroll` reveal; `motionSettled` | P7 | 3 |
| B3.9 | keyboard slide | keyboard transition | P5 | 3 |
| B3.10 | field in a menu raised over the keyboard | selector from `model.chrome.keyboard` | P4 | 3 |
| B3.11 | auto-scroll | `scroll` `edge` | P7 | 3 |
| B3.12 | pinch layout per frame | transient channel; dispatch on a step | P4, P8 | 4 |
| B3.13 | flight awaited by timer | `motionSettled` (timeout message) | P5, P8 | 3 |
| B3.14-16,18 | overlay / panel / full card show and remove | presence: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6 | 3 |
| B3.17 | view menu placed again next frame | `measure` → placement | P4, P8 | 3 |
| B3.19-21 | wheel settle, ribbon switch, docking class timers | transitions | P5, P8 | 4 |
| B3.22 | rows fit then re-measure | Rows heights measured, never held; one transition with the fold | P4, P5 | 3, 4 |
| B3.23 | scroll hold under a shrinking list | `scroll` (ScrollHold) | P7 | 3 |
| B3.24 | now line every minute | clock → `model.now` | P2 | 1, 3 |
| B3.25 | settings row settles | `motion`: the drop flight, then the order from the write, at `Places.settings()` | P5 | 6 |
| B3.26 | timeline opening anchor | (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| B3.27-29 | question, search row, name fields scrolled into view | `scroll` reveal | P7 | 3, 4 |

### C. Measurements

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| C1.1-3,6 | stage width, rubber band distance, day track distances | `measure` stage size | P4 | 4 |
| C1.4 | keep hours still when all-day rows differ | computed from the model (all-day rows) and measured heights | P4 | 4 |
| C1.5 | forced reflow for `is-redrawn` | gone | P5 | 3 |
| C1.7 | strip keyframes from computed styles | computed per place (P4); tokens read once | P4 | 4 |
| C1.8 | still-layout widths | selector `layoutWidths` over stage size | P4 | 4 |
| C1.9-14 | rows: room, fade, leaving delay, typing heights, stops | `measure` row heights → selector `stackedLists` | P4 | 3, 4 |
| C1.15 | foot fade left edge | selector | P4 | 3, 4 |
| C1.17 | note block height | the inline frame (decision 44); `measure` for what depends on it | P4 | 5 |
| C1.18-19 | Live Preview end room, note view mutations | the note adapter (`host/adapters/note.ts`) with `drivers/mount.ts` | P4, P7 | 5 |
| C1.20 | status bar room | `chrome` | P4 | 4 |
| C1.21-22 | tree panel width, tree divider bounds | `measure`; selector | P4 | 4 |
| C1.23 | finger px per wheel place | token read once | P4 | 4 |
| C1.24 | settings rows wrap | `measure`, at `Places.settings()` | P4 | 6 |
| C2.1,6 | scroll edge fades | `scroll` (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| C2.2 | scroll hold room | `scroll` | P7 | 3 |
| C2.3 | FLIP rects | gone (transitions by cause) (keyed diff within one context) | P5 | 3 |
| C2.4 | Motion reads of boxes and styles | `motion` reads what it animates (`motion` reads its boxes in the commit phase) | P7 | 3 |
| C2.5 | bar resting top through transforms | `chrome` + `measure` | P4 | 3 |
| C2.7-8 | by-project / tree scroll reset / keep | `scroll` orders (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| C2.9 | peek over the shown columns, same scroll | view draws the neighbour's layout from its need's answer (the screen's `needs(model)`); scroll copy (`scroll` orders; `measure` reports scroll) | P2, P3, P4 | 4 |
| C3.1-18 | drag hit tests and flight boxes | drop places computed from `model.measured`, `scrolled` and the core's rules; a flight's end box read by `motion` in the commit phase | P4, P7 | 3, 4 |
| C3.19 | settings row rects | carry geometry (`screen/carryGeometry.ts`): the drop slot from measured row heights in `Px`, at `Places.settings()` | P4, P7 | 6 |
| C3.20 | whole-title copy width | `measure` text width | P4 | 3 |
| C4.1-2 | timeline resize, visible height | `measure` | P4 | 4 |
| C4.3 | zoom anchor rect | computed from the pointer, `scrolled` and `model.zoom` | P4 | 4 |
| C4.4-5 | anchor scroll, room under a short day | (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| C5.1 | which column scrolls, how far | `scroll` + `measure` (`scroll` orders; `measure` reports scroll) | P4 | 3 |
| C5.2,4-10,12 | menu, peek, bulk copies, search placement | menu and copy sizes from `measure`; anchors computed from the layout; window room from `chrome` `window` | P4 | 3, 4 |
| C5.3 | long labels fade | `measure` text fits | P4 | 3 |
| C5.11 | forced reflow for grow-in | gone (WAAPI) | P5 | 3 |
| C6.1-2 | field reveal and bar place | `measure` (field box) + `scroll` `reveal`; the bar's place computed | P4, P7 | 3 |
| C6.3 | field still growing | `motionSettled` | P5 | 3 |
| C6.4,7,9 | status bar, window height, keyboard height | `chrome` | P4 | 4 |
| C6.5,8 | desktop capsule placement, long place name | `measure` | P4 | 4 |
| C6.6 | reflow before glide | gone (WAAPI) | P5 | 3 |
| C7.1 | found card into view | `scroll` reveal | P7 | 4 |
| C7.2 | `is-mobile`, `theme-light` | `chrome` | P4 | 3, 4 |
| C8.1-4 | token reads | read once per theme change into the model | P4 | 3, 4 |

### D. Screens

| Rows | What | Owner in revision 11 | P | Stage |
|---|---|---|---|---|
| D1.1-4 | the four modes | one layout component per `ViewChoice.layout` | P1 | 3, 4 |
| D1.5-10 | filters and Subprojects row | selectors over `model.read` | P1 | 4 |
| D1.11,13 | kept per device, fallback | core answers in `model.read` | P1 | 3, 4 |
| D1.12 | context drawn still, same-context changes move | P5 (keyed diff within one context) | P5 | 3 |
| D1.14 | one layout at a time; timeline keeps its scroll | layout component; `scroll` keyed (`scroll` orders; `measure` reports scroll) | P1, P7 | 3, 4 |
| D2.1-7 | panel docked / overlay / by carry / kept / top row / tree rows / missing | selectors over `read.funnel.panel`; transitions | P1 | 4 |
| D3.1-6 | note block | the one screen at `Places.note(path)`: its gates in `layoutOf` (no tree, calendar, cross, swipe; Rows and By project from the core); the inline frame; `measure` | P1, P7 | 5 |
| D4.1 | before the first read | initial model from `firstView` / `firstPlace`; no transition | P1, P5 | 4 |
| D4.2 | missing file | `read.missing` | P1 | 3, 4 |
| D4.3-4 | empty lists, empty section | selectors (core words) | P1 | 3 |
| D4.5 | Done column | selector `shownPlace` | P1 | 4 |
| D4.6 | found task | `model.found`; reveal | P1 | 4 |
| D4.7 | full card | `model.sheet.full` | P6 | 3 |
| D4.8 | search | overlay `search` | P6 | 4 |
| D4.9 | select mode with wheel and swipe | (layer stack; data applies at once) | P6 | 4 |
| D4.10 | field open | selectors over `model.entry`; `chrome` | P1 | 3 |
| D4.11 | dragging | selectors over `interaction.gesture` | P1 | 4 |
| D4.12 | menus, one sheet handed on | menu layers; one sheet handed on by a layer transition | P6 | 3, 4 |
| D4.13 | hidden view: tick deferred | `model.visible`; missed ticks caught up on `visible` | P6 | 3, 4 |
| D4.14 | day relation | selectors with `model.now` (view answers for the screen's `needs(model)`, clock from `model.now`) | P1, P2, P3 | 4 |
| D4.15 | calendar dot | selector `sourcesDot` | P1 | 4 |
| D4.16 | theme | `model.theme` | P4 | 3, 4 |
| D5.1-9 | settings that change the screen | `model.settings` / `model.device`; update rules | P1 | 3, 4 |

## Earlier classes against revisions 10 and 11

Each class left by the runs against revisions 4 to 9 (M1–M23, R1–R22), and each fault at the root named for revisions 6, 7 and 8, was checked against what revision 10 (with the follow-up commit `aa0c20f6`) actually says and against the code it relies on, not against its §Resolution table.

| Class | Revision 10 | Why |
|---|---|---|
| R1 a typing pick's focus inside the tap | Resolved | P2's loop: "A user's event runs the whole loop inside the event": update, door calls, view answers, render, drivers, focus last. The runtime flushes Preact's `debounceRendering` for a user's event (Architecture). |
| R2 leaving rows against the end-state render | Resolved | P4, Leaving rows: layout selectors skip them; a fold and the heights that depend on it are one transition; a returning key revives its entry. |
| R3 which writes have a patch | Resolved | "A write is visible at once, with its real outcome … There is no preview to compute and no optimistic layer" (P3); P2's loop feeds the write's answer back before the render, so it shows in the same frame. |
| R4 a new row's key across its create | Resolved | P1: the `CreatedTask` id is bound to the row key; P3: the replay's old→new id map is applied to the whole model (row keys, pins, selection, an open card or menu, an entry's target), and a later entry's ids are mapped through it. |
| R5 the settings store's echo | Resolved | Per-key patches through `PluginSettings.update`, which merges over a fresh read; the replica's settings are `PluginSettings.get()`, refreshed on its `onChange` (P3, table), so our own write and every outside writer arrive the same way. |
| R6 what a swipe shows while the context changes | Resolved | "Another filter, mode, day or place is drawn from the same replica in the same message" (P3); the neighbour day or place under a swipe is a need of the screen's `needs(model)`, computed in the loop of the message that starts the swipe (P2 step 3). |
| R7 the guards' scope | Resolved | §Guards, Scope (revision 11): `uiRules` covers all of `obsidian/` (G3); the old screen is frozen by content and exempt until stage 7; the `/* next */` marker splits the CSS. |
| R8 the preview core is `composeCore` | Resolved | No preview core: every call is `callDoor` over one `DoorContext` (P3); the phone-host assumptions are host facts in `DoorContext`. |
| R9 calls that act on projects-screen state | Resolved | Every call runs in message order on one replica (P3), and a replay takes only the text, the history and the ids, so a pick, a fold or a carry made after the base stays. Checked: those calls change only `projectsScreen` (`keepProjectsScreen`, `PhoneCalls.ts:452-474`). |
| R10 a write pick's motion | Resolved | P6: a closing sheet pins the layout under it. |
| R11 what a context's read is | Resolved | P3, Calendars: files in the replica, cached first, fresh when they land; a feed's problem is a host fact (`feedProblems`). |
| R12 the door answers as the phone's host | Resolved | P3, Facts the door is told about its host: `host`, `feedProblems`, `projectsReady`; readiness gates the replica on the metadata cache. Silence for `feedProblems` comes from the core's pure refresh decision. |
| R13 what the runtime persists where | Resolved | P3's table now names every outside writer: Sync, `GoogleAuth`, the hand-over, the calendars' migration and the old screen for the settings; the old leaf for the projects screen, followed through one shared `LocalProjectsScreenStore` with a change signal. Checked: `LocalProjectsScreenStore` has no signal today (`LocalProjectsScreenStore.ts:13-28`), so the signal is new, as the table says. |
| R14 a replayed create gives the new task another id | Resolved, with R23 | P3, Ids after a replay: one old→new map over the whole model; ids never reused. The core's carry in the replica is outside it: R23. |
| R15 slice 1 changes the old screen | Resolved | No facade, and the old screen never runs beside the new ones for Max (Migration). |
| R16 the core's host-side machines | Resolved | `CalendarPolling` run unchanged over ports; the entry's job order and the refresh rule get synchronous forms in the core (P3). |
| R17 two copies of in-memory core state while old and new coexist | Resolved | G8 (revision 11): one build constant chooses the UI, only the e2e build holds both, and the merge that switches deletes the old UI, the old settings tab included. Checked what of `createServices` stays for `main.ts` after the switch (`main.ts:71-98`): the place hand-over through the shared `LocalProjectsScreenStore` and the protocol actions, through `PluginSettings` or that store; none keeps an undo history or ids a screen shows. |
| R18 what the runtime's settings learn from writers outside its port | Resolved | P3 table: "The replica's settings are `PluginSettings.get()`, refreshed on its `onChange`", with Sync, the token, the hand-over, the migration and the old screen listed. Checked: `PluginSettings` emits on every `update` and on a reload that changed `get()` (`PluginSettings.ts:51-104`), so the old tab's writes reach the replica and both tidy under one reading. |
| R19 core classes run unchanged against door sessions | Resolved | P3: `backend` gives the entry's job order a step function over `EntryAnswer` and the refresh rule a pure decision over the replica's calendar state; `CalendarPolling` stays. Revision 9 does not name their slice; this file puts them in slice 1 with the core's part. |
| R20 a replay from the snapshot rolls back calls that are not in the log | Resolved, with R23 | P3: "Only the text, the undo history and the ids are taken from the replay." A kept carry survives a replay that only moves its cards, since its `TaskKey`s carry the id. Revision 10's re-id (a replayed create always gets a new id) is not carried into the kept carry: R23. |
| M1 the settings tab | Resolved | `Places.settings()`, the one screen in a third place (stage 6); until stage 7 the old tab keeps `SettingsServiceImpl` over the shared `PluginSettings`, which the replica follows. |
| M2 the plugin host | Resolved | The runtime owns the replica, the loop's door calls and view answers, persistence, the network and Obsidian's events (P2, P7); hosts own what they start and end what is under way (P8). |
| M3 chrome both ways | Resolved | The `chrome` driver; body classes only by it (P7). |
| M4 synchronous core reads | Resolved | View answers per need (`needs(model)`, P2 step 3) and the pure rules imported directly (P2, P3); the cross-call cache keeps them cheap. |
| M5 the core's sessions | Resolved | Door methods over the replica (P7); the job order a synchronous step function in the core (P3). |
| M6 menus | Resolved | Preact layers in the one overlay host. |
| M7 pick timing | Resolved | Three picks; a write pick runs its door call at the tap and its list change shows as the close settles (P6). |
| M8 one interaction | Resolved | The layer stack and one pointer gesture, a statechart (P6). |
| M9 motion by cause | Resolved | P5: keyed diff within a context, whole-region transitions across. |
| M10 leaving rows, closing overlays | Resolved | P4's leaving rows; a closing sheet pins the layout under it (P6). |
| M11 heights held during motion | Resolved | P4: the fold and the heights that depend on it are one transition. |
| M12 continuous values | Resolved | The transient channel (P5) lays out with selectors that may import `rules.*` (P2 step 3); `carryAt` on a target change (P3, Cost). |
| M13 positions as geometry | Resolved | `motion` reads the boxes it animates in the commit phase (P4, Drivers). |
| M14 scroll | Resolved | `measure` and `scroll` (Drivers). |
| M15 swipe settle | Resolved | P6: a tap during a swipe's settle does not stop it. |
| M16 unbounded waits | Resolved | P2: every wait the user sees has a bound, a message; replays are bounded at two (P3). |
| M17 the device and settings stores | Resolved | Device values through `PluginSettings` into device storage; synced settings as per-key patches; the replica's settings `PluginSettings.get()` (P3). |
| M18 the network lane | Resolved | Latest per day, a superseded fetch abandoned; the refresh decision the core's (P3). |
| M19 cross-screen renames | Resolved | One replica for every new screen; the old leaf never beside them (Migration). |
| M20 gesture recognition | Resolved | `update/gesture.ts` (its recognizer), pure. |
| M21 all service callers | Resolved | New screens call only the runtime; the old screen keeps its services until stage 7 and never runs beside the new ones; what of `createServices` stays live after the switch keeps no undo or ids a screen shows. |
| M22 a dropped card before its read | Resolved | The door gives the drop's real outcome in the drop's own loop (P2, P3); the gesture's pinned layout moves to it when the flight ends (P6). |
| M23 key scopes | Resolved | The `keys` driver. |
| Root 6a reads that write | Resolved | P3, Tidy: `tasks.normalize` when the base changes or the core's day boundary passes, before any view, its text and ids adopted, entered in the log with its own `nowMs`. |
| Root 6b preview ids | Resolved | One replica, one id lineage; ids mapped and rebound on replay (P3); never two lineages for Max (Migration). |
| Root 6c transactions | Resolved | Gone: views are computed synchronously in the loop (P2, P3). |
| Root 6d the gesture snapshot against D65 and D84 | Resolved | P6: re-pin on the gesture's own context change; pins hold ids; a drop resolves against model anchors. |
| Root 6e lifecycle | Resolved | P8: teardown ends a carry with `endCarry`; on unload the persistence queue outlives the plugin object until empty; the lifecycle test unmounts mid-gesture too. |
| Root 7a settings persistence | Resolved | Per-key patches through `PluginSettings.update`; device keys routed to device storage; every outside writer through `PluginSettings.onChange` (P3). |
| Root 7b the pending log | Resolved | Entries by id with their recorded inputs, replayed in order with ids mapped and resolved, only text, history and ids taken, two-replay bound, a moved file checked in `fn` (P3). |
| Root 7c per-call cost | Resolved | The cross-call cache keyed by (text, settings reading, today), budget tests under 1 ms warm, `carryAt` on a target change (P3, Cost). |
| Root 8a the log's references and rollback | Resolved | P3: ids, never stored keys, mapped through earlier creates and resolved by `tasks.keyOf` (checked: not in the door today, `PhoneCalls.ts` has no `keyOf`; revision 9 says it is added); each entry's recorded inputs; only text, history and ids from the replay. |
| Root 8b the dispatch loop | Resolved | P2's four steps: door calls right after `update`, answers fed back with a depth bound, view answers per `needs(model)` handed to the model, then render. Selectors never call the door; the pure rules are allowed (R21 resolved); what is computed is each screen's needs (R22 resolved). |
| R21 where the core's pure rules may be called | Resolved | P2 step 3: "Selectors never call the door. Here 'the core' means `callDoor`, the replica and the view answers"; the pure rules "may be imported by `update/`, selectors and `motion`". §Guards: "`callDoor` and the replica only in the runtime. Outside it, the core may be imported only for the pure rules, which are listed in the guard." Checked: the rules the plugin calls per move (`swipeLanding`, `layoutWidths`, `stackedLists`, `dividerAt`, `placeAt`) are plain core functions. |
| R22 which view answers the runtime computes | Resolved | P2 step 3: each screen's pure `needs(model)` lists its context's view, the neighbour day or place under a swipe, the task of an open full card or menu and the search's results; one answer per need, memoised by (replica, minute, need); any replica change recomputes every mounted need in the same loop; a runtime test has Sync change an open full card's task. |
| R23 kept parts after a replay | Resolved (revision 10's P3, kept in 11) | `tasks.reconcile(idMap, dropped)`, a door method `backend` added in slice 1, called after any replay that remapped an id or dropped a call, in the same message as the model's remap (§Rows that do not fit, R23). |
| **R24 a concern implemented once per place** (revision 11; report B: U1–U20, H1–H20) | Resolved | Revision 10's owners were mechanisms, but nothing made them unique: 31 table lines named a place's host as owner, and slice 3 built the block's own model, lists, carry and host. Revision 11: one `Model`, `Msg`, `update`, `Screen` and `ScreenHost` (G1, G2); the owner table with one owner per concern and deny by default across `obsidian/` (G3); the kit, motion causes, `Px` and required pure rules (G4); the matrix (G5), the trap (G6), tested guards (G7), no coexistence (G8), structural review (G9). Every row's owner is now a concern of the one screen; only embedding rows are an adapter's, with `drivers/mount.ts`. |

All 22 of R1–R22, all 23 of M1–M23 and all 10 faults at the root are resolved by revision 10's text; 0 are not. R21 and R22 are resolved with no remainder. 2 leave a remainder that a new class carries (R14, R20): both come from revision 10's re-id map, which reaches the model but not the carry the core keeps in the replica. Revision 9's architect named no fault at the root; its five wording fixes are in revision 10 and were checked row by row.

**Wording left in revision 10 that moves no row.** None of these changes an owner or an outcome; each is a stale sentence an implementer could trip on:
- §Resolution still says "door selectors and `rules.*`" (M4), "the runtime runs them unchanged" (R16), settings "persisted by the same queue, our own echo found by its text" (M17, R5) and "snapshot of every part" (Root, rev 7), all replaced in P2 and P3; it has no line for R21 or R22.
- §Architecture labels `model/` "selectors over the replica"; P2 step 3 has selectors read the model only.
- The pending log still records "the projects screen and settings as they stood", while a replay uses the current settings; the recorded settings are unused.
- P3, Tidy says the tidy "enters the log as an entry" under "whenever the base changes or the core's day boundary passes", while Outside changes says the tidy on a new base "is not an entry of the log"; the purpose clause limits the entry to the day boundary.
- §Guards allows the core outside the runtime "only for the pure rules"; `model/` also needs the core's types (`ScreenView`, `TaskKey`), so the guard should name type-only imports.

## Rows that do not fit

Each item names a class, not a row, and proposes the principle or mechanism the spec must state so the whole class is owned. A row can be in more than one item. "Too vague" is used only where an implementer would have to guess something that changes behaviour or correctness.

### No mechanism owns it

None. Every row has an owner in revision 11: the door covers every core method the UI calls (`DOOR_COVERAGE`), and the rest is the runtime's, a concern owner's of the one screen, or (embedding a note or registering a view only) an adapter's.

### The principles would change what the user sees

#### R23. What the kept parts of the replica get after a replay (resolved in revision 10's P3; kept for its record)

**Rows (14):** B.1.17-18, 73, 76, 85, B.3.5-7, B.4.55, 157, 168, B.6.142, A.2.125, A6.13

Revision 10, P3, Outside changes: "The replay returns one map from old id to new id. It is applied to the whole model in one message: row keys, pins, the selection, an open card or menu, an entry's target." and "Only the text, the undo history and the ids are taken from the replay. Every other part of the replica (projects screen, carry, settings) stays as it is now." With "The replay continues from the current replica's id counter", every create that is replayed gets a new id, which is why the map exists.

The map reaches the model, but the carry the core keeps is not in the model: it is in the replica's projects screen, which the replay leaves as it is. Checked in code: `ProjectsScreenState.carry` is a `CarryState` whose `keys` (and `cards`) are `TaskKey`s carrying the task's id (`contracts.ts:762-763, 1113-1146`), and the tree drop reads them from there, not from the gesture: `carryOnNode` runs `dropOnProject(carry.cards, …)` or `dropTasksOnProject(carry.keys, …)` from `c.projectsScreen.carry` (`PhoneCalls.ts:442-450`). A key whose id is not in the file is looked up at its place with its line (`TaskRules.named`, `TaskRules.ts:233-238`), and since ids are never reused, the old id is never found.

Concrete outcome: Max adds a task and lifts its card at once; Sync lands while the create is still pending, the replay gives the task a new id, the gesture's pin is remapped, but the core's carry still holds the old id. If Sync added a line above it in that section, the key is not at its place either, so letting go on a tree row fails with the stale-task notice and the card flies back. The runtime test "Sync during a carry with a write pending (the carry and the chosen node stay)" passes, because it checks only that the carry stays.

The same sentence leaves reconciliation without an owner in the core: "the kept parts (projects screen, carry) are reconciled against the new text by a door call". Checked: the door has no such method (`PhoneCalls.ts`: project-screen state changes only through `keepProjectsScreen` inside each call, `renamedIn` only on a successful `renameProject`, line 484), and §Migration's slice 1 does not list it for `backend`, unlike `tasks.keyOf` ("added to the door if missing"). Without it, a dropped `renameProject` leaves the filter and folds on a name the tree lacks, and the read's tolerance (`nodeIn`, `projectsScreen.ts:141-147`) shows All with the folds lost, not the spec's "goes back to its name".

**Fix (P3, Outside changes; §Migration slice 1):** after every replay that remapped an id or dropped a call, the runtime calls one door method over the kept parts, added by `backend` in slice 1 (proposed `projects.reconcile(idMap, dropped)`): it maps the ids in the projects screen's carry (`keys`, `cards`) through the same old→new map the model gets, and undoes for each dropped call what that call did to the projects screen (a rename's `renamedIn` reversed; a node a dropped create selected left to the read's existing fallback). It runs in the same message as the model's remap. A runtime test: create, lift the new card, Sync adds a line above it, let go on a tree row, the drop lands.

### Two principles conflict

None.

### Too vague to build without guessing

None.

## Counts

| | Rows |
|---|---|
| A.1 facts, each given one field or selector | 45 |
| A.2 state locations mapped | 565 |
| B.1–B.5 effect call sites mapped | 819 |
| B.6 event sources mapped | 180 |
| Behaviour rows mapped (A 203, B 84, C 84, D 52) | 423 |
| **All rows mapped** | **2032** |
| Rows unmapped | 0 |
| Rows mapped twice | 0 |

| Category | Classes | Distinct rows |
|---|---|---|
| No mechanism owns it | 0 | 0 |
| The principles would change what the user sees | 0 (R23 resolved) | 0 |
| Two principles conflict | 0 | 0 |
| Too vague to build without guessing | 0 | 0 |
| **Any category (a row counted once)** | **0** | **0** |
| Rows that fit as mapped | | 2032 |

Against revision 4: 23 classes and 688 rows did not fit. Against revision 5: 7 classes and 219 rows. Against revision 6: 4 classes and 155 rows. Against revision 7: 5 classes and 158 rows. Against revision 8: 4 classes and 133 rows. Against revision 9: 2 classes and 213 rows. Against revision 10: 1 class and 14 rows (R23 14); fact 17 of A.1, tagged with it, is not counted as a row. Against revision 11: 0 classes and 0 rows; 31 table lines changed owner from a place's host to a concern of the one screen or an adapter (R24).

## Summary

Revision 10 with `aa0c20f6` resolves R21 (the pure rules may be imported by `update/`, selectors and `motion`; the guard keeps `callDoor` and the replica in the runtime) and R22 (each screen's `needs(model)`), and every earlier class and fault at the root still holds. One narrow class is left, R23 (14 rows): the replay's old→new id map reaches the model but not the carry the core keeps in the replica's projects screen, and the reconciliation door call is named but not given to `backend`. Both are closed by one door method over the kept parts in slice 1 and one runtime test. Five stale sentences (§Resolution, §Architecture, the log's recorded settings, the tidy entry, type imports under the guard) move no row.

**Revision 11.** R23 is closed by `tasks.reconcile` (P3). The fault Max stopped the work for, a concern built once per place, is R24: it moved no row's behaviour, only who owns it. With places as data and one owner per concern, every one of the 2,032 rows maps to a concern of the one screen, the runtime, or (for embedding a note and registering a view) an adapter; none maps to a place. The note's rows are stage 5 and the settings tab's stage 6, each adding a `Place` and its gates, never a mechanism.
