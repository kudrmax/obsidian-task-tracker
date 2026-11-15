# UI refactor: traceability

This file maps every row of the two inventories to the mechanism of `../2026-11-15-ui-refactor.md` (**revision 8**) that owns it, the principle behind it and the slice that rebuilds it.

Inputs:
- `inventory-state-effects.md`: A.1 (45 facts), A.2 (565 locations), B.1–B.5 (819 effect call sites), B.6 (180 event sources);
- `inventory-behaviour.md`: A (203 inputs), B (84 motions), C (84 measurements), D (52 screen states).

Doubts were checked in code at `ea3deaa7`:
- `core/application`: `PhoneCalls.ts` (the door), `composeCore.ts`, `TaskServiceImpl.ts`, `CalendarServiceImpl.ts`, `calendarDay.ts`, `UndoHistory.ts`, `TaskIdentity.ts`, `TaskRules.ts`, `UndoSteps.ts`, `QuickEntrySession.ts`, `CalendarPolling.ts`, `SettingsServiceImpl.ts`, `contracts.ts`;
- `obsidian/`: `main.ts`, `compose.ts`, `infrastructure/` (`VaultTaskFileStore`, `PluginSettings`, `LocalProjectsScreenStore`, `VaultProjects`, `GoogleAuth`), `ui/` (`CalendarScreen`, `DayData`, `Reload`, `kit/Panel`).

**How this rerun was made.** Every row was re-examined against revision 8, not only the 158 rows left over from revision 7.
- Owners were rewritten in revision 8's words:
  - the tasks queue (`vault.process`, the base checked inside `fn`) and the pending log (snapshot, `nowMs` per call, row keys rebound, at most two replays), instead of one persistence queue;
  - settings as per-key patches through `PluginSettings.update`, and device values routed by `PluginSettings.partition`;
  - host facts in `DoorContext` (`host`, `feedProblems`, `projectsReady`) and readiness;
  - the core classes the door leaves to the host (`QuickEntrySession`, the refresh rule, `CalendarPolling`), run by the runtime unchanged.
- Principles keep their numbers. P3 is added where an owner names the tasks queue, the pending log, `PluginSettings`, a host fact or a host-run core class; P8 where it names readiness.
- Slices follow revision 8, which has no facade:
  - slice 1 builds the runtime and the core's part, with nothing in the plugin using it;
  - the old screen keeps its services, `Picks`, `Reload` and `WriteQueue` until slice 7.
  
  So a screen row that revision 7 fixed on the old screen in slice 1 is now rebuilt by the new screens: "1" became "1, 3" (the runtime in 1, the block in 3, the leaf reusing it in 4). Rows that are the runtime's alone (its stores, clock, network lane, window set, plain commands) stay in slice 1; `main.ts`'s wiring stays to slice 7; the settings tab's calls move to slice 6.
- R1–R16, M1–M23, the five faults at the root of revision 6 and the three of revision 7 were checked against revision 8's own text and the code it relies on (§Earlier classes against revision 8).
- The four questions of this rerun were checked in code: the two screens writing concurrently, the stores table, the old screen kept to slice 7, and R12–R16. Their findings are R17–R20.
- New classes are numbered on from R17. Their rows carry `[R#]` in the owner column and are gathered in **Rows that do not fit**.

The script checked that every row id appears exactly once in the mapping tables. It found 0 rows unmapped and 0 mapped twice.

## The door against what the plugin calls

Revisions 7 and 8 rest on one claim: the door covers every core call the plugin makes. It was checked three ways.

**Every service method by name.** All methods of `TaskService` (128), `DayService` (8), `UndoService` (5), `CalendarService` (6), `SettingsService` (31) and `ScreenSettingsStore` (2) were listed from `contracts.ts`. Each is either in the door's `SPACES` or in a `HOST_*` list (`DOOR_COVERAGE`, `PhoneCalls.ts:1076`); `tests/application/PhoneCalls.test.ts` keeps it so. What the plugin's UI calls that the door leaves to the host:

| Method | Called from | Who does it in revision 8 |
|---|---|---|
| `TaskService.onChange` | `CalendarScreen.ts:445`, `ProjectBlocks.ts:104` | the runtime's outside-change handling for the new screens; the old leaf keeps its service until slice 7 (R17) |
| `UndoService.onChange` | `BottomCapsule.ts:33` | a selector over the replica's history; the old leaf keeps its service until slice 7, with its own history (R17) |
| `CalendarService.onChange`, `keepFresh` | `CalendarScreen.ts:449, 477` | the runtime's file watch and the network lane; `CalendarPolling` run unchanged; the refresh rule is R19 |
| `DayService.onDayChange`, `catchUp` | `CalendarScreen.ts:451, 504` | the runtime's clock |
| `ScreenSettingsStore.onChange` | `viewSettings.ts:117` | settings in the replica (which writers it learns from: R18) |
| `SettingsService.bindClientSecret` | `SettingsTab.ts` | the settings-tab host |
| `GoogleAccount`, `WorkCalendarSetup` | `SettingsTab.ts` | host-owned (`DOOR_COVERAGE`); the token goes through the runtime's settings port (P3) |

**The classes the UI imports from `contracts.ts`.** `QuickEntrySession`, `SectionNameEntry`, `RepeatPage`, `DescriptionDraft` and `DayBoundary`, and the pure rules. The door answers the sessions as `entry.*`, `sectionName.end`, `repeatPage.end`, `description.*` and `boundary.*`, and every rule the UI calls as `rules.*`. `QuickEntrySession`'s job runner is not a door method; revision 8 runs it unchanged, which needs a service shape (R19).

**The same answers.** The door runs the same `TaskReads`, `TaskWrites` and `UndoSteps` as the services, over the context handed in. Differences found:
- three places where the door answers as the phone's host: the calendar carry-over, a feed's problem, the project notes' readiness. Revision 8 adds them to `DoorContext` as `host`, `feedProblems` and `projectsReady` (R12 resolved);
- shapes: events in milliseconds, `days.boundary` as `{startHour}`, `calendars.isPast` taking `{endMs}`, the entry as `EntryAnswer`. With no facade, only the new screens see them.

**The two screens side by side (slices 3 to 5).** The old leaf keeps `composeCore`'s services; the new block runs on the runtime. Checked in code:
- **The file is safe.** `TaskServiceImpl.mutate` applies its operation to the current text inside `vault.process` (`TaskServiceImpl.ts:694-716`), and `UndoHistory.step` takes a step back over the file as it is now. The runtime's `fn` returns the text unchanged when the base moved, and replays. Each screen sees the other's writes as outside changes. No write is lost, and a stale one fails with today's notice.
- **Tidy does not loop** while both read the settings the same way: both tidy with the same core, so each tidy is a no-op for the other. A runtime holding settings older than `PluginSettings` breaks this (R18).
- **What is not in the file** is held twice: the undo history, the ids and the Projects screen state. Today the leaf and every block share them (one `composeCore`, `compose.ts:61-73`; `ProjectBlocks` gets the same `deps`). That is R17.
- **Settings** go through one `PluginSettings` for both (`main.ts:36-45`), which merges over a fresh read, so none is lost. Whether the runtime reads its settings from it is R18.
- **Nothing is left unowned by keeping the old screen to slice 7.** Every old-screen row keeps today's owner until the new screen replaces it in slice 3 or 4, and is deleted in 7.

## Vocabulary used in the owner column

The spec names the layers but not every field, so this file proposes the field names. Every name below is a proposal.

**Model (per screen, P1):**
- `model.read`: the door's view for the shown context (`ScreenView`, with `funnel` (view, place, filter, panel), `projects`, `missing` and `context`), a selector over the replica memoised by its identity (P3); `day`, the key of that view.
- `model.day`, `model.now`, `model.visible`, `model.events[day]` (a selector over the replica's calendar texts).
- `model.settings` (`ScreenSettings`, from the replica) and `model.device` (the device's values; the store only keeps them).
- `model.platform`, `model.theme`, `model.chrome` (`keyboard`, `statusBar`).
- `model.canUndo` (from the replica's history), `model.selection` (`mode`, `picked`, `anchor`), `model.found`, `model.timeline` (`selected`, `anchor`), `model.zoom`.
- `model.measured`: row heights, text widths, the stage, menu sizes, all from `measure`.
- `model.entry`: the door's last `EntryAnswer` for the quick entry.
- `model.rowKeys`: `rowKey(taskId)`, given when the user's message makes a row and bound by `CreatedTask` (P1).
- `model.overlay`, `model.sheet.full`: layers.
- `model.place`: leaf, or block with note and project.

**Runtime (plugin-wide, `obsidian/runtime/`):**
- the **replica** (`DoorContext`): tasks text, settings text, undo history, Projects-screen state, ids, calendar texts, project notes;
- **door calls**, synchronous, in message order;
- the **stores**: the tasks queue (`vault.process`, the base checked inside `fn`; `createFile` for a missing file), settings as per-key patches through `PluginSettings.update`, device values and the Projects screen in device storage;
- the **pending log**: each unpersisted call with its arguments, `nowMs` and row keys, from a snapshot of every part; replayed over an outside change, at most twice;
- the cross-call cache (`backend`);
- the network lane, which hands each feed's problem to the door (`feedProblems`);
- readiness: the replica is built once the layout is ready and the metadata cache resolved (`projectsReady`);
- Obsidian's events;
- the action log;
- the core classes the door leaves to the host, run unchanged (`QuickEntrySession`, the refresh rule, `CalendarPolling`; R19).

**Interaction (P6):**
- **Layers:** select mode, field (entry, rename, naming), menu (task, bulk, section, project, event, view, ⋯, sources, search), the full card.
- **Gestures:** carry (a card, subtasks, the plus, the picked cards; the door's carry methods), section lift, tree lift, timeline hold, select, resize and new slot, ribbon swipe, day swipe, wheel drag, pinch, divider, tree divider.
- Each layer and gesture pins its entities and gets `targetChanged` / `targetGone`. Anything moving (a pointer gesture, a closing sheet, a sliding region) also pins the layout under it and draws it while it moves.

**Commands (P2):**
- door calls (`write`, `carry`, `carryAt`, `undo`) run in the message; their texts go to the tasks queue, their settings to `PluginSettings.update`;
- `device.set`;
- network-lane fetches;
- `notice`, `haptic`, `obsidian.open`, `openInCalendar`, `createFile`;
- timers, each with a timeout message.

**Edges (P7, P8):**
- the drivers `motion`, `measure`, `scroll`, `focus`, `input`, `keys`, `chrome`, `islands` and the overlay host;
- `recognizers/` (pure);
- door selectors and `rules.*` (pure, clock from `model.now`);
- `host/` (the leaf host, the block host and the settings-tab host), each owning what it starts (P8).

**Other names:**
- **Transient channel:** live values from `input` to `motion`, laid out by the same selectors (P5).
- **Pure rules:** `rules.*` of the door, called from `update` and selectors.

**P** is the principle:
- P1 one model, identity included;
- P2 one timeline, a user's event handled to the end;
- P3 the core is a pure, synchronous function over a replica the runtime holds;
- P4 geometry is input;
- P5 motion follows the change, and a context change moves as a whole;
- P6 interactions are layers; what moves pins what is under it;
- P7 imperative code only at the edges;
- P8 everything alive has an owner.

**Slice** is the slice that rebuilds the row:
- 1: the runtime and the core's part, used by nothing in the plugin yet: the replica, its stores, the pending log with replay and bounds, the network lane, readiness; `backend`: the cross-call cache with budget tests, the host facts in `DoorContext`.
- 2: the guards, the freeze, the lifecycle test, the e2e harness.
- 3: the note block. Lists, cards, the field, carry inside the block, menus and the full card: the shared parts the leaf reuses.
- 4: the leaf behind `newScreen`. The timeline, the ribbon, both swipes, the panel and tree, the carry across all of them, select mode, search, the day.
- 5: the switch (no rows of its own).
- 6: the settings tab.
- 7: deletion: the old screen, its services' plugin wiring, `Picks`, `Reload`, `WriteQueue`, the flags.

"3, 4" means built for the block and then mounted in the leaf. "1, 3" means the runtime part is built in slice 1 and first used by the block in slice 3. "Gone" means the new code makes the state unnecessary; it is deleted with the old code in slice 7 if not earlier.

## A.1 The 45 facts held in more than one place

Each fact gets one field or one selector. "Seeded" means the field starts from a core answer before the first read; it is still one field.

| # | Fact | Single owner | P | Slice |
|---|---|---|---|---|
| 1 | The day the screen shows | `model.day` (one field). The read's own day is `model.read.day`, the key of that read, not a copy. Title: selector `dayTitle`. Drawn-day caches go (P5 decides motion by cause). The incoming day of a swipe or turn is the same selector over the replica for that day, a different fact. | P1, P3 | 4 |
| 2 | The day the header names during a swipe | Selector `headerDay(model)` = `daySwipe.nearer ? neighbourDay : model.day`; `nearer` is set by one discrete message when the slide crosses half. | P1, P3, P6 | 4 |
| 3 | A tick or draw missed while hidden or held | Gone as a store: data applies at once (P6); anything moving draws the layout it pinned; `model.visible` from `chrome`. | P6 | 4 |
| 4 | Where the strip stands | `model.read.funnel.place` (the core's answer) plus the ribbon gesture's in-flight `target`; selector `shownPlace`. `atDone` = `shownPlace === "done"`. `firstPlace` seeds `model.read` before the first read. `rightMode` is a one-time host hand-over (plugin runtime). | P1, P3 | 4 |
| 5 | The view mode and its layout | `model.read.funnel.view` (`ViewChoice`); selector `layoutMode`. `firstView` seeds it before the first read. Mounted layout = the layout component chosen by `layoutMode`. `drawnContext` goes: update compares `read.context` to decide that no transition is emitted. | P1, P5 | 4 |
| 6 | The project filter | `model.read.funnel.filter`; selector `filterNode`. The node a carry was lifted on is carry-gesture state `carry.liftedOn` (a different fact: what to put back). | P1 | 4 |
| 7 | The projects panel open / docked | `model.read.funnel.panel` (`open`, `docked`). The mid-slide state is a running `Transition` (dock slide), not a field. | P1, P5 | 4 |
| 8 | The tasks read from the file | `model.read` (`ScreenView`: tasks, day, projects, missing). Menus and the bulk menu hold only keys (`overlay.task.key`, `overlay.bulk.keys`) remapped by the door's answer; the full card holds `sheet.full.levels[]` reads of its own; a neighbour day or place is the same selector over the replica. Element maps go. | P1, P3 | 4 |
| 9 | The tasks file is missing | `model.read.missing`; every hidden part is JSX from it. | P1 | 3, 4 |
| 10 | A card waiting for a new section's name | Naming layer `interaction.naming = {kind: "section", column, card}`. | P6 | 3 |
| 11 | The day's calendar events | `model.events[day]` (keyed by day: a selector over the replica's calendar texts, cached first, fresh when the network lane lands). The parsed-document cache stays in the core. | P1, P3 | 1 |
| 12 | The sources' alert | Selector `sourcesDot(model.events[model.day])`. | P1 | 4 |
| 13 | Extra all-day rows | Selector `allDayExtraRows(model.events[day])`; a neighbour day uses the same selector. | P1, P3 | 4 |
| 14 | The timeline card selected | `model.timeline.selected: TaskKey or null`. | P1, P6 | 4 |
| 15 | List cards picked | `model.selection = {mode, picked: TaskKey[], anchor}`; count and button state are selectors. | P1 | 4 |
| 16 | A drag holds the screen | `model.interaction.gesture` (the one gesture slot); `isDragging` is a selector. | P6 | 4 |
| 17 | A carry to a project is under way | carry gesture `carry.reportsToCore` (the door's carry methods over the replica). | P3, P6, P7 | 3 |
| 18 | The card a drop is landing on | The drop is a door call in its own message (`tasks.drop` over the replica, with the carry in `projectsScreen`): its outcome, the cards' new places and keys, is in the replica at once; its text goes to the tasks queue. | P3 | 1, 3 |
| 19 | Where a held card would land | carry gesture `carry.target` (list gap and level, plate, title, timeline start, tree row), computed from `model.measured` and the core's rules. | P4, P6 | 4 |
| 20 | A timeline card being stretched | Resize gesture `interaction.resize = {key, edge, span}`. | P6 | 4 |
| 21 | A swipe or turn is running | Ribbon / day-swipe gesture state; the run after release is a numbered `Transition` in `motion`. | P5, P6 | 4 |
| 22 | Which swipe or turn is current | Transition numbers (a stale `motionSettled` is ignored by number); each swipe or turn is its own message. | P2, P5 | 4 |
| 23 | A landed day drawn over the screen | A context change: the incoming day or place is drawn from the replica in the same message; nothing waits. | P3, P6 | 4 |
| 24 | The timeline's hour height | `model.zoom = {hourPx, wholeDay}` (seeded from device settings); the pinch's live scale rides the transient channel; dispatch on a step. | P1, P4 | 4 |
| 25 | The timeline's scroll position | Driver-local in `scroll` keyed `timeline`; the opening anchor is `model.timeline.anchor = {minute, fraction}` (`scroll` orders; `measure` reports scroll). | P1, P7 | 4 |
| 26 | A list's scroll / held room | Driver-local in `scroll` (positions, ScrollHold, glides) keyed by scroller id; the entry's `follow` flag is field-layer state (`scroll` orders; `measure` reports scroll). | P7 | 3 |
| 27 | The day list's share | `model.device.listShare` (the settings answer); live drag value on the transient channel; widths are selectors (`RibbonColumns`, `layoutWidths`). | P1, P4 | 4 |
| 28 | The project tree's width | `model.device.treeWidth`; live drag value on the transient channel. | P1, P4 | 4 |
| 29 | A field is open for typing | `model.entry` = the door's last `EntryAnswer` (`entry.*`); every flag (`is-entering`, plus hidden, folder locked, card `is-renaming`) is a selector. | P1, P3, P7 | 3 |
| 30 | Which field has the focus | `model.focus` (owner id) reported by `focus`; Obsidian's `activeEditor` is `islands`-local. | P1, P7 | 3 |
| 31 | The entry's priority tint | Selector `entryTint(model.entry)`. | P1 | 3 |
| 32 | The repeat being edited | One draft per editor: `overlay.page.repeat` (task menu, the core `RepeatPage` answer) or `entry.repeat` (bar). Never both for one editor. | P1, P7 | 3 |
| 33 | A description being edited | `sheet.full.description = {draft, dirty}` (the core `DescriptionDraft` answer, a door session over the replica); the CodeMirror doc is `islands`-local; the 600 ms save is a timer command. | P1, P3, P7 | 3 |
| 34 | The search window is open | `model.overlay` stack entry `{kind: "search", phase}`. | P6 | 4 |
| 35 | A task is on the whole screen | `model.sheet.full = {stack, phase}`. | P6 | 3 |
| 36 | A menu / sheet is open or closing | `model.overlay` (stack of `{kind, phase: open or closing, page, picked}`); a write pick's door call at the tap. | P3, P6 | 3 |
| 37 | The card ringed after a search | `model.found = {key, scrollPending}`. | P1 | 4 |
| 38 | Whether undo is possible | `model.canUndo`, a selector over the replica's history; the old leaf keeps `UndoService` until slice 7. [R17] | P1, P3 | 1, 3 |
| 39 | The settings the screen draws | `model.settings` (`ScreenSettings` answer) and `model.device` (device view settings). Body tokens per window come from `chrome` (`chrome` takes it from the model). | P1 | 3, 4 |
| 40 | Phone or desktop | `model.platform.wide` from `chrome`. | P4 | 3, 4 |
| 41 | Obsidian's status bar over the view | `model.chrome.statusBar` from `chrome`. | P4 | 4 |
| 42 | Popout windows that get the styles | Plugin runtime's window set (host), fed to `chrome`; not a screen fact. | P7, P8 | 1 |
| 43 | Which note a block shows | `model.place = {kind: "block", note, project}`; the blocks map is host-level. | P1 | 3 |
| 44 | Writes waiting to run | The runtime's one replica; a door call runs in the message that asks for it; the tasks queue writes its texts in that order, each inside `vault.process` with the base checked in `fn`; the pending log (snapshot, `nowMs` per call, row keys) holds what is not yet written. [R20] | P3 | 1, 3 |
| 45 | Who holds the screen | `model.interaction.gesture` (one slot); pointer captures are `input`-local. | P6 | 3, 4 |

## A.2 State locations (565)

Row ids number the rows of each domain table of `inventory-state-effects.md` in file order, A.2.1 to A.2.565.

### day/clock

| Rows | What | Owner in revision 8 | P | Slice |
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

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.12,14 | `CS.shownMode`, `CS.atDone` | ribbon gesture `target` + selector `shownPlace` | P1, P6 | 4 |
| A.2.13,15 | `CS.firstPlace`, `CS.firstView` | initial `model.read` seeded by core `firstPlace`/`firstView` at mount | P1 | 4 |
| A.2.16 | `CS.layout` | layout component chosen by selector `layoutMode` | P1 | 3, 4 |
| A.2.17,24 | `CS.drawnContext`, `is-redrawn` | gone: update compares `read.context`; a context change emits no transition | P5 | 4 |
| A.2.18 | `CS.swipe` presence | selector `hasPages(layoutMode)`; `input` attaches the swipe `recognizers/` while true | P1, P7 | 4 |
| A.2.19 | parts built once | view components | P1 | 7 |
| A.2.20 | `folder.el.disabled` | selector `panelLocked(model.entry)` | P1 | 4 |
| A.2.21-23,25 | root classes `is-note`, `has-wheel`, `has-top-row`, `has-head-lead`, `has-tree`, `has-dock`, `is-block` | JSX classes from `model.place`, `read.funnel.view`, `read.funnel.panel` | P1 | 4 |
| A.2.26 | `DayData.state.funnel` | `model.read.funnel` | P1 | 4 |
| A.2.27 | `DayData.state.projects` | `model.read.projects` | P1 | 4 |
| A.2.28 | StripTrack temporary place classes | gone: strip geometry per place computed (`RibbonColumns`, (P4)) | P4 | 4 |
| A.2.29 | full card parent / project buttons | JSX from `sheet.full` tree | P1 | 3 |
| A.2.30-31 | `ViewButton.view`, hidden, icon | selector `viewButton(read.funnel.view)` | P1 | 3, 4 |
| A.2.32-33 | tree `is-missing`, panel open | JSX from `read.missing`, `read.funnel.panel.open` | P1 | 4 |
| A.2.34-37 | `ProjectTree.drawn/rowsByNode/drawnRows/rowEls` | gone: rows from `read.funnel.panel.rows`; hit areas computed from measured row heights | P1, P4 | 4 |
| A.2.38 | tree row classes | JSX from the core row model | P1 | 4 |
| A.2.39-40 | `FilterTitle.filter` and its classes | selector `filterTitle`; renaming from naming layer | P1, P6 | 4 |
| A.2.41,44,46 | column / backlog titles text | selector over list names (door selectors and `rules.*`) | P1, P3 | 3, 4 |
| A.2.42-43 | `RibbonLayout.place`, `is-lists/is-inbox/is-done` | selector `shownPlace` → JSX class | P1 | 4 |
| A.2.45 | shared nav / timeline placement | view composition per layout | P1 | 3, 4 |

### lists data

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.47 | `CS.drawnRead` | first read emits no transition (`model.read` was null) | P5 | 4 |
| A.2.48,53 | missing box, `DayData.state.missing` | `model.read.missing`; JSX | P1 | 3, 4 |
| A.2.49-50 | `CS.naming`, header slot | naming layer `{kind: section}` | P6 | 3 |
| A.2.51 | card `dataset.menuFrom/card` | row props from the core row model | P1 | 3, 4 |
| A.2.52 | `DayData.state` | `model.read` | P1 | 4 |
| A.2.54 | `FullScreen.tree` | `sheet.full.levels[].tree` (selectors over the replica) | P1, P2, P3 | 3 |
| A.2.55-63 | `ProjectTasks.*` maps | selectors over `read.projects` (`projectsEntryLook`); element maps gone | P1 | 3, 4 |
| A.2.64,67,69 | `Timeline.tasks`, `is-over`, block meta | selectors (`slotted`, `stackTasks`, `stackCorner`) | P1 | 4 |
| A.2.65,68 | `Timeline.blocks`, DOM order | gone: Preact keys, JSX order from `stackTasks` | P7 | 4 |
| A.2.66 | block `--tc-y/len/x` | `motion` layout variables from selector | P7 | 3 |
| A.2.70-78 | `TaskList.*` bookkeeping | selectors (`listView`, `columnSections`); element maps gone | P1 | 3 |
| A.2.79 | card `--tc-level` | `motion` layout variable | P7 | 3 |
| A.2.80-81,83 | header, plate text, branch lines | selectors (`branchOf`) | P1 | 3 |
| A.2.82 | keyed empty-plate presence | plate ↔ first card is a transition kind (B1.9) | P5 | 3 |
| A.2.84-91 | card colours, classes, marks, link data | JSX from `TaskItem` | P1 | 3 |
| A.2.92,94-95 | `KeyedRows.rows/drawing/order` | gone: Preact keyed rows; focused field kept by key (`rowKey(taskId)` bound by `CreatedTask`, rebound when a replay answers another id) | P1, P5, P7 | 3 |
| A.2.93 | `KeyedRows.leaving` | leaving rows: skipped by layout selectors; fold and dependent heights one transition; a returning key revives the entry (P4) | P4, P5 | 3 |
| A.2.96-97 | prototype `KeyedList` | replaced by `next/` | — | 7 |

### events

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.98 | `CS.poll` | `CalendarPolling` run by the runtime, unchanged, its fetches on the network lane, `model.visible` [R19] | P2, P3 | 1 |
| A.2.99-100 | `DayData.dayEvents`, `state.calendars` | `model.events[day]`, `read.calendars` | P1 | 4 |
| A.2.101 | `DayData.around` | network-lane request parameter (network lane, latest per day) | P2 | 1 |
| A.2.102 | `DayPeek.events` | `model.events[day]` for the incoming day, a selector over the replica's calendar texts (P3) | P1, P3 | 4 |
| A.2.103-104 | wheel dots | selector `sourcesDot` | P1 | 4 |
| A.2.105-106,109 | `Timeline.events`, event block placement | selector `timedEvents` (`layoutEvents`) + `motion` variables | P1, P7 | 4 |
| A.2.107 | event colours | selector `paintEvent(model.theme)` → `motion` variables | P1, P7 | 4 |
| A.2.108 | `is-past` | selector over `model.now` (door selectors, clock from `model.now`) | P1, P3 | 4 |

### selection

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.110,116-119 | `BulkController.selection`, `TaskSelection.*` | `model.selection {picked, anchor}`; element maps gone | P1 | 4 |
| A.2.111-112 | count / ⋯ buttons | selectors | P1 | 4 |
| A.2.113-114 | `selecting`, `is-selecting` | `model.selection.mode` (select-mode layer) | P6 | 4 |
| A.2.115 | bulk menu `items` closure | `overlay.bulk.keys` remapped by write answers | P1 | 4 |
| A.2.120-121 | `is-selected`, `.tc-pick` | JSX | P1 | 4 |
| A.2.122-124 | `Timeline.selected`, ring, grips | `model.timeline.selected`; grips via `motion` variables | P1, P6 | 4 |

### carry/drag

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.125 | `CS.carrying` | carry gesture `reportsToCore` | P6 | 3 |
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
| A.2.187-191 | `LongPress` state and timer | `recognizers/` (pure); delay from `model.settings` | P7, P8 | 3 |
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

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.220 | `CS.landing` | day-swipe gesture `landing`; the incoming day is a selector over the replica, so the switch does not wait | P3, P6 | 4 |
| A.2.221 | `drawnWaits` + 1000 ms timer | gone: every day, near or far, is drawn from the replica in the same message (P3) | P2, P3, P8 | 4 |
| A.2.222 | `CS.turning` | gone: each turn applies in its own message; a new swipe catches the settle | P3, P6 | 4 |
| A.2.223,542 | `CarefulPace`, `PointerSpeed` | `recognizers/` | P7 | 4 |
| A.2.224-230 | `Swipe` press, stream, timer, holds, round, listeners, capture | `recognizers/` + ribbon / day-swipe gesture; `round` → transition numbers | P6, P7, P8 | 4 |
| A.2.231-236 | `ScreenPager` state | swipe gesture + transient channel; settle is a `Transition`; `catches` → transition numbers (a tap leaves the settle running) | P5 | 4 |
| A.2.237-238,240 | edge / day / strip track styles and scrub | `motion` (transient channel, scrub between two computed layouts) | P5, P7 | 4 |
| A.2.239 | `DayTrack.nearer` | day-swipe `nearer`, one message at half | P6 | 4 |
| A.2.241-243 | `DayPeek.day/removed/el` | the incoming day's view, a selector over the replica; the view draws it (P3) | P3, P6 | 4 |
| A.2.244 | `ColumnSwitch.icons` | view | P1 | 4 |
| A.2.245-247,251 | wheel press, hold timer, swallowed click, capture | wheel-drag gesture + `input` | P6, P7, P8 | 4 |
| A.2.248,252-253 | wheel `is-settling`, ribbon `is-switching` | transitions (wheel settle, ribbon slide) | P5 | 4 |
| A.2.249-250 | `ColumnSwitch.at`, wheel window properties | selector of `shownPlace`; live drag on transient channel; `motion` variables | P1, P7 | 4 |

### zoom

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.254-255 | `CS.hourPx`, `CS.wholeDay` | `model.zoom {hourPx, wholeDay}` | P1 | 4 |
| A.2.256,261 | `zoomFrame`, `PinchZoom.scaled` | transient channel; dispatch on a step | P4, P8 | 4 |
| A.2.257-260,262-263 | pinch pointers, wheel timer, anchor, limits, capture | pinch gesture + `recognizers/`; wheel settle timer command | P6, P7, P8 | 4 |
| A.2.264-265 | `Timeline.minor/grid` | selector `gridAt(hourPx)` (transient channel; dispatch on a step) | P1 | 4 |
| A.2.266-267 | `hourShown`, `--tc-hour` | `motion` variable | P7 | 4 |

### scroll

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.268 | `CS.scrolledFor` | gone: update emits a scroll order on a day change | P2 | 4 |
| A.2.269-270,283 | timeline / day list / peek scroll positions | `scroll`-local, keyed scroller ids (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| A.2.271-276 | `QEC.follow/revealedAt/revealing/handScrolledAt/watchedScroller`, scrollTop | field layer (core `QuickEntrySession`) `follow`; `scroll` `reveal` orders; `userScrolled` ends follow | P3, P6, P7 | 3 |
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

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.303,353-356 | `activeEditor`, `EmbeddedEditor` state, CodeMirror doc | `islands` | P7 | 3 |
| A.2.304 | `WriteQueue.tail` | message order on the replica; the tasks queue and the pending log | P2, P3 | 1 |
| A.2.305 | `QEC.state` | `model.entry` (the door's `EntryAnswer`) | P1, P3, P7 | 3 |
| A.2.306,329 | `QEC.field`, `quiet` | `islands` (editor handle; owner set text is not input) | P7 | 3 |
| A.2.307,339,479 | `QEC.focused`, group name focus, field focus | `focus` | P7 | 3 |
| A.2.308 | `QEC.turning` | field layer (core `QuickEntrySession`) flag while the bar turns the wheel | P3, P6, P7 | 4 |
| A.2.309 | `QEC.draws` | gone: the view is drawn in the message (P3) | P2, P3 | 3 |
| A.2.310,340 | `pressEnding`, `FreeRoomDoubleClick.mouse` | `recognizers/` | P7 | 3 |
| A.2.311,313-314,316-317,319-325,327-328,330-331 | bar and field look (`is-entering`, bar state, buttons, tint, placeholder, plus hidden) | selectors over `model.entry` → JSX | P1 | 3 |
| A.2.315,326 | `QuickBar.leaving`, pointer-events while fading | presence transition: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6 | 4 |
| A.2.318 | bar `is-gliding` | keyboard transition | P5 | 3 |
| A.2.312 | field element parent | view: row by key; field island mounted in it | P1, P7 | 3 |
| A.2.332-336 | `EntryRows.*` | `model.entry` + `model.rowKeys` (`rowKey(taskId)` bound by `CreatedTask`, rebound when a replay answers another id) | P1, P2 | 3 |
| A.2.337-338,352 | `RenamedTexts` | one plugin-wide replica; the door's answer applied at once (P3) | P3 | 1, 3 |
| A.2.341-343 | `TaskMenu.stackRow/fieldRow/fieldClosed` | overlay + field and entry layers (stack spot) (layer stack; data applies at once) | P6 | 3 |
| A.2.344-346 | `FullScreen.editing/draft/saveTimer` | `islands` + `sheet.full.description` (door session) + debounce timer command | P3, P7, P8 | 3 |
| A.2.347-351 | `FullScreen.state/field/focused/titleField/leavingTitle` | `sheet.full.entry` (a second core entry session); `focus` | P1 | 3 |
| A.2.357 | `markdown-rendered` | `islands` | P7 | 3 |
| A.2.358 | tree `askProjectName` slot | naming layer `{kind: newProject, gap, depth}` | P6 | 4 |
| A.2.359-361 | `Timeline.field`, `is-renaming`, field box | selector over `model.entry` in the timeline; `motion` variables | P1, P7 | 4 |
| A.2.362-363 | `TaskList.slot`, card `is-renaming` | naming layer; JSX | P1, P6 | 3 |

### menus/overlays/full/search

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.364,373 | `CS.search`, `BulkController.menu` | `model.overlay` stack entries | P6 | 4 |
| A.2.365,422-426 | `CS.full`, `FullScreen.stack/reading/closed/Escape/is-shown` | `model.sheet.full`; its levels selectors over the replica; Escape order function; presence: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P3, P6 | 4 |
| A.2.366,377 | menu `current`, `TaskMenu.context` | `overlay.task.key` remapped by write answers | P1 | 3 |
| A.2.367 | `QEC.stack` | overlay + entry (stack spot) (layer stack; data applies at once) | P6 | 3 |
| A.2.368-372 | bar panel state | field layer (core `QuickEntrySession`) `panel {kind, page}` (nested overlay); side from `measure` | P3, P4, P6, P7 | 3 |
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

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.431 | `is-docking` + timer | dock-slide transition | P5, P8 | 4 |
| A.2.432-436 | desktop capsule room, anchor, away, glide start, position | selectors from `measure` (field box) + `chrome`; `motion` variables | P4, P7 | 3 |
| A.2.437 | `ObsidianChrome.statusBar` | `chrome` | P7 | 4 |
| A.2.438 | Settings colour rows wrap | settings-tab host: its own model; the colour rows' wrap from `measure` | P1, P4 | 6 |
| A.2.439-441 | peek column styles, invisible, all-day | view draws the neighbour day's layout | P3, P4 | 4 |
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

| Rows | What | Owner in revision 8 | P | Slice |
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

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.495 | `CS.seen` | update compares `model.settings` before / after (settingsEffect as an update rule) | P1 | 4 |
| A.2.496-497 | plugin settings in memory, `rightMode` | plugin runtime (`obsidian/runtime/`, `main.ts`): settings held as `PluginSettings.get()` in the replica; the `rightMode` hand-over through the runtime's settings port; until slice 7 the old services keep `main.ts`'s hand-over [R18] | P3, P7 | 1, 7 |
| A.2.498-500 | view settings stores | `model.device`; device storage only keeps it, through `PluginSettings.partition` (P1) [R18] | P2, P3, P7 | 1 |
| A.2.501-502,509-512 | Settings tab page, colour preview, row reorder | settings-tab host: page and preview from its model; the row reorder is a declared transition | P1, P5 | 6 |
| A.2.503-508 | card size and priority colour body tokens | `chrome` per window from settings (`chrome` takes it from the model) | P7 | 3, 4 |
| A.2.513-516 | repeat page / editor | overlay page `repeat` (core `RepeatPage`) | P6, P7 | 3 |

### note blocks

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.517,519-523 | `ViewWatch.frame`, block registry, `asks` | host (block host); `asks` go: `projectNoteView` a selector over the replica | P2, P3, P7, P8 | 3 |
| A.2.518 | block key scope | `keys` driver (Obsidian `Scope`s) | P7 | 3 |
| A.2.524 | block position, `--tc-block-lift` | host block placement; lift from `measure` | P4, P7 | 3 |
| A.2.525 | focus in block | `focus` | P7 | 3 |
| A.2.526-527 | `BlockHeight` | `measure` (content height) → `motion` variable | P4 | 3 |

### undo

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.528 | undo button off | `model.canUndo` [R17] | P1 | 3, 4 |

### other

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A.2.529,538 | teardown list, tab's screen | runtime / host mount | P7, P8 | 1 |
| A.2.530 | `CS.changing` | message order on the replica; the tasks queue and the pending log | P2, P3 | 1 |
| A.2.531 | arbiter claim `naming` | naming layer | P6 | 3 |
| A.2.532 | `services` for console | plugin runtime (`obsidian/runtime/`) | P7 | 1 |
| A.2.533 | `DayData.shown` | gone: notification by selector equality | P2 | 4 |
| A.2.534-536 | `Reload` state | a write's answer in the replica in the same message (P3); `rowKey(taskId)` bound by `CreatedTask`, rebound when a replay answers another id | P1, P2, P3 | 1, 3 |
| A.2.537 | `ScreenParts.waiting` | gone: data applies at once; anything moving draws the layout it pinned when it began | P6 | 3, 4 |
| A.2.539 | `FramePass` | `measure` / `scroll` frame scheduling | P7 | 3 |
| A.2.540-541 | arbiter holder, idle listeners | `interaction.gesture`; pinned layout snapshot applied on its end (P6) | P6, P8 | 3 |
| A.2.543-544 | `MonthPicker` month, day marks | overlay page `{month}`; JSX | P6 | 4 |
| A.2.545 | click listener per render | `islands` (MarkdownRenderer, created once) | P7, P8 | 3 |
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

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| B.1.1-4,6-8,10-13,16,60-61,66,73,75-79,82-83,85,87,89-91,95-104,107,113-115,118-119,121,123 | task writes (`act`) | door call in message order; its answer in the replica at once; `staleTask` → notice; its text to the tasks queue (`vault.process`, the base checked inside `fn`) [R17] [R20] | P2, P3 | 1, 3 |
| B.1.17-18 | `startCarry`, `endCarry` | door carry calls (`startCarry`, `endCarry`) in message order over the replica [R20] | P2, P3, P7 | 1, 3 |
| B.1.5,9,14-15,19-20,22-26,28-30,53,55-56,93,122 | synchronous service reads (`bulkMenu`, `carried`, `snap`, `stretch`, `firstPlace`, `relation`, `today`, `boundary`, `shownSpan`, `isPast`, `dropSpan`, `newSlot`, `findIn`, `listName`, `stepFunnel`, `columnSections`, `menu`, `openAt`) | door selectors and `rules.*` (clock from `model.now`) | P3, P7 | 1, 3 |
| B.1.27,34,39,63,81,84,92,94 | event, sources, more, search, section, project menus; full card; task menu | `model.overlay` / `model.sheet` (a Preact layer) | P6 | 4 |
| B.1.31 | quick entry shows the day it wrote to | Msg `entryShowsDay` → `model.day` ; its view a selector over the replica | P2, P3 | 3 |
| B.1.32,38,48,50,71 | rereads (fresh, after undo, load, day passed, after failure) | a selector over the replica (the door's view, memoised) | P2, P3 | 1, 3 |
| B.1.33,57 | wheel turned, swipe landed on a place | ribbon / wheel gesture → Cmd `setFunnelPlace` | P6 | 4 |
| B.1.35,44-47,52 | calendar poll and refresh | network lane, latest per day; a feed's problem handed to the door as `feedProblems` (P3) [R19] | P2, P3 | 1 |
| B.1.36 | undo / redo | door call `history.undo` in message order; `canUndo` from the replica's history [R17] | P2, P3 | 1, 3 |
| B.1.37,69-70 | notices | Cmd `notice` [R17] | P2 | 1 |
| B.1.40-43 | service subscriptions | runtime inputs → `fileChanged`, `calendarsChanged`, `settingsChanged`, `dayChanged` [R17] | P2, P8 | 1 |
| B.1.49 | `Timeline.tickNow` | `tick` → `model.now` (applies at once (P6)) | P6 | 1 |
| B.1.51 | select today on day moved | update rule on `dayChanged` | P2 | 4 |
| B.1.54,72,120 | view settings writes (`listShare`, `zoom`, `treeWidth`) | Cmd `device.set`: a per-key patch that `PluginSettings.partition` routes to device storage; the store only keeps `model.device` (P1) [R18] | P2, P3 | 1 |
| B.1.21,58-59 | day step, day swipe landed, day turn | day-swipe gesture; the new day's view a selector over the replica | P3, P6 | 4 |
| B.1.62 | haptics | Cmd `haptic` | P7 | 1 |
| B.1.64-65,108 | `reveal`, `filterHides`, `lineOf` (async reads) | a door call in the message, over the replica | P2, P3 | 1, 3 |
| B.1.67 | after reveal: day, wheel, place | update on `revealed` | P2 | 4 |
| B.1.68 | `Timeline.select(null)` | update on `pressedElsewhere` | P6 | 4 |
| B.1.74 | `projectsDropPreview` | the door's answer over the replica, at once (P3) (landing card at the line, A6.14) | P3 | 1, 3 |
| B.1.80 | section name field + scrollIntoView | naming layer; `focus`; `scroll` reveal | P6, P7 | 3 |
| B.1.86 | NoteSearch modal | `islands` (Obsidian `Modal`) | P7 | 3 |
| B.1.88,109-111 | open note / file / link / URL | Cmd `obsidian.open` | P7 | 1 |
| B.1.105-106 | rename / add subtask | field layer (core `QuickEntrySession`) open | P3, P6, P7 | 3 |
| B.1.112 | `funnelView` / `projectNoteView` in each read | selectors over the replica | P2, P3 | 1, 3 |
| B.1.116-117 | `projectsTakes`, `projectsPlusPlace` (pure) | core pure rules in update | P4 | 3 |
| B.1.124-126 | interval, landing / dock timers, pinch rAF | runtime clock; timer Cmds; transient channel; dispatch on a step | P3, P7, P8 | 1 |
| B.1.127 | `StatusBarRoom.hold` | `chrome` | P7 | 4 |
| B.1.128-139,141-142 | plugin load, settings file, code watcher, registrations, protocol, login, sync, device storage, place hand-over, open view, popouts, sync notice, core timers | plugin runtime (`obsidian/runtime/`): lifecycle and readiness (P8: the replica built once the layout is ready and the metadata cache resolved), protocol actions, login (the token through the runtime's settings port), the place hand-over; until slice 7 the old services keep their own wiring here [R17] | P3, P7, P8 | 1, 7 |
| B.1.140 | osascript (open event in Calendar) | Cmd `openInCalendar` | P7 | 1 |

### B.2 G1

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| B.2.1-3 | calendar events fetch and cache | network lane, latest per day; a feed's problem handed to the door as `feedProblems` (P3) [R19] | P2, P3 | 1 |
| B.2.4-6 | task reads (`funnelView`, `screen`, `projectsScreen`) | a selector over the replica (the door's view, memoised) | P2, P3 | 1, 3 |
| B.2.7-9 | `onUpdate`, ScreenParts, draw | notification by selector; the `ScreenParts` hold is gone (P6) | P2, P6 | 1, 3 |
| B.2.10,29-65 | quick entry session construction and every session call | field layer = the door's `entry.*` session over the replica; its jobs are door calls in message order | P2, P3, P6, P7 | 3 |
| B.2.11-19 | entry helpers (`placementOf`, `parseTitle`, `isBlank`, …) | core pure rules in update / selectors | P1 | 3 |
| B.2.20-23 | session writes (`createSection`, `edit`, `unfoldAbove`, `createWithId`) | the entry's job order: `QuickEntrySession` run by the runtime over its ports, unchanged (P3) [R19] | P2, P3 | 1, 3 |
| B.2.24 | `list.adopt(created.id)` | `model.rowKeys` (`rowKey(taskId)` bound by `CreatedTask`, rebound when a replay answers another id) [R19] | P1 | 3 |
| B.2.25-27,109,111-112 | `listName`, `placementTitle`, `placementOfDay` | door selectors and `rules.*` (clock from `model.now`) | P3, P7 | 3 |
| B.2.28 | `newProject` from the bar | Cmd write | P2, P3 | 1, 3 |
| B.2.66-67 | entry `fresh` reads | a selector over the replica (the door's view, memoised) | P2, P3 | 1, 3 |
| B.2.68,71 | entry render requests | notification by selector | P2 | 3 |
| B.2.69-70 | lock panel, forget typed | selectors; entry end | P1 | 3 |
| B.2.72 | bar turns the wheel | entry + ribbon gestures (layer stack; data applies at once) | P6 | 4 |
| B.2.73 | bar shows another day | `model.day`, after the entry's door calls in message order; its view a selector over the replica | P2, P3 | 3 |
| B.2.74-77 | plus drag (and aside on by project) | carry gesture `payload: plus` | P6 | 3 |
| B.2.78-86 | menu stack and timeline field calls | overlay + field and entry layers; selectors (layer stack; data applies at once) | P6 | 4 |
| B.2.87 | bar show / hide / follow | JSX from `model.entry` + `measure` | P1, P4 | 3 |
| B.2.88,242 | field / name input focus | `focus` | P7 | 3 |
| B.2.89-91 | reveal scroll, glide, wait for growth | `scroll` reveal; `motionSettled` | P5, P7 | 3 |
| B.2.92 | blur check timer | `focus` reports `blurred`; update decides | P7, P8 | 3 |
| B.2.93-95 | entry listeners and observers | `input` / `measure` | P7, P8 | 3 |
| B.2.96,100,103-108,110 | bar button callbacks | entry Msgs | P6 | 3 |
| B.2.97,101-102 | bar panel open / redraw / pick | nested overlay in the field layer (core `QuickEntrySession`) (a Preact layer) | P3, P6, P7 | 3 |
| B.2.98 | document press while panel open | `input` → `pressedElsewhere` | P7 | 3 |
| B.2.99,113-114 | bar panel and capsule appear / fade | presence transitions: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6 | 3 |
| B.2.115-121 | title field editor | `islands` (EmbeddedEditor); key scope (`keys` driver) | P7 | 3 |
| B.2.122-124 | plus press, tap, drag | `input` → carry / entry | P7 | 3 |
| B.2.125-126 | ring, `tc-cancelling` | JSX; `chrome` body class (`chrome` takes it from the model) | P1, P7 | 3 |
| B.2.127-129 | `ScrollGlide` | `scroll` | P7 | 3 |
| B.2.130 | status bar query | `chrome` | P7 | 4 |
| B.2.131-133 | `EntryRows` drawing | view + `model.rowKeys` | P1 | 3 |
| B.2.134-135 | keyboard will show / hide | `chrome` → `model.chrome.keyboard`; keyboard transition | P4, P5 | 3 |
| B.2.136-141 | view settings file / store | Cmd `device.set`: a per-key patch that `PluginSettings.partition` routes to device storage; the store only keeps `model.device` (P1) [R18] | P2, P3 | 1 |
| B.2.142,145-147 | tab: screen create / open / close / resize | host mount; `measure` | P7, P8 | 1, 3 |
| B.2.143-144 | tab key scope, undo / find keys | `keys` driver (Obsidian `Scope`s) → Msgs [R17] | P7 | 3, 4 |
| B.2.148-149 | `ViewWatch` | host block | P7 | 3 |
| B.2.150,152,154-157,159-160,162-163,165-166,168-170 | note block lifecycle, placement, events | host block | P7, P8 | 3 |
| B.2.151,158 | block key scope | `keys` driver (Obsidian `Scope`s) | P7 | 3 |
| B.2.153 | block focus | `focus` | P7 | 3 |
| B.2.161,164 | block `onChange`, `projectNoteView` | runtime input; `projectNoteView` a selector over the replica [R17] | P2, P3 | 3 |
| B.2.167 | `--tc-block-lift` | host block placement from `measure` | P4 | 3 |
| B.2.171-223 | Settings tab and its pages | settings-tab host: until slice 6 the old tab keeps `SettingsServiceImpl` over the shared `PluginSettings`; then its calls are door calls, their settings persisted as per-key patches [R18] | P2, P3, P7 | 6 |
| B.2.224-225,228 | undo button: `canUndo`, `onUndo` | `model.canUndo` (selector over the replica's history); Msg `undo` [R17] | P1, P3 | 1, 3 |
| B.2.226 | ⋯ pressed | overlay `more` | P6 | 3 |
| B.2.227 | `UndoService.onChange` | `model.canUndo` from the replica's history (the old screen keeps `UndoService.onChange` until slice 7) [R17] | P2 | 1, 3 |
| B.2.229-230 | `StatusBarRoom` observers, body class | `chrome` | P7, P8 | 4 |
| B.2.231-235 | card size, priority colours, label paint on body | `chrome` per window (`chrome` takes it from the model) | P7 | 3, 4 |
| B.2.236-237 | haptics | Cmd `haptic` | P7 | 1 |
| B.2.238 | `execCommand` undo | `input` | P7 | 3 |
| B.2.239-241 | `SectionNameEntry` | naming layer = the door session (a door session over the replica) | P3, P6, P7 | 3 |
| B.2.243 | `FramePass` | driver frame scheduling | P7 | 3 |
| B.2.244 | popout listener | host / `chrome` | P7, P8 | 1, 3 |

### B.3 G2

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| B.3.1-3,8,34-36,72-73,85-88 | `snap`, `stretch`, `carried`, `dropSpan`, `newSlot`, `bulkMenu`, peek reads (`shownSpan`, `isPast`, `relation`, `columnSections`) | door selectors and `rules.*` (clock from `model.now`) | P3, P7 | 4 |
| B.3.4-5,9-11,38,62-71,96,102 | writes through deps (resize, drop, fold, mark, move section, bulk, place) | door call in message order; its text to the tasks queue (`vault.process`, the base checked inside `fn`) [R20] | P2, P3 | 1, 3 |
| B.3.6-7 | `startCarry`, `endCarry` via deps | door carry calls, in message order [R20] | P2, P3, P7 | 1, 3 |
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
| B.3.60-61 | `LongPress` timer, outcomes | `recognizers/` | P7, P8 | 3 |
| B.3.75-79 | bulk capsule, ring, count, pick circles | JSX from `model.selection` | P1 | 4 |
| B.3.80-81 | found card scroll | `scroll` reveal | P7 | 4 |
| B.3.82-84 | peek reads (`dayView`, `events`, `fresh`) | gone as reads: a day's tasks and cached events are selectors over the replica; fresh events through the network lane | P2, P3 | 4 |
| B.3.89-90 | peek render, align | view for the neighbour day | P1, P3 | 4 |
| B.3.91,93-95 | swipe → pager follow / settle / frames | swipe gestures + transient channel + settle transition (a tap leaves the settle running) | P5, P6 | 4 |
| B.3.97-101 | strip / day tracks | `motion`; day-swipe `nearer`, `landing` | P5 | 4 |
| B.3.104,106 | wheel dot, label | selectors | P1 | 4 |
| B.3.105 | wheel timers | `recognizers/` / timer Cmd | P7, P8 | 4 |
| B.3.107,110 | divider and pinch settings writes | Cmd `device.set`: a per-key patch that `PluginSettings.partition` routes to device storage; the store only keeps `model.device` (P1) | P2, P3 | 1 |
| B.3.108 | divider width live | transient channel; dispatch on a step | P4 | 4 |
| B.3.111 | pinch scale | transient channel; dispatch on a step | P4 | 4 |
| B.3.112-113 | wheel preventDefault, wheel zoom settle | `input`; `recognizers/` timer | P7 | 4 |
| B.3.114-117 | settings row reorder | settings-tab host: the row-reorder gesture and its transition | P5, P6 | 6 |
| B.3.118 | free-room double click | `input` → entry `openAtEnd` | P7 | 3 |
| B.3.92 | horizontal wheel preventDefault | `input` | P7 | 4 |
| B.3.119-135 | pure core rules (`placeAt`, `swipeLanding`, `dividerAt`, …) | pure rules in update / selectors | P4 | 4 |

### B.4 G3

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| B.4.1-5,36-39,79,105 | menu models, `fullTree`, `listName` | door selectors and `rules.*` (clock from `model.now`) | P3, P7 | 4 |
| B.4.6-18,40-51,54,56,59-60,173 | menu writes | write pick: its door call at the tap; the closing sheet pins the layout under it (P6) | P2, P3, P6 | 1, 3 |
| B.4.19-22 | `RepeatPage` | overlay page = a door session (`repeatPage.end`); its write a door call when the page closes; the closing sheet pins the layout | P3, P6, P7 | 3 |
| B.4.23,28,58,68 | open link / in Obsidian / note / in Calendar | Cmd `obsidian.open` / `openInCalendar` | P7 | 1 |
| B.4.24-26,29,53,55,57 | typing picks (`pickNow`): rename, description, subtask, new section, project rename, attach note | typing picks: the user's event handled to the end, focus last | P2, P6, P7 | 3 |
| B.4.27,31 | open full card from menu / peek | overlay pick → `model.sheet.full` | P6 | 4 |
| B.4.30,66 | subtask menu over the same sheet; ⋯ → Search | hand-over: one layer transition | P6 | 3, 4 |
| B.4.32,52,62,133,166 | lifted copy, bulk close, link closes menu, view menu, project menu | menu layer (a Preact layer) | P6 | 3 |
| B.4.33 | second press within double click | overlay → entry rename | P6 | 3 |
| B.4.34 | menu closed while typing | entry Msg (layer stack; data applies at once) | P6 | 3 |
| B.4.35,69,129,132,134-135,141-144,146-147 | pure rules (`labelTitle`, `grownStart`, `editRepeat`, `projectsEntryLook`, `projectsDrop`, …) | pure rules in update / selectors | P1 | 3, 4 |
| B.4.61,85,87,91-92,111-128 | MarkdownRenderer, EmbeddedEditor, ObsidianMarkdown, line commands, scopes | `islands` (key scopes (`keys` driver)) | P7 | 3 |
| B.4.63-65 | month pick, view mode, Subprojects | overlay page; door call after the entry's door calls, in message order [R17] [R20] | P2, P3, P6 | 3 |
| B.4.67 | Select tasks | `model.selection.mode` (layer stack; data applies at once) | P6 | 4 |
| B.4.70 | menu waits for the column to scroll the card in | overlay `revealing` + `scroll` (`scroll` orders; `measure` reports scroll) | P6, P7 | 3 |
| B.4.71,77,84,86,88-89,93-98,100-101 | full card entry session and description draft | `sheet.full` = the door sessions (a door session over the replica) | P3, P6, P7, P8 | 3 |
| B.4.72 | `RenamedTexts.add` | one plugin-wide replica; the door's answer applied at once (P3) | P3 | 1, 3 |
| B.4.73-76 | full card capsule (undo, ⋯, plus) | `model.canUndo`; overlay; entry [R17] | P1, P6 | 3 |
| B.4.78,83 | `find` (async) | a door call in the message, over the replica | P2, P3 | 3 |
| B.4.80,90 | `toggleDone`, `setDescription` (debounced) | Cmd write; debounce timer Cmd | P2, P3 | 1, 3 |
| B.4.81-82 | subtask menu, project line | overlay; Cmd + close | P6 | 3 |
| B.4.99 | title field | `islands` | P7 | 3 |
| B.4.102-103 | full card close / error | Msgs | P6 | 3 |
| B.4.104 | search | door call `tasks.search` in the message, memoised by query | P2, P3 | 4 |
| B.4.106-107 | search pick / close | overlay → `revealed` | P6 | 4 |
| B.4.108 | search takes the ⋯ sheet | hand-over: search takes the ⋯ sheet | P6 | 4 |
| B.4.109 | field's own undo | `input` | P7 | 3 |
| B.4.110 | Refresh now | network lane [R19] | P2 | 1 |
| B.4.130-131 | repeat change / remove | overlay page Msgs | P6 | 3 |
| B.4.136-140,145 | by-project reads of the model and handlers | selectors; JSX handlers | P1 | 3, 4 |
| B.4.148-149,151-152,161,167 | tree / list drops, close dim, pick node, move project, clear filter | Cmd write [R20] | P2, P3 | 1, 3 |
| B.4.150,155,160 | haptics | Cmd `haptic` | P7 | 1 |
| B.4.153 | panel width → frame | `measure` | P4, P8 | 4 |
| B.4.154 | tree width save | Cmd `device.set`: a per-key patch that `PluginSettings.partition` routes to device storage; the store only keeps `model.device` (P1) | P2, P3 | 1 |
| B.4.156 | tree width read | `model.device.treeWidth` | P1 | 4 |
| B.4.157,168 | new project / rename project name field | naming layer | P6 | 3, 4 |
| B.4.158-159 | tree row tap, row lift attach | Msg; tree-lift gesture | P6 | 4 |
| B.4.162-165 | `carryAt`, reread, clock, error | door call `carryAt` + timer in message order; `model.now`; `staleTask` [R20] | P2, P3, P7 | 3 |
| B.4.169 | carry deps | carry gesture | P6 | 3 |
| B.4.170-172 | note search modal | `islands` | P7 | 4 |
| B.4.174 | grips | `input` → resize gesture | P7 | 3 |

### B.5 G4

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| B.5.1-9,12,22,65,68,73-74,83,96,100 | timeline / list core reads (`DayBoundary`, `shownSpan`, `relation`, clock, `isPast`, `listName`, `stepFunnel`) | door selectors and `rules.*` (clock from `model.now`); clock → `model.now` | P3, P7 | 3, 4 |
| B.5.10-11,13-21,23,40-41,60,63-64,79,90-91,95,103 | pure rules | pure rules in selectors | P1, P4 | 3, 4 |
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

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| B.6.1 | `TaskService.onChange` | `fileChanged` → the runtime takes the new base and replays the pending log from its snapshot, each call at its own `nowMs`, at most twice (P3); the full card's levels are selectors (layer stack; data applies at once) [R17] | P2, P3, P8 | 1, 3 |
| B.6.2,13 | calendar change, poll | network lane [R19] | P2, P8 | 1 |
| B.6.3,47-48 | settings / view settings change | settings in the replica; written as a per-key patch through `PluginSettings.update`, which merges over a fresh read (P3) [R18] | P2, P3, P8 | 1 |
| B.6.4 | day change | `dayChanged` (applies at once (P6)) | P6, P8 | 4 |
| B.6.5-7 | focus, visibility, active leaf | `chrome` → `model.visible`; poll wake [R19] | P4, P8 | 3, 4 |
| B.6.8 | document pointerdown ×3 | `input` → `pressedElsewhere` | P7, P8 | 3 |
| B.6.9 | document keydown (bulk) | `input` | P7, P8 | 4 |
| B.6.10,95 | arbiter idle | gone: when the motion ends, the move from its pinned layout to the current one is a keyed transition | P5, P6, P8 | 3, 4 |
| B.6.11 | `css-change` | `chrome` → `model.theme` | P4, P8 | 3, 4 |
| B.6.12,155 | minute interval, tick | clock → `model.now` | P2, P8 | 1, 3 |
| B.6.14,50 | view resize | `measure` stage size | P4, P8 | 4 |
| B.6.15-19,49 | plugin settings, visibility, vault raw, popouts, sync leave | plugin runtime inputs → messages to every screen's store [R18] | P2, P7, P8 | 1 |
| B.6.20 | DayData driven by calls | runtime | P2, P8 | 1, 3 |
| B.6.21,97-99 | session `onChange` / `fresh` / `renamed` | entry / full card = door sessions (a door session over the replica) [R19] | P3, P6, P7, P8 | 3 |
| B.6.22-24,35-36 | tap away, press ending, bar presses | `input` | P7, P8 | 3 |
| B.6.25-26 | root scroll, hand scroll | `scroll` `userScrolled` | P7, P8 | 3 |
| B.6.27,34,37 | transitionend, fade finish | `motionSettled` | P5, P8 | 3 |
| B.6.28-29,38 | resize observers, panel place | `measure` | P4, P8 | 4 |
| B.6.30 | field growth finished | `motionSettled` | P5, P8 | 3 |
| B.6.31,104 | blur timers | `focus` → `blurred` | P7, P8 | 3 |
| B.6.32-33 | FramePass, ScrollGlide frames | drivers | P7, P8 | 3 |
| B.6.39 | bar repeat panel change | entry Msg | P6, P8 | 3 |
| B.6.40-44 | field editor change, keys, IME, focus | `islands` + `input` (scopes (`keys` driver)) | P7, P8 | 3 |
| B.6.45 | plus pointer | `input` | P7, P8 | 3 |
| B.6.46 | keyboard events | `chrome` | P4, P8 | 4 |
| B.6.51,59 | tab / block key scopes | `keys` driver (Obsidian `Scope`s) | P7, P8 | 3, 4 |
| B.6.52-58 | note block events | host block [R17] | P7, P8 | 3 |
| B.6.60,106 | `UndoService.onChange` | `model.canUndo` from the replica's history (the old screen keeps `UndoService.onChange` until slice 7) [R17] | P2, P8 | 3, 4 |
| B.6.61 | status bar observer | `chrome` | P7, P8 | 4 |
| B.6.62-66 | Settings tab events | settings-tab host: inputs → messages | P2, P7, P8 | 6 |
| B.6.67 | popout opens | host / `chrome` (`chrome` takes it from the model) | P7, P8 | 1, 3 |
| B.6.68 | section name field keys / blur | naming layer (door session) | P3, P6, P7, P8 | 3 |
| B.6.69 | field undo keys | `input` | P7, P8 | 3 |
| B.6.70-78 | card / block / event / canvas / drag / resize / section / long-press pointer events | `input` → carry, timeline and section-lift gestures | P6, P7, P8 | 4 |
| B.6.79 | auto-scroll frame | `scroll` (`scroll` orders; `measure` reports scroll) | P7, P8 | 3 |
| B.6.80-81 | flight timers, section float finished | `motionSettled` (timeout message) | P5, P8 | 3 |
| B.6.82-83 | peek reads resolve | gone: nothing to read ahead; `eventsLanded` Msg from the network lane | P2, P3, P8 | 4 |
| B.6.84-86 | swipe pointer, wheel stream timer, pager frame | `recognizers/` + `motion` | P7, P8 | 4 |
| B.6.87-88 | pinch pointer / wheel, wheel settle | `input` + pinch gesture | P7, P8 | 4 |
| B.6.89-90 | wheel pointer, click, keys, timers | `input` + wheel-drag gesture | P7, P8 | 4 |
| B.6.91,165 | divider gestures (ribbon) | `input` + divider gesture | P7, P8 | 4 |
| B.6.166 | divider gestures (still layouts) | `input` + divider gesture | P7, P8 | 4 |
| B.6.92 | settings row reorder | settings-tab host: reorder gesture through `input` and `recognizers/`; the order write a door call (`settings.move*`), persisted as a per-key patch | P3, P6, P7, P8 | 6 |
| B.6.93,159-161 | free room double click, plates | `input` → entry | P7, P8 | 3 |
| B.6.94 | found card frame | `scroll` reveal | P7, P8 | 4 |
| B.6.96,100-103 | full card refresh, title rename end, description save, focus, Escape | `sheet.full` Msgs; Escape order (layer stack; data applies at once) [R17] | P6, P8 | 3 |
| B.6.105,112-113 | full card / overlay show and remove frames | presence: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6, P8 | 3 |
| B.6.107-109 | search input, keys, row click | overlay search | P6, P8 | 4 |
| B.6.110-111 | overlay Escape, backdrop | `input` → overlay close | P7, P8 | 3 |
| B.6.114 | `Picks.giveUp` | (timeout message) bounded wait | P2, P8 | 3, 4 |
| B.6.115-117,121-127 | menu events (Enter, double press, copy click, peek, view menu frame, month arrows, switch, toggles) | overlay Msgs (a Preact layer) | P6, P8 | 4 |
| B.6.118 | stack field row grows | transition | P5, P8 | 3 |
| B.6.119 | menu after the column scroll | overlay `revealing` + `scroll` (`scroll` orders; `measure` reports scroll) | P6, P8 | 3 |
| B.6.120 | page morph finished | `motionSettled` | P5, P8 | 3 |
| B.6.128-132 | embedded editor focus, update, keys, rendered click | `islands` | P7, P8 | 3 |
| B.6.133,135 | tree panel resize, tree divider | `measure`; tree-divider gesture | P4, P6, P8 | 4 |
| B.6.134,136,141-143 | dim, tree row, filter title, plate | Msgs | P6, P8 | 4 |
| B.6.137-138 | tree lift | `input` + tree-lift gesture | P7, P8 | 4 |
| B.6.139-140 | carry report timer, move / end | door call `carryAt` + timer, in message order | P2, P3, P7, P8 | 3 |
| B.6.144 | repeat editor buttons | overlay page Msg | P6, P8 | 3 |
| B.6.145 | view button | overlay `view` | P6, P8 | 3 |
| B.6.146 | note chosen | `islands` → Cmd write | P2, P3, P8 | 3 |
| B.6.147-148,152 | grips, kit buttons | `input` | P7, P8 | 3 |
| B.6.149 | timeline resize observer | `measure`; anchor held (`scroll` orders; `measure` reports scroll) | P4, P8 | 4 |
| B.6.150-151 | wheel / touch drop the anchor | `input` → `userScrolled(timeline)` | P7, P8 | 4 |
| B.6.153,156-158 | ScrollEdges, ScrollHold | `scroll` (`scroll` orders; `measure` reports scroll) | P7, P8 | 3 |
| B.6.154,173-174 | motion finished (block gone, row grown / left) | `motionSettled`; leaving rows skipped by layout selectors (P4) | P4, P5, P8 | 3 |
| B.6.162-164 | note block observers and frame | `measure` | P4, P8 | 3 |
| B.6.167-168 | strip track callbacks, slide end | `motion` | P5, P8 | 4 |
| B.6.169-171 | rows observer, fit frame, settle | `measure`; `motionSettled`; heights never held | P4, P5, P8 | 3, 4 |
| B.6.172 | drop hover in rows | carry target | P6, P8 | 3, 4 |
| B.6.175-176 | glide stopped by a finger, glide end | `scroll` `userScrolled`, `scrollSettled` (`scroll` orders; `measure` reports scroll) | P7, P8 | 3 |
| B.6.177 | `SnapGlide` frames | `motion` | P5, P8 | 4 |
| B.6.178-180 | prototype | replaced by the runtime | — | 1, 7 |

## Behaviour (203 inputs, 84 motions, 84 measurements, 52 screen states)

Row ids are the ids of `inventory-behaviour.md` (it has no C1.16; C1 holds 23 rows).

### A. Inputs and gestures

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| A1.1-2 | open the tab (ribbon icon, command) | host (plugin) opens the view; runtime mounts a screen | P7 | 1, 3 |
| A1.3 | note block appears | host block; same view in a block host | P7 | 3 |
| A1.4 | several tabs, popouts | one runtime per plugin: one replica, one tasks queue, one pending log; `chrome` per window | P2, P3, P7, P8 | 1 |
| A2.1 | tap a card → task menu after reveal | tap `recognizers/` → overlay `task` with `revealing` (`scroll` orders; `measure` reports scroll) | P6 | 3 |
| A2.2 | counter tap folds subtasks | Cmd `toggleCollapsed`; fold motion by cause (keyed diff within one context) | P2, P5 | 3 |
| A2.3 | folder mark tap → filter | Cmd `selectProjectNode` | P2 | 3 |
| A2.4,8-9 | right click / click with selection → bulk or task menu | tap order function over `model.selection`; overlay | P6 | 4 |
| A2.5 | double click → rename | overlay `task` → entry rename (second press within 250 ms) | P6 | 3 |
| A2.6-7,10 | Cmd-click, Shift-click, tap in select mode | `model.selection`; select mode (layer stack; data applies at once) | P6 | 4 |
| A2.11-15 | long press / mouse drag lift, cancel, second finger, redraw during press | `recognizers/` → carry gesture; hand-off to pinch | P6, P7 | 3 |
| A2.16-17 | Done / immovable by-project cards | card `can` from the core; tap only | P1 | 3, 4 |
| A2.18-21 | double click free room, plates | `input` → entry `openAtEnd` / `openIn` | P6 | 3, 4 |
| A2.22 | select text in the lifted copy | view (native selection) | P1 | 3 |
| A2.23 | link in the copy | overlay pick → Cmd `obsidian.open` | P6 | 3 |
| A3.1 | section header tap | overlay `section` | P6 | 3 |
| A3.2 | section lift | section-lift gesture | P6 | 3 |
| A3.3-4 | rename section, new section name | naming layer | P6 | 3 |
| A4.1-3 | timeline tap, double click, mark | tap `recognizers/` → overlay / entry / Cmd | P6 | 4 |
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
| A6.1-5,7,9,11-13 | drag moves, targets, cancel, cross ring, tree drop | carry gesture; targets computed from `model.measured` and the core's rules; pinned, `targetChanged` when the replica changes | P3, P4, P6 | 3, 4 |
| A6.6 | auto-scroll at edges | `scroll` `edge`; offsets back to the carry (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| A6.8 | hover a tree row 600 ms → node opens | core carry; the door's answer to `carryAt` applies at once (pinned drop places, `targetChanged` (P6)) | P3, P6 | 4 |
| A6.10 | let go → write, then flight to the real place | the door's answer in the drop's own message (P3) + flight transition | P3, P5 | 1, 3 |
| A6.14 | let go among by-project cards | the door's answer: the landing card at the line, in the drop's own message (P3) | P3 | 1, 3 |
| A6.15 | new drag while a copy flies | `motion` finishes the running flight | P5 | 3 |
| A6.16 | no redraw under a gesture | the carry draws the layout it pinned; a node opened by the held card re-pins it as one whole-region transition (D65) | P5, P6 | 3, 4 |
| A6.17 | iOS lost lift | `input` (new primary finger ends the gesture) | P7 | 3 |
| A6.18 | view closed mid-drag | runtime teardown cancels the layer | P7, P8 | 3 |
| A6.19 | lifted block leaves the timeline stack | selector `stackTasks` without `carry.lifted`; transition | P1, P5 | 4 |
| A7.1-5 | finger swipe, vertical scroll, trackpad swipe, ctrl-wheel, rubber band | ribbon swipe gesture + `recognizers/` | P6, P7 | 4 |
| A7.6 | finger down while the screen runs | a tap leaves the settle running and goes to what it hit | P5, P6 | 4 |
| A7.7 | new swipe during a run | ribbon swipe catches the running transition | P5, P6 | 4 |
| A7.8 | no swipe in other modes / block | selector `hasPages` | P1 | 4 |
| A7.9-14 | wheel tap, quick / slow drag, long press, arrows, cancel | wheel-drag gesture; careful pace `recognizers/` | P6 | 4 |
| A7.15 | leaving Done | update rule on place change | P2 | 4 |
| A7.16-18 | ‹ ›, title → today, repeated taps | day-swipe gesture; each turn drawn from the replica in its own message | P3, P6 | 4 |
| A7.19 | switch day / place with a field open | the field's door calls run first, in message order; the switch is drawn from the replica in the same message; a bar place keeps the field layer | P3, P6 | 4 |
| A8.1-2 | ribbon divider, snap glide | divider gesture; snap transition | P5, P6 | 4 |
| A8.3 | still layouts' divider | divider gesture | P6 | 4 |
| A8.4 | tree divider | tree-divider gesture; lists give way live (transient channel; dispatch on a step) | P6 | 4 |
| A8.5 | fixed halves | view (not draggable) | P1 | 4 |
| A9.1-3,6 | folder button, tree row, dim, cross | Cmd writes (`setProjectsPanel`, `pickProjectNode`, `clearProjectFilter`) | P2, P3 | 4 |
| A9.4 | project lift | tree-lift gesture | P6 | 4 |
| A9.5,8,10-11 | project menu, folder switch, note, delete | overlay `project` (a Preact layer) | P6 | 3 |
| A9.7 | rename project | naming layer | P6 | 3, 4 |
| A9.9 | attach note | `islands` (Obsidian `FuzzySuggestModal`), opened by a typing pick | P6, P7 | 3 |
| A10.1-3 | view button, mode, Subprojects | overlay `view`; Cmd writes after the entry ends [R17] | P2, P3, P6 | 3 |
| A11.1 | undo | door call `history.undo`; motion of what it changed (keyed diff within one context) [R17] | P2, P3, P5 | 1, 3 |
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
| A13.1-14,16,18-19 | field typing, keys, IME, `[[`, line hotkeys, paste, tap away, blur, bar | field layer = the door's `entry.*` session over the replica; `islands`; `input`; `focus` | P3, P6, P7 | 3 |
| A13.15 | bar panels | nested overlay inside the entry (layer stack; data applies at once) | P6 | 3 |
| A13.17 | place tile / date in the bar | field layer + a context change (ribbon / day) after the field's door calls, in message order | P3, P6 | 4 |
| A13.20 | rename via menu (list, timeline, stack) | overlay → entry | P6 | 3, 4 |
| A13.21 | add subtask on a timeline-only task | overlay + entry at once (layer stack; data applies at once) | P6 | 4 |
| A13.22 | hand scroll stops following the field | `scroll` `userScrolled` → entry `follow = false` | P7 | 3 |
| A14.1-10 | full card: close, Escape, Done, circles, subtasks, parent, project, description, bottom row, rename | `model.sheet.full` + sessions (a door session over the replica) + overlay (layer stack; data applies at once) | P3, P6, P7 | 3 |
| A15.1-3 | note block presses, focus, key scope | host block; `focus`; (`keys` driver) | P7 | 3 |
| A15.4-5 | touchmove / touchstart prevented | `input` (synchronous preventDefault) | P7 | 4 |
| A15.6 | focus, visibility, active leaf | `chrome` → `model.visible` | P4 | 3, 4 |
| A15.7 | theme change | `chrome` → `model.theme` | P4 | 3, 4 |
| A15.8 | view resize | `measure` stage size | P4 | 4 |
| A15.9 | keyboard shows / hides | `chrome` → keyboard transition | P4, P5 | 3 |
| A15.10 | Create file | Cmd `createFile` | P2 | 3, 4 |
| A15.11 | settings rows drag | settings-tab host: the row-reorder gesture | P6 | 6 |
| A16.1,3 | one gesture at a time; no start while busy | `interaction.gesture` slot + start table | P6 | 3 |
| A16.2 | hold → drag hand-off | explicit hand-off in the layer table | P6 | 3 |
| A16.4 | swipe settling counts as free; finger releases the claim | a tap leaves the settle running; only a new swipe catches it (`motionInterrupted`) | P5, P6 | 4 |
| A16.5-6 | pointer kinds, sideways vs vertical | `recognizers/` | P7 | 3, 4 |
| A16.7-8 | wheel claim fails, divider claims on down | start table; `input` preventDefault | P6, P7 | 4 |
| A16.9 | pinch hand-off on a second finger | explicit hand-off | P6 | 4 |
| A16.10-11 | grip stops propagation, canvas declines blocks | `input` hit targets | P7 | 3 |
| A16.12 | naming holds the screen | naming layer + keyed field (`rowKey(taskId)` bound by `CreatedTask`, rebound when a replay answers another id) | P1, P6 | 3 |
| A16.13 | project menu refuses while busy | start table | P6 | 3 |
| A16.14 | redraws and tick wait while busy | gone: data applies at once; anything moving draws the layout it pinned when it began | P6 | 3, 4 |
| A16.15 | writes in order, after a closing pick | message order: every door call runs in the message that asks for it; a pick's at the tap | P2, P3 | 1, 3 |
| A16.16 | Escape order | function over the layer stack (layer stack; data applies at once) | P6 | 3 |
| A16.17 | tap order on a card | function over the active gestures | P6 | 3 |

### B. Motions

| Rows | What | Owner in revision 8 | P | Slice |
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
| B2.28 | settings rows step aside | settings-tab host: the step-aside transition (WAAPI) | P5 | 6 |
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
| B3.25 | settings row settles | settings-tab host: the settle transition, then the order from the write | P5 | 6 |
| B3.26 | timeline opening anchor | (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| B3.27-29 | question, search row, name fields scrolled into view | `scroll` reveal | P7 | 3, 4 |

### C. Measurements

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| C1.1-3,6 | stage width, rubber band distance, day track distances | `measure` stage size | P4 | 4 |
| C1.4 | keep hours still when all-day rows differ | computed from the model (all-day rows) and measured heights | P4 | 4 |
| C1.5 | forced reflow for `is-redrawn` | gone | P5 | 3 |
| C1.7 | strip keyframes from computed styles | computed per place (P4); tokens read once | P4 | 4 |
| C1.8 | still-layout widths | selector `layoutWidths` over stage size | P4 | 4 |
| C1.9-14 | rows: room, fade, leaving delay, typing heights, stops | `measure` row heights → selector `stackedLists` | P4 | 3, 4 |
| C1.15 | foot fade left edge | selector | P4 | 3, 4 |
| C1.17 | note block height | `measure` content height | P4 | 3 |
| C1.18-19 | Live Preview end room, note view mutations | host block | P4, P7 | 3 |
| C1.20 | status bar room | `chrome` | P4 | 4 |
| C1.21-22 | tree panel width, tree divider bounds | `measure`; selector | P4 | 4 |
| C1.23 | finger px per wheel place | token read once | P4 | 4 |
| C1.24 | settings rows wrap | settings-tab host: `measure` | P4 | 6 |
| C2.1,6 | scroll edge fades | `scroll` (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| C2.2 | scroll hold room | `scroll` | P7 | 3 |
| C2.3 | FLIP rects | gone (transitions by cause) (keyed diff within one context) | P5 | 3 |
| C2.4 | Motion reads of boxes and styles | `motion` reads what it animates (`motion` reads its boxes in the commit phase) | P7 | 3 |
| C2.5 | bar resting top through transforms | `chrome` + `measure` | P4 | 3 |
| C2.7-8 | by-project / tree scroll reset / keep | `scroll` orders (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| C2.9 | peek over the shown columns, same scroll | view draws the neighbour's layout; scroll copy (`scroll` orders; `measure` reports scroll) | P3, P4 | 4 |
| C3.1-18 | drag hit tests and flight boxes | drop places computed from `model.measured`, `scrolled` and the core's rules; a flight's end box read by `motion` in the commit phase | P4, P7 | 3, 4 |
| C3.19 | settings row rects | settings-tab host: the drop slot computed from measured row heights; boxes read by `motion` in the commit phase | P4, P7 | 6 |
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

| Rows | What | Owner in revision 8 | P | Slice |
|---|---|---|---|---|
| D1.1-4 | the four modes | one layout component per `ViewChoice.layout` | P1 | 3, 4 |
| D1.5-10 | filters and Subprojects row | selectors over `model.read` | P1 | 4 |
| D1.11,13 | kept per device, fallback | core answers in `model.read` | P1 | 3, 4 |
| D1.12 | context drawn still, same-context changes move | P5 (keyed diff within one context) | P5 | 3 |
| D1.14 | one layout at a time; timeline keeps its scroll | layout component; `scroll` keyed (`scroll` orders; `measure` reports scroll) | P1, P7 | 3, 4 |
| D2.1-7 | panel docked / overlay / by carry / kept / top row / tree rows / missing | selectors over `read.funnel.panel`; transitions | P1 | 4 |
| D3.1-6 | note block | host block; same view; selectors; `measure` | P1, P7 | 3 |
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
| D4.14 | day relation | selectors with `model.now` (door selectors, clock from `model.now`) | P1, P3 | 4 |
| D4.15 | calendar dot | selector `sourcesDot` | P1 | 4 |
| D4.16 | theme | `model.theme` | P4 | 3, 4 |
| D5.1-9 | settings that change the screen | `model.settings` / `model.device`; update rules | P1 | 3, 4 |

## Earlier classes against revision 8

Each class left by the runs against revisions 4 to 7 (M1–M23, R1–R16), and each fault at the root named for revisions 6 and 7, was checked against what revision 8 actually says and against the code it relies on, not against its §Resolution table.

| Class | Revision 8 | Why |
|---|---|---|
| R1 a typing pick's focus inside the tap | Resolved | P2: "A user's event is handled to the end inside it: update, render, drivers, focus last." The runtime flushes Preact's `debounceRendering` for a user's event (Architecture). |
| R2 leaving rows against the end-state render | Resolved | P4, Leaving rows: layout selectors skip them; a fold and the heights that depend on it are one transition; a returning key revives its entry. |
| R3 which writes have a patch | Resolved | "A write is visible at once, with its real outcome … There is no preview to compute and no optimistic layer" (P3). |
| R4 a new row's key across its create | Resolved | P1: the `CreatedTask` id is bound to the row key; P3: a replayed create rebinds its row keys to the ids the replay answers. |
| R5 the settings store's echo | Resolved, with R18 | Settings are written as a per-key patch through `PluginSettings.update`, which merges over a fresh read (P3, table). Which writers the runtime's settings part learns from is R18. |
| R6 what a swipe shows while the context changes | Resolved | "Another filter, mode, day or place is drawn from the same replica in the same message" (P3). |
| R7 the guards' scope | Resolved | §Guards, Scope: `uiRules` covers `obsidian/ui/next` from slice 2; the old screen is frozen and exempt until slice 7; the `/* next */` marker splits the CSS. |
| R8 the preview core is `composeCore` | Resolved | No preview core: every call is `callDoor` over one `DoorContext` (P3). The door's phone-host assumptions are now host facts in `DoorContext` (R12 resolved). |
| R9 calls that act on projects-screen state | Resolved, with R20 | Every call runs in message order on one replica (P3). A replay that starts from the snapshot drops the Projects-screen-only calls after the base (R20). |
| R10 a write pick's motion | Resolved | P6: a closing sheet pins the layout under it. The old screen keeps `Picks` until slice 7, so its write picks are unchanged. |
| R11 what a context's read is | Resolved | P3, Calendars: files in the replica, cached first, fresh when they land; a feed's problem is a host fact (`feedProblems`). |
| R12 the door answers as the phone's host | Resolved, with R19 | P3, Facts the door is told about its host: `host` (carry-over only on iOS), `feedProblems`, `projectsReady`; readiness gates the replica on the metadata cache (P3, Readiness). Where `feedProblems` is computed (the refresh rule's silence) is R19. |
| R13 what the runtime persists where | Resolved, with R17 and R18 | P3's table names each part's store, writer and guard: tasks text through `vault.process` with the base checked in `fn` and `createFile` for a missing file; settings as per-key patches through `PluginSettings`; device values routed by `partition`; the Projects screen in device storage; outside settings writers through the runtime's port; `nowMs` per pending call. Checked against `VaultTaskFileStore`, `PluginSettings` and `LocalProjectsScreenStore`: each named API exists and behaves as the table says. The table misses the old screen as a writer of the Projects screen (R17) and of the settings (R18). |
| R14 a replayed create gives the new task another id | Resolved | P3, Outside changes: "A replayed create rebinds its row keys to the ids the replay answers (P1: the row key belongs to the call, not to an id)"; the pending log keeps the row keys each call made. |
| R15 slice 1 changes the old screen | Resolved, with R17 | No facade: "The old screen keeps its own services, untouched, until it is deleted" (Migration), with `Picks`, `Reload` and `WriteQueue` deleted only in slice 7. What the two screens still share outside the file is R17. |
| R16 the core's host-side machines | Resolved for `CalendarPolling`, with R19 | P3: run by the runtime over its ports, unchanged. Checked: `CalendarPolling` takes only ports. `QuickEntrySession` and the refresh rule inside `CalendarServiceImpl` take a service shape and hold their own state (R19). |
| M1 the settings tab | Resolved, with R18 | Its host (slice 6); until then the old tab keeps `SettingsServiceImpl` over the shared `PluginSettings` (R18). |
| M2 the plugin host | Resolved | The runtime (`obsidian/runtime/`) owns the replica, the door calls, persistence, the network and Obsidian's events (P7); hosts own what they start (P8); readiness is a message (P3, P8). |
| M3 chrome both ways | Resolved | The `chrome` driver; body classes only by it (P7). |
| M4 synchronous core reads | Resolved | Door selectors over the replica and `rules.*` called directly (P3); the cross-call cache with budget tests keeps them cheap. |
| M5 the core's sessions | Resolved, with R19 | Door methods over the replica (P7). The job order and the refresh rule are R19. |
| M6 menus | Resolved | Preact layers in the one overlay host. |
| M7 pick timing | Resolved | Three picks; a write pick runs its door call at the tap and its list change shows as the close settles (P6). |
| M8 one interaction | Resolved | The layer stack and one pointer gesture, a statechart (P6). |
| M9 motion by cause | Resolved | P5: keyed diff within a context, whole-region transitions across. |
| M10 leaving rows, closing overlays | Resolved | P4's leaving rows; a closing sheet pins the layout under it (P6). |
| M11 heights held during motion | Resolved | P4: the fold and the heights that depend on it are one transition. |
| M12 continuous values | Resolved | The transient channel (P5); `carryAt` on a target change (P3, Cost). |
| M13 positions as geometry | Resolved | `motion` reads the boxes it animates in the commit phase (P4, Drivers). |
| M14 scroll | Resolved | `measure` and `scroll` (Drivers). |
| M15 swipe settle | Resolved | P6: a tap during a swipe's settle does not stop it. |
| M16 unbounded waits | Resolved | P2: every wait the user sees has a bound, a message; replays are bounded at two (P3). |
| M17 the device and settings stores | Resolved, with R18 | Device values through `PluginSettings.partition` into device storage; synced settings as per-key patches (P3). What the runtime learns from the old writers is R18. |
| M18 the network lane | Resolved, with R19 | Latest per day, a superseded fetch abandoned (P3); `feedProblems` a host fact. The refresh rule is R19. |
| M19 cross-screen renames | Resolved, with R17 | One replica for every new screen. Between the old leaf and the new block, ids are two lineages (R17). |
| M20 gesture recognition | Resolved | `recognizers/`, pure. |
| M21 all service callers | Resolved, with R17 | New screens call only the runtime; the old screen keeps its services until slice 7 (Resolution, Migration). What they share outside the file is R17. |
| M22 a dropped card before its read | Resolved | The door gives the drop's real outcome in the drop's own message (P3); the gesture's pinned layout moves to it when the flight ends (P6). |
| M23 key scopes | Resolved | The `keys` driver. |
| Root 6a reads that write | Resolved | P3, Tidy: `tasks.normalize` once per base or day change, before any view, persisted; views memoised by (replica, minute). Checked: the door has `normalize` (`PhoneCalls.ts:544`, `306-309`). |
| Root 6b preview ids | Resolved, with R17 | One replica, one id lineage, rebound on replay. During the migration the old services keep a second lineage (R17). |
| Root 6c transactions | Resolved | Gone: views are synchronous selectors over the replica (P3). |
| Root 6d the gesture snapshot against D65 and D84 | Resolved | P6: re-pin on the gesture's own context change; a drop resolves against model anchors. |
| Root 6e lifecycle | Resolved | P8; `hostLifecycle.test.ts`. |
| Root 7a settings persistence | Resolved, with R18 | Per-key patches through `PluginSettings.update`; device keys by `partition`; outside writers through the runtime (P3). The old screen and old tab as writers are R18. |
| Root 7b the pending log | Resolved, with R20 | Snapshot of every part, `nowMs` per call, row keys rebound, two-replay bound, a missing file (P3). Calls that change only the Projects screen are outside the log (R20). |
| Root 7c per-call cost | Resolved | The cross-call cache keyed by (text, settings reading, today), budget tests under 1 ms warm, `carryAt` on a target change (P3, Cost). Checked: each door call today builds `TaskRules` and `TaskIdentity` anew (`PhoneCalls.ts:236-247`), so the cache is the change that makes the budget reachable; it is `backend`'s slice 1. |

All 16 of R1–R16, all 23 of M1–M23 and all 8 faults at the root are resolved by revision 8's text; 0 are not. 15 of them leave a remainder that a new class carries (R5, R9, R12, R13, R15, R16, M1, M5, M17, M18, M19, M21, Root 6b, Root 7a, Root 7b). The remainders come from checking the migration and the host-run core classes in code, not from the principles.

## Rows that do not fit

Each item names a class, not a row, and proposes the principle or mechanism the spec must state so the whole class is owned. A row can be in more than one item. "Too vague" is used only where an implementer would have to guess something that changes behaviour or correctness.

### No mechanism owns it

None. Every row has an owner in revision 8: the door covers every core method the UI calls (`DOOR_COVERAGE`), and the rest is the runtime's, a host's or a driver's.

### The principles would change what the user sees

#### R17. The old leaf and the new block hold two copies of the plugin's in-memory core state

**Rows (26):** A.2.528, B.1.36-37, B.1.40, B.1.114-115, B.1.137, B.2.144, B.2.161, B.2.224-225, B.2.227-228, B.4.64-65, B.4.73-74, B.6.1, B.6.56, B.6.60, B.6.96, B.6.106, A10.1-3, A11.1

The migration: "The old screen keeps its own services, untouched … The two write the same file safely: each sees the other's writes as outside changes, and both rebase." Checked in code, the file is safe: `TaskServiceImpl.mutate` applies its operation to the current text inside `vault.process` (`TaskServiceImpl.ts:694-716`), `UndoHistory.step` takes a step back over the file as it is now (`UndoHistory.ts:46-58`), and the runtime's `fn` returns the text unchanged and replays when the base moved. No write is lost.

But today the leaf and every note block share one `composeCore` (`compose.ts:61-73`, `ProjectBlocks` gets the same `deps`, `main.ts:63-65`), so they share three things that are not in the file. From slice 3 (★, `newBlock` on) to slice 5, the new block has the runtime's copy and the old leaf has the services':

- **Undo.** One `UndoHistory` today: Cmd+Z in a block (`ProjectBlocks.ts:35-36`) and the leaf's undo button take back the last change Max made anywhere ("Любое действие отменяется кнопкой отмены", `docs/plugin/README.md:38`). With two histories, the leaf's undo skips what Max just did in a block and takes back an older leaf step, and the block's Cmd+Z skips the leaf's.
- **Ids.** One `TaskIdentity` today: a write carries its tasks' ids to their new lines (`TaskIdentity.wrote`). Two lineages see each other's writes as outside text, which keeps an id only for a line left or edited in place (`TaskIdentity.matched`). A card moved or nested in the block gets a new id in the leaf: its card in the leaf fades out and in instead of moving, and a leaf menu or full card open on it fails as stale. The same happens the other way. That is the D86 class, on both screens, every time Max works in a note beside the leaf.
- **The Projects screen state.** One `LocalProjectsScreenStore` today, read once when built and written whole on every change (`LocalProjectsScreenStore.ts:16-26`). `noteView` and `subprojects` are shared by the screen and the blocks (`contracts.ts:757-760`). With two holders, Subprojects toggled in a block does not reach the leaf, and each holder's next write overwrites the other's fields in device storage, so after a restart one screen's choice is gone. The place hand-over (`main.ts:104-110`) writes through the old service, so the runtime does not see it.

The old screen does not "stay exactly as it is" (§Migration), and the table of the replica's parts lists no outside writer for the Projects screen.

**Fix (P3, migration):** while both screens run, the runtime holds the one copy of the three process-local parts, and the old services are built over it, unchanged:
- `composeCore`'s `projectsScreen` port is the runtime's part (a `ProjectsScreenStore` whose `set` is a runtime message);
- `TaskIdentity` and `UndoHistory` are built over the runtime's id and history state (`backend`: each adopts and hands back its plain-data state, `TaskIdState` and `UndoState`, which the door already uses).

The old services keep their code and their rules; only the place their state lives moves. Runtime tests cover a write in the block followed by undo in the leaf, a move in the block seen by the leaf with the same id, and Subprojects toggled in one and read in the other.

### Two principles conflict

#### R19. Core classes "run unchanged" against door sessions over the replica

**Rows (21):** A.2.98, B.1.35, B.1.44-47, B.1.52, B.2.1-3, B.2.20-24, B.4.110, B.6.6-7, B.6.13, B.6.21, B.6.98

P3: "Core classes the door leaves to the host (the quick entry's job order, the calendars' refresh rule, `CalendarPolling`) are run by the runtime over its ports, unchanged." P7: "The core's sessions (`entry.*`, …) are door methods over the replica." P3 also says the calendars' files sit in the replica and a door call runs inside its message. Checked in code, only `CalendarPolling` can be run unchanged (`CalendarPolling.ts:3-27`: refresh, interval, hidden, now and timers are ports the runtime can give). The other two cannot:

- **`QuickEntrySession`** builds its own `QuickEntry` over a `TaskService`-shaped port (`QuickEntryTasks`: `createWithId`, `createSection`, `edit`, all promises). It waits on `QuickEntryView.fresh()` before each job and runs jobs on an async `WriteLine` (`QuickEntrySession.ts:10-49`). Run unchanged, the field's session lives in that object rather than in the door's `entry.*` session (P7), the runtime must offer the service shape §Migration says no longer exists, and every job's door call runs after an `await`, outside the message that asked for it (P3).
- **The refresh rule** is the body of `CalendarServiceImpl.events` (`:60-65`): a cached peek, a background refresh, a forced one, and the 15 s silence (`answerWithin`, `:155-164`). It keeps its own `lastRead`, `fileProblems` and `feedProblems`. Run unchanged, the calendars' texts and problems are held twice, in that service and in the replica (and in `feedProblems` handed to the door), and they can disagree.

Read one way, an implementer writes adapters that the principles forbid. Read the other way, they rewrite the job order and the refresh rule in the runtime, which P3 forbids.

**Fix (P3 with P7):** a core class the door leaves to the host runs over door calls, never over a service shape. `backend`, in slice 1, gives each of the two a form over the door's answers:
- the job order as a step function over `EntryAnswer` (which job runs next, and when `shown`, `unshown` and `done` are due) that the runtime calls inside its messages;
- the refresh rule as a pure decision (refresh or not, forced or not, failed after silence) from the reason, the cache and the feed's last answer, which the network lane calls.

`CalendarPolling` stays as it is. The Swift app can then take the same two instead of keeping its own.

### Too vague to build without guessing

#### R18. What the runtime's settings learn from writers outside its port

**Rows (71):** A.2.496-500, B.1.54, B.1.72, B.1.120, B.2.136-141, B.2.171-223, B.6.3, B.6.47-49

P3's table of the replica's parts lists the outside writers of the synced settings as the Google token, the place hand-over and the calendars' migration, routed through "the runtime's settings port, so the replica sees them", and no outside writer of the device values. Until slice 6 the old settings tab writes every setting through `SettingsServiceImpl` (`main.ts:85`), and until slice 5 the old leaf writes the list share, zoom and tree width through `ViewSettingsStore` (B.1.54, B.1.72, B.1.120). Neither goes through the runtime's port.

Checked: both go through the plugin's one `PluginSettings` (`main.ts:36-45`), which merges a patch over a fresh read and emits on every write and on a changed reload (`PluginSettings.ts:72-105`). So no setting is lost. But the spec does not say that the runtime reads its settings part from that instance. An implementer who keeps the runtime's settings as the text it last handed in gets:
- the new block drawn with old priorities or labels after a change in the old tab;
- the runtime and the old service tidying the file under two readings (a changed day start), each seeing the other's tidy as an outside change and tidying again.

**Fix (P3):** the runtime's settings part is `PluginSettings.get()`. Every `PluginSettings.onChange` is a message that replaces it, so the old tab, the old leaf, Sync and the runtime's own patches are seen alike, and the per-key patch compares against that part. The table lists the old screen and the old settings tab as outside writers until slices 5 and 6.

#### R20. A replay from the snapshot rolls back calls that are not in the log

**Rows (19):** B.1.17-18, B.1.60, B.1.77, B.1.91, B.1.113-115, B.1.121, B.3.6-7, B.3.10, B.3.96, B.3.102, B.4.64-65, B.4.151-152, B.4.162

P3's pending log keeps "each call that changed the tasks text and is not yet persisted", starts "from a snapshot of every part of the replica at the base (text, history, ids, projects screen)", and on an outside change is "replayed through the door from the snapshot". Checked in the door: `selectProjectNode`, `pickProjectNode`, `setFunnelPlace`, `setProjectsPanel`, `setViewMode`, `setNoteViewMode`, `toggleSubprojects`, `clearProjectFilter`, `startCarry`, `carryAt`, `endCarry` and `endProjectName` change only `projectsScreen` (`keepProjectsScreen`, `PhoneCalls.ts:452-474`; `keepScreen` in `TaskServiceImpl.ts:170-258`), so they are not in the log. A replay that starts from the snapshot's Projects screen and re-runs only the text-changing calls undoes each of them that came after the base. A node Max picked, a branch he folded, the place he swiped to, or a carry under his finger is lost when Sync or, during the migration, the old leaf writes while one of his writes is still pending.

An implementer has to guess whether the Projects screen is rolled back.

**Fix (P3):** the log keeps every call since the base that changed any part the snapshot holds, not only the tasks text, each with its `nowMs`, and the replay re-runs all of them in order. A call that changed only the Projects screen and now fails is dropped like any other. The replay test adds a pending write, then a node pick and a carry step, then Sync.

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
| The principles would change what the user sees | 1 (R17) | 26 |
| Two principles conflict | 1 (R19) | 21 |
| Too vague to build without guessing | 2 (R18, R20) | 90 |
| **Any category (a row counted once)** | **4** | **133** |
| Rows that fit as mapped | | 1899 |

Against revision 4: 23 classes and 688 rows did not fit. Against revision 5: 7 classes and 219 rows. Against revision 6: 4 classes and 155 rows. Against revision 7: 5 classes and 158 rows. Against revision 8: 4 classes and 133 rows (R17 26, R18 71, R19 21, R20 19); the two facts of A.1 tagged with them (38, 44) are not counted as rows.
