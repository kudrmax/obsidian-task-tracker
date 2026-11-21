# The core against the engine: audit and sources of truth

Plan `docs/superpowers/plans/2026-11-21-to-release.md`, step 4; spec `docs/superpowers/specs/2026-11-18-ui-engine.md`,
Part 2 point 2 and Decision 129. What each `core/application` module is to the engine, which rule has two copies and
which copy is the one, and what the core added for the engine's port (step 5).

Read on `origin/master` merged into `ui-trackpad` (the tree `ui-engine` was cut from in step 0, which merged it). `core/application`: 94 modules; `core/domain`: 31.

How «uses» was read:

- **app**: `core/phone/main.ts` → `PhoneDoor` → `PhoneCalls` (its import closure), and the names the Swift code calls
  (`"rules.X"`, `"tasks.X"`, `"entry." + method`, `"calendars.*"`, `"history.*"`, `"boundary.*"`, `"repeatPage.end"`,
  `"description.*"`, `"notes.*"`, `"capture.*"`, `"reminders.*"`, `"timeline.zoomLevels"`; grep over `apple/**/*.swift`
  without tests). «door» = exposed by the door, no Swift caller.
- **agent**: `agent/` (origin/master) runs `composeCore` and calls `core.agent` (`AgentReads`), which calls
  `tasks.{screen, columnView, find, openTasks, placeOf, projectHistory, projectNodeNamed, projectsScreen, ridesNow,
  search, storedLine, listName, priorityLevels, labelLevels}`, `days.*`, `calendars.{events, isPast}`, `assistant.page`,
  `cardDue`, `repeatSentence`, `labelTitle`; `agent/nodePorts.ts` uses `EventSource`, `calendarFile`; `tests/agent/*`
  compare its answers to the plugin's screen.
- **engine copy**: a rule the engine (`obsidian/ui/engine` on ui-trackpad) holds of its own; pairs in «Engine copies».

Every domain module (31) is in the door's import closure (the app parses and writes the file through them): all KEEP,
none serves the old screen only. Not listed one by one.

## core/application

| module | verdict | port method / engine owner | app uses | agent uses | note |
|---|---|---|---|---|---|
| CalendarPolling | KEEP | `subscribe` (host polls via `CalendarService.keepFresh`) | no (host polls) | no | plugin host only |
| CalendarServiceImpl | KEEP | `read` (`day.events`, `day.allDay`, `past`), `subscribe` | no (door has `calendars.*` over files) | yes | |
| DayServiceImpl | KEEP | `read` (`title`, `isToday`, `opensAt` = `openAt`), `now`, `clockAt`, `subscribe` (`onDayChange`) | yes (`days.*`, `dayOpening`) | yes | |
| DescriptionDraft | KEEP | part 2.5 Notes page (not in ScreenPort yet) | yes (`description.*`) | no | |
| EventSource | KEEP | infrastructure ports | yes | yes (nodePorts) | |
| GoogleAccountService | KEEP | settings tab, not the port | no | no | |
| PhoneCalls | KEEP | the door | yes | no | |
| PhoneDoor | KEEP | the door | yes | yes (`SETTINGS_FILE`) | |
| QuickEntry | KEEP | `newTaskPlace` (plusSpot), `listEnd` (endOf), `subtaskPlace` (subtaskSpot), `entryBar` (`EntryState.bar`, levels, projects, place), `entryPlace` (`choosePlace`), `entryDescription` (`openDescription`), `rename` (`renameSpot`/`open`), `commit` (`enter`/`blur` + jobs) | yes (`entry.*`) | no | its `EntryDrawing` (where the field is drawn) is the engine's; the rules (levels, indent, where a task goes) stay |
| QuickEntrySession | KEEP | same as QuickEntry, the plugin's session wrapper | no (app holds the session itself) | no | |
| RepeatPage | KEEP | part 2.5 repeat panel | yes (`repeatPage.end`) | no | |
| ScreenSettingsImpl | KEEP | host settings: card height/gap, zoom levels, levels, labels → `read`, `entryBar`, `menu` | yes (`screenSettings.get`) | yes | engine reads `DESIGN` constants today (see Rules that change) |
| SectionNameEntry | KEEP | part 2.5 section rename field | door | no | |
| SettingsServiceImpl | KEEP | settings tab | yes (`settings.*`) | no | |
| TaskIdentity | KEEP | `CardFace.id`, every id the port answers | yes | yes | |
| TaskReads | KEEP | `read`, `preview`, `menu` | yes | yes | merge conflict here (imports of menus/sections/taskPlaces) |
| TaskReminders | KEEP | `act` reminder; app's reminder sync | yes (`reminders.*`) | no | |
| TaskRules | KEEP | every write | yes | yes | |
| TaskServiceImpl | KEEP | the service CorePort wraps | no (door uses Reads/Writes) | yes | |
| TaskWrites | KEEP | `move`, `act`, `commit` | yes | yes (compiled) | |
| TimelineSpans | KEEP | `read` (`Block.start` riding now), `stretched` (`stretch`), `resized` (gap G3) | yes (`tasks.stretch`, `tasks.resize`, `shownSpan`) | yes (`ridesNow`) | MockPort copies it faithfully |
| UndoHistory | KEEP | part 2.5 Undo (bottom row, keys) | no (door: UndoSteps) | no | |
| UndoSteps | KEEP | same | yes (`history.*`) | no | |
| agent/AgentReads | KEEP | not the port | no | yes | |
| agent/agentWire | KEEP | not the port | no | yes | |
| assistant/* (17 modules: AssistantServiceImpl, ModelChoice, actions/{action, bestTask, index}, briefing, model, models/{claude, index, profile}, options/{answerLabel, labelChoices, option, skipLabel}, outcomes, scope, tasks) | KEEP | part 2.5 assistant (bottom row) | model, scope, tasks: yes (in door closure); the rest no | `page` only | |
| calendarChoice | KEEP | `read` (shown calendars) | yes | yes | |
| calendarDay | KEEP | `read` (day's events, `NO_DAY_EVENTS`) | yes | yes | |
| calendarDays | KEEP | same | yes | yes | |
| calendarFile | KEEP | infrastructure, sources | yes | yes | |
| calendarMigration | KEEP | settings | yes | yes | |
| captureTitle | KEEP | not the port (app's capture) | yes (`capture.*`) | no | |
| cardDue | KEEP | `read` (`CardFace.due`; `repeats` not drawn yet) | yes | yes | |
| composeCore | KEEP | CorePort's composition | no | yes | |
| contracts | KEEP | everything; changes additive only | yes | yes | `tests/architecture.test.ts` guards its re-exports |
| dayLabels | KEEP | `read` (`day.title` = `dayTitle`, due corner = `dueLabel`) | yes (`dayTitle`, `dueLabel`) | yes | |
| dayWords | KEEP | DayService | yes | yes | |
| documentText | KEEP | reading the file | yes | yes | |
| drops | KEEP | `takes` (`acceptsDrop`, `placesInGap`; gap G2), `move` (`dropMove(s)`) | yes (`placesInGap`, `tasks.drop`) | no | |
| eventLevels | REPLACED | `engine/layout/calendar.ts` `layEvents` (Decisions 52–54 lanes) | yes (`rules.eventLevels`) | no | engine's rule is newer than the app's (pair E5) |
| firstStepTyping | KEEP | part 2.5 First step (the screen while its field is open) | yes | no | |
| fullTree | KEEP | part 2.5 full-screen task | yes (`tasks.fullTree`) | no | |
| googleLogin | KEEP | settings | yes | no | |
| landing | REPLACED | `engine/drag` (the copy flies into dnd-kit's measure of its place, Decision 26/121); CorePort's `preview` takes only `dropPreview().screen` | yes (`tasks.landing`, 13 call sites) | no | |
| listDrop | REPLACED | `engine/drag/tree.ts` (`SwipeLevel`, `levelAt`, `levelBetween`, Decision 22) and dnd-kit's sortable | yes (`levelAt`, `carriedMiddle`, `placeAt`, `branchOf`, `gapBranch`) | no | pointer → gap geometry |
| listWidth | REPLACED | `engine/layout` (columns, the divider of E2) | yes (`listWidths`, `listShareOf`, `dividerAt`) | no | `allColumns*` door-only; `LIST_WIDTHS`, `DIVIDER_SNAP` are bounds the engine's divider should take from the core (pair E8) |
| marks | KEEP | `read` (`CardFace.color`), `menu` (levels, labels) | yes (`MOST_CARD_COLORS`) | yes | |
| menus | KEEP | `menu` (`TaskService.menu` → `TaskMenuModel`), `act` (`tileStatus`, `statusTasks`) | yes (`canPick`, `tasks.menu`, `tasks.bulkMenu`) | no | `listCardMenuFrom` not in contracts (gap G4) |
| nesting | KEEP | `move`/`takes`/`preview` (`placeOfGap`, `fitLevel`, `levelRange`: which depth a place allows) | yes (`gapAt`, `sameGap`, `placeOfDrop`, `groupPlaceOf`) | no | `gapAt` (index+level from the gesture) is the engine's drag; the level bounds stay |
| newTaskPlaces | KEEP | used inside `projectsEntry` | door (`sameNewPlace`) | no | |
| notes | KEEP | part 2.5 `[[` suggestions in the field | yes (`notes.*`) | no | |
| paints | KEEP | `read` (`EventPaint` from `eventColors`/`bgAlphaFor`, past paint) | yes | no | `obsidian/ui/eventColors.ts` already re-exports these; MockPort reaches them through it |
| placeChoices | KEEP | `entryBar` (`places`, `where`), `menu` (`places`) | yes (via QuickEntry, menus) | no | ui-trackpad only |
| ports | KEEP | CorePort's composition | yes | yes | |
| projectFilter | KEEP | `read` with a filter (part 2.5 projects) | yes | yes | |
| projects | KEEP | `entryBar` (`projects` tree), `menu` (Project page) | yes | yes | |
| projectsCarry | KEEP | part 2.5 projects panel during a drag (`startCarry`, `carryAt`, `endCarry`) | yes (`tasks.carryAt`…, `endsSelection`) | no | its hover timing becomes the engine drag owner's when F146 is built; the panel state stays |
| projectsDrop | KEEP | `takes` (`projectsTakes`, `projectsPlusTakes`), `move` (`projectsDropSteps`) in project mode | yes (`projectsTakes`, `projectsPlusPlace`) | no | |
| projectsEntry | KEEP | QuickEntry in the Projects list | yes (`projectsEntryLook`) | no | |
| projectsLift | KEEP | `move` (`originOf`: a task's `DropFrom`) | yes (via projectsDrop) | no | `originOf` not in contracts (gap G4) |
| projectsScreen | KEEP | part 2.5 projects panel, tree, filter, By project | yes | yes | `projectsGap/Levels/Drop`, `PROJECTS_INDENT`, `PROJECTS_HOVER_MS` are tree-drag geometry the engine's drag owner replaces for the plugin |
| readingSettings | KEEP | inside TaskServiceImpl | no | yes (compiled) | |
| repeatWords | KEEP | `menu` (Repeat row), part 2.5 repeat panel | yes (`onTheDay`) | yes (`repeatSentence`) | |
| screenPlaces | KEEP | ribbon stops (`stepFunnel`, `funnelPlaceOf`, `SHOWN_LISTS`); `EntryList` for QuickEntry | yes (`funnelPlaceShowing`, `swipeLanding`, `days.stepFunnel`) | no | `swipeLanding`/`SWIPE_FLICK_SPEED` has an engine copy (pair E1) |
| sections | KEEP | `read` (rows, headers, empty sections via `columnView`/`listView`) | yes (via `tasks.columnView`) | yes (`columnView`) | |
| shownCalendars | KEEP | `read` | yes | yes | |
| snapGrid | REPLACED | `engine/layout/timeScale.ts` `TimeScale.step`/`snap` | yes (`tasks.snap`) | no | same steps [5, 15, 30, 60] (pair E3) |
| sourceWords | KEEP | part 2.5 calendar sources popover | yes | yes | |
| stackedRows | REPLACED | `engine/layout` (CSS of the rows view, part 2.5) | yes (`stackedLists`) | no | `stackedRows` door-only |
| taskActions | KEEP | `menu` (`layout`), `entryBar` (`bar`) | yes (via menus, QuickEntry) | no | ui-trackpad only; the stand's `actionTable.generated.ts` is its copy (gap G7) |
| taskItems | KEEP | `read` (`CardFace`), `menu` | yes | yes | |
| taskKeys | KEEP | identity inside the core | yes (internal) | yes | `samePlace`, `sameLine`, `sameTaskTree`, `keyId` door-only |
| taskPlaces | KEEP | reveal after search (part 2.5) | yes (internal) | yes (`placeOf`) | |
| timelineStack | REPLACED | `engine/layout/calendar.ts` `layTasks` (Decision 28) | yes (`stackTasks`, `overlayLeft`, `stackCorner`) | no | its words `timeParts`/`durationParts` stay: CorePort writes `Block.startParts`/`lengthParts` with them (pair E4) |
| timelineZoom | KEEP | zoom bounds from the settings (`parseZoomLevels`, `levelsFor`, `zoomShown`, `zoomAfterPinch`) → host/port | yes (`gridAt`, `gridMarks`, `zoomAfterPinch`, `zoomShown`, `levelsFor`, `labelHidesNearNow`) | no | grid geometry (`gridAt`, `gridMarks`, `labelHidesNearNow`) has the engine's `TimeScale.marks`/`NEAR_NOW` (pairs E2, E6) |
| viewLayout | DEAD | replaced by `engine/layout` (columns, `place`) | no (door only) | no | no caller after the old UI goes; the door promises its names (`rules.viewLayout`, `layoutWidths`, `layoutShareAt`), so it is removed only when the lead lifts that promise |
| viewModes | KEEP | `read` (the context key of Principle 3: `viewContext`), part 2.5 view modes (`VIEW_WORDS`, `ROW_LISTS`, `viewEntryLists`) | yes (`viewEntryLists`) | no | |
| wholeCard | REPLACED | `engine/layers` (the copy at `max-content`, Decision 72) | yes (`wholeWidth`, `grownStart`) | no | |

Counts: KEEP 85, REPLACED 8 (eventLevels, landing, listDrop, listWidth, snapGrid, stackedRows, timelineStack,
wholeCard), DEAD 1 (viewLayout). Every REPLACED module is used by the iPhone app: none leaves the core. The agent uses
none of the REPLACED or DEAD ones.

Door-only functions with no caller after the switch (inside KEEP/REPLACED modules; kept by the door's promise):
`allColumnsWidths`, `allColumnsShare`, `allColumnsDividerAt`, `allColumnsWidthAt`, `stackedRows`, `viewLayout`,
`layoutWidths`, `layoutShareAt`, `samePlace`, `sameLine`, `sameTaskTree`, `keyId`, `sameNewPlace`, `dayMonth`,
`levelRange`/`fitLevel`/`shiftLevel`/`placeOfGap`/`gapOfPlace` (CorePort will call these), `acceptsDrop` (gap G2 wraps it).

## Engine copies of a core rule the app or the agent uses

The source of truth (Decision 129): a rule in **minutes, days or product terms** lives in the core and reaches the engine
through the port; **pixel layout** stays the engine's (the owners table), the core's copy serves the iPhone app until
the app moves to the engine's look, and where the app keeps its own copy one parity test feeds both the same inputs so
they stay one rule (step 5 writes it, beside `CorePort`).

| # | engine | core (who uses it) | differs? | source of truth, served how |
|---|---|---|---|---|
| E1 | `gestures/swipeStep.ts` `swipeStep`, `followPager.ts` `FLICK_SPEED = 0.3` | `screenPlaces.swipeLanding`, `SWIPE_FLICK_SPEED = 0.3` (app; Max's twice-asked rule, `tests/application/swipeLanding.test.ts`) | yes: `swipeStep` takes a flick against the drawn way and with `moved = 0` as a step; `swipeLanding` answers 0 for both. `FollowPager` matches the core (flick only with the drawn way) | core's `swipeLanding`. The landing is a decision (one stop, which way): the port answers it (`ScreenPort.landing(moved, distance, speed)` over `rules.swipeLanding`); `swipeStep` goes. The trackpad module's own thresholds stay the engine's (frozen, Max) |
| E2 | `layout/timeScale.ts` `TimeScale.marks()`, `NEAR_NOW` | `timelineZoom.gridAt`, `gridMarks`, `labelHidesNearNow` (app) | same design measures, own code (Decision 12 kept them apart) | pixel layout: engine; cross-check test |
| E3 | `TimeScale.step`/`snap`/`start` | `snapGrid.snapStep`/`snapMinute`, `TaskService.snap` (app) | same steps; `start` also holds a step before the day's end (core: `DayBoundary.clamp`) | core: the minute a gesture lands on is written to the file; port `snap(minute, hourPx, tolerance)` over `TaskService.snap` |
| E4 | `layout/calendar.ts` `layTasks`, `stackEnd`, shades (D60) | `timelineStack.stackTasks`, `overlayLeft`, `stackCorner` (app) | same stack rule (Decision 28 carried it); shades are the engine's only | pixel layout: engine; cross-check test on the shared part |
| E5 | `layout/calendar.ts` `layEvents` (lanes, D52–54, D57) | `eventLevels`, `timelineStack.eventLeft` (app: shifted right, overlapping) | yes, on purpose (Max, 2026-11-19) | engine for the plugin; the app keeps the old look until its design task (spec: carried later); recorded as a parity gap of the app |
| E6 | `gestures/Zoom.ts` `zoomAfterPinch`, `hourOf`; stand's `ZOOM_MOST = 224` | `timelineZoom.zoomAfterPinch`, `zoomShown`, `levelsFor` over the settings' «Zoom levels» (app, settings tab) | yes: the engine ignores the setting (largest hour fixed at 224, whole day at its fit) | core: the bounds come from the settings; the host passes `levelsFor(...)`'s ends (`ScreenHost.zoomMost/zoomLeast`) and the pinch's end asks `zoomAfterPinch` through the port |
| E7 | `drag/tree.ts` `levelAt`, `levelBetween` (no deeper than the task above + 1) | `nesting.fitLevel`, `levelRange` (in `placeOfDrop`), `listDrop.levelAt` (app) | gesture differs (swipes, D22, Max); the bounds are the same rule | gesture: engine; the bounds: core — `preview`/`move` clamp through `fitLevel`, so the engine's clamp is drawing only |
| E8 | `layout/columns.ts` (`STRIP`, `SHOWN`, equal halves) | `viewLayout` (`half` at Inbox/Soon), `listWidth` (`LIST_WIDTHS`, `DIVIDER_SNAP`, `dividerAt`) (app: `listWidths`, `dividerAt`; `RibbonColumns`) | the divider is not built yet (E2) | layout: engine; the divider's bounds and snap stops are product numbers: core (`LIST_WIDTHS`, `DIVIDER_SNAP`, `dividerAt`) through the port when the divider is built; Max's «Inbox and Soon split in half» needs the engine's own test naming him (spec) |
| E9 | `drag` fly-in at dnd-kit's measure | `landing.landingOf`, `TaskService.landing` (app) | different mechanism, same meaning | engine |
| E10 | stand `actionTable.generated.ts` | `taskActions.TASK_ACTIONS` | generated copy | core; CorePort reads `TaskService.menu`/`EntryState.bar`, the stand's copy stays the stand's |
| E11 | `layout/month.ts` (month grid, title) | none in core (old UI: `obsidian/ui/dates.ts`) | — | engine (drawing); the week's first day is a product rule, today Monday in both |
| E12 | MockPort `titleOf`, `clockOf`, `lengthParts`, `startParts` | `dayTitle`, `timeParts`, `durationParts` (app) | `dayTitle` adds the year for another year | core, through CorePort's `read` |

`PhoneCalls.ts` holds no rule of its own: it maps door names to the modules above.

## What the core serves the port now (Decision 129)

Added on `ui-engine-core`, every one additive: `contracts.ts` only gains, the door keeps its names and results, each new
call is in `docs/door.md`, and `DOOR_COVERAGE` names the host's.

- **G1. One held read.** `TaskService.reader(filter?: ProjectsNodeId | null): Promise<ScreenReader>`: the file tidied,
  read once, and a pure object over that read (`core/application/SnapshotReader.ts`) answering at once:
  `screen(date)`, `columnView(column, date)`, `item(id)`, `dropPreview(tasks, to, day)`, `takes(origins, to)`,
  `menu(id, from, day)`, `stretch(id, day, edge, minute)`, `resizedSlot(id, day, edge, minute, minDurationMin)`. Each
  is the service's own answer over that read (a test compares them one by one); a screen and the tasks by id are read
  once per reader. `CorePort` takes a new reader when `onChange` fires. By id, because the port names cards by id: the
  menu builds its `MenuScreen` from the screen of `day` itself. The door does not offer it (each door call is one read
  already): `DOOR_COVERAGE.ScreenReader` and `HOST_TASK_METHODS` say so.
- **G2. Refusals.** `TaskService.takes(origins: readonly DropOrigin[], to: DropTo): Promise<boolean>` (door
  `tasks.takes`, on the reader too) and `TaskService.opensGaps(origins, column, day): boolean` (door `tasks.opensGaps`):
  what the old UI composed from `acceptsDrop` and `placesInGap`. Origins, not `DroppedTask`s: the plus carries a task
  that has no key yet (`"new"`), and refusal goes by where the cards come from alone. No `day` and no filter: neither
  changes what a place takes (the day's list takes everything on every day; a group or a title carries its own date).
  The target of a `DropTo` is `drops.dropTarget`: a section of Now, or of Soon on a later day, is the day's list; a place
  under a task the column that task is dragged from (`originOf`), none under a closed one.
- **G3. A resize without writing.** `TaskService.resizedSlot(item, day, edge, minute, minDurationMin): Slot | null`
  (door `tasks.resizedSlot`): `TimelineSpans.resized`, the slot `resize` writes.
- **G4. A card's origin and menu place.** `originOf` and `listCardMenuFrom` re-exported from `contracts.ts`
  (`tests/architecture.test.ts`'s list grows by both), door `rules.originOf`, `rules.listCardMenuFrom`.
- **G5. Clock words.** `DayService.clockAt(minute): string` (`clock` is the services' clock port already) and
  `DayService.hourLabels(): readonly string[]`, door `days.clockAt`, `days.hourLabels`, by the hour the day starts at.
- **G6. Zoom bounds:** nothing new; `ScreenSettings.zoomLevels`, `levelsFor`, `zoomAfterPinch`, `zoomShown` serve it.
- **G7.** Engine-side (the port's types are poorer than the core's answer): a card's colours and `labelPaint`, the
  repeat mark, labels and repeat in the field, the card's height and gap from the settings. Step 5's.

The engine rules of E1, E3, E6, E7, E8 reach `CorePort` through `contracts.ts` as they are, behaviour unchanged:
`swipeLanding`, `SWIPE_FLICK_SPEED` (E1), `TaskService.snap`, `dropSpan` (E3), `ScreenSettings.zoomLevels`,
`levelsFor`, `zoomAfterPinch`, `zoomShown` (E6), `fitLevel`, `levelRange`, `placeOfGap` (E7), `LIST_WIDTHS`,
`DIVIDER_SNAP`, `listWidths`, `dividerAt` (E8). `tests/architecture.test.ts` keeps them in the contract.

## Rules that change (MockPort invented them; the core's rule wins)

1. **Places that refuse** (`drops.acceptsDrop`; `docs/plugin/tasks.md` «Перетаскивание»; F161). MockPort takes every
   drop. With the core: Inbox and Backlog refuse a task from the day's list or the calendar (only undated tasks from
   Inbox, Backlog, Soon or the plus); Soon refuses a task from the calendar; the calendar refuses more than one task.
   The card flies back and nothing is written. Decision 27's «Soon takes a timed task, the time erased» disagrees with
   the core and with F161; the core wins, and Decision 129 corrects 27.
2. **A list without sections places a task from elsewhere at its end** (`placesInGap`): today only a past day's list;
   no place opens between its cards for a card from another list.
3. **Moving to another day by dragging** is not a drop the core offers (F160, «только меню»); a `Destination.dayOffset`
   other than the screen's day is read on the screen's day.
4. **Folded card, status tiles from a list** (`menus.statusTask`): Done, In progress, Won't do on a folded card in a list
   write its shown step, as on the calendar. MockPort writes the task itself from a list.
5. **Stop** is «stop repeating» (`TaskService.stop`), offered only on a repeating task; MockPort writes «todo».
   **Done on a repeating task** writes the next copy (one Undo step); MockPort only marks it.
6. **Pick a date's list tiles** (`sendTo`): Now keeps a task's time; a subtask or the place it already has writes
   nothing. MockPort drops the time always and moves a subtask out.
7. **The subtask count** leaves out given-up subtasks (`progressOf`); MockPort counts them.
8. **Levels and labels** are the settings' (any number of levels, their colours, a typed prefix of any of them; labels
   offered, a task with a priority takes no label and back). MockPort knows p1 and p2 and no labels.
9. **A place picked on the field's bar** (`QuickEntry.choosePlace`): the field goes to the end of that place's list and
   the screen opens the day it names; MockPort keeps the field where it stood (`away`) when that list is not in reach.
10. **Day titles** of another year carry the year («Mon, 3 Nov 2027»).
11. **Zoom** follows the «Zoom levels» setting (largest hour and the steps), not the stand's 224 (pair E6); **card
    height and gap** follow the settings.
12. **The swipe landing** (pair E1): a flick against the way the finger drew, or no move at all, lands nowhere, as the
    core's guarded `swipeLanding` says; `swipeStep` lands a stop in that case.
13. **Event lanes** (pair E5) stay the engine's in the plugin; the iPhone app keeps the old shifted look until its own
    design task: a known difference between the two, recorded, not fixed here.

Same as the core already (checked, no change): moves between Inbox/Backlog/Soon/the day/the calendar of the docs' table,
a timed task keeping its place in the file, riding the now line, stretch and resize (`TimelineSpans`), Remove due date's
offer, the default reminder (live), the plus's place, Pick a date's put-off (time erased, end of Now or Soon), closed
tasks leaving the lists, the new section splitting a group.

## Risks for the next steps

- **The engine imports old-UI files** that step 6 must not trash: `obsidian/ui/design.ts` (`DESIGN`, `LAYOUT`,
  `PROPERTY`: 9 engine files) and `obsidian/ui/markdown/EmbeddedEditor` (`ObsidianEditor`); MockPort imports
  `obsidian/ui/eventColors.ts`. Move them under the engine (or keep them) before the old UI goes.
- **The held read** (G1) is what keeps a drag within the frame budget: `CorePort` must never call the door over the
  file's text per frame, nor a `Promise` read while a finger moves.
- **Decision 27** contradicted the core on Soon (rule 1; corrected by 129): its scenarios (`e1`/`e3` checks that drop a
  block into Soon or Inbox) fail on `CorePort` until they expect the refusal.
