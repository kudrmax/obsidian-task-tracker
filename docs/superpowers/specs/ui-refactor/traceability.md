# UI refactor: traceability

This maps every row of the two inventories to the mechanism of `../2026-11-15-ui-refactor.md` (revision 4) that owns it, the principle that puts it there and the migration step that moves it. Inputs:
- `inventory-state-effects.md`: A.1 (45 facts), A.2 (565 locations), B.1–B.5 (819 effect call sites), B.6 (180 event sources);
- `inventory-behaviour.md`: A (203 inputs), B (84 motions), C (84 measurements), D (52 screen states).

Doubts were checked against `obsidian/ui` and `core/application/contracts.ts` at `60bc8d6a`.

Every row id appears exactly once in the mapping tables. A script checked this; it found 0 rows unmapped and 0 mapped twice. Rows whose owner is defective are marked `[M#]` and gathered in **Rows that do not fit**, the section that matters most. The spec says an unmapped row is a spec defect. By the same rule, each `M` item is a defect of the spec, and each says what the spec must state to own the whole class.

## Vocabulary used in the owner column

The spec names the layers but not the fields, so this file proposes them. Every name below is a proposal.

**Model (per screen):**
- `model.read`: the core's last `ScreenView` answer, with `funnel` (view, place, filter, panel), `projects`, `missing`, `context`, and `day`, the key of that read.
- `model.day`.
- `model.now`.
- `model.visible`.
- `model.events[day]`.
- `model.settings` (`ScreenSettings`) and `model.device` (device view settings).
- `model.platform`, `model.theme`, `model.chrome` (`keyboard`, `statusBar`).
- `model.canUndo`.
- `model.selection` (`mode`, `picked`, `anchor`).
- `model.found`.
- `model.timeline` (`selected`, `anchor`).
- `model.zoom`.
- `model.measured` (row heights, text widths, stage, menu sizes).
- `model.entry`: the quick-entry session's answer.
- `model.rowKeys` (decision 3).
- `model.held[writeNo]`: outcomes held until the read with that number lands.
- `model.deferred`: outside changes waiting for a gesture.
- `model.overlay`: menus, panels, search.
- `model.sheet.full`.
- `model.place`: leaf, or block with note and project.

**Machines (in `model.interaction` and the overlay stack):**
- carry: card, subtasks, plus, picked cards; target; lifted; `reportsToCore`;
- section lift, tree lift;
- timeline hold, select, resize, new slot;
- ribbon swipe, day swipe (with `peek`, `nearer`, `landing`, turn queue);
- wheel drag, pinch, divider, tree divider;
- naming (section, project, new project);
- entry;
- overlay (task, bulk, section, project, event, view, ⋯, sources, search);
- select mode.

**Commands:**
- `write(op)` and `read`, in the file sequence;
- `carry`, `carryAt`;
- `undo`;
- `device.set`;
- network-lane fetches;
- `notice`, `haptic`, `obsidian.open`, `openInCalendar`, `createFile`;
- timers.

**Drivers:** `motion`, `scroll`, `focus`, `measure`, `input`, `chrome`, `islands`, as in the spec.

**Other names:**
- **transient channel:** frame-rate values from `input` straight to `motion` (decision 8).
- **pure rules:** pure functions of the core, called from `update` and selectors.

**P** is the principle (P1 one model, P2 one timeline, P3 geometry is input, P4 motion by cause, P5 one interaction, P6 imperative only at the edges). **Step** is the migration step (0–7). "Gone" means the state disappears because the new layer makes it unnecessary. It is deleted in step 7 if not earlier.

## A.1 The 45 facts held in more than one place

Each fact gets one field or one selector. "Seeded" means the field starts from a core answer before the first read; it is still one field.

| # | Fact | Single owner | P | Step |
|---|---|---|---|---|
| 1 | The day the screen shows | `model.day` (one field). The read's own day is `model.read.day`, the key of that read, not a copy. Title: selector `dayTitle`. Drawn-day caches go (P4 decides motion by cause). Peek and landing days live in the day-swipe machine as the *incoming* day, a different fact. | P1 | 1 |
| 2 | The day the header names during a swipe | Selector `headerDay(model)` = `daySwipe.nearer ? daySwipe.peek.day : model.day`; `nearer` is set by one discrete message when the slide crosses half. | P1, P5 | 4 |
| 3 | A tick or draw missed while hidden or held | `model.deferred` (outside changes waiting for the gesture to end: reads, tick, day change) plus `model.visible` from `chrome`. | P5 | 1 |
| 4 | Where the strip stands | `model.read.funnel.place` (the core's answer) plus the ribbon machine's in-flight `target`; selector `shownPlace`. `atDone` = `shownPlace === "done"`. `firstPlace` seeds `model.read` before the first read. `rightMode` is a one-time host hand-over (M2). | P1 | 1 |
| 5 | The view mode and its layout | `model.read.funnel.view` (`ViewChoice`); selector `layoutMode`. `firstView` seeds it before the first read. Mounted layout = the layout component chosen by `layoutMode`. `drawnContext` goes: update compares `read.context` to decide that no transition is emitted. | P1, P4 | 1 |
| 6 | The project filter | `model.read.funnel.filter`; selector `filterNode`. The node a carry was lifted on is carry-machine state `carry.liftedOn` (a different fact: what to put back). | P1 | 1 |
| 7 | The projects panel open / docked | `model.read.funnel.panel` (`open`, `docked`). The mid-slide state is a running `Transition` (dock slide), not a field. | P1, P4 | 1 |
| 8 | The tasks read from the file | `model.read` (`ScreenView`: tasks, day, projects, missing). Menus and the bulk menu hold only keys (`overlay.task.key`, `overlay.bulk.keys`) remapped by the write's answer; the full card holds `sheet.full.levels[]` reads of its own; the peek holds `daySwipe.peek.read`. Element maps go. | P1 | 1 |
| 9 | The tasks file is missing | `model.read.missing`; every hidden part is JSX from it. | P1 | 1 |
| 10 | A card waiting for a new section's name | Naming machine `interaction.naming = {kind: "section", column, card}`. | P5 | 2 |
| 11 | The day's calendar events | `model.events[day]` (keyed by day, so the shown day and the peek share one map). The service cache stays in the core. | P1 | 1 |
| 12 | The sources' alert | Selector `sourcesDot(model.events[model.day])`. | P1 | 4 |
| 13 | Extra all-day rows | Selector `allDayExtraRows(model.events[day])`; the peek uses the same selector for its day. | P1 | 6 |
| 14 | The timeline card selected | `model.timeline.selected: TaskKey or null`. | P1, P5 | 6 |
| 15 | List cards picked | `model.selection = {mode, picked: TaskKey[], anchor}`; count and button state are selectors. | P1 | 3 |
| 16 | A drag holds the screen | `model.interaction.gesture` (the one gesture slot); `isDragging` is a selector. | P5 | 3 |
| 17 | A carry to a project is under way | Carry machine `carry.reportsToCore` (the core's carry is a session, M5). | P5 | 3 |
| 18 | The card a drop is landing on | `model.held[writeNo]` (the outcome the interaction holds until the read with its number lands, P2). | P2 | 3 |
| 19 | Where a held card would land | Carry machine `carry.target` (list gap and level, plate, title, timeline start, tree row), computed from `model.measured` and the core's rules. | P3, P5 | 3 |
| 20 | A timeline card being stretched | Resize machine `interaction.resize = {key, edge, span}`. | P5 | 6 |
| 21 | A swipe or turn is running | Ribbon / day-swipe machine state; the run after release is a numbered `Transition` in `motion`. | P4, P5 | 4 |
| 22 | Which swipe or turn is current | Transition numbers (a stale `motionSettled` is ignored by number); the day-swipe machine's turn queue. | P4 | 4 |
| 23 | A landed day drawn over the screen | Day-swipe machine `landing` (decision 5: the peek is not promoted; the machine ends when the new day's read lands). | P5 | 4 |
| 24 | The timeline's hour height | `model.zoom = {hourPx, wholeDay}` (seeded from device settings); the pinch's live scale rides the transient channel (M12). | P1, P3 | 6 |
| 25 | The timeline's scroll position | Driver-local in `scroll` keyed `timeline`; the opening anchor is `model.timeline.anchor = {minute, fraction}` (M14). | P1, P6 | 6 |
| 26 | A list's scroll / held room | Driver-local in `scroll` (positions, ScrollHold, glides) keyed by scroller id; the entry's `follow` flag is entry-machine state (M14). | P6 | 2 |
| 27 | The day list's share | `model.device.listShare` (the settings answer); live drag value on the transient channel; widths are selectors (`RibbonColumns`, `layoutWidths`). | P1, P3 | 4 |
| 28 | The project tree's width | `model.device.treeWidth`; live drag value on the transient channel. | P1, P3 | 5 |
| 29 | A field is open for typing | `model.entry` = the quick-entry session's last answer (M5); every flag (`is-entering`, plus hidden, folder locked, card `is-renaming`) is a selector. | P1 | 2 |
| 30 | Which field has the focus | `model.focus` (owner id) reported by `focus`; Obsidian's `activeEditor` is `islands`-local. | P1, P6 | 2 |
| 31 | The entry's priority tint | Selector `entryTint(model.entry)`. | P1 | 2 |
| 32 | The repeat being edited | One draft per editor: `overlay.page.repeat` (task menu, the core `RepeatPage` answer) or `entry.repeat` (bar). Never both for one editor. | P1 | 6 |
| 33 | A description being edited | `sheet.full.description = {draft, dirty}` (the core `DescriptionDraft` answer, M5); the CodeMirror doc is `islands`-local; the 600 ms save is a timer command. | P1, P6 | 6 |
| 34 | The search window is open | `model.overlay` stack entry `{kind: "search", phase}`. | P5 | 6 |
| 35 | A task is on the whole screen | `model.sheet.full = {stack, phase}`. | P5 | 6 |
| 36 | A menu / sheet is open or closing | `model.overlay` (stack of `{kind, phase: open or closing, page, picked}`); the pick's slot in the file sequence (M7). | P5 | 6 |
| 37 | The card ringed after a search | `model.found = {key, scrollPending}`. | P1 | 6 |
| 38 | Whether undo is possible | `model.canUndo` (from `UndoService.onChange`). | P1 | 1 |
| 39 | The settings the screen draws | `model.settings` (`ScreenSettings` answer) and `model.device` (device view settings). Body tokens per window come from `chrome` (M3). | P1 | 1 |
| 40 | Phone or desktop | `model.platform.wide` from `chrome`. | P3 | 1 |
| 41 | Obsidian's status bar over the view | `model.chrome.statusBar` from `chrome`. | P3 | 2 |
| 42 | Popout windows that get the styles | Plugin runtime's window set (host), fed to `chrome`; not a screen fact. | P6 | 0 |
| 43 | Which note a block shows | `model.place = {kind: "block", note, project}`; the blocks map is host-level. | P1 | 5 |
| 44 | Writes waiting to run | The plugin-wide file sequence only. | P2 | 1 |
| 45 | Who holds the screen | `model.interaction.gesture` (one slot); pointer captures are `input`-local. | P5 | 1 |

## A.2 State locations (565)

Row ids number the rows of each domain table of `inventory-state-effects.md` in file order, A.2.1 to A.2.565.

### day/clock

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.1 | `CS.selectedDate` | `model.day` | P1 | 1 |
| A.2.2 | `CS.titleDay` | selector `headerDay` over `daySwipe.nearer` | P1 | 4 |
| A.2.3 | `CS.missedTick` | `model.deferred.tick` | P5 | 1 |
| A.2.4 | minute interval | runtime clock source → `tick(now)` → `model.now` | P2 | 1 |
| A.2.5 | `DayData.state.date` | `model.read.day` (key of the read) | P1 | 1 |
| A.2.6,10 | `Timeline.drawnDate`, `TaskList.drawnDay` | gone: a day change emits no transition (P4) | P4 | 2, 6 |
| A.2.7-9 | now line, hidden labels, now pill | selectors over `model.now` (`isToday`, core `labelHidesNearNow`); `--tc-y` via `motion` layout variables | P1, P6 | 6 |
| A.2.11 | DayNav title | selector `dayTitle` | P1 | 4 |

### view/mode/place/filter/panel

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.12,14 | `CS.shownMode`, `CS.atDone` | ribbon machine `target` + selector `shownPlace` | P1, P5 | 1 |
| A.2.13,15 | `CS.firstPlace`, `CS.firstView` | initial `model.read` seeded by core `firstPlace`/`firstView` at mount | P1 | 1 |
| A.2.16 | `CS.layout` | layout component chosen by selector `layoutMode` | P1 | 4, 5 |
| A.2.17,24 | `CS.drawnContext`, `is-redrawn` | gone: update compares `read.context`; a context change emits no transition | P4 | 2 |
| A.2.18 | `CS.swipe` presence | selector `hasPages(layoutMode)`; `input` attaches the swipe recogniser while true | P1, P6 | 4 |
| A.2.19 | parts built once | view components | P1 | 7 |
| A.2.20 | `folder.el.disabled` | selector `panelLocked(model.entry)` | P1 | 5 |
| A.2.21-23,25 | root classes `is-note`, `has-wheel`, `has-top-row`, `has-head-lead`, `has-tree`, `has-dock`, `is-block` | JSX classes from `model.place`, `read.funnel.view`, `read.funnel.panel` | P1 | 0, 5 |
| A.2.26 | `DayData.state.funnel` | `model.read.funnel` | P1 | 1 |
| A.2.27 | `DayData.state.projects` | `model.read.projects` | P1 | 1 |
| A.2.28 | StripTrack temporary place classes | gone: strip geometry per place computed (decision 4, `RibbonColumns`) | P3 | 4 |
| A.2.29 | full card parent / project buttons | JSX from `sheet.full` tree | P1 | 6 |
| A.2.30-31 | `ViewButton.view`, hidden, icon | selector `viewButton(read.funnel.view)` | P1 | 5 |
| A.2.32-33 | tree `is-missing`, panel open | JSX from `read.missing`, `read.funnel.panel.open` | P1 | 5 |
| A.2.34-37 | `ProjectTree.drawn/rowsByNode/drawnRows/rowEls` | gone: rows from `read.funnel.panel.rows`; row boxes for hit tests via `measure` (M13) | P1, P3 | 5 |
| A.2.38 | tree row classes | JSX from the core row model | P1 | 5 |
| A.2.39-40 | `FilterTitle.filter` and its classes | selector `filterTitle`; renaming from naming machine | P1, P5 | 5 |
| A.2.41,44,46 | column / backlog titles text | selector over list names (core query, M4) | P1 | 4, 5 |
| A.2.42-43 | `RibbonLayout.place`, `is-lists/is-inbox/is-done` | selector `shownPlace` → JSX class | P1 | 4 |
| A.2.45 | shared nav / timeline placement | view composition per layout | P1 | 5 |

### lists data

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.47 | `CS.drawnRead` | first read emits no transition (`model.read` was null) | P4 | 2 |
| A.2.48,53 | missing box, `DayData.state.missing` | `model.read.missing`; JSX | P1 | 1, 5 |
| A.2.49-50 | `CS.naming`, header slot | naming machine `{kind: section}` | P5 | 2 |
| A.2.51 | card `dataset.menuFrom/card` | row props from the core row model | P1 | 5 |
| A.2.52 | `DayData.state` | `model.read` | P1 | 1 |
| A.2.54 | `FullScreen.tree` | `sheet.full.levels[].tree` (its own read command) | P1, P2 | 6 |
| A.2.55-63 | `ProjectTasks.*` maps | selectors over `read.projects` (`projectsEntryLook`); element maps gone | P1 | 5 |
| A.2.64,67,69 | `Timeline.tasks`, `is-over`, block meta | selectors (`slotted`, `stackTasks`, `stackCorner`) | P1 | 6 |
| A.2.65,68 | `Timeline.blocks`, DOM order | gone: Preact keys, JSX order from `stackTasks` | P6 | 6 |
| A.2.66 | block `--tc-y/len/x` | `motion` layout variables from selector | P6 | 6 |
| A.2.70-78 | `TaskList.*` bookkeeping | selectors (`listView`, `columnSections`); element maps gone | P1 | 2 |
| A.2.79 | card `--tc-level` | `motion` layout variable | P6 | 2 |
| A.2.80-81,83 | header, plate text, branch lines | selectors (`branchOf`) | P1 | 2 |
| A.2.82 | keyed empty-plate presence | plate ↔ first card is a transition kind (B1.9) | P4 | 2 |
| A.2.84-91 | card colours, classes, marks, link data | JSX from `TaskItem` | P1 | 2 |
| A.2.92,94-95 | `KeyedRows.rows/drawing/order` | gone: Preact keyed rows; focused field kept by key (decision 3) | P4, P6 | 2 |
| A.2.93 | `KeyedRows.leaving` | leaving rows as model state [M10] | P4 | 2 |
| A.2.96-97 | prototype `KeyedList` | replaced by `next/` proper | — | 0 |

### events

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.98 | `CS.poll` | effect runner: `keepFresh` on the network lane, `model.visible` | P2 | 1 |
| A.2.99-100 | `DayData.dayEvents`, `state.calendars` | `model.events[day]`, `read.calendars` | P1 | 1 |
| A.2.101 | `DayData.around` | network-lane request parameter [M18] | P2 | 1 |
| A.2.102 | `DayPeek.events` | `model.events[peekDay]` | P1 | 4 |
| A.2.103-104 | wheel dots | selector `sourcesDot` | P1 | 4 |
| A.2.105-106,109 | `Timeline.events`, event block placement | selector `timedEvents` (`layoutEvents`) + `motion` variables | P1, P6 | 6 |
| A.2.107 | event colours | selector `paintEvent(model.theme)` → `motion` variables | P1, P6 | 6 |
| A.2.108 | `is-past` | selector over `model.now` (core query with time as input, M4) | P1 | 6 |

### selection

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.110,116-119 | `BulkController.selection`, `TaskSelection.*` | `model.selection {picked, anchor}`; element maps gone | P1 | 3 |
| A.2.111-112 | count / ⋯ buttons | selectors | P1 | 3 |
| A.2.113-114 | `selecting`, `is-selecting` | `model.selection.mode` (select mode, M8) | P5 | 3 |
| A.2.115 | bulk menu `items` closure | `overlay.bulk.keys` remapped by write answers | P1 | 3 |
| A.2.120-121 | `is-selected`, `.tc-pick` | JSX | P1 | 3 |
| A.2.122-124 | `Timeline.selected`, ring, grips | `model.timeline.selected`; grips via `motion` variables | P1, P5 | 6 |

### carry/drag

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.125 | `CS.carrying` | carry machine `reportsToCore` (core carry session, M5) | P5 | 3 |
| A.2.126,216 | root `is-dragging` (and its read in BlockHeight) | JSX class / selector from `interaction.gesture` | P1 | 3, 5 |
| A.2.127-129 | `QEC.dragging/carrying/droppedOn` | carry machine `payload` and outcome; selector `plusHidden` | P5 | 3 |
| A.2.130,135-139,143-146,149 | press records, pointer captures, document listeners of drags and holds | `input`-local; discrete messages out | P6 | 3, 6 |
| A.2.131-132,192 | plus ring, `is-hot` | JSX from carry machine `payload`, `target` | P1 | 3 |
| A.2.133 | body `tc-cancelling` | `chrome` body class from carry target [M3] | P6 | 3 |
| A.2.134 | `DragController.live` | `interaction.gesture` | P5 | 3 |
| A.2.140-142,158 | `is-lifted/is-waiting/is-folded` | JSX from carry / section-lift machine; folds are transitions | P1, P4 | 3 |
| A.2.147-148 | resize closures | resize machine `{minute, span}` | P5 | 6 |
| A.2.150-157 | `CardListDrop` state | carry machine `target` from `model.measured` + core rules (`placeAt`, `placesInGap`) [M13] | P3, P5 | 3 |
| A.2.159-160 | section lift capture / listeners | `input`-local | P6 | 3 |
| A.2.161-162,215,219 | `SectionSlots`, `TaskList.landing`, `KeyedRows.marks` | section-lift machine `slot`; JSX mark row | P5 | 3 |
| A.2.163-164,170-176,178,193 | section / card / plus floats and their styles | JSX float component; position on the transient channel; width, flight, fade as transitions | P4, P6 | 3 |
| A.2.165 | static `DragSession.landing` | `model.held` + running transition numbers | P2, P4 | 3 |
| A.2.166-169 | `DragSession.current/done/cut/cleared` | carry machine phase | P5 | 3 |
| A.2.177,179 | flight timers | `motion` → `motionSettled` [M16] | P4 | 3 |
| A.2.180-182,198-199 | drop lines, tree `is-drop` | JSX from `carry.target`; line steps are transitions | P1, P4 | 3 |
| A.2.183-184 | `TimelineDrop.start/last` | carry machine `target.timeline` | P5 | 3 |
| A.2.185-186 | `ArrivingCard` | `model.held[writeNo].arriving` [M22] | P2, P4 | 3 |
| A.2.187-191 | `LongPress` state and timer | `input` recogniser (pure, M20); delay from `model.settings` | P6 | 3 |
| A.2.194 | `ProjectTasks.away` | selector hiding `carry.lifted` across node change | P1 | 3 |
| A.2.195 | by-project row classes | JSX | P1 | 5 |
| A.2.196 | `TreeDrop.result` | carry machine `target.tree` | P5 | 3 |
| A.2.197 | `ProjectsListDrop.readOn` | carry machine `targetsReadNo` (decision 7) | P3, P5 | 3 |
| A.2.200-203 | `TreeLift` claim, `at`, float, listeners | tree-lift machine; float on transient channel; `input` | P5 | 5 |
| A.2.204-205 | `CarryReport.last/timer` | effect runner: `carryAt` command with dedupe and a timer command | P2 | 3 |
| A.2.206-207 | `ProjectsCarry.drops/nodes` | carry machine `rows`, `liftedOn` | P5 | 3 |
| A.2.208-212,214 | timeline drop line and stretch state | carry / resize machine state; JSX; `motion` variables | P5, P6 | 6 |
| A.2.213 | `is-lifted` read in Timeline | selector from `carry.lifted` (no class reads) | P1 | 6 |
| A.2.217-218 | `is-drop-room`, hover hook | selector `dropRoom(list)` from `carry.target` | P3 | 5 |

### swipe/pager

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.220 | `CS.landing` | day-swipe machine `landing` | P5 | 4 |
| A.2.221 | `drawnWaits` + 1000 ms timer | day-swipe machine queue with a deadline [M16] | P5 | 4 |
| A.2.222 | `CS.turning` | day-swipe machine turn queue | P5 | 4 |
| A.2.223,542 | `CarefulPace`, `PointerSpeed` | `input` recognisers [M20] | P6 | 4 |
| A.2.224-230 | `Swipe` press, stream, timer, holds, round, listeners, capture | recogniser in `input` + ribbon / day-swipe machine; `round` → transition numbers [M20] | P5, P6 | 4 |
| A.2.231-236 | `ScreenPager` state | swipe machine + transient channel; settle is a `Transition`; `catches` → transition numbers [M15] | P4 | 4 |
| A.2.237-238,240 | edge / day / strip track styles and scrub | `motion` (transient channel, scrub between two computed layouts) | P4, P6 | 4 |
| A.2.239 | `DayTrack.nearer` | day-swipe `nearer`, one message at half | P5 | 4 |
| A.2.241-243 | `DayPeek.day/removed/el` | day-swipe `peek {day, read}`; view draws the layout for that day | P5 | 4 |
| A.2.244 | `ColumnSwitch.icons` | view | P1 | 4 |
| A.2.245-247,251 | wheel press, hold timer, swallowed click, capture | wheel-drag machine + `input` | P5, P6 | 4 |
| A.2.248,252-253 | wheel `is-settling`, ribbon `is-switching` | transitions (wheel settle, ribbon slide) | P4 | 4 |
| A.2.249-250 | `ColumnSwitch.at`, wheel window properties | selector of `shownPlace`; live drag on transient channel; `motion` variables | P1, P6 | 4 |

### zoom

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.254-255 | `CS.hourPx`, `CS.wholeDay` | `model.zoom {hourPx, wholeDay}` | P1 | 6 |
| A.2.256,261 | `zoomFrame`, `PinchZoom.scaled` | transient channel [M12] | P3 | 6 |
| A.2.257-260,262-263 | pinch pointers, wheel timer, anchor, limits, capture | pinch machine + recogniser; wheel settle timer command | P5, P6 | 6 |
| A.2.264-265 | `Timeline.minor/grid` | selector `gridAt(hourPx)` [M12] | P1 | 6 |
| A.2.266-267 | `hourShown`, `--tc-hour` | `motion` variable | P6 | 6 |

### scroll

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.268 | `CS.scrolledFor` | gone: update emits a scroll order on a day change | P2 | 6 |
| A.2.269-270,283 | timeline / day list / peek scroll positions | `scroll`-local, keyed scroller ids [M14] | P6 | 4, 6 |
| A.2.271-276 | `QEC.follow/revealedAt/revealing/handScrolledAt/watchedScroller`, scrollTop | entry machine `follow`; `scroll` `reveal` orders; `userScrolled` ends follow | P5, P6 | 2 |
| A.2.277,297-302 | `ScrollGlide`, `ScrollHold`, `GLIDES` | `scroll`-local | P6 | 2 |
| A.2.278-282 | `AutoScroll` state | `scroll` `edge` order from the carry machine; scroll offsets back to the carry [M14] | P6 | 3 |
| A.2.284 | `LiftedMenu.stopScroll` | overlay `revealing` + `scroll` cancel [M14] | P5, P6 | 6 |
| A.2.285 | `PanelPages.scrolls` | `scroll`-local per page key | P6 | 6 |
| A.2.286-287 | by-project / tree scroll keep or reset | `scroll` orders `keep` or `reset` on node change [M14] | P6 | 5 |
| A.2.288 | `Timeline.frame` | `measure` snapshot at gesture start [M13] | P3 | 6 |
| A.2.289,292 | `Timeline.room`, `--tc-room-*` | selector + `motion` variables | P3, P6 | 6 |
| A.2.290 | `Timeline.anchor` | `model.timeline.anchor` [M14] | P1 | 6 |
| A.2.291 | timeline scrollTop writes | `scroll` | P6 | 6 |
| A.2.293-296 | `ScrollEdges` state and classes | `scroll`-local; fade output ownership [M14] | P6 | 2 |

### text entry/quick bar

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.303,353-356 | `activeEditor`, `EmbeddedEditor` state, CodeMirror doc | `islands` | P6 | 2 |
| A.2.304 | `WriteQueue.tail` | file sequence | P2 | 1 |
| A.2.305 | `QEC.state` | `model.entry` (core session answer, M5) | P1 | 2 |
| A.2.306,329 | `QEC.field`, `quiet` | `islands` (editor handle; owner set text is not input) | P6 | 2 |
| A.2.307,339,479 | `QEC.focused`, group name focus, field focus | `focus` | P6 | 2 |
| A.2.308 | `QEC.turning` | entry machine flag while the bar turns the wheel | P5 | 4 |
| A.2.309 | `QEC.draws` | gone: read numbers | P2 | 2 |
| A.2.310,340 | `pressEnding`, `FreeRoomDoubleClick.mouse` | `input` recogniser | P6 | 2 |
| A.2.311,313-314,316-317,319-325,327-328,330-331 | bar and field look (`is-entering`, bar state, buttons, tint, placeholder, plus hidden) | selectors over `model.entry` → JSX | P1 | 2 |
| A.2.315,326 | `QuickBar.leaving`, pointer-events while fading | presence transition [M10] | P4 | 2 |
| A.2.318 | bar `is-gliding` | keyboard transition | P4 | 2 |
| A.2.312 | field element parent | view: row by key; field island mounted in it | P1, P6 | 2 |
| A.2.332-336 | `EntryRows.*` | `model.entry` + `model.rowKeys` (decision 3) | P1, P2 | 2 |
| A.2.337-338,352 | `RenamedTexts` | [M19] cross-screen held outcome | P2 | 2 |
| A.2.341-343 | `TaskMenu.stackRow/fieldRow/fieldClosed` | overlay + entry machines (stack spot) [M8] | P5 | 6 |
| A.2.344-346 | `FullScreen.editing/draft/saveTimer` | `islands` + `sheet.full.description` (M5) + debounce timer command | P6 | 6 |
| A.2.347-351 | `FullScreen.state/field/focused/titleField/leavingTitle` | `sheet.full.entry` (a second entry session, M5); `focus` | P1 | 6 |
| A.2.357 | `markdown-rendered` | `islands` | P6 | 6 |
| A.2.358 | tree `askProjectName` slot | naming machine `{kind: newProject, gap, depth}` | P5 | 5 |
| A.2.359-361 | `Timeline.field`, `is-renaming`, field box | selector over `model.entry` in the timeline; `motion` variables | P1, P6 | 6 |
| A.2.362-363 | `TaskList.slot`, card `is-renaming` | naming machine; JSX | P1, P5 | 2 |

### menus/overlays/full/search

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.364,373 | `CS.search`, `BulkController.menu` | `model.overlay` stack entries | P5 | 6 |
| A.2.365,422-426 | `CS.full`, `FullScreen.stack/reading/closed/Escape/is-shown` | `model.sheet.full`; reads coalesced; Escape order function; presence [M10] | P5 | 6 |
| A.2.366,377 | menu `current`, `TaskMenu.context` | `overlay.task.key` remapped by write answers | P1 | 6 |
| A.2.367 | `QEC.stack` | overlay + entry (stack spot) [M8] | P5 | 6 |
| A.2.368-372 | bar panel state | entry machine `panel {kind, page}` (nested overlay); side from `measure` | P5, P3 | 2 |
| A.2.374-376 | `FoundCard` | `model.found {key, scrollPending}`; `scroll` reveal | P1 | 6 |
| A.2.378-392 | `TaskMenu` parts, pages, asking, labelling, Enter, double-press, classes | overlay machine `{kind: task, key, page, asking, labelling}`; parts are view [M6]; boxes via `measure` [M13] | P5, P1 | 6 |
| A.2.393-403 | `LiftedMenu.gone`, `Overlay.*` | overlay `phase`; presence [M10]; Escape order over the stack [M8] | P4, P5 | 6 |
| A.2.404-407 | `Picks.*`, `giveUp` | overlay `picked` + the pick's slot in the file sequence [M7]; bounded wait [M16] | P2 | 1 |
| A.2.408-412 | `Panel.shown`, `PanelPages`, `MORPHS` | overlay `page`; page morph transition (B1.14) [M6] | P4 | 6 |
| A.2.413 | switch knob flipped before the write | outcome held until the read (P2) | P2 | 6 |
| A.2.414 | menu tiles | JSX from the core menu model | P1 | 6 |
| A.2.415-421 | `BulkMenu`, project menu asking, `DescriptionPeek` placement | overlay machine; peek side from `measure` | P5, P3 | 6 |
| A.2.427-430 | `SearchWindow.rows/picked/asked/closed` | `overlay.search {query, answer, picked}`; coalesced read | P5, P2 | 6 |

### layout sizes

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.431 | `is-docking` + timer | dock-slide transition | P4 | 4 |
| A.2.432-436 | desktop capsule room, anchor, away, glide start, position | selectors from `measure` (field box) + `chrome`; `motion` variables | P3, P6 | 2 |
| A.2.437 | `ObsidianChrome.statusBar` | `chrome` | P6 | 2 |
| A.2.438 | Settings colour rows wrap | [M1] no owner | — | — |
| A.2.439-441 | peek column styles, invisible, all-day | view draws the layout for the peek day | P3 | 4 |
| A.2.442-444 | `Divider.press/glide`, capture | divider machine; snap glide transition; `input` | P5, P4 | 4 |
| A.2.445-447,491 | menu field row / copy raised over the keyboard | selector from `model.chrome.keyboard` + `measure`; `motion` variables | P3, P6 | 6 |
| A.2.448-452 | menu placement, `is-long`, search / sources positions, `LiftedCopy.rect` | selectors over `measure` [M13] | P3 | 6 |
| A.2.453-454 | `--tree-width`, `seen` | `model.device.treeWidth` + transient channel; panel width from `measure` | P3 | 5 |
| A.2.455-458 | hour labels, lines, stack end, all-day rows | selectors | P1 | 6 |
| A.2.459 | `--tc-list-width` | selector (`RibbonColumns`, listShare) → `motion` variable | P3, P6 | 4 |
| A.2.460-466 | `RowsLayout` holds, fit timers, heights | selector `stackedLists(model.measured)`; heights as transitions [M11] | P3, P4 | 5 |
| A.2.467-469 | foot fade edge, row labels, field row presence | selectors | P1 | 5 |
| A.2.470 | `is-leaving` read | gone: leaving is model state [M10] | P4 | 5 |
| A.2.471 | still-layout column widths | selector `layoutWidths` | P3 | 5 |
| A.2.472-474 | `SnapGlide` | `motion` | P4, P6 | 4 |

### platform/theme/keyboard

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.475 | `activeElement` read for Cmd+Z | `model.focus` | P6 | 2 |
| A.2.476-477 | `is-mobile`, `theme-light` | `chrome` → `model.platform`, `model.theme` | P3 | 1 |
| A.2.478,489-490 | popout windows | plugin runtime window set; `chrome` per window | P6 | 0 |
| A.2.480,483 | bar `is-desk`, `is-keyboard-up` | JSX from `model.platform`, `model.chrome.keyboard` | P1 | 2 |
| A.2.481 | IME composing | `input` | P6 | 2 |
| A.2.482,484,494 | key scopes (field, tab, rendered editor) | [M23] key scopes | P6 | 0, 2, 6 |
| A.2.485-488 | `StatusBarRoom` | `chrome` | P6 | 0 |
| A.2.492-493 | full card `is-typing`, search focus | selector over `model.focus`; `focus` | P1, P6 | 6 |

### settings

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.495 | `CS.seen` | update compares `model.settings` before / after (settingsEffect as an update rule) | P1 | 1 |
| A.2.496-497 | plugin settings in memory, `rightMode` | [M2] plugin host | — | 1 |
| A.2.498-500 | view settings stores | effect runner subscription → `model.device` [M17] | P2 | 1 |
| A.2.501-502,509-512 | Settings tab page, colour preview, row reorder | [M1] no owner | — | — |
| A.2.503-508 | card size and priority colour body tokens | `chrome` per window from settings [M3] | P6 | 1 |
| A.2.513-516 | repeat page / editor | overlay page `repeat` (core `RepeatPage`, M5) | P5 | 6 |

### note blocks

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.517,519-523 | `ViewWatch.frame`, block registry, `asks` | host (block host); `asks` → coalesced `projectNoteView` read | P2, P6 | 5 |
| A.2.518 | block key scope | [M23] key scopes | P6 | 5 |
| A.2.524 | block position, `--tc-block-lift` | host block placement; lift from `measure` | P3, P6 | 5 |
| A.2.525 | focus in block | `focus` | P6 | 5 |
| A.2.526-527 | `BlockHeight` | `measure` (content height) → `motion` variable | P3 | 5 |

### undo

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.528 | undo button off | `model.canUndo` | P1 | 1 |

### other

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A.2.529,538 | teardown list, tab's screen | runtime / host mount | P6 | 0 |
| A.2.530 | `CS.changing` | file sequence | P2 | 1 |
| A.2.531 | arbiter claim `naming` | naming machine | P5 | 2 |
| A.2.532 | `services` for console | [M2] plugin host | — | 0 |
| A.2.533 | `DayData.shown` | gone: notification by selector equality | P2 | 1 |
| A.2.534-536 | `Reload` state | effect runner coalescing; `beforeShow` → decision 3 | P2 | 1 |
| A.2.537 | `ScreenParts.waiting` | `model.deferred` | P5 | 1 |
| A.2.539 | `FramePass` | `measure` / `scroll` frame scheduling | P6 | 2 |
| A.2.540-541 | arbiter holder, idle listeners | `interaction.gesture`; deferred applied on end | P5 | 3 |
| A.2.543-544 | `MonthPicker` month, day marks | overlay page `{month}`; JSX | P5 | 6 |
| A.2.545 | click listener per render | `islands` (MarkdownRenderer, created once) | P6 | 6 |
| A.2.546 | kit `Button` classes | JSX | P1 | 2 |
| A.2.547,551 | per-block / per-row `listening` | gone: Preact listeners | P6 | 2, 6 |
| A.2.548,550 | ribbon / stage `tc-hidden` | JSX from `read.missing` | P1 | 4, 5 |
| A.2.549 | `RowsLayout.destroyed` | gone | P6 | 5 |
| A.2.552-561 | `Motion` styles and WeakMaps | `motion`-local | P6 | 2 |
| A.2.562 | `pinTo` inline boxes | `motion` variables | P6 | 2 |
| A.2.563-565 | prototype `Store` | replaced by the runtime | — | 0 |

## B.1–B.6 Effects (819) and event sources (180)

Row ids number the rows of each table in file order: B.1.1–142, B.2.1–244, B.3.1–135, B.4.1–174, B.5.1–124, B.6.1–180.

### B.1 G0: CalendarScreen, main.ts, compose.ts

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| B.1.1-4,6-8,10-13,16,60-61,66,73,75-79,82-83,85,87,89-91,95-104,107,113-115,118-119,121,123 | task writes (`act`) | Cmd `write(op)` in the file sequence; read with its number; `failed` on error | P2 | 1 |
| B.1.17-18 | `startCarry`, `endCarry` | Cmd `carry(start or end)` in the file sequence; the core's carry session [M5] | P2 | 1 |
| B.1.5,9,14-15,19-20,22-26,28-30,53,55-56,93,122 | synchronous service reads (`bulkMenu`, `carried`, `snap`, `stretch`, `firstPlace`, `relation`, `today`, `boundary`, `shownSpan`, `isPast`, `dropSpan`, `newSlot`, `findIn`, `listName`, `stepFunnel`, `columnSections`, `menu`, `openAt`) | [M4] core queries | P6 | 1 |
| B.1.27,34,39,63,81,84,92,94 | event, sources, more, search, section, project menus; full card; task menu | `model.overlay` / `model.sheet` [M6] | P5 | 6 |
| B.1.31 | quick entry shows the day it wrote to | Msg `entryShowsDay` → `model.day` + read command | P2 | 2 |
| B.1.32,38,48,50,71 | rereads (fresh, after undo, load, day passed, after failure) | read Cmd in the file sequence | P2 | 1 |
| B.1.33,57 | wheel turned, swipe landed on a place | ribbon / wheel machine → Cmd `setFunnelPlace` | P5 | 4 |
| B.1.35,44-47,52 | calendar poll and refresh | network lane [M18] | P2 | 1 |
| B.1.36 | undo / redo | Cmd `undo` in the file sequence | P2 | 1 |
| B.1.37,69-70 | notices | Cmd `notice` | P2 | 1 |
| B.1.40-43 | service subscriptions | runtime inputs → `fileChanged`, `calendarsChanged`, `settingsChanged`, `dayChanged` | P2 | 1 |
| B.1.49 | `Timeline.tickNow` | `tick` → `model.now` (deferred under a gesture) | P5 | 1 |
| B.1.51 | select today on day moved | update rule on `dayChanged` | P2 | 1 |
| B.1.54,72,120 | view settings writes (`listShare`, `zoom`, `treeWidth`) | Cmd `device.set` [M17] | P2 | 1 |
| B.1.21,58-59 | day step, day swipe landed, day turn | day-swipe machine; read command for the new day | P5 | 4 |
| B.1.62 | haptics | Cmd `haptic` | P6 | 1 |
| B.1.64-65,108 | `reveal`, `filterHides`, `lineOf` (async reads) | read Cmd | P2 | 1 |
| B.1.67 | after reveal: day, wheel, place | update on `revealed` | P2 | 6 |
| B.1.68 | `Timeline.select(null)` | update on `pressedElsewhere` | P5 | 6 |
| B.1.74 | `projectsDropPreview` | held outcome (landing card at the line, A6.14) | P2 | 3 |
| B.1.80 | section name field + scrollIntoView | naming machine; `focus`; `scroll` reveal | P5, P6 | 2 |
| B.1.86 | NoteSearch modal | `islands` (Obsidian `FuzzySuggestModal`) | P6 | 6 |
| B.1.88,109-111 | open note / file / link / URL | Cmd `obsidian.open` | P6 | 1 |
| B.1.105-106 | rename / add subtask | entry machine open | P5 | 2 |
| B.1.112 | `funnelView` / `projectNoteView` in each read | part of the read command | P2 | 1 |
| B.1.116-117 | `projectsTakes`, `projectsPlusPlace` (pure) | core pure rules in update | P3 | 3 |
| B.1.124-126 | interval, landing / dock timers, pinch rAF | runtime clock; timer Cmds; transient channel [M12] | P2, P6 | 1 |
| B.1.127 | `StatusBarRoom.hold` | `chrome` | P6 | 0 |
| B.1.128-139,141-142 | plugin load, settings file, code watcher, registrations, protocol, login, sync, device storage, place hand-over, open view, popouts, sync notice, core timers | [M2] plugin host | — | 1 |
| B.1.140 | osascript (open event in Calendar) | Cmd `openInCalendar` | P6 | 1 |

### B.2 G1

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| B.2.1-3 | calendar events fetch and cache | network lane [M18] | P2 | 1 |
| B.2.4-6 | task reads (`funnelView`, `screen`, `projectsScreen`) | read Cmd in the file sequence | P2 | 1 |
| B.2.7-9 | `onUpdate`, ScreenParts, draw | notification by selector; `model.deferred` | P2, P5 | 1 |
| B.2.10,29-65 | quick entry session construction and every session call | entry machine = the core session [M5]; writes in the file sequence | P5, P2 | 2 |
| B.2.11-19 | entry helpers (`placementOf`, `parseTitle`, `isBlank`, …) | core pure rules in update / selectors | P1 | 2 |
| B.2.20-23 | session writes (`createSection`, `edit`, `unfoldAbove`, `createWithId`) | file sequence (the session's `WriteLine` is the sequence) | P2 | 1 |
| B.2.24 | `list.adopt(created.id)` | `model.rowKeys` (decision 3) | P1 | 2 |
| B.2.25-27,109,111-112 | `listName`, `placementTitle`, `placementOfDay` | [M4] core queries | P6 | 2 |
| B.2.28 | `newProject` from the bar | Cmd write | P2 | 1 |
| B.2.66-67 | entry `fresh` reads | read Cmd in the file sequence | P2 | 1 |
| B.2.68,71 | entry render requests | notification by selector | P2 | 2 |
| B.2.69-70 | lock panel, forget typed | selectors; entry end | P1 | 2 |
| B.2.72 | bar turns the wheel | entry + ribbon machines [M8] | P5 | 4 |
| B.2.73 | bar shows another day | `model.day` + read Cmd, ordered after the entry's writes [M7] | P2 | 2 |
| B.2.74-77 | plus drag (and aside on by project) | carry machine `payload: plus` | P5 | 3 |
| B.2.78-86 | menu stack and timeline field calls | overlay + entry machines; selectors [M8] | P5 | 6 |
| B.2.87 | bar show / hide / follow | JSX from `model.entry` + `measure` | P1, P3 | 2 |
| B.2.88,242 | field / name input focus | `focus` | P6 | 2 |
| B.2.89-91 | reveal scroll, glide, wait for growth | `scroll` reveal; `motionSettled` | P6, P4 | 2 |
| B.2.92 | blur check timer | `focus` reports `blurred`; update decides | P6 | 2 |
| B.2.93-95 | entry listeners and observers | `input` / `measure` | P6 | 2 |
| B.2.96,100,103-108,110 | bar button callbacks | entry Msgs | P5 | 2 |
| B.2.97,101-102 | bar panel open / redraw / pick | nested overlay in the entry machine [M6] | P5 | 2 |
| B.2.98 | document press while panel open | `input` → `pressedElsewhere` | P6 | 2 |
| B.2.99,113-114 | bar panel and capsule appear / fade | presence transitions [M10] | P4 | 2 |
| B.2.115-121 | title field editor | `islands` (EmbeddedEditor); key scope [M23] | P6 | 2 |
| B.2.122-124 | plus press, tap, drag | `input` → carry / entry | P6 | 3 |
| B.2.125-126 | ring, `tc-cancelling` | JSX; `chrome` body class [M3] | P1, P6 | 3 |
| B.2.127-129 | `ScrollGlide` | `scroll` | P6 | 2 |
| B.2.130 | status bar query | `chrome` | P6 | 2 |
| B.2.131-133 | `EntryRows` drawing | view + `model.rowKeys` | P1 | 2 |
| B.2.134-135 | keyboard will show / hide | `chrome` → `model.chrome.keyboard`; keyboard transition | P3, P4 | 2 |
| B.2.136-141 | view settings file / store | Cmd `device.set`; subscription → `model.device` [M17] | P2 | 1 |
| B.2.142,145-147 | tab: screen create / open / close / resize | host mount; `measure` | P6 | 0 |
| B.2.143-144 | tab key scope, undo / find keys | [M23] key scopes → Msgs | P6 | 0 |
| B.2.148-149 | `ViewWatch` | host block | P6 | 5 |
| B.2.150,152,154-157,159-160,162-163,165-166,168-170 | note block lifecycle, placement, events | host block | P6 | 5 |
| B.2.151,158 | block key scope | [M23] key scopes | P6 | 5 |
| B.2.153 | block focus | `focus` | P6 | 5 |
| B.2.161,164 | block `onChange`, `projectNoteView` | runtime input; coalesced read Cmd | P2 | 5 |
| B.2.167 | `--tc-block-lift` | host block placement from `measure` | P3 | 5 |
| B.2.171-223 | Settings tab and its pages | [M1] no owner | — | — |
| B.2.224-225,228 | undo button: `canUndo`, `onUndo` | `model.canUndo` [M4]; Msg `undo` | P1 | 1 |
| B.2.226 | ⋯ pressed | overlay `more` | P5 | 6 |
| B.2.227 | `UndoService.onChange` | runtime input `undoChanged` | P2 | 1 |
| B.2.229-230 | `StatusBarRoom` observers, body class | `chrome` | P6 | 0 |
| B.2.231-235 | card size, priority colours, label paint on body | `chrome` per window [M3] | P6 | 1 |
| B.2.236-237 | haptics | Cmd `haptic` | P6 | 1 |
| B.2.238 | `execCommand` undo | `input` | P6 | 2 |
| B.2.239-241 | `SectionNameEntry` | naming machine = the core session [M5] | P5 | 2 |
| B.2.243 | `FramePass` | driver frame scheduling | P6 | 2 |
| B.2.244 | popout listener | host / `chrome` | P6 | 0 |

### B.3 G2

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| B.3.1-3,8,34-36,72-73,85-88 | `snap`, `stretch`, `carried`, `dropSpan`, `newSlot`, `bulkMenu`, peek reads (`shownSpan`, `isPast`, `relation`, `columnSections`) | [M4] core queries | P6 | 3, 4, 6 |
| B.3.4-5,9-11,38,62-71,96,102 | writes through deps (resize, drop, fold, mark, move section, bulk, place) | Cmd write in the file sequence | P2 | 1 |
| B.3.6-7 | `startCarry`, `endCarry` via deps | Cmd carry [M5] | P2 | 1 |
| B.3.12-15,19,40,74,103 | task / event / group / bulk menus, sources popover | `model.overlay` | P5 | 6 |
| B.3.16-18 | timeline selection set / cleared | `model.timeline.selected` | P1, P5 | 6 |
| B.3.20 | rename on second click | overlay → entry | P5 | 6 |
| B.3.21-22 | new slot gesture | timeline new-slot machine → entry | P5 | 6 |
| B.3.23-24 | `layoutTasks`, `stretchTo` | selectors + transitions | P1, P4 | 6 |
| B.3.25,41,109 | haptics | Cmd `haptic` | P6 | 1 |
| B.3.26-27 | `onDragging`, `moved` → carryAt | carry Msgs; `carryAt` Cmd | P5, P2 | 3 |
| B.3.28 | `onError` → reportFailure | `failed` Msg + notice | P2 | 1 |
| B.3.29,39 | `console.error` | action log | P2 | 0 |
| B.3.30,51-55 | floats, plus float, drop line | JSX + transient channel + transitions | P4, P6 | 3 |
| B.3.31 | `DragSession.landNow` | `motion` finishes the running flight when a new carry starts | P4 | 3 |
| B.3.32-33 | plus drop result, targets cleared | carry machine outcome → entry open | P5 | 3 |
| B.3.37 | `timeline.showDrop` | JSX | P1 | 6 |
| B.3.42-44 | section landing, settle, float animation | section-lift machine; transitions | P4, P5 | 3 |
| B.3.45-50 | `DragSession` float phases, end, return, targets | carry machine + `motion` | P4, P5 | 3 |
| B.3.56-58 | auto-scroll | `scroll` `edge`; offsets back to carry [M14] | P6 | 3 |
| B.3.59 | `ArrivingCard` toggles | held outcome [M22] | P2 | 3 |
| B.3.60-61 | `LongPress` timer, outcomes | `input` recogniser [M20] | P6 | 3 |
| B.3.75-79 | bulk capsule, ring, count, pick circles | JSX from `model.selection` | P1 | 3 |
| B.3.80-81 | found card scroll | `scroll` reveal | P6 | 6 |
| B.3.82-84 | peek reads (`dayView`, `events`, `fresh`) | day-swipe machine → read Cmd / network lane [M21] | P2 | 4 |
| B.3.89-90 | peek render, align | view for the peek day | P1 | 4 |
| B.3.91,93-95 | swipe → pager follow / settle / frames | swipe machines + transient channel + settle transition [M15] | P4, P5 | 4 |
| B.3.97-101 | strip / day tracks | `motion`; day-swipe `nearer`, `landing` | P4 | 4 |
| B.3.104,106 | wheel dot, label | selectors | P1 | 4 |
| B.3.105 | wheel timers | recogniser / timer Cmd | P6 | 4 |
| B.3.107,110 | divider and pinch settings writes | Cmd `device.set` [M17] | P2 | 1 |
| B.3.108 | divider width live | transient channel [M12] | P3 | 4 |
| B.3.111 | pinch scale | transient channel [M12] | P3 | 6 |
| B.3.112-113 | wheel preventDefault, wheel zoom settle | `input`; recogniser timer | P6 | 6 |
| B.3.114-117 | settings row reorder | [M1] no owner | — | — |
| B.3.118 | free-room double click | `input` → entry `openAtEnd` | P6 | 2 |
| B.3.92 | horizontal wheel preventDefault | `input` | P6 | 4 |
| B.3.119-135 | pure core rules (`placeAt`, `swipeLanding`, `dividerAt`, …) | pure rules in update / selectors | P3 | 3, 4 |

### B.4 G3

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| B.4.1-5,36-39,79,105 | menu models, `fullTree`, `listName` | [M4] core queries | P6 | 6 |
| B.4.6-18,40-51,54,56,59-60,173 | menu writes | Cmd write; pick slot in the file sequence [M7] | P2 | 1 |
| B.4.19-22 | `RepeatPage` | overlay page = the core session [M5]; write on close | P5 | 6 |
| B.4.23,28,58,68 | open link / in Obsidian / note / in Calendar | Cmd `obsidian.open` / `openInCalendar` | P6 | 1 |
| B.4.24-26,29,53,55,57 | typing picks (`pickNow`): rename, description, subtask, new section, project rename, attach note | [M7] pick in the same tap | P5, P6 | 6 |
| B.4.27,31 | open full card from menu / peek | overlay pick → `model.sheet.full` | P5 | 6 |
| B.4.30,66 | subtask menu over the same sheet; ⋯ → Search | [M7] sheet hand-over | P5 | 6 |
| B.4.32,52,62,133,166 | lifted copy, bulk close, link closes menu, view menu, project menu | overlay machine [M6] | P5 | 6 |
| B.4.33 | second press within double click | overlay → entry rename | P5 | 6 |
| B.4.34 | menu closed while typing | entry Msg [M8] | P5 | 6 |
| B.4.35,69,129,132,134-135,141-144,146-147 | pure rules (`labelTitle`, `grownStart`, `editRepeat`, `projectsEntryLook`, `projectsDrop`, …) | pure rules in update / selectors | P1 | 5, 6 |
| B.4.61,85,87,91-92,111-128 | MarkdownRenderer, EmbeddedEditor, ObsidianMarkdown, line commands, scopes | `islands` (key scopes [M23]) | P6 | 6 |
| B.4.63-65 | month pick, view mode, Subprojects | overlay page; Cmd write after the entry ends [M7] | P2, P5 | 6 |
| B.4.67 | Select tasks | `model.selection.mode` [M8] | P5 | 3 |
| B.4.70 | menu waits for the column to scroll the card in | overlay `revealing` + `scroll` [M14] | P5, P6 | 6 |
| B.4.71,77,84,86,88-89,93-98,100-101 | full card entry session and description draft | `sheet.full` = the core sessions [M5] | P5 | 6 |
| B.4.72 | `RenamedTexts.add` | [M19] | P2 | 6 |
| B.4.73-76 | full card capsule (undo, ⋯, plus) | `model.canUndo`; overlay; entry | P1, P5 | 6 |
| B.4.78,83 | `find` (async) | read Cmd | P2 | 6 |
| B.4.80,90 | `toggleDone`, `setDescription` (debounced) | Cmd write; debounce timer Cmd | P2 | 1 |
| B.4.81-82 | subtask menu, project line | overlay; Cmd + close | P5 | 6 |
| B.4.99 | title field | `islands` | P6 | 6 |
| B.4.102-103 | full card close / error | Msgs | P5 | 6 |
| B.4.104 | search | read Cmd, coalesced by key | P2 | 6 |
| B.4.106-107 | search pick / close | overlay → `revealed` | P5 | 6 |
| B.4.108 | search takes the ⋯ sheet | [M7] sheet hand-over | P5 | 6 |
| B.4.109 | field's own undo | `input` | P6 | 6 |
| B.4.110 | Refresh now | network lane | P2 | 1 |
| B.4.130-131 | repeat change / remove | overlay page Msgs | P5 | 6 |
| B.4.136-140,145 | by-project reads of the model and handlers | selectors; JSX handlers | P1 | 5 |
| B.4.148-149,151-152,161,167 | tree / list drops, close dim, pick node, move project, clear filter | Cmd write | P2 | 1 |
| B.4.150,155,160 | haptics | Cmd `haptic` | P6 | 1 |
| B.4.153 | panel width → frame | `measure` | P3 | 5 |
| B.4.154 | tree width save | Cmd `device.set` [M17] | P2 | 1 |
| B.4.156 | tree width read | `model.device.treeWidth` | P1 | 5 |
| B.4.157,168 | new project / rename project name field | naming machine | P5 | 5 |
| B.4.158-159 | tree row tap, row lift attach | Msg; tree-lift machine | P5 | 5 |
| B.4.162-165 | `carryAt`, reread, clock, error | Cmd `carryAt` + timer; read; `model.now`; `failed` [M5] | P2 | 3 |
| B.4.169 | carry deps | carry machine | P5 | 3 |
| B.4.170-172 | note search modal | `islands` | P6 | 6 |
| B.4.174 | grips | `input` → resize machine | P6 | 6 |

### B.5 G4

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| B.5.1-9,12,22,65,68,73-74,83,96,100 | timeline / list core reads (`DayBoundary`, `shownSpan`, `relation`, clock, `isPast`, `listName`, `stepFunnel`) | [M4] core queries; clock → `model.now` | P6 | 4, 5, 6 |
| B.5.10-11,13-21,23,40-41,60,63-64,79,90-91,95,103 | pure rules | pure rules in selectors | P1, P3 | 2, 5, 6 |
| B.5.24-26,39,42-46,48-50,53,75,81-82,102,104-105 | reads of screen state through deps | selectors | P1 | 2, 4, 5, 6 |
| B.5.27-29,47,51-52,54,76,107-110 | handlers attached per row / block | JSX handlers → `input` Msgs | P6 | 2, 6 |
| B.5.30,66,121 | timeline resize, block scroller, block fit frame | `measure` | P3 | 5, 6 |
| B.5.31 | grips attach | `input` | P6 | 6 |
| B.5.32 | drop line in body | JSX portal | P1 | 6 |
| B.5.33-37 | timeline block motions on render | transitions by cause [M9]; leaving [M10] | P4 | 6 |
| B.5.38,61 | `RenamedTexts.shown` | [M19] | P2 | 2 |
| B.5.55 | `EntryRows` | view + `model.rowKeys` | P1 | 2 |
| B.5.56,58,117-118 | ScrollHold, ScrollEdges, glides | `scroll` | P6 | 2 |
| B.5.57 | grow room under a plate | transition B1.9 | P4 | 2 |
| B.5.59 | landing render | JSX from section-lift machine | P1 | 3 |
| B.5.62,72 | icons, kit buttons | JSX | P1 | 2, 4 |
| B.5.67 | `CARD_HEIGHTS.max` | constant | P1 | 2 |
| B.5.69-71 | day arrows, Today | day-swipe Msgs | P5 | 4 |
| B.5.77,80,93,106 | divider live width, haptics | transient channel; Cmd `haptic` | P3, P6 | 4, 5 |
| B.5.78,92 | share saves | Cmd `device.set` [M17] | P2 | 1 |
| B.5.84-86 | ribbon day track / follow / arrive | swipe machines | P5 | 4 |
| B.5.87-88 | `is-switching` timers | ribbon slide transition | P4 | 4 |
| B.5.89,94,101 | shared nav placement, by-project mount | view composition | P1 | 4, 5 |
| B.5.97-99 | rows heights motion, fit frame, settle refit | transitions + `measure` [M11] | P3, P4 | 5 |
| B.5.111-116 | keyed rows motion | transitions by cause [M9]; leaving [M10] | P4 | 2 |
| B.5.119-120 | `SnapGlide` | `motion` | P4 | 4 |
| B.5.122-124 | prototype | replaced by the runtime | — | 0 |

### B.6 event sources

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| B.6.1 | `TaskService.onChange` | `fileChanged` → read queued in the file sequence (decision 1); full card re-read [M8] | P2 | 1 |
| B.6.2,13 | calendar change, poll | network lane | P2 | 1 |
| B.6.3,47-48 | settings / view settings change | `settingsChanged` [M17] | P2 | 1 |
| B.6.4 | day change | `dayChanged` (deferred under a gesture) | P5 | 1 |
| B.6.5-7 | focus, visibility, active leaf | `chrome` → `model.visible`; poll wake | P3 | 1 |
| B.6.8 | document pointerdown ×3 | `input` → `pressedElsewhere` | P6 | 3, 6 |
| B.6.9 | document keydown (bulk) | `input` | P6 | 3 |
| B.6.10,95 | arbiter idle | gone: the gesture's end applies `model.deferred` | P5 | 1 |
| B.6.11 | `css-change` | `chrome` → `model.theme` | P3 | 1 |
| B.6.12,155 | minute interval, tick | clock → `model.now` | P2 | 1 |
| B.6.14,50 | view resize | `measure` stage size | P3 | 0 |
| B.6.15-19,49 | plugin settings, visibility, vault raw, popouts, sync leave | [M2] plugin host | — | 1 |
| B.6.20 | DayData driven by calls | runtime | P2 | 1 |
| B.6.21,97-99 | session `onChange` / `fresh` / `renamed` | entry / full card = core sessions [M5] | P5 | 2, 6 |
| B.6.22-24,35-36 | tap away, press ending, bar presses | `input` | P6 | 2 |
| B.6.25-26 | root scroll, hand scroll | `scroll` `userScrolled` | P6 | 2 |
| B.6.27,34,37 | transitionend, fade finish | `motionSettled` | P4 | 2 |
| B.6.28-29,38 | resize observers, panel place | `measure` | P3 | 2 |
| B.6.30 | field growth finished | `motionSettled` | P4 | 2 |
| B.6.31,104 | blur timers | `focus` → `blurred` | P6 | 2, 6 |
| B.6.32-33 | FramePass, ScrollGlide frames | drivers | P6 | 2 |
| B.6.39 | bar repeat panel change | entry Msg | P5 | 2 |
| B.6.40-44 | field editor change, keys, IME, focus | `islands` + `input` (scopes [M23]) | P6 | 2 |
| B.6.45 | plus pointer | `input` | P6 | 3 |
| B.6.46 | keyboard events | `chrome` | P3 | 2 |
| B.6.51,59 | tab / block key scopes | [M23] key scopes | P6 | 0, 5 |
| B.6.52-58 | note block events | host block | P6 | 5 |
| B.6.60,106 | `UndoService.onChange` | `undoChanged` → `model.canUndo` | P2 | 1 |
| B.6.61 | status bar observer | `chrome` | P6 | 0 |
| B.6.62-66 | Settings tab events | [M1] no owner | — | — |
| B.6.67 | popout opens | host / `chrome` [M3] | P6 | 0 |
| B.6.68 | section name field keys / blur | naming machine (core session) | P5 | 2 |
| B.6.69 | field undo keys | `input` | P6 | 2 |
| B.6.70-78 | card / block / event / canvas / drag / resize / section / long-press pointer events | `input` → carry, timeline and section-lift machines | P6, P5 | 3, 6 |
| B.6.79 | auto-scroll frame | `scroll` [M14] | P6 | 3 |
| B.6.80-81 | flight timers, section float finished | `motionSettled` [M16] | P4 | 3 |
| B.6.82-83 | peek reads resolve | `peekRead` Msg | P2 | 4 |
| B.6.84-86 | swipe pointer, wheel stream timer, pager frame | `input` recogniser + `motion` [M20] | P6 | 4 |
| B.6.87-88 | pinch pointer / wheel, wheel settle | `input` + pinch machine | P6 | 6 |
| B.6.89-90 | wheel pointer, click, keys, timers | `input` + wheel-drag machine | P6 | 4 |
| B.6.91,165 | divider gestures (ribbon) | `input` + divider machine | P6 | 4 |
| B.6.166 | divider gestures (still layouts) | `input` + divider machine | P6 | 5 |
| B.6.92 | settings row reorder | [M1] no owner | — | — |
| B.6.93,159-161 | free room double click, plates | `input` → entry | P6 | 2 |
| B.6.94 | found card frame | `scroll` reveal | P6 | 6 |
| B.6.96,100-103 | full card refresh, title rename end, description save, focus, Escape | `sheet.full` Msgs; Escape order [M8] | P5 | 6 |
| B.6.105,112-113 | full card / overlay show and remove frames | presence [M10] | P4 | 6 |
| B.6.107-109 | search input, keys, row click | overlay search | P5 | 6 |
| B.6.110-111 | overlay Escape, backdrop | `input` → overlay close | P6 | 6 |
| B.6.114 | `Picks.giveUp` | [M16] bounded wait | P2 | 1 |
| B.6.115-117,121-127 | menu events (Enter, double press, copy click, peek, view menu frame, month arrows, switch, toggles) | overlay Msgs [M6] | P5 | 6 |
| B.6.118 | stack field row grows | transition | P4 | 6 |
| B.6.119 | menu after the column scroll | overlay `revealing` + `scroll` [M14] | P5 | 6 |
| B.6.120 | page morph finished | `motionSettled` | P4 | 6 |
| B.6.128-132 | embedded editor focus, update, keys, rendered click | `islands` | P6 | 6 |
| B.6.133,135 | tree panel resize, tree divider | `measure`; tree-divider machine | P3, P5 | 5 |
| B.6.134,136,141-143 | dim, tree row, filter title, plate | Msgs | P5 | 5 |
| B.6.137-138 | tree lift | `input` + tree-lift machine | P6 | 5 |
| B.6.139-140 | carry report timer, move / end | Cmd `carryAt` + timer [M5] | P2 | 3 |
| B.6.144 | repeat editor buttons | overlay page Msg | P5 | 6 |
| B.6.145 | view button | overlay `view` | P5 | 6 |
| B.6.146 | note chosen | `islands` → Cmd write | P2 | 6 |
| B.6.147-148,152 | grips, kit buttons | `input` | P6 | 2, 6 |
| B.6.149 | timeline resize observer | `measure`; anchor held [M14] | P3 | 6 |
| B.6.150-151 | wheel / touch drop the anchor | `input` → `userScrolled(timeline)` | P6 | 6 |
| B.6.153,156-158 | ScrollEdges, ScrollHold | `scroll` [M14] | P6 | 2, 6 |
| B.6.154,173-174 | motion finished (block gone, row grown / left) | `motionSettled` [M10] | P4 | 2, 6 |
| B.6.162-164 | note block observers and frame | `measure` | P3 | 5 |
| B.6.167-168 | strip track callbacks, slide end | `motion` | P4 | 4 |
| B.6.169-171 | rows observer, fit frame, settle | `measure`; `motionSettled` [M11] | P3 | 5 |
| B.6.172 | drop hover in rows | carry target | P5 | 5 |
| B.6.175-176 | glide stopped by a finger, glide end | `scroll` `userScrolled`, `scrollSettled` [M14] | P6 | 2 |
| B.6.177 | `SnapGlide` frames | `motion` | P4 | 4 |
| B.6.178-180 | prototype | replaced by the runtime | — | 0 |

## Behaviour (203 inputs, 84 motions, 84 measurements, 52 screen states)

Row ids are the ids of `inventory-behaviour.md` (it has no C1.16; C1 holds 23 rows).

### A. Inputs and gestures

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| A1.1-2 | open the tab (ribbon icon, command) | host (plugin) opens the view; runtime mounts a screen | P6 | 0 |
| A1.3 | note block appears | host block; same view in a block host | P6 | 5 |
| A1.4 | several tabs, popouts | one runtime per plugin; file sequence shared; `chrome` per window | P2, P6 | 0 |
| A2.1 | tap a card → task menu after reveal | tap recogniser → overlay `task` with `revealing` [M14] | P5 | 3, 6 |
| A2.2 | counter tap folds subtasks | Cmd `toggleCollapsed`; fold motion by cause [M9] | P2, P4 | 2 |
| A2.3 | folder mark tap → filter | Cmd `selectProjectNode` | P2 | 2 |
| A2.4,8-9 | right click / click with selection → bulk or task menu | tap order function over `model.selection`; overlay | P5 | 3 |
| A2.5 | double click → rename | overlay `task` → entry rename (second press within 250 ms) | P5 | 6 |
| A2.6-7,10 | Cmd-click, Shift-click, tap in select mode | `model.selection`; select mode [M8] | P5 | 3 |
| A2.11-15 | long press / mouse drag lift, cancel, second finger, redraw during press | `input` recogniser → carry machine; hand-off to pinch [M20] | P5, P6 | 3 |
| A2.16-17 | Done / immovable by-project cards | card `can` from the core; tap only | P1 | 4, 5 |
| A2.18-21 | double click free room, plates | `input` → entry `openAtEnd` / `openIn` | P5 | 2, 5 |
| A2.22 | select text in the lifted copy | view (native selection) | P1 | 6 |
| A2.23 | link in the copy | overlay pick → Cmd `obsidian.open` | P5 | 6 |
| A3.1 | section header tap | overlay `section` | P5 | 6 |
| A3.2 | section lift | section-lift machine | P5 | 3 |
| A3.3-4 | rename section, new section name | naming machine | P5 | 2 |
| A4.1-3 | timeline tap, double click, mark | tap recogniser → overlay / entry / Cmd | P5 | 6 |
| A4.4-5 | finger hold → menu, then drag with no free moment | hold machine + overlay at once, then hand-off [M8] | P5 | 6 |
| A4.6 | mouse drag of a block | carry machine (grab offset) | P5 | 3, 6 |
| A4.7-8 | long click, right click → select with menu | `model.timeline.selected` + overlay | P5 | 6 |
| A4.9 | stretch dots | resize machine | P5 | 6 |
| A4.10 | event menu | overlay `event` | P5 | 6 |
| A4.11 | new slot on canvas | new-slot machine → entry | P5 | 6 |
| A4.12-13 | pinch, ctrl-wheel zoom | pinch machine; transient channel [M12] | P3, P5 | 6 |
| A4.14 | touch / wheel drops the opening anchor | `userScrolled(timeline)` clears `model.timeline.anchor` [M14] | P6 | 6 |
| A4.15 | press elsewhere clears the block selection | `pressedElsewhere` | P5 | 6 |
| A5.1-2,12 | plus tap / keyboard; ignored while hidden | entry `openFromPlus`; selector `plusHidden` | P5 | 2 |
| A5.3-8 | carry the plus; ring cancel; drop in gap, timeline, title, by project | carry machine `payload: plus` | P5 | 3 |
| A5.9 | plus in the tree gap → project name | carry → naming `newProject` | P5 | 5 |
| A5.10-11 | plus at the left edge / over a tree row | core carry session [M5] | P5 | 3 |
| A6.1-5,7,9,11-13 | drag moves, targets, cancel, cross ring, tree drop | carry machine; targets from `model.measured` [M13] | P3, P5 | 3 |
| A6.6 | auto-scroll at edges | `scroll` `edge`; offsets back to the carry [M14] | P6 | 3 |
| A6.8 | hover a tree row 600 ms → node opens | core carry; read the carry asked for applies at once (decision 7) | P5 | 3 |
| A6.10 | let go → write, then flight to the real place | held outcome + flight transition [M22] | P2, P4 | 3 |
| A6.14 | let go among by-project cards | held landing card at the line | P2 | 3 |
| A6.15 | new drag while a copy flies | `motion` finishes the running flight | P4 | 3 |
| A6.16 | no redraw under a gesture | P5 `model.deferred` | P5 | 3 |
| A6.17 | iOS lost lift | `input` (new primary finger ends the gesture) | P6 | 3 |
| A6.18 | view closed mid-drag | runtime teardown cancels the machine | P6 | 3 |
| A6.19 | lifted block leaves the timeline stack | selector `stackTasks` without `carry.lifted`; transition | P1, P4 | 6 |
| A7.1-5 | finger swipe, vertical scroll, trackpad swipe, ctrl-wheel, rubber band | ribbon swipe machine + recogniser [M20] | P5, P6 | 4 |
| A7.6 | finger down while the screen runs | [M15] | P5 | 4 |
| A7.7 | new swipe during a run | ribbon swipe catches the running transition | P4, P5 | 4 |
| A7.8 | no swipe in other modes / block | selector `hasPages` | P1 | 4 |
| A7.9-14 | wheel tap, quick / slow drag, long press, arrows, cancel | wheel-drag machine; careful pace recogniser | P5 | 4 |
| A7.15 | leaving Done | update rule on place change | P2 | 4 |
| A7.16-18 | ‹ ›, title → today, repeated taps | day-swipe machine and its queue [M16] | P5 | 4 |
| A7.19 | switch day / place with a field open | entry writes first [M7]; bar place keeps the field [M8] | P2, P5 | 4 |
| A8.1-2 | ribbon divider, snap glide | divider machine; snap transition | P5, P4 | 4 |
| A8.3 | still layouts' divider | divider machine | P5 | 5 |
| A8.4 | tree divider | tree-divider machine; lists give way live [M12] | P5 | 5 |
| A8.5 | fixed halves | view (not draggable) | P1 | 4 |
| A9.1-3,6 | folder button, tree row, dim, cross | Cmd writes (`setProjectsPanel`, `pickProjectNode`, `clearProjectFilter`) | P2 | 5 |
| A9.4 | project lift | tree-lift machine | P5 | 5 |
| A9.5,8,10-11 | project menu, folder switch, note, delete | overlay `project` [M6] | P5 | 6 |
| A9.7 | rename project | naming machine | P5 | 5 |
| A9.9 | attach note | `islands` (FuzzySuggestModal) [M7] | P6 | 6 |
| A10.1-3 | view button, mode, Subprojects | overlay `view`; Cmd writes after the entry ends | P5, P2 | 6 |
| A11.1 | undo | Cmd `undo`; motion of what it changed [M9] | P2, P4 | 1 |
| A11.2-3 | ⋯ menu, Search on the same sheet | overlay `more` → `search` [M7] | P5 | 6 |
| A11.4-6 | select mode | `model.selection.mode` [M8] | P5 | 3 |
| A11.7 | press outside clears selection | `pressedElsewhere` | P5 | 3 |
| A11.8-11 | search typing, keys, pick, cancel | overlay `search`; coalesced read | P5, P2 | 6 |
| A11.12-13 | Cmd+F, Cmd+Z in the view | [M23] key scopes → Msgs | P6 | 0 |
| A11.14 | Cmd+Z in a plain field | `input` | P6 | 2 |
| A11.15 | any press clears the found ring | `pressedElsewhere` → `model.found = null` | P5 | 6 |
| A12.1-3 | backdrop, Escape, Enter confirms | overlay machine; Escape order over the stack [M8] | P5 | 6 |
| A12.4 | first pick, action after the fade | overlay `picked`; slot in the file sequence [M7] | P2, P5 | 6 |
| A12.5 | pick that types | [M7] | P5, P6 | 6 |
| A12.6-10 | label tiles, project page, repeat page, date picker, reminder | overlay pages redrawn [M6] | P5 | 6 |
| A12.11 | subtask menu over the same sheet | [M7] hand-over | P5 | 6 |
| A12.12-13 | description peek, Refresh now | overlay → sheet; network lane | P5, P2 | 6 |
| A13.1-14,16,18-19 | field typing, keys, IME, `[[`, line hotkeys, paste, tap away, blur, bar | entry machine (core session [M5]); `islands`; `input`; `focus` | P5, P6 | 2 |
| A13.15 | bar panels | nested overlay inside the entry [M8] | P5 | 2 |
| A13.17 | place tile / date in the bar | entry + ribbon / day [M7, M8] | P5 | 4 |
| A13.20 | rename via menu (list, timeline, stack) | overlay → entry | P5 | 2, 6 |
| A13.21 | add subtask on a timeline-only task | overlay + entry at once [M8] | P5 | 6 |
| A13.22 | hand scroll stops following the field | `scroll` `userScrolled` → entry `follow = false` | P6 | 2 |
| A14.1-10 | full card: close, Escape, Done, circles, subtasks, parent, project, description, bottom row, rename | `model.sheet.full` + sessions [M5] + overlay [M8] | P5 | 6 |
| A15.1-3 | note block presses, focus, key scope | host block; `focus`; [M23] | P6 | 5 |
| A15.4-5 | touchmove / touchstart prevented | `input` (synchronous preventDefault) | P6 | 0 |
| A15.6 | focus, visibility, active leaf | `chrome` → `model.visible` | P3 | 1 |
| A15.7 | theme change | `chrome` → `model.theme` | P3 | 1 |
| A15.8 | view resize | `measure` stage size | P3 | 1 |
| A15.9 | keyboard shows / hides | `chrome` → keyboard transition | P3, P4 | 2 |
| A15.10 | Create file | Cmd `createFile` | P2 | 5 |
| A15.11 | settings rows drag | [M1] no owner | — | — |
| A16.1,3 | one gesture at a time; no start while busy | `interaction.gesture` slot + start table | P5 | 3 |
| A16.2 | hold → drag hand-off | explicit hand-off in the machine table | P5 | 6 |
| A16.4 | swipe settling counts as free; finger releases the claim | [M15] | P5 | 4 |
| A16.5-6 | pointer kinds, sideways vs vertical | recognisers [M20] | P6 | 3, 4 |
| A16.7-8 | wheel claim fails, divider claims on down | start table; `input` preventDefault | P5, P6 | 4 |
| A16.9 | pinch hand-off on a second finger | explicit hand-off | P5 | 6 |
| A16.10-11 | grip stops propagation, canvas declines blocks | `input` hit targets | P6 | 6 |
| A16.12 | naming holds the screen | naming machine + keyed field (decision 3) | P5 | 2 |
| A16.13 | project menu refuses while busy | start table | P5 | 6 |
| A16.14 | redraws and tick wait while busy | `model.deferred` [M8] | P5 | 1 |
| A16.15 | writes in order, after a closing pick | file sequence; pick slot [M7] | P2 | 1 |
| A16.16 | Escape order | function over the machine stack [M8] | P5 | 6 |
| A16.17 | tap order on a card | function over the active machines | P5 | 3 |

### B. Motions

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| B1.1-4 | row grows in, leaves, mark row folds, kept row slides (FLIP) | list transitions by cause [M9]; leaving [M10] | P4 | 2 |
| B1.5 | row comes back while leaving | [M10] | P4 | 2 |
| B1.6-8 | timeline block moved, new, gone | timeline transitions by cause [M9, M10] | P4 | 6 |
| B1.9 | plate replaced by first card | transition (room grows under the stand-in) | P4 | 2 |
| B1.10,12 | bar panel fades, desktop bar leaves | presence [M10] | P4 | 2 |
| B1.11 | desktop bar appears | appear transition | P4 | 2 |
| B1.13 | float width from the card | carry lift transition | P4 | 3 |
| B1.14 | menu page morph | overlay page transition [M6] | P4 | 6 |
| B1.15-16 | section copy lands / flies back / sinks | section-lift transitions | P4 | 3 |
| B1.17 | strip scrub between places | transient channel between two computed layouts (decision 4) | P3, P4 | 4 |
| B1.18 | stack field row grows | transition | P4 | 6 |
| B2.1 | fade room height when a field opens | entry transition (WAAPI; layout transition banned in CSS) | P4 | 2 |
| B2.2 | plus / capsule / wheel hide (scale) | transition on gesture / entry / select start | P4 | 2 |
| B2.3-5,7 | wheel settle, ribbon `is-switching` | ribbon / wheel transitions | P4 | 4 |
| B2.6,22-23,27,29 | popover, peek, panel, sheet, search rise | presence transitions (transform moves to WAAPI) [M10] | P4 | 6 |
| B2.8-10 | fold on lift (cards, slot, plate) | carry / section-lift transitions | P4 | 3 |
| B2.11-12 | list drop line moves, level | carry target transitions | P4 | 3 |
| B2.13 | timeline drop line steps | carry target transition | P4 | 6 |
| B2.14-16 | plus / card float flights, stack fade | flight transitions [M22] | P4 | 3 |
| B2.17-19 | backdrop, level shadow, copies fade | CSS opacity stays; presence [M10] | P4 | 6 |
| B2.20-21 | select circles slide in, dots hide | select-mode transition | P4 | 3 |
| B2.24 | folder switch knob | overlay transition; outcome held (P2) | P4 | 6 |
| B2.25 | bar rides the keyboard | keyboard transition | P4 | 2 |
| B2.26 | desktop capsule away (opacity) | CSS opacity stays; presence [M10] | P4 | 2 |
| B2.28 | settings rows step aside | [M1] no owner | — | — |
| B2.30-31 | phone tree panel slide, dim | panel transition | P4 | 5 |
| B2.32-33 | docked panel and columns slide | dock transition | P4 | 4 |
| B2.34 | view button hides / moves with the wheel | transition with the ribbon | P4 | 4 |
| B2.35 | rows heights (delayed while a card fades) | [M11] | P4 | 5 |
| B2.36 | another context: heights jump | no transition on a context change | P4 | 5 |
| B2.37 | press feedback | CSS stays | P4 | 2 |
| B3.1-4 | pager run, day track, strip follow, rubber band | swipe machines + `motion` (transient channel) [M15] | P4 | 4 |
| B3.5 | divider glide into / out of the middle | snap transition | P4 | 4 |
| B3.6 | column scrolls the card in, then the menu | overlay `revealing` + `scroll` [M14] | P5, P6 | 6 |
| B3.7 | search reveals a card | `scroll` reveal | P6 | 6 |
| B3.8 | field follows into sight | `scroll` reveal; `motionSettled` | P6 | 2 |
| B3.9 | keyboard slide | keyboard transition | P4 | 2 |
| B3.10 | field in a menu raised over the keyboard | selector from `model.chrome.keyboard` | P3 | 6 |
| B3.11 | auto-scroll | `scroll` `edge` | P6 | 3 |
| B3.12 | pinch layout per frame | [M12] transient channel | P3 | 6 |
| B3.13 | flight awaited by timer | `motionSettled` [M16] | P4 | 3 |
| B3.14-16,18 | overlay / panel / full card show and remove | presence [M10] | P4 | 6 |
| B3.17 | view menu placed again next frame | `measure` → placement | P3 | 6 |
| B3.19-21 | wheel settle, ribbon switch, docking class timers | transitions | P4 | 4 |
| B3.22 | rows fit then re-measure | [M11] | P3, P4 | 5 |
| B3.23 | scroll hold under a shrinking list | `scroll` (ScrollHold) | P6 | 2 |
| B3.24 | now line every minute | clock → `model.now` | P2 | 1 |
| B3.25 | settings row settles | [M1] no owner | — | — |
| B3.26 | timeline opening anchor | [M14] | P6 | 6 |
| B3.27-29 | question, search row, name fields scrolled into view | `scroll` reveal | P6 | 2, 6 |

### C. Measurements

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| C1.1-3,6 | stage width, rubber band distance, day track distances | `measure` stage size | P3 | 1, 4 |
| C1.4 | keep hours still when all-day rows differ | [M13] placement | P3 | 6 |
| C1.5 | forced reflow for `is-redrawn` | gone | P4 | 2 |
| C1.7 | strip keyframes from computed styles | computed per place (decision 4); tokens read once | P3 | 4 |
| C1.8 | still-layout widths | selector `layoutWidths` over stage size | P3 | 5 |
| C1.9-14 | rows: room, fade, leaving delay, typing heights, stops | `measure` row heights → selector `stackedLists` [M11] | P3 | 5 |
| C1.15 | foot fade left edge | selector | P3 | 5 |
| C1.17 | note block height | `measure` content height | P3 | 5 |
| C1.18-19 | Live Preview end room, note view mutations | host block | P3, P6 | 5 |
| C1.20 | status bar room | `chrome` | P3 | 0 |
| C1.21-22 | tree panel width, tree divider bounds | `measure`; selector | P3 | 5 |
| C1.23 | finger px per wheel place | token read once | P3 | 4 |
| C1.24 | settings rows wrap | [M1] no owner | — | — |
| C2.1,6 | scroll edge fades | `scroll` [M14] | P6 | 2 |
| C2.2 | scroll hold room | `scroll` | P6 | 2 |
| C2.3 | FLIP rects | gone (transitions by cause) [M9] | P4 | 2 |
| C2.4 | Motion reads of boxes and styles | `motion` reads what it animates [M13] | P6 | 2 |
| C2.5 | bar resting top through transforms | `chrome` + `measure` | P3 | 2 |
| C2.7-8 | by-project / tree scroll reset / keep | `scroll` orders [M14] | P6 | 5 |
| C2.9 | peek over the shown columns, same scroll | view draws the peek layout; scroll copy [M14] | P3 | 4 |
| C3.1-18 | drag hit tests and flight boxes | [M13] placements snapshot | P3 | 3 |
| C3.19 | settings row rects | [M1] no owner | — | — |
| C3.20 | whole-title copy width | `measure` text width | P3 | 3 |
| C4.1-2 | timeline resize, visible height | `measure` | P3 | 6 |
| C4.3 | zoom anchor rect | [M13] | P3 | 6 |
| C4.4-5 | anchor scroll, room under a short day | [M14] | P6 | 6 |
| C5.1 | which column scrolls, how far | `scroll` + `measure` [M14] | P3 | 6 |
| C5.2,4-10,12 | menu, peek, bulk copies, search placement | `measure` sizes + placements [M13] | P3 | 6 |
| C5.3 | long labels fade | `measure` text fits | P3 | 6 |
| C5.11 | forced reflow for grow-in | gone (WAAPI) | P4 | 6 |
| C6.1-2 | field reveal and bar place | `measure` + `scroll` [M13] | P3 | 2 |
| C6.3 | field still growing | `motionSettled` | P4 | 2 |
| C6.4,7,9 | status bar, window height, keyboard height | `chrome` | P3 | 2 |
| C6.5,8 | desktop capsule placement, long place name | `measure` | P3 | 2 |
| C6.6 | reflow before glide | gone (WAAPI) | P4 | 2 |
| C7.1 | found card into view | `scroll` reveal | P6 | 6 |
| C7.2 | `is-mobile`, `theme-light` | `chrome` | P3 | 1 |
| C8.1-4 | token reads | read once per theme change into the model | P3 | 1 |

### D. Screens

| Rows | What | Owner in the spec | P | Step |
|---|---|---|---|---|
| D1.1-4 | the four modes | one layout component per `ViewChoice.layout` | P1 | 4, 5 |
| D1.5-10 | filters and Subprojects row | selectors over `model.read` | P1 | 5 |
| D1.11,13 | kept per device, fallback | core answers in `model.read` | P1 | 1 |
| D1.12 | context drawn still, same-context changes move | P4 [M9] | P4 | 2 |
| D1.14 | one layout at a time; timeline keeps its scroll | layout component; `scroll` keyed [M14] | P1, P6 | 5 |
| D2.1-7 | panel docked / overlay / by carry / kept / top row / tree rows / missing | selectors over `read.funnel.panel`; transitions | P1 | 5 |
| D3.1-6 | note block | host block; same view; selectors; `measure` | P1, P6 | 5 |
| D4.1 | before the first read | initial model from `firstView` / `firstPlace`; no transition | P1, P4 | 1 |
| D4.2 | missing file | `read.missing` | P1 | 5 |
| D4.3-4 | empty lists, empty section | selectors (core words) | P1 | 2 |
| D4.5 | Done column | selector `shownPlace` | P1 | 4 |
| D4.6 | found task | `model.found`; reveal | P1 | 6 |
| D4.7 | full card | `model.sheet.full` | P5 | 6 |
| D4.8 | search | overlay `search` | P5 | 6 |
| D4.9 | select mode with wheel and swipe | [M8] | P5 | 3 |
| D4.10 | field open | selectors over `model.entry`; `chrome` | P1 | 2 |
| D4.11 | dragging | selectors over `interaction.gesture` | P1 | 3 |
| D4.12 | menus, one sheet handed on | overlay stack [M6, M7] | P5 | 6 |
| D4.13 | hidden view: tick deferred | `model.visible` + `model.deferred` | P5 | 1 |
| D4.14 | day relation | selectors with `model.now` [M4] | P1 | 6 |
| D4.15 | calendar dot | selector `sourcesDot` | P1 | 4 |
| D4.16 | theme | `model.theme` | P3 | 1 |
| D5.1-9 | settings that change the screen | `model.settings` / `model.device`; update rules | P1 | 1 |

## Rows that do not fit

Each item names a class, not a row, and proposes the principle or mechanism the spec must state so the whole class is owned. A row can be in more than one item.

### No mechanism owns it

#### M1. The Settings tab has no owner

**Rows (75):** A15.11, B2.28, B3.25, C1.24, C3.19, A.2.438, A.2.501-502, A.2.509-512, B.2.171-223, B.3.114-117, B.6.62-66, B.6.92

`SettingsTab.ts`, `SettingsPage.ts` and `RowReorder.ts` hold state, call `SettingsService` and `CalendarService` straight from the DOM handlers (one write per keystroke, `SettingsTab.ts:128`), measure rows (`:425-432`) and animate the row reorder with a CSS `transform` transition (`styles.css:1481`). The spec names two hosts only, `TaskCalendarView` and `ProjectBlocks`, and no migration step moves the tab. Two guards then fail: after step 1, "services only in `effects/`" covers all of `obsidian/ui`, and the `styles.test.ts` ban on `transform` transitions hits `.tc-level-row.is-shifting`. The freeze then forbids fixing either in place.

**The spec must say:** every surface the plugin draws is a host of the runtime (a `PluginSettingTab` and a `Modal` are hosts like a leaf), with a model of its own. Then the tab's writes join the plugin-wide sequence and its row reorder becomes a `Transition`. Name the step that moves it. The other honest option is to declare the tab outside the new layer: then the guards and the freeze carry a named exemption, and the `transform` ban is scoped to the screen.

#### M23. Obsidian key scopes

**Rows (13):** A11.12-13, A15.3, A.2.482, A.2.484, A.2.494, A.2.518, B.2.143-144, B.2.151, B.2.158, B.6.51, B.6.59

The tab and each note block push an Obsidian `Scope` for Cmd+Z, Cmd+Shift+Z and Cmd+F. Fields push their own scope on focus (`MarkdownTitleField.ts:86`, `ObsidianMarkdown.ts:30`) and swallow Obsidian's line hotkeys (`lineCommands.ts`). `input` owns "keys", meaning DOM events; `islands` owns CodeMirror. Neither owns `app.keymap.pushScope` and `popScope`, which decide whether Cmd+Z undoes the field or the file (A11.13-14).

**The spec must say:** which driver owns the key scope stack. The scope follows `model.focus`, one scope per focused owner (tab, block, field, editor), and the keys come out as messages.

### The principles would change what the user sees

#### M7. Pick timing: typing picks, sheet hand-over, and the pick's place in the write order

**Rows (27):** A3.4, A11.3, A12.4-5, A12.11, A16.15, A7.19, A13.17, D4.12, A.2.404-407, B.2.73, B.4.24-26, B.4.29-30, B.4.53, B.4.55, B.4.57, B.4.63-66, B.4.108

Decision 10 says "a menu's pick is delivered after its close, whatever order Obsidian fires them in". Today there are three kinds of pick (`kit/Panel.ts:63-91`):
- **`pick`:** close, and the action runs after the fade.
- **`pickNow`:** close, and a field opens and is focused **in the same tap**, because iOS raises the keyboard only for a field the finger focused itself (`Panel.ts:11`).
- **`handOff`:** nothing closes; Search takes the ⋯ sheet, and a subtask's menu takes the task menu's sheet.

Delivering every pick after the close kills the iPhone keyboard for Rename, Add description, Add subtask, New section, project Rename and Attach note. A close followed by a reopen also flickers where today one sheet is handed on.

Separately, `act` waits for `Picks.settled()`, so a write asked during the fade runs **after** the pick's write (D81). With "the effect starts after the close", the later write would get the earlier sequence number. The same holds for `afterEntry`: a place or day switch is ordered after the entry's writes (A7.19).

**The spec must say:**
1. In P2: *a command's place in the file sequence is taken when the user acts (the message), not when its work starts.* This covers picks, `afterEntry` and turns.
2. The overlay machine has three pick transitions: `pick`, `pickTyping` and `handOver`.
3. In P6, with an exception to "notification once per microtask": a message from a user gesture that orders focus is flushed through `update`, render and `focus` synchronously inside that input event.

#### M8. "At most one interaction" against modes and overlays that coexist

**Rows (42):** A4.4-5, A6.13, A11.4-6, A13.15, A13.21, A14.1-10, A16.14, A16.16, D4.9, A.2.3, A.2.113-114, A.2.341-343, A.2.367, B.2.72, B.2.78-86, B.4.34, B.4.67, B.6.1, B.6.96

P5 says "a gesture, typing, an open menu or sheet: each is a state machine in the model, at most one active", and that outside changes wait until it ends. Today several are active together:
- select mode with the wheel and swipe working, and with a carry of the picked cards that ends it (D4.9, A6.13);
- a finger hold with its menu open, then a hand-off to drag (A4.4-5);
- the bar's panels and the timeline menu's stack field while typing (A13.15, A13.21);
- the full card with its own entry and menu (A14.9);
- the Escape order (A16.16), which only makes sense over several active machines.

Today only a held **gesture** defers redraws and the tick (`ScreenParts`, `canTick`). During typing, select mode, an open menu or the full card, outside reads and the minute tick apply at once, and the full card re-reads (`CS:447`). Under P5 as written, a Sync arriving while Max types several tasks would not show until he ends the entry, and the now line would stop while he types.

**The spec must say:** P5 has layers:
- **One gesture** at a time (pointer held). Only it defers outside changes.
- **Modes** (select, entry, full card) persist across gestures.
- **Overlays** form a stack.

Modes and overlays take outside reads at once and re-derive by key: a vanished task closes its menu, and the full card steps up (D4.7). The machine table says which gesture may start under which mode or overlay. Escape and tap order walk the stack from the top.

#### M11. Holding heights until a motion ends breaks motions that move together

**Rows (21):** B2.35, B3.22, C1.9-14, A.2.460-466, B.5.97-99, B.6.169-171

Rows mode shrinks a list's height **together** with the card folding out of it. `RowsLayout.ts:136-143` sets `transition-delay` to the card's fade half (D60, D67, D76). Decision 9 says measured heights are "held while a motion runs and applied on `motionSettled`". So the row would keep its height through the fold and shrink only afterwards: a gap that then closes. That is a second, later motion, and it was rejected in D76.

**The spec must say:** a `Transition` carries its end layout computed from the model. The leaving row's height and the surviving rows' heights are already measured. Dependent motions are part of the same numbered transition, with phase offsets ("after the fade half"): row heights, the note block's height, the scroll hold. Measurements are held only for boxes whose new size the transition does not know (new text). The spec needs composition inside one transition: phases and offsets.

#### M15. A finger down while the strip still runs

**Rows (17):** A7.6, A16.4, A.2.231-236, B.3.91-95, B3.1-4

The spec's hand-off list says "a finger down during a settle catches the strip". Today (`Swipe.ts:259-265`, `ScreenPager.ts:91`) the run is **not** stopped: `stand()` is a no-op, the tap goes to what it hit, and only a new *swipe* catches the strip where it is seen (A7.7). Catching on any finger down would stop the strip under every tap made while it settles.

**The spec must say:** the settle is a motion after the swipe machine has ended. The model already holds the landing place, so any input may start. Only a swipe start converts the running transition into its own origin: `motion` reports the current offset (`caught(offset)`).

#### M19. Outcomes held in one screen, shown in every screen

**Rows (6):** A.2.337-338, A.2.352, B.4.72, B.5.38, B.5.61

`RenamedTexts` is a module-level set: a rename typed in the leaf, the full card or a note block shows on that task's card in **every** open screen until it is written. P1 gives each screen its own model, and P2 keeps the held outcome "in the interaction itself". So a note block beside the leaf would show the old title until the read lands.

**The spec must say:** held outcomes live in the plugin-wide runtime, beside the file sequence, keyed by write number. Every screen's selectors overlay them, and the read with that number removes them. That is not a second optimistic layer to keep in sync, because the same number that orders the write ends it.

### Two principles conflict

#### M3. `chrome` takes nothing from the model, yet must write model-driven global state

**Rows (14):** A.2.133, A.2.503-508, B.2.126, B.2.231-235, B.6.67

The driver table gives `chrome` "Takes from the model: —". But the guard puts every `classList` write in `chrome`. Several body-level outputs are decisions of a model:
- `tc-cancelling` while several cards are carried over the cross ring (`PlusRing.ts:42`);
- the card-size tokens and the priority and label colour sheet in every window, popouts included (`cardSize.ts:19`, `priorityColors.ts:47-50`), taken from settings.

These outputs are also plugin-wide: two screens and a popout share one `body` per window.

**The spec must say:** `chrome` takes orders from the models (body classes and per-window tokens) and merges them across screens: a class is on while any screen holds it, and tokens come from the plugin's settings once per window. More generally, each driver owns the DOM outputs of its own kind; one driver should not own all class writes.

#### M4. Synchronous core reads called while drawing and at pointer rate

**Rows (71):** B.1.5, B.1.9, B.1.14-15, B.1.19-20, B.1.22-26, B.1.28-30, B.1.53, B.1.55-56, B.1.93, B.1.122, B.2.25-27, B.2.109, B.2.111-112, B.2.224, B.2.228, B.3.1-3, B.3.8, B.3.34-36, B.3.72-73, B.3.85-88, B.4.1-5, B.4.36-39, B.4.79, B.4.105, B.5.1-9, B.5.12, B.5.22, B.5.65, B.5.68, B.5.73-74, B.5.83, B.5.96, B.5.100, A.2.108, D4.14

P6 says "services are called only from the effect runner", and the guard bans service imports in `model/`, `update/` and `view/`. But the screen needs synchronous answers from service objects at every draw and every pointer move:
- `TaskService.snap`, `stretch`, `dropSpan`, `newSlot` (`contracts.ts:1588-1603`);
- `menu` and `bulkMenu` (`:1519-1521`), `listName`, `columnSections`, `fullTree`, `carried`;
- `DayService.today`, `relation`, `boundary`, `stepFunnel`, `openAt` (`:1710-1720`);
- `CalendarService.isPast` (`:1872`, "asked at every drawing, so it greys as it ends");
- `UndoService.canUndo`.

A command round trip per pointer move breaks decision 8, and a round trip per draw makes drawing async. Several of these also read the clock, so they are not pure.

**The spec must say:** there is a third kind of call besides commands, **core queries**. These are synchronous, side-effect-free methods listed in one `CoreQueries` interface, injected into `update` and the selectors, and the only service-shaped import those layers may use. Their inputs must be in the model: the clock-reading ones (`today`, `relation`, `isPast`) take `model.now` as an argument. That is an additive contract change and belongs in step 0.

#### M5. Interaction state the core already keeps

**Rows (75):** A.2.125, A.2.305, A.2.347, A.2.513-514, B.1.17-18, B.2.10, B.2.29-65, B.2.239-241, B.3.6-7, B.4.19-22, B.4.71, B.4.77, B.4.84, B.4.86, B.4.88-89, B.4.93-98, B.4.100-101, B.4.162, B.6.21, B.6.97-99, B.6.139-140

P1 puts every interaction in the model as a pure machine, and the spec lists an "entry" machine. But by the project's own layering ("the UI decides nothing"), the core already holds these interactions as stateful objects:
- `QuickEntrySession`, with its own `WriteQueue` and `view.fresh()` (`QuickEntrySession.ts:44-50`);
- `SectionNameEntry`, `RepeatPage`, `DescriptionDraft`;
- the carry (`startCarry` / `carryAt` / `endCarry`, with the core's 600 ms hover).

A pure `entry` reducer in `update` would duplicate them (P1) or move rules out of the core (CLAUDE.md layers).

**The spec must say:** extend the `FunnelView` rule to sessions. Where the core keeps an interaction's state, the core object *is* the machine. It lives in the effect runner, every call to it is a command, and the model holds its last answer, never a second copy. The session's `WriteLine` port is the plugin-wide file sequence, and its `fresh()` is a sequence read. This needs no contract change, because `QuickEntrySession` already takes a `WriteLine`.

#### M6. Menus and sheets as `islands` against a model-drawn menu

**Rows (37):** A9.8, A12.6-10, B1.14, A.2.378-392, A.2.408-412, B.6.115-117, B.6.121-127

The `islands` driver owns "Obsidian `Menu` and `Modal` … created once and never diffed", and step 6 makes "menus and sheets … islands". But the plugin's menus are its own DOM (`menu/Overlay.ts`, `kit/Panel.ts`, `PanelPages.ts`), not Obsidian's `Menu`. The only Obsidian modals are `NoteSearch` (`FuzzySuggestModal`) and `SettingsPage`. These menus redraw in place:
- label tiles recolour the copy;
- the repeat page changes as you tap;
- the knob flips before the write;
- pages morph (B1.14).

An island that is never diffed would need all of this done imperatively, outside `view` (P1, P6).

**The spec must say:** overlays (task, bulk, section, project, event, view, ⋯, sources, search, full card, the bar's panels) are Preact components drawn from `model.overlay` into a portal layer. Islands are only foreign widgets: CodeMirror, `MarkdownRenderer` output, Obsidian modals. The pick rules (M7) belong to the overlay machine, not to a driver.

#### M9. Motion by cause, when only the read knows what moved

**Rows (22):** A2.2, A11.1, D1.12, B1.1-4, B1.6-8, C2.3, B.5.33-37, B.5.111-116

P4 says "no motion is inferred from a diff", yet the spec keeps "list slides, grow-in and fold-away after a user's write, in the lists it touched". The UI cannot know which rows a write moves without the read: the core decides the place. For example:
- Done or a new date takes the card to another list;
- Undo reverts anything;
- the counter tap folds subtasks;
- Enter adds a row and the rows below slide.

`docs/plugin/screen.md:94`, which is approved, says: "Двигается только то, что изменилось в том же виде: добавленная, перенесённая, удалённая карточка, Undo." Today that also covers changes in the same context that came from outside (Sync, an agent editing the file). P4's "an outside read … is drawn in place" would stop those from moving. That is a user-visible change, while the "Done when" list requires `docs/plugin/` to stay unchanged.

**The spec must say:** a cause *authorises* motion and *scopes* it (screen, read number). The keyed difference between the model before and after that read *decides* what moves. A diff never authorises motion on its own. Then a product decision for Max, in product words: does a card changed from outside (phone Sync, an agent) still move as it does today? If yes, a same-context outside read is an authorising cause, applied when no gesture holds the screen.

### Too vague to build without guessing

#### M2. The plugin host is outside every model

**Rows (23):** A.2.496-497, A.2.532, B.1.128-139, B.1.141-142, B.6.15-19, B.6.49

Step 1 says "every service caller goes through commands (… `main.ts`)", but commands come out of a screen's `update`. Plugin load, the settings file and its reload on `vault.raw`, `PluginCodeWatcher`, the protocol handlers (Google login, sync, open), `keepWorkExportInstalled`, the device-place hand-over (`main.ts:105-108`, a task-service write) and the core's timer ports have no model and no messages. Some of them write the same stores the screens read: `setFunnelPlace` and the settings file.

**The spec must say:** what the plugin-level runtime is. Either it gets a small `PluginModel` with its own `update` (settings file, windows, protocol actions), or plugin lifecycle is explicitly host code that may call services. In both cases any write it makes to the tasks file or the device stores goes through the plugin-wide sequence (see M17), so "a read knows the last write before it" holds for these writes too.

#### M10. Leaving needs the node to outlive its model entry

**Rows (47):** B1.2-3, B1.5, B1.8, B1.10, B1.12, B2.6, B2.17-19, B2.22-23, B2.26-27, B2.29, B3.14-16, B3.18, A.2.93, A.2.315, A.2.326, A.2.393-403, A.2.470, A.2.553, B.2.99, B.2.113-114, B.5.112-113, B.6.37, B.6.105, B.6.112-113, B.6.154, B.6.173-174

Exit motions run on something that is no longer in the data:
- a row folds after its task is gone (2 × `collapse`, B1.2);
- a timeline block fades out;
- a menu, sheet or search fades and falls after it closes;
- the desktop bar fades out.

B1.5 revives a leaving row whose key comes back. In `view(model)` a removed key unmounts at once, and the spec does not say where leaving things live.

**The spec must say:** *leaving is state.* A removed keyed thing stays in the model as `leaving` with its transition number until `motionSettled`. The view still draws it, inert (no presses), and it revives if its key returns. Overlays get the same rule: `phase: closing` until settled. Every closing wait is bounded (M16).

#### M12. Continuous gesture values that change structure

**Rows (12):** A4.12-13, A8.1, A8.3-4, B3.12, A.2.256, A.2.261, A.2.264-265, B.3.108, B.3.111

Decision 8 sends frame-rate positions from `input` to `motion` only. That covers transforms, but some continuous values change *what is drawn*:
- a pinch changes the hour height, and with it which minor lines and labels exist (`Timeline.minor` and `grid`, `gridAt`), laid out once per frame (B3.12);
- a divider drag makes the lists "give way live" (A8.4), which rewraps card titles, which changes the row stops.

Through the transient channel these never reach the view. Through `update` they re-render at pointer rate, which the render-counter test forbids.

**The spec must say:** continuous values ride the transient channel as CSS variables. Anything structural derived from them is a selector over a *quantised* value, dispatched only when the quantum changes: grid level, a whole pixel of width at most once per frame. The render budget allows those dispatches.

#### M13. Geometry is more than sizes: placements in the window

**Rows (56):** A6.1-5, A6.7, A6.9, A6.11-13, C1.4, C2.4, C3.1-18, C4.3, C5.2, C5.4-10, C5.12, C6.1-2, A.2.150-157, A.2.288, A.2.448-452

P3 lists what only the browser knows: text heights, the stage size, the keyboard, the toolbar. The `measure` driver observes boxes with `ResizeObserver`, which reports sizes and not positions, and the guard bans `getBoundingClientRect` outside it. But every hit test reads where things are on screen *now*, after scrolling and layout:
- lists and titles (`ListDrop.ts:151-152, 457`);
- tree rows (`ProjectDrops.ts:17-77`);
- the plus ring, the timeline canvas;
- menu anchors and the window room for placement (`MenuPanel.ts:240-314`, `LiftedMenu.ts:80-88`);
- the zoom anchor;
- the bar beside the field.

Flights need the real box of the landing card (A6.10). `Motion.ts` reads the boxes it animates (C2.4). Computing all of this from the model would need every token, the stage's origin in the window, and every scroll offset.

**The spec must say:** browser-known geometry has three parts:
- **sizes**, observed;
- **placements in the window**, snapshotted by `measure` when a gesture starts, an overlay opens or a transition starts, and after each scroll step a machine needs;
- **scroll offsets** (M14).

`motion` may read the boxes of the nodes it animates when a transition starts (FLIP), driver-local and never sent as a message. The guard must allow that read in `motion`.

#### M14. Scroll is state the spec does not hold

**Rows (45):** A2.1, A4.14, A6.6, B3.6, B3.26, C1.4, C2.1, C2.6-9, C4.4-5, C5.1, D1.14, A.2.269-270, A.2.278-287, A.2.290, A.2.293-296, B.3.56-58, B.4.70, B.6.79, B.6.119, B.6.149, B.6.153, B.6.156-158, B.6.175-176

`scroll` takes `reveal`, `toHour`, `keep` and `edge`, and reports only `userScrolled`. The app also needs these, which the spec does not cover:
- **Positions that outlive their DOM:**
  - the timeline keeps its scroll across a layout remount (D1.14, `CS:583-590`);
  - the peek opens at the shown list's scroll (`CS:739`, `DayPeek.ts:117`);
  - by-project keeps its scroll for the same node and resets for another (`ProjectTasks.ts:174-175`);
  - the tree keeps its scroll.
- **An anchor held through resizes until touched** (B3.26, A4.14).
- **"Scrolled"** as an event: the menu opens only after the column has scrolled the card into view, and is cancelled if a finger takes the column (B3.6, A2.1).
- **Scroll offsets as an input to the carry,** since auto-scroll re-previews the target after each step.
- **Edge fades** written as classes and variables on the scroller (`ScrollEdges.ts:30-43`), which the guards give to `chrome` and `motion`.

**The spec must say:** `scroll` owns positions keyed by stable scroller ids (`timeline`, `list:<column>`, `tree`, `projects:<node>`):
- orders: `keep`, `reset`, `copy(from)`, `anchor(minute, fraction)` held until `userScrolled`, `reveal(key)`, `edge`;
- reports: `userScrolled`, `scrollSettled(order)`, offsets for the scrollers an active machine subscribes to, and edge booleans only when they flip;
- it writes its own fade outputs.

#### M16. Waits with no bound

**Rows (15):** A7.18, B3.1, B3.13, B3.15, A.2.177, A.2.179, A.2.221, A.2.234, A.2.407, B.3.53, B.6.80-81, B.6.86, B.6.113-114

Today every wait has a safety net:
- a landed day waits at most 1000 ms (`CS:717`);
- a pick is released after 2000 ms (`Panel.ts:41`);
- flights end by timer at `fly` + 20 ms (`FloatingCard.ts:130`);
- the pager has a +100 ms safety timer;
- overlay parts are removed after `collapse` by timer.

The spec makes machines wait for `motionSettled` and for the read with a given number, with no bound. A WAAPI animation in a hidden tab or popout, or one that gets cancelled, may never report, and the machine would hold the screen for ever.

**The spec must say:** every wait is bounded. `motionSettled` is guaranteed on finish, cancel, removal, or at a deadline of duration + slack. A wait for a read has a deadline after which the machine ends with what it holds.

#### M17. Stores other than the tasks file

**Rows (20):** A.2.498-500, B.1.54, B.1.72, B.1.120, B.2.136-141, B.3.107, B.3.110, B.4.154, B.5.78, B.5.92, B.6.3, B.6.47-48

P2's sequence covers "file work". Device view settings (`listShare`, `zoom`, `treeWidth`) are written to `data.json` through `ViewSettingsFile` (guard: none), and their change event also fires for Sync and for our own write. A release that writes the share, followed by an older echo, would snap the divider back. The device place, view and panel go through `TaskService` (`setFunnelPlace` and others). The spec does not say whether they share the tasks file's sequence.

**The spec must say:** every persisted store is a lane with numbered writes: the tasks file, the device view settings, the device funnel state, the shared settings. A change event carries the store's version and is dropped if it is older than the last write in flight.

#### M18. The network lane as written needs a contract the core does not have

**Rows (13):** A.2.98, A.2.101, B.1.35, B.1.44-47, B.1.52, B.2.1-3, B.3.83-84

"Latest wins, cancelled through `AbortController`." But `CalendarService.events()` and `DayEventsAsk.fresh` take no signal (`contracts.ts:1868-1880`). Polling is driven by the core: `keepFresh` calls the screen's `refresh()`. The shown day and the peek's day fetch at the same time (`DayPeek.ts:107-109`), so a single "latest wins" would drop one of them.

**The spec must say:** the lane is keyed by day, and stale answers per key are dropped. Cancellation exists only if step 0 adds an `AbortSignal` to the contract. The core's poll enters as a runtime input.

#### M20. Where gesture recognition lives

**Rows (31):** A2.11-15, A7.1-5, A7.11, A16.5-6, A.2.187-191, A.2.223-230, A.2.542, B.3.60-61, B.6.84-85

Decision 8 lets only discrete steps dispatch. The rules that turn samples into steps then have no home in `update`:
- the 8 px tolerance and long-press timer;
- the sideways-first axis lock;
- the trackpad stream (a 60 px sweep in 100 ms, a glide of 4 shrinking moves, 150 ms gaps, `Swipe.ts:122-176`);
- the careful pace (0.08 px/ms for 100 ms);
- the wheel-zoom settle.

In `input`, an imperative driver, they cannot be tested the way `update` is, and the machines' rules end up split across two places.

**The spec must say:** add a pure `recognizers/` layer of per-event reducers over pointer and wheel samples. `input` runs them synchronously (so it can `preventDefault` synchronously), they are unit-tested like `update`, and their outputs are the discrete messages. Machines never see raw samples.

#### M21. Step 1's list of service callers is short

**Rows (18):** B.2.1-6, B.2.161, B.2.164, B.2.224-228, B.3.82-84, B.4.104, B.4.162

Step 1 names `CalendarScreen`, `QuickEntryController`, menus, the full card and `main.ts`. Other files also call services directly:
- `DayData` (the reads themselves);
- `DayPeek` (`dayView`, `events`);
- `CarryReport` (`carryAt`);
- `ProjectBlocks` (`onChange`, `projectNoteView`);
- `BottomCapsule` (`UndoService`);
- `viewSettings`;
- `SearchWindow` (`search`);
- `GroupNameField` (`SectionNameEntry`);
- the Settings tab (M1).

After step 1, the guard covers all of `obsidian/ui`.

**The spec must say:** step 1 is defined by the guard (every import of a service interface outside `effects/`, counted by the freeze), not by a list of files.

#### M22. Where the dropped card is before its read lands

**Rows (9):** A6.10, A6.14, B2.14-16, B3.13, A.2.185-186, B.3.59

Today, in lists and on the timeline, the copy waits where it was let go, the write lands, and then the copy flies to where the card *really* is, with the card hidden until it lands (A6.10). In by-project the landing card is drawn at the line before the read (A6.14). P2's "the dropped card stays where it landed" can be read either way. If the held card is drawn at the computed place at once and the core puts it elsewhere, there is a second movement with no stated cause.

**The spec must say:** per target, what the held outcome is: the copy at the release point (lists, timeline) or the card at the line (by-project). Say that the flight is the transition of the read with the drop's write number, so it goes to the real place.

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

| Category | Items | Distinct rows |
|---|---|---|
| No mechanism owns it | 2 (M1, M23) | 88 |
| The principles would change what the user sees | 5 (M7, M8, M11, M15, M19) | 113 |
| Two principles conflict | 5 (M3, M4, M5, M6, M9) | 219 |
| Too vague to build without guessing | 11 (M2, M10, M12, M13, M14, M16, M17, M18, M20, M21, M22) | 280 |
| **Any category (a row counted once)** | **23** | **688** |
| Rows that fit as mapped | | 1344 |
