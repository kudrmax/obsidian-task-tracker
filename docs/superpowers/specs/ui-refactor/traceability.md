# UI refactor: traceability

This maps every row of the two inventories to the mechanism of `../2026-11-15-ui-refactor.md` (**revision 5**) that owns it, the principle that puts it there and the slice that rebuilds it. Inputs:
- `inventory-state-effects.md`: A.1 (45 facts), A.2 (565 locations), B.1–B.5 (819 effect call sites), B.6 (180 event sources);
- `inventory-behaviour.md`: A (203 inputs), B (84 motions), C (84 measurements), D (52 screen states).

Doubts were checked against `obsidian/ui`, `obsidian/main.ts`, `styles.css` and `core/application/contracts.ts` at `3d729b46`.

**How this rerun was made.** Every row was re-examined against revision 5, not only the 688 rows that failed against revision 4.
- Owners were rewritten in revision 5's words:
  - pending writes;
  - layers and gestures;
  - the `keys`, `islands` and `chrome` drivers;
  - `recognizers/`;
  - `CoreQueries`;
  - the core sessions.
- Principles were renumbered: P3 (snapshots) is new, and the old P3–P6 are now P4–P7.
- Steps became slices.
- Each of the 23 classes of revision 4 was checked against revision 5's own text (§The 23 classes against revision 5).
- Classes still open are named `R#`. Their rows carry `[R#]` in the owner column and are gathered in **Rows that do not fit**.

The script checked that every row id appears exactly once in the mapping tables. It found 0 rows unmapped and 0 mapped twice.

## Vocabulary used in the owner column

The spec names the layers but not every field, so this file proposes the field names. Every name below is a proposal.

**Model (per screen, P1):**
- `model.read`: the core's last `ScreenView` answer, with `funnel` (view, place, filter, panel), `projects`, `missing` and `context`, plus `day`, the key of that read.
- `model.day`, `model.now`, `model.visible`, `model.events[day]`.
- `model.settings` (`ScreenSettings`) and `model.device` (device view settings).
- `model.platform`, `model.theme`, `model.chrome` (`keyboard`, `statusBar`).
- `model.canUndo`, `model.selection` (`mode`, `picked`, `anchor`), `model.found`, `model.timeline` (`selected`, `anchor`), `model.zoom`.
- `model.measured`: row heights, text widths, the stage, menu sizes, all from `measure`.
- `model.entry`: the snapshot of the core's `QuickEntrySession`.
- `model.rowKeys`.
- `model.overlay`, `model.sheet.full`: layers.
- `model.place`: leaf, or block with note and project.

**Runtime (plugin-wide):**
- the file sequence and the **pending writes** with their patches (P3);
- the numbered settings and device-store writes;
- the network lane;
- the core sessions (P7);
- the action log.

**Interaction (P6):**
- **Layers:** select mode, field (entry, rename, naming), menu (task, bulk, section, project, event, view, ⋯, sources, search), the full card.
- **Gestures:** carry (a card, subtasks, the plus, the picked cards; the core's carry session), section lift, tree lift, timeline hold, select, resize and new slot, ribbon swipe, day swipe (with the peek), wheel drag, pinch, divider, tree divider.
- Each layer and gesture pins its entities and gets `targetChanged` / `targetGone`.

**Commands (P2):**
- `write(op)` and `read`, in the file sequence;
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
- P1 one model;
- P2 one timeline;
- P3 every frame is one consistent snapshot;
- P4 geometry is input;
- P5 motion only within one context;
- P6 interactions are layers and they pin;
- P7 imperative code only at the edges.

**Slice** is the slice that rebuilds the row:
- 1: the runtime under the old code. Every service caller, the file sequence, the stores and the network lane.
- 2: the guards, the freeze and the e2e harness.
- 3: the note block. Lists, cards, the field, carry inside the block, menus and the full card: the shared parts the leaf reuses.
- 4: the leaf behind `newScreen`. The timeline, the ribbon and both swipes, the peek, the panel and tree, the carry across all of them, select mode, search, the day.
- 5: the switch (no rows of its own).
- 6: the settings tab.
- 7: deletion.

"3, 4" means built for the block and then mounted in the leaf. "Gone" means the state disappears because the new code makes it unnecessary; it is deleted with the old code in slice 7 if not earlier.

## A.1 The 45 facts held in more than one place

Each fact gets one field or one selector. "Seeded" means the field starts from a core answer before the first read; it is still one field.

| # | Fact | Single owner | P | Slice |
|---|---|---|---|---|
| 1 | The day the screen shows | `model.day` (one field). The read's own day is `model.read.day`, the key of that read, not a copy. Title: selector `dayTitle`. Drawn-day caches go (P5 decides motion by cause). Peek and landing days live in the day-swipe gesture as the *incoming* day, a different fact. | P1 | 4 |
| 2 | The day the header names during a swipe | Selector `headerDay(model)` = `daySwipe.nearer ? daySwipe.peek.day : model.day`; `nearer` is set by one discrete message when the slide crosses half. | P1, P6 | 4 |
| 3 | A tick or draw missed while hidden or held | Gone as a store: data applies at once (P6); only the active gesture defers a re-layout under the finger; `model.visible` from `chrome`. | P6 | 4 |
| 4 | Where the strip stands | `model.read.funnel.place` (the core's answer) plus the ribbon gesture's in-flight `target`; selector `shownPlace`. `atDone` = `shownPlace === "done"`. `firstPlace` seeds `model.read` before the first read. `rightMode` is a one-time host hand-over (plugin runtime). [R6] | P1, P3 | 4 |
| 5 | The view mode and its layout | `model.read.funnel.view` (`ViewChoice`); selector `layoutMode`. `firstView` seeds it before the first read. Mounted layout = the layout component chosen by `layoutMode`. `drawnContext` goes: update compares `read.context` to decide that no transition is emitted. | P1, P5 | 4 |
| 6 | The project filter | `model.read.funnel.filter`; selector `filterNode`. The node a carry was lifted on is carry-gesture state `carry.liftedOn` (a different fact: what to put back). | P1 | 4 |
| 7 | The projects panel open / docked | `model.read.funnel.panel` (`open`, `docked`). The mid-slide state is a running `Transition` (dock slide), not a field. | P1, P5 | 4 |
| 8 | The tasks read from the file | `model.read` (`ScreenView`: tasks, day, projects, missing). Menus and the bulk menu hold only keys (`overlay.task.key`, `overlay.bulk.keys`) remapped by the write's answer; the full card holds `sheet.full.levels[]` reads of its own; the peek holds `daySwipe.peek.read`. Element maps go. | P1 | 4 |
| 9 | The tasks file is missing | `model.read.missing`; every hidden part is JSX from it. | P1 | 3, 4 |
| 10 | A card waiting for a new section's name | Naming layer `interaction.naming = {kind: "section", column, card}`. | P6 | 3 |
| 11 | The day's calendar events | `model.events[day]` (keyed by day, so the shown day and the peek share one map). The service cache stays in the core. | P1 | 1 |
| 12 | The sources' alert | Selector `sourcesDot(model.events[model.day])`. | P1 | 4 |
| 13 | Extra all-day rows | Selector `allDayExtraRows(model.events[day])`; the peek uses the same selector for its day. | P1 | 4 |
| 14 | The timeline card selected | `model.timeline.selected: TaskKey or null`. | P1, P6 | 4 |
| 15 | List cards picked | `model.selection = {mode, picked: TaskKey[], anchor}`; count and button state are selectors. | P1 | 4 |
| 16 | A drag holds the screen | `model.interaction.gesture` (the one gesture slot); `isDragging` is a selector. | P6 | 4 |
| 17 | A carry to a project is under way | carry gesture `carry.reportsToCore` (the core's carry is a session, core session held by the runtime). | P6, P7 | 3 |
| 18 | The card a drop is landing on | The drop's pending write in the runtime: its patch, retired by the read numbered at or above it (P3). [R3] | P3 | 1, 3 |
| 19 | Where a held card would land | carry gesture `carry.target` (list gap and level, plate, title, timeline start, tree row), computed from `model.measured` and the core's rules. | P4, P6 | 4 |
| 20 | A timeline card being stretched | Resize gesture `interaction.resize = {key, edge, span}`. | P6 | 4 |
| 21 | A swipe or turn is running | Ribbon / day-swipe gesture state; the run after release is a numbered `Transition` in `motion`. | P5, P6 | 4 |
| 22 | Which swipe or turn is current | Transition numbers (a stale `motionSettled` is ignored by number); the day-swipe gesture's turn queue. | P5 | 4 |
| 23 | A landed day drawn over the screen | A context change held pending (P3) while the day-swipe gesture draws the incoming day. [R6] | P3, P6 | 4 |
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
| 44 | Writes waiting to run | The plugin-wide file sequence only; a write takes its number at the user's message. | P3 | 1 |
| 45 | Who holds the screen | `model.interaction.gesture` (one slot); pointer captures are `input`-local. | P6 | 3, 4 |

## A.2 State locations (565)

Row ids number the rows of each domain table of `inventory-state-effects.md` in file order, A.2.1 to A.2.565.

### day/clock

| Rows | What | Owner in revision 5 | P | Slice |
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

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.12,14 | `CS.shownMode`, `CS.atDone` | ribbon gesture `target` + selector `shownPlace` [R6] | P1, P6 | 4 |
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

| Rows | What | Owner in revision 5 | P | Slice |
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
| A.2.92,94-95 | `KeyedRows.rows/drawing/order` | gone: Preact keyed rows; focused field kept by key (row key kept across the create) [R4] | P5, P7 | 3 |
| A.2.93 | `KeyedRows.leaving` | leaving rows as model state (stays in the model until `motionSettled`) [R2] | P5 | 3 |
| A.2.96-97 | prototype `KeyedList` | replaced by `next/` | — | 7 |

### events

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.98 | `CS.poll` | effect runner: `keepFresh` on the network lane, `model.visible` | P2 | 1 |
| A.2.99-100 | `DayData.dayEvents`, `state.calendars` | `model.events[day]`, `read.calendars` | P1 | 4 |
| A.2.101 | `DayData.around` | network-lane request parameter (network lane, latest per day) | P2 | 1 |
| A.2.102 | `DayPeek.events` | `model.events[peekDay]` | P1 | 4 |
| A.2.103-104 | wheel dots | selector `sourcesDot` | P1 | 4 |
| A.2.105-106,109 | `Timeline.events`, event block placement | selector `timedEvents` (`layoutEvents`) + `motion` variables | P1, P7 | 4 |
| A.2.107 | event colours | selector `paintEvent(model.theme)` → `motion` variables | P1, P7 | 4 |
| A.2.108 | `is-past` | selector over `model.now` (`CoreQueries`, clock from `model.now`) | P1 | 4 |

### selection

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.110,116-119 | `BulkController.selection`, `TaskSelection.*` | `model.selection {picked, anchor}`; element maps gone | P1 | 4 |
| A.2.111-112 | count / ⋯ buttons | selectors | P1 | 4 |
| A.2.113-114 | `selecting`, `is-selecting` | `model.selection.mode` (select-mode layer) | P6 | 4 |
| A.2.115 | bulk menu `items` closure | `overlay.bulk.keys` remapped by write answers | P1 | 4 |
| A.2.120-121 | `is-selected`, `.tc-pick` | JSX | P1 | 4 |
| A.2.122-124 | `Timeline.selected`, ring, grips | `model.timeline.selected`; grips via `motion` variables | P1, P6 | 4 |

### carry/drag

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.125 | `CS.carrying` | carry gesture `reportsToCore` | P6 | 3 |
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
| A.2.165 | static `DragSession.landing` | pending writes (P3) + running transition numbers [R3] | P3, P5 | 3 |
| A.2.166-169 | `DragSession.current/done/cut/cleared` | carry gesture phase | P6 | 3 |
| A.2.177,179 | flight timers | `motion` → `motionSettled` (timeout message) | P5 | 3 |
| A.2.180-182,198-199 | drop lines, tree `is-drop` | JSX from `carry.target`; line steps are transitions | P1, P5 | 4 |
| A.2.183-184 | `TimelineDrop.start/last` | carry gesture `target.timeline` | P6 | 4 |
| A.2.185-186 | `ArrivingCard` | the pending write's patch (the arriving card) (P3) [R3] | P3, P5 | 3 |
| A.2.187-191 | `LongPress` state and timer | `recognizers/` (pure); delay from `model.settings` | P7 | 3 |
| A.2.194 | `ProjectTasks.away` | selector hiding `carry.lifted` across node change | P1 | 4 |
| A.2.195 | by-project row classes | JSX | P1 | 3, 4 |
| A.2.196 | `TreeDrop.result` | carry gesture `target.tree` | P6 | 4 |
| A.2.197 | `ProjectsListDrop.readOn` | carry gesture `targetsReadNo` (pinned drop places, `targetChanged` (P6)) | P4, P6 | 3 |
| A.2.200-203 | `TreeLift` claim, `at`, float, listeners | tree-lift gesture; float on transient channel; `input` | P6 | 4 |
| A.2.204-205 | `CarryReport.last/timer` | effect runner: `carryAt` command with dedupe and a timer command | P2 | 4 |
| A.2.206-207 | `ProjectsCarry.drops/nodes` | carry gesture `rows`, `liftedOn` | P6 | 4 |
| A.2.208-212,214 | timeline drop line and stretch state | carry / resize gesture state; JSX; `motion` variables | P6, P7 | 4 |
| A.2.213 | `is-lifted` read in Timeline | selector from `carry.lifted` (no class reads) | P1 | 4 |
| A.2.217-218 | `is-drop-room`, hover hook | selector `dropRoom(list)` from `carry.target` | P4 | 3, 4 |

### swipe/pager

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.220 | `CS.landing` | day-swipe gesture `landing`, held until the transaction switches [R6] | P3, P6 | 4 |
| A.2.221 | `drawnWaits` + 1000 ms timer | the switch's wait, bounded by a timeout message [R6] | P2, P3 | 4 |
| A.2.222 | `CS.turning` | day-swipe gesture turn queue [R6] | P6 | 4 |
| A.2.223,542 | `CarefulPace`, `PointerSpeed` | `recognizers/` | P7 | 4 |
| A.2.224-230 | `Swipe` press, stream, timer, holds, round, listeners, capture | `recognizers/` + ribbon / day-swipe gesture; `round` → transition numbers | P6, P7 | 4 |
| A.2.231-236 | `ScreenPager` state | swipe gesture + transient channel; settle is a `Transition`; `catches` → transition numbers (a tap leaves the settle running) | P5 | 4 |
| A.2.237-238,240 | edge / day / strip track styles and scrub | `motion` (transient channel, scrub between two computed layouts) | P5, P7 | 4 |
| A.2.239 | `DayTrack.nearer` | day-swipe `nearer`, one message at half [R6] | P6 | 4 |
| A.2.241-243 | `DayPeek.day/removed/el` | day-swipe `peek {day, read}`; view draws the layout for that day [R6] | P6 | 4 |
| A.2.244 | `ColumnSwitch.icons` | view | P1 | 4 |
| A.2.245-247,251 | wheel press, hold timer, swallowed click, capture | wheel-drag gesture + `input` | P6, P7 | 4 |
| A.2.248,252-253 | wheel `is-settling`, ribbon `is-switching` | transitions (wheel settle, ribbon slide) | P5 | 4 |
| A.2.249-250 | `ColumnSwitch.at`, wheel window properties | selector of `shownPlace`; live drag on transient channel; `motion` variables | P1, P7 | 4 |

### zoom

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.254-255 | `CS.hourPx`, `CS.wholeDay` | `model.zoom {hourPx, wholeDay}` | P1 | 4 |
| A.2.256,261 | `zoomFrame`, `PinchZoom.scaled` | transient channel; dispatch on a step | P4 | 4 |
| A.2.257-260,262-263 | pinch pointers, wheel timer, anchor, limits, capture | pinch gesture + `recognizers/`; wheel settle timer command | P6, P7 | 4 |
| A.2.264-265 | `Timeline.minor/grid` | selector `gridAt(hourPx)` (transient channel; dispatch on a step) | P1 | 4 |
| A.2.266-267 | `hourShown`, `--tc-hour` | `motion` variable | P7 | 4 |

### scroll

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.268 | `CS.scrolledFor` | gone: update emits a scroll order on a day change | P2 | 4 |
| A.2.269-270,283 | timeline / day list / peek scroll positions | `scroll`-local, keyed scroller ids (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| A.2.271-276 | `QEC.follow/revealedAt/revealing/handScrolledAt/watchedScroller`, scrollTop | field layer (core `QuickEntrySession`) `follow`; `scroll` `reveal` orders; `userScrolled` ends follow | P6, P7 | 3 |
| A.2.277,297-302 | `ScrollGlide`, `ScrollHold`, `GLIDES` | `scroll`-local [R2] | P7 | 3 |
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

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.303,353-356 | `activeEditor`, `EmbeddedEditor` state, CodeMirror doc | `islands` | P7 | 3 |
| A.2.304 | `WriteQueue.tail` | file sequence | P2, P3 | 1 |
| A.2.305 | `QEC.state` | `model.entry` (the core session's snapshot) | P1, P7 | 3 |
| A.2.306,329 | `QEC.field`, `quiet` | `islands` (editor handle; owner set text is not input) | P7 | 3 |
| A.2.307,339,479 | `QEC.focused`, group name focus, field focus | `focus` [R1] | P7 | 3 |
| A.2.308 | `QEC.turning` | field layer (core `QuickEntrySession`) flag while the bar turns the wheel | P6, P7 | 4 |
| A.2.309 | `QEC.draws` | gone: read numbers | P2, P3 | 3 |
| A.2.310,340 | `pressEnding`, `FreeRoomDoubleClick.mouse` | `recognizers/` | P7 | 3 |
| A.2.311,313-314,316-317,319-325,327-328,330-331 | bar and field look (`is-entering`, bar state, buttons, tint, placeholder, plus hidden) | selectors over `model.entry` → JSX | P1 | 3 |
| A.2.315,326 | `QuickBar.leaving`, pointer-events while fading | presence transition (stays in the model until `motionSettled`) | P5 | 4 |
| A.2.318 | bar `is-gliding` | keyboard transition | P5 | 3 |
| A.2.312 | field element parent | view: row by key; field island mounted in it | P1, P7 | 3 |
| A.2.332-336 | `EntryRows.*` | `model.entry` + `model.rowKeys` (row key kept across the create) [R4] | P1, P2 | 3 |
| A.2.337-338,352 | `RenamedTexts` | plugin-wide pending write's patch (P3) [R3] | P3 | 3 |
| A.2.341-343 | `TaskMenu.stackRow/fieldRow/fieldClosed` | overlay + field and entry layers (stack spot) (layer stack; data applies at once) | P6 | 3 |
| A.2.344-346 | `FullScreen.editing/draft/saveTimer` | `islands` + `sheet.full.description` (core session) + debounce timer command | P7 | 3 |
| A.2.347-351 | `FullScreen.state/field/focused/titleField/leavingTitle` | `sheet.full.entry` (a second core entry session); `focus` | P1 | 3 |
| A.2.357 | `markdown-rendered` | `islands` | P7 | 3 |
| A.2.358 | tree `askProjectName` slot | naming layer `{kind: newProject, gap, depth}` | P6 | 4 |
| A.2.359-361 | `Timeline.field`, `is-renaming`, field box | selector over `model.entry` in the timeline; `motion` variables | P1, P7 | 4 |
| A.2.362-363 | `TaskList.slot`, card `is-renaming` | naming layer; JSX | P1, P6 | 3 |

### menus/overlays/full/search

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.364,373 | `CS.search`, `BulkController.menu` | `model.overlay` stack entries | P6 | 4 |
| A.2.365,422-426 | `CS.full`, `FullScreen.stack/reading/closed/Escape/is-shown` | `model.sheet.full`; reads numbered; Escape order function; presence (stays in the model until `motionSettled`) | P6 | 4 |
| A.2.366,377 | menu `current`, `TaskMenu.context` | `overlay.task.key` remapped by write answers | P1 | 3 |
| A.2.367 | `QEC.stack` | overlay + entry (stack spot) (layer stack; data applies at once) | P6 | 3 |
| A.2.368-372 | bar panel state | field layer (core `QuickEntrySession`) `panel {kind, page}` (nested overlay); side from `measure` | P4, P6, P7 | 3 |
| A.2.374-376 | `FoundCard` | `model.found {key, scrollPending}`; `scroll` reveal | P1 | 4 |
| A.2.378-392 | `TaskMenu` parts, pages, asking, labelling, Enter, double-press, classes | menu layer `{kind: task, key, page, asking, labelling}`; parts are view (a Preact layer); boxes via `measure` (`motion` reads its boxes in the commit phase) | P1, P6 | 3 |
| A.2.393-403 | `LiftedMenu.gone`, `Overlay.*` | overlay `phase`; presence (stays in the model until `motionSettled`); Escape order over the stack (layer stack; data applies at once) | P5, P6 | 3 |
| A.2.404-407 | `Picks.*`, `giveUp` | write pick: number at the tap, run after the closing motion settles; bounded by a timeout | P2, P3 | 1 |
| A.2.408-412 | `Panel.shown`, `PanelPages`, `MORPHS` | overlay `page`; page morph transition (B1.14) (a Preact layer) | P5 | 3 |
| A.2.413 | switch knob flipped before the write | pending write's patch until the read retires it (P3) [R3] | P3 | 3 |
| A.2.414 | menu tiles | JSX from the core menu model | P1 | 3 |
| A.2.415-421 | `BulkMenu`, project menu asking, `DescriptionPeek` placement | menu layer; peek side from `measure` | P4, P6 | 4 |
| A.2.427-430 | `SearchWindow.rows/picked/asked/closed` | `overlay.search {query, answer, picked}`; coalesced read | P2, P3, P6 | 4 |

### layout sizes

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.431 | `is-docking` + timer | dock-slide transition | P5 | 4 |
| A.2.432-436 | desktop capsule room, anchor, away, glide start, position | selectors from `measure` (field box) + `chrome`; `motion` variables | P4, P7 | 3 |
| A.2.437 | `ObsidianChrome.statusBar` | `chrome` | P7 | 4 |
| A.2.438 | Settings colour rows wrap | settings-tab host: its own model; the colour rows' wrap from `measure` | P1, P4 | 6 |
| A.2.439-441 | peek column styles, invisible, all-day | view draws the layout for the peek day | P4 | 4 |
| A.2.442-444 | `Divider.press/glide`, capture | divider gesture; snap glide transition; `input` | P5, P6 | 4 |
| A.2.445-447,491 | menu field row / copy raised over the keyboard | selector from `model.chrome.keyboard` + `measure`; `motion` variables | P4, P7 | 3 |
| A.2.448-452 | menu placement, `is-long`, search / sources positions, `LiftedCopy.rect` | selectors over `measure` sizes and the computed layout; window room from `chrome` | P4 | 3, 4 |
| A.2.453-454 | `--tree-width`, `seen` | `model.device.treeWidth` + transient channel; panel width from `measure` | P4 | 4 |
| A.2.455-458 | hour labels, lines, stack end, all-day rows | selectors | P1 | 4 |
| A.2.459 | `--tc-list-width` | selector (`RibbonColumns`, listShare) → `motion` variable | P4, P7 | 4 |
| A.2.460-466 | `RowsLayout` holds, fit timers, heights | selector `stackedLists(model.measured)`; heights move in the fold's own transition [R2] | P4, P5 | 3, 4 |
| A.2.467-469 | foot fade edge, row labels, field row presence | selectors | P1 | 3, 4 |
| A.2.470 | `is-leaving` read | gone: leaving is model state [R2] | P5 | 3, 4 |
| A.2.471 | still-layout column widths | selector `layoutWidths` | P4 | 4 |
| A.2.472-474 | `SnapGlide` | `motion` | P5, P7 | 4 |

### platform/theme/keyboard

| Rows | What | Owner in revision 5 | P | Slice |
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

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.495 | `CS.seen` | update compares `model.settings` before / after (settingsEffect as an update rule) | P1 | 4 |
| A.2.496-497 | plugin settings in memory, `rightMode` | plugin runtime (`host/`, `main.ts`): plugin settings held by the runtime; the `rightMode` hand-over is a host call, its write in the file sequence | P3, P7 | 1 |
| A.2.498-500 | view settings stores | effect runner subscription → `model.device` (numbered store writes) [R5] | P2, P3 | 1 |
| A.2.501-502,509-512 | Settings tab page, colour preview, row reorder | settings-tab host: page and preview from its model; the row reorder is a declared transition [R7] | P1, P5 | 6 |
| A.2.503-508 | card size and priority colour body tokens | `chrome` per window from settings (`chrome` takes it from the model) | P7 | 3, 4 |
| A.2.513-516 | repeat page / editor | overlay page `repeat` (core `RepeatPage`) | P6, P7 | 3 |

### note blocks

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.517,519-523 | `ViewWatch.frame`, block registry, `asks` | host (block host); `asks` → coalesced `projectNoteView` read | P2, P3, P7 | 3 |
| A.2.518 | block key scope | `keys` driver (Obsidian `Scope`s) | P7 | 3 |
| A.2.524 | block position, `--tc-block-lift` | host block placement; lift from `measure` | P4, P7 | 3 |
| A.2.525 | focus in block | `focus` | P7 | 3 |
| A.2.526-527 | `BlockHeight` | `measure` (content height) → `motion` variable | P4 | 3 |

### undo

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.528 | undo button off | `model.canUndo` | P1 | 3, 4 |

### other

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A.2.529,538 | teardown list, tab's screen | runtime / host mount | P7 | 1 |
| A.2.530 | `CS.changing` | file sequence | P2, P3 | 1 |
| A.2.531 | arbiter claim `naming` | naming layer | P6 | 3 |
| A.2.532 | `services` for console | plugin runtime (`host/`) | P7 | 1 |
| A.2.533 | `DayData.shown` | gone: notification by selector equality | P2 | 4 |
| A.2.534-536 | `Reload` state | read-back after every write (P3); `beforeShow` → row key kept across the create [R4] | P2, P3 | 1 |
| A.2.537 | `ScreenParts.waiting` | gone: data applies at once; only the active gesture defers a re-layout under the finger | P6 | 3, 4 |
| A.2.539 | `FramePass` | `measure` / `scroll` frame scheduling | P7 | 3 |
| A.2.540-541 | arbiter holder, idle listeners | `interaction.gesture`; deferred re-layout applied on its end (P6) | P6 | 3 |
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

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| B.1.1-4,6-8,10-13,16,60-61,66,73,75-79,82-83,85,87,89-91,95-104,107,113-115,118-119,121,123 | task writes (`act`) | Cmd `write(op)` in the file sequence; read with its number; `failed` on error | P2, P3 | 1 |
| B.1.17-18 | `startCarry`, `endCarry` | Cmd `carry(start or end)` in the file sequence; the core's carry session (core session held by the runtime) | P2, P3, P7 | 1 |
| B.1.5,9,14-15,19-20,22-26,28-30,53,55-56,93,122 | synchronous service reads (`bulkMenu`, `carried`, `snap`, `stretch`, `firstPlace`, `relation`, `today`, `boundary`, `shownSpan`, `isPast`, `dropSpan`, `newSlot`, `findIn`, `listName`, `stepFunnel`, `columnSections`, `menu`, `openAt`) | (`CoreQueries`, clock from `model.now`) core queries | P7 | 1 |
| B.1.27,34,39,63,81,84,92,94 | event, sources, more, search, section, project menus; full card; task menu | `model.overlay` / `model.sheet` (a Preact layer) | P6 | 4 |
| B.1.31 | quick entry shows the day it wrote to | Msg `entryShowsDay` → `model.day` + read command | P2, P3 | 3 |
| B.1.32,38,48,50,71 | rereads (fresh, after undo, load, day passed, after failure) | read Cmd in the file sequence | P2, P3 | 1 |
| B.1.33,57 | wheel turned, swipe landed on a place | ribbon / wheel gesture → Cmd `setFunnelPlace` [R6] | P6 | 4 |
| B.1.35,44-47,52 | calendar poll and refresh | network lane (network lane, latest per day) | P2 | 1 |
| B.1.36 | undo / redo | Cmd `undo` in the file sequence | P2, P3 | 1 |
| B.1.37,69-70 | notices | Cmd `notice` | P2 | 1 |
| B.1.40-43 | service subscriptions | runtime inputs → `fileChanged`, `calendarsChanged`, `settingsChanged`, `dayChanged` | P2 | 1 |
| B.1.49 | `Timeline.tickNow` | `tick` → `model.now` (applies at once (P6)) | P6 | 1 |
| B.1.51 | select today on day moved | update rule on `dayChanged` | P2 | 4 |
| B.1.54,72,120 | view settings writes (`listShare`, `zoom`, `treeWidth`) | Cmd `device.set` (numbered store writes) [R5] | P2, P3 | 1 |
| B.1.21,58-59 | day step, day swipe landed, day turn | day-swipe gesture; read command for the new day [R6] | P6 | 4 |
| B.1.62 | haptics | Cmd `haptic` | P7 | 1 |
| B.1.64-65,108 | `reveal`, `filterHides`, `lineOf` (async reads) | read Cmd | P2, P3 | 1 |
| B.1.67 | after reveal: day, wheel, place | update on `revealed` | P2 | 4 |
| B.1.68 | `Timeline.select(null)` | update on `pressedElsewhere` | P6 | 4 |
| B.1.74 | `projectsDropPreview` | pending write's patch (P3) (landing card at the line, A6.14) [R3] | P3 | 3 |
| B.1.80 | section name field + scrollIntoView | naming layer; `focus`; `scroll` reveal | P6, P7 | 3 |
| B.1.86 | NoteSearch modal | `islands` (Obsidian `Modal`) | P7 | 3 |
| B.1.88,109-111 | open note / file / link / URL | Cmd `obsidian.open` | P7 | 1 |
| B.1.105-106 | rename / add subtask | field layer (core `QuickEntrySession`) open | P6, P7 | 3 |
| B.1.112 | `funnelView` / `projectNoteView` in each read | part of the read command | P2, P3 | 1 |
| B.1.116-117 | `projectsTakes`, `projectsPlusPlace` (pure) | core pure rules in update | P4 | 3 |
| B.1.124-126 | interval, landing / dock timers, pinch rAF | runtime clock; timer Cmds; transient channel; dispatch on a step [R6] | P3, P7 | 1 |
| B.1.127 | `StatusBarRoom.hold` | `chrome` | P7 | 4 |
| B.1.128-139,141-142 | plugin load, settings file, code watcher, registrations, protocol, login, sync, device storage, place hand-over, open view, popouts, sync notice, core timers | plugin runtime (`host/`): lifecycle, protocol actions, login, the place hand-over call services there (allowed in `host/`); tasks-file writes in the file sequence, settings writes numbered | P3, P7 | 1 |
| B.1.140 | osascript (open event in Calendar) | Cmd `openInCalendar` | P7 | 1 |

### B.2 G1

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| B.2.1-3 | calendar events fetch and cache | network lane (network lane, latest per day) | P2 | 1 |
| B.2.4-6 | task reads (`funnelView`, `screen`, `projectsScreen`) | read Cmd in the file sequence | P2, P3 | 1 |
| B.2.7-9 | `onUpdate`, ScreenParts, draw | notification by selector; the `ScreenParts` hold is gone (P6) | P2, P6 | 1, 3 |
| B.2.10,29-65 | quick entry session construction and every session call | field layer (core `QuickEntrySession`) = the core session (core session held by the runtime); writes in the file sequence | P2, P3, P6, P7 | 3 |
| B.2.11-19 | entry helpers (`placementOf`, `parseTitle`, `isBlank`, …) | core pure rules in update / selectors | P1 | 3 |
| B.2.20-23 | session writes (`createSection`, `edit`, `unfoldAbove`, `createWithId`) | file sequence (the session's `WriteLine` is the sequence) [R4] | P2, P3 | 1 |
| B.2.24 | `list.adopt(created.id)` | `model.rowKeys` (row key kept across the create) [R4] | P1 | 3 |
| B.2.25-27,109,111-112 | `listName`, `placementTitle`, `placementOfDay` | (`CoreQueries`, clock from `model.now`) core queries | P7 | 3 |
| B.2.28 | `newProject` from the bar | Cmd write | P2, P3 | 1 |
| B.2.66-67 | entry `fresh` reads | read Cmd in the file sequence [R4] | P2, P3 | 1 |
| B.2.68,71 | entry render requests | notification by selector | P2 | 3 |
| B.2.69-70 | lock panel, forget typed | selectors; entry end | P1 | 3 |
| B.2.72 | bar turns the wheel | entry + ribbon gestures (layer stack; data applies at once) | P6 | 4 |
| B.2.73 | bar shows another day | `model.day` + read Cmd, ordered after the entry's writes (pick kinds; number taken at the tap) | P2, P3 | 3 |
| B.2.74-77 | plus drag (and aside on by project) | carry gesture `payload: plus` | P6 | 3 |
| B.2.78-86 | menu stack and timeline field calls | overlay + field and entry layers; selectors (layer stack; data applies at once) | P6 | 4 |
| B.2.87 | bar show / hide / follow | JSX from `model.entry` + `measure` | P1, P4 | 3 |
| B.2.88,242 | field / name input focus | `focus` [R1] | P7 | 3 |
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
| B.2.131-133 | `EntryRows` drawing | view + `model.rowKeys` [R4] | P1 | 3 |
| B.2.134-135 | keyboard will show / hide | `chrome` → `model.chrome.keyboard`; keyboard transition | P4, P5 | 3 |
| B.2.136-141 | view settings file / store | Cmd `device.set`; subscription → `model.device` (numbered store writes) [R5] | P2, P3 | 1 |
| B.2.142,145-147 | tab: screen create / open / close / resize | host mount; `measure` | P7 | 1 |
| B.2.143-144 | tab key scope, undo / find keys | `keys` driver (Obsidian `Scope`s) → Msgs | P7 | 3, 4 |
| B.2.148-149 | `ViewWatch` | host block | P7 | 3 |
| B.2.150,152,154-157,159-160,162-163,165-166,168-170 | note block lifecycle, placement, events | host block | P7 | 3 |
| B.2.151,158 | block key scope | `keys` driver (Obsidian `Scope`s) | P7 | 3 |
| B.2.153 | block focus | `focus` | P7 | 3 |
| B.2.161,164 | block `onChange`, `projectNoteView` | runtime input; coalesced read Cmd | P2, P3 | 3 |
| B.2.167 | `--tc-block-lift` | host block placement from `measure` | P4 | 3 |
| B.2.171-223 | Settings tab and its pages | settings-tab host; its service calls go through the runtime in slice 1 (settings writes numbered), the tab itself is rebuilt in slice 6 | P2, P3, P7 | 1, 6 |
| B.2.224-225,228 | undo button: `canUndo`, `onUndo` | `model.canUndo` (`CoreQueries`, clock from `model.now`); Msg `undo` | P1 | 1 |
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

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| B.3.1-3,8,34-36,72-73,85-88 | `snap`, `stretch`, `carried`, `dropSpan`, `newSlot`, `bulkMenu`, peek reads (`shownSpan`, `isPast`, `relation`, `columnSections`) | (`CoreQueries`, clock from `model.now`) core queries | P7 | 4 |
| B.3.4-5,9-11,38,62-71,96,102 | writes through deps (resize, drop, fold, mark, move section, bulk, place) | Cmd write in the file sequence | P2, P3 | 1 |
| B.3.6-7 | `startCarry`, `endCarry` via deps | Cmd carry (core session held by the runtime) | P2, P7 | 1 |
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
| B.3.45-50 | `DragSession` float phases, end, return, targets | carry gesture + `motion` | P5, P6 | 3 |
| B.3.56-58 | auto-scroll | `scroll` `edge`; offsets back to carry (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| B.3.59 | `ArrivingCard` toggles | pending write's patch (P3) [R3] | P3 | 3 |
| B.3.60-61 | `LongPress` timer, outcomes | `recognizers/` | P7 | 3 |
| B.3.75-79 | bulk capsule, ring, count, pick circles | JSX from `model.selection` | P1 | 4 |
| B.3.80-81 | found card scroll | `scroll` reveal | P7 | 4 |
| B.3.82-84 | peek reads (`dayView`, `events`, `fresh`) | day-swipe gesture → read Cmd / network lane (slice 1) [R6] | P2, P3 | 4 |
| B.3.89-90 | peek render, align | view for the peek day | P1 | 4 |
| B.3.91,93-95 | swipe → pager follow / settle / frames | swipe gestures + transient channel + settle transition (a tap leaves the settle running) | P5, P6 | 4 |
| B.3.97-101 | strip / day tracks | `motion`; day-swipe `nearer`, `landing` [R6] | P5 | 4 |
| B.3.104,106 | wheel dot, label | selectors | P1 | 4 |
| B.3.105 | wheel timers | `recognizers/` / timer Cmd | P7 | 4 |
| B.3.107,110 | divider and pinch settings writes | Cmd `device.set` (numbered store writes) [R5] | P2, P3 | 1 |
| B.3.108 | divider width live | transient channel; dispatch on a step | P4 | 4 |
| B.3.111 | pinch scale | transient channel; dispatch on a step | P4 | 4 |
| B.3.112-113 | wheel preventDefault, wheel zoom settle | `input`; `recognizers/` timer | P7 | 4 |
| B.3.114-117 | settings row reorder | settings-tab host: the row-reorder gesture and its transition [R7] | P5, P6 | 6 |
| B.3.118 | free-room double click | `input` → entry `openAtEnd` | P7 | 3 |
| B.3.92 | horizontal wheel preventDefault | `input` | P7 | 4 |
| B.3.119-135 | pure core rules (`placeAt`, `swipeLanding`, `dividerAt`, …) | pure rules in update / selectors | P4 | 4 |

### B.4 G3

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| B.4.1-5,36-39,79,105 | menu models, `fullTree`, `listName` | (`CoreQueries`, clock from `model.now`) core queries | P7 | 4 |
| B.4.6-18,40-51,54,56,59-60,173 | menu writes | Cmd write; pick slot in the file sequence (pick kinds; number taken at the tap) | P2, P3 | 1 |
| B.4.19-22 | `RepeatPage` | overlay page = the core session (core session held by the runtime); write on close | P6, P7 | 3 |
| B.4.23,28,58,68 | open link / in Obsidian / note / in Calendar | Cmd `obsidian.open` / `openInCalendar` | P7 | 1 |
| B.4.24-26,29,53,55,57 | typing picks (`pickNow`): rename, description, subtask, new section, project rename, attach note | typing picks: the field focused inside the tap [R1] | P2, P6, P7 | 3 |
| B.4.27,31 | open full card from menu / peek | overlay pick → `model.sheet.full` | P6 | 4 |
| B.4.30,66 | subtask menu over the same sheet; ⋯ → Search | hand-over: one layer transition | P6 | 3, 4 |
| B.4.32,52,62,133,166 | lifted copy, bulk close, link closes menu, view menu, project menu | menu layer (a Preact layer) | P6 | 3 |
| B.4.33 | second press within double click | overlay → entry rename | P6 | 3 |
| B.4.34 | menu closed while typing | entry Msg (layer stack; data applies at once) | P6 | 3 |
| B.4.35,69,129,132,134-135,141-144,146-147 | pure rules (`labelTitle`, `grownStart`, `editRepeat`, `projectsEntryLook`, `projectsDrop`, …) | pure rules in update / selectors | P1 | 3, 4 |
| B.4.61,85,87,91-92,111-128 | MarkdownRenderer, EmbeddedEditor, ObsidianMarkdown, line commands, scopes | `islands` (key scopes (`keys` driver)) | P7 | 3 |
| B.4.63-65 | month pick, view mode, Subprojects | overlay page; Cmd write after the entry ends (pick kinds; number taken at the tap) | P2, P3, P6 | 3 |
| B.4.67 | Select tasks | `model.selection.mode` (layer stack; data applies at once) | P6 | 4 |
| B.4.70 | menu waits for the column to scroll the card in | overlay `revealing` + `scroll` (`scroll` orders; `measure` reports scroll) | P6, P7 | 3 |
| B.4.71,77,84,86,88-89,93-98,100-101 | full card entry session and description draft | `sheet.full` = the core sessions (core session held by the runtime) | P6, P7 | 3 |
| B.4.72 | `RenamedTexts.add` | plugin-wide pending write's patch (P3) [R3] | P3 | 3 |
| B.4.73-76 | full card capsule (undo, ⋯, plus) | `model.canUndo`; overlay; entry | P1, P6 | 3 |
| B.4.78,83 | `find` (async) | read Cmd | P2, P3 | 3 |
| B.4.80,90 | `toggleDone`, `setDescription` (debounced) | Cmd write; debounce timer Cmd | P2, P3 | 1 |
| B.4.81-82 | subtask menu, project line | overlay; Cmd + close | P6 | 3 |
| B.4.99 | title field | `islands` | P7 | 3 |
| B.4.102-103 | full card close / error | Msgs | P6 | 3 |
| B.4.104 | search | read Cmd, coalesced by key | P2, P3 | 4 |
| B.4.106-107 | search pick / close | overlay → `revealed` | P6 | 4 |
| B.4.108 | search takes the ⋯ sheet | hand-over: search takes the ⋯ sheet | P6 | 4 |
| B.4.109 | field's own undo | `input` | P7 | 3 |
| B.4.110 | Refresh now | network lane | P2 | 1 |
| B.4.130-131 | repeat change / remove | overlay page Msgs | P6 | 3 |
| B.4.136-140,145 | by-project reads of the model and handlers | selectors; JSX handlers | P1 | 3, 4 |
| B.4.148-149,151-152,161,167 | tree / list drops, close dim, pick node, move project, clear filter | Cmd write | P2, P3 | 1 |
| B.4.150,155,160 | haptics | Cmd `haptic` | P7 | 1 |
| B.4.153 | panel width → frame | `measure` | P4 | 4 |
| B.4.154 | tree width save | Cmd `device.set` (numbered store writes) [R5] | P2, P3 | 1 |
| B.4.156 | tree width read | `model.device.treeWidth` | P1 | 4 |
| B.4.157,168 | new project / rename project name field | naming layer | P6 | 3, 4 |
| B.4.158-159 | tree row tap, row lift attach | Msg; tree-lift gesture | P6 | 4 |
| B.4.162-165 | `carryAt`, reread, clock, error | Cmd `carryAt` + timer; read; `model.now`; `failed` (core session held by the runtime) | P2, P3, P7 | 3 |
| B.4.169 | carry deps | carry gesture | P6 | 3 |
| B.4.170-172 | note search modal | `islands` | P7 | 4 |
| B.4.174 | grips | `input` → resize gesture | P7 | 3 |

### B.5 G4

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| B.5.1-9,12,22,65,68,73-74,83,96,100 | timeline / list core reads (`DayBoundary`, `shownSpan`, `relation`, clock, `isPast`, `listName`, `stepFunnel`) | (`CoreQueries`, clock from `model.now`) core queries; clock → `model.now` | P7 | 3, 4 |
| B.5.10-11,13-21,23,40-41,60,63-64,79,90-91,95,103 | pure rules | pure rules in selectors | P1, P4 | 3, 4 |
| B.5.24-26,39,42-46,48-50,53,75,81-82,102,104-105 | reads of screen state through deps | selectors | P1 | 3, 4 |
| B.5.27-29,47,51-52,54,76,107-110 | handlers attached per row / block | JSX handlers → `input` Msgs | P7 | 3 |
| B.5.30,66,121 | timeline resize, block scroller, block fit frame | `measure` | P4 | 3, 4 |
| B.5.31 | grips attach | `input` | P7 | 3 |
| B.5.32 | drop line in body | JSX portal | P1 | 3 |
| B.5.33-37 | timeline block motions on render | transitions by cause (keyed diff within one context); leaving (stays in the model until `motionSettled`) [R2] | P5 | 4 |
| B.5.38,61 | `RenamedTexts.shown` | plugin-wide pending write's patch (P3) [R3] | P3 | 3 |
| B.5.55 | `EntryRows` | view + `model.rowKeys` [R4] | P1 | 3 |
| B.5.56,58,117-118 | ScrollHold, ScrollEdges, glides | `scroll` | P7 | 3 |
| B.5.57 | grow room under a plate | transition B1.9 | P5 | 3 |
| B.5.59 | landing render | JSX from section-lift gesture | P1 | 3 |
| B.5.62,72 | icons, kit buttons | JSX | P1 | 3, 4 |
| B.5.67 | `CARD_HEIGHTS.max` | constant | P1 | 3 |
| B.5.69-71 | day arrows, Today | day-swipe Msgs | P6 | 4 |
| B.5.77,80,93,106 | divider live width, haptics | transient channel; Cmd `haptic` | P4, P7 | 4 |
| B.5.78,92 | share saves | Cmd `device.set` (numbered store writes) [R5] | P2, P3 | 1 |
| B.5.84-86 | ribbon day track / follow / arrive | swipe gestures | P6 | 4 |
| B.5.87-88 | `is-switching` timers | ribbon slide transition | P5 | 4 |
| B.5.89,94,101 | shared nav placement, by-project mount | view composition | P1 | 3, 4 |
| B.5.97-99 | rows heights motion, fit frame, settle refit | transitions + `measure`; heights never held, animated in the commit phase [R2] | P4, P5 | 3, 4 |
| B.5.111-116 | keyed rows motion | transitions by cause (keyed diff within one context); leaving (stays in the model until `motionSettled`) [R2] | P5 | 3 |
| B.5.119-120 | `SnapGlide` | `motion` | P5 | 4 |
| B.5.122-124 | prototype | replaced by the runtime | — | 1, 7 |

### B.6 event sources

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| B.6.1 | `TaskService.onChange` | `fileChanged` → read queued in the file sequence (read-back, numbered (P3)); full card re-read (layer stack; data applies at once) | P2, P3 | 1 |
| B.6.2,13 | calendar change, poll | network lane | P2 | 1 |
| B.6.3,47-48 | settings / view settings change | `settingsChanged` (numbered store writes) [R5] | P2, P3 | 1 |
| B.6.4 | day change | `dayChanged` (applies at once (P6)) | P6 | 4 |
| B.6.5-7 | focus, visibility, active leaf | `chrome` → `model.visible`; poll wake | P4 | 3, 4 |
| B.6.8 | document pointerdown ×3 | `input` → `pressedElsewhere` | P7 | 3 |
| B.6.9 | document keydown (bulk) | `input` | P7 | 4 |
| B.6.10,95 | arbiter idle | gone: the gesture's end applies its deferred re-layout | P6 | 3, 4 |
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
| B.6.82-83 | peek reads resolve | `peekRead` Msg [R6] | P2, P3 | 4 |
| B.6.84-86 | swipe pointer, wheel stream timer, pager frame | `recognizers/` + `motion` | P7 | 4 |
| B.6.87-88 | pinch pointer / wheel, wheel settle | `input` + pinch gesture | P7 | 4 |
| B.6.89-90 | wheel pointer, click, keys, timers | `input` + wheel-drag gesture | P7 | 4 |
| B.6.91,165 | divider gestures (ribbon) | `input` + divider gesture | P7 | 4 |
| B.6.166 | divider gestures (still layouts) | `input` + divider gesture | P7 | 4 |
| B.6.92 | settings row reorder | settings-tab host: reorder gesture through `input` and `recognizers/`; the order write numbered | P3, P6, P7 | 6 |
| B.6.93,159-161 | free room double click, plates | `input` → entry | P7 | 3 |
| B.6.94 | found card frame | `scroll` reveal | P7 | 4 |
| B.6.96,100-103 | full card refresh, title rename end, description save, focus, Escape | `sheet.full` Msgs; Escape order (layer stack; data applies at once) | P6 | 3 |
| B.6.105,112-113 | full card / overlay show and remove frames | presence (stays in the model until `motionSettled`) | P5 | 3 |
| B.6.107-109 | search input, keys, row click | overlay search | P6 | 4 |
| B.6.110-111 | overlay Escape, backdrop | `input` → overlay close | P7 | 3 |
| B.6.114 | `Picks.giveUp` | (timeout message) bounded wait | P2 | 3, 4 |
| B.6.115-117,121-127 | menu events (Enter, double press, copy click, peek, view menu frame, month arrows, switch, toggles) | overlay Msgs (a Preact layer) | P6 | 4 |
| B.6.118 | stack field row grows | transition | P5 | 3 |
| B.6.119 | menu after the column scroll | overlay `revealing` + `scroll` (`scroll` orders; `measure` reports scroll) | P6 | 3 |
| B.6.120 | page morph finished | `motionSettled` | P5 | 3 |
| B.6.128-132 | embedded editor focus, update, keys, rendered click | `islands` | P7 | 3 |
| B.6.133,135 | tree panel resize, tree divider | `measure`; tree-divider gesture | P4, P6 | 4 |
| B.6.134,136,141-143 | dim, tree row, filter title, plate | Msgs | P6 | 4 |
| B.6.137-138 | tree lift | `input` + tree-lift gesture | P7 | 4 |
| B.6.139-140 | carry report timer, move / end | Cmd `carryAt` + timer (core session held by the runtime) | P2, P7 | 3 |
| B.6.144 | repeat editor buttons | overlay page Msg | P6 | 3 |
| B.6.145 | view button | overlay `view` | P6 | 3 |
| B.6.146 | note chosen | `islands` → Cmd write | P2, P3 | 3 |
| B.6.147-148,152 | grips, kit buttons | `input` | P7 | 3 |
| B.6.149 | timeline resize observer | `measure`; anchor held (`scroll` orders; `measure` reports scroll) | P4 | 4 |
| B.6.150-151 | wheel / touch drop the anchor | `input` → `userScrolled(timeline)` | P7 | 4 |
| B.6.153,156-158 | ScrollEdges, ScrollHold | `scroll` (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| B.6.154,173-174 | motion finished (block gone, row grown / left) | `motionSettled` (stays in the model until `motionSettled`) [R2] | P5 | 3 |
| B.6.162-164 | note block observers and frame | `measure` | P4 | 3 |
| B.6.167-168 | strip track callbacks, slide end | `motion` | P5 | 4 |
| B.6.169-171 | rows observer, fit frame, settle | `measure`; `motionSettled`; heights never held [R2] | P4, P5 | 3, 4 |
| B.6.172 | drop hover in rows | carry target | P6 | 3, 4 |
| B.6.175-176 | glide stopped by a finger, glide end | `scroll` `userScrolled`, `scrollSettled` (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| B.6.177 | `SnapGlide` frames | `motion` | P5 | 4 |
| B.6.178-180 | prototype | replaced by the runtime | — | 1, 7 |

## Behaviour (203 inputs, 84 motions, 84 measurements, 52 screen states)

Row ids are the ids of `inventory-behaviour.md` (it has no C1.16; C1 holds 23 rows).

### A. Inputs and gestures

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| A1.1-2 | open the tab (ribbon icon, command) | host (plugin) opens the view; runtime mounts a screen | P7 | 1 |
| A1.3 | note block appears | host block; same view in a block host | P7 | 3 |
| A1.4 | several tabs, popouts | one runtime per plugin; file sequence shared; `chrome` per window | P2, P3, P7 | 1 |
| A2.1 | tap a card → task menu after reveal | tap `recognizers/` → overlay `task` with `revealing` (`scroll` orders; `measure` reports scroll) | P6 | 3 |
| A2.2 | counter tap folds subtasks | Cmd `toggleCollapsed`; fold motion by cause (keyed diff within one context) [R3] | P2, P5 | 3 |
| A2.3 | folder mark tap → filter | Cmd `selectProjectNode` | P2 | 3 |
| A2.4,8-9 | right click / click with selection → bulk or task menu | tap order function over `model.selection`; overlay | P6 | 4 |
| A2.5 | double click → rename | overlay `task` → entry rename (second press within 250 ms) [R1] | P6 | 3 |
| A2.6-7,10 | Cmd-click, Shift-click, tap in select mode | `model.selection`; select mode (layer stack; data applies at once) | P6 | 4 |
| A2.11-15 | long press / mouse drag lift, cancel, second finger, redraw during press | `recognizers/` → carry gesture; hand-off to pinch | P6, P7 | 3 |
| A2.16-17 | Done / immovable by-project cards | card `can` from the core; tap only | P1 | 3, 4 |
| A2.18-21 | double click free room, plates | `input` → entry `openAtEnd` / `openIn` [R1] | P6 | 3, 4 |
| A2.22 | select text in the lifted copy | view (native selection) | P1 | 3 |
| A2.23 | link in the copy | overlay pick → Cmd `obsidian.open` | P6 | 3 |
| A3.1 | section header tap | overlay `section` | P6 | 3 |
| A3.2 | section lift | section-lift gesture | P6 | 3 |
| A3.3-4 | rename section, new section name | naming layer [R1] | P6 | 3 |
| A4.1-3 | timeline tap, double click, mark | tap `recognizers/` → overlay / entry / Cmd | P6 | 4 |
| A4.4-5 | finger hold → menu, then drag with no free moment | hold gesture + overlay at once, then hand-off (layer stack; data applies at once) | P6 | 3 |
| A4.6 | mouse drag of a block | carry gesture (grab offset) | P6 | 3 |
| A4.7-8 | long click, right click → select with menu | `model.timeline.selected` + overlay | P6 | 4 |
| A4.9 | stretch dots | resize gesture | P6 | 3 |
| A4.10 | event menu | overlay `event` | P6 | 4 |
| A4.11 | new slot on canvas | new-slot gesture → entry | P6 | 3 |
| A4.12-13 | pinch, ctrl-wheel zoom | pinch gesture; transient channel; dispatch on a step [R5] | P4, P6 | 4 |
| A4.14 | touch / wheel drops the opening anchor | `userScrolled(timeline)` clears `model.timeline.anchor` (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| A4.15 | press elsewhere clears the block selection | `pressedElsewhere` | P6 | 3 |
| A5.1-2,12 | plus tap / keyboard; ignored while hidden | entry `openFromPlus`; selector `plusHidden` [R1] | P6 | 3 |
| A5.3-8 | carry the plus; ring cancel; drop in gap, timeline, title, by project | carry gesture `payload: plus` [R1] | P6 | 4 |
| A5.9 | plus in the tree gap → project name | carry → naming `newProject` [R1] | P6 | 4 |
| A5.10-11 | plus at the left edge / over a tree row | core carry session (core session held by the runtime) | P6, P7 | 4 |
| A6.1-5,7,9,11-13 | drag moves, targets, cancel, cross ring, tree drop | carry gesture; targets computed from `model.measured` and the core's rules; pinned, `targetChanged` on a read | P4, P6 | 3, 4 |
| A6.6 | auto-scroll at edges | `scroll` `edge`; offsets back to the carry (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| A6.8 | hover a tree row 600 ms → node opens | core carry; read the carry asked for applies at once (pinned drop places, `targetChanged` (P6)) | P6 | 4 |
| A6.10 | let go → write, then flight to the real place | pending write's patch (P3) + flight transition (pending write patch) [R3] | P3, P5 | 3 |
| A6.14 | let go among by-project cards | pending write's patch: the landing card at the line (P3) [R3] | P3 | 3 |
| A6.15 | new drag while a copy flies | `motion` finishes the running flight | P5 | 3 |
| A6.16 | no redraw under a gesture | only the active gesture defers a re-layout under the finger | P6 | 3, 4 |
| A6.17 | iOS lost lift | `input` (new primary finger ends the gesture) | P7 | 3 |
| A6.18 | view closed mid-drag | runtime teardown cancels the layer | P7 | 3 |
| A6.19 | lifted block leaves the timeline stack | selector `stackTasks` without `carry.lifted`; transition | P1, P5 | 4 |
| A7.1-5 | finger swipe, vertical scroll, trackpad swipe, ctrl-wheel, rubber band | ribbon swipe gesture + `recognizers/` | P6, P7 | 4 |
| A7.6 | finger down while the screen runs | a tap leaves the settle running and goes to what it hit | P5, P6 | 4 |
| A7.7 | new swipe during a run | ribbon swipe catches the running transition | P5, P6 | 4 |
| A7.8 | no swipe in other modes / block | selector `hasPages` | P1 | 4 |
| A7.9-14 | wheel tap, quick / slow drag, long press, arrows, cancel | wheel-drag gesture; careful pace `recognizers/` [R6] | P6 | 4 |
| A7.15 | leaving Done | update rule on place change | P2 | 4 |
| A7.16-18 | ‹ ›, title → today, repeated taps | day-swipe gesture and its queue (timeout message) [R6] | P6 | 4 |
| A7.19 | switch day / place with a field open | the field's writes numbered first; the switch is a transaction; a bar place keeps the field layer [R6] | P3, P6 | 4 |
| A8.1-2 | ribbon divider, snap glide | divider gesture; snap transition [R5] | P5, P6 | 4 |
| A8.3 | still layouts' divider | divider gesture | P6 | 4 |
| A8.4 | tree divider | tree-divider gesture; lists give way live (transient channel; dispatch on a step) [R5] | P6 | 4 |
| A8.5 | fixed halves | view (not draggable) | P1 | 4 |
| A9.1-3,6 | folder button, tree row, dim, cross | Cmd writes (`setProjectsPanel`, `pickProjectNode`, `clearProjectFilter`) [R6] | P2, P3 | 4 |
| A9.4 | project lift | tree-lift gesture | P6 | 4 |
| A9.5,8,10-11 | project menu, folder switch, note, delete | overlay `project` (a Preact layer) | P6 | 3 |
| A9.7 | rename project | naming layer [R1] | P6 | 3, 4 |
| A9.9 | attach note | `islands` (Obsidian `FuzzySuggestModal`), opened by a typing pick | P6, P7 | 3 |
| A10.1-3 | view button, mode, Subprojects | overlay `view`; Cmd writes after the entry ends [R6] | P2, P3, P6 | 3 |
| A11.1 | undo | Cmd `undo`; motion of what it changed (keyed diff within one context) [R3] | P2, P3, P5 | 1 |
| A11.2-3 | ⋯ menu, Search on the same sheet | menu layer `more` → `search` by one hand-over | P6 | 4 |
| A11.4-6 | select mode | `model.selection.mode` (layer stack; data applies at once) | P6 | 4 |
| A11.7 | press outside clears selection | `pressedElsewhere` | P6 | 4 |
| A11.8-11 | search typing, keys, pick, cancel | overlay `search`; coalesced read | P2, P3, P6 | 4 |
| A11.12-13 | Cmd+F, Cmd+Z in the view | `keys` driver (Obsidian `Scope`s) → Msgs | P7 | 3, 4 |
| A11.14 | Cmd+Z in a plain field | `input` | P7 | 3 |
| A11.15 | any press clears the found ring | `pressedElsewhere` → `model.found = null` | P6 | 4 |
| A12.1-3 | backdrop, Escape, Enter confirms | menu layer; Escape order over the stack (layer stack; data applies at once) | P6 | 3 |
| A12.4 | first pick, action after the fade | overlay `picked`; slot in the file sequence (pick kinds; number taken at the tap) [R3] | P2, P3, P6 | 3 |
| A12.5 | pick that types | typing pick: the field focused inside the tap [R1] | P2, P6, P7 | 3 |
| A12.6-10 | label tiles, project page, repeat page, date picker, reminder | overlay pages redrawn (a Preact layer) | P6 | 3 |
| A12.11 | subtask menu over the same sheet | hand-over: one layer transition to the subtask's sheet | P6 | 3 |
| A12.12-13 | description peek, Refresh now | overlay → sheet; network lane | P2, P6 | 4 |
| A13.1-14,16,18-19 | field typing, keys, IME, `[[`, line hotkeys, paste, tap away, blur, bar | field layer (core `QuickEntrySession`) (core session held by the runtime); `islands`; `input`; `focus` [R4] | P6, P7 | 3 |
| A13.15 | bar panels | nested overlay inside the entry (layer stack; data applies at once) | P6 | 3 |
| A13.17 | place tile / date in the bar | field layer + a context change (ribbon / day) ordered after the field's writes by their numbers [R6] | P3, P6 | 4 |
| A13.20 | rename via menu (list, timeline, stack) | overlay → entry [R1] | P6 | 3, 4 |
| A13.21 | add subtask on a timeline-only task | overlay + entry at once (layer stack; data applies at once) | P6 | 4 |
| A13.22 | hand scroll stops following the field | `scroll` `userScrolled` → entry `follow = false` | P7 | 3 |
| A14.1-10 | full card: close, Escape, Done, circles, subtasks, parent, project, description, bottom row, rename | `model.sheet.full` + sessions (core session held by the runtime) + overlay (layer stack; data applies at once) [R1] | P6, P7 | 3 |
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
| A16.12 | naming holds the screen | naming layer + keyed field (row key kept across the create) [R4] | P6 | 3 |
| A16.13 | project menu refuses while busy | start table | P6 | 3 |
| A16.14 | redraws and tick wait while busy | gone: data applies at once; only the active gesture defers a re-layout under the finger | P6 | 3, 4 |
| A16.15 | writes in order, after a closing pick | file sequence; pick slot (pick kinds; number taken at the tap) | P2, P3 | 1 |
| A16.16 | Escape order | function over the layer stack (layer stack; data applies at once) | P6 | 3 |
| A16.17 | tap order on a card | function over the active gestures | P6 | 3 |

### B. Motions

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| B1.1-4 | row grows in, leaves, mark row folds, kept row slides (FLIP) | list transitions by cause (keyed diff within one context); leaving (stays in the model until `motionSettled`) [R2] [R3] | P5 | 3 |
| B1.5 | row comes back while leaving | a leaving row whose key returns [R2] | P5 | 3 |
| B1.6-8 | timeline block moved, new, gone | timeline transitions by cause [keyed diff within one context, stays in the model until `motionSettled`] [R2] | P5 | 4 |
| B1.9 | plate replaced by first card | transition (room grows under the stand-in) | P5 | 3 |
| B1.10,12 | bar panel fades, desktop bar leaves | presence (stays in the model until `motionSettled`) | P5 | 3 |
| B1.11 | desktop bar appears | appear transition | P5 | 3 |
| B1.13 | float width from the card | carry lift transition | P5 | 3 |
| B1.14 | menu page morph | overlay page transition (a Preact layer) | P5 | 3 |
| B1.15-16 | section copy lands / flies back / sinks | section-lift transitions | P5 | 3 |
| B1.17 | strip scrub between places | transient channel between two computed layouts (computed per place, (P4)) | P4, P5 | 4 |
| B1.18 | stack field row grows | transition | P5 | 3 |
| B2.1 | fade room height when a field opens | entry transition (WAAPI; layout transition banned in CSS) [R7] | P5 | 3 |
| B2.2 | plus / capsule / wheel hide (scale) | transition on gesture / entry / select start [R7] | P5 | 3 |
| B2.3-5,7 | wheel settle, ribbon `is-switching` | ribbon / wheel transitions [R7] | P5 | 4 |
| B2.6,22-23,27,29 | popover, peek, panel, sheet, search rise | presence transitions (transform moves to WAAPI) (stays in the model until `motionSettled`) [R7] | P5 | 4 |
| B2.8-10 | fold on lift (cards, slot, plate) | carry / section-lift transitions [R7] | P5 | 3 |
| B2.11-12 | list drop line moves, level | carry target transitions [R7] | P5 | 3 |
| B2.13 | timeline drop line steps | carry target transition [R7] | P5 | 4 |
| B2.14-16 | plus / card float flights, stack fade | flight transitions (pending write patch) [R3] [R7] | P5 | 3 |
| B2.17-19 | backdrop, level shadow, copies fade | CSS opacity stays; presence (stays in the model until `motionSettled`) | P5 | 3 |
| B2.20-21 | select circles slide in, dots hide | select-mode transition [R7] | P5 | 4 |
| B2.24 | folder switch knob | overlay transition; pending write's patch (P3) [R3] [R7] | P5 | 3 |
| B2.25 | bar rides the keyboard | keyboard transition [R7] | P5 | 3 |
| B2.26 | desktop capsule away (opacity) | CSS opacity stays; presence (stays in the model until `motionSettled`) | P5 | 3 |
| B2.28 | settings rows step aside | settings-tab host: the step-aside transition (WAAPI) [R7] | P5 | 6 |
| B2.30-31 | phone tree panel slide, dim | panel transition [R7] | P5 | 4 |
| B2.32-33 | docked panel and columns slide | dock transition [R7] | P5 | 4 |
| B2.34 | view button hides / moves with the wheel | transition with the ribbon [R7] | P5 | 4 |
| B2.35 | rows heights (delayed while a card fades) | rows heights animated with the fold in one transition (commit phase) [R2] [R7] | P4, P5 | 3, 4 |
| B2.36 | another context: heights jump | no transition on a context change | P5 | 3, 4 |
| B2.37 | press feedback | CSS stays | P5 | 3 |
| B3.1-4 | pager run, day track, strip follow, rubber band | swipe gestures + `motion` (transient channel) (a tap leaves the settle running) [R6] | P5 | 4 |
| B3.5 | divider glide into / out of the middle | snap transition | P5 | 4 |
| B3.6 | column scrolls the card in, then the menu | overlay `revealing` + `scroll` (`scroll` orders; `measure` reports scroll) | P6, P7 | 3 |
| B3.7 | search reveals a card | `scroll` reveal | P7 | 4 |
| B3.8 | field follows into sight | `scroll` reveal; `motionSettled` | P7 | 3 |
| B3.9 | keyboard slide | keyboard transition | P5 | 3 |
| B3.10 | field in a menu raised over the keyboard | selector from `model.chrome.keyboard` | P4 | 3 |
| B3.11 | auto-scroll | `scroll` `edge` | P7 | 3 |
| B3.12 | pinch layout per frame | transient channel; dispatch on a step | P4 | 4 |
| B3.13 | flight awaited by timer | `motionSettled` (timeout message) [R3] | P5 | 3 |
| B3.14-16,18 | overlay / panel / full card show and remove | presence (stays in the model until `motionSettled`) | P5 | 3 |
| B3.17 | view menu placed again next frame | `measure` → placement | P4 | 3 |
| B3.19-21 | wheel settle, ribbon switch, docking class timers | transitions | P5 | 4 |
| B3.22 | rows fit then re-measure | rows heights measured, never held; one transition with the fold [R2] | P4, P5 | 3, 4 |
| B3.23 | scroll hold under a shrinking list | `scroll` (ScrollHold) [R2] | P7 | 3 |
| B3.24 | now line every minute | clock → `model.now` | P2 | 1 |
| B3.25 | settings row settles | settings-tab host: the settle transition, then the order from the write | P5 | 6 |
| B3.26 | timeline opening anchor | (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| B3.27-29 | question, search row, name fields scrolled into view | `scroll` reveal | P7 | 3, 4 |

### C. Measurements

| Rows | What | Owner in revision 5 | P | Slice |
|---|---|---|---|---|
| C1.1-3,6 | stage width, rubber band distance, day track distances | `measure` stage size | P4 | 4 |
| C1.4 | keep hours still when all-day rows differ | computed from the model (all-day rows) and measured heights | P4 | 4 |
| C1.5 | forced reflow for `is-redrawn` | gone | P5 | 3 |
| C1.7 | strip keyframes from computed styles | computed per place (P4); tokens read once | P4 | 4 |
| C1.8 | still-layout widths | selector `layoutWidths` over stage size | P4 | 4 |
| C1.9-14 | rows: room, fade, leaving delay, typing heights, stops | `measure` row heights → selector `stackedLists` [R2] | P4 | 3, 4 |
| C1.15 | foot fade left edge | selector | P4 | 3, 4 |
| C1.17 | note block height | `measure` content height | P4 | 3 |
| C1.18-19 | Live Preview end room, note view mutations | host block | P4, P7 | 3 |
| C1.20 | status bar room | `chrome` | P4 | 4 |
| C1.21-22 | tree panel width, tree divider bounds | `measure`; selector | P4 | 4 |
| C1.23 | finger px per wheel place | token read once | P4 | 4 |
| C1.24 | settings rows wrap | settings-tab host: `measure` | P4 | 6 |
| C2.1,6 | scroll edge fades | `scroll` (`scroll` orders; `measure` reports scroll) | P7 | 3 |
| C2.2 | scroll hold room | `scroll` [R2] | P7 | 3 |
| C2.3 | FLIP rects | gone (transitions by cause) (keyed diff within one context) | P5 | 3 |
| C2.4 | Motion reads of boxes and styles | `motion` reads what it animates (`motion` reads its boxes in the commit phase) | P7 | 3 |
| C2.5 | bar resting top through transforms | `chrome` + `measure` | P4 | 3 |
| C2.7-8 | by-project / tree scroll reset / keep | `scroll` orders (`scroll` orders; `measure` reports scroll) | P7 | 4 |
| C2.9 | peek over the shown columns, same scroll | view draws the peek layout; scroll copy (`scroll` orders; `measure` reports scroll) | P4 | 4 |
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

| Rows | What | Owner in revision 5 | P | Slice |
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

## The 23 classes against revision 5

Each class of the revision-4 run was checked against what revision 5 actually says, not against its §Resolution table.

| Class | Revision 5 | Why |
|---|---|---|
| M1 the settings tab | Resolved | Revision 5 gives it a host of its own in the same architecture (slice 6), with writes numbered through the runtime. Only the styles guard's scope over `.tc-level-row.is-shifting` is left, now part of R7. |
| M2 the plugin host | Resolved | The plugin runtime lives in `host/` (`main.ts`). The guard allows services in `host/`, and file work is "one plugin-wide numbered sequence". The settings echo part moved to R5. |
| M3 chrome both ways | Resolved | The `chrome` driver takes "what to show in the chrome (body classes …)" from the model and owns theme tokens per window. |
| M4 synchronous core reads | Resolved | `CoreQueries` in selectors with the clock from the model (P7). Checked in code: `menu`, `bulkMenu`, `carried`, `fullTree` and `listName` are pure over their arguments and settings (`TaskReads.ts:480-496`). |
| M5 the core's sessions | Resolved | "They are the machines themselves. The runtime holds them, a command calls them, and the model holds their latest snapshot" (P7). |
| M6 menus | Resolved | The plugin's own menus and sheets are Preact layers. Islands are only CodeMirror, `MarkdownRenderer` and Obsidian `Modal`. |
| M7 pick timing | Partly: R1 | Three kinds of pick and "a write takes its number when the user's message is processed" resolve the ordering (D81, A7.19). The synchronous focus contradicts the once-per-microtask notification (R1). |
| M8 one interaction | Resolved | P6: a stack of layers plus one gesture; data applies at once; only the gesture defers a re-layout under the finger. |
| M9 motion by cause | Resolved, with R3 | P5: a keyed diff within one context, for Max's changes and the file's alike (`screen.md:94`). What the diff compares while a write is pending depends on R3. |
| M10 leaving rows, closing overlays | Partly: R2 | "Stays in the model until its motion settles" is stated. Its place in the end-state layout and revival when its key returns are not (R2). |
| M11 heights held during motion | Partly: R2 | "Measurements are never held. The commit phase animates them." That holds only if the leaving card is out of the measured end state (R2). |
| M12 continuous values | Resolved | The transient channel lays out with the same selectors and dispatches on a step (P5). |
| M13 positions as geometry | Resolved | `motion` reads the boxes it animates in the commit phase. Drop places, menu anchors and the ribbon are computed from measured sizes, the stage and `scrolled` (P4); window room comes from `chrome`'s `window`. |
| M14 scroll | Resolved | `scroll` owns writes with `reveal`, `toHour`, `keep`, `edge` and `open`; `measure` reports `scrolled` (quantised) and `scrollSettled`; `scroll` reports `userScrolled`. |
| M15 swipe settle | Resolved | "A tap does not stop a settle; it goes where it lands." A new swipe catches it through `motionInterrupted(id, at)`. |
| M16 unbounded waits | Resolved | P2: "every wait has a bound … the timeout is a message." |
| M17 the device and settings stores | Partly: R5 | The writes are numbered, but the echo cannot be dropped "by its number": `data.json` and its `raw` event carry none (R5). |
| M18 the network lane | Resolved | Latest wins per day; a superseded fetch is abandoned; no contract change. |
| M19 cross-screen renames | Resolved | Pending writes are plugin-wide (P3). |
| M20 gesture recognition | Resolved | `recognizers/`, pure, unit-tested (Tests 3). |
| M21 all service callers | Resolved, with R7 | Slice 1: "every service caller in `obsidian/ui` goes through it". The guard's own scope text disagrees with this (R7). |
| M22 a dropped card before its read | Partly: R3 | "Its pending write's patch." It is not said that the patch is the core's `dropPreview`, nor when the preview runs relative to earlier writes (R3). |
| M23 Obsidian key scopes | Resolved | The `keys` driver owns `Scope`s and `pushScope`, from the layer stack. |

18 of 23 are resolved, two of them with a remainder that moved into another open class (M9 into R3, M21 into R7). 5 are resolved only in part (M7, M10, M11, M17, M22). Two new classes come from what revision 5 dropped or added: R4 (decision 3 on row identity was dropped) and R7 (the guards' scope).

## Rows that do not fit

Each item names a class, not a row, and proposes the principle or mechanism the spec must state so the whole class is owned. A row can be in more than one item. "Too vague" is used only where an implementer would have to guess something that changes behaviour or correctness.

### No mechanism owns it

None. Every row has an owner in revision 5.

### The principles would change what the user sees

None. Revision 5 keeps every behaviour of the inventory: motions within a context move as `screen.md:94` says, a context change is drawn still, a tap leaves a settle running.

### Two principles conflict

#### R1. A typing pick needs its field rendered inside the tap, but the store renders a microtask later

**Rows (29):** A2.5, A2.18-21, A3.3-4, A5.1-2, A5.5-6, A5.8-9, A9.7, A12.5, A13.20, A14.10, A.2.307, A.2.339, A.2.479, B.2.88, B.2.242, B.4.24-26, B.4.29, B.4.53, B.4.55, B.4.57

Left over from M7, point 3. P2 says "dispatch is synchronous. A message from a user's event is processed, and its focus and keyboard work is done, inside that same event", and Picks item 2 says a typing pick "focuses the field synchronously inside the tap". But the runtime says "subscribers are notified once per microtask", and the field a pick opens (Rename, Add subtask, New section, project Rename, the plus, a plate, a double click) does not exist until `view` has rendered it. Focus can only happen after that render, which runs after the handler has returned. `kit/Panel.ts:11` records why that matters: "iOS raises the keyboard only for a field focused by the finger's own tap". The spec does not say which rule wins, and the implementer has to guess whether WebKit still counts a microtask as part of the tap. A wrong guess means the keyboard does not rise on the iPhone, which Max has already reported.

**The spec must say (P2 and the runtime):** a message that orders focus is **flushed**: `update`, render of the affected subtree and the `focus` driver run synchronously before the event handler returns, bypassing the microtask batch. That is the one exception to "once per microtask", the `focus` driver tests check it on the handler's own stack, and the phone checklist checks it on the device.

#### R2. "Render the end state" against "a leaving row stays in the model"

**Rows (50):** B1.2-3, B1.5, B1.8, B2.35, B3.22-23, C1.9-14, C2.2, A.2.93, A.2.277, A.2.297-302, A.2.460-466, A.2.470, B.5.33-37, B.5.97-99, B.5.111-116, B.6.154, B.6.169-171, B.6.173-174

Left over from M10 and M11. P4's frame renders "the end state", `measure` reads it, and `motion` animates "from the declared start to the measured end". P5 keeps "a row that is leaving … in the model until its motion settles". The spec does not say how a leaving row takes part in the end-state render:
- **Drawn at full size:** the measured end of the list (`stackedLists`, the note block's height, `ScrollHold`'s room) still holds the leaving card. Rows mode then shrinks the list only after `motionSettled`, which is the two-step gap rejected in D76 (B2.35, B3.22).
- **Not drawn:** the fold has nothing to animate.

There is also no rule for B1.5. When a removed row's key comes back during its fold, today the leave is cancelled. In the model there would be two entries with one key, a leaving one and a live one, so Preact either crashes on the duplicate or runs a second motion.

**The spec must say (P4 and P5):**
- A leaving entry is kept for its node only. The layout selectors (`stackedLists`, list heights, block height, scroll room) skip leaving entries, so the end state measured is the end without it.
- `motion` folds the node from its start box to zero inside that same frame's transition, so the list and the card move as one motion. Dependent heights keep their phase offset ("after the fade half") as part of the same numbered transition.
- A key that reappears revives its leaving entry (one entry per key), and the transition is interrupted (`motionInterrupted`) and replanned.

### Too vague to build without guessing

#### R3. Which writes have a patch, and who computes it

**Rows (23):** A2.2, A6.10, A6.14, A11.1, A12.4, B1.4, B2.14-16, B2.24, B3.13, A.2.165, A.2.185-186, A.2.337-338, A.2.352, A.2.413, B.1.74, B.3.59, B.4.72, B.5.38, B.5.61

Left over from M9 and M22 (and fact 18 of A.1). P3 defines `shown = fold(pending writes, last read)` and says "a pending write is the write's patch: the moved card at its landing, the renamed text, the new row", as if every write had one. Only some outcomes are known before the read:
- **A drop:** the core already answers it, through `TaskService.dropPreview` / `landing` (`contracts.ts:1685-1693`: "so a frontend draws the next screen at the moment of the drop"). The Swift app uses `dropPreview` this way (`apple/Core/Sources/Core/BoardSnapshot.swift:459`). The spec names neither.
- **A rename** (the typed text) and **a create** (`CreatedTask`, see R4) are known.
- **Done, a date, a priority, a section or project move, Postpone, Won't do, a repeat, the counter fold, the folder switch and Undo** are placed by the core. A patch for them would have to be computed by the UI, which `CLAUDE.md` forbids ("the UI decides nothing"). Without one, the card stays put until the read.

The preview is also a read of the file. Run "at the user's message" while an earlier write is still in flight, it describes the file *before* that write, so the patch lands the card in the wrong place and the read then moves it a second time.

So an implementer has to guess, for each write, whether there is a patch, where it comes from and when it is computed. Each guess changes when and where the card moves (A6.10, A6.14, D84).

**The spec must say (P3):**
- A patch comes only from the core: `dropPreview` for drops (lists, timeline, by-project, tree), `rename` / `edit`'s answer for text, and `CreatedTask` for a new row.
- Every other write has no patch. Its card stays as the last read shows it, and it moves by P5's keyed diff when the read retires the write.
- A preview is a job in the file sequence, right after the writes before it and right before its own write, so it describes the file the write will change. Until it answers, the drop's copy waits at the release point (today's A6.10).

#### R4. A new row's key across its create

**Rows (24):** A13.2, A13.10, A16.12, A.2.92, A.2.94-95, A.2.332-336, A.2.534-536, B.2.20-24, B.2.67, B.2.131-133, B.5.55

Revision 4's decision 3 said a typed row keeps its key for life: the create returns the task (`CreatedTask`) and the model records `taskId → rowKey`, so "the field never remounts, and the iPhone keyboard stays". Revision 5 keeps only the contract change in slice 1 and drops the rule. Today `EntryRows.created` and `list.adopt(created.id)` hand the typed row to the new card.

Under P3, the new row is a pending write's patch under a provisional key. When the read retires it, the card arrives under the task's own key. P5 then sees one key removed and another added, and folds one row out while another grows in. That is a motion no one asked for. If the field is still in that row (Enter, A13.2), it remounts and the keyboard drops. The implementer has to guess the identity rule.

**The spec must say (P1 and P3):** a row's key is model state: `rowKey(taskId)`, seeded by the patch's provisional key and bound to the task's id by `CreatedTask` when the create answers. The read keeps that key. A row is keyed by `rowKey`, never by the task's line, so a create, a rename or a move never remounts it.

#### R5. "An echo of our own write is dropped by its number" — the store's events carry none

**Rows (25):** A4.12-13, A8.1-2, A8.4, A.2.498-500, B.1.54, B.1.72, B.1.120, B.2.136-141, B.3.107, B.3.110, B.4.154, B.5.78, B.5.92, B.6.3, B.6.47-48

Left over from M17. The runtime numbers "the settings and device-store writes" and drops an echo "by its number". But the device view settings (`listShare`, `zoom`, `treeWidth`) live in `data.json`, and their change event is Obsidian's `vault.on("raw")` followed by a reload of the whole file (`obsidian/main.ts:132-138`, `ViewSettingsFile.onChange`: "fires after the settings changed, here or through Sync"). Neither the file nor the event carries our number. So an echo of our own write cannot be told from Sync by any number. The implementer has to guess: compare content, count events, or ignore events during a write. A wrong guess snaps the divider, the zoom or the tree width back to an older value, or drops a real Sync change.

**The spec must say (runtime):** a store lane keeps its last written value per key and a count of its writes in flight.
- While a write of that store is in flight, the store's change events are not applied; the model keeps the value of the last write.
- When the last write settles, the lane reads the file once. The result is applied as an outside change if it differs from what was written.
- Echoes are then recognised by state, not by a number the file does not have.

#### R6. What a pending context change draws, and a second change while one is pending

**Rows (36):** A7.9-10, A7.16-19, A9.2, A10.2, A13.17, B3.1-2, A.2.12, A.2.14, A.2.220-222, A.2.239, A.2.241-243, B.1.21, B.1.33, B.1.57-59, B.1.125, B.3.82-84, B.3.97-101, B.6.82-83

Left over from revision 4's decision 5 (the peek) and from `turning` / `drawnLanding`, which slice 1 does not list among what it replaces. P3 makes another day, place, filter or mode "a transaction": "the model keeps the change pending until every read the new context needs has landed, then switches in one message". But a day swipe, an arrow turn and a wheel tap *finish their motion first*. The strip or the day has already slid to the new place when the gesture ends, and the read may still be in flight (today: the landed day is drawn over the screen for up to 1000 ms, `CS.landing`, A7.18). The spec does not say:
- what the screen shows between the end of the gesture's motion and the switch. If it is the old context, the strip snaps back. If it is the peek, its read and the incoming context's read are two reads of one day, and it must say which wins.
- what a second change does while one is pending (repeated arrow taps, A7.18; a swipe during a turn, A7.7). Queued, today's behaviour, gives two slides. Superseded gives one slide to the last.
- where the header's day and the wheel's place come from while it pends (fact 4, `shownPlace`).

Each answer is visible, and today's behaviour is in `screen.md:124-127`.

**The spec must say (P3 and P6):** a context change started by a gesture is held by that gesture's layer until the switch. The layer draws the incoming context from its own read, the peek's for a day, and that read *is* the read the transaction waits for. It is folded with pending writes like any read, so promoting it is safe. The transaction completes on it, bounded by a timeout (P2). Further changes while one pends are queued in the layer in arrival order, as today, and a new swipe catches the running motion (A7.7).

#### R7. The guards' scope while the old screen lives

**Rows (36):** B2.1-15, B2.20, B2.22-25, B2.27-30, B2.32-35, A.2.509-512, B.3.114-117

The spec says `tests/uiRules.test.ts` "covers `obsidian/ui/next`", but the "impossible" table and the M21 resolution say the services rule covers "the whole `obsidian/ui` from step 1". `tests/styles.test.ts` "bans a `transition` of `height`, `width`, `margin`, `padding`, `top`, `left` or `transform`" and state classes that change a box's size, without a scope. `styles.css` holds 38 such rules today (B2.1-15, B2.20, B2.22-25, B2.27-30, B2.32-35, among them `.tc-level-row.is-shifting` of the settings tab), and they live until slices 6 and 7. `uiFreeze` lets the old rules only shrink, so they cannot be moved aside either.

Applied to the whole file, the ban is red from slice 2 until slice 7. Applied only to new rules, the spec must say how the test tells new rules from old ones. Either way, an implementer guesses whether slice 2 can merge.

**The spec must say (§Guards):** each guard's scope per slice.
- The `uiRules` purity, driver and DOM rules cover `obsidian/ui/next`.
- The services rule covers all of `obsidian/ui` from slice 1.
- The `styles.test` bans cover the rules whose selectors `next/` emits; old rules are counted by `uiFreeze`.

Name how a rule is recognised as new, for example a `.tc-next` root class or a separate `next.css` concatenated at build.

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
| Two principles conflict | 2 (R1, R2) | 79 |
| Too vague to build without guessing | 5 (R3, R4, R5, R6, R7) | 141 |
| **Any category (a row counted once)** | **7** | **219** |
| Rows that fit as mapped | | 1813 |

Against revision 4: 23 classes and 688 rows did not fit. Against revision 5: 7 classes and 219 rows. R1 29, R2 50, R3 23, R4 24, R5 25, R6 36, R7 36.
