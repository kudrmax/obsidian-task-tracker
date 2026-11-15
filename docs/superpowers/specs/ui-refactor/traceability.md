# UI refactor: traceability

This file maps every row of the two inventories to the mechanism of `../2026-11-15-ui-refactor.md` (**revision 7**) that owns it, the principle behind it and the slice that rebuilds it.

Inputs:
- `inventory-state-effects.md`: A.1 (45 facts), A.2 (565 locations), B.1–B.5 (819 effect call sites), B.6 (180 event sources);
- `inventory-behaviour.md`: A (203 inputs), B (84 motions), C (84 measurements), D (52 screen states).

Doubts were checked in code at `2dab36e5`:
- `core/application`: `PhoneCalls.ts` (the door), `composeCore.ts`, `TaskServiceImpl.ts`, `CalendarServiceImpl.ts`, `calendarDay.ts`, `UndoHistory.ts`, `TaskIdentity.ts`, `TaskRules.ts`, `QuickEntrySession.ts`, `SettingsServiceImpl.ts`, `contracts.ts`;
- `obsidian/`: `main.ts`, `compose.ts`, `infrastructure/` (`VaultTaskFileStore`, `PluginSettings`, `LocalProjectsScreenStore`, `VaultProjects`, `GoogleAuth`), `ui/` (`CalendarScreen`, `DayData`, `Reload`, `kit/Panel`).

**How this rerun was made.** Every row was re-examined against revision 7, not only the 155 rows left over from revision 6.
- Owners were rewritten in revision 7's words:
  - the door's answer over the one replica, in the message that asks for it;
  - message order and the persistence queue, instead of the file sequence;
  - selectors over the replica, instead of reads, neighbours read ahead and transactions;
  - door sessions (`entry.*`, the carry, `sectionName`, `repeatPage`, `description`);
  - settings in the replica, and the device's values as model state;
  - "anything moving pins the layout under it", the closing sheet included.
- Principles keep their numbers, and P8 (everything alive has an owner) is added: to every event source of B.6, and to every row about a listener, observer, subscription, timer, mount or teardown.
- Slices follow revision 7: the door, the replica and the runtime are slice 1; slice 2 holds the guards only. Rows revision 6 put in slice 2 for the preview core are now in slice 1.
- R8–R11, R1–R7, M1–M23 and the five faults at the root of revision 6 were checked against revision 7's own text and the code it relies on (§Earlier classes against revision 7).
- New classes are numbered on from R12. Their rows carry `[R#]` in the owner column and are gathered in **Rows that do not fit**.

The script checked that every row id appears exactly once in the mapping tables. It found 0 rows unmapped and 0 mapped twice.

## The door against what the plugin calls

Revision 7 rests on one claim: the door covers every core call the plugin makes. It was checked three ways.

**Every service method by name.** All methods of `TaskService` (128), `DayService` (8), `UndoService` (5), `CalendarService` (6), `SettingsService` (31) and `ScreenSettingsStore` (2) were listed from `contracts.ts`. Each is either in the door's `SPACES` or in a `HOST_*` list (`DOOR_COVERAGE`, `PhoneCalls.ts:1076`); `tests/application/PhoneCalls.test.ts` keeps it so. What the plugin's UI calls that the door leaves to the host:

| Method | Called from | Who does it in revision 7 |
|---|---|---|
| `TaskService.onChange` | `CalendarScreen.ts:445`, `ProjectBlocks.ts:104` | the runtime's outside-change handling; the facade's emits (R15) |
| `UndoService.onChange` | `BottomCapsule.ts:33` | a selector over the replica's history; the facade's emits (R15) |
| `CalendarService.onChange`, `keepFresh` | `CalendarScreen.ts:449, 477` | the runtime's file watch and the network lane; the polling rule is the core's (R16) |
| `DayService.onDayChange`, `catchUp` | `CalendarScreen.ts:451, 504` | the runtime's clock |
| `ScreenSettingsStore.onChange` | `viewSettings.ts:117` | settings in the replica |
| `SettingsService.bindClientSecret` | `SettingsTab.ts` | the settings-tab host |
| `GoogleAccount`, `WorkCalendarSetup` | `SettingsTab.ts` | host-owned (`DOOR_COVERAGE`); the token they write is R13 |

**The classes the UI imports from `contracts.ts`.** `QuickEntrySession`, `SectionNameEntry`, `RepeatPage`, `DescriptionDraft` and `DayBoundary`, and the pure rules. The door answers the sessions as `entry.*`, `sectionName.end`, `repeatPage.end`, `description.*` and `boundary.*`, and every rule the UI calls as `rules.*`. `QuickEntrySession`'s job runner is not a door method (R16).

**The same answers.** The door runs the same `TaskReads`, `TaskWrites` and `UndoSteps` as the services, over the context handed in. Differences found:
- three places where the door answers as the phone's host: the calendar carry-over, a feed's problem, the project notes' readiness (R12);
- shapes: events in milliseconds, `days.boundary` as `{startHour}`, `calendars.isPast` taking `{endMs}`, the entry as `EntryAnswer` (R15).

**Timing the runtime must reproduce for the old screen** (slice 1):
- `TaskService.onChange` fires on our own writes, on outside changes, synchronously on every Projects-screen change, on settings that change how the file reads, and on the project notes;
- `Picks` runs a pick's action after the fade;
- `QuickEntrySession` writes a job only once the lists show the writes before it;
- the service drops a left carry when built.

All four are R15.

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
- the **pending calls** since the last persisted base, replayed over an outside change;
- the **persistence queue** with compare-and-set;
- the network lane;
- Obsidian's events;
- the action log;
- `TaskServiceFacade` for the old screen (slices 1–7).

**Interaction (P6):**
- **Layers:** select mode, field (entry, rename, naming), menu (task, bulk, section, project, event, view, ⋯, sources, search), the full card.
- **Gestures:** carry (a card, subtasks, the plus, the picked cards; the door's carry methods), section lift, tree lift, timeline hold, select, resize and new slot, ribbon swipe, day swipe, wheel drag, pinch, divider, tree divider.
- Each layer and gesture pins its entities and gets `targetChanged` / `targetGone`. Anything moving (a pointer gesture, a closing sheet, a sliding region) also pins the layout under it and draws it while it moves.

**Commands (P2):**
- door calls (`write`, `carry`, `carryAt`, `undo`) run in the message; their texts go to the persistence queue;
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
- 1: the runtime and the facade under the old screen: the replica, door calls, persistence, replay, the network lane, and the core's part (tidy as an answer, the parsed-document cache).
- 2: the guards, the freeze, the lifecycle test, the e2e harness.
- 3: the note block. Lists, cards, the field, carry inside the block, menus and the full card: the shared parts the leaf reuses.
- 4: the leaf behind `newScreen`. The timeline, the ribbon, both swipes, the panel and tree, the carry across all of them, select mode, search, the day.
- 5: the switch (no rows of its own).
- 6: the settings tab.
- 7: deletion: the old screen, the facade, the async services.

"3, 4" means built for the block and then mounted in the leaf. "Gone" means the new code makes the state unnecessary; it is deleted with the old code in slice 7 if not earlier.

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
| 11 | The day's calendar events | `model.events[day]` (keyed by day: a selector over the replica's calendar texts, cached first, fresh when the network lane lands). The parsed-document cache stays in the core. [R12] | P1, P3 | 1 |
| 12 | The sources' alert | Selector `sourcesDot(model.events[model.day])`. [R12] | P1 | 4 |
| 13 | Extra all-day rows | Selector `allDayExtraRows(model.events[day])`; a neighbour day uses the same selector. | P1, P3 | 4 |
| 14 | The timeline card selected | `model.timeline.selected: TaskKey or null`. | P1, P6 | 4 |
| 15 | List cards picked | `model.selection = {mode, picked: TaskKey[], anchor}`; count and button state are selectors. | P1 | 4 |
| 16 | A drag holds the screen | `model.interaction.gesture` (the one gesture slot); `isDragging` is a selector. | P6 | 4 |
| 17 | A carry to a project is under way | carry gesture `carry.reportsToCore` (the door's carry methods over the replica). | P3, P6, P7 | 3 |
| 18 | The card a drop is landing on | The drop is a door call in its own message (`tasks.drop` over the replica, with the carry in `projectsScreen`): its outcome, the cards' new places and keys, is in the replica at once; its text goes to the persistence queue. | P3 | 1, 3 |
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
| 38 | Whether undo is possible | `model.canUndo` (from `UndoService.onChange`). | P1 | 1 |
| 39 | The settings the screen draws | `model.settings` (`ScreenSettings` answer) and `model.device` (device view settings). Body tokens per window come from `chrome` (`chrome` takes it from the model). | P1 | 3, 4 |
| 40 | Phone or desktop | `model.platform.wide` from `chrome`. | P4 | 3, 4 |
| 41 | Obsidian's status bar over the view | `model.chrome.statusBar` from `chrome`. | P4 | 4 |
| 42 | Popout windows that get the styles | Plugin runtime's window set (host), fed to `chrome`; not a screen fact. | P7, P8 | 1 |
| 43 | Which note a block shows | `model.place = {kind: "block", note, project}`; the blocks map is host-level. | P1 | 3 |
| 44 | Writes waiting to run | The runtime's one replica; a door call runs in the message that asks for it, and the persistence queue writes its texts in that order. [R13] | P3 | 1 |
| 45 | Who holds the screen | `model.interaction.gesture` (one slot); pointer captures are `input`-local. | P6 | 3, 4 |

## A.2 State locations (565)

Row ids number the rows of each domain table of `inventory-state-effects.md` in file order, A.2.1 to A.2.565.

### day/clock

| Rows | What | Owner in revision 7 | P | Slice |
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

| Rows | What | Owner in revision 7 | P | Slice |
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

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A.2.47 | `CS.drawnRead` | first read emits no transition (`model.read` was null) | P5 | 4 |
| A.2.48,53 | missing box, `DayData.state.missing` | `model.read.missing`; JSX [R13] | P1 | 3, 4 |
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
| A.2.92,94-95 | `KeyedRows.rows/drawing/order` | gone: Preact keyed rows; focused field kept by key (`rowKey(taskId)` bound by `CreatedTask`) | P1, P5, P7 | 3 |
| A.2.93 | `KeyedRows.leaving` | leaving rows: skipped by layout selectors; fold and dependent heights one transition; a returning key revives the entry (P4) | P4, P5 | 3 |
| A.2.96-97 | prototype `KeyedList` | replaced by `next/` | — | 7 |

### events

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A.2.98 | `CS.poll` | effect runner: `keepFresh` on the network lane, `model.visible` [R16] | P2 | 1 |
| A.2.99-100 | `DayData.dayEvents`, `state.calendars` | `model.events[day]`, `read.calendars` [R12] | P1 | 4 |
| A.2.101 | `DayData.around` | network-lane request parameter (network lane, latest per day) | P2 | 1 |
| A.2.102 | `DayPeek.events` | `model.events[day]` for the incoming day, a selector over the replica's calendar texts (P3) [R12] | P1, P3 | 4 |
| A.2.103-104 | wheel dots | selector `sourcesDot` [R12] | P1 | 4 |
| A.2.105-106,109 | `Timeline.events`, event block placement | selector `timedEvents` (`layoutEvents`) + `motion` variables | P1, P7 | 4 |
| A.2.107 | event colours | selector `paintEvent(model.theme)` → `motion` variables | P1, P7 | 4 |
| A.2.108 | `is-past` | selector over `model.now` (door selectors, clock from `model.now`) | P1, P3 | 4 |

### selection

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A.2.110,116-119 | `BulkController.selection`, `TaskSelection.*` | `model.selection {picked, anchor}`; element maps gone | P1 | 4 |
| A.2.111-112 | count / ⋯ buttons | selectors | P1 | 4 |
| A.2.113-114 | `selecting`, `is-selecting` | `model.selection.mode` (select-mode layer) | P6 | 4 |
| A.2.115 | bulk menu `items` closure | `overlay.bulk.keys` remapped by write answers | P1 | 4 |
| A.2.120-121 | `is-selected`, `.tc-pick` | JSX | P1 | 4 |
| A.2.122-124 | `Timeline.selected`, ring, grips | `model.timeline.selected`; grips via `motion` variables | P1, P6 | 4 |

### carry/drag

| Rows | What | Owner in revision 7 | P | Slice |
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

| Rows | What | Owner in revision 7 | P | Slice |
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

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A.2.254-255 | `CS.hourPx`, `CS.wholeDay` | `model.zoom {hourPx, wholeDay}` | P1 | 4 |
| A.2.256,261 | `zoomFrame`, `PinchZoom.scaled` | transient channel; dispatch on a step | P4, P8 | 4 |
| A.2.257-260,262-263 | pinch pointers, wheel timer, anchor, limits, capture | pinch gesture + `recognizers/`; wheel settle timer command | P6, P7, P8 | 4 |
| A.2.264-265 | `Timeline.minor/grid` | selector `gridAt(hourPx)` (transient channel; dispatch on a step) | P1 | 4 |
| A.2.266-267 | `hourShown`, `--tc-hour` | `motion` variable | P7 | 4 |

### scroll

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A.2.268 | `CS.scrolledFor` | gone: update emits a scroll order on a day change | P2 | 4 |
| A.2.269-270,283 | timeline / day list / peek scroll positions | `scroll`-local, keyed scroller ids (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| A.2.271-276 | `QEC.follow/revealedAt/revealing/handScrolledAt/watchedScroller`, scrollTop | field layer (core `QuickEntrySession`) `follow`; `scroll` `reveal` orders; `userScrolled` ends follow | P6, P7 | 3 |
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

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A.2.303,353-356 | `activeEditor`, `EmbeddedEditor` state, CodeMirror doc | `islands` | P7 | 3 |
| A.2.304 | `WriteQueue.tail` | message order on the replica; the persistence queue | P2, P3 | 1 |
| A.2.305 | `QEC.state` | `model.entry` (the door's `EntryAnswer`) | P1, P3, P7 | 3 |
| A.2.306,329 | `QEC.field`, `quiet` | `islands` (editor handle; owner set text is not input) | P7 | 3 |
| A.2.307,339,479 | `QEC.focused`, group name focus, field focus | `focus` | P7 | 3 |
| A.2.308 | `QEC.turning` | field layer (core `QuickEntrySession`) flag while the bar turns the wheel | P6, P7 | 4 |
| A.2.309 | `QEC.draws` | gone: the view is drawn in the message (P3) | P2, P3 | 3 |
| A.2.310,340 | `pressEnding`, `FreeRoomDoubleClick.mouse` | `recognizers/` | P7 | 3 |
| A.2.311,313-314,316-317,319-325,327-328,330-331 | bar and field look (`is-entering`, bar state, buttons, tint, placeholder, plus hidden) | selectors over `model.entry` → JSX | P1 | 3 |
| A.2.315,326 | `QuickBar.leaving`, pointer-events while fading | presence transition: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6 | 4 |
| A.2.318 | bar `is-gliding` | keyboard transition | P5 | 3 |
| A.2.312 | field element parent | view: row by key; field island mounted in it | P1, P7 | 3 |
| A.2.332-336 | `EntryRows.*` | `model.entry` + `model.rowKeys` (`rowKey(taskId)` bound by `CreatedTask`) [R14] | P1, P2 | 3 |
| A.2.337-338,352 | `RenamedTexts` | one plugin-wide replica; the door's answer applied at once (P3) | P3 | 1, 3 |
| A.2.341-343 | `TaskMenu.stackRow/fieldRow/fieldClosed` | overlay + field and entry layers (stack spot) (layer stack; data applies at once) | P6 | 3 |
| A.2.344-346 | `FullScreen.editing/draft/saveTimer` | `islands` + `sheet.full.description` (door session) + debounce timer command | P3, P7, P8 | 3 |
| A.2.347-351 | `FullScreen.state/field/focused/titleField/leavingTitle` | `sheet.full.entry` (a second core entry session); `focus` | P1 | 3 |
| A.2.357 | `markdown-rendered` | `islands` | P7 | 3 |
| A.2.358 | tree `askProjectName` slot | naming layer `{kind: newProject, gap, depth}` | P6 | 4 |
| A.2.359-361 | `Timeline.field`, `is-renaming`, field box | selector over `model.entry` in the timeline; `motion` variables | P1, P7 | 4 |
| A.2.362-363 | `TaskList.slot`, card `is-renaming` | naming layer; JSX | P1, P6 | 3 |

### menus/overlays/full/search

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A.2.364,373 | `CS.search`, `BulkController.menu` | `model.overlay` stack entries | P6 | 4 |
| A.2.365,422-426 | `CS.full`, `FullScreen.stack/reading/closed/Escape/is-shown` | `model.sheet.full`; its levels selectors over the replica; Escape order function; presence: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P3, P6 | 4 |
| A.2.366,377 | menu `current`, `TaskMenu.context` | `overlay.task.key` remapped by write answers | P1 | 3 |
| A.2.367 | `QEC.stack` | overlay + entry (stack spot) (layer stack; data applies at once) | P6 | 3 |
| A.2.368-372 | bar panel state | field layer (core `QuickEntrySession`) `panel {kind, page}` (nested overlay); side from `measure` | P4, P6, P7 | 3 |
| A.2.374-376 | `FoundCard` | `model.found {key, scrollPending}`; `scroll` reveal | P1 | 4 |
| A.2.378-392 | `TaskMenu` parts, pages, asking, labelling, Enter, double-press, classes | menu layer `{kind: task, key, page, asking, labelling}`; parts are view (a Preact layer); boxes via `measure` (`motion` reads its boxes in the commit phase) | P1, P6 | 3 |
| A.2.393-403 | `LiftedMenu.gone`, `Overlay.*` | overlay `phase`; presence: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6); Escape order over the stack (layer stack; data applies at once) | P5, P6 | 3 |
| A.2.404-407 | `Picks.*`, `giveUp` | write pick: its door call at the tap; the closing sheet pins the layout under it, and the list's change moves when the close settles [R15] | P2, P3, P6 | 1, 3 |
| A.2.408-412 | `Panel.shown`, `PanelPages`, `MORPHS` | overlay `page`; page morph transition (B1.14) (a Preact layer) | P5 | 3 |
| A.2.413 | switch knob flipped before the write | the door's answer over the replica, at once (P3) | P3 | 1, 3 |
| A.2.414 | menu tiles | JSX from the core menu model | P1 | 3 |
| A.2.415-421 | `BulkMenu`, project menu asking, `DescriptionPeek` placement | menu layer; peek side from `measure` | P4, P6 | 4 |
| A.2.427-430 | `SearchWindow.rows/picked/asked/closed` | `overlay.search {query, answer, picked}`; door call `tasks.search` in the message, memoised by query | P2, P3, P6 | 4 |

### layout sizes

| Rows | What | Owner in revision 7 | P | Slice |
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

| Rows | What | Owner in revision 7 | P | Slice |
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

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A.2.495 | `CS.seen` | update compares `model.settings` before / after (settingsEffect as an update rule) | P1 | 4 |
| A.2.496-497 | plugin settings in memory, `rightMode` | plugin runtime (`obsidian/runtime/`, `main.ts`): plugin settings held by the runtime; the `rightMode` hand-over is a host call, its door call persisted by the queue [R13] | P3, P7 | 1 |
| A.2.498-500 | view settings stores | `model.device`; the device store only keeps it (P1) [R13] | P2, P7 | 1 |
| A.2.501-502,509-512 | Settings tab page, colour preview, row reorder | settings-tab host: page and preview from its model; the row reorder is a declared transition | P1, P5 | 6 |
| A.2.503-508 | card size and priority colour body tokens | `chrome` per window from settings (`chrome` takes it from the model) | P7 | 3, 4 |
| A.2.513-516 | repeat page / editor | overlay page `repeat` (core `RepeatPage`) | P6, P7 | 3 |

### note blocks

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A.2.517,519-523 | `ViewWatch.frame`, block registry, `asks` | host (block host); `asks` go: `projectNoteView` a selector over the replica | P2, P3, P7, P8 | 3 |
| A.2.518 | block key scope | `keys` driver (Obsidian `Scope`s) | P7 | 3 |
| A.2.524 | block position, `--tc-block-lift` | host block placement; lift from `measure` | P4, P7 | 3 |
| A.2.525 | focus in block | `focus` | P7 | 3 |
| A.2.526-527 | `BlockHeight` | `measure` (content height) → `motion` variable | P4 | 3 |

### undo

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A.2.528 | undo button off | `model.canUndo` | P1 | 3, 4 |

### other

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A.2.529,538 | teardown list, tab's screen | runtime / host mount | P7, P8 | 1 |
| A.2.530 | `CS.changing` | message order on the replica; the persistence queue | P2, P3 | 1 |
| A.2.531 | arbiter claim `naming` | naming layer | P6 | 3 |
| A.2.532 | `services` for console | plugin runtime (`obsidian/runtime/`) | P7 | 1 |
| A.2.533 | `DayData.shown` | gone: notification by selector equality | P2 | 4 |
| A.2.534-536 | `Reload` state | a write's answer in the replica in the same message (P3); `rowKey(taskId)` bound by `CreatedTask` [R14] [R15] | P1, P2, P3 | 1 |
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

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| B.1.1-4,6-8,10-13,16,60-61,66,73,75-79,82-83,85,87,89-91,95-104,107,113-115,118-119,121,123 | task writes (`act`) | door call in message order; its answer in the replica at once; `staleTask` → notice; texts to the persistence queue [R13] | P2, P3 | 1 |
| B.1.17-18 | `startCarry`, `endCarry` | door carry calls (`startCarry`, `endCarry`) in message order over the replica | P2, P3, P7 | 1 |
| B.1.5,9,14-15,19-20,22-26,28-30,53,55-56,93,122 | synchronous service reads (`bulkMenu`, `carried`, `snap`, `stretch`, `firstPlace`, `relation`, `today`, `boundary`, `shownSpan`, `isPast`, `dropSpan`, `newSlot`, `findIn`, `listName`, `stepFunnel`, `columnSections`, `menu`, `openAt`) | door selectors and `rules.*` (clock from `model.now`) [R15] | P3, P7 | 1 |
| B.1.27,34,39,63,81,84,92,94 | event, sources, more, search, section, project menus; full card; task menu | `model.overlay` / `model.sheet` (a Preact layer) | P6 | 4 |
| B.1.31 | quick entry shows the day it wrote to | Msg `entryShowsDay` → `model.day` ; its view a selector over the replica | P2, P3 | 3 |
| B.1.32,38,48,50,71 | rereads (fresh, after undo, load, day passed, after failure) | a selector over the replica (the door's view, memoised) | P2, P3 | 1 |
| B.1.33,57 | wheel turned, swipe landed on a place | ribbon / wheel gesture → Cmd `setFunnelPlace` | P6 | 4 |
| B.1.35,44-47,52 | calendar poll and refresh | network lane (network lane, latest per day) [R12] [R16] | P2 | 1 |
| B.1.36 | undo / redo | door call `history.undo` in message order; `canUndo` from the replica's history | P2, P3 | 1 |
| B.1.37,69-70 | notices | Cmd `notice` | P2 | 1 |
| B.1.40-43 | service subscriptions | runtime inputs → `fileChanged`, `calendarsChanged`, `settingsChanged`, `dayChanged` [R15] | P2, P8 | 1 |
| B.1.49 | `Timeline.tickNow` | `tick` → `model.now` (applies at once (P6)) | P6 | 1 |
| B.1.51 | select today on day moved | update rule on `dayChanged` | P2 | 4 |
| B.1.54,72,120 | view settings writes (`listShare`, `zoom`, `treeWidth`) | Cmd `device.set`: the device store only keeps `model.device` (P1) [R13] | P2, P3 | 1 |
| B.1.21,58-59 | day step, day swipe landed, day turn | day-swipe gesture; the new day's view a selector over the replica | P3, P6 | 4 |
| B.1.62 | haptics | Cmd `haptic` | P7 | 1 |
| B.1.64-65,108 | `reveal`, `filterHides`, `lineOf` (async reads) | a door call in the message, over the replica | P2, P3 | 1 |
| B.1.67 | after reveal: day, wheel, place | update on `revealed` | P2 | 4 |
| B.1.68 | `Timeline.select(null)` | update on `pressedElsewhere` | P6 | 4 |
| B.1.74 | `projectsDropPreview` | the door's answer over the replica, at once (P3) (landing card at the line, A6.14) | P3 | 1, 3 |
| B.1.80 | section name field + scrollIntoView | naming layer; `focus`; `scroll` reveal | P6, P7 | 3 |
| B.1.86 | NoteSearch modal | `islands` (Obsidian `Modal`) | P7 | 3 |
| B.1.88,109-111 | open note / file / link / URL | Cmd `obsidian.open` | P7 | 1 |
| B.1.105-106 | rename / add subtask | field layer (core `QuickEntrySession`) open | P6, P7 | 3 |
| B.1.112 | `funnelView` / `projectNoteView` in each read | selectors over the replica | P2, P3 | 1 |
| B.1.116-117 | `projectsTakes`, `projectsPlusPlace` (pure) | core pure rules in update | P4 | 3 |
| B.1.124-126 | interval, landing / dock timers, pinch rAF | runtime clock; timer Cmds; transient channel; dispatch on a step | P3, P7, P8 | 1 |
| B.1.127 | `StatusBarRoom.hold` | `chrome` | P7 | 4 |
| B.1.128-139,141-142 | plugin load, settings file, code watcher, registrations, protocol, login, sync, device storage, place hand-over, open view, popouts, sync notice, core timers | plugin runtime (`obsidian/runtime/`): lifecycle (P8), protocol actions, login, the place hand-over: core calls through the door, in the runtime; tasks-file writes are door calls the queue persists, settings writes are door calls whose `data.json` the queue persists [R13] | P3, P7, P8 | 1 |
| B.1.140 | osascript (open event in Calendar) | Cmd `openInCalendar` | P7 | 1 |

### B.2 G1

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| B.2.1-3 | calendar events fetch and cache | network lane (network lane, latest per day) [R12] [R16] | P2 | 1 |
| B.2.4-6 | task reads (`funnelView`, `screen`, `projectsScreen`) | a selector over the replica (the door's view, memoised) | P2, P3 | 1 |
| B.2.7-9 | `onUpdate`, ScreenParts, draw | notification by selector; the `ScreenParts` hold is gone (P6) [R15] | P2, P6 | 1, 3 |
| B.2.10,29-65 | quick entry session construction and every session call | field layer = the door's `entry.*` session over the replica; its jobs are door calls in message order | P2, P3, P6, P7 | 3 |
| B.2.11-19 | entry helpers (`placementOf`, `parseTitle`, `isBlank`, …) | core pure rules in update / selectors | P1 | 3 |
| B.2.20-23 | session writes (`createSection`, `edit`, `unfoldAbove`, `createWithId`) | the entry's jobs run as door calls in message order (the `WriteLine` goes) [R14] [R15] [R16] | P2, P3 | 1 |
| B.2.24 | `list.adopt(created.id)` | `model.rowKeys` (`rowKey(taskId)` bound by `CreatedTask`) [R14] [R15] [R16] | P1 | 3 |
| B.2.25-27,109,111-112 | `listName`, `placementTitle`, `placementOfDay` | door selectors and `rules.*` (clock from `model.now`) | P3, P7 | 3 |
| B.2.28 | `newProject` from the bar | Cmd write | P2, P3 | 1 |
| B.2.66-67 | entry `fresh` reads | a selector over the replica (the door's view, memoised) | P2, P3 | 1 |
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
| B.2.97,101-102 | bar panel open / redraw / pick | nested overlay in the field layer (core `QuickEntrySession`) (a Preact layer) | P6, P7 | 3 |
| B.2.98 | document press while panel open | `input` → `pressedElsewhere` | P7 | 3 |
| B.2.99,113-114 | bar panel and capsule appear / fade | presence transitions: the closing layer stays in the stack until `motionSettled`, pinning what it covers (P6) | P5, P6 | 3 |
| B.2.115-121 | title field editor | `islands` (EmbeddedEditor); key scope (`keys` driver) | P7 | 3 |
| B.2.122-124 | plus press, tap, drag | `input` → carry / entry | P7 | 3 |
| B.2.125-126 | ring, `tc-cancelling` | JSX; `chrome` body class (`chrome` takes it from the model) | P1, P7 | 3 |
| B.2.127-129 | `ScrollGlide` | `scroll` | P7 | 3 |
| B.2.130 | status bar query | `chrome` | P7 | 4 |
| B.2.131-133 | `EntryRows` drawing | view + `model.rowKeys` | P1 | 3 |
| B.2.134-135 | keyboard will show / hide | `chrome` → `model.chrome.keyboard`; keyboard transition | P4, P5 | 3 |
| B.2.136-141 | view settings file / store | Cmd `device.set`: the device store only keeps `model.device` (P1) [R13] | P2, P3 | 1 |
| B.2.142,145-147 | tab: screen create / open / close / resize | host mount; `measure` | P7, P8 | 1 |
| B.2.143-144 | tab key scope, undo / find keys | `keys` driver (Obsidian `Scope`s) → Msgs | P7 | 3, 4 |
| B.2.148-149 | `ViewWatch` | host block | P7 | 3 |
| B.2.150,152,154-157,159-160,162-163,165-166,168-170 | note block lifecycle, placement, events | host block | P7, P8 | 3 |
| B.2.151,158 | block key scope | `keys` driver (Obsidian `Scope`s) | P7 | 3 |
| B.2.153 | block focus | `focus` | P7 | 3 |
| B.2.161,164 | block `onChange`, `projectNoteView` | runtime input; `projectNoteView` a selector over the replica [R12] | P2, P3 | 3 |
| B.2.167 | `--tc-block-lift` | host block placement from `measure` | P4 | 3 |
| B.2.171-223 | Settings tab and its pages | settings-tab host; its service calls go through the runtime in slice 1 (settings writes are door calls whose `data.json` the queue persists), the tab itself is rebuilt in slice 6 [R12] [R13] | P2, P3, P7 | 1, 6 |
| B.2.224-225,228 | undo button: `canUndo`, `onUndo` | `model.canUndo` (selector over the replica's history); Msg `undo` | P1, P3 | 1 |
| B.2.226 | ⋯ pressed | overlay `more` | P6 | 3 |
| B.2.227 | `UndoService.onChange` | runtime input `undoChanged` [R15] | P2 | 1 |
| B.2.229-230 | `StatusBarRoom` observers, body class | `chrome` | P7, P8 | 4 |
| B.2.231-235 | card size, priority colours, label paint on body | `chrome` per window (`chrome` takes it from the model) | P7 | 3, 4 |
| B.2.236-237 | haptics | Cmd `haptic` | P7 | 1 |
| B.2.238 | `execCommand` undo | `input` | P7 | 3 |
| B.2.239-241 | `SectionNameEntry` | naming layer = the door session (a door session over the replica) | P3, P6, P7 | 3 |
| B.2.243 | `FramePass` | driver frame scheduling | P7 | 3 |
| B.2.244 | popout listener | host / `chrome` | P7, P8 | 1 |

### B.3 G2

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| B.3.1-3,8,34-36,72-73,85-88 | `snap`, `stretch`, `carried`, `dropSpan`, `newSlot`, `bulkMenu`, peek reads (`shownSpan`, `isPast`, `relation`, `columnSections`) | door selectors and `rules.*` (clock from `model.now`) | P3, P7 | 4 |
| B.3.4-5,9-11,38,62-71,96,102 | writes through deps (resize, drop, fold, mark, move section, bulk, place) | door call in message order; texts to the persistence queue | P2, P3 | 1 |
| B.3.6-7 | `startCarry`, `endCarry` via deps | door carry calls, in message order | P2, P3, P7 | 1 |
| B.3.12-15,19,40,74,103 | task / event / group / bulk menus, sources popover | `model.overlay` | P6 | 4 |
| B.3.16-18 | timeline selection set / cleared | `model.timeline.selected` | P1, P6 | 4 |
| B.3.20 | rename on second click | overlay → entry | P6 | 3 |
| B.3.21-22 | new slot gesture | timeline new-slot gesture → entry | P6 | 4 |
| B.3.23-24 | `layoutTasks`, `stretchTo` | selectors + transitions | P1, P5 | 3 |
| B.3.25,41,109 | haptics | Cmd `haptic` | P7 | 1 |
| B.3.26-27 | `onDragging`, `moved` → carryAt | carry Msgs; `carryAt` Cmd | P2, P6 | 3 |
| B.3.28 | `onError` → reportFailure | the door's `staleTask` or `failed` answer → notice | P2, P3 | 1 |
| B.3.29,39 | `console.error` | action log | P2 | 1 |
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
| B.3.82-84 | peek reads (`dayView`, `events`, `fresh`) | gone as reads: a day's tasks and cached events are selectors over the replica; fresh events through the network lane [R12] | P2, P3 | 4 |
| B.3.89-90 | peek render, align | view for the neighbour day | P1, P3 | 4 |
| B.3.91,93-95 | swipe → pager follow / settle / frames | swipe gestures + transient channel + settle transition (a tap leaves the settle running) | P5, P6 | 4 |
| B.3.97-101 | strip / day tracks | `motion`; day-swipe `nearer`, `landing` | P5 | 4 |
| B.3.104,106 | wheel dot, label | selectors | P1 | 4 |
| B.3.105 | wheel timers | `recognizers/` / timer Cmd | P7, P8 | 4 |
| B.3.107,110 | divider and pinch settings writes | Cmd `device.set`: the device store only keeps `model.device` (P1) [R13] | P2, P3 | 1 |
| B.3.108 | divider width live | transient channel; dispatch on a step | P4 | 4 |
| B.3.111 | pinch scale | transient channel; dispatch on a step | P4 | 4 |
| B.3.112-113 | wheel preventDefault, wheel zoom settle | `input`; `recognizers/` timer | P7 | 4 |
| B.3.114-117 | settings row reorder | settings-tab host: the row-reorder gesture and its transition | P5, P6 | 6 |
| B.3.118 | free-room double click | `input` → entry `openAtEnd` | P7 | 3 |
| B.3.92 | horizontal wheel preventDefault | `input` | P7 | 4 |
| B.3.119-135 | pure core rules (`placeAt`, `swipeLanding`, `dividerAt`, …) | pure rules in update / selectors | P4 | 4 |

### B.4 G3

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| B.4.1-5,36-39,79,105 | menu models, `fullTree`, `listName` | door selectors and `rules.*` (clock from `model.now`) | P3, P7 | 4 |
| B.4.6-18,40-51,54,56,59-60,173 | menu writes | write pick: its door call at the tap; the closing sheet pins the layout under it (P6) [R15] | P2, P3, P6 | 1 |
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
| B.4.63-65 | month pick, view mode, Subprojects | overlay page; door call after the entry's door calls, in message order | P2, P3, P6 | 3 |
| B.4.67 | Select tasks | `model.selection.mode` (layer stack; data applies at once) | P6 | 4 |
| B.4.70 | menu waits for the column to scroll the card in | overlay `revealing` + `scroll` (`scroll` orders; `measure` reports scroll) | P6, P7 | 3 |
| B.4.71,77,84,86,88-89,93-98,100-101 | full card entry session and description draft | `sheet.full` = the door sessions (a door session over the replica) | P3, P6, P7, P8 | 3 |
| B.4.72 | `RenamedTexts.add` | one plugin-wide replica; the door's answer applied at once (P3) | P3 | 1, 3 |
| B.4.73-76 | full card capsule (undo, ⋯, plus) | `model.canUndo`; overlay; entry [R15] | P1, P6 | 3 |
| B.4.78,83 | `find` (async) | a door call in the message, over the replica | P2, P3 | 3 |
| B.4.80,90 | `toggleDone`, `setDescription` (debounced) | Cmd write; debounce timer Cmd | P2, P3 | 1 |
| B.4.81-82 | subtask menu, project line | overlay; Cmd + close | P6 | 3 |
| B.4.99 | title field | `islands` | P7 | 3 |
| B.4.102-103 | full card close / error | Msgs | P6 | 3 |
| B.4.104 | search | door call `tasks.search` in the message, memoised by query | P2, P3 | 4 |
| B.4.106-107 | search pick / close | overlay → `revealed` | P6 | 4 |
| B.4.108 | search takes the ⋯ sheet | hand-over: search takes the ⋯ sheet | P6 | 4 |
| B.4.109 | field's own undo | `input` | P7 | 3 |
| B.4.110 | Refresh now | network lane [R12] [R16] | P2 | 1 |
| B.4.130-131 | repeat change / remove | overlay page Msgs | P6 | 3 |
| B.4.136-140,145 | by-project reads of the model and handlers | selectors; JSX handlers | P1 | 3, 4 |
| B.4.148-149,151-152,161,167 | tree / list drops, close dim, pick node, move project, clear filter | Cmd write | P2, P3 | 1 |
| B.4.150,155,160 | haptics | Cmd `haptic` | P7 | 1 |
| B.4.153 | panel width → frame | `measure` | P4, P8 | 4 |
| B.4.154 | tree width save | Cmd `device.set`: the device store only keeps `model.device` (P1) [R13] | P2, P3 | 1 |
| B.4.156 | tree width read | `model.device.treeWidth` | P1 | 4 |
| B.4.157,168 | new project / rename project name field | naming layer | P6 | 3, 4 |
| B.4.158-159 | tree row tap, row lift attach | Msg; tree-lift gesture | P6 | 4 |
| B.4.162-165 | `carryAt`, reread, clock, error | door call `carryAt` + timer in message order; `model.now`; `staleTask` | P2, P3, P7 | 3 |
| B.4.169 | carry deps | carry gesture | P6 | 3 |
| B.4.170-172 | note search modal | `islands` | P7 | 4 |
| B.4.174 | grips | `input` → resize gesture | P7 | 3 |

### B.5 G4

| Rows | What | Owner in revision 7 | P | Slice |
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
| B.5.78,92 | share saves | Cmd `device.set`: the device store only keeps `model.device` (P1) [R13] | P2, P3 | 1 |
| B.5.84-86 | ribbon day track / follow / arrive | swipe gestures | P6 | 4 |
| B.5.87-88 | `is-switching` timers | ribbon slide transition | P5, P8 | 4 |
| B.5.89,94,101 | shared nav placement, by-project mount | view composition | P1, P8 | 3, 4 |
| B.5.97-99 | rows heights motion, fit frame, settle refit | the fold and the heights that depend on it, one transition; layout selectors skip leaving rows; heights never held | P4, P5, P8 | 3, 4 |
| B.5.111-116 | keyed rows motion | transitions by cause (keyed diff within one context); leaving rows skipped by layout selectors; fold and heights one transition (P4) | P4, P5 | 3 |
| B.5.119-120 | `SnapGlide` | `motion` | P5 | 4 |
| B.5.122-124 | prototype | replaced by the runtime | — | 1, 7 |

### B.6 event sources

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| B.6.1 | `TaskService.onChange` | `fileChanged` → the runtime takes the new base and replays the pending calls (P3); the full card's levels are selectors (layer stack; data applies at once) [R14] [R15] | P2, P3, P8 | 1 |
| B.6.2,13 | calendar change, poll | network lane [R12] [R16] | P2, P8 | 1 |
| B.6.3,47-48 | settings / view settings change | settings in the replica; an outside `data.json` is a new base, our own echo found by its text (P3) [R13] | P2, P3, P8 | 1 |
| B.6.4 | day change | `dayChanged` (applies at once (P6)) | P6, P8 | 4 |
| B.6.5-7 | focus, visibility, active leaf | `chrome` → `model.visible`; poll wake [R16] | P4, P8 | 3, 4 |
| B.6.8 | document pointerdown ×3 | `input` → `pressedElsewhere` | P7, P8 | 3 |
| B.6.9 | document keydown (bulk) | `input` | P7, P8 | 4 |
| B.6.10,95 | arbiter idle | gone: when the motion ends, the move from its pinned layout to the current one is a keyed transition | P5, P6, P8 | 3, 4 |
| B.6.11 | `css-change` | `chrome` → `model.theme` | P4, P8 | 3, 4 |
| B.6.12,155 | minute interval, tick | clock → `model.now` | P2, P8 | 1 |
| B.6.14,50 | view resize | `measure` stage size | P4, P8 | 4 |
| B.6.15-19,49 | plugin settings, visibility, vault raw, popouts, sync leave | plugin runtime inputs → messages to every screen's store [R13] | P2, P7, P8 | 1 |
| B.6.20 | DayData driven by calls | runtime | P2, P8 | 1 |
| B.6.21,97-99 | session `onChange` / `fresh` / `renamed` | entry / full card = door sessions (a door session over the replica) [R15] [R16] | P3, P6, P7, P8 | 3 |
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
| B.6.52-58 | note block events | host block [R12] | P7, P8 | 3 |
| B.6.60,106 | `UndoService.onChange` | `undoChanged` → `model.canUndo` [R15] | P2, P8 | 3, 4 |
| B.6.61 | status bar observer | `chrome` | P7, P8 | 4 |
| B.6.62-66 | Settings tab events | settings-tab host: inputs → messages | P2, P7, P8 | 6 |
| B.6.67 | popout opens | host / `chrome` (`chrome` takes it from the model) | P7, P8 | 1 |
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
| B.6.92 | settings row reorder | settings-tab host: reorder gesture through `input` and `recognizers/`; the order write a door call (`settings.move*`) the queue persists | P3, P6, P7, P8 | 6 |
| B.6.93,159-161 | free room double click, plates | `input` → entry | P7, P8 | 3 |
| B.6.94 | found card frame | `scroll` reveal | P7, P8 | 4 |
| B.6.96,100-103 | full card refresh, title rename end, description save, focus, Escape | `sheet.full` Msgs; Escape order (layer stack; data applies at once) [R15] | P6, P8 | 3 |
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

| Rows | What | Owner in revision 7 | P | Slice |
|---|---|---|---|---|
| A1.1-2 | open the tab (ribbon icon, command) | host (plugin) opens the view; runtime mounts a screen | P7 | 1 |
| A1.3 | note block appears | host block; same view in a block host | P7 | 3 |
| A1.4 | several tabs, popouts | one runtime per plugin: one replica, one persistence queue; `chrome` per window | P2, P3, P7, P8 | 1 |
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
| A9.5,8,10-11 | project menu, folder switch, note, delete | overlay `project` (a Preact layer) [R15] | P6 | 3 |
| A9.7 | rename project | naming layer | P6 | 3, 4 |
| A9.9 | attach note | `islands` (Obsidian `FuzzySuggestModal`), opened by a typing pick | P6, P7 | 3 |
| A10.1-3 | view button, mode, Subprojects | overlay `view`; Cmd writes after the entry ends [R15] | P2, P3, P6 | 3 |
| A11.1 | undo | door call `history.undo`; motion of what it changed (keyed diff within one context) | P2, P3, P5 | 1 |
| A11.2-3 | ⋯ menu, Search on the same sheet | menu layer `more` → `search` by one hand-over | P6 | 4 |
| A11.4-6 | select mode | `model.selection.mode` (layer stack; data applies at once) | P6 | 4 |
| A11.7 | press outside clears selection | `pressedElsewhere` | P6 | 4 |
| A11.8-11 | search typing, keys, pick, cancel | overlay `search`; door call `tasks.search` in the message, memoised by query | P2, P3, P6 | 4 |
| A11.12-13 | Cmd+F, Cmd+Z in the view | `keys` driver (Obsidian `Scope`s) → Msgs | P7 | 3, 4 |
| A11.14 | Cmd+Z in a plain field | `input` | P7 | 3 |
| A11.15 | any press clears the found ring | `pressedElsewhere` → `model.found = null` | P6 | 4 |
| A12.1-3 | backdrop, Escape, Enter confirms | menu layer; Escape order over the stack (layer stack; data applies at once) | P6 | 3 |
| A12.4 | first pick, action after the fade | overlay `picked`; write pick: its door call at the tap, the list's change shown as the close settles (P6) [R15] | P2, P3, P6 | 3 |
| A12.5 | pick that types | typing pick: the user's event handled to the end, focus last | P2, P6, P7 | 3 |
| A12.6-10 | label tiles, project page, repeat page, date picker, reminder | overlay pages redrawn (a Preact layer) [R15] | P6 | 3 |
| A12.11 | subtask menu over the same sheet | hand-over: one layer transition to the subtask's sheet | P6 | 3 |
| A12.12-13 | description peek, Refresh now | overlay → sheet; network lane [R12] | P2, P6 | 4 |
| A13.1-14,16,18-19 | field typing, keys, IME, `[[`, line hotkeys, paste, tap away, blur, bar | field layer = the door's `entry.*` session over the replica; `islands`; `input`; `focus` [R14] | P3, P6, P7 | 3 |
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
| A16.12 | naming holds the screen | naming layer + keyed field (`rowKey(taskId)` bound by `CreatedTask`) | P1, P6 | 3 |
| A16.13 | project menu refuses while busy | start table | P6 | 3 |
| A16.14 | redraws and tick wait while busy | gone: data applies at once; anything moving draws the layout it pinned when it began | P6 | 3, 4 |
| A16.15 | writes in order, after a closing pick | message order: every door call runs in the message that asks for it; a pick's at the tap [R15] | P2, P3 | 1 |
| A16.16 | Escape order | function over the layer stack (layer stack; data applies at once) | P6 | 3 |
| A16.17 | tap order on a card | function over the active gestures | P6 | 3 |

### B. Motions

| Rows | What | Owner in revision 7 | P | Slice |
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
| B3.24 | now line every minute | clock → `model.now` | P2 | 1 |
| B3.25 | settings row settles | settings-tab host: the settle transition, then the order from the write | P5 | 6 |
| B3.26 | timeline opening anchor | (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| B3.27-29 | question, search row, name fields scrolled into view | `scroll` reveal | P7 | 3, 4 |

### C. Measurements

| Rows | What | Owner in revision 7 | P | Slice |
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

| Rows | What | Owner in revision 7 | P | Slice |
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
| D4.15 | calendar dot | selector `sourcesDot` [R12] | P1 | 4 |
| D4.16 | theme | `model.theme` | P4 | 3, 4 |
| D5.1-9 | settings that change the screen | `model.settings` / `model.device`; update rules | P1 | 3, 4 |

## Earlier classes against revision 7

Each class left by the runs against revisions 4, 5 and 6 (M1–M23, R1–R7, R8–R11), and each fault at the root named for revision 6, was checked against what revision 7 actually says and against the code it relies on, not against its §Resolution table.

| Class | Revision 7 | Why |
|---|---|---|
| R1 a typing pick's focus inside the tap | Resolved | P2: "A user's event is handled to the end inside it: update, render, drivers, focus last." The renderer flushes Preact's `debounceRendering` for a user's event (Architecture). |
| R2 leaving rows against the end-state render | Resolved | P4, Leaving rows: layout selectors skip them; a fold and the heights that depend on it are one transition; a returning key revives its entry. |
| R3 which writes have a patch | Resolved | Gone at the root: "A write is visible at once, with its real outcome … There is no preview to compute and no optimistic layer" (P3). |
| R4 a new row's key across its create | Resolved, with R14 | P1: the `CreatedTask` id, known at once, is bound to the row key. A create replayed over an outside base gets another id (R14). |
| R5 the settings store's echo | Resolved, with R13 | Settings are part of the replica; "our own write's change event finds its own text and does nothing" (P3). Where `data.json` and the device's part are kept and guarded is R13. |
| R6 what a swipe shows while the context changes | Resolved | "Another filter, mode, day or place is drawn from the same replica in the same message … nothing to wait for and nothing to read ahead" (P3). |
| R7 the guards' scope | Resolved | §Guards, Scope: `uiRules` covers `next/` from slice 2; "core calls only through the runtime" covers `obsidian/ui` from the end of slice 1; the `/* next */` marker splits the CSS. |
| R8 the preview core is `composeCore` | Resolved, with R12 and R14 | There is no preview core. Every call is `callDoor` over one `DoorContext` the runtime holds (P3); the door carries the ids (`DoorContext.ids`) and the Projects screen with its carry (`projectsScreen`), and undo and settings are calls like any other. Checked: `drop`, `landing` and `carryOnNode` read `c.projectsScreen.carry` (`PhoneCalls.ts:442-452, 541-542`). What the door assumes of a phone host is R12; ids across a replay are R14. |
| R9 calls that act on projects-screen state | Resolved | "A call is synchronous and runs inside the message that asks for it, in message order" (P3); each call takes the `projectsScreen` the one before it answered. `endCarry` can no longer pass a drop. |
| R10 a write pick's motion | Resolved, with R15 | P6: "Anything moving pins the layout under it: … a closing sheet"; Picks, item 1. On the old screen in slice 1 the pin is `Picks`, which slice 1 removes (R15). |
| R11 what a context's read is | Resolved, with R12 | P3, Calendars: files in the replica "cached first and fresh when they land", latest per day; nothing waits. A feed's problem cannot reach the door's statuses (R12). |
| M1 the settings tab | Resolved | Its host (slice 6); its service calls go through the facade from slice 1. |
| M2 the plugin host | Resolved, with R13 | The runtime (`obsidian/runtime/`) owns the replica, the door calls, persistence, the network and Obsidian's events (P7); its hosts own what they start (P8). Where each part is persisted is R13. |
| M3 chrome both ways | Resolved | The `chrome` driver; body classes only by it (P7). |
| M4 synchronous core reads | Resolved | Door selectors over the replica and `rules.*` called directly (P3). |
| M5 the core's sessions | Resolved, with R16 | Door methods over the replica (P7). The core's job runner and refresh rule, which are not door methods, are R16. |
| M6 menus | Resolved | Preact layers in the one overlay host. |
| M7 pick timing | Resolved | Three picks; a write pick runs its door call at the tap and its list change shows as the close settles (P6). |
| M8 one interaction | Resolved | The layer stack and one pointer gesture, a statechart (P6). |
| M9 motion by cause | Resolved | P5: keyed diff within a context, whole-region transitions across. |
| M10 leaving rows, closing overlays | Resolved | P4's leaving rows; a closing sheet pins the layout under it (P6). |
| M11 heights held during motion | Resolved | P4: the fold and the heights that depend on it are one transition. |
| M12 continuous values | Resolved | The transient channel (P5). |
| M13 positions as geometry | Resolved | `motion` reads the boxes it animates in the commit phase (P4, Drivers). |
| M14 scroll | Resolved | `measure` and `scroll` (Drivers). |
| M15 swipe settle | Resolved | Now a principle: "A tap during a swipe's settle does not stop it; the tap goes where it lands" (P6). |
| M16 unbounded waits | Resolved | P2: every wait on something the user sees has a bound, and the bound is a message. Fewer waits remain: core calls do not wait. |
| M17 the device and settings stores | Resolved, with R13 | Device values are model state the store only keeps (P1); settings are in the replica (P3). Their stores and guards are R13. |
| M18 the network lane | Resolved, with R12 and R16 | Latest per day, a superseded fetch abandoned (P3). The feed's problem (R12) and the refresh rule (R16) remain. |
| M19 cross-screen renames | Resolved | One replica for every screen. |
| M20 gesture recognition | Resolved | `recognizers/`, pure. |
| M21 all service callers | Resolved, with R15 | The facade in slice 1. What it must reproduce for the old screen is R15. |
| M22 a dropped card before its read | Resolved | The door gives the drop's real outcome in the drop's own message (P3); the gesture's pinned layout moves to it when the flight ends (P6). |
| M23 key scopes | Resolved | The `keys` driver. |
| Root 6a reads that write | Resolved | Tidy is the answer's `tasks` with `step: false`, persisted like a write (P3). Checked: `Call.ask` → `normalize` → `setText(…, false)` (`PhoneCalls.ts:298-309`). |
| Root 6b preview ids | Resolved, with R14 | One replica, one id lineage (`DoorContext.ids`). Replay is R14. |
| Root 6c transactions | Resolved | Gone: views are synchronous selectors over the replica (P3). |
| Root 6d the gesture snapshot against D65 and D84 | Resolved | P6: a context change the gesture itself causes re-pins it as one whole-region transition (D65); a drop resolves against model anchors and the door's answer is in the drop's message (D84, A6.14). |
| Root 6e lifecycle | Resolved | P8: hosts mount, own and dispose everything they start; readiness and teardown arrive as messages; `hostLifecycle.test.ts`. |

All 11 of R1–R11, all 23 of M1–M23 and all 5 faults at the root are resolved by revision 7's text; 0 are not. 11 of them leave a remainder that a new class carries (R4, R5, R8, R10, R11, M2, M5, M17, M18, M21, Root 6b). The remainders come from checking the door in code, not from the principles.

## Rows that do not fit

Each item names a class, not a row, and proposes the principle or mechanism the spec must state so the whole class is owned. A row can be in more than one item. "Too vague" is used only where an implementer would have to guess something that changes behaviour or correctness.

### No mechanism owns it

None. Every row has an owner in revision 7: the door covers every core method the UI calls (`DOOR_COVERAGE`), and the rest is the runtime's, a host's or a driver's.

### The principles would change what the user sees

#### R12. The door answers as the phone's host: three facts the plugin's services have and the door's context cannot carry

**Rows (27):** A.2.99-100, A.2.102-104, B.1.35, B.1.44-47, B.1.52, B.2.1-3, B.2.161, B.2.207-208, B.3.82-84, B.4.110, B.6.2, B.6.13, B.6.56, A12.12-13, D4.15

P3 puts every core call on `callDoor` over one `DoorContext`. Checked against the services the plugin runs today (`composeCore`, `CalendarServiceImpl`, `TaskServiceImpl`), the door covers every method by name (`DOOR_COVERAGE`, `PhoneCalls.ts:1076`; tested in `tests/application/PhoneCalls.test.ts`), but in three places it answers as the iPhone app's host, not as the plugin's:

- **The old choice of calendars.** The door carries it over on every call that reads the calendars (`calendarDay`: `day.carryOver(true)`, `PhoneCalls.ts:658-664`). The plugin does it only on the phone (`composeCore.ts:50`: `canMigrate: ports.isPhone`; `calendarDay.ts:100-104`). On the desktop the door would rewrite `hiddenCalendars` and `calendarsMigrated` in `data.json` the first time a day is drawn.
- **A source's problem.** The plugin's status of a source is its file's problem *or its feed's* (`CalendarServiceImpl.ts:151`): Google failing, or silent for 15 s (`noAnswer`, `:160`), shows on the switch's dot and in the Sources sheet; a file that fails to read keeps the events last read and reports why. `DoorContext` has only the files' texts (`readingOf`, `PhoneCalls.ts:638-655`): a feed's problem cannot be handed in, so the dot and the sheet would say the source is fine.
- **The project notes being complete.** `TaskRules` makes the one move to projects only once the host's notes are complete (`legacy.ready()`, `TaskRules.ts:198, 698`); the plugin's `VaultProjects.ready()` waits for Obsidian's metadata cache (`VaultProjects.ts:36-44`). The door hard-codes `ready: () => true` (`PhoneCalls.ts:246`). A view read before the cache resolves would move the file to projects without the notes that should be attached (the class of 57562189).

The runtime cannot repair these on its side without deciding in the UI what the core decides.

**Fix (P3, a `backend` task in slice 1):** `DoorContext` carries what a host knows and the door cannot: whether the old calendar choice may be carried over (the phone's host says yes, the plugin's yes only on iOS), each source's problem as the host's feed last answered it, and whether the project notes handed in are complete. The door's existing names and answers stay as they are (the app's defaults are today's behaviour). The runtime hands them in from its network lane and from the metadata cache's readiness message (P8).

#### R15. Slice 1 changes the old screen while it is still Max's screen

**Rows (77):** A12.4, A16.15, A.2.404-407, B.4.6-18, B.4.40-51, B.4.54, B.4.56, B.4.59-60, A9.8, A10.2-3, A12.7-8, A12.10, A.2.534-536, B.2.7-9, B.2.20-24, B.1.40-43, B.6.1, B.6.21, B.6.60, B.6.96, B.6.98, B.2.227, B.4.73, B.1.5, B.1.9, B.1.14-15, B.1.19-20, B.1.22-26, B.1.28-30

Slice 1 ships a ★ release: the old screen runs on `TaskServiceFacade` "and keeps drawing as it does", while "the old `act`, `changing`, `Picks`, `WriteQueue`, `Reload` and the services' own file reads go". Checked in code, three of those carry what Max sees, not only ordering:

- **`Picks` is the old screen's only pin.** A pick's action runs after the window's fade (`kit/Panel.ts:57-71`, A12.4); on the desktop the menu is a popover over a visible list. Revision 7's answer to this (P6: a closing sheet pins the layout) lives in the new architecture only. Removing `Picks` in slice 1 makes every write pick change the list under its closing sheet, on the screen Max uses until slice 5.
- **`Reload`'s hooks and `WriteQueue` carry the quick entry's drawing.** `QuickEntrySession.run` writes a job only once the lists show the writes before it (`view.fresh()`), and hands the cards about to be drawn to `shown(id, created, coming)` (`QuickEntrySession.ts:187-217`; `Reload.hooks`, A.2.536). Without them the typed row is not adopted by its card (B.2.24).
- **What the services emit.** The old screen redraws on `TaskService.onChange` (B.1.40, B.6.1, B.6.56, B.6.96), which today fires on the vault's change event after our own writes, on an outside change, synchronously inside every Projects-screen change (`keepScreen`, `TaskServiceImpl.ts:308-312`), on a settings change that changes how the file reads (`readsAnew`), and on the project notes changing; `UndoService.onChange` on every recorded step (B.6.60). The service's constructor drops a carry left by a screen gone mid-gesture (`dropGesture`, `TaskServiceImpl.ts:110-118`). The door answers in other shapes than the services: events with `startMs` instead of `Date`s (`wireEvent`), `days.boundary` as `{startHour}` instead of a `DayBoundary`, `calendars.isPast` taking `{endMs}`, and `entry.*` as `EntryAnswer`.

The spec does not say which of these the facade reproduces, so "keeps drawing as it does" cannot be checked, and the obvious reading changes the old screen.

**Fix (slice 1, P3):** the facade is a parity layer, tested against the async services on the same calls:
- it emits what the services emit, after the call's answer is in the replica and never from inside it;
- it converts the door's shapes back to the services';
- it drops a left carry when built.

What goes in slice 1 is only what existed to order writes against reads (`act`'s `changing`, the services' file reads, `Picks.settled`). What carries presentation stays until slice 7:
- `Picks`' close-then-redraw, now as the old screen's pin: the call at the tap, the redraw when the close settles;
- `Reload`'s `beforeShow` hook, so the entry's `shown` still gets the coming cards;
- the entry's job order.

### Two principles conflict

#### R14. A replayed create gives the new task another id

**Rows (12):** A.2.332, A.2.534-536, B.2.20-24, B.6.1, A13.2, A13.10

P1: "a row's key is given when the user's message makes it. The core's `CreatedTask` id … is bound to that key, so one row lives from field to card." P3: on an outside change "the calls since the last persisted base … are replayed in order through the door over it, and the replica becomes the result."

Checked in `TaskIdentity` (`TaskIdentity.ts:60-80`): a fresh line gets the id `t${next + tag}`, and an outside text keeps only the ids of the lines it still holds. The new base comes from Sync or an agent, so it lacks the line our pending `createWithId` wrote; replayed over it, the create writes that line again and gets a new id. The row key bound to the first id now names nothing: the card remounts, a typed row loses its keyboard, a line flies in (D86). The same holds for a pending rename whose line the outside edit also touched.

So P3's replay breaks P1's binding exactly when Sync lands during typing, which is when Max sees it.

**Fix (P1 with P3):** the row key is bound to the *call* that made the row, not only to the id it answered. A pending call keeps its row keys; when a replay answers a new `CreatedTask` for that call, the runtime rebinds the key to the new id in the same message. A replayed call that fails drops its keys with its reverse transition. Replay tests cover Sync during a create and during a rename.

### Too vague to build without guessing

#### R13. What the runtime persists where, and from which base

**Rows (48):** A.2.48, A.2.496-500, B.1.54, B.1.72, B.1.120, B.1.123, B.1.128-139, B.1.141-142, B.2.136-141, B.2.175, B.2.209, B.2.212-213, B.3.107, B.3.110, B.4.154, B.5.78, B.5.92, B.6.3, B.6.15-19, B.6.47-49

P3's persistence names one target: "one plugin-wide serial queue writes the answers' texts to the vault, with compare-and-set (`vault.process`…)". The replica has more parts than the tasks file, and each lives somewhere else:

- **`data.json`** is not a vault file (`PluginSettings` writes it through `saveData`, `main.ts:37-44`), so `vault.process` cannot guard it; Sync brings it through the vault's `raw` event and a reload on `visibilitychange` (`main.ts:58-61, 132-137`).
- **The device's part of the settings** (`listShare`, `zoom`, `treeWidth`: `DEVICE_KEYS`, `viewSettings.ts:37`) lives in local storage and must never reach `data.json` (`PluginSettings.partition`). The door's settings answer is `data.json` with every key it was handed (`saveSettings`, `PhoneCalls.ts:349-354`): a merged text handed in would leak the device's part into the synced file.
- **The Projects screen state** is per device, in Obsidian's local storage (`LocalProjectsScreenStore`), not in the vault.
- **Settings written outside the door:** the Google refresh token (`GoogleAuth.ts:70`) and the place hand-over (`main.ts:104-110`). If they do not pass through the replica, the next door answer's `data.json` is made over a text without them.
- **The tasks file's path** follows `tasksFile` (B.2.175, per keystroke): a settings change swaps the replica's tasks text. A missing file is created with `vault.create`, not `process` (`createFile`, B.1.123).
- **Bases and clock for replay:** P3 speaks of "the last persisted base" in the singular, and of replaying "the calls since" it. With two synced files the base is per file, and a call can touch both (`calendars.setShown`, the migration). And `DoorContext.nowMs` is the call's moment: a call replayed after midnight with the current clock can land elsewhere (`toggleDone` of a repeating task, a tidy for the new day).

An implementer has to guess each of these, and some guesses lose Max's data (a token overwritten, the device's divider synced to the other device).

**Fix (P3):** the replica's parts each name their store and their guard:
- tasks file: vault, `vault.process` comparing the base text;
- `data.json`: the plugin's data, the same comparison made inside the queue against the text last read; only the synced part is handed to the door;
- device part and Projects screen: local storage, written as answered, never replayed (they belong to this device);
- every settings writer outside the door (the token, the hand-over) is a runtime write into the replica, ordered like a door call.

A pending call keeps its `nowMs` and is replayed with it; an outside change to either synced file makes that file's text the new base, and all pending calls are replayed over both.

#### R16. The core's host-side machines the door leaves out

**Rows (21):** A.2.98, B.1.35, B.1.44-47, B.1.52, B.2.1-3, B.2.20-24, B.4.110, B.6.6-7, B.6.13, B.6.21, B.6.98

P7: the core's sessions "are door methods over the replica, never re-implemented". Three machines of the core are not door methods; they are classes that drive the core over a host's ports, and the plugin runs them today:

- **The quick entry's job runner,** `QuickEntrySession` (`QuickEntrySession.ts:41-218`): a job is written only once the lists show the writes before it, then `shown`, `unshown` and `done` in that order. The door offers the steps (`entry.call`, `entry.shown`, `entry.unshown`, `entry.done`) but not the order.
- **The calendars' refresh rule,** in `CalendarServiceImpl.events` (`:62-67`): a day that opens asks a feed due for a refresh in the background, Refresh now forces it, a peek with cached events asks nothing; a feed silent for 15 s counts as failed.
- **Polling,** `CalendarPolling` via `keepFresh`: interval from settings, paused while hidden, woken on focus, caught up on a leaf change.

The network lane and the runtime are named as their owners, but the rules themselves are not: an implementer either re-writes them in the runtime (a second copy beside the Swift app's, which the project forbids) or guesses.

**Fix (P7):** the runtime runs the core's host-side machines over its own ports and never re-writes their rules. In slice 1, `backend` gives each a form the runtime can drive in message order:
- the entry's job runner as a synchronous step over `EntryAnswer`;
- the refresh rule as a pure function of the reason and the feed's last answer, which the network lane calls;
- `CalendarPolling` as it is, its timers through the runtime.

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
| The principles would change what the user sees | 2 (R12, R15) | 104 |
| Two principles conflict | 1 (R14) | 12 |
| Too vague to build without guessing | 2 (R13, R16) | 69 |
| **Any category (a row counted once)** | **5** | **158** |
| Rows that fit as mapped | | 1874 |

Against revision 4: 23 classes and 688 rows did not fit. Against revision 5: 7 classes and 219 rows. Against revision 6: 4 classes and 155 rows. Against revision 7: 5 classes and 158 rows (R12 27, R13 48, R14 12, R15 77, R16 21); the three facts of A.1 tagged with them (11, 12, 44) are not counted as rows.
