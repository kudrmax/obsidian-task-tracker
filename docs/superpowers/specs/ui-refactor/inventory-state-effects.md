# UI refactor inventory: state and effects

An inventory, not a review: every piece of mutable state the Obsidian UI holds, and every call it makes to the core or to Obsidian, as the code stands on branch `ui-refactor` at `0b18fa6c` (2026-11-15). No recommendations. Companion to `../2026-11-15-ui-refactor.md`.

**Scope.** Every file under `obsidian/ui/` (144 files, 18,046 lines, including the Preact prototype in `obsidian/ui/next/`, tagged "(prototype)"), `obsidian/main.ts`, `obsidian/compose.ts`, and the contracts they call in `core/application/contracts.ts` (`TaskService` :1217, `DayService` :1709, `UndoService` :1739, `CalendarService` :1868, `CalendarPoll` :1894, `ScreenSettingsStore` :1947, `SettingsService` :2008). `obsidian/infrastructure/` is out of scope except where `main.ts`/`compose.ts` wire it.

**Abbreviations.** Paths are under `obsidian/ui/` unless they start with `core/`, `main.ts` or `compose.ts`. `CS` = `CalendarScreen.ts`. `QEC` = `quick/QuickEntryController.ts`. `QES` = `core/application/QuickEntrySession.ts`. `BC` = `BulkController.ts`.

**File groups.** Each row carries the group it came from (`grp`):

| grp | files |
|---|---|
| G0 | `CalendarScreen.ts`, `main.ts`, `compose.ts` |
| G1 | `DayData.ts`, `ScreenParts.ts`, `Reload.ts`, `quick/*`, `EntryRows.ts`, `Keyboard.ts`, `settingsEffect.ts`, `viewSettings.ts`, `TaskCalendarView.ts`, `ViewWatch.ts`, `ProjectBlocks.ts`, `SettingsTab.ts`, `SettingsPage.ts`, `BottomCapsule.ts`, `StatusBarRoom.ts`, `windowDocuments.ts`, `cardSize.ts`, `priorityColors.ts`, `haptics.ts`, `RenamedTexts.ts`, `fieldUndo.ts`, `CarefulPace.ts`, `FramePass.ts`, `GroupNameField.ts` |
| G2 | `drag/*`, `BulkController.ts`, `TaskSelection.ts`, `gestures.ts`, `PinchZoom.ts`, `Swipe.ts`, `ScreenPager.ts`, `ScreenTracks.ts`, `DayPeek.ts`, `ColumnSwitch.ts`, `Divider.ts`, `RowReorder.ts`, `PointerSpeed.ts`, `FreeRoomDoubleClick.ts`, `FoundCard.ts`, `wholeCard.ts`, `screens.ts`, `zoomLevels.ts`, `listWidth.ts`, `dates.ts` |
| G3 | `menu/*`, `full/*`, `search/*`, `sources/*`, `markdown/*`, `kit/*`, `repeat/*`, `projects/*`, `ViewButton.ts` |
| G4 | `Timeline.ts`, `timelineLayout.ts`, `TaskList.ts`, `TaskCard.ts`, `TaskTitle.ts`, `AllDayRow.ts`, `BlockHeight.ts`, `ScrollEdges.ts`, `DayNav.ts`, `ColumnHeaders.ts`, `layouts/*`, `motion/*`, `next/*`, `design.ts`, `dom.ts`, `easing.ts`, `eventColors.ts`, `dayTitle.ts`, `failureText.ts`, `types.ts` |

## Ordering mechanisms (the names used in the guard column)

| name | where | what it orders |
|---|---|---|
| `act` | CS:899-915 | A task write: waits for `Picks.settled()` (unless a pick is running now), chains on `changing`, then rereads through `DayData.tasks()` (Reload). `StaleTaskError` becomes a Notice; a `false` answer skips the reread. |
| `changing` | CS:128, 904-905 | The promise chain inside `act`: writes run one after another in the order asked. |
| `turning` | CS:209, 699-710 | The day arrows and Today: one turn after another, each after `drawnLanding` and `afterEntry`; a turn whose `pager.caught` changed (a finger caught the strip) is dropped. |
| `drawnLanding` | CS:713-719 | A turn waits until the day a swipe brought in is drawn (`landed`, CS:795-803), at most 1000 ms. |
| `afterEntry` | CS:676-679 | A switch of day or place waits for `quick.settle()`: the text typed is written for the day and place it was typed at. |
| `Reload` | Reload.ts:5-41 | One fetch at a time; a request during a fetch is served by one more fetch; only the freshest value is applied. DayData has one for tasks and one for events. |
| `Picks` | kit/Panel.ts:16-90 | A menu pick's action runs after its window closes; `Picks.waiting` lets `act` wait for it; `picked` lets only the first pick through. |
| `WriteQueue` | quick/WriteQueue.ts:2-22 | The quick entry's writes (create, rename, subtask, section) run one at a time; they do not go through `act`/`changing`. |
| `ScreenParts` | ScreenParts.ts:11-28 | Draws asked while a gesture holds the screen (`arbiter.busy`) wait and run together once it lets go. |
| arbiter claim | gestures.ts | `GestureArbiter`: one gesture holds the screen at a time (`drag`, `swipe`, `pinch`, `resize`, `naming`, …). |
| layout `hold` | layouts (`hold("carry" \| "typing")`) | The rows layout keeps its row heights while a carry or typing holds them. |
| own flags/tokens | named in the row | e.g. `carrying` (CS:160), `Swipe.round`, `ScreenPager.catches`, `DragSession.done`, ProjectBlocks `asks` sequence, QuickBar `leaving` token. |
| `none` | — | Nothing orders the call against other writes or reads. |

### Notes from each file group

**G1 (DayData, ScreenParts, Reload, quick/*, EntryRows, Keyboard, settings, TaskCalendarView, ViewWatch, ProjectBlocks, SettingsTab, small helpers).** All paths are relative to `obsidian/ui/` unless they start with `core/`, `main.ts` or `styles.css`. CS = `CalendarScreen.ts` (cited only where it reads or writes state that lives in these files). QEC = `quick/QuickEntryController.ts`. QES = `core/application/QuickEntrySession.ts`.

Note on QES writes: every task write the quick entry makes (createWithId, edit, createSection, unfoldAbove) is pushed by QES onto the `WriteQueue` given at QEC:215 (QES.ts:49 `writes.push(() => this.run(job))`); each job first awaits `view.fresh()` (QES.ts:189), i.e. QEC.fresh → CS `data.tasks()` → DayData's task `Reload`. These writes do not go through CS `act`/`changing`.

**G2 (drag/*, BulkController, TaskSelection, gestures, PinchZoom, Swipe, ScreenPager, ScreenTracks, DayPeek, ColumnSwitch, Divider, small helpers).** Paths are relative to `obsidian/ui/` unless they start with `core/`. "CS" = `CalendarScreen.ts`.
Files with no mutable state and no effects of their own: `drag/listFrame.ts` (pure reads of scrollTop/box), `drag/listPlace.ts` (pure), `screens.ts` (constant `WHEEL_AT`), `zoomLevels.ts` (re-export), `listWidth.ts` (pure wrappers), `dates.ts` (pure). They appear below only as core pure-rule call sites.

**G3 (menu/*, full/*, search/*, sources/*, markdown/*, kit/*, repeat/*, projects/*, ViewButton).** Paths are under `obsidian/ui/` unless they start with `core/`. `CS` = `obsidian/ui/CalendarScreen.ts`. `BC` = `obsidian/ui/BulkController.ts`. `QEC` = `obsidian/ui/quick/QuickEntryController.ts`.

Guard shorthands used below:
- **Picks.pick**: `kit/Panel.ts:63-71`: a `picked` flag lets only the first pick of a window through; the window closes first and the action runs from `overlay.afterClose` once the fade ends; `Picks.waiting` holds it so `CS.act` (via `Picks.settled`, CS:903) waits for it. A 2000 ms `giveUp` timer lets go if the window never closes (Panel.ts:41).
- **Picks.pickNow**: Panel.ts:83-90: same `picked` flag, the window closes and the action runs in the same tap; not added to `Picks.waiting`.
- **Picks.handOff**: Panel.ts:74-80: `picked` flag only, nothing closes.
- **act**: `CS.act` (CS:899-915): waits for `Picks.settled()` unless `Picks.running`, then chains on `changing`, then rereads via `DayData.tasks()`; a `false` result skips the reread; `StaleTaskError` becomes a `Notice`.
- **afterEntry**: `CS.afterEntry` (CS:676), waits for the quick entry to finish before the change.

**G4 (Timeline, TaskList, TaskCard, layouts/*, motion/*, next/* (prototype), small helpers).** All paths are under `obsidian/ui/` unless stated. CS = `CalendarScreen.ts`. Files with no state and no effects of their own:
`design.ts` (constants + `tokenMs`/`tokenPx` read computed style), `easing.ts` (pure), `eventColors.ts`, `dayTitle.ts` (re-exports of
core), `failureText.ts` (pure), `types.ts` (types), `layouts/ModeLayout.ts`, `layouts/LayoutHost.ts` (interfaces only),
`layouts/mountLayout.ts` (pure switch, mountLayout.ts:10-21), `next/motion.ts` (pure; `STILL` const, motion.ts:10) (prototype).


## A. State facts

### A.1 Facts held in more than one place (one row per fact, every place it lives)

| # | domain | fact (product terms) | every place it lives (file:line) | written by | read by |
|---|---|---|---|---|---|
| 1 | day/clock | The day the screen shows | `CS.selectedDate` CS:117; `DayData.state.date` DayData.ts:23; `state.day.date` (compared CS:1658); `Timeline.drawnDate` Timeline.ts:132; `TaskList.drawnDay` TaskList.ts:115; `DayPeek` date (DayPeek.ts:63/97, the incoming day); `CS.landing.peek.date` CS:205; `CS.scrolledFor` CS:185 (the day the scroll was set for); DayNav title text DayNav.ts:29 | CS:226, 683; DayData.ts:212, 218; Timeline/TaskList on render | CS throughout; DayData deps.date (CS:227); QEC deps.day (CS:409); Timeline deps.date (CS:337); DragController deps.day (CS:267); BulkController deps.day (CS:242) |
| 2 | day/clock | The day the header names during a swipe | `CS.titleDay` CS:213; `DayTrack.nearer` ScreenTracks.ts:80; DayNav title text DayNav.ts:29 | CS:759, 766; ScreenTracks.ts | CS:1536 |
| 3 | day/clock | A tick or draw missed while hidden or held, to catch up | `CS.missedTick` CS:119; `ScreenParts.waiting` ScreenParts.ts:12; `GestureArbiter.holder` gestures.ts:3 (the "held" fact) | CS:485, 488; ScreenParts.ts:17, 25 | CS:503; ScreenParts.ts:18-23; CS:471-474 |
| 4 | view/mode/place/filter/panel | Where the strip stands (Done / Inbox / Soon / Today-calendar) | core `FunnelView.place` in `DayData.state.funnel` DayData.ts:42; `CS.shownMode` CS:203; `CS.firstPlace` CS:138; `CS.atDone` CS:168; `RibbonLayout.place` RibbonLayout.ts:39; root classes `is-lists`/`is-inbox`/`is-done` RibbonLayout.ts:149-151; `ColumnSwitch.at` ColumnSwitch.ts:92 + host style props ColumnSwitch.ts:238; StripTrack place classes ScreenTracks.ts:153; `StripTrack.animations` currentTime ScreenTracks.ts:145; device localStorage `rightMode` main.ts:105 (legacy, handed over once) | CS:777, 811, 814, 325, 690, 776, 790, 883; `setFunnelPlace` CS:813, main.ts:108; RibbonLayout `showPlace`; ColumnSwitch | CS:690, 785; ribbonHost.place CS:661; switcher value CS:375; QEC turnTo CS:416; shownLists CS:1462 |
| 5 | view/mode/place/filter/panel | The view mode and its layout | core `FunnelView.view` (DayData.state.funnel); `CS.firstView` CS:137; `CS.layout` (mounted mode) CS:122; `CS.drawnContext` CS:126; `ViewButton.view` ViewButton.ts:16; root `has-wheel` CS:1481; `CS.swipe` presence CS:124 | CS:326, 1452, 587, 588, 1638; `setViewMode`/`setNoteViewMode` CS:1526 | CS:1451-1453, 1624, 1636; ViewButton render CS:1491 |
| 6 | view/mode/place/filter/panel | The project filter (the chosen node) | core `FunnelView.filter` (DayData.state.funnel); `DayData.state.projects.selected` DayData.ts:44; `FilterTitle.filter` FilterTitle.ts:21; `ProjectsListDrop.readOn` ProjectDrops.ts:174; `ProjectsCarry.nodes` (at lift) ProjectsCarry.ts:21; tree row `is-selected` ProjectTree.ts:78-82; `FullScreen` project button hidden FullScreen.ts:233 | `pickProjectNode` CS:1603, `selectProjectNode` CS:1257, `clearProjectFilter` CS:879, 1587; carry (core) | CS:1457, 164, 412-414, 1574; DayPeek filter CS:742 |
| 7 | view/mode/place/filter/panel | The projects panel is open / docked | core `FunnelView.panel.open/docked`; root `has-tree` CS:1486; root `has-dock` CS:1506; root `is-docking` + `CS.docking` timer CS:130, 1503; `folder.setOn` CS:1487; `TreePanel` has no own flag (renders from `panel`) TreePanel.ts; `treeDrop` tree getter CS:147 | `setProjectsPanel` CS:1521, 1605; core carry slides it out | CS:574, 1467, 1500 |
| 8 | lists data | The tasks read from the file (lists, sections, day, timeline items) | `DayData.state` DayData.ts:60; `DayData.shown["tasks"]` JSON copy DayData.ts:63; `TaskList.entries/rendered/drawnCards/nodes` TaskList.ts:95-117; `KeyedRows.rows` KeyedRows.ts:30; `ProjectTasks.look/entries/nodes` ProjectTasks.ts:62-66; `Timeline.tasks` Timeline.ts:129; `Timeline.blocks` Timeline.ts:130; `FullScreen.tree` FullScreen.ts:52; `TaskMenu.context` TaskMenu.ts:200 + CS `showMenu` `current` CS:1354; `BulkMenu.context` BulkMenu.ts:74 + BulkController `items` BulkController.ts:173; `DayPeek.day` DayPeek.ts:63 (other day) | DayData Reload apply DayData.ts:70; render passes | all draws; QES via QEC deps |
| 9 | lists data | The tasks file is missing | `DayData.state.missing` DayData.ts:34; root `is-missing` CS:1640; rightEl `tc-hidden` CS:1642; `.tc-missing` box CS:1643-1644; `layout.hide` (RibbonLayout.ts:189 / StillLayout.ts:136 `tc-hidden`); TreePanel `is-missing` TreePanel.ts:86 | DayData read; CS:1640-1644 | CS:1639, 1658 |
| 10 | lists data | A card waiting at the end of a column for a new section's name | `CS.naming` CS:201; arbiter claim `naming` CS:1158; `TaskList.slot` TaskList.ts:108; GroupNameField DOM GroupNameField.ts:34 | CS:1155, 1159, 1166 | CS:1293, 1299 |
| 11 | events | The day's calendar events | `DayData.dayEvents` DayData.ts:61; CalendarService cache (`events(...).cached`); `DayData.shown["events"]`; `Timeline.events` Timeline.ts:128; `DayPeek.events` DayPeek.ts:64; all-day row DOM AllDayRow.ts | DayData events Reload | Timeline deps.events CS:343; renderAllDayRows CS:1651 |
| 12 | events | The sources' alert (dot on the wheel) | DayData alert/statuses (DayData.state); ColumnSwitch dot classes ColumnSwitch.ts:258 | DayData | CS:377, 1303 |
| 13 | layout sizes | How many extra all-day rows the timeline column has | `--tc-allday-extra-rows` on rightEl AllDayRow.ts:29; same property on the peek DayPeek.ts:147 (copied by reading CS's inline style CS:741) | AllDayRow.ts:29; DayPeek.ts:147 | CS:741; CSS |
| 14 | selection | The timeline card selected (grips shown) | `Timeline.selected` Timeline.ts:142; `is-selected` class on the block Timeline.ts:415, 691; grips `is-shown` Timeline.ts:597 | Timeline select; CS:894 | Timeline `selection` getter Timeline.ts:420 (reads the class); CS:892-893 |
| 15 | selection | List cards picked for Select Tasks | `TaskSelection.picked` TaskSelection.ts:29; `TaskSelection.latest` TaskSelection.ts:33; `is-selected` on cards TaskSelection.ts:47; `BulkController.selecting` BulkController.ts:67 + root `is-selecting` BulkController.ts:85; count button BulkController.ts:64; menu button off BulkController.ts:65; BulkController openMenu `items` BulkController.ts:173 | BulkController / TaskSelection; `endSelectionAfter` CS:1062 | DragController pick CS:272; bulk menu |
| 16 | carry/drag | A drag holds the screen | `DragController.live` DragController.ts:95; `GestureArbiter.holder` "drag" gestures.ts:3; root `is-dragging` CS:286; `RowsLayout.holds` "carry" RowsLayout.ts:39 (set CS:287); `QEC.dragging` QEC:138 (set CS:285); `is-lifted`/`is-waiting`/`is-folded` classes DragController.ts:317-319; pointer capture DragController.ts:321 | DragController; CS:285-287 | BlockHeight.ts:44; ScreenParts busy CS:182; CS:463 |
| 17 | carry/drag | A carry to a project is under way | `CS.carrying` CS:160; core carry state (`startCarry`/`carryAt`/`endCarry`); `CarryReport.last` CarryReport.ts:24; `QEC.carrying` QEC:139; `PlusRing.ring` PlusRing.ts:14 | CS:1042, 1050, 1067 | CS:291, 524, 1049 |
| 18 | carry/drag | The card a drop is landing on | `ArrivingCard.id/card` ArrivingCard.ts:11-12 + `is-arriving`; static `DragSession.landing` DragSession.ts:48; `ProjectTasks.away` ProjectTasks.ts:73 | CS:1089, 1147; DragSession | CS:1150 |
| 19 | carry/drag | Where a held card would land | `CardListDrop.place/shownGap/last/over` ListDrop.ts:81-93; DropLine el/transform DropLine.ts:14, 41; `TimelineDrop.start` TimelineDrop.ts:19; `Timeline.drop/dropEl/dropShown` Timeline.ts:134-139; `TreeDrop.result` ProjectDrops.ts:94 + row `is-drop` ProjectTree.ts:41; `is-hot` plate/title ListDrop.ts:87-89; RowsLayout `is-drop-room` RowsLayout.ts:68; `DragSession.current` DragSession.ts:58 | drop targets during drag | DragController / DragSession |
| 20 | carry/drag | A timeline card being stretched | `Timeline.stretch` Timeline.ts:136; `is-resizing` Timeline.ts:547; DragController closures `minute`/`span` DragController.ts:461-463; arbiter "resize" | DragController / Timeline | CS:301, 304 |
| 21 | swipe/pager | A swipe or turn is running | `Swipe.press/stream/holds` Swipe.ts:94-97; arbiter "swipe"; `ScreenPager.way/shift/dx/settling/ending` ScreenPager.ts:47-52; inline transforms ScreenTracks.ts:23, 64-65; `RibbonLayout.switching` + `is-switching` RibbonLayout.ts:38, 110 | Swipe / ScreenPager | CS:700, 706 |
| 22 | swipe/pager | Which swipe or turn is current (stale ones ignored) | `Swipe.round` Swipe.ts:99; `ScreenPager.catches` ScreenPager.ts:54 (read as `pager.caught` CS:700, 706); `CS.turning` chain CS:209 | Swipe / ScreenPager; CS:701 | CS:706 |
| 23 | swipe/pager | A landed day drawn over the screen until the screen draws it | `CS.landing` CS:205; `CS.drawnWaits` + 1000 ms timer CS:211, 717; `DayPeek.removed` DayPeek.ts:68; `DayPeek.el` DayPeek.ts:77 | CS:763, 798 | CS:714, 796, 1650, 1658 |
| 24 | zoom | The timeline's hour height | `CS.hourPx` CS:177; `CS.wholeDay` CS:198; `CS.zoomFrame` CS:196; `PinchZoom.scaled` PinchZoom.ts:37; `Timeline.hourShown` Timeline.ts:141; `--tc-hour` Timeline.ts:388; settings `zoom` (view settings, written CS:991) | CS:964, 972, 982; PinchZoom | Timeline deps.hourPx CS:340; DayPeek CS:732 |
| 25 | scroll | The timeline's scroll position | `Timeline.el.scrollTop` Timeline.ts:252-296; `Timeline.anchor` Timeline.ts:144; `Timeline.room` + `--tc-room-*` Timeline.ts:140, 303; `CS.scrolledFor` CS:185; CS reads/re-holds scrollTop CS:583, 626, 1650, 1673 | Timeline; CS holdScroll calls | CS; DayPeek alignTimeline CS:740 |
| 26 | scroll | A list's scroll / held room | list `scrollTop`; `ScrollHold.hold` + `--tc-list-hold`/`is-holding` ScrollHold.ts:10, 50; `ScrollEdges.shown` + classes ScrollEdges.ts:30-43; `QEC.revealedAt` QEC:158; `QEC.revealing` QEC:162; `ScrollGlide.run` ScrollGlide.ts:28; `GLIDES` SmoothScroll.ts:5; `PanelPages.scrolls` PanelPages.ts:21; peek list scrollTop DayPeek.ts:117 (copied from CS:739) | various | various |
| 27 | layout sizes | The day list's share of the width | settings `listShare` (written CS:607); root `--tc-list-width` RibbonLayout.ts:72, 130; StillLayout column `style.width` StillLayout.ts:96-97; `SnapGlide.shown` SnapGlide.ts:17; `Divider.glide/press` Divider.ts:32-34 | Divider; CS:607 | layoutHost.share CS:606 |
| 28 | layout sizes | The project tree's width | settings `treeWidth` (written CS:1601); root `--tree-width` TreePanel.ts:63, 84; TreePanel ResizeObserver `seen` TreePanel.ts:53; Divider state | TreePanel / Divider; CS:1601 | CS:1599, 574 |
| 29 | text entry/quick bar | A field is open for typing (new task, rename, subtask, section) | `QEC.state` QEC:134; QES state (core); `QEC.field` QEC:135; root `is-entering` QEC:416; `layout.hold("typing")` CS:1647, 1660 / `RowsLayout.holds`; `QuickBar.state` QuickBar.ts:98; `Timeline.field` + `is-renaming` Timeline.ts:143, 489; card `is-renaming` TaskList.ts:182; `EntryRows.renaming/created` EntryRows.ts:41-44; `QEC.stack` QEC:143 + `TaskMenu.stackRow/fieldRow/fieldClosed` TaskMenu.ts:171-175; `FullScreen.state/field/titleField` FullScreen.ts:68-72; `PlusButton.isHidden` PlusButton.ts:27; `folder.el.disabled` CS:425 | QEC / QES / FullScreen | CS `quick.entering` CS:1647; afterEntry CS:677 |
| 30 | text entry/quick bar | Which field has the keyboard focus | `document.activeElement`; `QEC.focused` QEC:137; `FullScreen.focused` FullScreen.ts:71; `CS.activeEditor` CS:184; `MarkdownTitleField.scoped` MarkdownTitleField.ts:33; `ObsidianMarkdown` `held` ObsidianMarkdown.ts:30; `ProjectBlock.scoped` ProjectBlocks.ts:17; FullScreen `is-typing` FullScreen.ts:109 | fields; EmbeddedEditor.ts:73, 109 | CS:930; TaskCalendarView |
| 31 | text entry/quick bar | The entry's priority tint | `QEC.state.marks.tint`; field `dataset.priority` QuickField.ts:57; quick bar flag `dataset.priority` QuickBar.ts:153-157 | QEC / QuickBar | CSS |
| 32 | text entry/quick bar | The repeat being edited | `RepeatEditor.draft` RepeatPanel.ts:43; `TaskMenu.repeatPage` TaskMenu.ts:182; core `RepeatPage`; QuickBar draft | menus | menus |
| 33 | text entry/quick bar | A description being edited | `FullScreen.draft` FullScreen.ts:64; `FullScreen.editing` FullScreen.ts:62; CodeMirror doc EmbeddedEditor.ts:94; `FullScreen.saveTimer` FullScreen.ts:65 | FullScreen | FullScreen |
| 34 | menus/overlays/full/search | The search window is open | `CS.search` CS:169; `SearchWindow.closed` SearchWindow.ts:40; `Overlay.ending` Overlay.ts:22 | CS:851, 859, 862 | CS:849 |
| 35 | menus/overlays/full/search | A task is on the whole screen | `CS.full` CS:171; `FullScreen.closed` FullScreen.ts:77; `is-shown` on the sheet FullScreen.ts:134 | CS:1319, 1332 | CS:447, 528, 1315 |
| 36 | menus/overlays/full/search | A menu / sheet is open or closing | `Overlay.parts/level/ending/gone/retired` Overlay.ts:19-26; backdrop element Overlay.ts:58 (presence read CS:893, FullScreen.ts:482); `is-shown`/`is-closing` Overlay.ts:8-9; `Picks.picked` Panel.ts:17; static `Picks.waiting/runningNow` Panel.ts:16-48; `LiftedMenu.gone` LiftedMenu.ts:34; `BulkController.menu` BulkController.ts:66; `QEC.stack` QEC:143; `QuickBar.panel` + `dataset.panel` QuickBar.ts:101, 334; `Panel.shown` / `PanelPages.page` Panel.ts:125, PanelPages.ts:20 | menus | CS act gate CS:902 |
| 37 | menus/overlays/full/search | The card ringed after a search | `FoundCard.id` FoundCard.ts:21; `FoundCard.cards` + `is-found` FoundCard.ts:23 | CS:880 | — |
| 38 | undo | Whether undo is possible | `UndoService.canUndo()` (core); BottomCapsule button off BottomCapsule.ts:43 | core | BottomCapsule |
| 39 | settings | The settings the screen draws | `ShownSettingsStore.seen/shown` viewSettings.ts:85-86; `ViewSettingsStore.source/shown` viewSettings.ts:56-57; `CS.seen` CS:189; `PluginSettings` main.ts:27; `cardSize.shown` + body `--tc-card-*` cardSize.ts:14-20; `priorityColors.rules/blend` + style element + body `tc-labels-blend` priorityColors.ts:41-50; SettingsTab preview overrides SettingsTab.ts:153, 173 | main.ts:46-51; settings.set CS:607, 991, 1601 | CS `settings` getter CS:542 |
| 40 | platform/theme/keyboard | Phone or desktop | body `is-mobile` (Obsidian), read CS:262, 407, 854, 1447; QuickBar `is-desk` QuickBar.ts:139; `QuickBar.desk` QuickBar.ts:105 | Obsidian | CS `wide()` and QEC/BulkController deps |
| 41 | platform/theme/keyboard | Obsidian's status bar shown over the view | body `tc-status-bar-shown` StatusBarRoom.ts:56 (holder count); `ObsidianChrome.statusBar` ObsidianChrome.ts:8 | StatusBarRoom | QEC chromeTop CS:408 |
| 42 | platform/theme/keyboard | Popout windows that get the styles | `windowDocuments` `popouts` windowDocuments.ts:2; `closings` main.ts:142 | main.ts:144, 150 | main.ts:150, 154 |
| 43 | note blocks | Which note a block shows and its project view | `ProjectBlock.path` ProjectBlocks.ts:24; MarkdownView file (ProjectBlocks.ts:131); `ScreenPlace.note` (CS `where.note`); `ProjectBlocks.blocks/asks` ProjectBlocks.ts:82-86 | ProjectBlocks | CS:1441-1442 |
| 44 | other | Writes waiting to run, in order | `CS.changing` CS:128; `WriteQueue.tail` WriteQueue.ts:3; static `Picks.waiting` Panel.ts; `Store.queue` next/Store.ts:20 (prototype) | CS:905; WriteQueue.push; Picks | act CS:902-906; QEC `entry.idle()` |
| 45 | other | Who holds the screen (gesture lock) | `GestureArbiter.holder` gestures.ts:3; `LongPress.press` LongPress.ts:50; `PinchZoom.pinch` PinchZoom.ts:33; `Divider.press` Divider.ts:32; `ColumnSwitch.press` ColumnSwitch.ts:87; `Swipe.holds`; `DragController.live`; pointer captures (DragController.ts:221, 277, 321, 368; GroupDrag.ts:98; PinchZoom.ts:74; Swipe.ts:205; ColumnSwitch.ts:164; Divider.ts:62) | each gesture | ScreenParts busy CS:182; canTick CS:493; ProjectMenu CS:1225 |

### A.2 Every state location, by domain

One row per place a piece of state lives. Column `grp` names the file group (see "File groups" above). "same fact also stored as" points to the duplicates; A.1 gathers them per fact.


#### day/clock (11)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| day/clock | G0 | `CS.selectedDate` | CS:117 | the day the screen shows (header, day list, timeline) | CS:226 (ctor, today), CS:683 (`select`) | CS:227, 242, 267, 301, 304, 330-331, 337-338, 359, 409, 640, 662, 884, 1148, 1262, 1283, 1364, 1536, 1650, 1654-1655, 1658 | DayData.state.date; Timeline.drawnDate; TaskList.drawnDay; DayPeek date; CS.titleDay; CS.scrolledFor; CS.landing.peek.date |
| day/clock | G0 | `CS.titleDay` | CS:213 | the day the header names while a swipe has drawn another day nearer | CS:759 (`onNearer`), CS:766 (arrive) | CS:1536 (`dayName`) | DayTrack.nearer (ScreenTracks.ts:80); DayNav title text |
| day/clock | G0 | `CS.missedTick` | CS:119 | a minute passed while hidden or a gesture held the screen; tick once when free | CS:485, 488 | CS:503 | ScreenParts.waiting (same "held, catch up later" idea for draws) |
| day/clock | G0 | minute interval | CS:476 | the once-a-minute now-line tick | CS:476 (`registerInterval`) | — | DayService day-change timer (core) |
| day/clock | G1 | DayData.state.date | DayData.ts:23 (set in readTasks DayData.ts:212,218) | The day the tasks were last read for; null before the first read | DayData.ts:70 (via readTasks DayData.ts:212) | DayData.ts:132 (`read`); CS:1637 (drawnRead) | CS.selectedDate (CS:117, written CS:226,683); DayData deps.date() reads CS.selectedDate (CS:227); state.day.date (CS:1658); QEC deps.day() (CS:409) |
| day/clock | G4 | `Timeline.drawnDate` | Timeline.ts:132 | the day last drawn; another day is drawn without motion | Timeline.ts:314 | Timeline.ts:313 | CS.selectedDate (CS:117) via deps.date (CS:337); DayPeek `date` (DayPeek.ts:97); TaskList.drawnDay |
| day/clock | G4 | `Timeline.nowEl` | Timeline.ts:133 | the now line element; present only when the shown day is today | Timeline.ts:340-343 | Timeline.ts:373, 378, 408 | DayService.relation(...)==="today" (CS:338) |
| day/clock | G4 | `is-hidden` on hour labels | Timeline.ts:399 | label hidden where the now pill would cover it | Timeline.ts:399 | styles.css | — |
| day/clock | G4 | now pill text, nowEl `--tc-y` | Timeline.ts:344, 379, 408 | current time on the now line | Timeline.ts:344, 379 (querySelector `.tc-now-pill` as state), 408 | styles.css | clock |
| day/clock | G4 | `TaskList.drawnDay` | TaskList.ts:115 | day of last drawing; another day draws without motion | TaskList.ts:154 | TaskList.ts:150 | CS.selectedDate; Timeline.drawnDate |
| day/clock | G4 | DayNav title text | DayNav.ts:29 | day's name | DayNav.ts:29 (render, called CS:684, 760, 1629) | DOM | CS.titleDay / selectedDate (CS:1536) |

#### view/mode/place/filter/panel (35)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| view/mode/place/filter/panel | G0 | `CS.shownMode` | CS:203 | the place a swipe or the wheel just brought the strip to, until the core's read has it | CS:777, 811, 814 | CS:690, 814 | FunnelView.place (DayData.state.funnel); CS.firstPlace; RibbonLayout.place; ColumnSwitch.at; root `is-lists/is-inbox/is-done` |
| view/mode/place/filter/panel | G0 | `CS.firstPlace` | CS:138 | the place the device kept, used before the first read answers | CS:325, 690 (`??=`) | CS:690 | FunnelView.place; localStorage `rightMode` handed over once (main.ts:105-108) |
| view/mode/place/filter/panel | G0 | `CS.atDone` | CS:168 | the strip stands at Done (only the search brings it there) | CS:776, 790, 883 | CS:785 | RibbonLayout.place === "done"; root `is-done`; ColumnSwitch shows "done" (CS:885) |
| view/mode/place/filter/panel | G0 | `CS.firstView` | CS:137 | the view mode the device kept, before the first read | CS:326, 1452 (`??=`) | CS:1452 | FunnelView.view; ViewButton.view |
| view/mode/place/filter/panel | G0 | `CS.layout` | CS:122 | the mounted layout for the current mode (ribbon, all columns, rows, by project) | CS:526-527, 586-587 | CS:163, 255, 287, 397, 441, 536, 589, 744, 746, 778, 812, 919, 996, 1079, 1111, 1139, 1288, 1600, 1624-1625 | FunnelView.view.layout.mode (compared at CS:1624) |
| view/mode/place/filter/panel | G0 | `CS.drawnContext` | CS:126 | the context (`ViewChoice.context`) the lists were last drawn in; another one draws still | CS:588, 1638 | CS:1514, 1636 | root `is-redrawn` |
| view/mode/place/filter/panel | G0 | `CS.swipe` | CS:124 | the ribbon's swipe, present only while the layout has pages | CS:584-585, 591 | CS:525 | layout.track presence |
| view/mode/place/filter/panel | G0 | `CS.panel` / `folder` / `filterTitle` / `viewButton` / `dayNav` / `switcher` / `timeline` / `rightEl` / `allDayEl` / `fadeEl` / `timelineDrop` / `pager` / `quick` | CS:120-144, 174-176, 195, 207, 215 | parts built once in `open()` (null before) | CS:328, 333-335, 355-356, 383-384, 391, 439, 1584-1585, 1597 | throughout | — |
| view/mode/place/filter/panel | G0 | `folder.el.disabled` | CS:425 | the projects button is locked while a quick entry holds the panel | CS:425 (QEC `locksPanel`) | DOM | QEC.state |
| view/mode/place/filter/panel | G0 | root classes `is-note`, `has-wheel`, `has-top-row`, `has-head-lead` | CS:1480-1484 | note block; wheel shown; top row shown; head lead shown | CS:1480-1484 (`drawView`) | CSS | FunnelView.view.wheel / topRow |
| view/mode/place/filter/panel | G0 | root class `has-tree` + `folder.setOn` | CS:1486-1487 | the projects panel shows | CS:1486-1487 | CSS | FunnelView.panel.open; TreePanel (no own flag) |
| view/mode/place/filter/panel | G0 | root class `has-dock` | CS:1506 | the panel is docked beside the lists (desktop) | CS:1506 | CS:574, 1500 | FunnelView.panel.docked |
| view/mode/place/filter/panel | G0 | root class `is-redrawn` | CS:1645, 1663 | another context was drawn: no transitions this frame | CS:1645, 1663 | CS:1661 | CS.drawnContext |
| view/mode/place/filter/panel | G0 | root classes `task-calendar tc-view`, `is-block` | CS:321, 323 | the plugin's own view vs a note's block | CS:321, 323 | CSS | ScreenPlace.view |
| view/mode/place/filter/panel | G1 | DayData.state.funnel | DayData.ts:42 (set DayData.ts:213,218) | The view the lists were read with: filter node/project, mode, place, projects panel open/dim, plus/search flags | DayData.ts:70 | DayData.ts:118; CS:412,690,855,1099,1452,1457,1467,1476,1520,1605 | CS.shownMode / CS.firstPlace (CS:690); CS.firstView (CS:1452); core-side device place (`TaskService.setFunnelPlace`); TaskCalendarView/ProjectBlocks `projectNoteView` answer (ProjectBlocks.ts:132) for note blocks |
| view/mode/place/filter/panel | G1 | DayData.state.projects | DayData.ts:44 | The filter node's tasks grouped by project, read only in by-project mode | DayData.ts:70 | DayData.ts:113; CS:164,610,1552,1558,1560,1571,1574 | ProjectTasks drawn rows; state.funnel.filter.node (DayData.ts:214) |
| view/mode/place/filter/panel | G2 | place classes set twice in StripTrack ctor (`showMode(to)`, `showMode(from)`) | ScreenTracks.ts:153 | temporary place classes to measure | ScreenTracks.ts:153, 155 | ScreenTracks.ts:154 (lookOf) | layout place classes |
| view/mode/place/filter/panel | G3 | `parentButton.hidden`, `projectButton.hidden` | full/FullScreen.ts:220, 233 | Up-link / project line shown | 220, 233 | browser | `tree.project`, `item.parentText` |
| view/mode/place/filter/panel | G3 | `ViewButton.view` | ViewButton.ts:16 | Modes the view button offers and its icon | ViewButton.ts:39 | ViewButton.ts:26, 38 | `CS.data.funnel.view` (CS:1491) |
| view/mode/place/filter/panel | G3 | `tc-hidden` on view button; svg icon | ViewButton.ts:38, 40 | View button hidden / current mode icon | 38, 40 | CSS | `view` |
| view/mode/place/filter/panel | G3 | `is-missing` on tree panel | projects/TreePanel.ts:86 | Projects file missing | 86 | CSS | `ProjectsPanel.missing` |
| view/mode/place/filter/panel | G3 | Tree panel open (no own flag) | projects/TreePanel.ts (none) | Panel open is not stored in TreePanel; shown by root `has-tree` | CS:1486 | CSS | `CS.data.funnel.panel.open` (CS:1467); `has-tree` class (CS:1486); `has-dock` (CS:1498+); `folder.setOn` (CS:1487) |
| view/mode/place/filter/panel | G3 | `ProjectTree.drawn` (AbortController) | projects/ProjectTree.ts:19 | Listeners of the current drawing; aborted on redraw | 56 | 54 | — |
| view/mode/place/filter/panel | G3 | `ProjectTree.rowsByNode` (Map, mutated) | projects/ProjectTree.ts:20 | Node → row element | 59 (clear), 86 | 36, 41 | `rowEls` |
| view/mode/place/filter/panel | G3 | `ProjectTree.drawnRows` | projects/ProjectTree.ts:22 | Core rows as drawn | 60 | 46 → ProjectDrops.ts:28, 43-46, 64, 75; TreePanel.ts:78 | `CS.data.funnel.panel.rows` |
| view/mode/place/filter/panel | G3 | `ProjectTree.rowEls` | projects/ProjectTree.ts:23 | Row elements in core order | 61, 87 | 50 | `rowsByNode` |
| view/mode/place/filter/panel | G3 | row `is-selected/is-muted/is-folded`, `aria-*` | projects/ProjectTree.ts:78-82 | Chosen node / waiting / folded | 78-82 | CSS | core row model; `CS.data.projects.selected` |
| view/mode/place/filter/panel | G3 | `FilterTitle.filter` | projects/FilterTitle.ts:21 | The chosen node shown over the tasks | 39 | 27 | `CS.data.funnel.filter` (CS:1488) |
| view/mode/place/filter/panel | G3 | `tc-hidden`, `has-menu`, cross hidden, `is-renaming` | projects/FilterTitle.ts:40, 42-43, 49, 55 | Title hidden / tappable / clearable / renamed | 40, 42-43, 49, 55 | CSS | `filter` |
| view/mode/place/filter/panel | G4 | ColumnHeaders text (done/inbox/soon) | ColumnHeaders.ts:32-34 | list names over the ribbon columns | ColumnHeaders.ts:32-34 | DOM | TaskService.listName |
| view/mode/place/filter/panel | G4 | `RibbonLayout.place` | RibbonLayout.ts:39 | which pair of columns the ribbon shows | RibbonLayout.ts:143 | RibbonLayout.ts:138, 156-162 | CS.place() (CS:784), CS.shownMode (CS:203), CS.atDone; root classes `is-lists/is-inbox/is-done`; switcher wheel position; ribbon.place() (RibbonLayout.ts:105) |
| view/mode/place/filter/panel | G4 | root `is-lists`, `is-inbox`, `is-done` | RibbonLayout.ts:149-151 | which strip place shows | RibbonLayout.ts:149-151 (via showPlace 144 and StripTrack showMode 115), 197 (removed) | styles.css | `RibbonLayout.place` |
| view/mode/place/filter/panel | G4 | backlog title text | RibbonLayout.ts:132 | Backlog name | RibbonLayout.ts:132 | DOM | TaskService.listName |
| view/mode/place/filter/panel | G4 | parent of shared nav / timeline (DOM placement) | StillLayout.ts:38, 55, 140; RibbonLayout.ts:47 | where the day nav and timeline stand in this layout | via shared.place (CS:625-632) | CS | — |
| view/mode/place/filter/panel | G4 | ColumnsLayout titles text | ColumnsLayout.ts:50 | inbox/soon/backlog names | ColumnsLayout.ts:50 | DOM | TaskService.listName |

#### lists data (51)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| lists data | G0 | `CS.drawnRead` | CS:187 | the lists were last drawn from a real read (later changes move, first draw is instant) | CS:1637 | CS:1501, 1636, 1652 | DayData.read |
| lists data | G0 | root class `is-missing`, rightEl `tc-hidden`, `.tc-missing` box | CS:1640-1644 | no tasks file: the box with Create file | CS:1640-1644, 1683 | CS:1643 (querySelector) | DayData.state.missing; layout.hide; TreePanel `is-missing` |
| lists data | G0 | `CS.naming` | CS:201 | a card sent to New section waits at the end of its column for the name | CS:1155, 1159, 1166 | CS:1293, 1299 | arbiter claim `naming`; TaskList.slot; GroupNameField DOM |
| lists data | G0 | head class `is-renamed` + `.tc-group-slot` element | CS:1190-1197 | a section header being renamed in place | CS:1191-1192, 1196-1197 | CSS | arbiter claim `naming` |
| lists data | G0 | card `dataset.menuFrom`, `dataset.card` | CS:1018-1019 | which list a by-project row's menu opens as | CS:1018-1019 | CS:1274 | ProjectsCard.menuFrom |
| lists data | G1 | DayData.state (TasksState, whole) | DayData.ts:60 | Last read of the tasks file for the selected day: day view, Soon/Inbox/Backlog/Done lists, sections per list, sections offered by menus, file-missing flag, calendars-shown flag, project tree, title-drop meanings, the funnel view, the by-project view | DayData.ts:60 (initial), DayData.ts:70 (Reload apply → show → `this.state = state`) | DayData.ts:82,86,90,94,98,103,108,113,118,123,127,132,136,140,145,150,154,159,164,235; CS:164,341,400,412,610,653,667,690,736,1099,1210,1283,1452,1457,1467,1476,1520,1542,1552,1558,1560,1571,1574,1605,1637,1639,1651,1658 | DayData.shown["tasks"] (JSON copy, DayData.ts:63); drawn cards in TaskList/ProjectTasks (KeyedRows); QES reads cards back through QEC deps `cards`/`sections` (QEC:204-205) |
| lists data | G1 | DayData.state.missing | DayData.ts:34 | No tasks file: the screen offers to create it | DayData.ts:70 | DayData.ts:136; CS:1639,1658 | state.day forced null when missing (DayData.ts:218) |
| lists data | G3 | `FullScreen.tree` | full/FullScreen.ts:52 | The on-screen task's subtask tree and project | FullScreen.ts:219 | FullScreen.ts:122, 232, 238 | `stack` top (source item) |
| lists data | G3 | `ProjectTasks.look` | projects/ProjectTasks.ts:62 | The by-project cards/sections/parts as drawn | 179 | 93, 98, 103, 114 | `CS.data.projects` (via `coming`, CS:1552) |
| lists data | G3 | `ProjectTasks.writing` | projects/ProjectTasks.ts:64 | Parts where a new task may be written | 180 | 108 (`writesAny`) → ProjectDrops.ts:187 | `look.parts[].newTask` |
| lists data | G3 | `ProjectTasks.entries` | projects/ProjectTasks.ts:65 | Drawn cards with their task, level, group | 181, 237 | 128, 201, 220, 268-271 | `rowsByCard` |
| lists data | G3 | `ProjectTasks.nodes` | projects/ProjectTasks.ts:66 | Headers, plates, cards in order | 182, 188, 211, 218, 238 | 133 | DOM order |
| lists data | G3 | `ProjectTasks.heads` | projects/ProjectTasks.ts:67 | Header element → its group | 183, 209 | 141 | — |
| lists data | G3 | `ProjectTasks.plates` | projects/ProjectTasks.ts:68 | Empty-part plate per group | 184, 277 | 145 | — |
| lists data | G3 | `ProjectTasks.rowsByCard` | projects/ProjectTasks.ts:69 | Card element → core row | 185, 239 | 155, 162, 271 | `cardsByRow` |
| lists data | G3 | `ProjectTasks.cardsByRow` | projects/ProjectTasks.ts:70 | Row id → card element | 186, 240 | 160, 176, 256 | `rowsByCard` |
| lists data | G3 | `ProjectTasks.opening` | projects/ProjectTasks.ts:71 | Whether a header opens its part on hover-drop | 187, 210 | 150 | `ProjectsSection.opens` |
| lists data | G4 | `Timeline.tasks` | Timeline.ts:129 | slotted tasks as drawn on the day, with their card element, meta and pill | Timeline.ts:330 | Timeline.ts:173, 415, 420, 489, 497, 542, 563, 603 | CS `data.day.slotted` (CS:341); `blocks` map keys `task:<id>`; DayPeek `day.slotted` (DayPeek.ts:101) |
| lists data | G4 | `Timeline.blocks` (Map key → {el, listening AbortController}) | Timeline.ts:130 | the keyed DOM block reused per task/event across renders | Timeline.ts:337 (via `take` 357-369 building `drawn`) | Timeline.ts:316, 331, 358 | `tasks[].el`, `events[].el`, itemsEl children |
| lists data | G4 | task block `--tc-y/--tc-len/--tc-x` | Timeline.ts:620-622 | card placement in the stack | Timeline.ts:588 (placeBox) | Timeline.ts:521, 598 (copied to field box and grips); Motion.boxOf (Motion.ts:216-219) | stackTasks output |
| lists data | G4 | `is-over` on task block | Timeline.ts:589 | card lies over another card/event | Timeline.ts:589 | styles.css | — |
| lists data | G4 | DOM order of task blocks in itemsEl | Timeline.ts:578-579 | cards stand in stack order so later ones draw over | Timeline.ts:579, 339 (grips appended last) | Timeline.ts:578 | `present()` order |
| lists data | G4 | block meta `is-hidden` + texts, pill text | Timeline.ts:632-636 | the small time/duration on the card's right; stretch pill time | Timeline.ts:632, 634-636 | styles.css | stackCorner result |
| lists data | G4 | `TaskList.entries` | TaskList.ts:95 | cards as drawn (card, item, level, section) | TaskList.ts:155, 183 | TaskList.ts:175, 189-193, 212, 219, 270, 275 | `keyed.rows` (DOM), CS data lists (`itemsOf`, CS:1541) |
| lists data | G4 | `TaskList.rendered` | TaskList.ts:96 | sections as drawn | TaskList.ts:161 | TaskList.ts:294, 299 | core `listView` result |
| lists data | G4 | `TaskList.nodes` | TaskList.ts:97 | headers, plates and cards in order | TaskList.ts:156, 184, 206, 209 | TaskList.ts:225, 338 | host DOM children |
| lists data | G4 | `TaskList.heads` (Map el→Header) | TaskList.ts:99 | which header element names which section | TaskList.ts:157, 346 | TaskList.ts:304 | `headsById` |
| lists data | G4 | `TaskList.headsById` | TaskList.ts:102 | header element per section id | TaskList.ts:158, 347 | TaskList.ts:323 | `heads` |
| lists data | G4 | `TaskList.plates` | TaskList.ts:104 | No-tasks plate per empty section | TaskList.ts:159, 363 | TaskList.ts:328 | plate `dataset.group` (362) |
| lists data | G4 | `TaskList.sectionCards` | TaskList.ts:106 | card elements per section | TaskList.ts:160, 212 | TaskList.ts:333 | `entries` |
| lists data | G4 | `TaskList.withHeaders` | TaskList.ts:107 | the list shows section headers | TaskList.ts:162 | TaskList.ts:203, 308 | core `ListView.showsHeaders` |
| lists data | G4 | `TaskList.drawnCards` | TaskList.ts:117 | memo of `listCards` for the last drawing | TaskList.ts:138, 140, 275 | TaskList.ts:275 | `entries` |
| lists data | G4 | card `--tc-level` | TaskList.ts:180 | subtask depth | TaskList.ts:180 | styles.css | `entries[].level` |
| lists data | G4 | header `is-ungrouped`, name text | TaskList.ts:344-345 | header of the tasks outside sections | TaskList.ts:344-345 | styles.css | settings.ungrouped (CS:651) |
| lists data | G4 | plate `textContent`, `dataset.group`; empty plate text | TaskList.ts:355, 361-362 | plate words and its section | TaskList.ts:355, 361-362 | `PLATE` class used by others | `plates` map |
| lists data | G4 | keyed "empty" node presence | TaskList.ts:230 | the list was showing its empty plate last time | KeyedRows via TaskList.ts:354, 234 (forget) | TaskList.ts:230 | — |
| lists data | G4 | branch spans `.tc-branch`, `--tc-pass` | TaskList.ts:371-373 | subtask branch lines | TaskList.ts:222, 371-373 | styles.css | core `branchOf` |
| lists data | G4 | card `dataset.priority`, label slot attributes, `dataset.labels` | TaskCard.ts:144-151, 156-157 | card colours | TaskCard.ts:144-151 (markColours, called TaskCard.ts:35, 50; Timeline.ts:682), 156-157 (markPriority) | styles.css | `TaskItem.colors` |
| lists data | G4 | card `is-collapsed` | TaskCard.ts:36, 51 | subtasks folded | TaskCard.ts:36, 51 | styles.css | `TaskItem.collapsed` |
| lists data | G4 | `.tc-progress-dot` presence | TaskCard.ts:42-44 | task in progress (DOM-held: queried before add/remove) | TaskCard.ts:43-44 | TaskCard.ts:42 | `TaskItem.status` |
| lists data | G4 | card `is-two-line` | TaskCard.ts:78 | two-line face | TaskCard.ts:78 | styles.css | `TaskItem.card.step` |
| lists data | G4 | `.tc-meta` node (counter/description), `is-pair` | TaskCard.ts:101-103, 134 | counter + description mark (found via querySelector, replaced in place) | TaskCard.ts:96, 101, 103, 134 | TaskCard.ts:101, 103 | `TaskItem.progress`, `.description` |
| lists data | G4 | due `is-repeat-only` | TaskCard.ts:63 | repeat with no date | TaskCard.ts:63 | styles.css | core cardDue |
| lists data | G4 | project mark `aria-label`, `title` | TaskCard.ts:115-116 | project name tooltip | TaskCard.ts:115-116 | browser | `TaskItem.project` |
| lists data | G4 | link `dataset.kind`, `dataset.target` | TaskTitle.ts:18-19 | where a link in a title goes | TaskTitle.ts:18-19 | TaskTitle.ts:26-27 (linkAt) | core textParts |
| lists data | G4 | `KeyedRows.rows` | KeyedRows.ts:30 | rows currently on screen by key (node + listening) | KeyedRows.ts:48 (delete), 105 | KeyedRows.ts:44, 52, 58-59, 81 | host DOM children; TaskList.entries/nodes |
| lists data | G4 | `KeyedRows.leaving` | KeyedRows.ts:31 | rows folding away, revivable if their key returns | KeyedRows.ts:68, 92, 97, 103 | KeyedRows.ts:66, 92, 100 | `is-leaving` class |
| lists data | G4 | `RowsDrawing.before/drawn/order/fresh` | KeyedRows.ts:111-114 | per-drawing bookkeeping (positions before, rows taken, order, new rows) | KeyedRows.ts:120, 130-132, 154, 159 | KeyedRows.ts:128, 149, 170-180 | — |
| lists data | G4 | host child order + focused row pinned | KeyedRows.ts:202-222 | rows' DOM order; focused field never moves | KeyedRows.ts:220 | KeyedRows.ts:169, 203-205 | — |
| lists data | G4 | `KeyedList.host` (prototype) | next/KeyedList.tsx:20 | list element | next/KeyedList.tsx:38 | next/KeyedList.tsx:51, 59 | — |
| lists data | G4 | row `data-key` (prototype) | next/KeyedList.tsx:41 | row key in the DOM | next/KeyedList.tsx:41 | next/KeyedList.tsx:52, 59 | Preact `key` |

#### events (12)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| events | G0 | `CS.poll` | CS:180 | the events kept fresh while the view is open | CS:477 | CS:455, 458, 461, 530, 539, 1307 | — |
| events | G1 | DayData.dayEvents | DayData.ts:61 | The selected day's events (all-day, timed), source statuses, alert dot, words | DayData.ts:77 (Reload apply), DayData.ts:198 (showCached, from load DayData.ts:172 and selectDay DayData.ts:193) | DayData.ts:140,145,150,154,159,164,193,236; CS:343,377,1303,1651 | CalendarService cache (`events(...).cached`, DayData.ts:75,198); DayData.shown["events"] |
| events | G1 | DayData.state.calendars | DayData.ts:36 | Whether the day's events and sources show at all | DayData.ts:70 | DayData.ts:140,145,150,154,159,164,236 | — |
| events | G1 | DayData.around | DayData.ts:67 | The next events fetch is for a day that opens (fetch neighbours too) | DayData.ts:74,187,207 | DayData.ts:73 | — |
| events | G2 | `DayPeek.events` | DayPeek.ts:64 | next day's events | DayPeek.ts:108, 110 | DayPeek.ts:103, 146 | CalendarService cache |
| events | G2 | `ColumnSwitch.dots` | ColumnSwitch.ts:86 | calendar alert dots | ColumnSwitch.ts:127 | ColumnSwitch.ts:257 | — |
| events | G2 | dot classes `is-shown`/`is-broken` + label | ColumnSwitch.ts:258 | calendar source stale/broken | ColumnSwitch.ts:258-260 | CSS | DayData alert (CS:377) |
| events | G4 | `Timeline.events` | Timeline.ts:128 | timed events as placed on the day (span, level, element) | Timeline.ts:326 | Timeline.ts:401, 611 | CS `data.timed` (via deps.events, CS:343), `blocks` map keys `event:<id>` |
| events | G4 | event block `className` reset, `--tc-x` | Timeline.ts:667-668 | event block identity + overlap indent | Timeline.ts:667-668 | styles.css | `events[].level` |
| events | G4 | `--tc-event-bg/bar/text` on event block and all-day row | AllDayRow.ts:8-10 | event colours per theme | AllDayRow.ts:8-10 (called Timeline.ts:669, AllDayRow.ts:24) | styles.css | deps.theme() (CS:336) |
| events | G4 | `is-past` class on event block / all-day row | AllDayRow.ts:15 | event is over (grey) | AllDayRow.ts:15 (called Timeline.ts:402 every layout/tick, AllDayRow.ts:25) | styles.css | CalendarService.isPast |
| events | G4 | `--tc-y`, `--tc-len`, `is-tiny` on event blocks | Timeline.ts:403-405 | event placement, tiny look | Timeline.ts:403-405 | styles.css | `events[]` spans |

#### selection (15)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| selection | G2 | `BulkController.selection` (TaskSelection) | BulkController.ts:62 | the picked tasks | see TaskSelection rows | CS:272, 1635 | TaskSelection.picked |
| selection | G2 | `BulkController.count` (Button) text/off | BulkController.ts:64 | picked-count button in Select tasks capsule | BulkController.ts:77, 162-163 | BulkController.ts:162-163 | `selection.size` |
| selection | G2 | `BulkController.menuButton` off state | BulkController.ts:65 | «⋯» button enabled when something picked | BulkController.ts:78, 164 | BulkController.ts:164, 170 | `selection.size` |
| selection | G2 | `BulkController.selecting` | BulkController.ts:67 | Select tasks mode on | BulkController.ts:84, 91 | BulkController.ts:103, 128, 150, 155 | `is-selecting` on root |
| selection | G2 | `is-selecting` class on content root | BulkController.ts:85 | Select tasks mode shows circles | BulkController.ts:85, 92 | CSS | `selecting` |
| selection | G2 | closure `items` in openMenu | BulkController.ts:173 | tasks as the bulk menu last saw them (fresh keys after label/project toggles) | BulkController.ts:198, 208 | BulkController.ts:174, 183, 196, 205-206 | `TaskSelection.picked` (renewed 196, 206) |
| selection | G2 | `TaskSelection.picked` (Map) | TaskSelection.ts:29 | picked tasks by key → card | TaskSelection.ts:45, 87, 99, 115 (set); 84, 114 (delete); 122 (clear) | TaskSelection.ts:44, 62, 75, 83, 112, 121, 129 | `is-selected` class; BulkController count |
| selection | G2 | `TaskSelection.drawn` (WeakMap) | TaskSelection.ts:31 | every list card drawn → its task/column | TaskSelection.ts:41 | TaskSelection.ts:67 (→ CS:272, BulkController.ts:113) | — |
| selection | G2 | `TaskSelection.latest` (Map) | TaskSelection.ts:33 | latest card drawn per task | TaskSelection.ts:43, 52 (clear) | TaskSelection.ts:56, 105, 115 | `drawn` |
| selection | G2 | `TaskSelection.anchor` | TaskSelection.ts:35 | start of a Shift-click run | TaskSelection.ts:46, 85, 88, 100, 123 | TaskSelection.ts:46, 96 | — |
| selection | G2 | `is-selected` class on list cards | TaskSelection.ts:47 | card picked | TaskSelection.ts:47, 128, 129 | CSS; (Timeline uses same class name for timeline selection: Timeline.ts:173, 415, 420, 596, 691; CS:893) | `picked` |
| selection | G2 | `.tc-pick` circle element prepended to card | TaskSelection.ts:21 | pick circle exists on card | TaskSelection.ts:21 | TaskSelection.ts:18; full/FullScreen.ts:252 | — |
| selection | G4 | `Timeline.selected` (TaskKey) | Timeline.ts:142 | the timeline card chosen by long press (ringed, with stretch dots) | Timeline.ts:414 | Timeline.ts:640 (isSelected → 415, 691) | `is-selected` class on blocks (415, 691) which `selection` getter (420), grips (173, 596) actually read; `grips.is-shown` (597) |
| selection | G4 | `is-selected` on task block | Timeline.ts:415, 691 | ringed card | Timeline.ts:415, 691 | Timeline.ts:173, 420, 596; CS:893 (`.tc-block.is-selected` closest) | `Timeline.selected` |
| selection | G4 | grips `is-shown`, `--tc-y/len/x` | Timeline.ts:597-598 | stretch dots shown over the selected card | Timeline.ts:597-598 | Grips (kit/Grips.ts) | `is-selected` |

#### carry/drag (95)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| carry/drag | G0 | `CS.carrying` | CS:160 | a carry the core keeps is under way | CS:1042, 1050, 1067 | CS:291, 524, 1049 | core carry state (TaskService.startCarry/endCarry); QEC.carrying; CarryReport.last |
| carry/drag | G0 | root class `is-dragging` | CS:286 | a drag holds the screen | CS:286 | BlockHeight.ts:44, CSS | DragController.live; arbiter holder; RowsLayout.holds "carry" (CS:287); QEC.dragging (CS:285) |
| carry/drag | G1 | QEC.dragging | QEC:138 | A card is lifted: plus hides | QEC:400 | QEC:686 | DragController / arbiter state (CS:285 passes it in) |
| carry/drag | G1 | QEC.carrying | QEC:139 | The plus itself is being carried | QEC:306,316,332,522 | QEC:686 | PlusRing.ring non-null (quick/PlusRing.ts:14); DragController drag |
| carry/drag | G1 | QEC.droppedOn | QEC:140 | Which list the carried plus was dropped on | QEC:294,490 | QEC:529 | DropResult (does not name the list) |
| carry/drag | G1 | PlusButton.press | quick/PlusButton.ts:26 | A press on the plus in progress | quick/PlusButton.ts:59,87 | quick/PlusButton.ts:58,65,69,75,81,85,86 | pointer capture (quick/PlusButton.ts:60) |
| carry/drag | G1 | PlusRing.ring | quick/PlusRing.ts:14 | Dashed ring at the plus's place while carried | quick/PlusRing.ts:23,28 | quick/PlusRing.ts:22,27,41,46,54 | QEC.carrying |
| carry/drag | G1 | ring class `is-hot` | quick/PlusRing.ts:41 | Carried card over the ring | quick/PlusRing.ts:41,54 | CSS | — |
| carry/drag | G1 | body class `tc-cancelling` | quick/PlusRing.ts:42 | Multi-carry over the cross ring (BulkController ring) | quick/PlusRing.ts:42,55 | styles.css:1254 | — |
| carry/drag | G2 | `DragController.live` | drag/DragController.ts:95 | the drag of a card or the plus whose finger is still down; closing the screen aborts it | drag/DragController.ts:100, 407, 418 | drag/DragController.ts:99, 418 | arbiter holder `"drag"` (gestures.ts:3); `is-dragging` on content (CS:286); `DragSession.landing` (once let go) |
| carry/drag | G2 | closure `pressed` (card) | drag/DragController.ts:117 | the element the press began on (counter, project mark) so the tap knows what was hit | drag/DragController.ts:118 | drag/DragController.ts:129 | — |
| carry/drag | G2 | closure `pressed` (block) | drag/DragController.ts:144 | same for a timeline block | drag/DragController.ts:145 | drag/DragController.ts:152 | — |
| carry/drag | G2 | pointer capture on held block/event (`holdFinger`) | drag/DragController.ts:221 | finger held on a timeline card/event that opened its menu keeps the screen | drag/DragController.ts:221 (capture), 227 (release) | browser | arbiter holder `"hold"` (drag/DragController.ts:220) |
| carry/drag | G2 | doc listeners of `holdFinger` (move/up/cancel + lost-lift capture) | drag/DragController.ts:240-243 | the held finger is being followed | drag/DragController.ts:240-243 (add), 222-226 (remove) | — | arbiter `"hold"` |
| carry/drag | G2 | pointer capture on canvas (new-slot) | drag/DragController.ts:277 | long tap on empty timeline is showing a new-task target | drag/DragController.ts:277, 287 | browser | arbiter `"newslot"` (273); `TimelineDrop.start` |
| carry/drag | G2 | `is-lifted` class on lifted card, carried cards, subtrees | drag/DragController.ts:317 | card(s) taken up by the finger | drag/DragController.ts:317 (add), 325 (remove) | drag/ListDrop.ts:306, 367, 369; Timeline.ts:578, 604; motion/KeyedRows.ts:95; layouts/RowsLayout.ts:136; projects/ProjectTasks.ts:176 | `DragController.live`; `is-waiting`/`is-folded` |
| carry/drag | G2 | `is-waiting` class | drag/DragController.ts:318 | lifted card (and carried picked cards) stands as dashed place | drag/DragController.ts:318, 325 | drag/ListDrop.ts:307 | `is-lifted` |
| carry/drag | G2 | `is-folded` class (subtree cards) | drag/DragController.ts:319 | subtasks of the lifted card(s) folded away under it | drag/DragController.ts:319, 325 | CSS only | `is-lifted` |
| carry/drag | G2 | pointer capture on lifted source | drag/DragController.ts:321 | finger carrying the card | drag/DragController.ts:321, 442 | browser | `live`, arbiter `"drag"` |
| carry/drag | G2 | pointer capture on plus source | drag/DragController.ts:368 | finger carrying the plus | drag/DragController.ts:368, 442 | browser | arbiter `"drag"` |
| carry/drag | G2 | closure `ended` in `follow` | drag/DragController.ts:414 | the carrying finger has let go / been cancelled (once) | drag/DragController.ts:417 | drag/DragController.ts:416 | `DragSession.done` |
| carry/drag | G2 | doc listeners of `follow` (keydown capture, move/up/cancel, lost-lift) | drag/DragController.ts:435, 444-447 | drag is following the pointer; Escape cancels | drag/DragController.ts:444-447 (add); 419, 437-441 (remove) | — | `live` |
| carry/drag | G2 | closure `minute` (resize) | drag/DragController.ts:461 | minute the held dot of the selected card is at | drag/DragController.ts:466 | drag/DragController.ts:481 | Timeline stretch state (`timeline.stretchTo`) |
| carry/drag | G2 | closure `span` (resize) | drag/DragController.ts:463 | span last shown while stretching | drag/DragController.ts:469 | drag/DragController.ts:468, 470 | Timeline stretch state |
| carry/drag | G2 | pointer capture on block (resize) | drag/DragController.ts:460 | dot being dragged | drag/DragController.ts:460, 478 | browser | arbiter `"resize"` (457), held until write done (488) |
| carry/drag | G2 | `CardListDrop.place` | drag/ListDrop.ts:81 | where a drop in this list would land (gap, level, section) | drag/ListDrop.ts:164, 186, 258 | drag/ListDrop.ts:183, 187, 212, 267-269 | `shownGap`; DropLine position |
| carry/drag | G2 | `CardListDrop.shownGap` | drag/ListDrop.ts:82 | where the drop line is drawn (may differ from `place` when list snaps it) | drag/ListDrop.ts:165, 199, 259 | drag/ListDrop.ts:212 | DropLine `el` transform |
| carry/drag | G2 | `CardListDrop.layout` | drag/ListDrop.ts:83 | list measured once per drag (cards, heads, dashed place, indent) | drag/ListDrop.ts:229, 290 | drag/ListDrop.ts:213, 288 | DOM offsets of the list's nodes |
| carry/drag | G2 | `CardListDrop.last` | drag/ListDrop.ts:84 | last finger position and payload (for auto-scroll re-preview and carriesMany) | drag/ListDrop.ts:166, 170, 260 | drag/ListDrop.ts:104, 280 | `TimelineDrop.last` (other target) |
| carry/drag | G2 | `CardListDrop.plate` + `is-hot` on plate | drag/ListDrop.ts:87 | empty-section "No tasks" plate lit as the landing | drag/ListDrop.ts:242-244 | drag/ListDrop.ts:214, 241-242 | `is-hot` class |
| carry/drag | G2 | `CardListDrop.litTitle` + `is-hot` on column title | drag/ListDrop.ts:89 | column title lit as a drop place | drag/ListDrop.ts:249-251 | drag/ListDrop.ts:248-249 | `is-hot` class |
| carry/drag | G2 | `CardListDrop.onHover` (public callback slot) | drag/ListDrop.ts:92 | owner's hook told when the finger is over the list | layouts/RowsLayout.ts:66 | drag/ListDrop.ts:236 | — |
| carry/drag | G2 | `CardListDrop.over` | drag/ListDrop.ts:93 | finger is over this list | drag/ListDrop.ts:235 | drag/ListDrop.ts:234 | RowsLayout room-at-end state |
| carry/drag | G2 | `is-folded` on section header, cards, plate | drag/GroupDrag.ts:69 | lifted section folded away | drag/GroupDrag.ts:69, 80 | CSS | arbiter `"drag"` |
| carry/drag | G2 | pointer capture on section header | drag/GroupDrag.ts:98 | finger carrying a section | drag/GroupDrag.ts:98, 105 | browser | arbiter `"drag"` |
| carry/drag | G2 | doc listeners of section lift | drag/GroupDrag.ts:113-115 | section drag follows pointer | drag/GroupDrag.ts:113-115, 102-104 | — | — |
| carry/drag | G2 | `SectionSlots.nearest` | drag/GroupDrag.ts:139 | slot (between sections) nearest the finger | drag/GroupDrag.ts:149, 158 | drag/GroupDrag.ts:159-161, 165 | TaskList landing (`showLanding`) |
| carry/drag | G2 | `SectionSlots.marked` | drag/GroupDrag.ts:141 | slot the landing gap was last drawn at | drag/GroupDrag.ts:160, 177 | drag/GroupDrag.ts:159 | TaskList landing |
| carry/drag | G2 | `SectionFloat.el.style.transform` | drag/GroupDrag.ts:201 | where the floating section header is | drag/GroupDrag.ts:201; animate fill 230 | drag/GroupDrag.ts:206, 211, 216 | — |
| carry/drag | G2 | `SectionFloat.el` in body | drag/GroupDrag.ts:192 | the floating section copy exists | drag/GroupDrag.ts:192 | — (removed 224) | — |
| carry/drag | G2 | static `DragSession.landing` (Set) | drag/DragSession.ts:48 | drags let go whose copy hasn't landed yet | drag/DragSession.ts:99, 130, 174 (add); 144 (delete) | drag/DragSession.ts:55, 144 | `DragController.live` (before let-go); `ArrivingCard` id |
| carry/drag | G2 | `DragSession.current` | drag/DragSession.ts:58 | target under the finger | drag/DragSession.ts:76, 157 | drag/DragSession.ts:74-75, 91 | target-side `over`/`place` |
| carry/drag | G2 | `DragSession.done` | drag/DragSession.ts:59 | drag let go / cancelled / aborted / failed | drag/DragSession.ts:96, 120, 129, 163 | drag/DragSession.ts:71, 87, 119, 162 | DragController `ended` |
| carry/drag | G2 | `DragSession.cut` | drag/DragSession.ts:60 | a newer drag landed this one early (`interrupted`) | drag/DragSession.ts:145 | drag/DragSession.ts:139 → drag/GroupDrag.ts:92 | — |
| carry/drag | G2 | `DragSession.cleared` | drag/DragSession.ts:61 | targets already told the drag is over | drag/DragSession.ts:156 | drag/DragSession.ts:155 | — |
| carry/drag | G2 | `FloatingCard.el` (+ class `tc-float`, appended to body) | drag/FloatingCard.ts:26, 52 | copy of the card under the finger exists | drag/FloatingCard.ts:34, 52 | drag/FloatingCard.ts:many | — (removed 151) |
| carry/drag | G2 | `FloatingCard.stack` | drag/FloatingCard.ts:27 | stack layers under a copy with subtasks / several carried | drag/FloatingCard.ts:50 | drag/FloatingCard.ts:54(fitStack→67), 89, 100, 121, 140, 149 | — |
| carry/drag | G2 | `FloatingCard.count` | drag/FloatingCard.ts:28 | badge with number of carried tasks | drag/FloatingCard.ts:60 | drag/FloatingCard.ts:90, 100, 122, 141, 150 | `payload.carried.length` |
| carry/drag | G2 | `FloatingCard.above` | drag/FloatingCard.ts:30 | copy narrowed and riding above finger over the project tree; width/stretch to restore | drag/FloatingCard.ts:103, 109 | drag/FloatingCard.ts:86-87, 99, 106-108 | `is-aside` class |
| carry/drag | G2 | float `style.transform` (copy, layers, badge) | drag/FloatingCard.ts:88-90 | where the copy is | drag/FloatingCard.ts:88-90, 127 | browser | — |
| carry/drag | G2 | float `style.width` / `style.height` | drag/FloatingCard.ts:105 | copy's width (stretched to whole title / narrowed / landing) | drag/FloatingCard.ts:105, 107, 128, 129; wholeCard.ts:25-26, 32 (via 53) | drag/FloatingCard.ts:103 | — |
| carry/drag | G2 | classes on float: `is-aside`, `is-stretched`, `is-flying`, `is-landed`, `is-gone`, `is-sinking`; layers `style.width` | drag/FloatingCard.ts:101 | float look/phase: aside, stretched, flying home, fading | drag/FloatingCard.ts:67, 101, 104, 108, 121-126, 135, 140-144; wholeCard.ts:31 | drag/FloatingCard.ts:49, 103 | `above` |
| carry/drag | G2 | pending flight timer (Promise of setTimeout) | drag/FloatingCard.ts:130 | copy still flying | drag/FloatingCard.ts:130, 145 | DragSession awaits (103, 106, 178) | — |
| carry/drag | G2 | `PlusFloat.el` + `style.transform` + `is-flying`/`is-gone` | drag/PlusFloat.ts:10 | plus following finger / flying | drag/PlusFloat.ts:13, 17, 47, 49, 50 | drag/PlusFloat.ts:22, 39 | — (removed 43) |
| carry/drag | G2 | `PlusFloat` flight timer | drag/PlusFloat.ts:51 | plus still flying | drag/PlusFloat.ts:51 | DragSession awaits | — |
| carry/drag | G2 | `DropLine.el` (in list DOM) | drag/DropLine.ts:14 | drop line exists in a list | drag/DropLine.ts:24, 47 | drag/DropLine.ts:22-23, 35, 41, 46 | `CardListDrop.shownGap` |
| carry/drag | G2 | `DropLine.bar` | drag/DropLine.ts:15 | the line's bar | drag/DropLine.ts:25, 48 | drag/DropLine.ts:42 | — |
| carry/drag | G2 | line `style.transform`, bar `style.width`, `is-shown` | drag/DropLine.ts:41 | where the line stands and its length | drag/DropLine.ts:35, 41, 42 | CSS | `shownGap` |
| carry/drag | G2 | `TimelineDrop.start` | drag/TimelineDrop.ts:19 | snapped start minute under the finger | drag/TimelineDrop.ts:59, 73 | drag/TimelineDrop.ts:55, 79 | Timeline drop preview (`showDrop`) |
| carry/drag | G2 | `TimelineDrop.last` | drag/TimelineDrop.ts:20 | last finger position (auto-scroll re-preview) | drag/TimelineDrop.ts:41, 75 | drag/TimelineDrop.ts:29 | — |
| carry/drag | G2 | `ArrivingCard.id` | drag/ArrivingCard.ts:11 | id of dropped task whose new card must stay hidden until float lands | drag/ArrivingCard.ts:17, 44 | drag/ArrivingCard.ts:22 | DragSession.landing (float not landed) |
| carry/drag | G2 | `ArrivingCard.card` + `is-arriving` class | drag/ArrivingCard.ts:12 | the card the float lands on, hidden | drag/ArrivingCard.ts:24-25, 31-32, 42-43 | drag/ArrivingCard.ts:23, 30, 36, 42; CS:1150 | `is-arriving` class |
| carry/drag | G2 | static `LongPress.attached` (WeakMap) | drag/LongPress.ts:37 | one press handler per element across redraws | drag/LongPress.ts:61 | drag/LongPress.ts:44 | — |
| carry/drag | G2 | `LongPress.press` (incl. `timer`, `last`) | drag/LongPress.ts:50 | a press under way, waiting for its delay | drag/LongPress.ts:88-90, 102, 138 | drag/LongPress.ts:52, 86, 97, 101-102, 113, 120, 125-126, 134-137 | pointer capture (92) |
| carry/drag | G2 | `LongPress.opts` | drag/LongPress.ts:55 | current callbacks (latest drawing) | drag/LongPress.ts:71 | drag/LongPress.ts:75, 82, 86-89, 107, 116, 128-130 | — |
| carry/drag | G2 | long-press timer | drag/LongPress.ts:89 | delay pending | drag/LongPress.ts:89 | drag/LongPress.ts:135 (clear) | `press.timer` |
| carry/drag | G2 | doc capture listener `otherFinger` + pointer capture | drag/LongPress.ts:91-92 | press in progress; a second finger ends it | drag/LongPress.ts:91-92, 136-137 | — | `press` |
| carry/drag | G2 | `PlusRing` shown (ring) | BulkController.ts:139 | cancel ring at the plus's place while several cards carried | BulkController.ts:139, 145 | quick/PlusRing.ts | arbiter `"drag"`; `carriesMany` |
| carry/drag | G2 | copy `style.width/height`, `is-stretched`, `is-whole`, removed `is-tiny` | wholeCard.ts:25 | lifted/menu copy grown to whole title | wholeCard.ts:25-26, 31-32, 48, 52, 66-67, 71-72, 75 | drag/FloatingCard.ts:103 | — |
| carry/drag | G3 | `ProjectTasks.away` | projects/ProjectTasks.ts:73 | Carried cards kept hidden while another node is drawn | 254, 259 | 176 | `is-lifted` / `tc-hidden` classes |
| carry/drag | G3 | `is-lifted` (read), `tc-hidden`, `is-renaming`, `--level` on rows | projects/ProjectTasks.ts:176, 228, 234, 236, 258 | Card carried / hidden / renamed / indent level | 228, 234, 236, 258 (is-lifted written by DragController) | 176; CSS | DragController lifted set |
| carry/drag | G3 | `TreeDrop.result` | projects/ProjectDrops.ts:94 | Where a card/plus over the tree would land | 121, 126, 135 | 106, 145 | tree row `is-drop` class (ProjectTree.ts:41); drop line shown |
| carry/drag | G3 | `ProjectsListDrop.readOn` | projects/ProjectDrops.ts:174 | Node the place under the finger was read on | 201 | 206 | `CS.data.projects.selected` |
| carry/drag | G3 | DropLine shown | projects/ProjectDrops.ts:76, 137; projects/TreeLift.ts:58-59, 67 | Drop line visible over the tree | ProjectDrops.ts:76 (`line.show`), 137; TreeLift.ts:58-59, 67 | — | `TreeDrop.result` / TreeLift `at` |
| carry/drag | G3 | row `is-drop` class | projects/ProjectTree.ts:41 | Row a held card would land on | 41 | CSS | `TreeDrop.result` |
| carry/drag | G3 | GestureArbiter claim `"project-lift"` | projects/TreeLift.ts:19, 41 | A project row is being carried | 41 | 69 (release); `arbiter.busy` read in TreeLift.ts:33 | float element / `is-lifted` |
| carry/drag | G3 | TreeLift closure `at` | projects/TreeLift.ts:54 | Landing gap/depth under the finger | 57 | 58, 70 | drop line |
| carry/drag | G3 | float clone in `body`, row `is-lifted`, inline `transform`/`width` | projects/TreeLift.ts:45-48, 53, 56, 66, 68 | The carried project row | 47-48, 53, 56 | 66, 68 (removed) | `at` |
| carry/drag | G3 | document pointermove/up/cancel listeners | projects/TreeLift.ts:74-76 | Lift in progress | 74-76 | 63-65 removed | arbiter claim |
| carry/drag | G3 | `CarryReport.last` | projects/CarryReport.ts:24 | Last point told to the core's carry | 32, 39 | 31, 57, 59 | core carry state (TaskService.carryAt) |
| carry/drag | G3 | `CarryReport.timer` | projects/CarryReport.ts:25 | Pending re-tell when the core's wait is up | 38, 53, 58 | 37, 52 | — |
| carry/drag | G3 | `ProjectsCarry.drops` (WeakMap) | projects/ProjectsCarry.ts:20 | Rows each drag carries, read at the lift | 31 | 37 | DragController payload |
| carry/drag | G3 | `ProjectsCarry.nodes` (WeakMap) | projects/ProjectsCarry.ts:21 | Node the drag was lifted on | 32 | 42 | `CS.data.projects.selected` at lift |
| carry/drag | G4 | `Timeline.dropEl` | Timeline.ts:134 | the drop line (time pill + line) floating in document.body during a drop/long tap | Timeline.ts:432, 471 | Timeline.ts:431, 446, 453, 470 | `drop`, `dropShown` |
| carry/drag | G4 | `Timeline.drop` | Timeline.ts:135 | the span a carried task would land at | Timeline.ts:429, 468 | Timeline.ts:212, 446, 455, 530, 532 | TimelineDrop state (drag/TimelineDrop.ts:60,74), `dropEl` presence |
| carry/drag | G4 | `Timeline.stretch` | Timeline.ts:136 | a card being resized: shown span, moving edge, task key and original slot | Timeline.ts:318, 545, 555, 566 | Timeline.ts:212, 338, 540, 553, 563, 615, 630, 636 | `is-resizing` class on the block (547, 557, 565, 680); DragController stretch gesture (drag/DragController.ts:470-494) |
| carry/drag | G4 | `Timeline.dropShown` | Timeline.ts:139 | what the drop line was last written with (dedup cache) | Timeline.ts:435, 438, 461-464, 472 | Timeline.ts:437, 457-460 | dropEl inline styles + `is-hidden` |
| carry/drag | G4 | `is-resizing` on task block | Timeline.ts:547, 557, 565, 680 (remove) | card being stretched | Timeline.ts:547, 557, 565, 680 | styles.css | `Timeline.stretch` |
| carry/drag | G4 | `is-lifted` on task block (read) | Timeline.ts:578, 604 | card lifted for a drag leaves the stack | drag/DragController.ts:317 | Timeline.ts:578, 604; KeyedRows.ts:95 | DragController lifted set |
| carry/drag | G4 | dropEl `--tc-y`, `style.left`, `style.width`, `is-hidden`, pill text | Timeline.ts:439, 457-460 | drop line placement | Timeline.ts:439, 457-460 | styles.css | `dropShown` |
| carry/drag | G4 | `TaskList.landing` | TaskList.ts:101 | where a lifted section would land (dashed place) | TaskList.ts:317 | TaskList.ts:199 | GroupDrag state (drag/GroupDrag.ts:93, 161, 178); `marks` key `landing` in KeyedRows |
| carry/drag | G4 | root `is-dragging` (read) | BlockHeight.ts:44 | a card is carried: don't refit | CS:286 | BlockHeight.ts:44 | RowsLayout.holds "carry" (CS:287) |
| carry/drag | G4 | list `is-drop-room` | RowsLayout.ts:68 | the list under a carried card opens room at its end | RowsLayout.ts:68 | RowsLayout.ts:204 | ListDrop hover state |
| carry/drag | G4 | `ListDrop.onHover` (assigned) | RowsLayout.ts:66 | hover callback on each row's drop | RowsLayout.ts:66 | drag/ListDrop.ts | — |
| carry/drag | G4 | `KeyedRows.marks` | KeyedRows.ts:33 | keys of rows that only mark a landing place | KeyedRows.ts:143 | KeyedRows.ts:95 | — |

#### swipe/pager (34)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| swipe/pager | G0 | `CS.landing` | CS:205 | the day a swipe brought in, drawn over the screen until the screen draws it | CS:763, 798 | CS:714, 796, 1650, 1658 | DayPeek instance; DayTrack parts transforms |
| swipe/pager | G0 | `CS.drawnWaits` + 1000 ms timer | CS:211, 717 | taps waiting for the landed day to be drawn | CS:716, 801 | CS:801-802 | CS.landing |
| swipe/pager | G0 | `CS.turning` | CS:209 | the chain of arrow/Today taps, one turn after another | CS:701 | CS:701 | ScreenPager.catches (read CS:700, 706) |
| swipe/pager | G1 | CarefulPace.slowSince / x / lastMove / reached | CarefulPace.ts:10-13 | Drag of the column switch went slow long enough to be careful | slowSince 28,31; x 17,35; lastMove 18,34; reached 32 | 31,32,26,22 (from ColumnSwitch.ts:139) | — |
| swipe/pager | G2 | `Swipe.press` (incl. `from`, `swiping`, `speed`) | Swipe.ts:94 | finger down that may become/ is a swipe | Swipe.ts:181, 185, 200, 203-204, 211 | Swipe.ts:180-181, 189-193, 210-217, 260 | pointer capture (205); arbiter `"swipe"` |
| swipe/pager | G2 | `Swipe.stream` (dx, following, stepped, recent, last, shrinking, timer) | Swipe.ts:95 | trackpad two-finger swipe in progress | Swipe.ts:119, 124-126, 130-132, 136-143, 157, 168, 173-174 | Swipe.ts:118, 124, 130-152, 169, 260 | arbiter `"swipe"` |
| swipe/pager | G2 | stream settle timer | Swipe.ts:126 | wheel stream not yet ended | Swipe.ts:126 | Swipe.ts:118, 125 | `stream.timer` |
| swipe/pager | G2 | `Swipe.holds` | Swipe.ts:97 | swipes/settlings holding the screen | Swipe.ts:243, 263, 268 | Swipe.ts:238, 242, 260, 268 | arbiter `"swipe"` |
| swipe/pager | G2 | `Swipe.round` | Swipe.ts:99 | sequence of forced stands; older settle completions ignored (guard token) | Swipe.ts:262 | Swipe.ts:248, 250 | `ScreenPager.catches` |
| swipe/pager | G2 | `Swipe.listening` (AbortController) | Swipe.ts:100 | swipe listeners alive | Swipe.ts:117 (abort) | Swipe.ts:106 | — |
| swipe/pager | G2 | pointer capture (swipe) | Swipe.ts:205 | finger swiping the screen | Swipe.ts:205, 214 | browser | `press.swiping` |
| swipe/pager | G2 | `ScreenPager.way` | ScreenPager.ts:47 | track being drawn and its direction | ScreenPager.ts:125, 150, 163, 175, 177 | ScreenPager.ts:72, 162, 173-174 | `shift` |
| swipe/pager | G2 | `ScreenPager.shift` | ScreenPager.ts:48 | direction the screen is drawn | ScreenPager.ts:65, 126, 151, 164 | ScreenPager.ts:67, 72, 77-78 | `way.shift` |
| swipe/pager | G2 | `ScreenPager.dx` | ScreenPager.ts:49 | offset the screen is drawn at | ScreenPager.ts:66, 135, 152, 165 | ScreenPager.ts:80, 82, 104, 110 | inline transforms of strip/day parts |
| swipe/pager | G2 | `ScreenPager.settling` (start, frame, timer) | ScreenPager.ts:50 | screen running to its place after let-go/arrow | ScreenPager.ts:83, 85-86, 106, 132, 137, 147 | ScreenPager.ts:103, 119, 131, 145 | `Swipe.holds` |
| swipe/pager | G2 | `ScreenPager.ending` | ScreenPager.ts:52 | promise of the settle under way | ScreenPager.ts:81 | ScreenPager.ts:121 | `settling` |
| swipe/pager | G2 | `ScreenPager.catches` | ScreenPager.ts:54 | count of catches; turn asked before last catch is dropped (guard token) | ScreenPager.ts:105 | ScreenPager.ts:95, 120-121; CS:700, 706 | `Swipe.round` |
| swipe/pager | G2 | strip parts `style.transform` (EdgeTrack) | ScreenTracks.ts:23 | screen giving past row end | ScreenTracks.ts:23 (via 42, 46) | browser | `ScreenPager.dx` |
| swipe/pager | G2 | day parts `style.transform` + `style.clipPath` (DayTrack) | ScreenTracks.ts:64-65 | days sliding through columns | ScreenTracks.ts:64-65, 69-70 (via 97-98, 109, 117) | browser | `ScreenPager.dx`; CS `landing.parts` (CS:763, 799) |
| swipe/pager | G2 | `DayTrack.nearer` | ScreenTracks.ts:80 | the next day is nearer (header names it) | ScreenTracks.ts:102 | ScreenTracks.ts:101, 111 | CS `titleDay` (CS:759) |
| swipe/pager | G2 | `StripTrack.animations` (paused Animations, `currentTime`) | ScreenTracks.ts:145 | strip scrubbed between places | ScreenTracks.ts:163-166, 172, 179 (cancel) | ScreenTracks.ts:172, 179 | wheel position (ColumnSwitch `at`) |
| swipe/pager | G2 | `DayPeek.day` | DayPeek.ts:63 | next day's tasks read | DayPeek.ts:115 | DayPeek.ts:81, 101 | DayData of the shown day (other day) |
| swipe/pager | G2 | `DayPeek.removed` | DayPeek.ts:68 | peek gone (guard flag) | DayPeek.ts:137 | DayPeek.ts:136, 144 | CS `landing` |
| swipe/pager | G2 | `DayPeek.el` inserted before `.tc-fade` | DayPeek.ts:77 | next day drawn under screen | DayPeek.ts:77 | — | — (removed 140) |
| swipe/pager | G2 | `ColumnSwitch.icons` | ColumnSwitch.ts:85 | wheel icon cells | ColumnSwitch.ts:128 | ColumnSwitch.ts:135, 244 | — |
| swipe/pager | G2 | `ColumnSwitch.press` (x, from, lastX, dragging, hold timer, pace) | ColumnSwitch.ts:87 | finger on the wheel | ColumnSwitch.ts:140, 158, 162, 167-168, 170, 186 | ColumnSwitch.ts:144, 150-171, 183-196, 255 | arbiter `"switch"` |
| swipe/pager | G2 | hold timer (`press.hold`) | ColumnSwitch.ts:136 | long press for sources pending | ColumnSwitch.ts:136 | ColumnSwitch.ts:156, 185 | — |
| swipe/pager | G2 | `ColumnSwitch.swallowClick` | ColumnSwitch.ts:89 | next click is the end of a drag/hold, not a tap | ColumnSwitch.ts:134, 145, 159, 190, 201 | ColumnSwitch.ts:200 | — |
| swipe/pager | G2 | `ColumnSwitch.settling` (timer) + `is-settling` class | ColumnSwitch.ts:90 | wheel animating to place | ColumnSwitch.ts:163, 215-216, 224 | ColumnSwitch.ts:214, 222 | — |
| swipe/pager | G2 | `ColumnSwitch.at` | ColumnSwitch.ts:92 | where the wheel stands (placeIndex units) | ColumnSwitch.ts:235 | ColumnSwitch.ts:251 (→167, 193) | settings place (`opts.value()`), CS `shownMode`, host CSS props |
| swipe/pager | G2 | host style props `windowAt/span/before/after`, icon `depth` | ColumnSwitch.ts:238 | wheel window position drawn on screen root | ColumnSwitch.ts:238-241, 246 | CSS | `at` |
| swipe/pager | G2 | pointer capture (wheel) | ColumnSwitch.ts:164 | finger dragging the wheel | ColumnSwitch.ts:164, 188 | browser | `press.dragging` |
| swipe/pager | G4 | `RibbonLayout.switching` (timeout id) | RibbonLayout.ts:38 | a slide between places is running | RibbonLayout.ts:141 | RibbonLayout.ts:109, 139, 193 | root `is-switching` |
| swipe/pager | G4 | root `is-switching` | RibbonLayout.ts:110, 140, 141 | strip sliding (transition on) | RibbonLayout.ts:110, 140, 141, 197 | styles.css | `switching` |

#### zoom (14)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| zoom | G0 | `CS.hourPx` | CS:177 | the timeline's hour height (zoom) | CS:964, 972, 982 | CS:268, 340, 357, 364, 732 | settings.zoom; PinchZoom.scaled; Timeline.hourShown; `--tc-hour` |
| zoom | G0 | `CS.wholeDay` | CS:198 | the pinch settled on the whole day: keep fitting as height changes | CS:963, 971, 978, 990 | CS:970 | settings.zoom === "wholeDay" |
| zoom | G0 | `CS.zoomFrame` (rAF id) | CS:196 | a pinch frame is pending | CS:980-981 | CS:970, 979 | PinchZoom.pinch |
| zoom | G2 | `PinchZoom.pointers` (Map) | PinchZoom.ts:32 | touch fingers on the timeline | PinchZoom.ts:69, 79, 86, 92 | PinchZoom.ts:62, 70, 74, 78, 80, 87 | — |
| zoom | G2 | `PinchZoom.pinch` | PinchZoom.ts:33 | pinch under way (start distance, hour, anchor) | PinchZoom.ts:72, 95 | PinchZoom.ts:53, 70, 80, 82, 87, 93-94 | arbiter `"pinch"` |
| zoom | G2 | `PinchZoom.wheelTimer` | PinchZoom.ts:34 | ctrl/cmd-wheel zoom still settling | PinchZoom.ts:119, 120 | PinchZoom.ts:118 | `lastAnchor` |
| zoom | G2 | `PinchZoom.lastAnchor` | PinchZoom.ts:35 | minute kept fixed during a wheel zoom | PinchZoom.ts:116, 121 | PinchZoom.ts:114-115 | — |
| zoom | G2 | `PinchZoom.scaled` | PinchZoom.ts:37 | hour height last asked for (not yet laid out) | PinchZoom.ts:102, 108 | PinchZoom.ts:103, 107, 117 | CS `hourPx` (CS:177, set in rAF CS:982); settings `zoom` |
| zoom | G2 | `PinchZoom.limits` | PinchZoom.ts:39 | min/max hour for the gesture under way | PinchZoom.ts:57, 73, 96, 114, 122 | PinchZoom.ts:57 | — |
| zoom | G2 | pointer capture on timeline (pinch) | PinchZoom.ts:74 | fingers held by pinch | PinchZoom.ts:74 (never explicitly released) | browser | `pinch` |
| zoom | G4 | `Timeline.minor` | Timeline.ts:126 | the finer lines/labels between hours drawn for the current zoom | Timeline.ts:652, 656 | Timeline.ts:394 | `minorEl` children (Timeline.ts:651-655), `Timeline.grid` |
| zoom | G4 | `Timeline.grid` | Timeline.ts:127 | which grid (label/line spacing in minutes) is drawn | Timeline.ts:650 | Timeline.ts:649 | `minor`, minorEl DOM |
| zoom | G4 | `Timeline.hourShown` | Timeline.ts:141 | hour height last written to CSS | Timeline.ts:387 | Timeline.ts:386 | `--tc-hour` on canvas (388); CS.hourPx (CS:177, written CS:964); deps.hourPx |
| zoom | G4 | `--tc-hour` on canvas | Timeline.ts:388 | hour height in px for CSS | Timeline.ts:388 | styles.css | `hourShown`, CS.hourPx |

#### scroll (35)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| scroll | G0 | `CS.scrolledFor` | CS:185 | the day the timeline was last scrolled to its opening point; another day scrolls anew | CS:517 (day start moved → null), 764 (swipe arrival), 1655 (draw) | CS:1654 | CS.selectedDate; Timeline.anchor |
| scroll | G0 | timeline `scrollTop` (DOM) read and re-held | CS:583, 626, 631, 590, 1650, 1673 | the timeline keeps its scroll across layout remounts, part moves and a landed swipe | CS:590, 631, 1673 (`holdScroll`), 1679 (`scrollTo`) | CS:583, 626, 1650 | Timeline.anchor / room / el.scrollTop |
| scroll | G0 | day list `scrollTop` (DOM) read | CS:739 | the shown day list's scroll handed to the peek of the next day | — | CS:739 | DayPeek list scrollTop (DayPeek.ts:117) |
| scroll | G1 | QEC.follow | QEC:156 | The field's list follows it into sight until a finger scrolls away | QEC:177,192,611,717,776 | QEC:455,605 | — |
| scroll | G1 | QEC.revealedAt (WeakMap Element→number) | QEC:158 | scrollTop the last reveal left each scroller at | QEC:651 (glide onStep),655,657 | QEC:173 | the scroller's real scrollTop |
| scroll | G1 | QEC.revealing | QEC:162 | The next layout pass must also bring the field into sight | QEC:440,452,470,600,710,777 | QEC:599 | FramePass.frame pending (QEC:160) |
| scroll | G1 | QEC.handScrolledAt | QEC:187 | Time of the last wheel/touchmove on the view | QEC:188 | QEC:176 | — |
| scroll | G1 | QEC.watchedScroller | QEC:190 | The scroller watched for size while the field is open | QEC:620 | QEC:618,619 | scrollerWatch observation set (QEC:619,621) |
| scroll | G1 | scroller.scrollTop (DOM) | QEC:656 | The field's list/timeline scroll position set by reveal | QEC:656; quick/ScrollGlide.ts:74 | QEC:174,651,655,657 | QEC.revealedAt |
| scroll | G1 | ScrollGlide.run (incl. start, frame, timer) | quick/ScrollGlide.ts:28 | A plugin-driven scroll in progress | quick/ScrollGlide.ts:38,54; .start 60; .frame 39,64; .timer 40 | quick/ScrollGlide.ts:31,49,59,68 | scroller.scrollTop |
| scroll | G2 | `AutoScroll.frame` | drag/AutoScroll.ts:41 | auto-scroll step pending (rAF id) | drag/AutoScroll.ts:68-69, 76-77, 92 | drag/AutoScroll.ts:68, 75, 91 | — |
| scroll | G2 | `AutoScroll.lastY` | drag/AutoScroll.ts:42 | last finger y, for heading direction | drag/AutoScroll.ts:61, 87 | drag/AutoScroll.ts:60 | — |
| scroll | G2 | `AutoScroll.scrolling` | drag/AutoScroll.ts:44 | auto-scroll is stepping | drag/AutoScroll.ts:74, 93 | drag/AutoScroll.ts:62, 66 | — |
| scroll | G2 | `AutoScroll.arrived` | drag/AutoScroll.ts:46 | time finger reached the edge (dwell) | drag/AutoScroll.ts:65, 94 | drag/AutoScroll.ts:62, 66 | — |
| scroll | G2 | scroller `scrollTop` (list or timeline) | drag/AutoScroll.ts:79 | how far the list/timeline is scrolled | drag/AutoScroll.ts:79 | drag/AutoScroll.ts:78, 80; drag/listFrame.ts:14 | — |
| scroll | G2 | peek `list.el.scrollTop` | DayPeek.ts:117 | next day list opens at shown list's scroll | DayPeek.ts:117, 122 | browser | shown day list scrollTop (CS:739) |
| scroll | G3 | `LiftedMenu.stopScroll` | menu/LiftedMenu.ts:35 | Cancels the column's smooth scroll that brings the card into view before opening | menu/LiftedMenu.ts:64 | menu/LiftedMenu.ts:123 | SmoothScroll's own running state |
| scroll | G3 | `PanelPages.scrolls` (Map, mutated) | menu/PanelPages.ts:21 | Each page's kept scroll offsets | menu/PanelPages.ts:28 | menu/PanelPages.ts:34 | DOM `scrollTop` of parts (written 35) |
| scroll | G3 | by-project list `scrollTop` / ScrollHold | projects/ProjectTasks.ts:174-175 | Scroll kept when same node redraws, reset otherwise | 174 (`hold.keep`), 175 | browser | — |
| scroll | G3 | tree `scrollTop` kept across redraw | projects/ProjectTree.ts:57, 72 | Tree scroll | 72 | 57 | — |
| scroll | G4 | `Timeline.frame` | Timeline.ts:138 | cached timeline box + canvas origin while a drop or stretch is shown | Timeline.ts:166, 217, 302, 319, 469, 546, 556 | Timeline.ts:213 | — (cache of DOM geometry) |
| scroll | G4 | `Timeline.room` | Timeline.ts:140 | empty room above first hour / below last hour so a minute can sit mid-screen | Timeline.ts:301 | Timeline.ts:275, 284, 300 | `--tc-room-top`/`--tc-room-bottom` on canvas (303-304) |
| scroll | G4 | `Timeline.anchor` | Timeline.ts:144 | a minute held at a fraction of visible height until the user touches/scrolls | Timeline.ts:149, 260, 266, 274 | Timeline.ts:289, 293, 294 | CS open-at minute (CS:1679) |
| scroll | G4 | `Timeline.el.scrollTop` | Timeline.ts:252, 281, 285, 296 (writes) | the timeline's vertical scroll | Timeline.ts:252, 281, 285, 296; CS:590, 631, 1673 (via holdScroll) | Timeline.ts:215, 218, 276, 282; CS:626 | `room`, `anchor` |
| scroll | G4 | `--tc-room-top`, `--tc-room-bottom` on canvas | Timeline.ts:303-304 | room around the day | Timeline.ts:303-304 | styles.css | `room` |
| scroll | G4 | `ScrollEdges.shown` | ScrollEdges.ts:36 | fade depths last written | ScrollEdges.ts:42 | ScrollEdges.ts:41 | `--tc-scrolled`, `--tc-scrolled-below` |
| scroll | G4 | `is-under-top`, `is-under-bottom` | ScrollEdges.ts:30-31 | content under an edge (fades) | ScrollEdges.ts:30-31 | styles.css | scrollTop |
| scroll | G4 | `--tc-scrolled`, `--tc-scrolled-below` | ScrollEdges.ts:43 | how much is under each edge | ScrollEdges.ts:43 | styles.css | `shown` |
| scroll | G4 | scroller `scrollTop/scrollHeight/clientHeight` (read) | ScrollEdges.ts:29-30 | position of list/timeline scroll | browser, KeyedRows, SmoothScroll.ts:22 | ScrollEdges.ts:29-30 | — |
| scroll | G4 | `ScrollHold.hold` | ScrollHold.ts:10 | room kept under the last row so a scrolled list doesn't jump while rows fold | ScrollHold.ts:49 | ScrollHold.ts:31, 42-44, 48 | `--tc-list-hold`, `is-holding` |
| scroll | G4 | `ScrollHold.timer` | ScrollHold.ts:11 | when the keep period ends | ScrollHold.ts:34 | ScrollHold.ts:33 | — |
| scroll | G4 | `ScrollHold.keeping` | ScrollHold.ts:13 | rows still folding: room stays whole | ScrollHold.ts:30, 35 | ScrollHold.ts:19 | — |
| scroll | G4 | `--tc-list-hold`, `is-holding` | ScrollHold.ts:50-52 | the held room in CSS | ScrollHold.ts:50-52 | styles.css | `hold` |
| scroll | G4 | `GLIDES` WeakMap (module) | SmoothScroll.ts:5 | one ScrollGlide per scroller | SmoothScroll.ts:17 | SmoothScroll.ts:16 | ScrollGlide.run (quick/ScrollGlide.ts) |
| scroll | G4 | `running` (closure let) | SmoothScroll.ts:27 | this glide still owns the scroller | SmoothScroll.ts:31, 37 | SmoothScroll.ts:36 | — |

#### text entry/quick bar (61)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| text entry/quick bar | G0 | `CS.activeEditor` | CS:184 | the quick field's editor while focused: Obsidian commands go to it | EmbeddedEditor.ts:73, 109 (G3) | TaskCalendarView (G1) | QEC.focused; activeElement |
| text entry/quick bar | G1 | WriteQueue.tail | quick/WriteQueue.ts:3 | Chain of quick-entry writes still to run | quick/WriteQueue.ts:8 | quick/WriteQueue.ts:8,18,20 | QES internal job ids (QES.ts:194-195) |
| text entry/quick bar | G1 | QEC.state | QEC:134 | The open entry: where the field stands, its text, marks, pending lines, renaming key; null = no field | QEC:415,705 | QEC:153,168,182,196,389,406,415,416,419,423,450,686,704,769,806,814 | QES.state (read QEC:415,761); root class `is-entering` (QEC:416); CS layout.hold("typing") (CS:1647,1660) |
| text entry/quick bar | G1 | QEC.field | QEC:135 | The open field (editor handle) | QEC:582,760,789 | QEC:234,262,263,321,533,628,728,806 | DOM: `.tc-quick-field` inside `.tc-quick-row` / timeline slot / menu stack row |
| text entry/quick bar | G1 | QEC.focused | QEC:137 | The field has taken focus once (later redraws only give it back) | QEC:427,790 | QEC:426 | document.activeElement (title.focused, QuickField.ts:67) |
| text entry/quick bar | G1 | QEC.turning | QEC:142 | The bar's place pick is turning the wheel right now (settle must not blur) | QEC:747,751 | QEC:383 | — (unrelated to CS `turning` day-turn chain despite the name) |
| text entry/quick bar | G1 | QEC.draws | QEC:145 | Count of screen drawings that reached the entry | QEC:414 | QEC:698,700 | — |
| text entry/quick bar | G1 | QEC.pressEnding | QEC:150 | The field just opened at the end of a press: the click/mouse events that press still sends are not a tap elsewhere | QEC:151 (any pointerdown resets),285,338 | QEC:153,196 | — |
| text entry/quick bar | G1 | root class `is-entering` | QEC:416 | Entry open: CSS hides wheel, toolbar, enlarges fades | QEC:416 | styles.css:767,839,845,854,972,975 | QEC.state !== null; CS layout.hold("typing") |
| text entry/quick bar | G1 | field element parent (DOM-held) | QEC:763-764, QEC:573 | Where the field element lives: in a list row, a timeline slot, a menu stack row; other row children removed | QEC:573,763,764 | QEC:262 (owns by parentElement),321,533,628 | QEC.state.spot |
| text entry/quick bar | G1 | QuickBar.state | quick/QuickBar.ts:98 | What the bar shows (indent, marks, place, project, repeat, section) | quick/QuickBar.ts:137 | quick/QuickBar.ts:357,367,368,369,370,403,413,427,471,487 | QEC.state (passed at QEC:729) |
| text entry/quick bar | G1 | QuickBar.shownPlace | quick/QuickBar.ts:100 | The place the place button shows | quick/QuickBar.ts:314 | quick/QuickBar.ts:166 | QuickBar.state.place |
| text entry/quick bar | G1 | QuickBar.leaving | quick/QuickBar.ts:103 | The desktop bar is fading out | quick/QuickBar.ts:196,206,219 | quick/QuickBar.ts:138,195,204,222 | bar.style.pointerEvents="none" (quick/QuickBar.ts:214) |
| text entry/quick bar | G1 | QuickBar.parts (array) | quick/QuickBar.ts:109 | Elements the bar owns on the page | quick/QuickBar.ts:182 | quick/QuickBar.ts:174 | — |
| text entry/quick bar | G1 | bar.hidden / mode.hidden | quick/QuickBar.ts:180,197,207,208,144 | Bar / section capsule visible | quick/QuickBar.ts:144,180,197,207,208 | quick/QuickBar.ts:138,204,249 | QuickBar.leaving; QEC.state |
| text entry/quick bar | G1 | bar class `is-gliding` | quick/QuickBar.ts:74 | Bar is sliding with the keyboard | quick/QuickBar.ts:128,257,262 | CSS | — |
| text entry/quick bar | G1 | bar class `is-idle` | quick/QuickBar.ts:148 | Desktop, section mode: bar idle | quick/QuickBar.ts:148 | quick/QuickBar.ts:269 | QuickBar.state.section |
| text entry/quick bar | G1 | section button parent, hidden, `is-set`, aria-pressed | quick/QuickBar.ts:142-147 | Section toggle placement and on/off | quick/QuickBar.ts:142,143,145,146,147 | CSS | QuickBar.state.section |
| text entry/quick bar | G1 | spacer/shifts/outdent/indent hidden & disabled | quick/QuickBar.ts:149-152 | Indent buttons shown/enabled | quick/QuickBar.ts:149,150,151,152 | CSS | QuickBar.state |
| text entry/quick bar | G1 | flag hidden, `is-set`, dataset.priority | quick/QuickBar.ts:153-157 | Priority button shown / its tint | quick/QuickBar.ts:153,155,156,157 | CSS (priorityColors rules) | QuickBar.state.marks.tint; field dataset.priority (quick/QuickField.ts:57) |
| text entry/quick bar | G1 | project hidden, `is-set`, aria-pressed | quick/QuickBar.ts:158-161 | Project button shown/lit | quick/QuickBar.ts:158,160,161 | CSS | QuickBar.state.project |
| text entry/quick bar | G1 | repeat hidden, `is-set`, aria-pressed | quick/QuickBar.ts:162-164 | Repeat button shown/lit | quick/QuickBar.ts:162,163,164 | CSS | QuickBar.state.repeat |
| text entry/quick bar | G1 | place hidden, icon/text, label `is-long` | quick/QuickBar.ts:165,315,316,322 | Place button shown, its words, long-name fade | quick/QuickBar.ts:165,315,316,322 | quick/QuickBar.ts:167 | QuickBar.shownPlace |
| text entry/quick bar | G1 | bar/mode style.pointerEvents | quick/QuickBar.ts:198,209,210,214 | Bar inert while fading out | quick/QuickBar.ts:198,209,210,214 | — | QuickBar.leaving |
| text entry/quick bar | G1 | field dataset.priority | quick/QuickField.ts:57 | Field text tint | quick/QuickField.ts:57,58 | CSS | QEC.state.marks.tint; flag dataset.priority |
| text entry/quick bar | G1 | field class `is-section` + placeholder | quick/QuickField.ts:76-77 | Field writes a section name | quick/QuickField.ts:76,77 | CSS | QEC.state.section; row class is-section (EntryRows.ts:86) |
| text entry/quick bar | G1 | MarkdownTitleField.quiet | quick/MarkdownTitleField.ts:22 | A text set by the owner is not input | quick/MarkdownTitleField.ts:80,103,107 | quick/MarkdownTitleField.ts:63 | — |
| text entry/quick bar | G1 | hint.textContent | quick/MarkdownTitleField.ts:91 | Placeholder words | quick/MarkdownTitleField.ts:91 | editor placeholder | — |
| text entry/quick bar | G1 | PlusButton.isHidden (+ button hidden class) | quick/PlusButton.ts:27 | Plus hidden (entry open, card lifted, plus carried) | quick/PlusButton.ts:52,53 | quick/PlusButton.ts:37,58 | QEC.state/dragging/carrying (QEC:686) |
| text entry/quick bar | G1 | EntryRows.created | EntryRows.ts:41 | Ids of tasks the field wrote, awaiting their card to take the typed row | EntryRows.ts:106,112,117 | EntryRows.ts:104 | QES pending/shown state; QEC:514 adopt fan-out |
| text entry/quick bar | G1 | EntryRows.renamedDrawn | EntryRows.ts:43 | Last drawing had a renamed card | EntryRows.ts:53 | EntryRows.ts:52 | — |
| text entry/quick bar | G1 | EntryRows.renaming | EntryRows.ts:44 | Key of the task being renamed in this drawing | EntryRows.ts:54 | EntryRows.ts:60,93 | QES.renaming (QEC:395) |
| text entry/quick bar | G1 | EntryRows.written | EntryRows.ts:46 | How many typed texts became cards in this drawing | EntryRows.ts:55,107 | EntryRows.ts:72,107 | — |
| text entry/quick bar | G1 | row style level, row class `is-section`, progress dot | EntryRows.ts:66,86,95-96 | Field row's indent level, section look, renamed task's progress dot | EntryRows.ts:66,84,86,95,96 | CSS | QEC.state.place.level / section |
| text entry/quick bar | G1 | RenamedTexts SOURCES (module Set) | RenamedTexts.ts:13 | Entries whose unwritten renames every card shows | RenamedTexts.ts:29,32,35 | RenamedTexts.ts:41 (from TaskCard.ts:49,87; Timeline.ts:684) | QES.renamed (QEC:217); FullScreen entry (full/FullScreen.ts:104) |
| text entry/quick bar | G1 | add closure `ended` | RenamedTexts.ts:26 | The entry owner closed; drop once nothing waits | RenamedTexts.ts:34 | RenamedTexts.ts:29 | — |
| text entry/quick bar | G1 | group name input focus/selection | GroupNameField.ts:34-35 | Section-name field has keyboard | GroupNameField.ts:34,35 | — | SectionNameEntry (core) done-once state |
| text entry/quick bar | G2 | `FreeRoomDoubleClick.mouse` | FreeRoomDoubleClick.ts:6 | last press was a mouse | FreeRoomDoubleClick.ts:13 | FreeRoomDoubleClick.ts:15 | — |
| text entry/quick bar | G3 | `TaskMenu.stackRow` | menu/TaskMenu.ts:171 | Row in the stack where a new subtask is typed | menu/TaskMenu.ts:274 | menu/TaskMenu.ts:273, 294, 298, 319 | `QEC.stack.row` (QEC:538) |
| text entry/quick bar | G3 | `TaskMenu.fieldRow` | menu/TaskMenu.ts:173 | Row that replaces the copy while a stack card is renamed | menu/TaskMenu.ts:258 (`??=`) | menu/TaskMenu.ts:246 | `QEC.stack.row` (QEC:544) |
| text entry/quick bar | G3 | `TaskMenu.fieldClosed` | menu/TaskMenu.ts:175 | Who to tell (and how) when the menu closes while typing in it | menu/TaskMenu.ts:256, 271 | menu/TaskMenu.ts:617 | `QEC.stack` (QEC:538, 544) |
| text entry/quick bar | G3 | `FullScreen.editing` | full/FullScreen.ts:62 | The live description editor | FullScreen.ts:279, 309 | FullScreen.ts:149, 277, 282-283, 300-301, 308 | EmbeddedEditor CodeMirror doc |
| text entry/quick bar | G3 | `FullScreen.draft` | full/FullScreen.ts:64 | Whether the description has unsaved typing / should be replaced by the file's | FullScreen.ts:278, 310 | FullScreen.ts:277, 282, 287, 300 | `editing.value`; file description |
| text entry/quick bar | G3 | `FullScreen.saveTimer` | full/FullScreen.ts:65 | Pending 600 ms description write | FullScreen.ts:289, 298 | FullScreen.ts:282, 288, 297 | `draft` typed flag |
| text entry/quick bar | G3 | `FullScreen.state` | full/FullScreen.ts:68 | Quick-entry session state (typed text, renaming target) | FullScreen.ts:336 | FullScreen.ts:329, 381, 384, 401 | `QuickEntrySession` internal state (core) |
| text entry/quick bar | G3 | `FullScreen.field` | full/FullScreen.ts:69 | The subtask field in the list | FullScreen.ts:372 (`??=`), 408, 416 | FullScreen.ts:226, 347, 349, 357-358, 373, 401, 415 | DOM `.tc-quick-row` |
| text entry/quick bar | G3 | `FullScreen.focused` | full/FullScreen.ts:71 | The field took focus once already | 348, 409, 417 | 347 | `field.focused` |
| text entry/quick bar | G3 | `FullScreen.titleField` | full/FullScreen.ts:72 | Title is being renamed in place | 439, 447 | 422, 445, 458 | `state.renaming` is the screen's task |
| text entry/quick bar | G3 | `FullScreen.leavingTitle` | full/FullScreen.ts:74 | Ended title rename whose write is still pending | 424, 448, 451 | 423, 450, 458 | — |
| text entry/quick bar | G3 | RenamedTexts registration (`renames`) | full/FullScreen.ts:79, 104 | Renames typed here are told to every card until written | 104 (add) | 208 (remove) | `RenamedTexts` module SOURCES set |
| text entry/quick bar | G3 | static `EmbeddedEditor.editorClass` | markdown/EmbeddedEditor.ts:55 | Cached Obsidian editor class | 115 (`??=`) | 115 | — |
| text entry/quick bar | G3 | `host.activeEditor` (on CS, CS:184) | markdown/EmbeddedEditor.ts:73, 109 | Which embedded editor Obsidian's commands act on | EmbeddedEditor.ts:73, 109 | Obsidian (via view's `activeEditor`) | ObsidianMarkdown `held` (focus) |
| text entry/quick bar | G3 | `owner.editMode` / `owner.editor` | markdown/EmbeddedEditor.ts:70-71 | Owner points at its editor | 70-71 | Obsidian | — |
| text entry/quick bar | G3 | CodeMirror doc / selection / focus | markdown/EmbeddedEditor.ts:94, 99-100, 105 | The text and caret of an embedded editor | 72, 94, 99, 100, 105 | 77, 87, 93 | `FullScreen.draft` |
| text entry/quick bar | G3 | `markdown-rendered` class | markdown/ObsidianMarkdown.ts:20, 26 | Element shows rendered markdown vs editor | 20, 26 | CSS | — |
| text entry/quick bar | G3 | pending `askProjectName` slot + Promise | projects/TreePanel.ts:94-108 | New project name field open at a tree gap | 94-97 | 103-104 (removed on done) | `CS` awaits it (CS:1124) |
| text entry/quick bar | G4 | `Timeline.field` ({at, box}) | Timeline.ts:143 | the quick-entry field shown over the day: a new task's in a slot, or a rename over a card | Timeline.ts:496, 505, 511 | Timeline.ts:494, 504, 518, 525, 581, 585 | `is-renaming` on blocks (489, 497, 692); QuickEntryController state (quick/QuickEntryController.ts:566-568); TaskList `is-renaming` |
| text entry/quick bar | G4 | `is-renaming` on task block | Timeline.ts:489, 497, 692 | card hidden under the rename field | Timeline.ts:489, 497, 692 | styles.css | `Timeline.field` |
| text entry/quick bar | G4 | field box `hidden`, `--tc-y/len/x`, `.tc-field-time` text, class `is-slot`/`is-rename` | Timeline.ts:482, 509, 520-521, 585 | where the field sits on the day | Timeline.ts:482, 509, 520-521, 585 | Timeline.ts:481 (querySelector `.tc-field-time` as state), 504 (field.parentElement) | `Timeline.field` |
| text entry/quick bar | G4 | `TaskList.slot` | TaskList.ts:108 | place where the name of a pending section is typed | TaskList.ts:238 | TaskList.ts:266 | deps.pending (CS naming) |
| text entry/quick bar | G4 | card `is-renaming` | TaskList.ts:182 | card hidden while its rename field stands | TaskList.ts:182 | styles.css | EntryRows renames (EntryRows.ts), Timeline `is-renaming` |

#### menus/overlays/full/search (67)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| menus/overlays/full/search | G0 | `CS.search` | CS:169 | the search window is open | CS:851, 859, 862 | CS:849 | SearchWindow.closed; Overlay.ending |
| menus/overlays/full/search | G0 | `CS.full` | CS:171 | a task is on the whole screen | CS:1319, 1332 | CS:447, 528, 1315, 1330, 1334, 1392, 1394-1395 | FullScreen.closed; `is-shown` on the sheet |
| menus/overlays/full/search | G0 | `showMenu` closure `current` | CS:1354 | the task as the open menu last saw it (a label toggle gives it a new key) | CS:1378, 1387 | CS:1368-1397 | TaskMenu.context |
| menus/overlays/full/search | G1 | QEC.stack | QEC:143 | A calendar task menu holds the field in its subtask stack (or renames a stack card) | QEC:538,544,551,575 | QEC:550,569,640,673 | TaskMenu's own open-stack state (menu.openStack/openRename) |
| menus/overlays/full/search | G1 | QuickBar.panel (incl. .picking, .drawn) | quick/QuickBar.ts:101 | The open bar panel (priority/project/repeat/place), whether it shows the picker/name page, and what it was drawn for | quick/QuickBar.ts:333,346; .picking 459,481; .drawn 376 | quick/QuickBar.ts:292,299,326,342,344,355,356,359,374,395,457,480 | bar.dataset.panel (quick/QuickBar.ts:334,347); panel element in DOM |
| menus/overlays/full/search | G1 | bar class `is-over` + bar parent (view vs body) | quick/QuickBar.ts:235-238 | Bar moved over a menu's blur (in body) | quick/QuickBar.ts:235,237,238 | CSS | QEC.stack |
| menus/overlays/full/search | G1 | bar.dataset.panel | quick/QuickBar.ts:334 | Which panel is open | quick/QuickBar.ts:334,347 | CSS | QuickBar.panel.kind |
| menus/overlays/full/search | G1 | panel classes `is-above`/`is-below`/`is-picker` | quick/QuickBar.ts:302,303,377 | Panel side; month picker showing | quick/QuickBar.ts:302,303,377 | CSS | QuickBar.panel.picking |
| menus/overlays/full/search | G1 | renderProject closure `asking` | quick/QuickBar.ts:439 | The new-project name page is still asking | quick/QuickBar.ts:442,449 | quick/QuickBar.ts:441 | QuickBar.panel.picking |
| menus/overlays/full/search | G2 | `BulkController.menu` | BulkController.ts:66 | bulk menu is open | BulkController.ts:181, 213 | BulkController.ts:150, 155 | BulkMenu overlay DOM |
| menus/overlays/full/search | G2 | `FoundCard.id` | FoundCard.ts:21 | task the search led to | FoundCard.ts:27, 42 | FoundCard.ts:33, 49 | `is-found` class |
| menus/overlays/full/search | G2 | `FoundCard.scroll` | FoundCard.ts:22 | first drawing should scroll found card into sight | FoundCard.ts:28, 37, 43 | FoundCard.ts:36 | — |
| menus/overlays/full/search | G2 | `FoundCard.cards` (Set) + `is-found` class | FoundCard.ts:23 | cards wearing the found ring | FoundCard.ts:34-35, 44-45 | FoundCard.ts:44 | `id` |
| menus/overlays/full/search | G3 | `TaskMenu.context` (non-readonly) | menu/TaskMenu.ts:200 | The task the menu is for, as the menu last saw it (replaced after a label or project toggle) | menu/TaskMenu.ts:200 (ctor), 416, 503 | menu/TaskMenu.ts:207-219, 229, 234, 239, 316, 329, 348-349, 442-444, 460, 466, 487-489, 512, 537, 541, 555, 578-579 | CS:1365 local `current` in `showMenu` (updated CS:1377, 1388); `TaskItem` in the list it was drawn from |
| menus/overlays/full/search | G3 | `TaskMenu.panel` | menu/TaskMenu.ts:165 | The menu's lower panel element | menu/TaskMenu.ts:216 | menu/TaskMenu.ts:178, 282, 338, 346-347, 363-396, 436, 464, 467, 485, 488, 511, 520, 535, 538-541, 553, 558, 576, 580 | `Overlay.parts` entry (menu/Overlay.ts:67) |
| menus/overlays/full/search | G3 | `TaskMenu.upper` (+ its `hidden`) | menu/TaskMenu.ts:167 | The part of a too-tall menu split above the card; hidden while the panel is whole | menu/TaskMenu.ts:217, 218 (`hidden=true`); menu/MenuPanel.ts:288, 303-309 (className, hidden, children) | menu/TaskMenu.ts:178, 283, 338-340, 346, 437 | `is-above` class on panel/upper (menu/MenuPanel.ts:305, 312) |
| menus/overlays/full/search | G3 | `TaskMenu.anchor` | menu/TaskMenu.ts:168 | Screen box the panel is placed against (copy, plus the subtask stack under it) | menu/TaskMenu.ts:213 | menu/TaskMenu.ts:338-340 | `LiftedMenu.copy` (menu/LiftedMenu.ts:30) when no stack |
| menus/overlays/full/search | G3 | `TaskMenu.stack` | menu/TaskMenu.ts:170 | The timeline card's subtask stack element under the copy | menu/TaskMenu.ts:272 (`??=`), 303 | menu/TaskMenu.ts:247, 272, 292 | DOM children; core subtasks of `context.item` |
| menus/overlays/full/search | G3 | `TaskMenu.peek` | menu/TaskMenu.ts:176 | The description preview over the copy (null when none) | menu/TaskMenu.ts:219 | menu/TaskMenu.ts:284, 339, 340 | — |
| menus/overlays/full/search | G3 | `TaskMenu.pages` (readonly container, mutated) | menu/TaskMenu.ts:178 | Which page of the menu shows and each page's scroll | menu/TaskMenu.ts:344, 462, 483, 509, 533, 551, 562, 574 (via `PanelPages.show`) | menu/panel pages | `Panel.shown` is not used here (TaskMenu builds raw panels) |
| menus/overlays/full/search | G3 | `TaskMenu.asking` | menu/TaskMenu.ts:180 | Which question (Delete / a status that asks first) replaces its row now | menu/TaskMenu.ts:427 | menu/TaskMenu.ts:362, 395 | `confirmAsked` (183) and the Enter listener (430) |
| menus/overlays/full/search | G3 | `TaskMenu.confirmAsked` | menu/TaskMenu.ts:183 | What Enter confirms while a question shows | menu/TaskMenu.ts:428, 446 | menu/TaskMenu.ts:187, 190 | `asking` (180) |
| menus/overlays/full/search | G3 | Enter key listener on `keysDoc` (capture) | menu/TaskMenu.ts:185-191 | Enter confirms the question while one is asked | add 430; remove 429, 613 | event loop | `asking` |
| menus/overlays/full/search | G3 | `TaskMenu.labelling` | menu/TaskMenu.ts:198 | A label toggle is being written; further label taps are ignored | menu/TaskMenu.ts:411, 421 | menu/TaskMenu.ts:410 | `BulkMenu.labelling` (separate) |
| menus/overlays/full/search | G3 | `TaskMenu.keysDoc` (readonly) | menu/TaskMenu.ts:185 | The window the menu opened in (captured `activeDocument`) | ctor | 429-430, 613 | `Overlay.doc` (menu/Overlay.ts:45) |
| menus/overlays/full/search | G3 | local `asking` closure in `showProjectName` | menu/TaskMenu.ts:513 | The new-project name page still waits for an answer | menu/TaskMenu.ts:516, 523 | menu/TaskMenu.ts:515 | — |
| menus/overlays/full/search | G3 | window `pointerdown` capture listener + `until` | menu/TaskMenu.ts:595-609 | A second press within a double-click time closes the menu and renames | add 609; remove 602 | event loop | — |
| menus/overlays/full/search | G3 | `lifted` classes `is-block`, `tc-invisible` | menu/TaskMenu.ts:209, 257 | Copy is a timeline block; copy hidden while its card is the field | 209, 257; menu/EventMenu.ts:24 | menu/TaskMenu.ts:417 (`is-block`) | — |
| menus/overlays/full/search | G3 | panel classes `is-picker`, `is-repeat`, `has-remove` | menu/TaskMenu.ts:347; menu/DatePage.ts:17; repeat/RepeatPanel.ts:54, 65 | Which page shape the panel is (date grid, repeat editor) | add DatePage.ts:17, RepeatPanel.ts:54, 65; remove TaskMenu.ts:347, BulkMenu.ts:115 | CSS | page name in `PanelPages.page` |
| menus/overlays/full/search | G3 | `LiftedMenu.gone` | menu/LiftedMenu.ts:34 | The menu was closed (possibly before it ever opened) | menu/LiftedMenu.ts:122 | menu/LiftedMenu.ts:45 (`isClosed`), 67; TaskMenu.ts:414, 501 | `Overlay.ending` (`overlay.isClosed`) |
| menus/overlays/full/search | G3 | `Overlay.parts` (readonly array, pushed) | menu/Overlay.ts:19 | Every element laid over the sheet for this menu | menu/Overlay.ts:67, 75 | menu/Overlay.ts:174 | DOM under `body` / `.tc-level` |
| menus/overlays/full/search | G3 | `Overlay.level` | menu/Overlay.ts:21 | Shared `.tc-level` holder so parts share one shadow | menu/Overlay.ts:87 | menu/Overlay.ts:66, 86, 88, 159, 174 | DOM `.tc-level` |
| menus/overlays/full/search | G3 | `Overlay.ending` | menu/Overlay.ts:22 | The overlay began closing (the fade promise) | menu/Overlay.ts:122, 133 | menu/Overlay.ts:68, 76, 95, 101 (`isClosed`), 106, 119, 131; BulkMenu.ts:169, 211, 256; LiftedMenu.ts:124 | `LiftedMenu.gone`; `SearchWindow.closed`; `Picks.picked`; presence of `.tc-backdrop` (read FullScreen.ts:482, CS:893) |
| menus/overlays/full/search | G3 | `Overlay.gone` | menu/Overlay.ts:24 | All parts have left the page | menu/Overlay.ts:160, 164 | menu/Overlay.ts:106 | DOM absence of parts |
| menus/overlays/full/search | G3 | `Overlay.retired` (Set, mutated) | menu/Overlay.ts:26 | Parts faded out while the overlay stays (panel given to a field; dropped sheet) | menu/Overlay.ts:139 | menu/Overlay.ts:95 | `is-closing` class + `pointerEvents:none` on the part |
| menus/overlays/full/search | G3 | classes `is-shown` / `is-closing` on backdrop, level and parts | menu/Overlay.ts:8-9 | Fade-in / fade-out state of every overlay part | menu/Overlay.ts:59, 68, 76, 88, 95, 140-141, 153-154 | menu/Overlay.ts:68, 76, 88; menu/PanelPages.ts:29 (`is-shown` on panel = open) | `ending` |
| menus/overlays/full/search | G3 | inline `pointer-events:none` on parts | menu/Overlay.ts:142, 155 | A fading part takes no presses | 142, 155 | browser | `is-closing` |
| menus/overlays/full/search | G3 | document `keydown` capture (Escape) + backdrop `pointerdown` | menu/Overlay.ts:28-36, 60-61 | Escape / tap on sheet closes the overlay | add 60, 61; remove 146, 147 | event loop | — |
| menus/overlays/full/search | G3 | `.tc-backdrop` element in `body` | menu/Overlay.ts:58 | A menu/overlay is open (DOM fact other code reads) | created 58; handed over 131/134; removed 158 | FullScreen.ts:482; CS:893; BC:49 (`KEEPS`) | `Overlay.ending` |
| menus/overlays/full/search | G3 | `data-owns-escape` attribute | menu/Overlay.ts:184 | A field inside a menu takes Escape itself | (set by GroupNameField, not in G3) | menu/Overlay.ts:180 | — |
| menus/overlays/full/search | G3 | `Picks.picked` | kit/Panel.ts:17 | This window's one pick has been made | kit/Panel.ts:66, 76, 86 | kit/Panel.ts:65, 75, 85 | `Overlay.ending` (pick closes it) |
| menus/overlays/full/search | G3 | static `Picks.waiting` (Set) | kit/Panel.ts:19 | Picks whose action has not run yet (window still fading) | kit/Panel.ts:36, 38 | kit/Panel.ts:29 (`settled`) → CS:903 | — |
| menus/overlays/full/search | G3 | static `Picks.runningNow` | kit/Panel.ts:20 | A pick's action is starting right now (synchronous window) | kit/Panel.ts:44, 48 | kit/Panel.ts:24 (`running`) → CS:903 | — |
| menus/overlays/full/search | G3 | `giveUp` timer per pick | kit/Panel.ts:41 | Pending 2000 ms release of a pick from `waiting` | 41; cleared 51 | — | — |
| menus/overlays/full/search | G3 | `Panel.shown` | kit/Panel.ts:125 | Name of the page the window shows | kit/Panel.ts:164 | kit/Panel.ts:156 | `PanelPages.page` (menu/PanelPages.ts:20) |
| menus/overlays/full/search | G3 | `is-shown` on a non-overlay panel | kit/Panel.ts:139 | A `Panel.inside` window grown in | 139 | menu/PanelPages.ts:29 | — |
| menus/overlays/full/search | G3 | `PanelPages.page` | menu/PanelPages.ts:20 | Current page name of a panel | menu/PanelPages.ts:33 | menu/PanelPages.ts:28 | `Panel.shown` |
| menus/overlays/full/search | G3 | module `MORPHS` (WeakMap) | menu/PanelPages.ts:12 | The running grow/fold animation of each panel part | menu/PanelPages.ts:59, 84 | menu/PanelPages.ts:31 (cancel), 63, 86 | — |
| menus/overlays/full/search | G3 | `part.hidden` / inline `overflow` during morph | menu/PanelPages.ts:51, 60, 62, 64, 76, 86 | A part folding away / growing | 51, 60, 62, 64, 76, 86 | browser, PanelPages.ts:41, 48 | `upper.hidden` set by placePanel |
| menus/overlays/full/search | G3 | switch `is-on` / `aria-checked` flipped on tap | menu/MenuPanel.ts:201, 205-207 | Folder switch shown at its new side before the write | 201, 206-207 | CSS | core `ProjectFolderSwitch.on` (GroupMenu.ts:81) until reread |
| menus/overlays/full/search | G3 | tile `is-on`, `dataset.priority`, `disabled` | menu/MenuPanel.ts:99-101 | Which priority/label is set on the task(s) | 99-101 | CSS | model `levels/labels.tiles[].on` |
| menus/overlays/full/search | G3 | `BulkMenu.context` (non-readonly) | menu/BulkMenu.ts:74 | The picked tasks as last seen | menu/BulkMenu.ts:74, 171, 213 | menu/BulkMenu.ts:88, 98, 106, 120-121, 150, 168, 180, 182, 196, 200, 210, 219, 241-242, 258 | `BC` local `items` (BC:173, 199, 207); selection (`BC.selection.renew` BC:196, 205) |
| menus/overlays/full/search | G3 | `BulkMenu.labelling` | menu/BulkMenu.ts:70 | A label toggle for the picked tasks is being written | 166, 174 | 165 | — |
| menus/overlays/full/search | G3 | `BulkMenu.asking` | menu/BulkMenu.ts:72 | Which question replaces its row | 145, 183, 197, 243 | 124, 139 | — |
| menus/overlays/full/search | G3 | local `asking` in `BulkMenu.showProjectName` | menu/BulkMenu.ts:220 | Name page still waiting | 223, 232 | 222 | — |
| menus/overlays/full/search | G3 | `BulkMenu` instance held | BC:181 | Bulk menu is open | BC:181, 213 | BC | `Overlay.ending` |
| menus/overlays/full/search | G3 | closure `asking` arg of `ProjectMenu.show` | menu/GroupMenu.ts:77 | Delete question is showing in the project menu | GroupMenu.ts:90, 98, 102 | GroupMenu.ts:90 | — |
| menus/overlays/full/search | G3 | DescriptionPeek classes `is-away`, `is-under`, `is-cut`; inline `top/bottom/left/max-height` | menu/DescriptionPeek.ts:57-59, 78-80, 86, 90-92, 97-99, 104 | Peek hidden / below the copy / text cut off; its place | same lines | CSS | — |
| menus/overlays/full/search | G3 | `FullScreen.stack` | full/FullScreen.ts:50 | Tasks opened one inside another; last one is on screen | FullScreen.ts:146, 178, 184, 192, 266, 272 | FullScreen.ts:138 (`current`) | `CS.full` (CS:1319) holds the screen; core task in file |
| menus/overlays/full/search | G3 | `FullScreen.reading` | full/FullScreen.ts:76 | Refresh sequence number: only the newest read draws | 167 | 176 | — |
| menus/overlays/full/search | G3 | `FullScreen.closed` | full/FullScreen.ts:77 | Screen is closed | 207 | 168, 176, 206, 271, 341, 458, 479 | `CS.full === null` (CS:1332) |
| menus/overlays/full/search | G3 | document `keydown` listener (Escape) | full/FullScreen.ts:80, 133 | Escape closes the screen | add 133 | remove 212 | — |
| menus/overlays/full/search | G3 | `is-shown` class on full sheet | full/FullScreen.ts:134, 213 | Full screen faded in | 134, 213 | CSS | `closed` |
| menus/overlays/full/search | G3 | `SearchWindow.rows` | search/SearchWindow.ts:36 | Result rows drawn for the last answer | 108 | 84, 121, 128-131 | — |
| menus/overlays/full/search | G3 | `SearchWindow.picked` | search/SearchWindow.ts:37 | Keyboard-highlighted row (desktop) | 111, 130 | 121, 129-130 | `is-picked` class (129, 132) |
| menus/overlays/full/search | G3 | `SearchWindow.asked` | search/SearchWindow.ts:39 | Search sequence number; older answers dropped | 78, 100 | 102 | — |
| menus/overlays/full/search | G3 | `SearchWindow.closed` | search/SearchWindow.ts:40 | Search window closed | 77 | 76, 94 | `CS.search` (CS:851, 859, 862); `Overlay.ending` |

#### layout sizes (44)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| layout sizes | G0 | root class `is-docking` + `CS.docking` timer | CS:130, 1503-1504 | the docked panel is mid-slide | CS:1502-1504 | CSS | — |
| layout sizes | G1 | QuickBar.desk | quick/QuickBar.ts:105 | Desktop capsule's room and side (above/below field) | quick/QuickBar.ts:243 | quick/QuickBar.ts:301,389 | bar inline left/top |
| layout sizes | G1 | QuickBar.anchor | quick/QuickBar.ts:107 | Field box the bar last stood by | quick/QuickBar.ts:232 | quick/QuickBar.ts:389 | QEC.measure result |
| layout sizes | G1 | bar/mode class `is-away` | quick/QuickBar.ts:244,274 | Desktop capsule out of sight (field not visible) | quick/QuickBar.ts:244,274 | CSS | QuickBar.desk === null |
| layout sizes | G1 | bar style.transform | quick/QuickBar.ts:255 | Start offset of the keyboard slide | quick/QuickBar.ts:255,258,263 | — | `is-gliding` |
| layout sizes | G1 | bar style left/top/width/bottom; mode left/top | quick/QuickBar.ts:280,275,276 | Bar position (desktop by field / phone docked over menu) | quick/QuickBar.ts:280,275,276 (via restyle 504-507) | quick/QuickBar.ts:505 | QuickBar.desk |
| layout sizes | G1 | ObsidianChrome.statusBar | quick/ObsidianChrome.ts:8 | Cached Obsidian status bar element | quick/ObsidianChrome.ts:14 | quick/ObsidianChrome.ts:15,19 | StatusBarRoom body class `tc-status-bar-shown` |
| layout sizes | G1 | wrapWhenNarrow `width` + rows class `is-wrapped` | SettingsTab.ts:428,424,426 | Colour rows wrapped on narrow width | SettingsTab.ts:424,426,432 | SettingsTab.ts:431 | — |
| layout sizes | G2 | peek column inline `left/top/width/height/bottom/margin/padding` | DayPeek.ts:44-50 | peek stands over screen's columns | DayPeek.ts:44-50 (via 90, 92) | browser | — |
| layout sizes | G2 | `tc-invisible` on peek list | DayPeek.ts:91 | no day list in this layout | DayPeek.ts:91 | CSS | — |
| layout sizes | G2 | peek `right` style property `allDayExtraRows` | DayPeek.ts:147 | all-day rows offset | DayPeek.ts:147 | CSS | CS `rightEl` same property (CS:741) |
| layout sizes | G2 | `Divider.press` (incl. `snapped`) | Divider.ts:32 | divider being dragged; whether held at middle | Divider.ts:60, 79, 88 | Divider.ts:68, 75, 77-79, 84-85, 89 | arbiter `"divider"`; SnapGlide width |
| layout sizes | G2 | `Divider.glide` (SnapGlide state) | Divider.ts:34 | width shown while the step to/from middle glides | Divider.ts:61, 80, 89 | Divider.ts:90 | `--tc-list-width` / tree width props (RibbonLayout.ts:72, TreePanel.ts:64) |
| layout sizes | G2 | pointer capture (divider) | Divider.ts:62 | finger on divider | Divider.ts:62, 87 | browser | `press` |
| layout sizes | G3 | inline `top` of `fieldRow` and `stack` | menu/TaskMenu.ts:246-247 | Field row/stack raised with the copy above the keyboard | 246-247 | CSS | `LiftedMenu.raisedBy` |
| layout sizes | G3 | `LiftedMenu.copy` | menu/LiftedMenu.ts:30 | Where the card copy stands before raising | menu/LiftedMenu.ts:86 | menu/TaskMenu.ts:245, 247, 259, 272; LiftedMenu.ts:102 | `LiftedCopy.rect` (kit/LiftedCopy.ts:6) |
| layout sizes | G3 | inline `top` of lifted copy | menu/LiftedMenu.ts:102 | Copy raised | 102 | CSS | `raisedBy` |
| layout sizes | G3 | panel `left`, `--panelY` property, `max-height`, `is-above`, `is-scrolled` | menu/MenuPanel.ts:274-275, 293-294, 302-314 | Where a menu panel stands, whether above its anchor, whether it scrolls | MenuPanel.ts:274-275, 288, 293-294, 302-314 | TaskMenu.ts:436 (`is-above`); DescriptionPeek.ts:49, 71 (`is-above`, `style.left`); PanelPages.ts:41, 71-72 | — |
| layout sizes | G3 | `is-long` on labels | menu/MenuPanel.ts:229 | Label too long for its tile/row (fades) | 229 | CSS | — |
| layout sizes | G3 | search panel style props `searchLeft/Top/Room` | search/SearchWindow.ts:139-141 | Where the desktop search hangs | 139-141 | CSS | — |
| layout sizes | G3 | copy style props `windowAt/span/before/after` | sources/SourcesPopover.ts:38 | The sources copy keeps the wheel's place values | 38 | CSS | wheel element's computed style |
| layout sizes | G3 | `LiftedCopy.rect` | kit/LiftedCopy.ts:6 | Where a lifted copy is pinned | 16 | LiftedMenu.ts:86 | `LiftedMenu.copy` |
| layout sizes | G3 | root style `--tree-width` | projects/TreePanel.ts:63, 84-85 | Tree panel width (live while dragging the divider, then settings) | TreePanel.ts:63, 84, 85 | CSS; TreePanel ResizeObserver (55) | `settings.treeWidth` (CS:1599, written via CS:1600); Divider's own drag state |
| layout sizes | G3 | closure `seen` in TreePanel ResizeObserver | projects/TreePanel.ts:53 | Last width told to the screen | 57 | 56 | `el.offsetWidth` |
| layout sizes | G4 | `Timeline.hours[].label.textContent` (hour label words) | Timeline.ts:124 | the hour each of the 25 hour lines is labelled with (shifts with the day boundary) | Timeline.ts:160 (create), 321 | DOM only | `DayBoundary.startHour` (core), CS.boundary() |
| layout sizes | G4 | `--tc-y` on hour lines and labels | Timeline.ts:396-397 | each line's y | Timeline.ts:396-397 | styles.css | derived from hourPx |
| layout sizes | G4 | `--tc-stack-end` on canvas | Timeline.ts:593 | bottom of last card (lengthens the day past midnight) | Timeline.ts:593 | styles.css | — |
| layout sizes | G4 | `--tc-allday-extra-rows` on timeline column | AllDayRow.ts:29 | number of all-day rows beyond the first | AllDayRow.ts:29; DayPeek.ts:147 | CS:741 (read back for DayPeek); styles.css | CS `data.allDay.length` |
| layout sizes | G4 | root `--tc-list-width` | RibbonLayout.ts:72, 130 | list column width in the ribbon | RibbonLayout.ts:72 (divider drag), 130 (frame) | styles.css | settings.listShare (CS:606); Divider SnapGlide.shown |
| layout sizes | G4 | `RowsLayout.holds` | RowsLayout.ts:39 | rows' heights frozen: "carry" (card/plus carried), "typing" | RowsLayout.ts:234-235 | RowsLayout.ts:98, 112, 122 | root `is-dragging` (CS:286); quick.entering (CS:1647, 1660) |
| layout sizes | G4 | `RowsLayout.still` | RowsLayout.ts:42 | next heights come in at once (first draw/context change) | RowsLayout.ts:125 | RowsLayout.ts:90, 106 | — |
| layout sizes | G4 | `RowsLayout.frameId` | RowsLayout.ts:43 | a fit is pending next frame | RowsLayout.ts:102, 103 | RowsLayout.ts:101, 244 | — |
| layout sizes | G4 | `RowsLayout.fitStill` | RowsLayout.ts:45 | pending fit should land without motion | RowsLayout.ts:100, 105 | RowsLayout.ts:104 | — |
| layout sizes | G4 | `RowsLayout.settleTimer` | RowsLayout.ts:47 | re-measure after motion settles | RowsLayout.ts:148 | RowsLayout.ts:146, 241 | — |
| layout sizes | G4 | row `style.height`, `style.transitionDelay` | RowsLayout.ts:142-143 | each funnel row's height | RowsLayout.ts:142-143 | RowsLayout.ts:117 (getBoundingClientRect) | core stackedLists result |
| layout sizes | G4 | stack `is-still`, `is-growing` | RowsLayout.ts:54, 126, 151 | heights set without transition / note block grows | RowsLayout.ts:54, 126, 151 | styles.css | `still` |
| layout sizes | G4 | root `--tc-fade-left` | RowsLayout.ts:217, 246 | where the foot fade starts | RowsLayout.ts:217, 246 (remove) | styles.css | StillLayout widths |
| layout sizes | G4 | row label text | RowsLayout.ts:85 | list name / day name over each row | RowsLayout.ts:85 | DOM | listName/dayName |
| layout sizes | G4 | `.tc-quick-row` presence in a row list (DOM as state) | RowsLayout.ts:157, 160 | which row holds the typing field | EntryRows / quick | RowsLayout.ts:157, 160 | Quick entry state |
| layout sizes | G4 | `is-leaving` (read) | RowsLayout.ts:136, 189 | a card is folding away | Motion.ts:111 | RowsLayout.ts:136, 189 | KeyedRows.leaving |
| layout sizes | G4 | stage column `style.width` | StillLayout.ts:96-97 | each still-layout column width | StillLayout.ts:96-97 (frame 87; divider onWidth 67) | styles.css; BlockHeight | settings.listShare; `--tc-list-width` |
| layout sizes | G4 | `SnapGlide.shown` | SnapGlide.ts:17 | value currently shown (divider width) | SnapGlide.ts:58, 71 | SnapGlide.ts:33, 36 | `--tc-list-width` / column widths via Divider onWidth |
| layout sizes | G4 | `SnapGlide.run` (+ `Run.to/start/frame`) | SnapGlide.ts:18 | a snap glide running (target, start, rAF id) | SnapGlide.ts:29, 37, 40, 44, 46, 64 | SnapGlide.ts:28, 39, 51, 62, 65 | — |
| layout sizes | G4 | `SnapGlide.ended` | SnapGlide.ts:19 | callbacks waiting for the glide to settle | SnapGlide.ts:51, 67 | SnapGlide.ts:67 | — |

#### platform/theme/keyboard (20)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| platform/theme/keyboard | G0 | `document.activeElement` read | CS:930 | Cmd+Z stays a field's own while a field is focused | — | CS:930 | QEC.focused |
| platform/theme/keyboard | G0 | body class `is-mobile` read | CS:262, 407, 854, 1447 | desktop vs phone (`wide()`) | Obsidian | CS:262, 407, 854, 1447 | QuickBar `is-desk`; FunnelView answers per `wide` |
| platform/theme/keyboard | G0 | body class `theme-light` read | CS:569 | light vs dark for event colours | Obsidian | CS:569 | — |
| platform/theme/keyboard | G0 | `closings` Map (popout windows) | main.ts:142 | popout windows given the card size and colours | main.ts:144, 150-151 | main.ts:150, 154 | windowDocuments `popouts` |
| platform/theme/keyboard | G1 | focus / activeElement (field) | QEC:428,429,234 | The field has the keyboard | QEC:428,429,234; quick/MarkdownTitleField.ts:112,116 | QEC:429,806 (handle.focused); quick/QuickBar.ts:466 | QEC.focused |
| platform/theme/keyboard | G1 | bar class `is-desk` | quick/QuickBar.ts:139 | Desktop capsule look | quick/QuickBar.ts:139 | CSS | body `is-mobile` (QEC deps.desktop, CS:407) |
| platform/theme/keyboard | G1 | MarkdownTitleField.composing | quick/MarkdownTitleField.ts:24 | The key down commits an input-method candidate | quick/MarkdownTitleField.ts:51 | quick/MarkdownTitleField.ts:41,70 | — |
| platform/theme/keyboard | G1 | MarkdownTitleField.scoped | quick/MarkdownTitleField.ts:33 | Field's key scope is pushed over Obsidian's | quick/MarkdownTitleField.ts:85 | quick/MarkdownTitleField.ts:84 | Obsidian app.keymap scope stack |
| platform/theme/keyboard | G1 | root class `is-keyboard-up` | Keyboard.ts:27 | Phone keyboard is up | Keyboard.ts:27 | styles.css:1510 | — |
| platform/theme/keyboard | G1 | TaskCalendarView.scope | TaskCalendarView.ts:34 | Tab's Cmd+Z/Cmd+Shift+Z/Cmd+F scope | TaskCalendarView.ts:34 | Obsidian | — |
| platform/theme/keyboard | G1 | StatusBarRoom.rooms (static WeakMap) | StatusBarRoom.ts:13 | One status-bar watcher per document | StatusBarRoom.ts:27,47 | StatusBarRoom.ts:24 | — |
| platform/theme/keyboard | G1 | StatusBarRoom.holders | StatusBarRoom.ts:16 | Views holding the mark | StatusBarRoom.ts:40,44 | StatusBarRoom.ts:40,44 | — |
| platform/theme/keyboard | G1 | hold closure `held` | StatusBarRoom.ts:30 | This holder has not let go | StatusBarRoom.ts:34 | StatusBarRoom.ts:33 | — |
| platform/theme/keyboard | G1 | body class `tc-status-bar-shown` | StatusBarRoom.ts:56 | Obsidian's desktop status bar shows | StatusBarRoom.ts:46,56 | styles.css:763 | ObsidianChrome.statusBarTop (QEC chromeTop) |
| platform/theme/keyboard | G1 | windowDocuments `popouts` (module Set) | windowDocuments.ts:2 | Open popout window documents | windowDocuments.ts:12,14 | windowDocuments.ts:7 | main.ts:144 `closings` map |
| platform/theme/keyboard | G1 | windowDocuments `listeners` (module Set) | windowDocuments.ts:3 | Listeners for new popouts | windowDocuments.ts:19,20 | windowDocuments.ts:13 | — |
| platform/theme/keyboard | G3 | `LiftedMenu.raisedBy` | menu/LiftedMenu.ts:32 | How far the menu's parts are lifted to keep a field over the keyboard | menu/LiftedMenu.ts:101 | menu/LiftedMenu.ts:96, 102; TaskMenu.ts:245, 247, 261; QEC:642 (via `raised`) | inline `top` on lifted/fieldRow/stack |
| platform/theme/keyboard | G3 | `is-typing` class, Done button hidden | full/FullScreen.ts:109, 467-468 | Something on the screen is typed in | 109, 467-468 | CSS | `document.activeElement` |
| platform/theme/keyboard | G3 | focus in search input | search/SearchWindow.ts:72 | Keyboard up / typing in search | 72 | — | — |
| platform/theme/keyboard | G3 | closure `held` in `ObsidianMarkdown.edit` | markdown/ObsidianMarkdown.ts:30 | The editor's key scope is on Obsidian's keymap stack | 33 | 32 | Obsidian keymap scope stack (34-35) |

#### settings (22)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| settings | G0 | `CS.seen` | CS:189 | the settings the screen last followed, to weigh a change | CS:225, 561 | CS:560 | ShownSettingsStore.seen/shown |
| settings | G0 | `TaskCalendarPlugin.pluginSettings` | main.ts:27 | the settings file kept in memory | main.ts:36, 52, 60, 134 (reload) | main.ts:47, 179 | data.json; ShownSettingsStore |
| settings | G0 | device localStorage `rightMode` | main.ts:105-108 | the place kept by the old view, handed to the core once | main.ts:108 (`saveLocalStorage`) | main.ts:105 | FunnelView.place (core) |
| settings | G1 | ViewSettingsStore.source / .shown | viewSettings.ts:56-57 | Cached device settings (listShare, zoom, treeWidth) per saved object | viewSettings.ts:65,66 | viewSettings.ts:64,68 | data.json via ViewSettingsFile (main.ts:29) |
| settings | G1 | ShownSettingsStore.seen / .shown | viewSettings.ts:85-86 | Merged shared+device settings object identity | viewSettings.ts:98,99 | viewSettings.ts:97,101 | CS.seen/CS.settings (CS:560); ScreenSettingsStore.get |
| settings | G1 | onChange closure `last` | viewSettings.ts:110 | Last merged settings told to the listener | viewSettings.ts:114 | viewSettings.ts:113 | ShownSettingsStore.shown |
| settings | G1 | TaskCalendarSettingsTab.page | SettingsTab.ts:59 | Settings sub-page open | SettingsTab.ts:107,110,123 | SettingsTab.ts:107,122 | Modal open state |
| settings | G1 | colour row preview dataset.priority / code text | SettingsTab.ts:221,228,229 | Colour being picked shown before saved | SettingsTab.ts:221,228,229 | CSS | priorityColors.rules (SettingsTab.ts:153,173 preview) |
| settings | G1 | cardSize `shown` (module let) | cardSize.ts:14 | Card height and gap in use | cardSize.ts:30,39 | cardSize.ts:24,45; Timeline.ts:532,582; drag/DragController.ts:182,481; drag/ListDrop.ts:286 | ScreenSettings.cardHeight/cardGap; ShownSettings in CS; body style `--tc-card-*` |
| settings | G1 | cardSize `set` (module let) | cardSize.ts:16 | A size was shown (popouts get it) | cardSize.ts:31,40 | cardSize.ts:24 | — |
| settings | G1 | body style card height/gap | cardSize.ts:19-20 | CSS tokens for card size per window | cardSize.ts:19,20,36,37 | CSS | cardSize.shown |
| settings | G1 | priorityColors `sheets` (module Map) | priorityColors.ts:40 | Style element per document | priorityColors.ts:47,74 | priorityColors.ts:46,73 | — |
| settings | G1 | priorityColors `rules` (module let) + style textContent | priorityColors.ts:41,48 | Colour CSS for levels and labels | priorityColors.ts:60,75; textContent 48 | priorityColors.ts:45,48 | ScreenSettings.priorities/labels; SettingsTab preview overrides it temporarily (SettingsTab.ts:153,173) |
| settings | G1 | priorityColors `blend` + body class `tc-labels-blend` | priorityColors.ts:42,50 | Several labels painted as blend | priorityColors.ts:68,76; class 50,69,77 | priorityColors.ts:50,69; styles.css:1229-1231 | ScreenSettings.labelPaint |
| settings | G2 | `RowReorder` closure `to` | RowReorder.ts:40 | target index of the settings row being dragged | RowReorder.ts:46 | RowReorder.ts:49, 58, 67, 69-70 | — |
| settings | G2 | `is-dragging` / `is-shifting` classes, `style.transform` on settings rows | RowReorder.ts:37 | row dragged / rows sliding | RowReorder.ts:37-38, 44, 50, 59-61, 64-65 | CSS | — |
| settings | G2 | landing timer | RowReorder.ts:73 | row gliding into place | RowReorder.ts:73 | — | — |
| settings | G2 | settings rows DOM order | RowReorder.ts:69 | order shown before settings redraw | RowReorder.ts:69 | — | settings list order (after move) |
| settings | G3 | `TaskMenu.repeatPage` | menu/TaskMenu.ts:182 | The repeat rule being edited, written once when the menu closes | menu/TaskMenu.ts:556 (`??=`) | menu/TaskMenu.ts:614-616 | `RepeatEditor.draft` (repeat/RepeatPanel.ts:43); core `RepeatPage` internal rule |
| settings | G3 | `RepeatEditor.draft` | repeat/RepeatPanel.ts:43 | Repeat rule being edited (kind, every, unit, days) | 53, 73 | 55, 62, 64, 71, 79, 92 | `TaskMenu.repeatPage` / core `RepeatPage`; QuickBar's draft |
| settings | G3 | `RepeatEditor.detail` | repeat/RepeatPanel.ts:50 | Weekday row / month-day line element | 86 | 85, 87 | — |
| settings | G3 | segment/day buttons `is-on`, `aria-pressed`; fewer `is-off`, `aria-disabled` | repeat/RepeatPanel.ts:35-36, 83-84, 100-101 | Chosen kind/unit/days; Fewer disabled | same | CSS | `draft` |

#### note blocks (11)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| note blocks | G1 | ViewWatch.frame | ViewWatch.ts:8 | Pending rAF to tell a note view changed | ViewWatch.ts:29,34,35 | ViewWatch.ts:28,33 | — |
| note blocks | G1 | ProjectBlock.scoped | ProjectBlocks.ts:17 | Block's key scope pushed | ProjectBlocks.ts:67 | ProjectBlocks.ts:66 | Obsidian keymap |
| note blocks | G1 | ProjectBlock.shown | ProjectBlocks.ts:20 | Block on the page and loaded (screen open) | ProjectBlocks.ts:173 | ProjectBlocks.ts:172 | ProjectBlocks child list (addChild 174) |
| note blocks | G1 | ProjectBlock.path | ProjectBlocks.ts:24 | Note path the block belongs to | ProjectBlocks.ts:114 | ProjectBlocks.ts:32 (note()),114,135 | MarkdownView.file.path (ProjectBlocks.ts:131) |
| note blocks | G1 | ProjectBlocks.blocks (Map) | ProjectBlocks.ts:82 | Block per Markdown view | ProjectBlocks.ts:142,181 | ProjectBlocks.ts:101,109,114,124,134,150 | ProjectBlocks.watches keys |
| note blocks | G1 | ProjectBlocks.watches (Map) | ProjectBlocks.ts:84 | ViewWatch per view | ProjectBlocks.ts:152,180 | ProjectBlocks.ts:179 | — |
| note blocks | G1 | ProjectBlocks.asks (Map) | ProjectBlocks.ts:86 | Sequence number of the latest projectNoteView ask per view | ProjectBlocks.ts:130 | ProjectBlocks.ts:129,133 | — (entries never removed) |
| note blocks | G1 | block.el position + style `--tc-block-lift` | ProjectBlocks.ts:169,171 | Where the block sits (after editor content / in reading footer) and lift | ProjectBlocks.ts:169,171 | ProjectBlocks.ts:168,171; styles.css:1710 | view.getMode() (ProjectBlocks.ts:162); `.cm-content` paddingBottom (ProjectBlocks.ts:170) |
| note blocks | G1 | focus in block | ProjectBlocks.ts:44 | Block holds focus for its keys | ProjectBlocks.ts:44 | ProjectBlocks.ts:44,48 | ProjectBlock.scoped |
| note blocks | G4 | `BlockHeight.frame` (rAF id) | BlockHeight.ts:9 | a refit is pending | BlockHeight.ts:32, 37, 38 | BlockHeight.ts:31, 36 | — |
| note blocks | G4 | `block.style.height` | BlockHeight.ts:50 | note block's height | BlockHeight.ts:50 | BlockHeight.ts:49-50 | — |

#### undo (1)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| undo | G1 | undo button off state | BottomCapsule.ts:43 | Undo dim when nothing to undo | BottomCapsule.ts:43 | CSS | UndoService.canUndo() |

#### other (37)

| domain | grp | name | file:line | meaning in product terms | written by | read by | same fact also stored as |
|---|---|---|---|---|---|---|---|
| other | G0 | `CS.unsubscribe` | CS:216 | teardown list | CS:322, 430, 436, 444 | CS:532 | — |
| other | G0 | `CS.changing` | CS:128 | the chain of writes, one after another | CS:905 | CS:904 | WriteQueue.tail (quick entry's own chain); Picks.waiting |
| other | G0 | arbiter claim `naming` | CS:1123, 1158, 1189, 1236 (release 1125, 1167, 1198, 1238) | a name is being typed: no redraw takes the field away | CS (claim/release) | ScreenParts busy (CS:182) | CS.naming |
| other | G0 | `TaskCalendarPlugin.services` | main.ts:33 | the built services, for console | main.ts:73 | — | — |
| other | G1 | DayData.shown | DayData.ts:63 | JSON snapshot of what the screen was last told for tasks and for events, so only a change redraws | DayData.ts:63 (init), DayData.ts:228 | DayData.ts:227 | state / dayEvents themselves (serialised copy) |
| other | G1 | Reload.running (×2: taskReload DayData.ts:64, eventReload DayData.ts:65) | Reload.ts:6 | A fetch is in flight; callers share its promise | Reload.ts:20,34,38 | Reload.ts:20,21 | — |
| other | G1 | Reload.requested | Reload.ts:7 | A request arrived while fetching: fetch once more | Reload.ts:18,29 | Reload.ts:31 | — |
| other | G1 | Reload.hooks | Reload.ts:9 | beforeShow hooks waiting to run once the fetched value is in place | Reload.ts:19,33,37 | Reload.ts:37 | QEC.draws/mark (QEC:695-700) depends on the hook having run |
| other | G1 | ScreenParts.waiting | ScreenParts.ts:12 | Screen parts (frame/tasks/events) asked to draw and held while a gesture is busy | ScreenParts.ts:17,25 | ScreenParts.ts:23,24 | — (busy fact is CS arbiter.busy, CS:182) |
| other | G1 | TaskCalendarView.screen | TaskCalendarView.ts:10 | The open screen of the tab | TaskCalendarView.ts:33,43 | TaskCalendarView.ts:42,50,55 | — |
| other | G1 | FramePass.frame | FramePass.ts:11 | A layout pass queued for next frame | FramePass.ts:20,21,34 | FramePass.ts:19,33 | QEC.revealing |
| other | G2 | `GestureArbiter.holder` | gestures.ts:3 | which gesture owns the screen (drag, hold, resize, newslot, pinch, swipe, switch, divider, naming, tree lift) | gestures.ts:12, 19, 25 | gestures.ts:7, 11, 18, 24; readers of `busy`: CS:182, 463, 493, 1225; drag/DragController.ts:122, 149, 171, 199, 250, 263; drag/GroupDrag.ts:49; Swipe.ts:238; quick/PlusButton.ts:58; projects/TreeLift.ts:33 | `DragController.live`, `Swipe.holds`, `PinchZoom.pinch`, `Divider.press`, `ColumnSwitch.press.dragging`, `is-dragging` |
| other | G2 | `GestureArbiter.idleListeners` | gestures.ts:4 | callbacks run when the screen is free | gestures.ts:31 (CS:471) | gestures.ts:26 | — |
| other | G2 | `PointerSpeed.current/signed/x/time` | PointerSpeed.ts:6 | smoothed finger speed | PointerSpeed.ts:27-30 | PointerSpeed.ts:15, 20, 24, 27-28 | — |
| other | G3 | `MonthPicker.month` (public, mutable) | menu/MonthPicker.ts:18 | Month the date grid shows | MonthPicker.ts:29, 48 | MonthPicker.ts:48, 55, 62 | — |
| other | G3 | day buttons `is-other/is-today/is-selected` | menu/MonthPicker.ts:62-64 | Grid marks | 62-64 | CSS | opts.selected / opts.today |
| other | G3 | click listener per `render` call | markdown/ObsidianMarkdown.ts:21 | Links in a rendered description open; one listener added each render call on the same element | 21 | event loop | — |
| other | G3 | `Button` classes `is-on`, `is-off`, `is-hidden`; icon swap | kit/Button.ts:51, 56, 60, 68-69 | Button on / dimmed / hidden; which icon | 51, 56, 60, 68-69 | CSS | owner's own flags |
| other | G4 | per-block `listening` AbortController | Timeline.ts:59, 361, 366 | listeners attached by onBlock/onEvent, aborted on the next draw | Timeline.ts:333, 360-361, 366 | deps.onBlock/onEvent (672, 693) | KeyedRows Row.listening (same pattern for lists) |
| other | G4 | ribbon columns `tc-hidden` | RibbonLayout.ts:189 | no tasks file: lists hidden | RibbonLayout.ts:189 | styles.css | CS rightEl `tc-hidden` (CS:1642), StillLayout stage |
| other | G4 | `RowsLayout.destroyed` | RowsLayout.ts:48 | layout gone | RowsLayout.ts:240 | RowsLayout.ts:98, 112 | — |
| other | G4 | stage `tc-hidden` | StillLayout.ts:136 | no tasks file | StillLayout.ts:136 | styles.css | RibbonLayout columns `tc-hidden` |
| other | G4 | `Row.listening` AbortController | KeyedRows.ts:14 | row's listeners, aborted on redraw/leave | KeyedRows.ts:63, 70, 73 | KeyedRows.ts:46, 62, 83 | — |
| other | G4 | row `style.overflow` | Motion.ts:93, 99, 119, 142 | clipping while growing/leaving | Motion.ts:93, 99, 119, 142 | — | GROWTHS |
| other | G4 | `is-leaving` class | Motion.ts:111, 141 | row is leaving | Motion.ts:111, 141 | RowsLayout.ts:136, 189 | KeyedRows.leaving |
| other | G4 | `SETTLES` WeakMap | Motion.ts:52 | a box's pending downward settle (dy, until) | Motion.ts:182-183 (from RowsLayout.ts:140) | Motion.ts:59 | — |
| other | G4 | `SLIDES` WeakMap | Motion.ts:65 | running slide/reshape animation per element | Motion.ts:157, 174 | Motion.ts:36, 41, 149, 162, 170 | — |
| other | G4 | `GROWTHS` WeakMap | Motion.ts:66 | running grow-in animation | Motion.ts:95 | Motion.ts:40, 76, 99, 163 | — |
| other | G4 | `GROWN` WeakMap | Motion.ts:68 | target height of a growing row | Motion.ts:96 | Motion.ts:34 | — |
| other | G4 | `RESHAPED` WeakMap | Motion.ts:69 | target box of a reshaped timeline block | Motion.ts:173 | Motion.ts:35 | block `--tc-y/len/x` |
| other | G4 | `SLID_TO` WeakMap | Motion.ts:70 | target width of a slide | Motion.ts:156 | Motion.ts:41 | — |
| other | G4 | `GROWN_MARGIN` WeakMap | Motion.ts:71 | target margin of a growing row | Motion.ts:97 | Motion.ts:75 | — |
| other | G4 | `style.pointerEvents = none` on disappearing node | Motion.ts:204 | fading block not clickable | Motion.ts:204 | browser | — |
| other | G4 | inline `left/top/width/height` via `pinTo` | dom.ts:25-30 | helper writer of positional inline style (callers elsewhere) | dom.ts:26-29 | callers' CSS | — |
| other | G4 | `Store.current` (prototype) | next/Store.ts:18 | the screen's one state | next/Store.ts:38 | next/Store.ts:32, 36 | — |
| other | G4 | `Store.listeners` (prototype) | next/Store.ts:19 | subscribers | next/Store.ts:45, 46 | next/Store.ts:39 | — |
| other | G4 | `Store.queue` (prototype) | next/Store.ts:20 | promise chain of effects | next/Store.ts:55 | next/Store.ts:51, 55 | CS `changing` chain (current code) |

## B. Effects

One row per call site, per file group. Kinds: `core` (a core service or a pure contracts function, directly or through a deps callback), `core (pure rule)` (a pure core rule), `obsidian` (Obsidian API or host side effect), `screen` (a deps callback into CalendarScreen or a UI part that changes what shows), `dom` (Web Animations, timers, rAF on the host). The guard column names the ordering mechanism (see "Ordering mechanisms" above) or `none`.


### B.1 G0: CalendarScreen.ts, main.ts, compose.ts (142 rows)

`act` = CS:899-915 (wait for `Picks.settled()` unless `Picks.running`, then chain on `changing`, then `data.tasks()` reread through DayData's Reload; `StaleTaskError` → Notice; `false` skips the reread).

| kind | method | file:line | read/write/view-change | returns (from contracts) | guard | trigger |
|---|---|---|---|---|---|---|
| core | TaskService.moveGroup | CS:234 | write | Promise<void> | act | section header dragged (GroupDrag onMove) |
| core | TaskService.pickStatus | CS:238 | write | Promise<void> | act | bulk menu status |
| core | TaskService.postponeAll | CS:239 | write | Promise<void> | act | bulk menu date |
| core | TaskService.removeAll | CS:240 | write | Promise<void> | act | bulk menu remove |
| core | TaskService.bulkMenu | CS:243 | read | TaskMenuModel | none | bulk menu opened |
| core | TaskService.togglePriority | CS:244 | write | Promise<void> | act | bulk menu level tile |
| core | TaskService.toggleLabel | CS:248 | write | Promise<readonly (TaskItem\|null)[]> | act | bulk menu label tile |
| core | TaskService.removeDue | CS:252 | write | Promise<void> | act | bulk menu remove date |
| core | TaskService.carried | CS:253 | read | readonly TaskKey[] | none | bulk lift |
| core | TaskService.toSection | CS:258 | write | Promise<void> | act | bulk menu section |
| core | TaskService.setProject | CS:259 | write | Promise<void> | act | bulk menu project |
| core | TaskService.newProject | CS:260 | write | Promise<ProjectRef\|null> | act | bulk menu new project |
| core | TaskService.toggleProject | CS:1407 (from CS:261, 1377) | write | Promise<readonly (TaskItem\|null)[]> | act | bulk or task menu project page |
| core | TaskService.snap | CS:268, 357 | read | number | none (pure) | drag over timeline |
| core | TaskService.stretch | CS:301 | read | StretchSpan | none (pure) | resize dot dragged |
| core | TaskService.resize | CS:304 | write | Promise<boolean> | act | resize dot let go |
| core | TaskService.startCarry | CS:1044 (from onLift CS:298, plus CS:1102) | write (core carry state) | Promise<void> | none (sets `carrying` flag; not in act) | card/plus lifted |
| core | TaskService.endCarry | CS:1053 (from putBack CS:300, close CS:524, plus end CS:1105, applyDrop CS:1144, 1149, newProject CS:1122) | write (core carry state) | Promise<void> | `carrying` flag only (CS:1049); not in act; then data.tasks (Reload) | let go nowhere / dropped / naming / view closed |
| core | TaskService.firstPlace | CS:325, 690 | read | FunnelPlaceOf | none | view opens; before first read |
| core | TaskService.firstView | CS:326, 1452 | read | ViewChoice | none | view opens; before first read |
| core | DayService.step | CS:330 | read | LocalDate | turning | day arrow |
| core | DayService.relation | CS:331, 338, 730, 1537 | read | DayRelation | none | Today tap; timeline/peek/header draw |
| core | DayService.today | CS:547 (via `today()` at 226, 241, 331, 406, 519, 1283, 1326, 1537) | read | LocalDate | none | many |
| core | DayService.boundary | CS:551 (via 339, 731) | read | DayBoundary | none | timeline/peek draw |
| core | TaskService.shownSpan | CS:342 | read | DaySpan | none | timeline draw |
| core | CalendarService.isPast | CS:344, 1651 | read | boolean | none | timeline / all-day draw |
| obsidian | EventMenu.open → openInCalendar (AppleCalendar) | CS:352, 96 | view-change / host app | void | none | event tapped |
| core | TaskService.dropSpan | CS:358 | read | DaySpan | none | drag over timeline |
| core | TaskService.newSlot | CS:359 | read | Slot | none | new slot dragged on canvas |
| core | TaskService.findIn | CS:400 | read | TaskItem\|null | none | quick entry looks up a slotted task |
| screen | `select(date)` + DayData.tasks from QEC `showDay` | CS:418-420 | view-change + read | Promise<void> | none in CS (QEC awaits WriteQueue idle first, per G1) | quick entry shows the day it wrote to |
| screen | DayData.tasks(beforeShow) from QEC `fresh` | CS:422 | read | Promise<void> | Reload | quick entry write job |
| screen | ColumnSwitch onChange → leaveDone → setMode | CS:376 | view-change + write | Promise<void> | afterEntry, then act inside setMode | wheel turned |
| obsidian | SourcesPopover.open | CS:1303 (from CS:378) | view-change | void | none | wheel long-press |
| core | CalendarPoll.refreshNow | CS:1307 | read (network) | Promise<void> | none | Refresh in sources popover |
| core | UndoService.undo / redo | CS:938 | write | Promise<UndoOutcome> | none (not in act/changing) | corner button, Cmd+Z/Cmd+Shift+Z |
| obsidian | Notice (undo conflict) | CS:939 | view-change | — | none | undo outcome conflict |
| screen | DayData.tasks after undo | CS:940 | read | Promise<void> | Reload | undo done |
| obsidian | MoreMenu.open | CS:434 | view-change | — | none | More button |
| core | TaskService.onChange subscribe → data.tasks + full.refresh | CS:445-448 | subscription → read | () => void | Reload | file changed |
| core | CalendarService.onChange subscribe → data.calendars | CS:449 | subscription → read | () => void | Reload (events) | calendars changed |
| core | settings.onChange subscribe → onSettings | CS:450 | subscription → redraw | () => void | ScreenParts | settings changed |
| core | DayService.onDayChange subscribe | CS:451 | subscription | () => void | ready = canTick (CS:492) | day passed / day start moved |
| core | CalendarPoll.wake | CS:455, 458 | read (network maybe) | void | none | window focus; document visible |
| core | DayService.catchUp | CS:504 | read | void | none | visible / arbiter idle / resize |
| core | CalendarPoll.catchUp | CS:461, 539 | read | void | none | active leaf change; resize |
| core | CalendarService.keepFresh | CS:477 | subscription (poll) | CalendarPoll | none | view opens |
| screen | DayData.load | CS:479 | read | Promise<void> | Reload | view opens |
| screen | Timeline.tickNow | CS:489 | view-change | void | canTick | minute interval |
| screen | DayData.tasks on day passed | CS:514 | read | Promise<void> | Reload | day passed |
| screen | select(today) on day moved | CS:519 | view-change + read | void | afterEntry | day start hour changed |
| core | CalendarPoll.stop | CS:530 | — | void | none | view closes |
| core | TaskService.listName | CS:603, 857 | read | string | none | header draw; search sections |
| core | settings.set({listShare}) → parts.request("frame") | CS:607 | write (view setting) | Promise<void> | none | divider let go |
| core | DayService.stepFunnel | CS:663 | read | FunnelAtOf\|null | none | ribbon swipe |
| core | TaskService.columnSections | CS:735, 1262 | read | ColumnSections\|null | none | peek / list draw |
| screen | Swipe arrival `arriveAt` → setMode | CS:780 | view-change + write | Promise<void> | afterEntry, act | swipe landed on a place |
| screen | DayTrack arrival → select | CS:765-768 | view-change + read | Promise<void> | afterEntry | day swipe landed |
| screen | ScreenPager.run (day turn) | CS:707 | view-change | Promise<void> | turning + drawnLanding + afterEntry + pager.caught check | day arrow / Today |
| core | TaskService.setFunnelPlace | CS:813 | write (device place) | Promise<void> | act | wheel, swipe, search reveal |
| core | TaskService.toggleCollapsed | CS:843 | write | Promise<void> | act | subtask counter tapped |
| obsidian | haptics.tap | CS:611, 654, 842, 1576, 1602 | host | void | none | layout snap; list tap; fold; by-project drop; tree snap |
| obsidian | SearchWindow.open | CS:851 | view-change | SearchWindow | afterEntry; `search` flag | More → Search, Cmd+F |
| core | TaskService.reveal | CS:875 | read | Promise<TaskScreen> | act | search pick |
| core | TaskService.filterHides | CS:879 | read | Promise<boolean> | none | search pick |
| core | TaskService.clearProjectFilter | CS:879 | write | Promise<void> | act | search pick of a hidden task |
| screen | select(screen.date), switcher.show, setMode | CS:884-886 | view-change + write | Promise<void> | act (setMode) only; select itself unguarded | search pick |
| screen | Timeline.select(null) | CS:894 | view-change | void | none | pointerdown elsewhere |
| obsidian | Notice (StaleTaskError) | CS:912 | view-change | — | act | write met a changed task |
| obsidian | Notice (failure) | CS:945 | view-change | — | none | write failed |
| screen | DayData.tasks after failure | CS:946 | read | Promise<void> | Reload | write failed |
| core | settings.set({zoom}) | CS:991 | write (view setting) | Promise<void> | none | pinch released |
| core | TaskService.carryOnNode | CS:1069 | write | Promise<void> | act | cards let go on a tree row |
| core | TaskService.projectsDropPreview | CS:1085 | read | Promise<ProjectsDropPreview> | act (inside) | cards let go in by-project list |
| core | TaskService.dropInProjects | CS:1086 | write | Promise<readonly TaskKey[]> | act | cards let go in by-project list |
| core | TaskService.createProject | CS:1126 | write | Promise<ProjectRef\|null> | act + arbiter `naming` | plus let go at a tree gap, name typed |
| core | TaskService.endProjectName | CS:1132 | write | Promise<void> | act | project naming done / refused |
| core | TaskService.drop | CS:1148 | write | Promise<readonly TaskKey[]> | act | card let go on a list / timeline |
| core | TaskService.toSection | CS:1168 | write | Promise<void> | act + arbiter `naming` | new section name entered |
| obsidian | GroupNameField.open + scrollIntoView | CS:1163, 1172, 1193 | view-change | — | arbiter `naming` | New section / Rename section |
| obsidian | GroupMenu.open | CS:1180 | view-change | — | none | section header tapped |
| core | TaskService.removeGroup | CS:1183 | write | Promise<void> | act | section menu Remove |
| core | TaskService.renameGroup | CS:1201 | write | Promise<boolean> | act | section renamed |
| obsidian | ProjectMenu.open | CS:1229 | view-change | — | none (skips if arbiter busy) | filter title tapped |
| core | TaskService.renameProject | CS:1240 | write | Promise<boolean> | act + arbiter `naming` | project renamed |
| obsidian | NoteSearch (SuggestModal) open | CS:1243 | view-change | — | none | Attach note |
| core | TaskService.setProjectNote | CS:1243, 1247 | write | Promise<void> | act | note attached / detached |
| obsidian | workspace.openLinkText (project note) | CS:1245 | view-change | Promise<void> | none | Open note |
| core | TaskService.setProjectFolder | CS:1249 | write | Promise<boolean> | act | Folder switch |
| core | TaskService.deleteProject | CS:1251 | write | Promise<void> | act | Delete project |
| core | TaskService.selectProjectNode | CS:1257 | write (device filter) | Promise<void> | act | project mark tapped; FullScreen project |
| obsidian | FullScreen.open | CS:1319 | view-change | FullScreen | `full` flag | Open / description from the menu; search reveal of Done outside ribbon |
| core | TaskService.menu | CS:1361 | read | TaskMenuModel | none | task menu built |
| obsidian | TaskMenu.open | CS:1355 | view-change | TaskMenu | none | card tap / long press / right click |
| core | TaskService.pickStatus | CS:1367 | write | Promise<void> | act | menu status |
| core | TaskService.postpone | CS:1368 | write | Promise<void> | act | menu date |
| core | TaskService.removeDue | CS:1369 | write | Promise<void> | act | menu remove date |
| core | TaskService.toSection | CS:1370 | write | Promise<void> | act | menu section |
| core | TaskService.setProject | CS:1374 | write | Promise<void> | act | menu project |
| core | TaskService.newProject | CS:1375 | write | Promise<ProjectRef\|null> | act | menu new project |
| core | TaskService.togglePriority | CS:1381 | write | Promise<void> | act | menu level tile |
| core | TaskService.toggleLabel | CS:1385 | write | Promise<readonly (TaskItem\|null)[]> | act | menu label tile |
| core | TaskService.setReminder | CS:1390 | write | Promise<void> | act | menu reminder |
| core | TaskService.setRepeat | CS:1391 | write | Promise<void> | act | menu repeat |
| screen | quick.rename / full.rename | CS:1392, 308 | view-change (writes later via WriteQueue) | — | WriteQueue (in QES) | menu Rename; drag onRename |
| screen | quick.addSubtask / full.addSubtask | CS:1395 | view-change (writes later via WriteQueue) | — | WriteQueue | menu Add subtask |
| core | TaskService.remove | CS:1396 | write | Promise<void> | act | menu Delete |
| core | TaskService.lineOf | CS:1416 | read | Promise<number> | none | Open in Obsidian |
| obsidian | vault.getFileByPath, workspace.getLeaf("tab"), leaf.openFile, editor.setCursor/scrollIntoView/focus | CS:1421-1430 | view-change | — | none | Open in Obsidian |
| obsidian | window.open (URL) | CS:1435 | host | — | none | link tapped in menu / description |
| obsidian | workspace.openLinkText (note link) | CS:1436 | view-change | Promise<void> | none | link tapped |
| core | TaskService.projectNoteView / funnelView | CS:1442 | read | Promise<FunnelView\|null> / Promise<FunnelView> | Reload (DayData view dep) | every task reread |
| core | TaskService.setProjectsPanel | CS:1521, 1605 | write (device panel) | Promise<void> | act | projects button; dim tapped |
| core | TaskService.setNoteViewMode / setViewMode | CS:1526 | write (device view) | Promise<void> | afterEntry + act | view menu mode |
| core | TaskService.toggleSubprojects | CS:1531 | write (device) | Promise<void> | afterEntry + act | view menu Subprojects |
| core | projectsTakes (pure) | CS:1564 | read | boolean | none (StaleTaskError caught) | drag over by-project list |
| core | projectsPlusPlace (pure) | CS:1572 | read | place\|null | none | plus over by-project list |
| core | TaskService.clearProjectFilter | CS:1587 | write | Promise<void> | afterEntry + act | filter cross |
| core | TaskService.moveProject | CS:1595 | write | Promise<void> | act | tree row carried |
| core | settings.set({treeWidth}) → parts.request("frame") | CS:1601 | write (view setting) | Promise<void> | none | tree divider let go |
| core | TaskService.pickProjectNode | CS:1603 | write (device filter) | Promise<void> | afterEntry + act | tree row tapped |
| core | DayService.openAt | CS:1678 | read | DayOpening | none | first draw of a day |
| core | TaskService.createFile | CS:1685 | write (vault) | Promise<void> | act | Create file |
| obsidian | registerInterval / setInterval | CS:476 | timer | — | — | view open |
| obsidian | window.setTimeout (landing wait, docking) | CS:717, 1504 | timer | — | — | turn waits; dock slide |
| obsidian | requestAnimationFrame / cancelAnimationFrame | CS:979-980 | timer | — | — | pinch |
| obsidian | StatusBarRoom.hold | CS:322 | view-change (body class) | release fn | holders count | view opens |
| obsidian | PluginSettings load / reload | main.ts:52, 60, 134 | read (data.json) | Promise<void> | none | plugin load; document visible; data.json changed |
| obsidian | pluginSettings.onChange → showCardSize / showPriorityColors / showLabelPaint | main.ts:46-51 | view-change (body styles) | — | none | settings changed |
| obsidian | PluginCodeWatcher.check / changed / disable+enable plugin | main.ts:61, 135, 165-166 | reload plugin | Promise | watcher's own timers | document visible; vault raw event |
| obsidian | registerView, addChild(ProjectBlocks), addRibbonIcon, addCommand, addSettingTab | main.ts:64-67, 86 | registration | — | — | plugin load |
| core | services.keepWorkExportInstalled | main.ts:74 | write (plugin folder file) | () => void | none | layout ready |
| obsidian | registerObsidianProtocolHandler (login, open, sync) | main.ts:75, 81, 82 | — | — | none | obsidian:// URL |
| core | services.receiveLogin → Notice | main.ts:76-78 | write (token) | Promise<void> | none | Google login redirect |
| core | services.syncForApp / stopSyncForApp | main.ts:82, 83 | Obsidian Sync | void | none | obsidian://…sync; unload |
| obsidian | app.loadLocalStorage / saveLocalStorage (device state) | main.ts:105, 108 | read/write | — | none | plugin load |
| core | TaskService.setFunnelPlace (hand-over) | main.ts:108 | write | Promise<void> | none | plugin load with an old `rightMode` |
| obsidian | workspace.getLeavesOfType / getLeaf / setViewState / revealLeaf | main.ts:192-194 | view-change | Promise<void> | none | ribbon icon, command, obsidian://task-calendar-open |
| obsidian | workspace on window-open / window-close; iterateAllLeaves → addWindowDocument | main.ts:146-153 | view-change (popout styles) | — | none | popout window |
| obsidian | execFile osascript | main.ts:202 | host | — | none | open event in Calendar (Mac) |
| obsidian | Notice (kept until hidden) | compose.ts:95 | view-change | () => void | none | sync round trip |
| obsidian | window.setInterval / setTimeout (core ports) | compose.ts:88, 111 | timers for core | — | — | core tickers/timers |

### B.2 G1: DayData, ScreenParts, Reload, quick/*, EntryRows, Keyboard, settings, TaskCalendarView, ViewWatch, ProjectBlocks, SettingsTab, small helpers (244 rows)

Kinds used: `core` (service/session from core), `obsidian` (Obsidian API, DOM/browser APIs with side effects), `screen` (callback into the screen or a UI component that changes what shows; listed because the column asks for view-change).

| kind | method | file:line | read/write/view-change | returns (from contracts) | guard | trigger |
|---|---|---|---|---|---|---|
| core | CalendarService.events(date, open/refresh) | DayData.ts:73 | read (starts network fetch) | DayEventsAsk | Reload (eventReload) | day opens (load/selectDay), Refresh now, poll, source change |
| core | DayEventsAsk.fresh() | DayData.ts:75 | read (network) | Promise<DayEvents> | Reload (eventReload) | same |
| core | CalendarService.events(date,"open").cached | DayData.ts:198 | read | DayEventsAsk | none | view opens (DayData.ts:172), another day selected (DayData.ts:193) |
| core | deps.view() → TaskService.funnelView / projectNoteView (CS.readView) | DayData.ts:213 | read | Promise<FunnelView or null> | Reload (taskReload) | any tasks reread |
| core | TaskService.screen(date, node) | DayData.ts:216 | read | Promise<ScreenView> | Reload (taskReload) | any tasks reread (load, act, quick fresh, day select, file change) |
| core | TaskService.projectsScreen(node) | DayData.ts:216 | read | Promise<ProjectsView> | Reload (taskReload) | tasks reread in by-project mode |
| screen | deps.onUpdate(part) → ScreenParts.request | DayData.ts:229 | view-change | void | ScreenParts (held while gesture busy); DayData.shown diff | read differs from what was shown |
| screen | Reload apply hooks (beforeShow) | Reload.ts:39 | view-change | void | Reload | fetched value applied |
| screen | deps.draw(parts) | ScreenParts.ts:26 | view-change | void | ScreenParts (busy check ScreenParts.ts:18) | request or flush after gesture |
| core | new QuickEntrySession(…, new WriteQueue) | QEC:201 | — | QuickEntrySession | — | screen builds |
| core | QuickEntryTasks.projects (wrapper) | QEC:500 | read | readonly ProjectRef[] | none | entry draws bar/project page |
| core | placementOf | QEC:501 | read | Placement | none | entry state |
| core | placementOfDay | QEC:502 | read | Placement | none | entry state |
| core | dayOfPlacement | QEC:503 | read | LocalDate or null | none | entry state |
| core | parseTitle | QEC:504 | read | { text, priority } | none | typing / enter |
| core | isBlank | QEC:505 | read | boolean | none | enter/blur |
| core | withPriority | QEC:506 | read | string | none | priority tile |
| core | draftMarks | QEC:507 | read | DraftMarks | none | typing |
| core | newSlot | QEC:508 | read | Slot | none | entry in timeline slot |
| core | createSection | QEC:509 | write | Promise<{list, group} or null> | WriteQueue | Enter on a section-name field |
| core | edit | QEC:510 | write | Promise<TaskItem or null> | WriteQueue | rename finished (Enter / tap elsewhere) |
| core | unfoldAbove | QEC:511 | write | Promise<void> | WriteQueue | field opens under a collapsed parent |
| core | createWithId | QEC:513 | write | Promise<CreatedTask or null> | WriteQueue | Enter / tap elsewhere with typed text |
| screen | list.adopt(created.id) for every list | QEC:514 | view-change | void | WriteQueue | after createWithId |
| core | TaskService.listName | QEC:223 | read | string | none | bar draws place tiles |
| core | TaskService.placementTitle | QEC:224 | read | string | none | bar shows place |
| core | TaskService.placementOfDay | QEC:225 | read | Placement | none | day picked in bar's month picker |
| core | TaskService.newProject(name, []) | QEC:813 | write | Promise<ProjectRef or null> | none | «New project…» named in bar Project panel |
| core | QES.setProject (after new project) | QEC:814 | write (state; field) | void | none | same |
| core | QES.blur | QEC:197 | write (pushes writes) | void | WriteQueue | tap anywhere not owned by entry (document click capture) |
| core | QES.indent | QEC:226 | write (state) | void | none | bar indent/outdent buttons |
| core | QES.toggleSection | QEC:227 | write (state) | void | none | bar Section button |
| core | QES.togglePriority | QEC:228 | write (state) | void | Picks | bar priority tile |
| core | QES.toggleLabel | QEC:229 | write (state) | void | none | bar label tile |
| core | QES.setRepeat | QEC:231 | write (state) | void | none / Picks for Remove | bar repeat panel |
| core | QES.setProject | QEC:232 | write (state) | void | Picks | bar project pick |
| core | QES.openIn | QEC:248 | write (state) | void | none | No-tasks plate of empty section tapped (CS:648,1549) |
| core | QES.openAt | QEC:254 | write (state) | void | none | plus dropped in Projects list |
| core | QES.openAtEnd | QEC:270 | write (state) | void | none | double click on list free room (CS:647) |
| core | QES.openFromPlus | QEC:276 | write (state) | boolean | none | plus tapped |
| core | QES.plusOpens | QEC:284 | read | boolean | none | plus tapped |
| core | QES.openSlot | QEC:340 | write (state) | void | none | long tap on timeline free room (CS:310) |
| core | QES.subtaskSpot | QEC:348 | read | EntrySpot | none | menu Add subtask (CS:1395) |
| core | QES.renameSpot | QEC:366 | read | EntrySpot or null | none | menu Rename / card rename (CS:308,1392) |
| core | QES.blur (settle) | QEC:383 | write (pushes writes) | void | afterEntry (CS:677) + WriteQueue; skipped while QEC.turning | day turn / place switch |
| core | QES.idle (settle) | QEC:384 | read (waits) | Promise<void> | WriteQueue | same |
| core | QES.listEntry | QEC:389 | read | EntryInList or null | none | list draws |
| core | QES.renaming | QEC:395 | read | TaskKey or null | none | list draws |
| core | QES.renamed (RenamedTexts source) | QEC:217 | read | readonly PendingRename[] | none | every card drawn |
| core | QES.state | QEC:415 | read | EntryState or null | none | screen rendered |
| core | QES.blur (close) | QEC:472 | write (pushes writes) | void | WriteQueue | view closes |
| core | QES.open | QEC:478 | write (state) | void | none | rename / add subtask / stack |
| core | QES.openAtDrop | QEC:529 | write (state) | boolean | none | carried plus let go |
| core | QES.escape | QEC:552 | write (drops text) | void | QEC.stack menu identity check (QEC:550) | menu with field closed by Escape |
| core | QES.blur | QEC:553 | write (pushes writes) | void | QEC.stack identity + WriteQueue | menu closed by tap on blur |
| core | QES.choosePlace | QEC:745 | write (state) | PlaceMove or null | Picks | bar place tile / day picked |
| core | QES.idle | QEC:754 | read (waits) | Promise<void> | WriteQueue | place pick to another day |
| core | QES.moveToEnd | QEC:756 | write (state) | void | WriteQueue.idle awaited before | same, after day shows |
| core | QES.state | QEC:761 | read | EntryState or null | none | field drawn into a row |
| core | QES.type | QEC:775 | write (state) | void | none | typing in field |
| core | QES.enter | QEC:794 | write (pushes writes) | void | WriteQueue | Enter |
| core | QES.escape | QEC:795 | write | void | none | Escape |
| core | QES.toggleSection | QEC:796 | write (state) | void | none | Alt/Option+Tab |
| core | QES.indent | QEC:797 | write (state) | void | none | Tab / Shift+Tab |
| core | QES.blur | QEC:806 | write (pushes writes) | void | setTimeout + `this.field === handle` identity + WriteQueue | field lost focus |
| screen | deps.fresh() → CS data.tasks() | QEC:694 | read (reread) | Promise<void> | Reload (taskReload) | QES job start (QES.ts:189) |
| screen | deps.fresh(beforeShow) → CS data.tasks(beforeShow) | QEC:696 | read (reread) | Promise<void> | Reload (taskReload) | after createWithId (QES.ts:203) |
| screen | deps.render() → ScreenParts.request("tasks") | QEC:700 | view-change | void | ScreenParts; draws counter (QEC:695-700) | fresh read drew nothing |
| screen | deps.locksPanel | QEC:706 | view-change | void | none | field opens/closes (projects button disabled) |
| screen | deps.list(column).forgetTyped | QEC:708 | view-change | void | none | field closed |
| screen | deps.render() | QEC:719 | view-change | void | ScreenParts | entry moved rows |
| screen | deps.turnTo(column) | QEC:749 | view-change | void | QEC.turning flag | bar place pick |
| screen | deps.showDay(date) → CS.select + data.tasks() | QEC:755 | view-change + read | Promise<void> | WriteQueue.idle awaited (QEC:754); Reload; not via CS turning/afterEntry | bar place pick of another day |
| screen | deps.drag.beginNew | QEC:301 | view-change | boolean | none | plus dragged |
| screen | aside.ended / started | QEC:297,305 | view-change | void | none | plus carried on Projects screen |
| screen | deps.drag.beginNew (aside) | QEC:327 | view-change | boolean | none | plus dragged on Projects screen |
| screen | aside.started / ended | QEC:318,331 | view-change | void | none | same |
| screen | TaskMenu.close | QEC:352 | view-change | void | none | add subtask when menu does not stack |
| screen | TaskMenu.close | QEC:355 | view-change | void | none | add subtask in a list |
| screen | TaskMenu.close | QEC:372 | view-change | void | none | rename from menu |
| screen | TaskMenu.openStack | QEC:538 | view-change | HTMLElement | none | add subtask to calendar-only task |
| screen | TaskMenu.openRename | QEC:544 | view-change | HTMLElement | none | rename subtask in stack |
| screen | Timeline.showRename / showField / clearField | QEC:566,567,568 | view-change | void | none | rendered / entry closed |
| screen | TaskMenu.showStack | QEC:571 | view-change | void | none | rendered with stack spot |
| screen | TaskMenu.close | QEC:576 | view-change | void | none | field left the stack |
| screen | TaskMenu.raise | QEC:642 | view-change | void | FramePass | field over keyboard in menu |
| screen | QuickBar.show/hide/follow | QEC:420,473,675,713,729 | view-change | void | FramePass for follow (via followField) | entry state change / pass |
| obsidian | field.focus / refocus | QEC:428,429,234 | view-change | void | QEC.focused flag | rendered; project name page ended |
| obsidian | scroller.scrollTop += by | QEC:656 | view-change | — | FramePass; revealedAt | reveal |
| obsidian | ScrollGlide.start (smooth reveal / keyboard glide) | QEC:651 | view-change | void | ScrollGlide run token | reveal / keyboard slides |
| obsidian | element.getAnimations().finished → reveal | QEC:608-613 | view-change | — | `this.state` check | field still growing |
| obsidian | window.setTimeout (blur check) | QEC:805 | — | number | field identity | field blur |
| obsidian | document/root addEventListener ×6 + ResizeObserver.observe | QEC:236-242 | — | — | none | construction |
| obsidian | removeEventListener ×6, disconnect ×2 | QEC:460-467 | — | — | none | view closes |
| obsidian | scrollerWatch unobserve/observe | QEC:619,621 | — | — | none | layout pass |
| screen | deps.onSection / onIndent | quick/QuickBar.ts:116,133 | view-change | void | none | bar buttons |
| screen | Panel.inside + show | quick/QuickBar.ts:332,336 | view-change | Panel | Picks (constructed with panel) | bar button opens panel |
| obsidian | document pointerdown add/remove (pressOutside) | quick/QuickBar.ts:337,349 | — | — | none | panel open/close |
| obsidian | Motion.disappear(panel) | quick/QuickBar.ts:345 | view-change | void | none | panel closes |
| screen | deps.onNameEnd | quick/QuickBar.ts:350,461 | view-change (refocus field) | void | none | name page closed |
| screen | panel.window.replace | quick/QuickBar.ts:378 | view-change | void | none | panel redraw |
| screen | panel.window.pick(action) | quick/QuickBar.ts:395 | — | function | Picks | any picking tile |
| screen | deps.onPriority | quick/QuickBar.ts:405 | write (entry state) | void | Picks | level tile |
| screen | deps.onLabel | quick/QuickBar.ts:407 | write (entry state) | void | none | label tile |
| screen | deps.onRepeat(changed) | quick/QuickBar.ts:418 | write (entry state) | void | none | repeat panel change |
| screen | deps.onRepeat(null) | quick/QuickBar.ts:421 | write (entry state) | void | Picks | Remove repeat |
| screen | deps.onProject | quick/QuickBar.ts:434 | write (entry state) | void | Picks | project picked |
| screen | deps.onNewProject | quick/QuickBar.ts:450 | write (TaskService.newProject) | void | Picks | new project named |
| core | deps.listName | quick/QuickBar.ts:474 | read | string | none | place panel draw |
| screen | deps.onPlace (list) | quick/QuickBar.ts:474 | write (entry) | void | Picks | place tile |
| core | deps.placementOfDay + onPlace | quick/QuickBar.ts:493 | read + write | Placement | Picks | day picked |
| core | deps.placementTitle | quick/QuickBar.ts:316 | read | string | none | place changed |
| obsidian | Motion.appear | quick/QuickBar.ts:199 | view-change | void | QuickBar.leaving cancelled | bar comes in on desktop |
| obsidian | element.animate fade + finish listener | quick/QuickBar.ts:215,220 | view-change | Animation | leaving identity token (QuickBar.ts:222) | bar goes out on desktop |
| screen | titleField factory (→ new MarkdownTitleField) | quick/QuickField.ts:43 | view-change | TitleField | none | field opens |
| obsidian | new EmbeddedEditor (Obsidian editor) | quick/MarkdownTitleField.ts:44 | view-change | EmbeddedEditor | none | field opens |
| obsidian | new Scope + holdLineCommands + scope.register(Alt+Tab) | quick/MarkdownTitleField.ts:67,68,69 | — | — | none | field opens |
| obsidian | app.keymap.pushScope / popScope | quick/MarkdownTitleField.ts:86,87 | — | void | scoped flag | field focus / blur / destroy |
| obsidian | editor.setValue | quick/MarkdownTitleField.ts:105 | view-change | void | quiet flag | owner sets text |
| obsidian | editor.focusEnd / focus | quick/MarkdownTitleField.ts:112,116 | view-change | void | none | field focus |
| obsidian | editor.destroy + el.remove | quick/MarkdownTitleField.ts:125,126 | view-change | void | none | field dropped |
| obsidian | capturePointer / releasePointer | quick/PlusButton.ts:60,86 | — | void | press pointerId | press on plus |
| screen | deps.onTap | quick/PlusButton.ts:37,77 | view-change (opens entry) | void | isHidden flag / press | plus click (keyboard) / pointerup |
| screen | deps.onDrag | quick/PlusButton.ts:71 | view-change | void | press | finger moved off plus |
| obsidian | roundShape (ring DOM) / remove | quick/PlusRing.ts:23,27 | view-change | HTMLElement | ring null check | carry starts/ends |
| obsidian | body classList add/remove tc-cancelling | quick/PlusRing.ts:42,55 | view-change | — | none | carried over cross |
| obsidian | requestAnimationFrame / setTimeout | quick/ScrollGlide.ts:39,40,64 | — | number | run token | glide |
| obsidian | cancelAnimationFrame / clearTimeout | quick/ScrollGlide.ts:52,53 | — | — | none | glide ends |
| obsidian | scroller.scrollTop = top | quick/ScrollGlide.ts:74 | view-change | — | run token | glide frame |
| obsidian | body.querySelector status bar | quick/ObsidianChrome.ts:19 | read | — | none | every chromeTop |
| screen | KeyedRows drawing.forget/take/standIn/regrow | EntryRows.ts:52,72,75,81,82,83 | view-change | — | none | list draws entry |
| screen | entry.field(row) | EntryRows.ts:85 | view-change | HTMLElement | none | list draws entry |
| screen | fillUnwrittenCard / showProgressDot | EntryRows.ts:78,95 | view-change | void | none | list draws entry |
| screen | onSlide(glide) → QEC.keyboardSlides | Keyboard.ts:28 | view-change | void | none | keyboardWillShow/Hide |
| obsidian | window add/removeEventListener keyboardWill* | Keyboard.ts:32,36 | — | — | none | build / destroy |
| obsidian | ViewSettingsFile.update (data.json) | viewSettings.ts:72 | write | Promise<void> | none | via ShownSettingsStore.set (callers CS:607,991,1601) |
| obsidian | ViewSettingsFile.get | viewSettings.ts:63 | read | ViewSettings (raw) | none | every settings read |
| core | ScreenSettingsStore.get | viewSettings.ts:95 | read | ScreenSettings | none | every settings read |
| core | ViewSettingsStore.set (ShownSettingsStore.set) | viewSettings.ts:105 | write | Promise<void> | none | divider/zoom/tree width changed |
| core | ScreenSettingsStore.onChange | viewSettings.ts:117 | subscribe | () => void | none | screen opens |
| obsidian | ViewSettingsFile.onChange | viewSettings.ts:76 | subscribe | () => void | none | screen opens |
| obsidian | new CalendarScreen + addChild | TaskCalendarView.ts:32 | view-change | CalendarScreen | none | tab opens |
| obsidian | new Scope + scope.register ×3 | TaskCalendarView.ts:34-37 | — | — | none | tab opens |
| screen | screen.undoKey("undo"/"redo") / findKey | TaskCalendarView.ts:35,36,37 | write / view-change | — | (CS's own) | Cmd+Z / Cmd+Shift+Z / Cmd+F |
| screen | screen.open | TaskCalendarView.ts:38 | read | Promise<void> | none | tab opens |
| screen | screen.close + removeChild | TaskCalendarView.ts:45,46 | view-change | void | screen null check | tab closes |
| screen | screen.resize | TaskCalendarView.ts:50 | view-change | void | none | Obsidian onResize |
| obsidian | MutationObserver.observe / disconnect | ViewWatch.ts:23,27 | — | — | none | block placed / dropped |
| obsidian | requestAnimationFrame / cancel | ViewWatch.ts:34,28 | — | number | frame id | note page mutated |
| obsidian | new CalendarScreen (note block) + addChild | ProjectBlocks.ts:32 | view-change | CalendarScreen | none | block made |
| obsidian | new Scope + register ×3 | ProjectBlocks.ts:31,35,36,37 | — | — | none | block made |
| obsidian | registerDomEvent ×6 (mousedown/click/dblclick/pointerdown/focusin/focusout) | ProjectBlocks.ts:42,43,46,47 | — | — | none | block loads |
| obsidian | el.focus({preventScroll}) | ProjectBlocks.ts:44 | view-change | void | activeElement check | pointerdown in block |
| screen | screen.open | ProjectBlocks.ts:50 | read | Promise<void> | none | block loads |
| screen | BlockHeight.start / stop | ProjectBlocks.ts:51,55 | view-change | void | none | block load/unload |
| screen | screen.close + el.remove | ProjectBlocks.ts:57,58 | view-change | void | none | block unloads |
| screen | screen.resize | ProjectBlocks.ts:62 | view-change | void | none | workspace resize / block moved |
| obsidian | app.keymap.pushScope / popScope | ProjectBlocks.ts:68,69 | — | — | scoped flag | focus in/out of block |
| obsidian | registerEvent workspace layout-change / file-open / active-leaf-change / resize | ProjectBlocks.ts:98,99,100,101 | — | EventRef | none | plugin load |
| obsidian | registerEvent vault rename | ProjectBlocks.ts:102 | — | EventRef | none | plugin load |
| core | TaskService.onChange | ProjectBlocks.ts:104 | subscribe | () => void | none | plugin load |
| obsidian | workspace.onLayoutReady | ProjectBlocks.ts:105 | — | — | none | plugin load |
| obsidian | workspace.iterateAllLeaves | ProjectBlocks.ts:121 | read | — | none | sync |
| core | TaskService.projectNoteView(path, wide) | ProjectBlocks.ts:132 | read | Promise<FunnelView or null> | per-view sequence number `asks` (ProjectBlocks.ts:129-133) | sync for each Markdown view |
| obsidian | view.getMode / querySelector | ProjectBlocks.ts:162,163,164,170 | read | — | none | place |
| obsidian | parent.insertBefore(block.el) | ProjectBlocks.ts:169 | view-change | — | moved check | place |
| obsidian | block.el.style.setProperty(--tc-block-lift) | ProjectBlocks.ts:171 | view-change | — | equality check | place |
| obsidian | addChild(block) | ProjectBlocks.ts:174 | view-change (loads screen) | — | block.shown flag | first place |
| obsidian | ViewWatch.start / stop | ProjectBlocks.ts:153,179 | — | — | none | block made / dropped |
| obsidian | removeChild(block) | ProjectBlocks.ts:182 | view-change | — | none | block dropped |
| obsidian | containerEl.empty (redraw tab) | SettingsTab.ts:71 | view-change | — | none | display / redrawn |
| core | SettingsService.form | SettingsTab.ts:80 | read | SettingsForm | none | every `this.settings` access |
| obsidian | new SettingsPage + open | SettingsTab.ts:106,111 | view-change | Modal | none | row clicked (SettingsTab.ts:101) |
| obsidian | page.close | SettingsTab.ts:124 | view-change | — | none | another page / tab hide / plugin unload (main.ts:87) |
| core | setTasksFile | SettingsTab.ts:128 | write | Promise<void> | none | text field change (per keystroke) |
| core | setSection | SettingsTab.ts:131 | write | Promise<void> | none | text change |
| core | setMarker | SettingsTab.ts:136 | write | Promise<void> | none | text change |
| core | setLabelTag | SettingsTab.ts:138 | write | Promise<void> | none | text change |
| core | renameLevel | SettingsTab.ts:148 | write | Promise<void> | none | level name change (SettingsTab.ts:200) |
| core | recolourLevel | SettingsTab.ts:149 | write | Promise<void> | none (then redraw) | swatch / picker change / code blur (SettingsTab.ts:204,237,245) |
| core | typedColour("level") | SettingsTab.ts:150 | read | PriorityColor or null | none | code field blur |
| core | removeLevel | SettingsTab.ts:151 | write | Promise<void> | none | bin |
| core | moveLevel | SettingsTab.ts:152 | write | Promise<void> | none | grip drag (RowReorder) |
| obsidian | showPriorityColors (preview) | SettingsTab.ts:153 | view-change (all windows) | void | none | colour being picked |
| core | addLevel | SettingsTab.ts:158 | write | Promise<void> | none | Add priority |
| core | renameLabel | SettingsTab.ts:168 | write | Promise<void> | none | label name change |
| core | recolourLabel | SettingsTab.ts:169 | write | Promise<void> | none | swatch / picker / code |
| core | typedColour("label") | SettingsTab.ts:170 | read | PriorityColor or null | none | code blur |
| core | removeLabel | SettingsTab.ts:171 | write | Promise<void> | none | bin |
| core | moveLabel | SettingsTab.ts:172 | write | Promise<void> | none | grip drag |
| obsidian | showPriorityColors (preview) | SettingsTab.ts:173 | view-change | void | none | colour being picked |
| core | addLabel | SettingsTab.ts:178 | write | Promise<void> | none | Add label |
| core | setLabelPaint | SettingsTab.ts:184 | write | Promise<void> | none | dropdown |
| core | spec.preview (show) | SettingsTab.ts:227 | view-change | void | none | picker input / code typing / blur revert (SettingsTab.ts:233,241,246) |
| core | colourOf | SettingsTab.ts:260 | read | PriorityColor or null | none | picker input/change, code typing |
| core | movePreset | SettingsTab.ts:272 | write | Promise<void> | none | grip drag |
| core | renamePreset | SettingsTab.ts:276 | write | Promise<void> | none | text change |
| core | removePreset | SettingsTab.ts:278 | write | Promise<void> | none | bin |
| core | addPreset | SettingsTab.ts:282 | write | Promise<void> | none | Add preset |
| core | setUngrouped | SettingsTab.ts:283 | write | Promise<void> | none | text change |
| screen | display() after await (redrawn) | SettingsTab.ts:289 | view-change | void | none (awaits own write only) | add/remove/move/recolour done |
| core | setCardHeight | SettingsTab.ts:296 | write | Promise<void> | none | slider |
| core | setCardGap | SettingsTab.ts:297 | write | Promise<void> | none | slider |
| core | setDayStartHour | SettingsTab.ts:306 | write | Promise<void> | none | dropdown |
| core | setZoomLevels | SettingsTab.ts:313 | write | Promise<void> | none | text change |
| core | setCount(field) | SettingsTab.ts:413 | write | Promise<void> | none | text change (scrollToHour 308, longPressMs 309, refreshSeconds 328, staleAfterMinutes 331) |
| core | CalendarService.known | SettingsTab.ts:358 | read | Promise<readonly ShownCalendar[]> | none | Calendars page opens |
| core | CalendarService.setShown | SettingsTab.ts:368 | write | Promise<void> | none | calendar toggle |
| core | setGoogleClientId | SettingsTab.ts:321 | write | Promise<void> | none | text change |
| core | bindClientSecret | SettingsTab.ts:326 | read+write (binds field) | void | none | Calendars page draws |
| core | GoogleAccount.isLoggedIn | SettingsTab.ts:335 | read | boolean | none | page draws |
| core | GoogleAccount.logout | SettingsTab.ts:343 | write | Promise<void> | none | Log out |
| core | GoogleAccount.login | SettingsTab.ts:344 | write (opens browser) | Promise<string> | none | Log in |
| screen | redraw (SettingsPage) | SettingsTab.ts:345 | view-change | void | none | after login/logout |
| obsidian | new Notice (Google error) | SettingsTab.ts:347 | view-change | Notice | none | login/logout failed |
| core | setWorkCalendarFile | SettingsTab.ts:376 | write | Promise<void> | none | text change |
| core | WorkCalendarSetup.scriptableLoader | SettingsTab.ts:382 | read | string | none | Copy |
| obsidian | navigator.clipboard.writeText | SettingsTab.ts:382 | write (clipboard) | Promise<void> | none | Copy |
| obsidian | new Notice("Scriptable script copied") | SettingsTab.ts:383 | view-change | Notice | none | Copy |
| obsidian | ResizeObserver.observe(rows) | SettingsTab.ts:430 | — | — | width equality | colour rows drawn |
| obsidian | Modal.setTitle / modalEl.addClass | SettingsPage.ts:15,16 | view-change | — | none | page opens |
| obsidian | contentEl.empty + build | SettingsPage.ts:22,23 | view-change | — | none | page opens / redraw |
| obsidian | contentEl.empty + closed() → tab.display | SettingsPage.ts:27,28 | view-change | — | page identity (SettingsTab.ts:107) | page closes |
| core | UndoService.canUndo | BottomCapsule.ts:29 | read | boolean | none | Undo pressed |
| screen | actions.onUndo | BottomCapsule.ts:29 | write (CS undo) | void | (CS's own) | Undo pressed |
| screen | actions.onMore | BottomCapsule.ts:32 | view-change (menu) | void | none | ⋯ pressed |
| core | UndoService.onChange | BottomCapsule.ts:33 | subscribe | () => void | none | capsule built |
| core | UndoService.canUndo | BottomCapsule.ts:43 | read | boolean | none | undo history changed / built |
| obsidian | MutationObserver observe ×3 / disconnect | StatusBarRoom.ts:63,65,67,61,45 | — | — | holders count | hold / refresh / let go |
| obsidian | body classList toggle/remove tc-status-bar-shown | StatusBarRoom.ts:56,46 | view-change | — | holders count | status bar style/children change |
| obsidian | body.style.setProperty card height/gap | cardSize.ts:19,20 | view-change | — | none | settings change (main.ts:48), popout opens (cardSize.ts:24) |
| obsidian | body.style.removeProperty | cardSize.ts:36,37 | view-change | — | none | plugin unload (main.ts:53) |
| obsidian | head.appendChild(style) / textContent | priorityColors.ts:47,48 | view-change | — | none | settings change (main.ts:49), preview (SettingsTab), popout |
| obsidian | body classList toggle tc-labels-blend | priorityColors.ts:50,69 | view-change | — | none | settings change (main.ts:50) / popout |
| obsidian | sheet.remove / body class remove | priorityColors.ts:73,77 | view-change | — | none | plugin unload (main.ts:54) |
| obsidian | Capacitor Haptics.impact | haptics.ts:20 | — | Promise<void> | none | tap() from CS (CS:611,654,842,1576,1602; DragController) |
| obsidian | navigator.vibrate | haptics.ts:28 | — | boolean | none | same |
| obsidian | document.execCommand undo/redo | fieldUndo.ts:10 | view-change (field text) | boolean | none | Cmd+Z / Cmd+Shift+Z in a plain field |
| core | new SectionNameEntry | GroupNameField.ts:24 | — | SectionNameEntry | — | name field opens |
| core | SectionNameEntry.enter / escape | GroupNameField.ts:30,31 | write (calls onDone once) | void | SectionNameEntry once-only | Enter / Escape |
| core | SectionNameEntry.blur | GroupNameField.ts:33 | write (calls onDone once) | void | SectionNameEntry once-only | blur |
| obsidian | input.focus + setSelectionRange | GroupNameField.ts:34,35 | view-change | — | none | field opens |
| obsidian | requestAnimationFrame / cancelAnimationFrame | FramePass.ts:7 (via 20,34) | — | number | frame id dedupe | ask / cancel |
| obsidian | listener(doc) for each popout | windowDocuments.ts:13 | view-change | — | none | popout opens (main.ts:144) |

### B.3 G2: drag/*, BulkController, TaskSelection, gestures, PinchZoom, Swipe, ScreenPager, ScreenTracks, DayPeek, ColumnSwitch, Divider, small helpers (135 rows)

`act` = CS:899 (Picks gate + `changing` chain + reread `data.tasks()`).

| kind | method | file:line | read/write/view-change | returns (from contracts) | guard | trigger |
|---|---|---|---|---|---|---|
| core | `TaskService.snap` via deps.snap (CS:268) | drag/DragController.ts:466 | read | `number` | arbiter `"resize"` held | dot moved |
| core | `TaskService.stretch` via deps.stretch (CS:301) | drag/DragController.ts:463 | read | `StretchSpan` | arbiter `"resize"` claimed (457) | dot grabbed |
| core | `TaskService.stretch` via deps.stretch (CS:301) | drag/DragController.ts:467 | read | `StretchSpan` | arbiter `"resize"` | dot moved |
| core | `TaskService.resize` via deps.onResize → act (CS:304) | drag/DragController.ts:481 | write | `Promise<boolean>` | via deps → act (CS:304); arbiter `"resize"` held until done (488) | dot let go |
| core | `TaskService.drop` (or `carryOnNode`, `projectsDropPreview`+`dropInProjects`) via deps.onResult → CS.applyDrop (CS:293) → act (CS:1148 / 1069 / 1084) then `TaskService.endCarry` (CS:1149/1144) | drag/DragController.ts:351 | write | `Promise<readonly TaskKey[]>` (drop, dropInProjects); `Promise<void>` (carryOnNode, endCarry) | via deps → act (CS:1148); DragSession `done`; `DragSession.landing` (landNow) | card let go on a target |
| core | `TaskService.startCarry` via deps.onLift → CS.startCarry (CS:1044) | drag/DragController.ts:323 | write | `Promise<void>` | none (not via act; fire-and-forget) | card lifted |
| core | `TaskService.endCarry("nowhere")` via deps.putBack → CS.endCarry (CS:300, 1052) then `data.tasks()` | drag/DragController.ts:337 | write | `Promise<void>` | CS `carrying` flag (CS:1049); not via act | drag let go nowhere / cancelled |
| core | `TaskService.carried` via deps.carried → BulkController.carried (CS:277) | drag/DragController.ts:124 | read | `readonly TaskKey[]` | none | long press on a list card |
| core | `TaskService.toggleCollapsed` via deps.fold → CS.fold (CS:843) | drag/DragController.ts:129 | write | (see contracts) | via deps → act (CS:843) | tap on subtask counter |
| core | `TaskService.selectProjectNode` via deps.mark → CS.openProjectOf → showProjectNode (CS:1257) | drag/DragController.ts:129 | write | (see contracts) | via deps → act (CS:1257) | tap on a card's project mark |
| core | same as above | drag/DragController.ts:152 | write | (see contracts) | via deps → act (CS:1257) | tap on a block's project mark |
| obsidian | task menu (TaskMenu overlay) via deps.onMenu (CS:307 → showMenu) | drag/DragController.ts:112 | view-change | `OpenMenu` | none | right-click on card |
| obsidian | task menu via deps.onMenu | drag/DragController.ts:130 | view-change | `OpenMenu` | none (pick/mark/fold short-circuit) | tap on card |
| obsidian | task menu via deps.onMenu | drag/DragController.ts:152 | view-change | `OpenMenu` | none | tap on block |
| obsidian | task menu with grips via deps.onMenu (selectWithMenu) | drag/DragController.ts:194 | view-change | `OpenMenu` | none (hold path: arbiter `"hold"`) | right-click / long click / finger held on block |
| obsidian | Timeline selection `timeline.select(item)` | drag/DragController.ts:193 | view-change | void | none | selectWithMenu |
| obsidian | Timeline selection cleared | drag/DragController.ts:206 | view-change | void | arbiter `"hold"` | held finger moves on |
| obsidian | Timeline selection cleared | drag/DragController.ts:275 | view-change | void | arbiter `"newslot"` | long tap on empty timeline |
| obsidian | event menu via onMenu (CS:352 → EventMenu.open) | drag/DragController.ts:164, 173, 175, 176 | view-change | void | 173: arbiter `"hold"`; others none | right-click / held / tap / long click on event |
| obsidian | quick rename via deps.onRename (CS:308) | drag/DragController.ts:188 | view-change (text entry) | void | none | second click on menu copy |
| obsidian | quick field at slot via deps.onNewSlot (CS:310) | drag/DragController.ts:291 | view-change (text entry) | void | arbiter `"newslot"` released just before (288) | long tap on timeline let go |
| obsidian | `timelineDrop.previewNew` / `drop.clear` | drag/DragController.ts:276, 279, 290 | view-change | void | arbiter `"newslot"` | new-slot gesture |
| obsidian | `timeline.layoutTasks(true)` | drag/DragController.ts:320, 326 | view-change | void | arbiter `"drag"` | lift / return |
| obsidian | `timeline.stretchTo` / `endStretch` | drag/DragController.ts:470, 484, 487, 494 | view-change | void | arbiter `"resize"` | resize |
| obsidian | haptics.tap | drag/DragController.ts:210, 274, 309, 350, 364, 392, 459, 481 | view-change (vibrate) | void | none | hold, new slot, lift, drop, plus, resize |
| obsidian | deps.onDragging → CS (CS:280: bulk.settled, arriving.arrived, quick.onDragging, `is-dragging`, layout.hold, carryReport.end) | drag/DragController.ts:322, 346 | view-change | void | none | lift / copy landed |
| obsidian | deps.moved → carryReport.move (CS:290) | drag/DragController.ts:412 | view-change | void | CS `carrying` && panel | pointer move while carrying |
| obsidian | deps.onError → CS.reportFailure (Notice + `data.tasks()`) (CS:294, 944) | drag/DragController.ts:339, 379 | view-change + read | void | none | drag target threw |
| obsidian | `console.error` | drag/DragController.ts:491 | other | void | none | resize write threw |
| obsidian | `FloatingCard`/`PlusFloat` created in body | drag/DragController.ts:311, 366 | view-change | — | arbiter `"drag"` | lift / plus |
| obsidian | `DragSession.landNow` | drag/DragController.ts:308, 363; drag/GroupDrag.ts:59 | view-change (lands older drags' copies, clears their targets) | void | static `landing` set | a new drag starts |
| obsidian | `onDrop(result)` (plus's caller: QuickEntry) | drag/DragController.ts:388, 393 | view-change (opens field) | `HTMLElement \| null \| void` | DragSession `done` | plus let go |
| obsidian | targets `.clear()` on plus drop | drag/DragController.ts:391 | view-change | void | none | plus let go on target |
| core | `TaskService.dropSpan` via opts.span (CS:358) | drag/TimelineDrop.ts:60 | read | `DaySpan` | none | finger over timeline / new slot |
| core | `TaskService.snap` via opts.snap (CS:357) | drag/TimelineDrop.ts:59 | read | `number` | none | same |
| core | `TaskService.newSlot` via opts.newSlot (CS:359) | drag/TimelineDrop.ts:55 | read | `Slot` | none | new-slot let go (DragController.ts:289) |
| obsidian | `timeline.showDrop` / `clearDrop` | drag/TimelineDrop.ts:60, 74 | view-change | void | none | preview / leave / clear |
| core | `TaskService.moveGroup` via deps.onMove → act (CS:234) | drag/GroupDrag.ts:91 | write | `Promise<void>` | via deps → act (CS:234); `session.interrupted` before drawing landing (92) | section let go on a slot |
| obsidian | `console.error` | drag/GroupDrag.ts:91 | other | void | none | section move failed |
| obsidian | group menu via deps.onTap (CS:233 → GroupMenu.open) | drag/GroupDrag.ts:53 | view-change | void | none | tap on section header |
| obsidian | haptics.tap | drag/GroupDrag.ts:60, 90 | vibrate | void | none | section lift / drop |
| obsidian | `taskList.showLanding` | drag/GroupDrag.ts:93, 161, 178 | view-change | void | `marked` (161); `interrupted` (93) | section preview / drop / clear |
| obsidian | `Motion.settle(node)` | drag/GroupDrag.ts:79 | view-change | void | none | section copy landed |
| obsidian | `el.animate` (SectionFloat) | drag/GroupDrag.ts:230 | view-change | `Promise<void>` | none | land/fly/sink/vanish |
| obsidian | float `land`/`sink`/`vanish`/`flyTo`/`remove` | drag/DragSession.ts:103, 106, 112, 133, 178, 184 | view-change | `Promise<void>` | `done`; `landing` | drop / cancel / abort |
| obsidian | `opts.onEnd(null)` after cancel/abort | drag/DragSession.ts:134, 187 | view-change (caller's onEnd) | `Promise<…>` | `done` | cancel / abort |
| obsidian | `opts.beforeReturn` (→ putBack, see above) | drag/DragSession.ts:175 | write (core endCarry) | `Promise<void> \| null` | `done` | let go nowhere / cancel |
| obsidian | `opts.letGo` (arbiter release + detach) | drag/DragSession.ts:98, 131, 177, 180 | other | void | `done` | let go / cancel / abort |
| obsidian | `opts.onReturn` | drag/DragSession.ts:146 | view-change | void | `landing.delete` once | copy landed / landNow |
| obsidian | targets `.leave` / `.preview` / `.clear` | drag/DragSession.ts:75, 79, 158 | view-change | void | `done`; `cleared` | pointer move / end |
| obsidian | `fillCard` + `stretchWhole` + body append | drag/FloatingCard.ts:47, 52, 53 | view-change | void | none | lift |
| obsidian | `el.animate` width | drag/FloatingCard.ts:43 | view-change | Animation | none | lift |
| obsidian | `window.setTimeout` flight | drag/FloatingCard.ts:130, 145; drag/PlusFloat.ts:51 | other (timer) | `Promise` | none | land/vanish |
| obsidian | `roundShape` plus in body | drag/PlusFloat.ts:13 | view-change | HTMLElement | none | plus taken |
| obsidian | DropLine insert/remove in list | drag/DropLine.ts:31, 46 | view-change | void | `el.parentElement` check (22) | preview / hide |
| obsidian | `el.scrollTop` write (auto-scroll) | drag/AutoScroll.ts:79 | view-change (scroll) | void | `frame` (one pending), dwell (`arrived`) | finger at edge |
| obsidian | `requestAnimationFrame` / `cancelAnimationFrame` | drag/AutoScroll.ts:68, 76, 91 | other | number | `frame` | finger near edge |
| obsidian | `onScrolled` → target `preview` again | drag/AutoScroll.ts:70, 80 | view-change | void | `frame` | auto-scroll step |
| obsidian | `ArrivingCard` class toggles | drag/ArrivingCard.ts:24, 31, 42 | view-change | void | `id` match; `card.isConnected` | drop / redraw / landed |
| obsidian | LongPress `setTimeout` / `clearTimeout` | drag/LongPress.ts:89, 135 | other | number | `press` identity (125) | press |
| obsidian | `opts.onStart` / `onTap` / `onLongTap` | drag/LongPress.ts:107, 116, 129, 130 | (caller's) | void | `busy()` (116, 128), `isConnected` (128), `deaf` | press outcome |
| core | `TaskService.pickStatus` via deps → act (CS:238) | BulkController.ts:190 | write | `Promise<void>` | via deps → act (CS:238) | bulk menu status tile |
| core | `TaskService.togglePriority` via deps → act (CS:244) | BulkController.ts:191 | write | `Promise<void>` | via deps → act (CS:244) | bulk menu priority |
| core | `TaskService.postponeAll` via deps → act (CS:239) | BulkController.ts:192 | write | `Promise<void>` | via deps → act (CS:239) | bulk menu date |
| core | `TaskService.removeDue` via deps → act (CS:252) | BulkController.ts:193 | write | `Promise<void>` | via deps → act (CS:252) | bulk menu remove due |
| core | `TaskService.toggleLabel` via deps → act (CS:247) | BulkController.ts:195 | write | `Promise<readonly (TaskItem \| null)[]>` | via deps → act (CS:247) | bulk menu label (menu stays open) |
| core | `TaskService.toSection` via deps → act (CS:258) | BulkController.ts:201 | write | `Promise<void>` | via deps → act (CS:258) | bulk menu section |
| core | `TaskService.setProject` via deps → act (CS:259) | BulkController.ts:202 | write | `Promise<void>` | via deps → act (CS:259) | bulk menu project |
| core | `TaskService.newProject` via deps → act (CS:260) | BulkController.ts:203 | write | `Promise<ProjectRef \| null>` | via deps → act (CS:260) | bulk menu new project |
| core | `TaskService.toggleProject` via deps → CS.toggleProject → act (CS:261, 1406) | BulkController.ts:205 | write | `Promise<readonly (TaskItem \| null)[]>` | via deps → act (CS:1406) | bulk menu project toggle (menu stays open) |
| core | `TaskService.removeAll` via deps → act (CS:240) | BulkController.ts:211 | write | `Promise<void>` | via deps → act (CS:240) | bulk menu delete |
| core | `TaskService.bulkMenu` via deps.menu (CS:243) | BulkController.ts:188 | read | `TaskMenuModel` | none | bulk menu built / refreshed |
| core | `TaskService.carried` via deps.carried (CS:253) | BulkController.ts:132 | read | `readonly TaskKey[]` | none | lift of a picked card |
| obsidian | `BulkMenu.open` | BulkController.ts:181 | view-change | `BulkMenu` | none (opening is not checked against `menu`) | click on picked card / count / «⋯» |
| obsidian | `Button.create` ×3, capsule div | BulkController.ts:75-78 | view-change | Button | none | mount |
| obsidian | `PlusRing.show` / `hide` | BulkController.ts:139, 145 | view-change | void | `carriesMany` | several cards carried / drag over |
| obsidian | Button `setText` / `setOff` | BulkController.ts:162-164 | view-change | void | none | selection changed |
| obsidian | `pickMark` (prepends circle) | BulkController.ts:96 / TaskSelection.ts:21 | view-change | void | existing `.tc-pick` check (18) | card drawn |
| obsidian | `querySelectorAll('.tc-card.is-selected')` remove + add | TaskSelection.ts:128-129 | view-change | void | none | selection changed |
| obsidian | `scrollSmoothly` | FoundCard.ts:12, 13 | view-change (scroll) | void | `scroll` flag (36-37) | first drawing after search |
| obsidian | `requestAnimationFrame` | FoundCard.ts:38 | other | number | `scroll` flag | found card drawn |
| core | `TaskService.dayView` | DayPeek.ts:114 | read | `Promise<DayView>` | `removed` flag skips render only (144); scrollTop/alignTimeline (117-118) run even after remove; no sequence | swipe/arrow toward another day |
| core | `CalendarService.events(date, "peek")` | DayPeek.ts:107 | read | `DayEventsAsk` | none | same |
| core | `DayEventsAsk.fresh()` | DayPeek.ts:109 | read (network fetch possible) | `Promise<DayEvents>` | `removed` flag in render (144) | same |
| core | `TaskService.shownSpan` (Timeline dep) | DayPeek.ts:102 | read | `DaySpan` | none | peek timeline render |
| core | `CalendarService.isPast` | DayPeek.ts:105, 146 | read | `boolean` | none | peek render |
| core | `DayService.relation` via deps.relation (CS:730) | DayPeek.ts:98 | read | `DayRelation` | none | peek render |
| core | `TaskService.columnSections` via deps.sections (CS:735) | DayPeek.ts:83, 84 | read | `ColumnSections \| null` | none | peek list render |
| obsidian | `TaskList`/`Timeline`/`renderAllDayRows` render, `destroy`, `el.remove` | DayPeek.ts:80, 95, 138-140, 145-148 | view-change | void | `removed` | peek create / data arrives / remove |
| obsidian | deps.alignTimeline (CS:740) | DayPeek.ts:118, 121 | view-change | void | none | peek create / tasks arrive |
| obsidian | `Swipe` → `target.follow/settle/catch/stand` (ScreenPager) | Swipe.ts:137, 142, 193, 204, 216, 252, 261 | view-change | `Promise<void>` (settle) | arbiter `"swipe"` via `holds`; `round` token (250) | finger/trackpad swipe |
| obsidian | `e.preventDefault` on wheel | Swipe.ts:128 | other | void | none | horizontal trackpad move |
| core | `ScreenPager` deps.track → CS (CS:439: `landed()` + `layout.track`) → RibbonLayout.trackTo → `StripTrack` / `DayTrack` (→ `DayPeek`) / `EdgeTrack` | ScreenPager.ts:176 | view-change (+ reads via DayPeek) | `ScreenTrack` | `way` (one way at a time) | swipe starts a direction / arrow turn |
| obsidian | `requestAnimationFrame` / `cancelAnimationFrame` / `setTimeout` | ScreenPager.ts:85, 86, 107-108, 137, 148-149 | other | number | `settling` identity (131) | settle |
| obsidian | `track.at` / `track.land` | ScreenPager.ts:67, 136, 154-155, 162, 174 | view-change | void | `settling` | follow / frame / finish |
| core | `TaskService.setFunnelPlace` via StripTrack deps.onArrive → ribbon.arrive (CS:665) → CS.arriveAt (CS:774) → afterEntry → setMode → act (CS:813) | ScreenTracks.ts:177 | write | `Promise<void>` | via deps → act (CS:813); afterEntry | swipe lands on another pair of columns |
| obsidian | StripTrack deps.showMode / turnWheel (→ ColumnSwitch.follow) | ScreenTracks.ts:153, 155, 173, 178 | view-change | void | none | strip scrub |
| obsidian | `part.animate` (paused scrub) / `cancel` | ScreenTracks.ts:163, 179 | view-change | Animation | none | strip track built / landed |
| obsidian | DayTrack events.onNearer → CS (CS:758: `titleDay`, `dayNav.render`) | ScreenTracks.ts:103, 111 | view-change | void | `nearer` change | day slide crosses half |
| core | DayTrack events.onArrive → CS (CS:762: `landing`, `scrolledFor`, afterEntry → `select(date)` → DayData reread) | ScreenTracks.ts:108 | view-change + read | void | afterEntry | day slide lands |
| obsidian | `peek.remove` / `restore` | ScreenTracks.ts:109-110 | view-change | void | DayPeek `removed` | day slide goes back |
| core | `TaskService.setFunnelPlace` via opts.onChange → CS (CS:376) → afterEntry → leaveDone → setMode → act (CS:813) | ColumnSwitch.ts:218 | write | `Promise<void>` | via deps → act (CS:813); afterEntry | wheel let go / icon tap / arrow key |
| obsidian | opts.onSources → SourcesPopover.open (CS:378, 1303) | ColumnSwitch.ts:146 | view-change | void | `press` && !dragging && place is calendar | wheel held |
| obsidian | opts.dot → DayData alert/words (CS:377) | ColumnSwitch.ts:256 | read | `{alert, words}` | none | render |
| obsidian | `setTimeout`/`clearTimeout` (hold, settling) | ColumnSwitch.ts:136, 156, 185, 214, 216, 222 | other | number | none | press / show / follow |
| obsidian | `labelMark` | ColumnSwitch.ts:260 | view-change | void | none | render |
| obsidian | settings write `listShare` / `treeWidth` via Divider opts.onRelease (RibbonLayout.ts:73, StillLayout.ts:68 → CS:607; TreePanel.ts:66 → CS:1601) then `parts.request("frame")` | Divider.ts:92 | write (settings) | (settings store `set`, not in ScreenSettingsStore contract) | arbiter `"divider"` held until glide settles, released just before (91) | divider let go |
| obsidian | opts.onWidth → CSS property (`--tc-list-width`, tree width, StillLayout widths) | Divider.ts:44 (SnapGlide cb) | view-change | void | arbiter `"divider"` | divider moved |
| obsidian | opts.onSnap → haptics tap (host.tap) | Divider.ts:77 | vibrate | void | none | divider reaches middle |
| obsidian | settings write `zoom` via opts.onRelease → CS.settleZoom (CS:372, 991) | PinchZoom.ts:107 | write (settings) | (settings store `set`) | none (wheel: `wheelTimer` debounce) | pinch fingers lift / wheel stops |
| obsidian | opts.onScale → CS.zoom (CS:371, 977: rAF `zoomFrame` coalesces) | PinchZoom.ts:103 | view-change | void | CS `zoomFrame` | pinch / ctrl-wheel |
| obsidian | `e.preventDefault` on wheel | PinchZoom.ts:113 | other | void | none | ctrl/cmd wheel |
| obsidian | `setTimeout`/`clearTimeout` wheel settle | PinchZoom.ts:118-119 | other | number | `wheelTimer` | ctrl/cmd wheel |
| core | `SettingsService` `move…`/`movePreset` via RowReorder.move (SettingsTab.ts:196, 272 → `redrawn`) | RowReorder.ts:70 | write (settings) | `Promise<void>` | none | settings row dropped at a new index |
| obsidian | `ExtraButtonComponent` (grip) | RowReorder.ts:21 | view-change | ExtraButtonComponent | none | settings row drawn |
| obsidian | `rows.insertBefore` | RowReorder.ts:69 | view-change | void | `to !== from` | row landed |
| obsidian | `setTimeout` landing | RowReorder.ts:73 | other | number | none | row let go |
| obsidian | onDoubleClick → quick.openAtEnd (FunnelLists.ts:75 → CS:647) | FreeRoomDoubleClick.ts:15 | view-change (text entry) | void | `mouse` flag; target is the area | mouse double click on list free room |
| core (pure rule) | `placeAt` | drag/ListDrop.ts:176 | pure | `GapPlace` | n/a | preview |
| core (pure rule) | `sameGap` | drag/ListDrop.ts:187, 389; drag/listPlace.ts:9 | pure | `boolean` | n/a | preview / line |
| core (pure rule) | `placeOfDrop` | drag/ListDrop.ts:188, 269 | pure | `ListPlace \| null` | n/a | preview / drop |
| core (pure rule) | `gapOfPlace` | drag/ListDrop.ts:198 | pure | `GapPlace` | n/a | preview |
| core (pure rule) | `carriedMiddle` | drag/ListDrop.ts:376 | pure | `number` | n/a | preview |
| core (pure rule) | `levelAt` | drag/ListDrop.ts:381 | pure | `number` | n/a | preview |
| core (pure rule) | `placesInGap` | drag/ListDrop.ts:437 | pure | `boolean` | n/a | preview / drop |
| core (pure rule) | `acceptsDrop` | drag/TimelineDrop.ts:34 | pure | `boolean` | n/a | hitTest |
| core (pure rule) | `groupPlaceOf` | drag/GroupDrag.ts:161, 165 | pure | `GroupPlace \| null` | n/a | section preview / drop |
| core (pure rule) | `grownStart` | drag/FloatingCard.ts:86 | pure | `number` | n/a | float move |
| core (pure rule) | `wholeWidth` | wholeCard.ts:29 | pure | grown width or null | n/a | copy stretch |
| core (pure rule) | `keyId` | BulkController.ts:132, 133; TaskSelection.ts:42, 46, 75, 81, 99, 105, 112-115 | pure | `string` | n/a | selection bookkeeping |
| core (pure rule) | `swipeLanding` | Swipe.ts:225 | pure | `Shift \| 0` | n/a | swipe let go |
| core (pure rule) | `funnelPlaceShowing` | ColumnSwitch.ts:46 | pure | `FunnelPlace` | n/a | icon tap |
| core (pure rule) | `dividerAt` | Divider.ts:71 | pure | `DividerStop` | n/a | divider move / up |
| core (pure rule) | `listWidths` / `listShareOf` | listWidth.ts:6, 11, 16, 21 | pure | widths / share | n/a | divider bounds |
| core (pure rule) | `dueLabel` / `dayMonth` | dates.ts:25, 29, 53 | pure | strings | n/a | labels |

### B.4 G3: menu/*, full/*, search/*, sources/*, markdown/*, kit/*, repeat/*, projects/*, ViewButton (174 rows)

`kind`: core = TaskService/UndoService/core class or pure core function (directly or via a deps callback); obsidian = Obsidian API / host; screen = a callback into CalendarScreen or a controller that changes the view without itself being a core/obsidian call (listed for completeness; counted separately).

| kind | method | file:line | read/write/view-change | returns (from contracts) | guard | trigger |
|---|---|---|---|---|---|---|
| core | `context.menu(item)` → `TaskService.menu` (CS:1361) | menu/TaskMenu.ts:349 | read | `TaskMenuModel` | none | menu built / any page back to menu / after label toggle |
| core | `context.menu(item).sections` → `TaskService.menu` | menu/TaskMenu.ts:460 | read | `TaskMenuModel` | none | Section row |
| core | `context.menu(item).project` → `TaskService.menu` | menu/TaskMenu.ts:489 | read | `TaskMenuModel` | none | Project row / after project toggle |
| core | `context.menu(item).reminders` → `TaskService.menu` | menu/TaskMenu.ts:541 | read | `TaskMenuModel` | none | Reminder row |
| core | `context.menu(item)` → `TaskService.menu` | menu/TaskMenu.ts:579 | read | `TaskMenuModel` | none | Pick a date tile |
| core | `actions.pickStatus` → `TaskService.pickStatus` via deps → act (CS:1367) | menu/TaskMenu.ts:364 | write | `Promise<void>` | Picks.pick + act | status tile (no confirm) |
| core | `actions.pickStatus` / `actions.remove` (confirm) via deps → act (CS:1367, 1396) | menu/TaskMenu.ts:445 | write | `Promise<void>` | Picks.pick + act; Enter via `confirmAsked` | Confirm button / Enter |
| core | `actions.togglePriority` → `TaskService.togglePriority` via deps → act (CS:1381) | menu/TaskMenu.ts:367 | write | `Promise<void>` | Picks.pick + act | priority tile |
| core | `actions.toggleLabel` → `TaskService.toggleLabel` via deps → act (CS:1382-1388) | menu/TaskMenu.ts:413 | write, then redraw menu | `Promise<readonly (TaskItem\|null)[]>` (first taken) | `labelling` flag + act; menu stays open (no Picks) | label tile |
| core | `actions.postpone` → `TaskService.postpone` via deps → act (CS:1368) | menu/TaskMenu.ts:378 | write | `Promise<void>` | Picks.pick + act | Today/Tomorrow tile |
| core | `actions.postpone` via deps → act (CS:1368) | menu/TaskMenu.ts:583 | write | `Promise<void>` | Picks.pick + act | date in month grid |
| core | `actions.removeDue` → `TaskService.removeDue` via deps → act (CS:1369) | menu/TaskMenu.ts:584 | write | `Promise<void>` | Picks.pick + act | Remove due date |
| core | `actions.remove` → `TaskService.remove` via deps → act (CS:1396) | menu/TaskMenu.ts:396 | write | `Promise<void>` | Picks.pick + act | Delete (no confirm) |
| core | `actions.toSection` → `TaskService.toSection` via deps → act (CS:1370) | menu/TaskMenu.ts:470 | write | `Promise<void>` | Picks.pick + act | section row |
| core | `actions.setProject(null)` → `TaskService.setProject` via deps → act (CS:1374) | menu/TaskMenu.ts:491 | write | `Promise<void>` | Picks.pick + act | No project |
| core | `actions.toggleProject` → `CS.toggleProject` → act → `TaskService.toggleProject` (CS:1376, 1404-1410) | menu/TaskMenu.ts:500 | write, then redraw Project page | `Promise<readonly (TaskItem\|null)[]>` | act only (no flag; menu stays) | project row |
| core | `actions.newProject` → `TaskService.newProject` via deps → act (CS:1375) | menu/TaskMenu.ts:524 | write | `Promise<ProjectRef\|null>` (act gets `!== null`) | Picks.pick + act; closure `asking` | Enter in new project name |
| core | `actions.setReminder` → `TaskService.setReminder` via deps → act (CS:1390) | menu/TaskMenu.ts:541 | write | `Promise<void>` | Picks.pick + act | reminder row |
| core | `new RepeatPage(item, rule => actions.setRepeat(rule))` (core class) | menu/TaskMenu.ts:556 | read (draft) | `RepeatPage` | `??=` (one per menu) | Repeat row |
| core | `page.change(rule)` (core `RepeatPage`) | menu/TaskMenu.ts:561 | in-memory | `void` | none | repeat editor tap |
| core | `page.remove()` then `close()` pick | menu/TaskMenu.ts:565-566 | write on close | `void` | Picks.pick (empty action) | Remove repeat |
| core | `page.close()` → `actions.setRepeat` → `TaskService.setRepeat` via deps → act (CS:1391) | menu/TaskMenu.ts:616 | write | `Promise<void>` | `overlay.afterClose` + act (not in Picks.waiting) | menu closes with a repeat page opened |
| screen | `actions.openLink` → `CS.openLink` (window.open / `workspace.openLinkText`, CS:1434-1436) | menu/TaskMenu.ts:229 | view-change | `void` | Picks.pick | link tapped in copy |
| screen | `actions.rename(this)` → `quick.rename` or `full.rename` (CS:1392) | menu/TaskMenu.ts:351 | view-change (field) | `void` | in stack: none; else Picks.pickNow | Rename row |
| screen | `actions.openDescription(true)` → `CS.openFull` (CS:1393) | menu/TaskMenu.ts:353 | view-change | `void` | Picks.pickNow | Add description row |
| screen | `actions.addSubtask(this)` → `quick.addSubtask` / `full.addSubtask` (CS:1395) | menu/TaskMenu.ts:357 | view-change (field) | `void` | timeline block: none; else Picks.pickNow | Add subtask row |
| screen | `actions.openFull()` → `CS.openFull` (CS:1394) | menu/TaskMenu.ts:389 | view-change | `void` | Picks.pick | Open full screen |
| core | `actions.openInObsidian` → `TaskService.lineOf` + workspace (CS:1397, 1412+) | menu/TaskMenu.ts:390 | read + view-change | `Promise<number>` (lineOf) | Picks.pick; not act | Open in Obsidian |
| screen | `actions.newSection` → `CS.askGroupName` (CS:1371-1373) | menu/TaskMenu.ts:471 | view-change (name field; later act toSection CS:1168) | `void` | Picks.pickNow; arbiter `NAMING` claim (CS:1158) | New section |
| screen | `onSubtask(...)` → `CS.showMenu` with handed-over sheet (CS:1362) | menu/TaskMenu.ts:322 | view-change | `TaskMenu` | Picks.handOff | subtask card in stack |
| screen | `actions.openDescription(false)` (peek `onRead`) → `CS.openFull` | menu/TaskMenu.ts:331 | view-change | `void` | Picks.pick (DescriptionPeek.ts:37) | tap on peek text |
| screen | `context.lifted(copy, close)` | menu/TaskMenu.ts:214 | view (dress copy) | `void` | none | menu built |
| screen | `then()` in `onClickedAgain` → DragController `onRename` (drag/DragController.ts:188) | menu/TaskMenu.ts:607 | view-change | `void` | `until` time window | second mouse press |
| screen | `fieldClosed(how)` → `QEC.menuClosed` | menu/TaskMenu.ts:617 | view-change | `void` | none | menu closes while typing |
| core | `labelTitle(label.name)` (pure) | menu/TaskMenu.ts:98 | read (pure) | `string` | none | menu drawn |
| core | `context.menu(items)` → `TaskService.bulkMenu` (BC:188, CS:242) | menu/BulkMenu.ts:121 | read | `TaskMenuModel` | none | bulk menu drawn |
| core | `context.menu(items).sections` → `TaskService.bulkMenu` | menu/BulkMenu.ts:180 | read | `TaskMenuModel` | none | Section row |
| core | `context.menu(items).project` → `TaskService.bulkMenu` | menu/BulkMenu.ts:200 | read | `TaskMenuModel` | none | Project row / after toggle |
| core | `context.menu(items)` → `TaskService.bulkMenu` | menu/BulkMenu.ts:242 | read | `TaskMenuModel` | none | Pick a date |
| core | `actions.pickStatus` → BC `done` (stops selection) → deps → act → `TaskService.pickStatus` (BC:190, CS:238) | menu/BulkMenu.ts:123 | write | `Promise<void>` | Picks.pick + act | status tile |
| core | `actions.pickStatus`/`actions.remove` confirm via BC → act (CS:238, 240) | menu/BulkMenu.ts:159 | write | `Promise<void>` | Picks.pick + act | Confirm |
| core | `actions.togglePriority` via BC → act (CS:244) | menu/BulkMenu.ts:127 | write | `Promise<void>` | Picks.pick + act | priority tile |
| core | `actions.toggleLabel` via BC (BC:194-199) → act → `TaskService.toggleLabel` (CS:245-251) | menu/BulkMenu.ts:168 | write, redraw menu | `Promise<readonly (TaskItem\|null)[]>` | `labelling` flag + act; menu stays | label tile |
| core | `actions.postpone` via BC → act → `TaskService.postponeAll` (CS:239) | menu/BulkMenu.ts:131 | write | `Promise<void>` | Picks.pick + act | Today/Tomorrow |
| core | `actions.postpone` via BC → act (CS:239) | menu/BulkMenu.ts:248 | write | `Promise<void>` | Picks.pick + act | date in grid |
| core | `actions.removeDue` via BC → act (CS:252) | menu/BulkMenu.ts:249 | write | `Promise<void>` | Picks.pick + act | Remove due date |
| core | `actions.remove` via BC → act → `TaskService.removeAll` (CS:240) | menu/BulkMenu.ts:140 | write | `Promise<void>` | Picks.pick + act | Delete N tasks |
| core | `actions.toSection` via BC → act (CS:258) | menu/BulkMenu.ts:188 | write | `Promise<void>` | Picks.pick + act | section row |
| core | `actions.setProject(null)` via BC → act (CS:259) | menu/BulkMenu.ts:202 | write | `Promise<void>` | Picks.pick + act | No project |
| core | `actions.toggleProject` via BC (BC:203-209) → `CS.toggleProject` → act | menu/BulkMenu.ts:210 | write, redraw page | `Promise<readonly (TaskItem\|null)[]>` | act only | project row |
| core | `actions.newProject` via BC → act (CS:260) | menu/BulkMenu.ts:233 | write | `Promise<ProjectRef\|null>` | Picks.pick + act; closure `asking` | Enter on name |
| screen | `context.onClose()` → BC `menu = null` (BC:213) | menu/BulkMenu.ts:258 | view | `void` | `overlay.isClosed` check | close |
| screen | `onRename` → `CS.renameInPlace` → later act `renameGroup` (CS:1182, 1188-1203) | menu/GroupMenu.ts:29 | view-change → write | `Promise<boolean>` (renameGroup) | Picks.pickNow; arbiter `NAMING` | Rename section |
| core | `onRemove` → act → `TaskService.removeGroup` (CS:1183) | menu/GroupMenu.ts:30 | write | `Promise<void>` | Picks.pick + act | Remove section |
| screen | `opts.onRename` → `FilterTitle.editTitle` → act `renameProject` (CS:1235-1241) | menu/GroupMenu.ts:79 | view-change → write | `Promise<boolean>` | Picks.pickNow; arbiter `NAMING` | project Rename |
| core | `opts.onFolder(on)` → act → `TaskService.setProjectFolder` (CS:1249) | menu/GroupMenu.ts:81 | write | `Promise<boolean>` | Picks.pick + act | Folder switch |
| obsidian | `opts.onAttach` → `new NoteSearch(...).open()` (CS:1243) | menu/GroupMenu.ts:84 | view-change (modal) | `void` | Picks.pickNow | Attach note |
| obsidian | `opts.onOpenNote` → `workspace.openLinkText` (CS:1244-1246) | menu/GroupMenu.ts:86 | view-change | `Promise<void>` (ignored) | Picks.pick | note row |
| core | `opts.onDetach` → act → `TaskService.setProjectNote(name, null)` (CS:1247) | menu/GroupMenu.ts:87 | write | `Promise<void>` | Picks.pick + act | Detach |
| core | `opts.onDelete` → act → `TaskService.deleteProject` (CS:1250) | menu/GroupMenu.ts:99 | write | `Promise<void>` | Picks.pick + act | Delete confirmed |
| obsidian | `surface.render` → `MarkdownRenderer.render` (ObsidianMarkdown.ts:22) | menu/DescriptionPeek.ts:39 | view | `Promise<void>` | none | peek opened |
| screen | `actions.onLink()` → `TaskMenu.close` | menu/DescriptionPeek.ts:38 | view-change | `void` | none | link tap in peek |
| screen | `opts.onPick(date)` | menu/MonthPicker.ts:65 | view/write by caller | `void` | caller's Picks | day tapped |
| core | `opts.onPick(mode)` → `CS.pickView` → afterEntry → act → `TaskService.setViewMode`/`setNoteViewMode` (CS:1525-1527) | menu/ViewMenu.ts:46 | write | `Promise<void>` | Picks.pick + afterEntry + act | mode row |
| core | `opts.onSubprojects` → afterEntry → act → `TaskService.toggleSubprojects` (CS:1530-1532) | menu/ViewMenu.ts:49 | write | `Promise<void>` | Picks.pick + afterEntry + act | Subprojects row |
| screen | `opts.onSearch(sheet)` → `CS.openSearch` (afterEntry → SearchWindow) | menu/MoreMenu.ts:32 | view-change | `void` | Picks.handOff; `CS.search` non-null check (CS:849) | Search row |
| screen | `opts.onSelect` → `bulk.start` (CS:434) | menu/MoreMenu.ts:33 | view-change | `void` | Picks.pick | Select tasks |
| obsidian | `context.openInCalendar` → `deps.openInCalendar` → `calendarApp.open` (main.ts:96) | menu/EventMenu.ts:28 | view-change (external app) | `void` | Picks.pick | Open in Calendar |
| core | `grownStart` (pure) | menu/LiftedMenu.ts:84-85 | read (pure) | `number` | none | menu built |
| screen | `scrollSmoothly` on the column | menu/inView.ts:62 | view (scroll) | stop fn | returns cancel; `gone` in LiftedMenu | menu opens on a partly hidden card |
| core | `new QuickEntrySession(deps.tasks, …, new WriteQueue)` | full/FullScreen.ts:89-103 | read/write via session | `QuickEntrySession` | WriteQueue (serial writes) | full screen opened |
| screen | `RenamedTexts.add` | full/FullScreen.ts:104 | view | unsubscribe fn | none | opened |
| core | `new BottomCapsule(el, deps.undo, …)` → `UndoService.canUndo` / `onChange` | full/FullScreen.ts:129 | read | `boolean` / unsubscribe | none | opened |
| screen | capsule `onUndo` → `CS.undoStep("undo")` (CS:1328) | full/FullScreen.ts:129 | write (UndoService.undo) | `Promise<UndoOutcome>` | CS.undoStep's own | undo button |
| screen | capsule `onMore` / `deps.menu(current, anchor)` → `CS.showMenu` (CS:1329-1331) | full/FullScreen.ts:129 | view-change | `void` | `this.current` non-null | ⋯ button |
| screen | `addSubtask(current)` → session open | full/FullScreen.ts:130 | view-change (field) | `void` | none | plus button |
| core | `entry.idle()` (QuickEntrySession) | full/FullScreen.ts:161 | read (wait writes) | `Promise<void>` | none | refresh |
| core | `deps.tasks.find(key, text)` | full/FullScreen.ts:172 | read | `Promise<TaskItem\|null>` | `reading` sequence + `closed` | refresh / session `fresh` |
| core | `deps.tasks.fullTree(item)` | full/FullScreen.ts:219 | read | `FullTree` | none | draw |
| core | `deps.act(() => tasks.toggleDone(key))` via deps → act (CS:1327) | full/FullScreen.ts:255 | write | `Promise<void>` | act | circle on subtask card |
| screen | `deps.menu(item, card)` → `CS.showMenu` | full/FullScreen.ts:257 | view-change | `void` | none | subtask card tap |
| screen | `deps.openProject(name)` → close + `showProjectNode` → act → `TaskService.selectProjectNode` (CS:1333-1336, 1257) | full/FullScreen.ts:239 | view-change + write | `Promise<void>` | act | project line |
| core | `deps.tasks.find(parentKey, parentText)` | full/FullScreen.ts:270 | read | `Promise<TaskItem\|null>` | `closed` only | up-link |
| core | `new DescriptionDraft(item.description)` | full/FullScreen.ts:278 | in-memory | `DescriptionDraft` | none | first draw of a task |
| obsidian | `deps.surface.edit(descEl, …)` → `ObsidianMarkdown.edit` → EmbeddedEditor | full/FullScreen.ts:279 | view | `MarkdownEditing` | none | first draw of a task |
| core | `draft.read(description, {focused, pending})` | full/FullScreen.ts:282 | read | `string\|null` | none | redraw of same task |
| obsidian | `editing.setValue(replace)` (CodeMirror dispatch) | full/FullScreen.ts:283 | view | `void` | `draft.read` result | file changed elsewhere |
| core | `draft.typed()` | full/FullScreen.ts:287 | in-memory | `void` | none | editor change |
| core | `draft.save()` | full/FullScreen.ts:300 | read | `boolean` | none | save |
| core | `deps.act(() => tasks.setDescription(key, md))` via deps → act (CS:1327) | full/FullScreen.ts:302 | write | `Promise<void>` | 600 ms `saveTimer` debounce + `draft.save()` + act | pause after typing / Done / leave task / close |
| obsidian | `editing.focus()` | full/FullScreen.ts:149 | view | `void` | none | opened with editing |
| obsidian | `editing.destroy()` (pop scope, unload editor) | full/FullScreen.ts:308 | view | `void` | none | leave task |
| core | `entry.escape()` | full/FullScreen.ts:312 | in-memory / drops typing | `void` | none | leave task |
| core | `entry.open(entry.stackSpot(parent), renamed)` | full/FullScreen.ts:319 | in-memory | `void` / `EntrySpot` | none | rename / add subtask |
| core | `entry.stackEntry(current)` | full/FullScreen.ts:364 | read | `StackEntry\|null` | none | list render |
| core | `entry.type(text)` | full/FullScreen.ts:386 | in-memory | `void` | none | typing subtask |
| core | `entry.enter()` / `entry.escape()` | full/FullScreen.ts:394-395 | write via WriteQueue / drop | `void` | WriteQueue | Enter / Escape in field |
| core | `entry.blur()` | full/FullScreen.ts:401 | write via WriteQueue | `void` | `field === handle && state && !focused` after setTimeout | field blur |
| screen | `deps.titleField(titleEl, …)` → `MarkdownTitleField` (EmbeddedEditor) (CS:1325) | full/FullScreen.ts:426 | view | `TitleField` | `titleField` already set | title rename |
| core | `entry.type/enter/escape/blur` from title field | full/FullScreen.ts:430-435 | in-memory / write via WriteQueue | `void` | WriteQueue | title typing |
| core | `entry.idle().then(...)` | full/FullScreen.ts:449 | read (wait) | `Promise<void>` | `leavingTitle !== field` check | title rename ended |
| screen | `deps.onClose()` → `CS.full = null` (CS:1332) | full/FullScreen.ts:215 | view | `void` | `closed` flag | close |
| screen | `deps.onError` (WriteQueue failure) → `CS.reportFailure` | full/FullScreen.ts:102 | view | `void` | none | write failed |
| core | `deps.tasks.search(query)` | search/SearchWindow.ts:101 | read | `Promise<readonly SearchGroup[]>` | `asked` sequence | each input event |
| core | `deps.sectionName(section)` → `TaskService.listName` (CS:857) | search/SearchWindow.ts:108 | read | `string` | none | results drawn |
| screen | `deps.onPick(hit)` → `CS.reveal` → act `reveal`, `filterHides`, act `clearProjectFilter`, setMode (CS:856-859, 872-888) | search/SearchWindow.ts:96 | write + view-change | `Promise<TaskScreen>` (reveal) | `closed` flag + `overlay.afterClose`; act | result tap / Enter |
| screen | `deps.onClose()` → `CS.search = null` | search/SearchWindow.ts:89 | view | `void` | none | Cancel / Escape / sheet tap |
| screen | `deps.sheet(...)` → `MoreMenu`'s `overlay.handOver` | search/SearchWindow.ts:47 | view | `Overlay` | none | opened from ⋯ |
| screen | `ownUndo(input)` | search/SearchWindow.ts:56 | view | `void` | none | opened |
| screen | `opts.onRefresh()` → `CS.refreshNow` → `poll.refreshNow` (CS:1303-1307) | sources/SourcesPopover.ts:49 | read (calendars) | `Promise<void>` | Picks.pick (not act) | Refresh now |
| obsidian | `app.vault.getFileByPath(sourcePath)` | markdown/EmbeddedEditor.ts:63 | read | `TFile\|null` | none | Obsidian asks owner.file |
| obsidian | Obsidian editor `load()` / `set(text)` | markdown/EmbeddedEditor.ts:69, 72 | view | `void` | none | editor made |
| obsidian | `editor.editor.getValue()` | markdown/EmbeddedEditor.ts:77 | read | `string` | none | value read |
| obsidian | `cm.dispatch(...)` replace text | markdown/EmbeddedEditor.ts:94 | view | `void` | same-text check (93) | setValue |
| obsidian | `cm.dispatch` selection + `cm.focus()` | markdown/EmbeddedEditor.ts:99-100 | view | `void` | none | focusEnd |
| obsidian | `cm.focus()` | markdown/EmbeddedEditor.ts:105 | view | `void` | none | focus |
| obsidian | `editor.unload()` / `cm.destroy()` | markdown/EmbeddedEditor.ts:110-111 | view | `void` | none | destroy |
| obsidian | `keymap.of` / `Prec.highest` (CodeMirror) | markdown/EmbeddedEditor.ts:120-123 | view (keys) | `Extension[]` | `searching()` (suggest open) | editor built |
| obsidian | `super.onUpdate` then `hooks.onChange` | markdown/EmbeddedEditor.ts:127-128 | view | `void` | `changed` | every edit |
| obsidian | `app.embedRegistry.embedByExtension.md`, `note.load/showEditor/unload` | markdown/EmbeddedEditor.ts:135-141 | read (class) | editor class | `editorClass ??=` cache | first editor in session |
| obsidian | `el.empty()` / `el.addClass` | markdown/ObsidianMarkdown.ts:19-20 | view | `void` | none | render |
| obsidian | `MarkdownRenderer.render(app, md, el, sourcePath, view)` | markdown/ObsidianMarkdown.ts:22 | view | `Promise<void>` | none | render |
| obsidian | `el.removeClass` + `new EmbeddedEditor` | markdown/ObsidianMarkdown.ts:26-27 | view | `EmbeddedEditor` | none | edit |
| obsidian | `new Scope(keys ?? app.scope)` | markdown/ObsidianMarkdown.ts:28 | view (keys) | `Scope` | none | edit |
| obsidian | `app.keymap.pushScope` / `popScope` | markdown/ObsidianMarkdown.ts:34-35 | view (keys) | `void` | closure `held` | editor focus / blur / destroy |
| screen | `openLink(...)` → `CS.openLink` (window.open / openLinkText) | markdown/ObsidianMarkdown.ts:62 | view-change | `void` | `target` non-empty | link click in rendered description |
| obsidian | `hotkeyManager.getHotkeys` / `getDefaultHotkeys` | markdown/lineCommands.ts:47 | read | `Hotkey[]` | `hotkeyManager` present | edit / editor built |
| obsidian | `scope.register(modifiers, key, () => false)` | markdown/lineCommands.ts:52 | view (keys) | `KeymapEventHandler` | none | edit |
| core | `editRepeat(draft, change)` (pure) | repeat/RepeatPanel.ts:71 | read (pure) | `RepeatDraft\|null` | `!next` → nothing | any repeat tap |
| screen | `opts.onChange(next.rule)` → TaskMenu `page.change` / QuickBar | repeat/RepeatPanel.ts:75 | in-memory | `void` | none | repeat tap |
| screen | `opts.onRemove()` | repeat/RepeatPanel.ts:64 | in-memory → write on close | `void` | none | Remove repeat |
| core | `onTheDay(rule)` (pure) | repeat/RepeatPanel.ts:93 | read (pure) | `string` | none | draw |
| screen | `ViewMenu.open(...)` | ViewButton.ts:27 | view-change | `ViewMenu` | `view` non-null | view button |
| core | `projectsEntryLook(view)` (pure) | projects/ProjectTasks.ts:172 | read (pure) | `EntryListLook` | none | render |
| core | `projectsEntryLook(coming)` (pure) | projects/ProjectTasks.ts:114 | read (pure) | `EntryListLook` | none | `comingCards` read |
| screen | `deps.coming()` → `CS.data.projects` | projects/ProjectTasks.ts:113 | read | `ProjectsView\|null` | none | `comingCards` |
| screen | `deps.entry(look)` → `quick.entryIn("projects", …)` | projects/ProjectTasks.ts:173 | read | `ListEntryInput\|null` | none | render |
| screen | `deps.renaming()` → `quick.renaming()` | projects/ProjectTasks.ts:178 | read | `TaskKey\|null` | none | render |
| screen | `deps.onPlate(...)` → click opens `quick.openIn` (CS:1549) | projects/ProjectTasks.ts:217 | view | `void` | AbortSignal of drawing | render of an empty writable part |
| screen | `deps.onCard(...)` → `CS.attachProjectsCard` | projects/ProjectTasks.ts:271 | view (listeners) | `void` | AbortSignal | render |
| core | `branchOf(levels, i)` (pure) | projects/ProjectTasks.ts:251 | read (pure) | branch lines | none | render |
| core | `cardDue(item, null)` (pure) | projects/ProjectTasks.ts:284 | read (pure) | due or null | none | dated card drawn |
| core | `projectsDrop(rows, gap, shift, lifted)` (pure) | projects/ProjectDrops.ts:57 | read (pure) | `ProjectsLanding` | none | project lift move |
| core | `projectsDrop(rows, gap, x - start)` (pure) | projects/ProjectDrops.ts:66 | read (pure) | `ProjectsLanding` | none | plus over tree |
| screen | `shown.reorders()` → `CS.data.projects.reorders` (CS:1557) | projects/ProjectDrops.ts:187 | read | `boolean` | none | drag over list |
| core | `shown.takesAt` → `projectsTakes` (pure, CS:1558-1567) | projects/ProjectDrops.ts:196 | read (pure) | `boolean` | StaleTaskError → false | drag over list |
| core | `shown.plusPlaceAt` → `projectsPlusPlace` (pure, CS:1569-1572) | projects/ProjectDrops.ts:197 | read (pure) | `ListPlace\|null` | none | plus over list |
| screen | `TreeDrop.drop()` result → CS drop → act `TaskService.drop` (CS:1148) | projects/ProjectDrops.ts:144-148 | write (by caller) | `DropResult\|null` | caller's act | card let go on tree |
| screen | `ProjectsListDrop.drop` → result → act `TaskService.drop` (CS:1148) | projects/ProjectDrops.ts:205-208 | write (by caller) | `DropResult\|null` | `readOn !== node()` → null; act | card let go on list |
| screen | `onNewPlace` → `haptics.tap` (CS:1574) | projects/ProjectDrops.ts:181 | view | `void` | none | plus place changed |
| screen | `deps.onClose()` → act `setProjectsPanel(false)` (CS:1604-1606) | projects/TreePanel.ts:43 | write | `Promise<void>` | `panel.dimCloses` + act | tap on dim |
| core | `deps.onPick(node)` → afterEntry → act → `TaskService.pickProjectNode` (CS:1603) | projects/TreePanel.ts:48 | write | `Promise<void>` | afterEntry + act | tree row tap |
| screen | `deps.onWidth(width)` → `layout.frame()` (CS:1599) | projects/TreePanel.ts:58, 64 | view (layout) | `void` | `seen` dedupe (ResizeObserver only) | panel width change / divider drag |
| core | `deps.setTreeWidth` → `SettingsService.set({treeWidth})` then `parts.request("frame")` (CS:1600) | projects/TreePanel.ts:66 | write (settings) | `Promise<void>` | none (not act) | divider released |
| obsidian | `deps.onSnap()` → `haptics.tap` (CS:1601) | projects/TreePanel.ts:70 | view | `void` | none | divider snaps |
| screen | `deps.treeWidth()` → `settings.treeWidth` | projects/TreePanel.ts:83 | read (settings) | `number\|null` | none | render |
| screen | `GroupNameField.open` (new project name) → CS act `createProject` (CS:1124-1126) | projects/TreePanel.ts:99 | view → write | `Promise<string\|null>` | caller's act | plus let go on tree |
| screen | `deps.onTap(node)` | projects/ProjectTree.ts:85 | → TreePanel onPick | `void` | AbortSignal | row click |
| screen | `deps.onRow(row, model, signal)` → `TreeLift.attach` | projects/ProjectTree.ts:69 | view (listeners) | `void` | AbortSignal | render |
| obsidian | `deps.haptics.tap()` | projects/TreeLift.ts:42 | view | `void` | arbiter claim | lift starts |
| core | `deps.onMove(title, place)` → act → `TaskService.moveProject` (CS:1595) | projects/TreeLift.ts:70 | write | `Promise<void>` | arbiter `project-lift` claim + `keep && at` + act | pointer up |
| core | `deps.tasks.carryAt(point, now)` (direct, not act) | projects/CarryReport.ts:55 | write (carry state; may change panel/filter) | `Promise<CarryWait>` | `last` point dedupe + `timer`; no `changing` chain | carrying finger moves / wait elapsed |
| screen | `deps.changed()` → `DayData.tasks()` then `drawCarried` (CS:156) | projects/CarryReport.ts:56 | read + redraw | `Promise<void>` | none | after each carryAt |
| screen | `deps.now()` → `clock.now()` | projects/CarryReport.ts:55 | read | `number` | none | carryAt |
| screen | `deps.onError` → `CS.reportFailure` | projects/CarryReport.ts:62 | view | `void` | none | carryAt failed |
| screen | `deps.onMenu(title, filter)` → `CS.showProjectMenu` | projects/FilterTitle.ts:27 | view-change | `void` | `filter.menu`; `arbiter.busy` (CS:1225) | title tap |
| core | `deps.onClear()` → afterEntry → act → `TaskService.clearProjectFilter` (CS:1587) | projects/FilterTitle.ts:29 | write | `Promise<void>` | afterEntry + act | cross |
| screen | `GroupNameField.open` → `onDone` → `renameProject` via act (CS:1236-1240) | projects/FilterTitle.ts:51 | view → write | `Promise<boolean>` | arbiter `NAMING` + act | Rename |
| screen | `deps.rowOf`, `deps.selected`, `deps.carried` → `BulkController.carried` → `TaskService.carried` (CS:162-166, 262) | projects/ProjectsCarry.ts:27-30 | read | rows / node / cards | none | drag lift |
| obsidian | `FuzzySuggestModal` ctor + `setPlaceholder` | projects/NoteSearch.ts:13-14 | view (modal) | — | none | Attach note |
| obsidian | `app.vault.getMarkdownFiles()` | projects/NoteSearch.ts:18 | read | `TFile[]` | none | modal lists |
| obsidian | `app.metadataCache.fileToLinktext(file, from, true)` | projects/NoteSearch.ts:26 | read | `string` | none | note chosen |
| core | `onPick(link)` → act → `TaskService.setProjectNote` (CS:1243) | projects/NoteSearch.ts:26 | write | `Promise<void>` | act | note chosen |
| screen | `Grips` `handler.onGrip` (Timeline / DragController) | kit/Grips.ts:20 | view-change (resize; later act `resize` CS:304) | `void` | `handler.takes()` + primary button | grip pressed |

### B.5 G4: Timeline, TaskList, TaskCard, layouts/*, motion/*, next/* (prototype), small helpers (124 rows)

Kinds: `core` = TaskService/DayService/CalendarService/DayBoundary/settings or a pure contracts function; `obsidian` = Obsidian/host API (activeDocument, haptics, Button kit); `screen` = a deps callback into CalendarScreen that changes view state (listed because it is the call site); `dom` = Web Animations/timers on the host.

| kind | method | file:line | read/write/view-change | returns (from contracts) | guard | trigger |
|---|---|---|---|---|---|---|
| core | DayBoundary.spanOf via deps.boundary() (CS:339) | Timeline.ts:223 | read | Span {start,end} | none | spanOf callers: showField (Timeline.ts:480) |
| core | DayBoundary.slotAt via deps.boundary() | Timeline.ts:228 | read | Slot | none | showDrop pill (439), fillMeta stretch pill (636) |
| core | TaskService.shownSpan (CS:342 / DayPeek.ts:102) | Timeline.ts:233 | read | DaySpan | none | taskSpan (616) in render/layoutTasks/landing |
| core | DayBoundary.hourAt | Timeline.ts:321 | read | number | none | render |
| core | DayService.relation via deps.isToday (CS:338) | Timeline.ts:342 | read | DayRelation | none | render |
| core | clock now() (CS:345) | Timeline.ts:344 | read | Date | none | render (now pill) |
| core | clock now() | Timeline.ts:379 | read | Date | none | tickNow (CS:489 minute tick) |
| core | DayBoundary.offsetOf + clock now() | Timeline.ts:390 | read | number | none | layout (every render, zoom frame, tick) |
| core | DayService.relation via deps.isToday | Timeline.ts:392 | read | DayRelation | none | layout |
| core | gridAt (pure, via timelineLayout.ts:57-58) | Timeline.ts:393 | read | Grid | `grid` equality dedup (649) | layout |
| core | labelHidesNearNow (pure) | Timeline.ts:399 | read | boolean | none | layout |
| core | CalendarService.isPast via deps.isPast (CS:344) | Timeline.ts:402 | read | boolean | none | layout (each render, zoom, minute tick) |
| core | itemBox → (local) | Timeline.ts:405 | read | ItemBox | none | layout |
| core | samePlace (pure) | Timeline.ts:525 | read | boolean | none | isRenamed |
| core | stackTasks (pure, timelineLayout.ts:76-77) | Timeline.ts:532 | read | StackBox[] | none | landing (TimelineDrop.ts:64, DragSession.ts:101, QuickEntryController.ts:486) |
| core | samePlace | Timeline.ts:554 | read | boolean | `stretch.key` match | endStretch (DragController.ts:487) |
| core | samePlace, sameSlot | Timeline.ts:563-564 | read | boolean | none | keepStretch during render |
| core | stackTasks | Timeline.ts:582 | read | StackBox[] | none | layoutTasks |
| core | stackCorner (pure) | Timeline.ts:631 | read | parts | none | fillMeta |
| core | sameTaskTree (pure) | Timeline.ts:640 | read | boolean | none | isSelected |
| core | gridMarks (pure) | Timeline.ts:653 | read | GridMark[] | grid dedup (649) | divide |
| core | DayBoundary.clipToDay | Timeline.ts:662 | read | {start,end} | none | render (eventSpan) |
| core | eventLevels/overlayLeft via layoutEvents (timelineLayout.ts:48-53) | Timeline.ts:324 | read | EventBox[] | none | render |
| screen | deps.events() → CS data.timed | Timeline.ts:322 | read (cached screen data) | CalendarEvent[] | none | render |
| screen | deps.tasks() → CS data.day.slotted | Timeline.ts:330 | read (cached screen data) | TaskItem[] | none | render |
| screen | deps.theme() → paintEvent | Timeline.ts:669 | read | Theme | none | render |
| screen | deps.onEvent → drag.attachEvent / EventMenu.open (CS:352) | Timeline.ts:672 | view-change (attach listeners) | void | block AbortController signal | render |
| screen | deps.onBlock → found/arriving/drag.attachBlock (CS:347-351) | Timeline.ts:693 | view-change (attach listeners) | void | block AbortController signal | render |
| screen | deps.onGrip → drag.grip (CS:353) | Timeline.ts:178 | view-change (stretch begins) | void | Grips `takes` (selected card exists, 175) | pointer on grip dots |
| screen | deps.onResize → CS.fitWholeDay (CS:346) | Timeline.ts:167 | view-change (zoom refit) | void | none | ResizeObserver |
| obsidian | Grips.attach (kit) | Timeline.ts:174 | view-change | void | none | constructor |
| obsidian | activeDocument.body append drop line | Timeline.ts:432 | view-change | — | `!this.dropEl` | showDrop (TimelineDrop.ts:60) |
| dom | Motion.disappear (remove block) | Timeline.ts:334 | view-change | — | `moves` | render (block gone) |
| dom | Motion.reshape | Timeline.ts:351 | view-change | — | `moves` | render |
| dom | Motion.appear | Timeline.ts:352 | view-change | — | `moves` | render |
| dom | Motion.settle | Timeline.ts:577 | view-change | — | `!moving` | layoutTasks |
| dom | Motion.reshape | Timeline.ts:594 | view-change | — | `moving` | layoutTasks(true) from stretchTo/endStretch/DragController.ts:320,326 |
| core | RenamedTexts.shown (ui module over pending rename) | Timeline.ts:684 | read | TaskItem | none | placeTask |
| core | shownCardSize (ui cardSize) | Timeline.ts:532, 582 | read | CardSize | none | landing/layoutTasks |
| core | listView (pure) | TaskList.ts:284 | read | ListView | none | draw (147), comingCards (280) |
| core | branchOf (pure) | TaskList.ts:221 | read | Branch | none | draw |
| screen | deps.items → CS itemsOf/unnamed (CS:639) or ribbon.done (RibbonLayout.ts:54) | TaskList.ts:146 | read | TaskItem[] | none | render |
| screen | deps.items | TaskList.ts:280 | read | TaskItem[] | none | comingCards |
| screen | deps.grouped / deps.sections → CS sectionsOf / listSectionsOf | TaskList.ts:284 | read | ListSection[] | none | shapeOf |
| screen | deps.entry → quick.entryIn (CS:644) | TaskList.ts:148 | read | ListEntryInput | none | draw |
| screen | deps.renaming → quick.renaming (CS:649) | TaskList.ts:149 | read | TaskKey | none | draw |
| screen | deps.onCard → CS.attachCard (CS:652) / ribbon.doneCard (RibbonLayout.ts:56) | TaskList.ts:193 | view-change (attach listeners) | void | KeyedRows row signal | draw |
| screen | deps.pending → CS namingIn (CS:643) | TaskList.ts:224 | read | TaskItem | none | draw |
| screen | deps.empty → view().plates (CS:645) | TaskList.ts:225 | read | string | none | draw |
| screen | deps.ungroupedName → settings.ungrouped (CS:651) | TaskList.ts:345 | read | string | none | header |
| screen | deps.onHeader → groupDrag.attach (CS:650) | TaskList.ts:348 | view-change | void | KeyedRows row signal | header |
| screen | deps.onEmpty → quick.openAtEnd (CS:647) | TaskList.ts:356 | view-change (opens field) | void | KeyedRows row signal | click on empty plate |
| screen | deps.emptyLabel → view().emptyLabel | TaskList.ts:361 | read | string | none | plate |
| screen | deps.onPlate → quick.openIn (FunnelLists.ts:53) | TaskList.ts:364 | view-change | void | KeyedRows row signal | plate |
| screen | EntryRows.begin/draw/renames/markRenamed/heirOf/adopt/forget | TaskList.ts:153, 172, 181, 219, 246, 256, 261 | view-change | — | none | draw; adopt (QuickEntryController.ts:514); forgetTyped (QuickEntryController.ts:708) |
| dom | ScrollHold.keep | TaskList.ts:151 | view-change | — | `moves` | draw |
| dom | Motion.growRoomUnder | TaskList.ts:241 | view-change | — | `standIn && moves` | draw |
| dom | ScrollEdges.update | TaskList.ts:141 | view-change | — | none | render |
| screen | TaskList.render from showLanding | TaskList.ts:318 | view-change | — | none | GroupDrag.ts:93, 161, 178 |
| core | cardDue (pure) | TaskCard.ts:56 | read | CardDue | `opts.corner !== false` | fillCard |
| core | RenamedTexts.shown | TaskCard.ts:49, 87 | read | TaskItem | none | fillCard / fillFace |
| obsidian | icon() (kit/icons) | TaskCard.ts:66, 85, 114, 133 | view-change | SVG element | none | card fill |
| core | textParts (pure) | TaskTitle.ts:12 | read | TextPart[] | none | fillTitle |
| core | eventColors / eventHex / bgAlphaFor (pure) | AllDayRow.ts:7 | read | EventColors | none | paintEvent |
| screen | isPast callback → CalendarService.isPast (CS:1651, DayPeek.ts:146) | AllDayRow.ts:25 | read | boolean | none | renderAllDayRows |
| screen | scroller() → layout.scroller (ProjectBlocks.ts:34) | BlockHeight.ts:45 | read | HTMLElement | rAF coalescing (`frame`); `is-dragging` / isConnected check (44) | fit |
| core | CARD_HEIGHTS.max (const) | ScrollEdges.ts:40 | read | number | `shown` dedup | update |
| screen | opts.title → CS.dayName → DayService.relation + dayTitle (CS:1535-1538) | DayNav.ts:29 | read | string | none | render (CS:684, 760, 1629) |
| screen | opts.onStep → CS.turnDay + DayService.step (CS:330) | DayNav.ts:17 | view-change (another day) | LocalDate | none in DayNav (CS turnDay: `turning`/afterEntry) | Previous day button |
| screen | opts.onToday → CS.turnDay + DayService.relation (CS:331) | DayNav.ts:18 | view-change | — | none in DayNav (CS turnDay) | title tap |
| screen | opts.onStep(1) | DayNav.ts:19 | view-change | LocalDate | none in DayNav (CS turnDay) | Next day button |
| obsidian | Button.create / setText (kit) | DayNav.ts:17-19, 29 | view-change | Button | none | constructor/render |
| core | TaskService.listName via opts.*Name (CS:603) | ColumnHeaders.ts:32-34 | read | string | none | render (constructor, RibbonLayout.ts:131) |
| core | TaskService.listName via host.listName | RibbonLayout.ts:132 | read | string | none | frame |
| screen | ribbon.done → CS data.done (CS:667) | RibbonLayout.ts:54 | read | TaskItem[] | none | done list render |
| screen | ribbon.doneCard → CS.attachDoneCard (CS:668) | RibbonLayout.ts:56 | view-change | void | KeyedRows row signal | done list draw |
| obsidian/screen | onWidth → root `--tc-list-width` | RibbonLayout.ts:72 | view-change | — | Divider SnapGlide run token | divider drag |
| core | saveShare → ShownSettingsStore.set({listShare}) then parts.request("frame") (CS:607) | RibbonLayout.ts:73 | write | Promise<void> | none (fire-and-forget; frame redraw via ScreenParts) | divider release |
| core | listShareOf/shownListWidth/listWidthMax/centeredListWidth (ui listWidth.ts over core LIST_WIDTHS) | RibbonLayout.ts:71, 73, 75, 76, 130 | read | number | none | divider/frame |
| obsidian | haptics.tap via host.tap (CS:611) | RibbonLayout.ts:77 | view-change (haptic) | void | none | divider snap |
| screen | ribbon.place → CS.place() (CS:661) | RibbonLayout.ts:105 | read | Place | none | swipe start (trackTo) |
| screen | ribbon.day → selectedDate | RibbonLayout.ts:105 | read | LocalDate | none | swipe start |
| core | DayService.stepFunnel via ribbon.stepFunnel (CS:663) | RibbonLayout.ts:106 | read | FunnelAt \| null | none | swipe start |
| screen | ribbon.dayTrack → CS.dayTrack (DayPeek: TaskService.dayView, CalendarService.events) (CS:722) | RibbonLayout.ts:108 | read + view-change | ScreenTrack | none in layout (CS: stopHolding, DayPeek `removed`) | swipe to another day |
| screen | ribbon.follow → switcher.follow (CS:666) | RibbonLayout.ts:116 | view-change | void | none | StripTrack frame |
| screen | ribbon.arrive → CS.arriveAt (CS:665) | RibbonLayout.ts:117 | view-change (place) | void | none in layout | StripTrack arrival |
| dom | window.setTimeout remove is-switching | RibbonLayout.ts:141 | view-change | id | clearTimeout(139) | showPlace(slide) |
| dom | window.clearTimeout | RibbonLayout.ts:109, 139, 193 | — | — | — | trackTo/showPlace/destroy |
| screen | shared.place(null,null) | RibbonLayout.ts:47 | view-change (moves nav/timeline, keeps scroll) | void | none | mount |
| core | layoutWidths (pure) | StillLayout.ts:56 | read | LayoutWidths | none | frame / divider |
| core | layoutShareAt (pure) | StillLayout.ts:63 | read | number \| null | none | divider move/release |
| core | saveShare → ShownSettingsStore.set (CS:607) | StillLayout.ts:68 | write | Promise<void> | none | divider release |
| obsidian | haptics.tap via host.tap | StillLayout.ts:72 | view-change | void | none | divider snap |
| screen | shared.place | StillLayout.ts:38, 55, 140 | view-change | void | none | mount/destroy |
| core | stackedLists (pure) | RowsLayout.ts:123 | read | number[] \| null | `holds` (carry), `destroyed`, `scrolls`, stack height 0 (112) | apply |
| screen | host.dayName → CS.dayName (DayService.relation) | RowsLayout.ts:85 | read | string | none | render |
| dom | Motion.settles | RowsLayout.ts:140 | view-change | — | none | apply |
| dom | requestAnimationFrame fit | RowsLayout.ts:102 | view-change | id | `frameId` coalescing, `holds` carry, `destroyed` | fit |
| dom | setTimeout settle re-fit | RowsLayout.ts:148 | view-change | id | clearTimeout(146) | apply when heights changed |
| core | TaskService.listName via host.listName | ColumnsLayout.ts:50 | read | string | none | frame |
| screen | host.projectsList → CS.buildByProject (CS:1547) | ByProjectLayout.ts:20 | view-change | {list, drop} | none | mount |
| screen | host.projectsView → CS data.projects | ByProjectLayout.ts:26 | read | ProjectsView \| null | `if (view)` | render |
| core | acceptsDrop (pure) | FunnelLists.ts:69 | read | boolean | none | drag over list |
| screen | deps.sectionsOf → CS.sectionsOf | FunnelLists.ts:51, 60, 70 | read | ColumnSections | none | list draw / drop |
| screen | deps.titleDrop → DayData.titleDrop (CS:653) | FunnelLists.ts:73 | read | DropTo \| null | none | drop on a title |
| obsidian | deps.tap → haptics.tap (CS:654) | FunnelLists.ts:72 | view-change | void | none | drop feedback |
| screen | deps.openAtEnd → quick.openAtEnd | FunnelLists.ts:58, 75 | view-change | void | none | empty plate tap / free-room double click |
| screen | deps.openIn → quick.openIn | FunnelLists.ts:53 | view-change | void | listener signal | section plate click |
| screen | deps.header → groupDrag.attach | FunnelLists.ts:60 | view-change | void | row signal | header draw |
| screen | deps.card → CS.attachCard | FunnelLists.ts:62 | view-change | void | row signal | card draw |
| dom | Motion.stay | KeyedRows.ts:69 | view-change | — | none | revived leaving row |
| dom | Motion.leave | KeyedRows.ts:89 | view-change | Animation | `moving` | settle |
| dom | animation.cancel + remove leaving | KeyedRows.ts:101-102 | view-change | — | `!moving` | settle |
| dom | Motion.enter | KeyedRows.ts:175 | view-change | — | `moving` | finish |
| dom | Motion.slide | KeyedRows.ts:180 | view-change | — | `moving`, laid-out check | finish |
| dom | element.animate (grow/leave/slide/reshape/growRoom/appear/disappear) | Motion.ts:94, 122, 130, 157, 174, 191, 197, 205 | view-change | Animation | timingOf null (no sheet) | callers above |
| dom | ScrollHold setTimeout | ScrollHold.ts:34 | view-change | id | clearTimeout(33); `scrollTop<=0`/`ms<=0` early return | keep |
| dom | ScrollGlide.start / stop; scrollTop write | SmoothScroll.ts:21-22, 28, 30, 38 | view-change (scroll) | — | GLIDES one-per-scroller; `running` flag | FoundCard.ts:12-13, menu/inView.ts:62 |
| dom | requestAnimationFrame / cancelAnimationFrame | SnapGlide.ts:44, 46, 65 | view-change | id | `this.run !== run` token | Divider set |
| screen | show(value) → Divider onWidth | SnapGlide.ts:72 | view-change | — | run token | draw |
| dom | requestAnimationFrame fit | BlockHeight.ts:37 | view-change | id | `frame` coalescing | observers |
| core | Store.run(effect) (prototype) | next/Store.ts:55 | read/write (whatever effect) | Promise<void> | `queue` promise chain | dispatch |
| screen | Store listeners (prototype) | next/Store.ts:39 | view-change | — | `step.state !== current` | dispatch |
| dom | animate translateY (prototype) | next/KeyedList.tsx:31 | view-change | Animation | `slides(cause, id)` (motion.ts:12) | componentDidUpdate |

### B.6 Event sources that trigger a re-read or redraw (180 rows)

| grp | source | file:line | what it re-reads/redraws |
|---|---|---|---|
| G0 | TaskService.onChange | CS:445-448 | DayData.tasks (Reload) and FullScreen.refresh |
| G0 | CalendarService.onChange | CS:449 | DayData.calendars (events Reload) |
| G0 | ShownSettingsSource.onChange | CS:450 → 559-565 | timeline restack, ScreenParts frame/tasks |
| G0 | DayService.onDayChange ("passed" / "moved") | CS:451 → 511-520 | frame+tasks draw and DayData.tasks; or select(today) after entry |
| G0 | window `focus` | CS:455 | CalendarPoll.wake |
| G0 | document `visibilitychange` (visible) | CS:456-459 | CalendarPoll.wake, catchUpTick (tick + DayService.catchUp) |
| G0 | workspace `active-leaf-change` | CS:461 | CalendarPoll.catchUp |
| G0 | document `pointerdown` (capture) ×3 | CS:467-469 | timeline deselect; found ring cleared; bulk press |
| G0 | document `keydown` | CS:470 | bulk keys |
| G0 | arbiter.onIdle | CS:471-474 | ScreenParts.flush, catchUpTick |
| G0 | workspace `css-change` | CS:475 | ScreenParts "events" (theme colours) |
| G0 | setInterval 60 s | CS:476 | Timeline.tickNow |
| G0 | CalendarService.keepFresh poll | CS:477 | DayData.calendars when not hidden |
| G0 | `resize()` from TaskCalendarView | CS:535-540 | layout.frame, quick.reveal, catchUpTick, poll.catchUp |
| G0 | pluginSettings.onChange | main.ts:46 | body card size / priority colours / label paint |
| G0 | document `visibilitychange` | main.ts:58 | PluginSettings.reload, PluginCodeWatcher.check |
| G0 | vault `raw` | main.ts:133 | PluginSettings.reload when data.json changed; PluginCodeWatcher.changed |
| G0 | workspace `window-open` / `window-close` | main.ts:147-152 | popout window styles |
| G0 | document `visibilitychange` (hidden) | compose.ts:102-105 | SyncWait leave signal |
| G1 | (none of its own) DayData is driven by CS calls: load, tasks(), calendars(), selectDay() | DayData.ts:171,181,186,192 | task reread via Reload → ScreenParts "tasks"; events refetch → ScreenParts "events" |
| G1 | QES onChange(state, drawnNext) | QEC:213 | QEC.changed → deps.render (ScreenParts "tasks") or bar/field sync + FramePass |
| G1 | document `click` capture (tapAway) | QEC:236 | QES.blur → writes; field closes, lists redraw |
| G1 | document `pointerdown` capture | QEC:237 | resets pressEnding |
| G1 | document `mousedown` capture | QEC:238 | preventDefault while pressEnding |
| G1 | root `scroll` capture | QEC:239 | FramePass → followField (bar follows); stops follow on hand scroll |
| G1 | root `wheel`/`touchmove` capture passive | QEC:240 | records handScrolledAt |
| G1 | root `transitionend` capture | QEC:241 | FramePass → bar follows field |
| G1 | ResizeObserver sizeWatch on root | QEC:185,242 | reveal (field into sight, bar follows) |
| G1 | ResizeObserver scrollerWatch on field's scroller | QEC:191,621 | follow=true + reveal |
| G1 | field animations finished | QEC:609 | follow=true + reveal |
| G1 | setTimeout after field blur | QEC:805 | QES.blur if focus not returned |
| G1 | FramePass rAF | FramePass.ts:20 (QEC:160) | followField |
| G1 | ScrollGlide rAF/timeout | quick/ScrollGlide.ts:39,40,64 | scrollTop steps, revealedAt |
| G1 | bar `transitionend` | quick/QuickBar.ts:127 | removes is-gliding |
| G1 | bar parts `pointerdown`/`mousedown` preventDefault | quick/QuickBar.ts:181 | keeps focus in field |
| G1 | document `pointerdown` capture while panel open | quick/QuickBar.ts:337 | closes panel |
| G1 | fade animation `finish` | quick/QuickBar.ts:220 | bar hidden |
| G1 | Panel `place` callback | quick/QuickBar.ts:332 | restand (bar/panel side) |
| G1 | repeat panel onChange | quick/QuickBar.ts:417 | onRepeat + restand |
| G1 | CodeMirror editor onChange | quick/MarkdownTitleField.ts:62 | onInput → QES.type, FramePass |
| G1 | CodeMirror keydown (Prec.highest) | quick/MarkdownTitleField.ts:50 | composing flag |
| G1 | editor keys Enter/Escape/Tab | quick/MarkdownTitleField.ts:58-60 | QES.enter/escape/indent |
| G1 | Scope Alt+Tab | quick/MarkdownTitleField.ts:69 | QES.toggleSection |
| G1 | contentDOM `focus`/`blur` | quick/MarkdownTitleField.ts:75,76 | push/pop scope; blur → QEC.blurred |
| G1 | plus pointerdown/move/up/cancel + onPress | quick/PlusButton.ts:36,41-44 | open entry / start carry |
| G1 | window `keyboardWillShow`/`keyboardWillHide` | Keyboard.ts:32 | root is-keyboard-up; QEC.keyboardSlides (bar + scroll glide) |
| G1 | ViewSettingsFile.onChange (data.json, Sync) | viewSettings.ts:76 | via ShownSettingsStore.onChange |
| G1 | ShownSettingsStore.onChange (ScreenSettingsStore + ViewSettingsStore) | viewSettings.ts:117 | CS.onSettings (CS:450) → settingsEffect → ScreenParts frame/tasks |
| G1 | main.ts pluginSettings.onChange (outside these files) | main.ts:46 | showCardSize / showPriorityColors / showLabelPaint (module state of cardSize.ts, priorityColors.ts) |
| G1 | Obsidian ItemView.onResize | TaskCalendarView.ts:49 | screen.resize |
| G1 | Tab scope Mod+Z / Mod+Shift+Z / Mod+F | TaskCalendarView.ts:35-37 | undo/redo, search |
| G1 | MutationObserver on note view (class/style/childList, outside block) | ViewWatch.ts:16,23 | rAF → ProjectBlocks.place (ProjectBlocks.ts:150) |
| G1 | workspace `layout-change` / `file-open` / `active-leaf-change` | ProjectBlocks.ts:98-100 | sync → projectNoteView per view → place/drop blocks |
| G1 | workspace `resize` | ProjectBlocks.ts:101 | each block's screen.resize |
| G1 | vault `rename` | ProjectBlocks.ts:102 | block.path update + sync |
| G1 | TaskService.onChange | ProjectBlocks.ts:104 | sync (projectNoteView again) |
| G1 | workspace.onLayoutReady | ProjectBlocks.ts:105 | sync |
| G1 | block DOM pointerdown/focusin/focusout | ProjectBlocks.ts:43,46,47 | focus block; push/pop scope |
| G1 | Block scope Mod+Z / Mod+Shift+Z / Mod+F | ProjectBlocks.ts:35-37 | undo/redo, search |
| G1 | UndoService.onChange | BottomCapsule.ts:33 | Undo button dim state |
| G1 | MutationObserver body/app-container childList + status bar style | StatusBarRoom.ts:19,63-67 | body class tc-status-bar-shown |
| G1 | ResizeObserver on colour rows | SettingsTab.ts:430 | is-wrapped |
| G1 | Settings row click | SettingsTab.ts:101 | opens SettingsPage |
| G1 | colour picker `input`/`change`, code onChange/`blur`/`keydown` | SettingsTab.ts:231,235,239,243,248 | preview colours / recolour + redraw |
| G1 | Setting text/slider/dropdown/toggle onChange | SettingsTab.ts:184,200,276,306,313,368,392,404,413 | service writes (no redraw except via redrawn) |
| G1 | SettingsPage onClose | SettingsPage.ts:26 | tab display() |
| G1 | onWindowDocument (popout opens) | cardSize.ts:23; priorityColors.ts:53 | card size tokens, colour sheet, blend class on the new document |
| G1 | GroupNameField input `keydown`/`blur` | GroupNameField.ts:26,33 | SectionNameEntry → onDone |
| G1 | fieldUndo `keydown` | fieldUndo.ts:6 | execCommand undo/redo |
| G2 | card `contextmenu`, `pointerdown` (+ LongPress) | drag/DragController.ts:108-131 | menu / pick / fold / mark / lift |
| G2 | block `contextmenu`, `pointerdown` (+ LongPress) | drag/DragController.ts:136-155 | menu with selection, hold, drag |
| G2 | event `contextmenu` (+ LongPress) | drag/DragController.ts:160-177 | event menu |
| G2 | doc `pointermove/up/cancel` + capture `pointerdown` (holdFinger) | drag/DragController.ts:240-243 | hold → drag hand-off / release |
| G2 | canvas LongPress, doc `pointermove/up/cancel` + capture `pointerdown` (new slot) | drag/DragController.ts:261, 295-298 | timeline drop target position; open field |
| G2 | doc capture `keydown` (Escape), `pointermove/up/cancel`, capture `pointerdown` (lost lift) | drag/DragController.ts:435, 444-447 | drag session move/release/cancel → targets preview, drop write |
| G2 | doc `pointermove/up/cancel` (resize) | drag/DragController.ts:495-497 | stretch preview; resize write |
| G2 | LongPress on section header; doc `pointermove/up/cancel` | drag/GroupDrag.ts:46, 113-115 | section slots preview; moveGroup write |
| G2 | element `pointerdown/move/up/cancel`; doc capture `pointerdown` (other finger); press timer; signal `abort` + microtask | drag/LongPress.ts:62-65, 73-77, 89, 91 | starts drag/tap/long tap |
| G2 | rAF (auto-scroll step / dwell re-check) | drag/AutoScroll.ts:68, 76 | scroller scrollTop; re-runs target preview |
| G2 | float flight timers | drag/FloatingCard.ts:130, 145; drag/PlusFloat.ts:51 | resolve landing → onReturn / targets clear |
| G2 | element `animate().finished` | drag/GroupDrag.ts:230 | section float landing |
| G2 | `DayEventsAsk.fresh()` resolve | DayPeek.ts:109 | peek render (events) |
| G2 | `TaskService.dayView` resolve | DayPeek.ts:114 | peek render, list scrollTop, timeline align |
| G2 | `pointerdown` capture (interrupt), `pointerdown/move/up/cancel`, `wheel` on content | Swipe.ts:107-112 | pager follow/settle/catch |
| G2 | wheel stream settle timer | Swipe.ts:126 | ends stream → settle |
| G2 | rAF frame + fallback timer | ScreenPager.ts:85-86, 137 | track `at` / `land` (strip/day/edge) |
| G2 | `pointerdown/move/up/cancel`, `wheel` on timeline | PinchZoom.ts:45-49 | zoom (CS.zoom rAF), settings zoom write |
| G2 | wheel settle timer | PinchZoom.ts:119 | onRelease → settings zoom |
| G2 | switch `pointerdown/move/up/cancel`, `click`, `keydown` | ColumnSwitch.ts:104-115 | wheel turn; place change write; sources popover |
| G2 | hold timer, settling timer | ColumnSwitch.ts:136, 216 | sources popover; `is-settling` off |
| G2 | divider `pointerdown/move/up/cancel`; SnapGlide `whenSettled` | Divider.ts:50-53, 90 | width CSS; settings share/tree width write |
| G2 | grip `pointerdown`; doc `pointermove/up/cancel`; landing timer | RowReorder.ts:23, 76-78, 73 | settings row order; settings move write |
| G2 | list areas `pointerdown`, `dblclick` | FreeRoomDoubleClick.ts:13-14 | open quick field at list end |
| G2 | rAF after found card attached | FoundCard.ts:38 | smooth scroll to found card |
| G2 | `GestureArbiter.onIdle` listeners (registered in CS:471) | gestures.ts:26 | deferred draws (ScreenParts) |
| G3 | `TaskService.onChange` → `full.refresh()` (subscribed in CS) | CS:447 → full/FullScreen.ts:160 | waits `entry.idle`, then `reread`: `tasks.find` per stack level, `fullTree`, list render, title, project line, description (`draft.read` may replace editor text) |
| G3 | QuickEntrySession `fresh` callback | full/FullScreen.ts:98 | `reread(beforeShow)` — same as refresh |
| G3 | QuickEntrySession `onChange(state, drawnNext)` | full/FullScreen.ts:99 | `changed`: field/title field shown or ended, list render, field text/tint sync, focus, Done button |
| G3 | QuickEntrySession `renamed(was, now)` | full/FullScreen.ts:100 | replaces stack top with the renamed task |
| G3 | `entry.idle().then` after title rename | full/FullScreen.ts:449 | destroys title field, redraws title |
| G3 | Editor change → `descriptionTyped` → 600 ms `saveTimer` | full/FullScreen.ts:279, 289 | writes description via act |
| G3 | `focusin` / `focusout` (+ rAF) on full sheet | full/FullScreen.ts:131-132 | Done button and `is-typing` |
| G3 | document `keydown` (Escape) | full/FullScreen.ts:133 | closes full screen unless typing or a `.tc-backdrop` exists |
| G3 | field blur → `setTimeout` | full/FullScreen.ts:400 | `entry.blur()` if focus did not come back |
| G3 | rAF on open / setTimeout on close | full/FullScreen.ts:134, 214 | `is-shown`; removes element after fade |
| G3 | BottomCapsule `UndoService.onChange` | BottomCapsule.ts:33 (created FullScreen.ts:129) | undo button state on the full screen |
| G3 | search input `input` event (no debounce) | search/SearchWindow.ts:55 | `tasks.search`; newest answer only (`asked`) redraws results |
| G3 | search input `keydown` | search/SearchWindow.ts:57 | arrows move `picked`; Enter picks |
| G3 | result row click | search/SearchWindow.ts:109 | pick → close → after fade `onPick` |
| G3 | Overlay document `keydown` (capture, Escape) | menu/Overlay.ts:61 | `onClose("escape")` of the owning menu |
| G3 | Overlay backdrop `pointerdown` | menu/Overlay.ts:60 | `onClose("away")` |
| G3 | Overlay `show` rAF / `add` rAF / `levelEl` rAF | menu/Overlay.ts:68, 76, 88, 94 | adds `is-shown` |
| G3 | Overlay fade `setTimeout(collapse ms)` | menu/Overlay.ts:166 | removes parts; resolves `closed` → pending picks run (`afterClose`) |
| G3 | Picks `giveUp` setTimeout 2000 ms | kit/Panel.ts:41 | drops a pick from `waiting` (unblocks `act`) |
| G3 | TaskMenu Enter `keydown` (capture) | menu/TaskMenu.ts:430 | confirms the asked question |
| G3 | TaskMenu window `pointerdown` (capture) within double-click | menu/TaskMenu.ts:609 | closes menu and renames |
| G3 | TaskMenu copy click | menu/TaskMenu.ts:215 | follows a link (pick) |
| G3 | TaskMenu stack microtask `Motion.enter` | menu/TaskMenu.ts:276 | grows field row in |
| G3 | LiftedMenu `scrollIntoColumn` callbacks | menu/LiftedMenu.ts:64-73; menu/inView.ts:62-66 | builds and shows the menu when the column stops; closes if a finger took it or the source left |
| G3 | PanelPages animation `finish`/`cancel` | menu/PanelPages.ts:67, 88-89 | hides folded part / clears overflow |
| G3 | DescriptionPeek render promise | menu/DescriptionPeek.ts:39 | `markCut` |
| G3 | DescriptionPeek click | menu/DescriptionPeek.ts:38 | read whole description / link closes menu |
| G3 | ViewMenu rAF | menu/ViewMenu.ts:53 | re-places panel and copy |
| G3 | MonthPicker arrows | menu/MonthPicker.ts:47-49 | `month` and grid redraw |
| G3 | MenuPanel switch click | menu/MenuPanel.ts:204-209 | flips knob, then `onToggle` |
| G3 | BulkMenu label/project toggle resolve | menu/BulkMenu.ts:168-172, 210-214 | redraws menu / Project page with new items |
| G3 | TaskMenu label/project toggle resolve | menu/TaskMenu.ts:413-419, 500-504 | recolours copy, redraws menu / Project page |
| G3 | EmbeddedEditor contentDOM `focus` | markdown/EmbeddedEditor.ts:73 | sets `host.activeEditor` |
| G3 | EmbeddedEditor `onUpdate` | markdown/EmbeddedEditor.ts:126-129 | `hooks.onChange` |
| G3 | EmbeddedEditor keymaps (Escape, line commands) | markdown/EmbeddedEditor.ts:120-123 | Escape → `onEscape`; line-command keys swallowed |
| G3 | ObsidianMarkdown contentDOM `focus`/`blur` | markdown/ObsidianMarkdown.ts:37-38 | push/pop key scope |
| G3 | ObsidianMarkdown rendered `click` | markdown/ObsidianMarkdown.ts:21 | opens link |
| G3 | TreePanel `ResizeObserver` | projects/TreePanel.ts:54-59 | `onWidth` → `layout.frame()` |
| G3 | TreePanel dim click | projects/TreePanel.ts:43 | `onClose` → act setProjectsPanel(false) |
| G3 | Divider drag/release/snap | projects/TreePanel.ts:60-72 | live `--tree-width`, `onWidth`, settings write on release, haptic |
| G3 | ProjectTree row click | projects/ProjectTree.ts:85 | `onTap` → pickProjectNode |
| G3 | TreeLift LongPress start | projects/TreeLift.ts:31-36 | lift (arbiter claim, haptic, float) |
| G3 | TreeLift document pointermove/up/cancel | projects/TreeLift.ts:74-76 | float position, gap line; up → moveProject |
| G3 | CarryReport wait timer | projects/CarryReport.ts:58-60 | re-tells `carryAt`, then `changed` (reread + drawCarried) |
| G3 | CarryReport `move`/`end` (driven by drag) | CS:288, 291, 1043, 1051, 1068 | `carryAt` on point change; clears timer |
| G3 | FilterTitle title click / cross | projects/FilterTitle.ts:26-29 | project menu / clearProjectFilter |
| G3 | FilterTitle rename `onDone` | projects/FilterTitle.ts:53-57 | removes field, renameProject |
| G3 | ProjectTasks plate click (via onPlate) | CS:1549 | opens quick entry in part |
| G3 | RepeatEditor buttons | repeat/RepeatPanel.ts:56, 59, 61, 63-64, 99 | `editRepeat` → redraw + `onChange` |
| G3 | ViewButton press | ViewButton.ts:25-28 | opens ViewMenu |
| G3 | NoteSearch `onChooseItem` | projects/NoteSearch.ts:25 | setProjectNote via act |
| G3 | Grips `pointerdown` | kit/Grips.ts:16 | resize gesture |
| G3 | Button `click` | kit/Button.ts:47 | `onPress` |
| G4 | ResizeObserver on timeline el | Timeline.ts:165-170 | drops `frame`, calls deps.onResize (CS.fitWholeDay → zoom refit), re-holds the anchor (room + scrollTop) |
| G4 | `wheel` on timeline el | Timeline.ts:171 | clears `anchor` |
| G4 | `pointerdown`/`touchstart` on document (capture) | Timeline.ts:172 | clears `anchor` |
| G4 | Grips pointer gestures | Timeline.ts:174-180 | onGrip → DragController.grip (stretch) |
| G4 | ScrollEdges for timeline (scroll + ResizeObserver on el and canvas) | Timeline.ts:164; ScrollEdges.ts:15, 22-24 | fade classes and `--tc-scrolled*` |
| G4 | Motion.disappear finish | Timeline.ts:334; Motion.ts:205 | removes gone block |
| G4 | external minute tick (CS:489) | Timeline.ts:377-381 | now pill text + layout (isPast, labels) |
| G4 | ScrollEdges per TaskList | TaskList.ts:127 | fades |
| G4 | ScrollHold `scroll` listener | ScrollHold.ts:16-22 | fit held room (unless keeping) |
| G4 | ScrollHold timer | ScrollHold.ts:34-37 | ends keep, fit room |
| G4 | empty plate `click` | TaskList.ts:356 | deps.onEmpty → openAtEnd |
| G4 | section plate `click` | FunnelLists.ts:53 | openIn(column, group) |
| G4 | FreeRoomDoubleClick | FunnelLists.ts:75 | openAtEnd |
| G4 | MutationObserver on note block root (childList, characterData, class) | BlockHeight.ts:18, 23 | rAF → fit block height |
| G4 | ResizeObserver on note block root | BlockHeight.ts:19, 24 | rAF → fit |
| G4 | rAF | BlockHeight.ts:37-40 | fit |
| G4 | Divider gestures (ribbon) | RibbonLayout.ts:70-79 | onWidth `--tc-list-width`; onRelease saveShare; onSnap haptic |
| G4 | Divider gestures (still layouts) | StillLayout.ts:65-74 | applyWidths; saveShare; haptic |
| G4 | StripTrack/EdgeTrack callbacks (swipe) | RibbonLayout.ts:107-118 | place classes, wheel follow, arrive |
| G4 | setTimeout end of slide | RibbonLayout.ts:141 | removes `is-switching` |
| G4 | ResizeObserver on rows stack | RowsLayout.ts:75-76 | fit(true) heights at once |
| G4 | rAF in fit | RowsLayout.ts:102-107 | apply heights |
| G4 | settle setTimeout | RowsLayout.ts:148 | fit again after motion |
| G4 | ListDrop.onHover | RowsLayout.ts:66-70 | `is-drop-room`, fit |
| G4 | Motion.enter finish/cancel | Motion.ts:101-102 | restores overflow |
| G4 | Motion.leave finish | Motion.ts:131-134; KeyedRows.ts:91-93 | removes row, drops from `leaving` |
| G4 | SmoothScroll finger listeners (pointerdown/wheel/touchstart) | SmoothScroll.ts:28-29 | stops the glide ("finger") |
| G4 | ScrollGlide end callback | SmoothScroll.ts:30-34 | removes listeners, reports end |
| G4 | SnapGlide rAF loop | SnapGlide.ts:38-46 | draws interpolated value (divider width) |
| G4 | Store subscribers (prototype) | next/Store.ts:39 | redraw on state change |
| G4 | Store queue `.then` (prototype) | next/Store.ts:55 | runs effects in order, dispatches results |
| G4 | Preact componentDidUpdate (prototype) | next/KeyedList.tsx:26-33 | slide rows by measured tops |

## Counts

| file group | state rows | effect rows | effect rows by kind | guard `none` (all kinds) | core+obsidian rows | of them guard `none` | event sources |
|---|---|---|---|---|---|---|---|
| G0 | 51 | 142 | core 93, obsidian 33, screen 16 | 58 | 126 | 56 | 19 |
| G1 | 112 | 244 | core 114, obsidian 73, screen 57 | 168 | 187 | 135 | 50 |
| G2 | 135 | 135 | core 39, core (pure rule) 17, obsidian 79 | 49 | 135 | 49 | 26 |
| G3 | 134 | 174 | core 85, obsidian 30, screen 59 | 66 | 115 | 48 | 53 |
| G4 | 133 | 124 | core 44, dom 24, obsidian 7, obsidian/screen 1, screen 48 | 76 | 52 | 41 | 32 |
| **total** | **565** | **819** | | **417** | **615** | **329** | **180** |

**Totals.**

- **Facts held in more than one place (A.1):** 45.
- **State locations (A.2):** 565.
- **Effect call sites (B.1-B.5):** 819.
  - **Guard `none`, all kinds:** 417. A cell that starts with "none" counts, including "none in <file>", where the only guard sits in CalendarScreen.
  - **Core and Obsidian rows:** 615, of which 329 have guard `none`.
- **Rows that group several call sites:** some rows in B.2-B.5 list a few call sites of the same call; each is cited by line.
- **Pure core rules:** these are listed as `core` / `core (pure rule)` rows with guard `none` or `n/a`. They read no file and need no ordering.

**Writes that reach the core outside `act`/`changing`:**

- **Quick entry:** creates, edits, sections and unfolds go through `WriteQueue` in QES (see the G1 note).
- **Undo and redo:** CS:938.
- **Carry:** `startCarry` and `endCarry` (CS:1044, 1053), guarded only by `carrying`. `carryAt` (CarryReport.ts:55) is guarded only by its own point dedupe and timer.
- **View settings `set`:** `listShare` (CS:607), `zoom` (CS:991) and `treeWidth` (CS:1601).
- **Device place hand-over:** main.ts:108.

The B tables name each one in its guard cell.

