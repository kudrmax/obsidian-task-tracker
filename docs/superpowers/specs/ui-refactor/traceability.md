# UI refactor: traceability

This file maps every row of the two inventories to the mechanism of `../2026-11-15-ui-refactor.md` (**revision 6**) that owns it, the principle behind it and the slice that rebuilds it.

Inputs:
- `inventory-state-effects.md`: A.1 (45 facts), A.2 (565 locations), B.1–B.5 (819 effect call sites), B.6 (180 event sources);
- `inventory-behaviour.md`: A (203 inputs), B (84 motions), C (84 measurements), D (52 screen states).

Doubts were checked in code at `8d345d24`: `obsidian/ui`, `obsidian/main.ts`, `styles.css`, `core/application` (`composeCore.ts`, `TaskServiceImpl.ts`, `TaskIdentity.ts`, `TaskRules.ts`, `TaskWrites.ts`, `PhoneCalls.ts`, `contracts.ts`).

**How this rerun was made.** Every row was re-examined against revision 6, not only the 219 rows left over from revision 5.
- Owners were rewritten in revision 6's words:
  - pending intents applied by the preview core;
  - the gesture's pinned layout snapshot;
  - leaving rows skipped by layout selectors;
  - neighbours read ahead;
  - `rowKey(taskId)`;
  - the settings stores' in-flight rule.
- Principles keep their numbers (P1–P7); slices keep theirs, and the preview core is in slice 2.
- Each of R1–R7 and M1–M23 was checked against revision 6's own text, not against its §Resolution table (§R1–R7 and M1–M23 against revision 6).
- Classes still open are numbered on from R8. Their rows carry `[R#]` in the owner column and are gathered in **Rows that do not fit**.

The script checked that every row id appears exactly once in the mapping tables. It found 0 rows unmapped and 0 mapped twice.

## Vocabulary used in the owner column

The spec names the layers but not every field, so this file proposes the field names. Every name below is a proposal.

**Model (per screen, P1):**
- `model.read`: the core's answer for the shown context (`ScreenView`, with `funnel` (view, place, filter, panel), `projects`, `missing` and `context`), with every pending intent applied; `day`, the key of that read.
- `model.neighbours`: the days and places either side, read ahead (P3).
- `model.day`, `model.now`, `model.visible`, `model.events[day]`.
- `model.settings` (`ScreenSettings`) and `model.device` (device view settings).
- `model.platform`, `model.theme`, `model.chrome` (`keyboard`, `statusBar`).
- `model.canUndo`, `model.selection` (`mode`, `picked`, `anchor`), `model.found`, `model.timeline` (`selected`, `anchor`), `model.zoom`.
- `model.measured`: row heights, text widths, the stage, menu sizes, all from `measure`.
- `model.entry`: the snapshot of the core's `QuickEntrySession`.
- `model.rowKeys`: `rowKey(taskId)`, given when the user's message makes a row and bound by `CreatedTask` (P1).
- `model.overlay`, `model.sheet.full`: layers.
- `model.place`: leaf, or block with note and project.

**Runtime (plugin-wide):**
- the file sequence and the **pending intents** (the core call with its arguments), applied over the last read by the **preview core** (P3);
- the settings and device stores: their events ignored while our writes are in flight, then one read;
- the network lane;
- the core sessions (P7);
- the action log.

**Interaction (P6):**
- **Layers:** select mode, field (entry, rename, naming), menu (task, bulk, section, project, event, view, ⋯, sources, search), the full card.
- **Gestures:** carry (a card, subtasks, the plus, the picked cards; the core's carry session), section lift, tree lift, timeline hold, select, resize and new slot, ribbon swipe, day swipe, wheel drag, pinch, divider, tree divider.
- Each layer and gesture pins its entities and gets `targetChanged` / `targetGone`. A pointer gesture also pins a layout snapshot, which the view draws while it is active.

**Commands (P2):**
- `write(intent)` and `read`, in the file sequence;
- `carry`, `carryAt`, `undo`, `device.set`;
- network-lane fetches;
- `notice`, `haptic`, `obsidian.open`, `openInCalendar`, `createFile`;
- timers, each with a timeout message.

**Edges (P7):**
- the drivers `motion`, `measure`, `scroll`, `focus`, `input`, `keys`, `chrome` and `islands`;
- `recognizers/` (pure);
- `CoreQueries` (pure core queries in selectors, clock from `model.now`);
- `host/` (the plugin runtime, the leaf host, the block host and the settings-tab host).

**Other names:**
- **Transient channel:** live values from `input` to `motion`, laid out by the same selectors (P5).
- **Pure rules:** pure functions of the core, called from `update` and selectors.

**P** is the principle:
- P1 one model, identity included;
- P2 one timeline, a user's event handled to the end;
- P3 every frame is one consistent snapshot of the file and its pending writes;
- P4 geometry is input;
- P5 motion follows the change, and a context change moves as a whole;
- P6 interactions are layers; they pin what they hold;
- P7 imperative code only at the edges.

**Slice** is the slice that rebuilds the row:
- 1: the runtime under the old code. Every service caller, the file sequence with read-back, the stores and the network lane.
- 2: the guards, the freeze, the e2e harness and the preview core.
- 3: the note block. Lists, cards, the field, carry inside the block, menus and the full card: the shared parts the leaf reuses.
- 4: the leaf behind `newScreen`. The timeline, the ribbon with neighbours read ahead, both swipes, the panel and tree, the carry across all of them, select mode, search, the day.
- 5: the switch (no rows of its own).
- 6: the settings tab.
- 7: deletion.

"3, 4" means built for the block and then mounted in the leaf. "Gone" means the new code makes the state unnecessary; it is deleted with the old code in slice 7 if not earlier.

## A.1 The 45 facts held in more than one place

Each fact gets one field or one selector. "Seeded" means the field starts from a core answer before the first read; it is still one field.

| # | Fact | Single owner | P | Slice |
|---|---|---|---|---|
| 1 | The day the screen shows | `model.day` (one field). The read's own day is `model.read.day`, the key of that read, not a copy. Title: selector `dayTitle`. Drawn-day caches go (P5 decides motion by cause). The incoming day of a swipe or turn is a neighbour read ahead (`model.neighbours`), a different fact. | P1, P3 | 4 |
| 2 | The day the header names during a swipe | Selector `headerDay(model)` = `daySwipe.nearer ? neighbourDay : model.day`; `nearer` is set by one discrete message when the slide crosses half. | P1, P3, P6 | 4 |
| 3 | A tick or draw missed while hidden or held | Gone as a store: data applies at once (P6); the active pointer gesture draws its pinned layout snapshot; `model.visible` from `chrome`. | P6 | 4 |
| 4 | Where the strip stands | `model.read.funnel.place` (the core's answer) plus the ribbon gesture's in-flight `target`; selector `shownPlace`. `atDone` = `shownPlace === "done"`. `firstPlace` seeds `model.read` before the first read. `rightMode` is a one-time host hand-over (plugin runtime). [R11] | P1, P3 | 4 |
| 5 | The view mode and its layout | `model.read.funnel.view` (`ViewChoice`); selector `layoutMode`. `firstView` seeds it before the first read. Mounted layout = the layout component chosen by `layoutMode`. `drawnContext` goes: update compares `read.context` to decide that no transition is emitted. | P1, P5 | 4 |
| 6 | The project filter | `model.read.funnel.filter`; selector `filterNode`. The node a carry was lifted on is carry-gesture state `carry.liftedOn` (a different fact: what to put back). | P1 | 4 |
| 7 | The projects panel open / docked | `model.read.funnel.panel` (`open`, `docked`). The mid-slide state is a running `Transition` (dock slide), not a field. | P1, P5 | 4 |
| 8 | The tasks read from the file | `model.read` (`ScreenView`: tasks, day, projects, missing). Menus and the bulk menu hold only keys (`overlay.task.key`, `overlay.bulk.keys`) remapped by the write's answer; the full card holds `sheet.full.levels[]` reads of its own; the neighbours read ahead are held in `model.neighbours`. Element maps go. | P1, P3 | 4 |
| 9 | The tasks file is missing | `model.read.missing`; every hidden part is JSX from it. | P1 | 3, 4 |
| 10 | A card waiting for a new section's name | Naming layer `interaction.naming = {kind: "section", column, card}`. | P6 | 3 |
| 11 | The day's calendar events | `model.events[day]` (keyed by day, so the shown day and its neighbours read ahead share one map). The service cache stays in the core. | P1, P3 | 1 |
| 12 | The sources' alert | Selector `sourcesDot(model.events[model.day])`. | P1 | 4 |
| 13 | Extra all-day rows | Selector `allDayExtraRows(model.events[day])`; a neighbour day uses the same selector. | P1, P3 | 4 |
| 14 | The timeline card selected | `model.timeline.selected: TaskKey or null`. | P1, P6 | 4 |
| 15 | List cards picked | `model.selection = {mode, picked: TaskKey[], anchor}`; count and button state are selectors. | P1 | 4 |
| 16 | A drag holds the screen | `model.interaction.gesture` (the one gesture slot); `isDragging` is a selector. | P6 | 4 |
| 17 | A carry to a project is under way | carry gesture `carry.reportsToCore` (the core's carry is a session, core session held by the runtime). | P6, P7 | 3 |
| 18 | The card a drop is landing on | A pending intent in the runtime (the drop's core call with its arguments), applied by the preview core, retired by the read numbered at or above it (P3). [R8] [R9] | P3 | 1, 2, 3 |
| 19 | Where a held card would land | carry gesture `carry.target` (list gap and level, plate, title, timeline start, tree row), computed from `model.measured` and the core's rules. | P4, P6 | 4 |
| 20 | A timeline card being stretched | Resize gesture `interaction.resize = {key, edge, span}`. | P6 | 4 |
| 21 | A swipe or turn is running | Ribbon / day-swipe gesture state; the run after release is a numbered `Transition` in `motion`. | P5, P6 | 4 |
| 22 | Which swipe or turn is current | Transition numbers (a stale `motionSettled` is ignored by number); the day-swipe gesture's turn queue. | P5 | 4 |
| 23 | A landed day drawn over the screen | A context change: the incoming day or place is a neighbour read ahead, so the switch does not wait; a far jump is a transaction with a timeout (P3). [R11] | P3, P6 | 4 |
| 24 | The timeline's hour height | `model.zoom = {hourPx, wholeDay}` (seeded from device settings); the pinch's live scale rides the transient channel; dispatch on a step. | P1, P4 | 4 |
| 25 | The timeline's scroll position | Driver-local in `scroll` keyed `timeline`; the opening anchor is `model.timeline.anchor = {minute, fraction}` (`scroll` orders; `measure` reports scroll). | P1, P7 | 4 |
| 26 | A list's scroll / held room | Driver-local in `scroll` (positions, ScrollHold, glides) keyed by scroller id; the entry's `follow` flag is field-layer state (`scroll` orders; `measure` reports scroll). | P7 | 3 |
| 27 | The day list's share | `model.device.listShare` (the settings answer); live drag value on the transient channel; widths are selectors (`RibbonColumns`, `layoutWidths`). | P1, P4 | 4 |
| 28 | The project tree's width | `model.device.treeWidth`; live drag value on the transient channel. | P1, P4 | 4 |
| 29 | A field is open for typing | `model.entry` = the quick-entry session's last answer (core session); every flag (`is-entering`, plus hidden, folder locked, card `is-renaming`) is a selector. | P1, P7 | 3 |
| 30 | Which field has the focus | `model.focus` (owner id) reported by `focus`; Obsidian's `activeEditor` is `islands`-local. | P1, P7 | 3 |
| 31 | The entry's priority tint | Selector `entryTint(model.entry)`. | P1 | 3 |
| 32 | The repeat being edited | One draft per editor: `overlay.page.repeat` (task menu, the core `RepeatPage` answer) or `entry.repeat` (bar). Never both for one editor. | P1, P7 | 3 |
| 33 | A description being edited | `sheet.full.description = {draft, dirty}` (the core `DescriptionDraft` answer, core session held by the runtime); the CodeMirror doc is `islands`-local; the 600 ms save is a timer command. | P1, P7 | 3 |
| 34 | The search window is open | `model.overlay` stack entry `{kind: "search", phase}`. | P6 | 4 |
| 35 | A task is on the whole screen | `model.sheet.full = {stack, phase}`. | P6 | 3 |
| 36 | A menu / sheet is open or closing | `model.overlay` (stack of `{kind, phase: open or closing, page, picked}`); the pick's slot in the file sequence (pick kinds; number taken at the tap). | P6 | 3 |
| 37 | The card ringed after a search | `model.found = {key, scrollPending}`. | P1 | 4 |
| 38 | Whether undo is possible | `model.canUndo` (from `UndoService.onChange`). | P1 | 1 |
| 39 | The settings the screen draws | `model.settings` (`ScreenSettings` answer) and `model.device` (device view settings). Body tokens per window come from `chrome` (`chrome` takes it from the model). | P1 | 3, 4 |
| 40 | Phone or desktop | `model.platform.wide` from `chrome`. | P4 | 3, 4 |
| 41 | Obsidian's status bar over the view | `model.chrome.statusBar` from `chrome`. | P4 | 4 |
| 42 | Popout windows that get the styles | Plugin runtime's window set (host), fed to `chrome`; not a screen fact. | P7 | 1 |
| 43 | Which note a block shows | `model.place = {kind: "block", note, project}`; the blocks map is host-level. | P1 | 3 |
| 44 | Writes waiting to run | The plugin-wide file sequence of intents; an intent takes its number at the user's message. | P3 | 1 |
| 45 | Who holds the screen | `model.interaction.gesture` (one slot); pointer captures are `input`-local. | P6 | 3, 4 |

## A.2 State locations (565)

Row ids number the rows of each domain table of `inventory-state-effects.md` in file order, A.2.1 to A.2.565.

### day/clock

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.1 | `CS.selectedDate` | `model.day` | P1 | 4 |
| A.2.2 | `CS.titleDay` | selector `headerDay` over `daySwipe.nearer` | P1 | 4 |
| A.2.3 | `CS.missedTick` | `tick` applies at once to `model.now`; ticks missed while hidden caught up on `visible` | P2, P6 | 1, 4 |
| A.2.4 | minute interval | runtime clock source → `tick(now)` → `model.now` | P2 | 1 |
| A.2.5 | `DayData.state.date` | `model.read.day` (key of the read) | P1 | 4 |
| A.2.6,10 | `Timeline.drawnDate`, `TaskList.drawnDay` | gone: a day change emits no transition (P5) | P5 | 3, 4 |
| A.2.7-9 | now line, hidden labels, now pill | selectors over `model.now` (`isToday`, core `labelHidesNearNow`); `--tc-y` via `motion` layout variables | P1, P7 | 4 |
| A.2.11 | DayNav title | selector `dayTitle` | P1 | 4 |

### view/mode/place/filter/panel

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.12,14 | `CS.shownMode`, `CS.atDone` | ribbon gesture `target` + selector `shownPlace` [R11] | P1, P6 | 4 |
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
| A.2.41,44,46 | column / backlog titles text | selector over list names (`CoreQueries`) | P1 | 3, 4 |
| A.2.42-43 | `RibbonLayout.place`, `is-lists/is-inbox/is-done` | selector `shownPlace` → JSX class | P1 | 4 |
| A.2.45 | shared nav / timeline placement | view composition per layout | P1 | 3, 4 |

### lists data

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.47 | `CS.drawnRead` | first read emits no transition (`model.read` was null) | P5 | 4 |
| A.2.48,53 | missing box, `DayData.state.missing` | `model.read.missing`; JSX | P1 | 3, 4 |
| A.2.49-50 | `CS.naming`, header slot | naming layer `{kind: section}` | P6 | 3 |
| A.2.51 | card `dataset.menuFrom/card` | row props from the core row model | P1 | 3, 4 |
| A.2.52 | `DayData.state` | `model.read` | P1 | 4 |
| A.2.54 | `FullScreen.tree` | `sheet.full.levels[].tree` (its own read command) | P1, P2, P3 | 3 |
| A.2.55-63 | `ProjectTasks.*` maps | selectors over `read.projects` (`projectsEntryLook`); element maps gone | P1 | 3, 4 |
| A.2.64,67,69 | `Timeline.tasks`, `is-over`, block meta | selectors (`slotted`, `stackTasks`, `stackCorner`) | P1 | 4 |
| A.2.65,68 | `Timeline.blocks`, DOM order | gone: Preact keys, JSX order from `stackTasks` | P7 | 4 |
| A.2.66 | block `--tc-y/len/x` | `motion` layout variables from selector | P7 | 3 |
| A.2.70-78 | `TaskList.*` bookkeeping | selectors (`listView`, `columnSections`); element maps gone | P1 | 3 |
| A.2.79 | card `--tc-level` | `motion` layout variable | P7 | 3 |
| A.2.80-81,83 | header, plate text, branch lines | selectors (`branchOf`) | P1 | 3 |
| A.2.82 | keyed empty-plate presence | plate ↔ first card is a transition kind (B1.9) | P5 | 3 |
| A.2.84-91 | card colours, classes, marks, link data | JSX from `TaskItem` | P1 | 3 |
| A.2.92,94-95 | `KeyedRows.rows/drawing/order` | gone: Preact keyed rows; focused field kept by key (`rowKey(taskId)` bound by `CreatedTask`) [R8] | P1, P5, P7 | 3 |
| A.2.93 | `KeyedRows.leaving` | leaving rows: skipped by layout selectors; fold and dependent heights one transition; a returning key revives the entry (P4) | P4, P5 | 3 |
| A.2.96-97 | prototype `KeyedList` | replaced by `next/` | — | 7 |

### events

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.98 | `CS.poll` | effect runner: `keepFresh` on the network lane, `model.visible` | P2 | 1 |
| A.2.99-100 | `DayData.dayEvents`, `state.calendars` | `model.events[day]`, `read.calendars` | P1 | 4 |
| A.2.101 | `DayData.around` | network-lane request parameter (network lane, latest per day) | P2 | 1 |
| A.2.102 | `DayPeek.events` | `model.events[day]` of the neighbour day read ahead (P3) [R11] | P1, P3 | 4 |
| A.2.103-104 | wheel dots | selector `sourcesDot` | P1 | 4 |
| A.2.105-106,109 | `Timeline.events`, event block placement | selector `timedEvents` (`layoutEvents`) + `motion` variables | P1, P7 | 4 |
| A.2.107 | event colours | selector `paintEvent(model.theme)` → `motion` variables | P1, P7 | 4 |
| A.2.108 | `is-past` | selector over `model.now` (`CoreQueries`, clock from `model.now`) | P1 | 4 |

### selection

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.110,116-119 | `BulkController.selection`, `TaskSelection.*` | `model.selection {picked, anchor}`; element maps gone | P1 | 4 |
| A.2.111-112 | count / ⋯ buttons | selectors | P1 | 4 |
| A.2.113-114 | `selecting`, `is-selecting` | `model.selection.mode` (select-mode layer) | P6 | 4 |
| A.2.115 | bulk menu `items` closure | `overlay.bulk.keys` remapped by write answers | P1 | 4 |
| A.2.120-121 | `is-selected`, `.tc-pick` | JSX | P1 | 4 |
| A.2.122-124 | `Timeline.selected`, ring, grips | `model.timeline.selected`; grips via `motion` variables | P1, P6 | 4 |

### carry/drag

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.125 | `CS.carrying` | carry gesture `reportsToCore` [R9] | P6 | 3 |
| A.2.126,216 | root `is-dragging` (and its read in BlockHeight) | JSX class / selector from `interaction.gesture` | P1 | 3, 4 |
| A.2.127-129 | `QEC.dragging/carrying/droppedOn` | carry gesture `payload` and outcome; selector `plusHidden` | P6 | 4 |
| A.2.130,135-139,143-146,149 | press records, pointer captures, document listeners of drags and holds | `input`-local; discrete messages out | P7 | 3 |
| A.2.131-132,192 | plus ring, `is-hot` | JSX from carry gesture `payload`, `target` | P1 | 4 |
| A.2.133 | body `tc-cancelling` | `chrome` body class from carry target (`chrome` takes it from the model) | P7 | 3 |
| A.2.134 | `DragController.live` | `interaction.gesture` | P6 | 3 |
| A.2.140-142,158 | `is-lifted/is-waiting/is-folded` | JSX from carry / section-lift gesture; folds are transitions | P1, P5 | 3 |
| A.2.147-148 | resize closures | resize gesture `{minute, span}` | P6 | 3 |
| A.2.150-157 | `CardListDrop` state | carry gesture `target` computed from `model.measured` and core rules (`placeAt`, `placesInGap`) | P4, P6 | 3 |
| A.2.159-160 | section lift capture / listeners | `input`-local | P7 | 3 |
| A.2.161-162,215,219 | `SectionSlots`, `TaskList.landing`, `KeyedRows.marks` | section-lift gesture `slot`; JSX mark row | P6 | 3 |
| A.2.163-164,170-176,178,193 | section / card / plus floats and their styles | JSX float component; position on the transient channel; width, flight, fade as transitions | P5, P7 | 3 |
| A.2.165 | static `DragSession.landing` | pending intents (P3) + running transition numbers [R8] | P3, P5 | 3 |
| A.2.166-169 | `DragSession.current/done/cut/cleared` | carry gesture phase | P6 | 3 |
| A.2.177,179 | flight timers | `motion` → `motionSettled` (timeout message) | P5 | 3 |
| A.2.180-182,198-199 | drop lines, tree `is-drop` | JSX from `carry.target`; line steps are transitions | P1, P5 | 4 |
| A.2.183-184 | `TimelineDrop.start/last` | carry gesture `target.timeline` | P6 | 4 |
| A.2.185-186 | `ArrivingCard` | the preview core's answer for the pending intent: the arriving card (P3) [R8] | P3, P5 | 2, 3 |
| A.2.187-191 | `LongPress` state and timer | `recognizers/` (pure); delay from `model.settings` | P7 | 3 |
| A.2.194 | `ProjectTasks.away` | selector hiding `carry.lifted` across node change | P1 | 4 |
| A.2.195 | by-project row classes | JSX | P1 | 3, 4 |
| A.2.196 | `TreeDrop.result` | carry gesture `target.tree` | P6 | 4 |
| A.2.197 | `ProjectsListDrop.readOn` | carry gesture `targetsReadNo` (pinned drop places, `targetChanged` (P6)) | P4, P6 | 3 |
| A.2.200-203 | `TreeLift` claim, `at`, float, listeners | tree-lift gesture; float on transient channel; `input` | P6 | 4 |
| A.2.204-205 | `CarryReport.last/timer` | effect runner: `carryAt` command with dedupe and a timer command [R9] | P2 | 4 |
| A.2.206-207 | `ProjectsCarry.drops/nodes` | carry gesture `rows`, `liftedOn` | P6 | 4 |
| A.2.208-212,214 | timeline drop line and stretch state | carry / resize gesture state; JSX; `motion` variables | P6, P7 | 4 |
| A.2.213 | `is-lifted` read in Timeline | selector from `carry.lifted` (no class reads) | P1 | 4 |
| A.2.217-218 | `is-drop-room`, hover hook | selector `dropRoom(list)` from `carry.target` | P4 | 3, 4 |

### swipe/pager

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.220 | `CS.landing` | day-swipe gesture `landing`; the incoming day is a neighbour read ahead, so the switch does not wait [R11] | P3, P6 | 4 |
| A.2.221 | `drawnWaits` + 1000 ms timer | gone for neighbours; a far jump (Back to today) is a transaction bounded by a timeout message [R11] | P2, P3 | 4 |
| A.2.222 | `CS.turning` | queued context changes, in order; a new swipe drops the queue [R11] | P3, P6 | 4 |
| A.2.223,542 | `CarefulPace`, `PointerSpeed` | `recognizers/` | P7 | 4 |
| A.2.224-230 | `Swipe` press, stream, timer, holds, round, listeners, capture | `recognizers/` + ribbon / day-swipe gesture; `round` → transition numbers | P6, P7 | 4 |
| A.2.231-236 | `ScreenPager` state | swipe gesture + transient channel; settle is a `Transition`; `catches` → transition numbers (a tap leaves the settle running) | P5 | 4 |
| A.2.237-238,240 | edge / day / strip track styles and scrub | `motion` (transient channel, scrub between two computed layouts) | P5, P7 | 4 |
| A.2.239 | `DayTrack.nearer` | day-swipe `nearer`, one message at half [R11] | P6 | 4 |
| A.2.241-243 | `DayPeek.day/removed/el` | the neighbour day read ahead (`model.neighbours[day]`); view draws it (P3) [R11] | P3, P6 | 4 |
| A.2.244 | `ColumnSwitch.icons` | view | P1 | 4 |
| A.2.245-247,251 | wheel press, hold timer, swallowed click, capture | wheel-drag gesture + `input` | P6, P7 | 4 |
| A.2.248,252-253 | wheel `is-settling`, ribbon `is-switching` | transitions (wheel settle, ribbon slide) | P5 | 4 |
| A.2.249-250 | `ColumnSwitch.at`, wheel window properties | selector of `shownPlace`; live drag on transient channel; `motion` variables | P1, P7 | 4 |

### zoom

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.254-255 | `CS.hourPx`, `CS.wholeDay` | `model.zoom {hourPx, wholeDay}` | P1 | 4 |
| A.2.256,261 | `zoomFrame`, `PinchZoom.scaled` | transient channel; dispatch on a step | P4 | 4 |
| A.2.257-260,262-263 | pinch pointers, wheel timer, anchor, limits, capture | pinch gesture + `recognizers/`; wheel settle timer command | P6, P7 | 4 |
| A.2.264-265 | `Timeline.minor/grid` | selector `gridAt(hourPx)` (transient channel; dispatch on a step) | P1 | 4 |
| A.2.266-267 | `hourShown`, `--tc-hour` | `motion` variable | P7 | 4 |

### scroll

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.268 | `CS.scrolledFor` | gone: update emits a scroll order on a day change | P2 | 4 |
| A.2.269-270,283 | timeline / day list / peek scroll positions | `scroll`-local, keyed scroller ids (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| A.2.271-276 | `QEC.follow/revealedAt/revealing/handScrolledAt/watchedScroller`, scrollTop | field layer (core `QuickEntrySession`) `follow`; `scroll` `reveal` orders; `userScrolled` ends follow | P6, P7 | 3 |
| A.2.277,297-302 | `ScrollGlide`, `ScrollHold`, `GLIDES` | `scroll`-local | P7 | 3 |
| A.2.278-282 | `AutoScroll` state | `scroll` `edge` order from the carry gesture; scroll offsets back to the carry (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| A.2.284 | `LiftedMenu.stopScroll` | overlay `revealing` + `scroll` cancel (`scroll` orders; `measure` reports scroll) | P6, P7 | 3 |
| A.2.285 | `PanelPages.scrolls` | `scroll`-local per page key | P7 | 3 |
| A.2.286-287 | by-project / tree scroll keep or reset | `scroll` orders `keep` or `reset` on node change (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| A.2.288 | `Timeline.frame` | computed from the stage size from `measure` and `scrolled` | P4 | 4 |
| A.2.289,292 | `Timeline.room`, `--tc-room-*` | selector + `motion` variables | P4, P7 | 4 |
| A.2.290 | `Timeline.anchor` | `model.timeline.anchor` (`scroll` orders; `measure` reports scroll) | P1 | 4 |
| A.2.291 | timeline scrollTop writes | `scroll` | P7 | 4 |
| A.2.293-296 | `ScrollEdges` state and classes | `scroll`-local; fade output ownership (`scroll` orders; `measure` reports scroll) | P7 | 3 |

### text entry/quick bar

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.303,353-356 | `activeEditor`, `EmbeddedEditor` state, CodeMirror doc | `islands` | P7 | 3 |
| A.2.304 | `WriteQueue.tail` | file sequence | P2, P3 | 1 |
| A.2.305 | `QEC.state` | `model.entry` (the core session's snapshot) | P1, P7 | 3 |
| A.2.306,329 | `QEC.field`, `quiet` | `islands` (editor handle; owner set text is not input) | P7 | 3 |
| A.2.307,339,479 | `QEC.focused`, group name focus, field focus | `focus` | P7 | 3 |
| A.2.308 | `QEC.turning` | field layer (core `QuickEntrySession`) flag while the bar turns the wheel | P6, P7 | 4 |
| A.2.309 | `QEC.draws` | gone: read numbers | P2, P3 | 3 |
| A.2.310,340 | `pressEnding`, `FreeRoomDoubleClick.mouse` | `recognizers/` | P7 | 3 |
| A.2.311,313-314,316-317,319-325,327-328,330-331 | bar and field look (`is-entering`, bar state, buttons, tint, placeholder, plus hidden) | selectors over `model.entry` → JSX | P1 | 3 |
| A.2.315,326 | `QuickBar.leaving`, pointer-events while fading | presence transition (stays in the model until `motionSettled`) | P5 | 4 |
| A.2.318 | bar `is-gliding` | keyboard transition | P5 | 3 |
| A.2.312 | field element parent | view: row by key; field island mounted in it | P1, P7 | 3 |
| A.2.332-336 | `EntryRows.*` | `model.entry` + `model.rowKeys` (`rowKey(taskId)` bound by `CreatedTask`) [R8] | P1, P2 | 3 |
| A.2.337-338,352 | `RenamedTexts` | plugin-wide pending intents applied by the preview core (P3) [R8] | P3 | 2, 3 |
| A.2.341-343 | `TaskMenu.stackRow/fieldRow/fieldClosed` | overlay + field and entry layers (stack spot) (layer stack; data applies at once) | P6 | 3 |
| A.2.344-346 | `FullScreen.editing/draft/saveTimer` | `islands` + `sheet.full.description` (core session) + debounce timer command | P7 | 3 |
| A.2.347-351 | `FullScreen.state/field/focused/titleField/leavingTitle` | `sheet.full.entry` (a second core entry session); `focus` | P1 | 3 |
| A.2.357 | `markdown-rendered` | `islands` | P7 | 3 |
| A.2.358 | tree `askProjectName` slot | naming layer `{kind: newProject, gap, depth}` | P6 | 4 |
| A.2.359-361 | `Timeline.field`, `is-renaming`, field box | selector over `model.entry` in the timeline; `motion` variables | P1, P7 | 4 |
| A.2.362-363 | `TaskList.slot`, card `is-renaming` | naming layer; JSX | P1, P6 | 3 |

### menus/overlays/full/search

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.364,373 | `CS.search`, `BulkController.menu` | `model.overlay` stack entries | P6 | 4 |
| A.2.365,422-426 | `CS.full`, `FullScreen.stack/reading/closed/Escape/is-shown` | `model.sheet.full`; reads numbered; Escape order function; presence (stays in the model until `motionSettled`) | P6 | 4 |
| A.2.366,377 | menu `current`, `TaskMenu.context` | `overlay.task.key` remapped by write answers | P1 | 3 |
| A.2.367 | `QEC.stack` | overlay + entry (stack spot) (layer stack; data applies at once) | P6 | 3 |
| A.2.368-372 | bar panel state | field layer (core `QuickEntrySession`) `panel {kind, page}` (nested overlay); side from `measure` | P4, P6, P7 | 3 |
| A.2.374-376 | `FoundCard` | `model.found {key, scrollPending}`; `scroll` reveal | P1 | 4 |
| A.2.378-392 | `TaskMenu` parts, pages, asking, labelling, Enter, double-press, classes | menu layer `{kind: task, key, page, asking, labelling}`; parts are view (a Preact layer); boxes via `measure` (`motion` reads its boxes in the commit phase) | P1, P6 | 3 |
| A.2.393-403 | `LiftedMenu.gone`, `Overlay.*` | overlay `phase`; presence (stays in the model until `motionSettled`); Escape order over the stack (layer stack; data applies at once) [R10] | P5, P6 | 3 |
| A.2.404-407 | `Picks.*`, `giveUp` | write pick: number at the tap, runs at once; only its list transition waits for the sheet to close [R10] | P2, P3, P5 | 1, 3 |
| A.2.408-412 | `Panel.shown`, `PanelPages`, `MORPHS` | overlay `page`; page morph transition (B1.14) (a Preact layer) | P5 | 3 |
| A.2.413 | switch knob flipped before the write | the preview core's answer until the read retires the intent (P3) [R8] | P3 | 2, 3 |
| A.2.414 | menu tiles | JSX from the core menu model | P1 | 3 |
| A.2.415-421 | `BulkMenu`, project menu asking, `DescriptionPeek` placement | menu layer; peek side from `measure` | P4, P6 | 4 |
| A.2.427-430 | `SearchWindow.rows/picked/asked/closed` | `overlay.search {query, answer, picked}`; coalesced read | P2, P3, P6 | 4 |

### layout sizes

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.431 | `is-docking` + timer | dock-slide transition | P5 | 4 |
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
| A.2.460-466 | `RowsLayout` holds, fit timers, heights | selector `stackedLists(model.measured)`; heights move in the fold's own transition | P4, P5 | 3, 4 |
| A.2.467-469 | foot fade edge, row labels, field row presence | selectors | P1 | 3, 4 |
| A.2.470 | `is-leaving` read | gone: a leaving row is skipped by layout selectors | P4 | 3, 4 |
| A.2.471 | still-layout column widths | selector `layoutWidths` | P4 | 4 |
| A.2.472-474 | `SnapGlide` | `motion` | P5, P7 | 4 |

### platform/theme/keyboard

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.475 | `activeElement` read for Cmd+Z | `model.focus` | P7 | 3 |
| A.2.476-477 | `is-mobile`, `theme-light` | `chrome` → `model.platform`, `model.theme` | P4 | 3, 4 |
| A.2.478,489-490 | popout windows | plugin runtime window set; `chrome` per window | P7 | 1 |
| A.2.480,483 | bar `is-desk`, `is-keyboard-up` | JSX from `model.platform`, `model.chrome.keyboard` | P1 | 3 |
| A.2.481 | IME composing | `input` | P7 | 3 |
| A.2.482,484,494 | key scopes (field, tab, rendered editor) | `keys` driver (Obsidian `Scope`s) | P7 | 3, 4 |
| A.2.485-488 | `StatusBarRoom` | `chrome` | P7 | 4 |
| A.2.492-493 | full card `is-typing`, search focus | selector over `model.focus`; `focus` | P1, P7 | 4 |

### settings

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.495 | `CS.seen` | update compares `model.settings` before / after (settingsEffect as an update rule) | P1 | 4 |
| A.2.496-497 | plugin settings in memory, `rightMode` | plugin runtime (`host/`, `main.ts`): plugin settings held by the runtime; the `rightMode` hand-over is a host call, its write in the file sequence | P3, P7 | 1 |
| A.2.498-500 | view settings stores | effect runner subscription → `model.device`; events ignored while our writes are in flight, then one read | P2, P7 | 1 |
| A.2.501-502,509-512 | Settings tab page, colour preview, row reorder | settings-tab host: page and preview from its model; the row reorder is a declared transition | P1, P5 | 6 |
| A.2.503-508 | card size and priority colour body tokens | `chrome` per window from settings (`chrome` takes it from the model) | P7 | 3, 4 |
| A.2.513-516 | repeat page / editor | overlay page `repeat` (core `RepeatPage`) | P6, P7 | 3 |

### note blocks

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.517,519-523 | `ViewWatch.frame`, block registry, `asks` | host (block host); `asks` → coalesced `projectNoteView` read | P2, P3, P7 | 3 |
| A.2.518 | block key scope | `keys` driver (Obsidian `Scope`s) | P7 | 3 |
| A.2.524 | block position, `--tc-block-lift` | host block placement; lift from `measure` | P4, P7 | 3 |
| A.2.525 | focus in block | `focus` | P7 | 3 |
| A.2.526-527 | `BlockHeight` | `measure` (content height) → `motion` variable | P4 | 3 |

### undo

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.528 | undo button off | `model.canUndo` [R8] | P1 | 3, 4 |

### other

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A.2.529,538 | teardown list, tab's screen | runtime / host mount | P7 | 1 |
| A.2.530 | `CS.changing` | file sequence | P2, P3 | 1 |
| A.2.531 | arbiter claim `naming` | naming layer | P6 | 3 |
| A.2.532 | `services` for console | plugin runtime (`host/`) | P7 | 1 |
| A.2.533 | `DayData.shown` | gone: notification by selector equality | P2 | 4 |
| A.2.534-536 | `Reload` state | read-back after every write (P3); `beforeShow` → `rowKey(taskId)` bound by `CreatedTask` [R8] | P1, P2, P3 | 1 |
| A.2.537 | `ScreenParts.waiting` | gone: data applies at once; the active pointer gesture draws its pinned layout snapshot | P6 | 3, 4 |
| A.2.539 | `FramePass` | `measure` / `scroll` frame scheduling | P7 | 3 |
| A.2.540-541 | arbiter holder, idle listeners | `interaction.gesture`; pinned layout snapshot applied on its end (P6) | P6 | 3 |
| A.2.543-544 | `MonthPicker` month, day marks | overlay page `{month}`; JSX | P6 | 4 |
| A.2.545 | click listener per render | `islands` (MarkdownRenderer, created once) | P7 | 3 |
| A.2.546 | kit `Button` classes | JSX | P1 | 3 |
| A.2.547,551 | per-block / per-row `listening` | gone: Preact listeners | P7 | 3 |
| A.2.548,550 | ribbon / stage `tc-hidden` | JSX from `read.missing` | P1 | 4 |
| A.2.549 | `RowsLayout.destroyed` | gone | P7 | 3, 4 |
| A.2.552-561 | `Motion` styles and WeakMaps | `motion`-local | P7 | 3 |
| A.2.562 | `pinTo` inline boxes | `motion` variables | P7 | 3 |
| A.2.563-565 | prototype `Store` | replaced by the runtime | — | 1, 7 |

## B.1–B.6 Effects (819) and event sources (180)

Row ids number the rows of each table in file order: B.1.1–142, B.2.1–244, B.3.1–135, B.4.1–174, B.5.1–124, B.6.1–180.

### B.1 G0: CalendarScreen, main.ts, compose.ts

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| B.1.1-4,6-8,10-13,16,60-61,66,73,75-79,82-83,85,87,89-91,95-104,107,113-115,118-119,121,123 | task writes (`act`) | Cmd `write(op)` in the file sequence; read with its number; `failed` on error [R9] | P2, P3 | 1 |
| B.1.17-18 | `startCarry`, `endCarry` | Cmd `carry(start or end)` in the file sequence; the core's carry session (core session held by the runtime) [R9] | P2, P3, P7 | 1 |
| B.1.5,9,14-15,19-20,22-26,28-30,53,55-56,93,122 | synchronous service reads (`bulkMenu`, `carried`, `snap`, `stretch`, `firstPlace`, `relation`, `today`, `boundary`, `shownSpan`, `isPast`, `dropSpan`, `newSlot`, `findIn`, `listName`, `stepFunnel`, `columnSections`, `menu`, `openAt`) | (`CoreQueries`, clock from `model.now`) core queries | P7 | 1 |
| B.1.27,34,39,63,81,84,92,94 | event, sources, more, search, section, project menus; full card; task menu | `model.overlay` / `model.sheet` (a Preact layer) | P6 | 4 |
| B.1.31 | quick entry shows the day it wrote to | Msg `entryShowsDay` → `model.day` + read command | P2, P3 | 3 |
| B.1.32,38,48,50,71 | rereads (fresh, after undo, load, day passed, after failure) | read Cmd in the file sequence [R8] | P2, P3 | 1 |
| B.1.33,57 | wheel turned, swipe landed on a place | ribbon / wheel gesture → Cmd `setFunnelPlace` [R11] | P6 | 4 |
| B.1.35,44-47,52 | calendar poll and refresh | network lane (network lane, latest per day) | P2 | 1 |
| B.1.36 | undo / redo | Cmd `undo` in the file sequence [R8] | P2, P3 | 1 |
| B.1.37,69-70 | notices | Cmd `notice` [R8] | P2 | 1 |
| B.1.40-43 | service subscriptions | runtime inputs → `fileChanged`, `calendarsChanged`, `settingsChanged`, `dayChanged` | P2 | 1 |
| B.1.49 | `Timeline.tickNow` | `tick` → `model.now` (applies at once (P6)) | P6 | 1 |
| B.1.51 | select today on day moved | update rule on `dayChanged` | P2 | 4 |
| B.1.54,72,120 | view settings writes (`listShare`, `zoom`, `treeWidth`) | Cmd `device.set` (store events ignored while our writes are in flight, then one read) | P2, P3 | 1 |
| B.1.21,58-59 | day step, day swipe landed, day turn | day-swipe gesture; read command for the new day [R11] | P6 | 4 |
| B.1.62 | haptics | Cmd `haptic` | P7 | 1 |
| B.1.64-65,108 | `reveal`, `filterHides`, `lineOf` (async reads) | read Cmd | P2, P3 | 1 |
| B.1.67 | after reveal: day, wheel, place | update on `revealed` | P2 | 4 |
| B.1.68 | `Timeline.select(null)` | update on `pressedElsewhere` | P6 | 4 |
| B.1.74 | `projectsDropPreview` | pending intent applied by the preview core (P3) (landing card at the line, A6.14) [R8] | P3 | 2, 3 |
| B.1.80 | section name field + scrollIntoView | naming layer; `focus`; `scroll` reveal | P6, P7 | 3 |
| B.1.86 | NoteSearch modal | `islands` (Obsidian `Modal`) | P7 | 3 |
| B.1.88,109-111 | open note / file / link / URL | Cmd `obsidian.open` | P7 | 1 |
| B.1.105-106 | rename / add subtask | field layer (core `QuickEntrySession`) open | P6, P7 | 3 |
| B.1.112 | `funnelView` / `projectNoteView` in each read | part of the read command | P2, P3 | 1 |
| B.1.116-117 | `projectsTakes`, `projectsPlusPlace` (pure) | core pure rules in update | P4 | 3 |
| B.1.124-126 | interval, landing / dock timers, pinch rAF | runtime clock; timer Cmds; transient channel; dispatch on a step [R11] | P3, P7 | 1 |
| B.1.127 | `StatusBarRoom.hold` | `chrome` | P7 | 4 |
| B.1.128-139,141-142 | plugin load, settings file, code watcher, registrations, protocol, login, sync, device storage, place hand-over, open view, popouts, sync notice, core timers | plugin runtime (`host/`): lifecycle, protocol actions, login, the place hand-over call services there (allowed in `host/`); tasks-file writes in the file sequence, settings writes numbered | P3, P7 | 1 |
| B.1.140 | osascript (open event in Calendar) | Cmd `openInCalendar` | P7 | 1 |

### B.2 G1

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| B.2.1-3 | calendar events fetch and cache | network lane (network lane, latest per day) | P2 | 1 |
| B.2.4-6 | task reads (`funnelView`, `screen`, `projectsScreen`) | read Cmd in the file sequence | P2, P3 | 1 |
| B.2.7-9 | `onUpdate`, ScreenParts, draw | notification by selector; the `ScreenParts` hold is gone (P6) | P2, P6 | 1, 3 |
| B.2.10,29-65 | quick entry session construction and every session call | field layer (core `QuickEntrySession`) = the core session (core session held by the runtime); writes in the file sequence | P2, P3, P6, P7 | 3 |
| B.2.11-19 | entry helpers (`placementOf`, `parseTitle`, `isBlank`, …) | core pure rules in update / selectors | P1 | 3 |
| B.2.20-23 | session writes (`createSection`, `edit`, `unfoldAbove`, `createWithId`) | file sequence (the session's `WriteLine` is the sequence) [R8] | P2, P3 | 1 |
| B.2.24 | `list.adopt(created.id)` | `model.rowKeys` (`rowKey(taskId)` bound by `CreatedTask`) [R8] | P1 | 3 |
| B.2.25-27,109,111-112 | `listName`, `placementTitle`, `placementOfDay` | (`CoreQueries`, clock from `model.now`) core queries | P7 | 3 |
| B.2.28 | `newProject` from the bar | Cmd write | P2, P3 | 1 |
| B.2.66-67 | entry `fresh` reads | read Cmd in the file sequence [R8] | P2, P3 | 1 |
| B.2.68,71 | entry render requests | notification by selector | P2 | 3 |
| B.2.69-70 | lock panel, forget typed | selectors; entry end | P1 | 3 |
| B.2.72 | bar turns the wheel | entry + ribbon gestures (layer stack; data applies at once) | P6 | 4 |
| B.2.73 | bar shows another day | `model.day` + read Cmd, ordered after the entry's writes (pick kinds; number taken at the tap) | P2, P3 | 3 |
| B.2.74-77 | plus drag (and aside on by project) | carry gesture `payload: plus` | P6 | 3 |
| B.2.78-86 | menu stack and timeline field calls | overlay + field and entry layers; selectors (layer stack; data applies at once) | P6 | 4 |
| B.2.87 | bar show / hide / follow | JSX from `model.entry` + `measure` | P1, P4 | 3 |
| B.2.88,242 | field / name input focus | `focus` | P7 | 3 |
| B.2.89-91 | reveal scroll, glide, wait for growth | `scroll` reveal; `motionSettled` | P5, P7 | 3 |
| B.2.92 | blur check timer | `focus` reports `blurred`; update decides | P7 | 3 |
| B.2.93-95 | entry listeners and observers | `input` / `measure` | P7 | 3 |
| B.2.96,100,103-108,110 | bar button callbacks | entry Msgs | P6 | 3 |
| B.2.97,101-102 | bar panel open / redraw / pick | nested overlay in the field layer (core `QuickEntrySession`) (a Preact layer) | P6, P7 | 3 |
| B.2.98 | document press while panel open | `input` → `pressedElsewhere` | P7 | 3 |
| B.2.99,113-114 | bar panel and capsule appear / fade | presence transitions (stays in the model until `motionSettled`) | P5 | 3 |
| B.2.115-121 | title field editor | `islands` (EmbeddedEditor); key scope (`keys` driver) | P7 | 3 |
| B.2.122-124 | plus press, tap, drag | `input` → carry / entry | P7 | 3 |
| B.2.125-126 | ring, `tc-cancelling` | JSX; `chrome` body class (`chrome` takes it from the model) | P1, P7 | 3 |
| B.2.127-129 | `ScrollGlide` | `scroll` | P7 | 3 |
| B.2.130 | status bar query | `chrome` | P7 | 4 |
| B.2.131-133 | `EntryRows` drawing | view + `model.rowKeys` [R8] | P1 | 3 |
| B.2.134-135 | keyboard will show / hide | `chrome` → `model.chrome.keyboard`; keyboard transition | P4, P5 | 3 |
| B.2.136-141 | view settings file / store | Cmd `device.set`; subscription → `model.device` (store events ignored while our writes are in flight, then one read) | P2, P3 | 1 |
| B.2.142,145-147 | tab: screen create / open / close / resize | host mount; `measure` | P7 | 1 |
| B.2.143-144 | tab key scope, undo / find keys | `keys` driver (Obsidian `Scope`s) → Msgs [R8] | P7 | 3, 4 |
| B.2.148-149 | `ViewWatch` | host block | P7 | 3 |
| B.2.150,152,154-157,159-160,162-163,165-166,168-170 | note block lifecycle, placement, events | host block | P7 | 3 |
| B.2.151,158 | block key scope | `keys` driver (Obsidian `Scope`s) | P7 | 3 |
| B.2.153 | block focus | `focus` | P7 | 3 |
| B.2.161,164 | block `onChange`, `projectNoteView` | runtime input; coalesced read Cmd | P2, P3 | 3 |
| B.2.167 | `--tc-block-lift` | host block placement from `measure` | P4 | 3 |
| B.2.171-223 | Settings tab and its pages | settings-tab host; its service calls go through the runtime in slice 1 (settings writes numbered), the tab itself is rebuilt in slice 6 | P2, P3, P7 | 1, 6 |
| B.2.224-225,228 | undo button: `canUndo`, `onUndo` | `model.canUndo` (`CoreQueries`, clock from `model.now`); Msg `undo` [R8] | P1 | 1 |
| B.2.226 | ⋯ pressed | overlay `more` | P6 | 3 |
| B.2.227 | `UndoService.onChange` | runtime input `undoChanged` | P2 | 1 |
| B.2.229-230 | `StatusBarRoom` observers, body class | `chrome` | P7 | 4 |
| B.2.231-235 | card size, priority colours, label paint on body | `chrome` per window (`chrome` takes it from the model) | P7 | 3, 4 |
| B.2.236-237 | haptics | Cmd `haptic` | P7 | 1 |
| B.2.238 | `execCommand` undo | `input` | P7 | 3 |
| B.2.239-241 | `SectionNameEntry` | naming layer = the core session (core session held by the runtime) | P6, P7 | 3 |
| B.2.243 | `FramePass` | driver frame scheduling | P7 | 3 |
| B.2.244 | popout listener | host / `chrome` | P7 | 1 |

### B.3 G2

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| B.3.1-3,8,34-36,72-73,85-88 | `snap`, `stretch`, `carried`, `dropSpan`, `newSlot`, `bulkMenu`, peek reads (`shownSpan`, `isPast`, `relation`, `columnSections`) | (`CoreQueries`, clock from `model.now`) core queries | P7 | 4 |
| B.3.4-5,9-11,38,62-71,96,102 | writes through deps (resize, drop, fold, mark, move section, bulk, place) | Cmd write in the file sequence [R9] | P2, P3 | 1 |
| B.3.6-7 | `startCarry`, `endCarry` via deps | Cmd carry (core session held by the runtime) [R9] | P2, P7 | 1 |
| B.3.12-15,19,40,74,103 | task / event / group / bulk menus, sources popover | `model.overlay` | P6 | 4 |
| B.3.16-18 | timeline selection set / cleared | `model.timeline.selected` | P1, P6 | 4 |
| B.3.20 | rename on second click | overlay → entry | P6 | 3 |
| B.3.21-22 | new slot gesture | timeline new-slot gesture → entry | P6 | 4 |
| B.3.23-24 | `layoutTasks`, `stretchTo` | selectors + transitions | P1, P5 | 3 |
| B.3.25,41,109 | haptics | Cmd `haptic` | P7 | 1 |
| B.3.26-27 | `onDragging`, `moved` → carryAt | carry Msgs; `carryAt` Cmd | P2, P6 | 3 |
| B.3.28 | `onError` → reportFailure | `failed` Msg + notice | P2 | 1 |
| B.3.29,39 | `console.error` | action log | P2 | 1 |
| B.3.30,51-55 | floats, plus float, drop line | JSX + transient channel + transitions | P5, P7 | 3 |
| B.3.31 | `DragSession.landNow` | `motion` finishes the running flight when a new carry starts | P5 | 3 |
| B.3.32-33 | plus drop result, targets cleared | carry gesture outcome → entry open | P6 | 3 |
| B.3.37 | `timeline.showDrop` | JSX | P1 | 4 |
| B.3.42-44 | section landing, settle, float animation | section-lift gesture; transitions | P5, P6 | 3 |
| B.3.45-50 | `DragSession` float phases, end, return, targets | carry gesture + `motion` [R9] | P5, P6 | 3 |
| B.3.56-58 | auto-scroll | `scroll` `edge`; offsets back to carry (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| B.3.59 | `ArrivingCard` toggles | pending intent applied by the preview core (P3) [R8] | P3 | 2, 3 |
| B.3.60-61 | `LongPress` timer, outcomes | `recognizers/` | P7 | 3 |
| B.3.75-79 | bulk capsule, ring, count, pick circles | JSX from `model.selection` | P1 | 4 |
| B.3.80-81 | found card scroll | `scroll` reveal | P7 | 4 |
| B.3.82-84 | peek reads (`dayView`, `events`, `fresh`) | neighbours read ahead by the runtime (tasks; events through the network lane) [R11] | P2, P3 | 4 |
| B.3.89-90 | peek render, align | view for the neighbour day | P1, P3 | 4 |
| B.3.91,93-95 | swipe → pager follow / settle / frames | swipe gestures + transient channel + settle transition (a tap leaves the settle running) | P5, P6 | 4 |
| B.3.97-101 | strip / day tracks | `motion`; day-swipe `nearer`, `landing` | P5 | 4 |
| B.3.104,106 | wheel dot, label | selectors | P1 | 4 |
| B.3.105 | wheel timers | `recognizers/` / timer Cmd | P7 | 4 |
| B.3.107,110 | divider and pinch settings writes | Cmd `device.set` (store events ignored while our writes are in flight, then one read) | P2, P3 | 1 |
| B.3.108 | divider width live | transient channel; dispatch on a step | P4 | 4 |
| B.3.111 | pinch scale | transient channel; dispatch on a step | P4 | 4 |
| B.3.112-113 | wheel preventDefault, wheel zoom settle | `input`; `recognizers/` timer | P7 | 4 |
| B.3.114-117 | settings row reorder | settings-tab host: the row-reorder gesture and its transition | P5, P6 | 6 |
| B.3.118 | free-room double click | `input` → entry `openAtEnd` | P7 | 3 |
| B.3.92 | horizontal wheel preventDefault | `input` | P7 | 4 |
| B.3.119-135 | pure core rules (`placeAt`, `swipeLanding`, `dividerAt`, …) | pure rules in update / selectors | P4 | 4 |

### B.4 G3

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| B.4.1-5,36-39,79,105 | menu models, `fullTree`, `listName` | (`CoreQueries`, clock from `model.now`) core queries | P7 | 4 |
| B.4.6-18,40-51,54,56,59-60,173 | menu writes | Cmd write; pick slot in the file sequence (pick kinds; number taken at the tap) [R10] | P2, P3 | 1 |
| B.4.19-22 | `RepeatPage` | overlay page = the core session (core session held by the runtime); write on close [R10] | P6, P7 | 3 |
| B.4.23,28,58,68 | open link / in Obsidian / note / in Calendar | Cmd `obsidian.open` / `openInCalendar` | P7 | 1 |
| B.4.24-26,29,53,55,57 | typing picks (`pickNow`): rename, description, subtask, new section, project rename, attach note | typing picks: the user's event handled to the end, focus last | P2, P6, P7 | 3 |
| B.4.27,31 | open full card from menu / peek | overlay pick → `model.sheet.full` | P6 | 4 |
| B.4.30,66 | subtask menu over the same sheet; ⋯ → Search | hand-over: one layer transition | P6 | 3, 4 |
| B.4.32,52,62,133,166 | lifted copy, bulk close, link closes menu, view menu, project menu | menu layer (a Preact layer) | P6 | 3 |
| B.4.33 | second press within double click | overlay → entry rename | P6 | 3 |
| B.4.34 | menu closed while typing | entry Msg (layer stack; data applies at once) | P6 | 3 |
| B.4.35,69,129,132,134-135,141-144,146-147 | pure rules (`labelTitle`, `grownStart`, `editRepeat`, `projectsEntryLook`, `projectsDrop`, …) | pure rules in update / selectors | P1 | 3, 4 |
| B.4.61,85,87,91-92,111-128 | MarkdownRenderer, EmbeddedEditor, ObsidianMarkdown, line commands, scopes | `islands` (key scopes (`keys` driver)) | P7 | 3 |
| B.4.63-65 | month pick, view mode, Subprojects | overlay page; Cmd write after the entry ends (pick kinds; number taken at the tap) [R9] [R10] | P2, P3, P6 | 3 |
| B.4.67 | Select tasks | `model.selection.mode` (layer stack; data applies at once) | P6 | 4 |
| B.4.70 | menu waits for the column to scroll the card in | overlay `revealing` + `scroll` (`scroll` orders; `measure` reports scroll) | P6, P7 | 3 |
| B.4.71,77,84,86,88-89,93-98,100-101 | full card entry session and description draft | `sheet.full` = the core sessions (core session held by the runtime) | P6, P7 | 3 |
| B.4.72 | `RenamedTexts.add` | plugin-wide pending intents applied by the preview core (P3) [R8] | P3 | 2, 3 |
| B.4.73-76 | full card capsule (undo, ⋯, plus) | `model.canUndo`; overlay; entry [R8] | P1, P6 | 3 |
| B.4.78,83 | `find` (async) | read Cmd | P2, P3 | 3 |
| B.4.80,90 | `toggleDone`, `setDescription` (debounced) | Cmd write; debounce timer Cmd | P2, P3 | 1 |
| B.4.81-82 | subtask menu, project line | overlay; Cmd + close [R9] | P6 | 3 |
| B.4.99 | title field | `islands` | P7 | 3 |
| B.4.102-103 | full card close / error | Msgs | P6 | 3 |
| B.4.104 | search | read Cmd, coalesced by key | P2, P3 | 4 |
| B.4.106-107 | search pick / close | overlay → `revealed` [R9] | P6 | 4 |
| B.4.108 | search takes the ⋯ sheet | hand-over: search takes the ⋯ sheet | P6 | 4 |
| B.4.109 | field's own undo | `input` | P7 | 3 |
| B.4.110 | Refresh now | network lane | P2 | 1 |
| B.4.130-131 | repeat change / remove | overlay page Msgs | P6 | 3 |
| B.4.136-140,145 | by-project reads of the model and handlers | selectors; JSX handlers | P1 | 3, 4 |
| B.4.148-149,151-152,161,167 | tree / list drops, close dim, pick node, move project, clear filter | Cmd write [R9] | P2, P3 | 1 |
| B.4.150,155,160 | haptics | Cmd `haptic` | P7 | 1 |
| B.4.153 | panel width → frame | `measure` | P4 | 4 |
| B.4.154 | tree width save | Cmd `device.set` (store events ignored while our writes are in flight, then one read) | P2, P3 | 1 |
| B.4.156 | tree width read | `model.device.treeWidth` | P1 | 4 |
| B.4.157,168 | new project / rename project name field | naming layer | P6 | 3, 4 |
| B.4.158-159 | tree row tap, row lift attach | Msg; tree-lift gesture | P6 | 4 |
| B.4.162-165 | `carryAt`, reread, clock, error | Cmd `carryAt` + timer; read; `model.now`; `failed` (core session held by the runtime) [R9] | P2, P3, P7 | 3 |
| B.4.169 | carry deps | carry gesture | P6 | 3 |
| B.4.170-172 | note search modal | `islands` | P7 | 4 |
| B.4.174 | grips | `input` → resize gesture | P7 | 3 |

### B.5 G4

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| B.5.1-9,12,22,65,68,73-74,83,96,100 | timeline / list core reads (`DayBoundary`, `shownSpan`, `relation`, clock, `isPast`, `listName`, `stepFunnel`) | (`CoreQueries`, clock from `model.now`) core queries; clock → `model.now` | P7 | 3, 4 |
| B.5.10-11,13-21,23,40-41,60,63-64,79,90-91,95,103 | pure rules | pure rules in selectors | P1, P4 | 3, 4 |
| B.5.24-26,39,42-46,48-50,53,75,81-82,102,104-105 | reads of screen state through deps | selectors | P1 | 3, 4 |
| B.5.27-29,47,51-52,54,76,107-110 | handlers attached per row / block | JSX handlers → `input` Msgs | P7 | 3 |
| B.5.30,66,121 | timeline resize, block scroller, block fit frame | `measure` | P4 | 3, 4 |
| B.5.31 | grips attach | `input` | P7 | 3 |
| B.5.32 | drop line in body | JSX portal | P1 | 3 |
| B.5.33-37 | timeline block motions on render | transitions by cause (keyed diff within one context); leaving rows skipped by layout selectors; fold and heights one transition (P4) | P4, P5 | 4 |
| B.5.38,61 | `RenamedTexts.shown` | plugin-wide pending intents applied by the preview core (P3) [R8] | P3 | 2, 3 |
| B.5.55 | `EntryRows` | view + `model.rowKeys` [R8] | P1 | 3 |
| B.5.56,58,117-118 | ScrollHold, ScrollEdges, glides | `scroll` | P7 | 3 |
| B.5.57 | grow room under a plate | transition B1.9 | P5 | 3 |
| B.5.59 | landing render | JSX from section-lift gesture | P1 | 3 |
| B.5.62,72 | icons, kit buttons | JSX | P1 | 3, 4 |
| B.5.67 | `CARD_HEIGHTS.max` | constant | P1 | 3 |
| B.5.69-71 | day arrows, Today | day-swipe Msgs | P6 | 4 |
| B.5.77,80,93,106 | divider live width, haptics | transient channel; Cmd `haptic` | P4, P7 | 4 |
| B.5.78,92 | share saves | Cmd `device.set` (store events ignored while our writes are in flight, then one read) | P2, P3 | 1 |
| B.5.84-86 | ribbon day track / follow / arrive | swipe gestures | P6 | 4 |
| B.5.87-88 | `is-switching` timers | ribbon slide transition | P5 | 4 |
| B.5.89,94,101 | shared nav placement, by-project mount | view composition | P1 | 3, 4 |
| B.5.97-99 | rows heights motion, fit frame, settle refit | the fold and the heights that depend on it, one transition; layout selectors skip leaving rows; heights never held | P4, P5 | 3, 4 |
| B.5.111-116 | keyed rows motion | transitions by cause (keyed diff within one context); leaving rows skipped by layout selectors; fold and heights one transition (P4) | P4, P5 | 3 |
| B.5.119-120 | `SnapGlide` | `motion` | P5 | 4 |
| B.5.122-124 | prototype | replaced by the runtime | — | 1, 7 |

### B.6 event sources

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| B.6.1 | `TaskService.onChange` | `fileChanged` → read queued in the file sequence (read-back, numbered (P3)); full card re-read (layer stack; data applies at once) | P2, P3 | 1 |
| B.6.2,13 | calendar change, poll | network lane | P2 | 1 |
| B.6.3,47-48 | settings / view settings change | `settingsChanged` (store events ignored while our writes are in flight, then one read) | P2, P3 | 1 |
| B.6.4 | day change | `dayChanged` (applies at once (P6)) | P6 | 4 |
| B.6.5-7 | focus, visibility, active leaf | `chrome` → `model.visible`; poll wake | P4 | 3, 4 |
| B.6.8 | document pointerdown ×3 | `input` → `pressedElsewhere` | P7 | 3 |
| B.6.9 | document keydown (bulk) | `input` | P7 | 4 |
| B.6.10,95 | arbiter idle | gone: at the gesture's end the move from its pinned snapshot to the current layout is a keyed transition | P5, P6 | 3, 4 |
| B.6.11 | `css-change` | `chrome` → `model.theme` | P4 | 3, 4 |
| B.6.12,155 | minute interval, tick | clock → `model.now` | P2 | 1 |
| B.6.14,50 | view resize | `measure` stage size | P4 | 4 |
| B.6.15-19,49 | plugin settings, visibility, vault raw, popouts, sync leave | plugin runtime inputs → messages to every screen's store | P2, P7 | 1 |
| B.6.20 | DayData driven by calls | runtime | P2 | 1 |
| B.6.21,97-99 | session `onChange` / `fresh` / `renamed` | entry / full card = core sessions (core session held by the runtime) | P6, P7 | 3 |
| B.6.22-24,35-36 | tap away, press ending, bar presses | `input` | P7 | 3 |
| B.6.25-26 | root scroll, hand scroll | `scroll` `userScrolled` | P7 | 3 |
| B.6.27,34,37 | transitionend, fade finish | `motionSettled` | P5 | 3 |
| B.6.28-29,38 | resize observers, panel place | `measure` | P4 | 4 |
| B.6.30 | field growth finished | `motionSettled` | P5 | 3 |
| B.6.31,104 | blur timers | `focus` → `blurred` | P7 | 3 |
| B.6.32-33 | FramePass, ScrollGlide frames | drivers | P7 | 3 |
| B.6.39 | bar repeat panel change | entry Msg | P6 | 3 |
| B.6.40-44 | field editor change, keys, IME, focus | `islands` + `input` (scopes (`keys` driver)) | P7 | 3 |
| B.6.45 | plus pointer | `input` | P7 | 3 |
| B.6.46 | keyboard events | `chrome` | P4 | 4 |
| B.6.51,59 | tab / block key scopes | `keys` driver (Obsidian `Scope`s) | P7 | 3, 4 |
| B.6.52-58 | note block events | host block | P7 | 3 |
| B.6.60,106 | `UndoService.onChange` | `undoChanged` → `model.canUndo` | P2 | 3, 4 |
| B.6.61 | status bar observer | `chrome` | P7 | 4 |
| B.6.62-66 | Settings tab events | settings-tab host: inputs → messages | P2, P7 | 6 |
| B.6.67 | popout opens | host / `chrome` (`chrome` takes it from the model) | P7 | 1 |
| B.6.68 | section name field keys / blur | naming layer (core session) | P6, P7 | 3 |
| B.6.69 | field undo keys | `input` | P7 | 3 |
| B.6.70-78 | card / block / event / canvas / drag / resize / section / long-press pointer events | `input` → carry, timeline and section-lift gestures | P6, P7 | 4 |
| B.6.79 | auto-scroll frame | `scroll` (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| B.6.80-81 | flight timers, section float finished | `motionSettled` (timeout message) | P5 | 3 |
| B.6.82-83 | peek reads resolve | `neighbourRead` Msg (read ahead) [R11] | P2, P3 | 4 |
| B.6.84-86 | swipe pointer, wheel stream timer, pager frame | `recognizers/` + `motion` | P7 | 4 |
| B.6.87-88 | pinch pointer / wheel, wheel settle | `input` + pinch gesture | P7 | 4 |
| B.6.89-90 | wheel pointer, click, keys, timers | `input` + wheel-drag gesture | P7 | 4 |
| B.6.91,165 | divider gestures (ribbon) | `input` + divider gesture | P7 | 4 |
| B.6.166 | divider gestures (still layouts) | `input` + divider gesture | P7 | 4 |
| B.6.92 | settings row reorder | settings-tab host: reorder gesture through `input` and `recognizers/`; the order write numbered | P3, P6, P7 | 6 |
| B.6.93,159-161 | free room double click, plates | `input` → entry | P7 | 3 |
| B.6.94 | found card frame | `scroll` reveal | P7 | 4 |
| B.6.96,100-103 | full card refresh, title rename end, description save, focus, Escape | `sheet.full` Msgs; Escape order (layer stack; data applies at once) | P6 | 3 |
| B.6.105,112-113 | full card / overlay show and remove frames | presence (stays in the model until `motionSettled`) [R10] | P5 | 3 |
| B.6.107-109 | search input, keys, row click | overlay search | P6 | 4 |
| B.6.110-111 | overlay Escape, backdrop | `input` → overlay close | P7 | 3 |
| B.6.114 | `Picks.giveUp` | (timeout message) bounded wait [R10] | P2 | 3, 4 |
| B.6.115-117,121-127 | menu events (Enter, double press, copy click, peek, view menu frame, month arrows, switch, toggles) | overlay Msgs (a Preact layer) | P6 | 4 |
| B.6.118 | stack field row grows | transition | P5 | 3 |
| B.6.119 | menu after the column scroll | overlay `revealing` + `scroll` (`scroll` orders; `measure` reports scroll) | P6 | 3 |
| B.6.120 | page morph finished | `motionSettled` | P5 | 3 |
| B.6.128-132 | embedded editor focus, update, keys, rendered click | `islands` | P7 | 3 |
| B.6.133,135 | tree panel resize, tree divider | `measure`; tree-divider gesture | P4, P6 | 4 |
| B.6.134,136,141-143 | dim, tree row, filter title, plate | Msgs | P6 | 4 |
| B.6.137-138 | tree lift | `input` + tree-lift gesture | P7 | 4 |
| B.6.139-140 | carry report timer, move / end | Cmd `carryAt` + timer (core session held by the runtime) [R9] | P2, P7 | 3 |
| B.6.144 | repeat editor buttons | overlay page Msg | P6 | 3 |
| B.6.145 | view button | overlay `view` | P6 | 3 |
| B.6.146 | note chosen | `islands` → Cmd write | P2, P3 | 3 |
| B.6.147-148,152 | grips, kit buttons | `input` | P7 | 3 |
| B.6.149 | timeline resize observer | `measure`; anchor held (`scroll` orders; `measure` reports scroll) | P4 | 4 |
| B.6.150-151 | wheel / touch drop the anchor | `input` → `userScrolled(timeline)` | P7 | 4 |
| B.6.153,156-158 | ScrollEdges, ScrollHold | `scroll` (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| B.6.154,173-174 | motion finished (block gone, row grown / left) | `motionSettled`; leaving rows skipped by layout selectors (P4) | P4, P5 | 3 |
| B.6.162-164 | note block observers and frame | `measure` | P4 | 3 |
| B.6.167-168 | strip track callbacks, slide end | `motion` | P5 | 4 |
| B.6.169-171 | rows observer, fit frame, settle | `measure`; `motionSettled`; heights never held | P4, P5 | 3, 4 |
| B.6.172 | drop hover in rows | carry target | P6 | 3, 4 |
| B.6.175-176 | glide stopped by a finger, glide end | `scroll` `userScrolled`, `scrollSettled` (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| B.6.177 | `SnapGlide` frames | `motion` | P5 | 4 |
| B.6.178-180 | prototype | replaced by the runtime | — | 1, 7 |

## Behaviour (203 inputs, 84 motions, 84 measurements, 52 screen states)

Row ids are the ids of `inventory-behaviour.md` (it has no C1.16; C1 holds 23 rows).

### A. Inputs and gestures

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| A1.1-2 | open the tab (ribbon icon, command) | host (plugin) opens the view; runtime mounts a screen | P7 | 1 |
| A1.3 | note block appears | host block; same view in a block host | P7 | 3 |
| A1.4 | several tabs, popouts | one runtime per plugin; file sequence shared; `chrome` per window | P2, P3, P7 | 1 |
| A2.1 | tap a card → task menu after reveal | tap `recognizers/` → overlay `task` with `revealing` (`scroll` orders; `measure` reports scroll) | P6 | 3 |
| A2.2 | counter tap folds subtasks | Cmd `toggleCollapsed`; fold motion by cause (keyed diff within one context) [R8] | P2, P5 | 3 |
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
| A5.10-11 | plus at the left edge / over a tree row | core carry session (core session held by the runtime) | P6, P7 | 4 |
| A6.1-5,7,9,11-13 | drag moves, targets, cancel, cross ring, tree drop | carry gesture; targets computed from `model.measured` and the core's rules; pinned, `targetChanged` on a read [R8] [R9] | P4, P6 | 3, 4 |
| A6.6 | auto-scroll at edges | `scroll` `edge`; offsets back to the carry (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| A6.8 | hover a tree row 600 ms → node opens | core carry; read the carry asked for applies at once (pinned drop places, `targetChanged` (P6)) [R9] | P6 | 4 |
| A6.10 | let go → write, then flight to the real place | the preview core's answer (P3) + flight transition [R8] [R9] | P3, P5 | 2, 3 |
| A6.14 | let go among by-project cards | the preview core's answer: the landing card at the line (P3) [R8] [R9] | P3 | 2, 3 |
| A6.15 | new drag while a copy flies | `motion` finishes the running flight | P5 | 3 |
| A6.16 | no redraw under a gesture | the active pointer gesture draws its pinned layout snapshot; a node opened by a held card is a change of the carry's own context, drawn in place | P5, P6 | 3, 4 |
| A6.17 | iOS lost lift | `input` (new primary finger ends the gesture) | P7 | 3 |
| A6.18 | view closed mid-drag | runtime teardown cancels the layer | P7 | 3 |
| A6.19 | lifted block leaves the timeline stack | selector `stackTasks` without `carry.lifted`; transition | P1, P5 | 4 |
| A7.1-5 | finger swipe, vertical scroll, trackpad swipe, ctrl-wheel, rubber band | ribbon swipe gesture + `recognizers/` | P6, P7 | 4 |
| A7.6 | finger down while the screen runs | a tap leaves the settle running and goes to what it hit | P5, P6 | 4 |
| A7.7 | new swipe during a run | ribbon swipe catches the running transition | P5, P6 | 4 |
| A7.8 | no swipe in other modes / block | selector `hasPages` | P1 | 4 |
| A7.9-14 | wheel tap, quick / slow drag, long press, arrows, cancel | wheel-drag gesture; careful pace `recognizers/` [R11] | P6 | 4 |
| A7.15 | leaving Done | update rule on place change | P2 | 4 |
| A7.16-18 | ‹ ›, title → today, repeated taps | day-swipe gesture and its queue (timeout message) [R11] | P6 | 4 |
| A7.19 | switch day / place with a field open | the field's writes numbered first; the switch is a transaction; a bar place keeps the field layer | P3, P6 | 4 |
| A8.1-2 | ribbon divider, snap glide | divider gesture; snap transition | P5, P6 | 4 |
| A8.3 | still layouts' divider | divider gesture | P6 | 4 |
| A8.4 | tree divider | tree-divider gesture; lists give way live (transient channel; dispatch on a step) | P6 | 4 |
| A8.5 | fixed halves | view (not draggable) | P1 | 4 |
| A9.1-3,6 | folder button, tree row, dim, cross | Cmd writes (`setProjectsPanel`, `pickProjectNode`, `clearProjectFilter`) [R9] | P2, P3 | 4 |
| A9.4 | project lift | tree-lift gesture | P6 | 4 |
| A9.5,8,10-11 | project menu, folder switch, note, delete | overlay `project` (a Preact layer) [R10] | P6 | 3 |
| A9.7 | rename project | naming layer | P6 | 3, 4 |
| A9.9 | attach note | `islands` (Obsidian `FuzzySuggestModal`), opened by a typing pick | P6, P7 | 3 |
| A10.1-3 | view button, mode, Subprojects | overlay `view`; Cmd writes after the entry ends [R9] [R10] | P2, P3, P6 | 3 |
| A11.1 | undo | Cmd `undo`; motion of what it changed (keyed diff within one context) [R8] | P2, P3, P5 | 1 |
| A11.2-3 | ⋯ menu, Search on the same sheet | menu layer `more` → `search` by one hand-over | P6 | 4 |
| A11.4-6 | select mode | `model.selection.mode` (layer stack; data applies at once) | P6 | 4 |
| A11.7 | press outside clears selection | `pressedElsewhere` | P6 | 4 |
| A11.8-11 | search typing, keys, pick, cancel | overlay `search`; coalesced read | P2, P3, P6 | 4 |
| A11.12-13 | Cmd+F, Cmd+Z in the view | `keys` driver (Obsidian `Scope`s) → Msgs [R8] | P7 | 3, 4 |
| A11.14 | Cmd+Z in a plain field | `input` | P7 | 3 |
| A11.15 | any press clears the found ring | `pressedElsewhere` → `model.found = null` | P6 | 4 |
| A12.1-3 | backdrop, Escape, Enter confirms | menu layer; Escape order over the stack (layer stack; data applies at once) | P6 | 3 |
| A12.4 | first pick, action after the fade | overlay `picked`; slot in the file sequence (pick kinds; number taken at the tap) [R10] | P2, P3, P6 | 3 |
| A12.5 | pick that types | typing pick: the user's event handled to the end, focus last | P2, P6, P7 | 3 |
| A12.6-10 | label tiles, project page, repeat page, date picker, reminder | overlay pages redrawn (a Preact layer) [R10] | P6 | 3 |
| A12.11 | subtask menu over the same sheet | hand-over: one layer transition to the subtask's sheet | P6 | 3 |
| A12.12-13 | description peek, Refresh now | overlay → sheet; network lane | P2, P6 | 4 |
| A13.1-14,16,18-19 | field typing, keys, IME, `[[`, line hotkeys, paste, tap away, blur, bar | field layer (core `QuickEntrySession`) (core session held by the runtime); `islands`; `input`; `focus` [R8] | P6, P7 | 3 |
| A13.15 | bar panels | nested overlay inside the entry (layer stack; data applies at once) | P6 | 3 |
| A13.17 | place tile / date in the bar | field layer + a context change (ribbon / day) ordered after the field's writes by their numbers | P3, P6 | 4 |
| A13.20 | rename via menu (list, timeline, stack) | overlay → entry | P6 | 3, 4 |
| A13.21 | add subtask on a timeline-only task | overlay + entry at once (layer stack; data applies at once) | P6 | 4 |
| A13.22 | hand scroll stops following the field | `scroll` `userScrolled` → entry `follow = false` | P7 | 3 |
| A14.1-10 | full card: close, Escape, Done, circles, subtasks, parent, project, description, bottom row, rename | `model.sheet.full` + sessions (core session held by the runtime) + overlay (layer stack; data applies at once) | P6, P7 | 3 |
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
| A16.12 | naming holds the screen | naming layer + keyed field (`rowKey(taskId)` bound by `CreatedTask`) [R8] | P1, P6 | 3 |
| A16.13 | project menu refuses while busy | start table | P6 | 3 |
| A16.14 | redraws and tick wait while busy | gone: data applies at once; the active pointer gesture draws its pinned layout snapshot | P6 | 3, 4 |
| A16.15 | writes in order, after a closing pick | file sequence; pick slot (pick kinds; number taken at the tap) | P2, P3 | 1 |
| A16.16 | Escape order | function over the layer stack (layer stack; data applies at once) | P6 | 3 |
| A16.17 | tap order on a card | function over the active gestures | P6 | 3 |

### B. Motions

| Rows | What | Owner in revision 6 | P | Slice |
|---|---|---|---|---|
| B1.1-4 | row grows in, leaves, mark row folds, kept row slides (FLIP) | list transitions by cause (keyed diff within one context); leaving rows skipped by layout selectors; fold and heights one transition (P4) [R8] | P4, P5 | 3 |
| B1.5 | row comes back while leaving | a returning key revives its leaving entry (one entry per key) | P4, P5 | 3 |
| B1.6-8 | timeline block moved, new, gone | timeline transitions by cause (keyed diff within one context; leaving rows skipped by layout selectors) | P4, P5 | 4 |
| B1.9 | plate replaced by first card | transition (room grows under the stand-in) | P5 | 3 |
| B1.10,12 | bar panel fades, desktop bar leaves | presence (stays in the model until `motionSettled`) | P5 | 3 |
| B1.11 | desktop bar appears | appear transition | P5 | 3 |
| B1.13 | float width from the card | carry lift transition | P5 | 3 |
| B1.14 | menu page morph | overlay page transition (a Preact layer) | P5 | 3 |
| B1.15-16 | section copy lands / flies back / sinks | section-lift transitions | P5 | 3 |
| B1.17 | strip scrub between places | transient channel between two computed layouts (computed per place, (P4)) | P4, P5 | 4 |
| B1.18 | stack field row grows | transition | P5 | 3 |
| B2.1 | fade room height when a field opens | entry transition (WAAPI; layout transition banned in CSS) | P5 | 3 |
| B2.2 | plus / capsule / wheel hide (scale) | transition on gesture / entry / select start | P5 | 3 |
| B2.3-5,7 | wheel settle, ribbon `is-switching` | ribbon / wheel transitions | P5 | 4 |
| B2.6,22-23,27,29 | popover, peek, panel, sheet, search rise | presence transitions (transform moves to WAAPI) (stays in the model until `motionSettled`) | P5 | 4 |
| B2.8-10 | fold on lift (cards, slot, plate) | carry / section-lift transitions | P5 | 3 |
| B2.11-12 | list drop line moves, level | carry target transitions | P5 | 3 |
| B2.13 | timeline drop line steps | carry target transition | P5 | 4 |
| B2.14-16 | plus / card float flights, stack fade | flight transitions (preview core) [R8] | P3, P5 | 2, 3 |
| B2.17-19 | backdrop, level shadow, copies fade | CSS opacity stays; presence (stays in the model until `motionSettled`) | P5 | 3 |
| B2.20-21 | select circles slide in, dots hide | select-mode transition | P5 | 4 |
| B2.24 | folder switch knob | overlay transition; pending intent applied by the preview core (P3) [R8] | P3, P5 | 2, 3 |
| B2.25 | bar rides the keyboard | keyboard transition | P5 | 3 |
| B2.26 | desktop capsule away (opacity) | CSS opacity stays; presence (stays in the model until `motionSettled`) | P5 | 3 |
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
| B3.12 | pinch layout per frame | transient channel; dispatch on a step | P4 | 4 |
| B3.13 | flight awaited by timer | `motionSettled` (timeout message) [R8] | P5 | 3 |
| B3.14-16,18 | overlay / panel / full card show and remove | presence (stays in the model until `motionSettled`) | P5 | 3 |
| B3.17 | view menu placed again next frame | `measure` → placement | P4 | 3 |
| B3.19-21 | wheel settle, ribbon switch, docking class timers | transitions | P5 | 4 |
| B3.22 | rows fit then re-measure | Rows heights measured, never held; one transition with the fold | P4, P5 | 3, 4 |
| B3.23 | scroll hold under a shrinking list | `scroll` (ScrollHold) | P7 | 3 |
| B3.24 | now line every minute | clock → `model.now` | P2 | 1 |
| B3.25 | settings row settles | settings-tab host: the settle transition, then the order from the write | P5 | 6 |
| B3.26 | timeline opening anchor | (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| B3.27-29 | question, search row, name fields scrolled into view | `scroll` reveal | P7 | 3, 4 |

### C. Measurements

| Rows | What | Owner in revision 6 | P | Slice |
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

| Rows | What | Owner in revision 6 | P | Slice |
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
| D4.14 | day relation | selectors with `model.now` (`CoreQueries`, clock from `model.now`) | P1 | 4 |
| D4.15 | calendar dot | selector `sourcesDot` | P1 | 4 |
| D4.16 | theme | `model.theme` | P4 | 3, 4 |
| D5.1-9 | settings that change the screen | `model.settings` / `model.device`; update rules | P1 | 3, 4 |

## R1–R7 and M1–M23 against revision 6

Each class left by the revision-5 run (R1–R7) and the revision-4 run (M1–M23) was checked against what revision 6 actually says, not against its §Resolution table.

| Class | Revision 6 | Why |
|---|---|---|
| R1 a typing pick's focus inside the tap | Resolved | P2: "A user's event is handled to the end inside that event: update, render, then the drivers, with focus last." The rendering paragraph flushes Preact's `debounceRendering` for a user's event. Only messages from other sources batch per microtask. |
| R2 leaving rows against the end-state render | Resolved | P4: "layout selectors skip rows that are leaving. A leaving row's fold and the heights that depend on it are one transition … A key that comes back mid-fold revives its entry." |
| R3 which writes have a patch | Partly: R8 | Settled at the root: every intent is applied by the core, and the UI computes none. But the core named for it, `composeCore`, is asynchronous, gives other ids, and clears the carry when it is built (R8). |
| R4 a new row's key across its create | Partly: R8 | P1 states `rowKey(taskId)` bound by `CreatedTask`. A preview made by `composeCore` hands out ids of its own, so what the preview draws and what `CreatedTask` binds are two ids (R8). |
| R5 the settings store's echo | Resolved | "Their own change events are ignored while our writes to them are in flight; one read follows when the last write settles, since `data.json` carries no number." |
| R6 what a swipe shows while the context changes | Partly: R11 | Neighbours read ahead, queued changes and a timeout settle the swipe, the arrows and the queue (P3). What a context's read includes (events fetched or cached) and how far ahead is read are not said (R11). |
| R7 the guards' scope | Resolved | §Guards, "Scope per slice": `uiRules` covers `next/` from slice 2; its service rule covers all of `obsidian/ui` from the end of slice 1; new CSS goes below a `/* next */` marker, the bans apply below it, and the freeze above. |
| M1 the settings tab | Resolved | Its own host (slice 6). Its old `.tc-level-row.is-shifting` sits above the marker and is frozen until then. |
| M2 the plugin host | Resolved | The plugin runtime in `main.ts` / `host/`. |
| M3 chrome both ways | Resolved | The `chrome` driver; body classes are written only by it (P7). |
| M4 synchronous core reads | Resolved | `CoreQueries` in selectors, the clock from the model (P7). |
| M5 the core's sessions | Resolved, with R9 | "The machines themselves" (P7). Their calls' order against queued writes is R9. |
| M6 menus | Resolved | Preact layers in the overlay host. |
| M7 pick timing | Resolved, with R10 | Three kinds of pick; the typing pick by P2 (R1 resolved). The write pick's delayed transition conflicts with P3 (R10). |
| M8 one interaction | Resolved | A stack of layers plus one pointer gesture (P6); data applies at once; the gesture draws a layout snapshot pinned in the model. |
| M9 motion by cause | Resolved | P5: a keyed diff within a context, a whole-region transition across contexts. |
| M10 leaving rows, closing overlays | Resolved | P4's leaving rows and P5's "a closing overlay stays in the model until its motion settles". |
| M11 heights held during motion | Resolved | The fold and the heights that depend on it are one transition (P4). |
| M12 continuous values | Resolved | The transient channel (P5). |
| M13 positions as geometry | Resolved | `motion` reads the boxes it animates in the commit phase; the rest is computed (P4). |
| M14 scroll | Resolved | `measure` reports it, `scroll` owns it (Drivers). |
| M15 swipe settle | Resolved | "A tap does not stop it" (§Resolution, `screen.md:127`); a new swipe catches it through `motionInterrupted`. It is stated only in §Resolution, not in a principle; the `update` tests should name it. |
| M16 unbounded waits | Resolved | P2: every wait has a bound, and the timeout is a message. |
| M17 the device and settings stores | Resolved | As R5. |
| M18 the network lane | Resolved | Latest wins per day, abandoned. |
| M19 cross-screen renames | Resolved | Pending intents are plugin-wide (P3). That the preview is one context for every screen follows from R8's fix. |
| M20 gesture recognition | Resolved | `recognizers/`, pure. |
| M21 all service callers | Resolved | The runtime from slice 1; the guard's scope now agrees (R7). |
| M22 a dropped card before its read | Partly: R8 | The preview core applies the drop. `composeCore` answers it asynchronously and without the carry (R8). |
| M23 key scopes | Resolved | The `keys` driver. |

Of R1–R7, 4 are resolved (R1, R2, R5, R7) and 3 only in part (R3, R4, R6); what is left of them is R8 and R11. Of M1–M23, 22 are resolved, 2 of them with a remainder in a new class (M5, M7), and 1 only in part (M22).

## Rows that do not fit

Each item names a class, not a row, and proposes the principle or mechanism the spec must state so the whole class is owned. A row can be in more than one item. "Too vague" is used only where an implementer would have to guess something that changes behaviour or correctness.

### No mechanism owns it

None. Every row has an owner in revision 6.

### The principles would change what the user sees

None. Revision 6 keeps every behaviour of the inventory: within a context a row moves when its keyed place changes; another project, mode or filter draws in place; a day or place slides as a whole (`screen.md:94, 127`); a tap leaves a settle running. R10 and R11 would change what Max sees only through a wrong guess, so they are filed as a conflict and a vagueness.

### Two principles conflict

#### R8. The preview core is `composeCore`: asynchronous, with an identity of its own, and it forgets the carry

**Rows (56):** A2.2, A6.10, A6.13-14, A11.1, A11.13, A13.2, A13.10, A16.12, B1.4, B2.14-16, B2.24, B3.13, A.2.92, A.2.94-95, A.2.165, A.2.185-186, A.2.332-338, A.2.352, A.2.413, A.2.528, A.2.534-536, B.1.36-38, B.1.74, B.2.20-24, B.2.67, B.2.131-133, B.2.144, B.2.224-225, B.3.59, B.4.72, B.4.74, B.5.38, B.5.55, B.5.61

What is left of R3 and R4. P3 names the preview core: "the same core code (`composeCore`) over in-memory twins of the stores it writes: the tasks file and the projects-screen store, seeded from the last read". Checked in code, that composition breaks three other principles. The class is a conflict because each break follows from P3's own words.

- **Identity (P1).** `composeCore` builds its own `new TaskIdentity()` (`core/application/composeCore.ts:42`) and has no port to seed it.
  - Ids come from the identity's history (`` `t${next + tag}` ``, `TaskIdentity.of`), so a preview core over the last read gives the tasks other ids than the live core.
  - Rows keyed by `rowKey(taskId)` change key between the preview frame and the read: a remount, a dropped keyboard, a line flying in (D86).
  - `CreatedTask`'s id from the live core binds to no row the preview drew.
  - An intent that names a task by a preview id is found on the live core only by place and line (`TaskRules.named`, `TaskRules.ts:233-238`). After an earlier queued write moved that task, the second intent fails as stale: two quick actions on one card (D81).
- **The carry (P3).** `TaskServiceImpl`'s constructor clears any carry in the projects-screen store (`dropGesture`, `TaskServiceImpl.ts:110-118`). A preview core composed over that twin has forgotten the carry in progress:
  - `drop` and `landing` read `carry.under` (`TaskServiceImpl.ts:624-633`), so they preview without the filter the carry opened (`TaskWrites.opened`, `TaskWrites.ts:527`);
  - `carryOnNode` takes its cards from `carry` (`PhoneCalls.ts:445-452`, the same rule), so it previews as nothing.

  The card lands in one place and moves on the read: the flash the "impossible" table forbids.
- **The user's event (P2).** Every `TaskService` method returns a promise (`ask` awaits `store.read`). The preview's answer comes after the drop's own event has rendered and declared its flight. The spec no longer says what the copy does until then; today it waits at the release point (A6.10).
- **Undo and settings are not previewed.** An intent queued behind a pending undo is previewed over a read without the undo, and moves again on the undo's read-back (A11.1, B.1.36-38).
- **"Project-note writes" are not a store of their own.** `setProjectNote` writes the link into the tasks file (`TaskWrites.ts:247`). The UI writes no note file, so the exemption is moot.

**Fix (P3):** the preview core is the door's synchronous call, `callDoor(method, args, context)` (`PhoneCalls.ts:1097`).
- It runs the same rules (`TaskRules`, `TaskReads`, `TaskWrites`), pure over a `DoorContext`: the tasks text, `data.json`, the undo history, the projects-screen state and the ids (`TaskIdState`). It answers each of them changed, the way the iPhone app already uses it.
- The runtime holds that context. Live and preview are the same call over it: the live one writes the answered tasks text (`vault.process`, only if the file still holds the text handed in), the preview one does not.
- Then the preview is synchronous (the drop's end is known inside its own event), ids are one lineage (the preview's `CreatedTask` is the live one), the carry is kept, and undo and settings writes preview like any other intent.
- `composeCore` then serves only what the door leaves to the host (`onChange`, polling, Google). Slice 1 names this as `backend` work.

#### R10. A write pick's transition waits for the sheet, but the screen draws every pending intent at once

**Rows (43):** A9.8, A10.2-3, A12.4, A12.7-8, A12.10, A.2.396, A.2.404-407, B.4.6-8, B.4.10-15, B.4.17-18, B.4.21-22, B.4.40-42, B.4.44-49, B.4.51, B.4.54, B.4.56, B.4.59-60, B.4.64-65, B.6.113-114

Picks, item 1: a write pick "runs at once. Only its presentation (the transition on the list) waits for the sheet to close." P3 says what a screen draws is the last read "with every pending intent applied", and P5 moves a row only when its keyed position changes between two models.
- So the list under the closing sheet shows the pick's end state in the very next frame. The change is drawn, without motion, under a fading sheet. When the sheet has closed, nothing is left to move.
- Holding the transition means drawing a model without the intent. P3 forbids that, and P6 allows a pinned layout only to a pointer gesture.

Today the action runs after the fade (A12.4, `kit/Panel.ts:16-91`), so Max sees the card leave or move once the sheet is gone. On the desktop, menus are popovers and the list around them stays visible. An implementer has to guess whether to draw at once (the card is already elsewhere when the sheet goes) or to hold, and by which mechanism.

**Fix (P6):** a closing layer pins the layout of what it covers, as a pointer gesture does.
- While its close motion runs, the view draws the pinned snapshot.
- On `motionSettled` the move to the current layout is an ordinary keyed transition.
- A typing pick and a hand-over pin nothing.

The intent itself still runs at once (D81).

### Too vague to build without guessing

#### R9. An intent is its call and arguments, but some calls act on device state that other calls change

**Rows (39):** A6.8, A6.10-11, A6.13-14, A9.2, A10.2-3, A.2.125, A.2.204, B.1.17-18, B.1.60, B.1.66, B.1.73, B.1.77, B.1.91, B.1.113-115, B.1.118, B.1.121, B.3.5-7, B.3.10, B.3.47, B.3.96, B.3.102, B.4.64-65, B.4.82, B.4.106, B.4.151-152, B.4.162, B.4.167, B.6.139-140

P3: "A pending write is an intent: the core call with its arguments", in "one plugin-wide numbered sequence". But some writes act on the projects-screen state, not on their arguments alone:
- `drop` and `landing` read `carry.under` (`TaskServiceImpl.ts:624-633`);
- `carryOnNode` takes the carried cards from `carry`;
- `createProject` selects the new node, and `renameProject` renames the selection (`TaskServiceImpl.ts:261-275`).

Other calls change that state: `startCarry`, `carryAt`, `endCarry`, `setFunnelPlace`, `pickProjectNode`, `selectProjectNode`, `clearProjectFilter`, `setViewMode`, `setProjectsPanel` and `toggleSubprojects`. Today `applyDrop` awaits the drop before `endCarry` (`CalendarScreen.ts:1148-1149`).

The spec leaves these calls outside the sequence:
- the carry is a core session, which "the runtime holds" and "a command calls" (P7);
- a place, filter or mode is a transaction that waits on reads (P3).

So `endCarry` may run at once while the drop still waits behind earlier writes. The drop then runs with no carry, and the tasks lose the project the carry opened (A6.13, D43). The implementer has to guess the order, and the file's result depends on it.

**Fix (P3):** one sequence for every core call that reads or writes a store the runtime's context holds: the tasks file, the projects-screen state, the settings and the history. Session calls and the store writes of context changes are included, each numbered at the user's message. With R8's door context the order falls out: each call takes the context the one before it left.

#### R11. What a context's read is: its tasks only, or its day's events too

**Rows (24):** A7.9, A7.13, A7.16-18, A.2.12, A.2.102, A.2.220-222, A.2.239, A.2.241-243, B.1.21, B.1.57-59, B.1.125, B.3.82-84, B.6.82-83

What is left of R6. P3 says a context change waits "until every read of the new context has landed", and that the neighbours "are kept read". A day has two reads:
- its tasks: the tasks file, which one read serves for every context;
- its events: the calendar files, plus a fetch from Google through the network lane.

Today the peek draws cached events at once and the fresh ones when the fetch answers (`DayPeek.ts:107-110`, B.3.83-84). The landed day waits for its drawing at most 1000 ms (`CalendarScreen.ts:717`). The spec does not say whether a transaction, or a neighbour read ahead, waits for fetched events:
- **If it waits,** every day turn waits on the network up to the timeout. Repeated arrow taps (A7.18) and Back to today (A7.17) stall, and the timeout notice fires offline.
- **If it does not,** the spec must say that fetched events arrive later as data.

It also does not say how far ahead neighbours are read. Back to today from a far day (A7.17) and a tap on a wheel icon outside the window (A7.9) do not land on a neighbour. Max sees each answer.

**Fix (P3):** a context's read is its tasks plus the calendar files' cached events.
- With R8's door, the tasks are a pure call over the context the runtime holds, so they never wait.
- Fetched events are data: they apply when they land (P6), latest per day (the network lane).
- A transaction therefore waits only on reading a calendar file. The neighbours are the days and places on either side, with their cached events. A far jump is a transaction over the same reads.

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
| The principles would change what the user sees | 0 | 0 |
| Two principles conflict | 2 (R8, R10) | 99 |
| Too vague to build without guessing | 2 (R9, R11) | 63 |
| **Any category (a row counted once)** | **4** | **155** |
| Rows that fit as mapped | | 1877 |

Against revision 4: 23 classes and 688 rows did not fit. Against revision 5: 7 classes and 219 rows. Against revision 6: 4 classes and 155 rows (R8 56, R9 39, R10 43, R11 24); the three facts of A.1 tagged with them (4, 18, 23) are not counted as rows.
