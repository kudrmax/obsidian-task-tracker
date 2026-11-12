# Projects: one view with the funnel — design

What Max sees: `2026-11-12-projects-one-view-max.md` (approved 2026-11-12). Boards: https://claude.ai/artifact/6qFYdd3m6ktgnTtbk5EuVA, page «Экраны: десктоп и телефон» (each screen as a desktop + phone pair; variant 1 of «Режим вида внизу» is the chosen bottom row). Local copies of the boards: `docs/design/canvas/projects-one-view/` (the lead adds them).

Behaviour does not change: the tree, statuses, several projects per task, moving a task to a project, the plus into the tree, Done and No project work as on today's Projects screen. Only the layout changes: the Projects screen stops being a place of the ribbon; the chosen node becomes a filter over the ordinary screen; the screen gets view modes.

## The core (backend)

The lead's outline; the backend decides the exact shapes and writes them back here under «Contract».

1. **Places.** `projects` leaves `ScreenPlace`, `SCREEN_PLACES`, `SHOWN_LISTS`, `placeShowing`, `stepScreen` (Done still stands left of Inbox, reached only by the search). `EntryList` keeps a list for the By project mode if the entry needs one. `swipeLanding` is untouched (Max's guarded rule).
2. **The filter.** The tree's chosen node filters the ordinary screen: `screen(date)` gains the node (or a sibling read does), and returns only that node's tasks in every list and on the day's timeline (a project: its branch; `none`: tasks without a project; `all`: tasks with any project); no node = no filter, as today's screen. The view carries what is drawn over the tasks: the node's title, its project menu (today's `ProjectsView.menu`) and the clear action. Calendar events stay.
3. **Writes under a filter.** A drop in a filtered list lands by the visible-neighbour rule (before the visible task it was dropped before, after the last visible one; none visible: where the unfiltered screen puts it). A new task gets the filter's project (`none`/`all`: none added). Moving a card onto a tree row is today's `dropOnProject`, the filter playing the part today's chosen node plays (no filter: as from All).
4. **View modes.** `"twoColumns" | "allColumns" | "rows" | "byProject"`. The core gives the offered list with labels and the icon key, the current one, and the default: `allColumns` only where the host says the screen is wide (desktop); `byProject` only with a project chosen; without a project the default is today's two columns, with a project `rows`. The device keeps the last mode chosen without a project and the last with one, separately. Done and a done project offer what today's screen shows for them.
   - `rows`: the stages stacked Inbox, Backlog, Soon, Today (Today = the day column's list for the day shown), each with its sections and «No tasks» when empty — today's By stage, but on the funnel's lists, so drops and the plus are the funnel's own.
   - `byProject`: today's By project (`ProjectsView` sections), reached the same way.
5. **The device's state.** Today's `ProjectsScreenState` (selected, folded, doneOpen) plus the panel's open state (desktop) and the two remembered modes; never synced.
6. **The note block.** A project with an attached note (`ProjectNode.note`): the core answers which node a note path belongs to, so the plugin shows at the note's end the same view fixed to that node (default `rows`, no tree, no clear action). A note attached to no project shows nothing.
7. **Gone.** What only the Projects place needed (its wheel slot, its own list place if `rows` replaces it) goes; door functions keep their names and still answer (adding only).

## The plugin (frontend-obsidian)

- The Projects strip part, its wheel icon and its CSS place go; the wheel walks Inbox–Soon, Soon–Today, Today–calendar.
- The projects button (copy of the day title's chevron circle, 36, icon 20) at the top left opens the tree: desktop docked on the left with today's divider and handle (width kept), until the button closes it; phone: slides over the columns from the left over the menu's dim, closes after a pick. Today's `ProjectTree`, `TreeDrop`, `TreeLift`, hover-open reused.
- Over the tasks, when a node is chosen: its name big (today's Projects title) with a cross that clears it.
- The bottom row: the view button, a 44 circle like the plus, left of the wheel, the current mode's icon; tap opens the mode list as the app's menu panel with the accent check. Without the wheel (rows, all columns, by project) the button stands alone where the wheel was. On the phone the wheel moves left of centre to make room.
- `allColumns` (desktop only): Inbox over Backlog, Soon, the day column and the timeline side by side, the day/timeline divider as today.
- `rows`: the stages stacked in one column, the timeline to the right behind the existing divider (phone and desktop).
- Dragging a card from any list onto a tree row moves it to that project; on the phone a card held at the left edge slides the panel out.
- The project note's block (`registerMarkdownPostProcessor`-style, as the 11-07 block was: commit `37ffa588` for how it fit in notes): the view fixed to the note's project, the view button in the block's bottom row.
- `docs/plugin/screen.md` and the pages that name the Projects screen describe the new view.
- Both platforms, light and dark, checked in the test Obsidian against the boards.

## The iPhone app (frontend-swift)

- The Projects tab and the Projects page leave the ribbon; tabs: Inbox, Soon, Today (and what is there today besides).
- A toolbar button at the top left opens the tree as a stock iOS 26 sheet/panel from the left (follow `docs/design/apple.md`); the chosen node's title with a clear button over the lists.
- The view button in the bottom row as on the boards' phone frames, the mode list as a stock menu; modes: columns (today's ribbon) and rows (and by project with a project chosen); no all columns.
- Everything decided comes from the core: filtered screen, offered modes, the default, the device state through the door. `RibbonPaging` and `RibbonColumns` (Max's guarded rules) keep their tests; `RibbonColumns(projects:)` loses the projects page without changing how Inbox/Soon split or the divider at Today.
- No boards of the app's chrome exist yet: build to the plugin's phone boards with stock iOS 26 controls; the lead checks it on the simulator.

## Decisions

Backend (2026-11-12):

1. The filter is explicit: the core reads the device's chosen node in `funnelView`, and the frontend passes `filter.node` to `screen`, `drop`, `dropPreview`, `landing`, `createInPlace`/`createWithId` and the quick entry's `look.filter`. So the note's block (another node) and the main screen use the same calls, and a call without the argument answers as before.
2. The filter is `ProjectsScreenState.selected` (the tree's chosen node, as before); left out means no filter. A device that had a node chosen on the old Projects screen opens filtered by it, with the cross.
3. Old names stay as deprecated aliases until both frontends move: `SCREEN_PLACES`/`ScreenPlace` (with `projects`), `ScreenSpot`, `ScreenAt`, `stepScreen`, `placeShowing`, `shownLists`, `shownEntryLists`. The new ones are `FUNNEL_PLACES`, `FunnelPlace`, `FunnelSpot`, `FunnelAt`, `stepFunnel`, `funnelPlaceShowing`, `viewEntryLists`. Once both frontends report the move, backend removes the old ones (and `projects` from `SHOWN_LISTS`).
4. `EntryList` keeps `"projects"`: the by project mode's list.
5. Modes: no filter → Two columns («Columns» on a narrow screen), All columns (wide only), Rows. A node → the same plus By project, except No project (one part, nothing to split). Done and a done project → By project alone (rows would be four empty lists: their tasks are closed). Default: Two columns without a filter, Rows with one. A kept mode not offered now falls back to the default.
6. The note's block offers Rows and By project, Rows first; its mode is kept once for every note (`noteView`). No panel, no cross.
7. A note belongs to a project when the project's `[[link]]` (alias and heading aside) names the note's path without `.md`, or its end after a `/`, case aside.
8. The panel's `open` is the button's; a panel a carried card slides out is the gesture's own and is not kept. A pick on a narrow screen closes the panel (`pickProjectNode(node, false)`); a tap on the chosen row (fold) doesn't.
9. Visible-neighbour rule only where `before` is null (the section's end): after the last shown task of that section of that list, the carried ones aside; a drop before a shown card is already right. A drop on a column's title and a past day's list (no sections) stay as they were.
10. Under a project filter the cards show no folder mark; under All, No project and Done they keep it.
11. A held card over a panel row opens it (`opensOnHover`), now judged on the panel's rows (nothing chosen: every live project opens).
12. View icons are Lucide names (`columns-2`, `columns-4`, `rows-3`, `folder-tree`); the Swift app maps them to SF Symbols.

iPhone app (frontend-swift, 2026-11-12):

13. **Max's (11-12):** the projects button stands in the toolbar's top-right glass group between Sync and «⋯» (folder
    symbol, filled while the panel is out), not at the top left. The panel still slides in from the left.
14. The panel is half the screen wide (never under 196 pt), over the lists with the rest dimmed; a tap on the dim closes
    it (`setProjectsPanel(false)`), a pick closes it (the core's). Its header is «Projects» at the column title's size.
15. The view button is a glass circle the plus's size, left of the tab bar, which narrows for it. In Rows and By project
    (`wheel` false) the tab bar gives way and the button stands alone in the middle of the bottom row; the plus keeps its
    place. The menu is the system's, a check at the current mode.
16. SF Symbols for the core's icons: `columns-2` `rectangle.split.2x1`, `columns-4` `rectangle.split.3x1`, `rows-3`
    `rectangle.split.1x2`, `folder-tree` `list.bullet.indent`.
17. Rows: each stage's list as tall as its rows while all four fit; the long ones share what is left and scroll inside
    (`StackedRows`). Each stage is headed small (13 pt semibold, as a section), the day's title with its arrows stands
    over the calendar. While the plus is carried or a task is typed every list keeps a card's room more. The day turns by
    the arrows there (the ribbon's day swipe is the two columns' own).
18. An empty list shows the «No tasks» plate (a tap types a task there) under a filter (the filter's `emptyLabel`) and in
    Rows; in two columns without a filter an empty list stays as before.
19. Search: a find the filter hides clears the filter before it is shown; a done find outside two columns opens on its own
    page (the Done column stands only in the ribbon).
20. A card or the plus held within 24 pt of the screen's left edge the core's pause (`PROJECTS_HOVER_MS`, as the plugin's `EdgeReveal`) brings the panel out for that carry; a row lights and
    takes the card (`dropTasksOnProject` for a funnel card, `dropOnProject` for a By project card), and a held card over
    a row the core's pause opens it (`hoverProjectNode`).
21. By project draws the core's `projectsScreen(node)` parts without the old segment (By stage is Rows now), the calendar
    beside it behind the divider.

Applied in the app from the Obsidian frontend and the backend (2026-11-12, round 2): 26 (a drop on a row reads the task
under the filter it was lifted under; a carry let go nowhere puts that filter back once it has ended), 27 (the panel the
plus brought out stays while the new project's name is typed), 30 (the folder mark chooses the filter), 31 (a device kept at
the old Projects place opens Inbox), 33/37 (the plates and their words are `ViewChoice.plates`), 36 (`filterHides` before
`clearProjectFilter`), 38 (`firstView` before the first read). A selection carried onto a row moves every carried task.
28/34: the app reads another day through the same filtered `screen`, so it needs no separate `dayView`.

Obsidian frontend (2026-11-12; numbered from 22 so as not to meet the Swift frontend's 13–21 on its branch):

22. The top row: on the desktop the row of the projects button and the filter's title always stands over the column titles (D4); on the phone only while a filter is set or the mode has no column titles (rows, by project), else the button stands in the titles' row and the first title makes room for it (T1).
23. The docked panel (desktop): every column moves right by its room; the wheel and the view button centre on the lists right of it; Undo's capsule stands at the panel's tree inset (D1: 20 from the edge).
24. The phone's bottom row with the wheel: the view button and the wheel stand together in the middle of the room between Undo's capsule and the plus, as the boards measure it (T1, T4: the wheel ends up right of the screen's centre). Alone, the view button stands in the middle (T3).
25. All columns: Inbox, Soon and the day's list each as wide as the one divider sets, the timeline the rest; the share it saves is one list's against the timeline, so the middle share gives four equal columns (D1); it is the same setting as two columns' divider.
26. The panel on the phone lies over the lists and their fade, under the bottom row; a tap on the dim closes it (as the app's 14). A drag let go nowhere after a held card opened another node puts back the filter it was lifted under, none included.
27. The plus can be let go in the tree (a new project) in every mode while the panel shows; on the phone the plus held at the left edge slides the panel out too (the app's 20); the panel stays out while the new project's name is typed.
28. A swipe's next day reads the filtered day (`screen(date, filter).day`), so the day sliding in shows only the filter's tasks; in every mode but two columns, and in a note's block, the screen does not swipe (the app's 17).
29. The note's block keeps the 11-07 frame (hairline, radius 14), 12 inside it; its rows are as tall as their tasks and the block grows with them up to the old block's tallest; its own bottom row (Undo + ⋯, the view button, the plus) stands inside the frame.
30. A card's folder mark and the whole screen's project line choose that project as the filter (`selectProjectNode`); the panel stays as it was.
31. A window kept at the old Projects place opens at Inbox.
32. (Backend, after the frontends) A card let go on a project it already has leaves its line as it is, on every path (`swappedProjects` with `from` and `to` one project).
33. `ViewChoice.emptyLabel` («No tasks») in every view, so no frontend keeps its own words; `ProjectFilter.emptyLabel` stays.
34. `dayView(date, filter?)` is `screen(date, filter).day`.
35. The deprecated place names are gone (decision 3 carried out).
36. Whether the filter hides a find is the core's (`filterHides(item, filter)`, a subtask by its task), so decision 19's «clears the filter» is one call each frontend asks.
37. Decision 18's plate is the core's: `ViewChoice.plates` per list (words or null), the same rule in the main screen and the note's block.
38. `firstView(wide, note)` is the view drawn before `funnelView`/`projectNoteView` answers, so no frontend keeps its own fallback mode.
39. (Root cause, Max 11-12: «architecture allowing bugs») The carry to a project is one session in the core: `startCarry` records what is carried and the filter at the lift; `carryAt({ edge, node }, nowMs)` decides the edge's reveal and a row's unfold/open after `PROJECTS_HOVER_MS` by the host's clock and answers how long to wait; `carryOnNode` moves every carried task under the lift's filter; `endCarry("nowhere")` puts the lift's filter back, `"dropped"` keeps it, `"naming"` keeps the panel out until `endProjectName`. The plus held over a row only unfolds it. The panel's reasons (button, carry, naming) are the core's (`ProjectsPanel.reason`).
40. The place the screen stands at is kept by the core (`setFunnelPlace`, `FunnelView.place`, `firstPlace`); `funnelPlaceOf` reads anything a device kept before: Projects and the app's -1 → Inbox, the app's 0/1/2, nothing → Today.
41. `ViewChoice.ribbon` is the one rule for swiping, turning to a list's place and the Done column; `FunnelView.searchPaths` says a search shows project paths. Both frontends computed these from the mode and the filter.

Applied from the Swift frontend: 17 (rows: each list as tall as its cards while all fit, the long ones share the rest and scroll inside, a card's room more while a card or the plus is carried or a task typed; the day by the arrows), 18 (the «No tasks» plate in an empty list under a filter and in rows), 19 (a find the filter hides clears it; a done find outside two columns opens on the whole screen), 20 (the left edge for a card and the plus), 21 (by project without a segment). 13, 15 and 16 are the app's own chrome: the plugin keeps the boards' top-left button and its own icons.

## Contract

All in `core/application/contracts.ts`; the door is `docs/door.md`, «Projects as one view with the funnel».

Types:
- `ViewMode = "twoColumns" | "allColumns" | "rows" | "byProject"`.
- `ViewModeOption { mode, label, icon, checked }`; `ViewChoice { mode, modes, icon, wheel, rows }` (`rows`: `["inbox","backlog","soon","day"]` in rows, else `[]`).
- `ProjectFilter { node, title, menu, clearable, project, emptyLabel }`.
- `ProjectsPanel { rows, open, docked, missing }`.
- `FunnelView { filter: ProjectFilter | null, view: ViewChoice, panel: ProjectsPanel | null }`.
- `ProjectsScreenState` adds `panelOpen?`, `view?`, `filteredView?`, `noteView?`; `selected` absent = no filter.
- `ProjectsPlace` adds `node?` (whose by project list).
- `FunnelPlace = "inbox" | "soon" | "calendar"`, `FunnelSpot` (+ `"done"`), `FunnelAt { mode, date }`; `FUNNEL_PLACES`, `stepFunnel`, `funnelPlaceShowing`, `viewEntryLists(mode, spot)`, `ROW_LISTS`, `VIEW_WORDS`.
- `EntryLook.filter?(): { node, project } | null` (the quick entry).

`TaskService`, new:
- `funnelView(wide)` — `await tasks.funnelView(true)` → `{ filter: null, view: { mode: "twoColumns", wheel: true, … }, panel: { open: false, docked: true, rows } }`.
- `projectNoteView(path, wide)` — `projectNoteView("Заметки/Стиль.md", true)` → `{ filter: { node: "project:Стиль", clearable: false, … }, view: { mode: "rows" }, panel: null }`; null for a note of no project.
- `pickProjectNode(node, wide)` — a tap on a panel row; `pickProjectNode("project:Стиль", false)` chooses and closes the panel.
- `clearProjectFilter()` — the cross.
- `setProjectsPanel(open)` — the projects button.
- `setViewMode(mode)` — `setViewMode("rows")`, kept for the screen with or without a filter.
- `setNoteViewMode(mode)` — the note's block.
- `dropTasksOnProject(keys, to, filter)` — `dropTasksOnProject([item.key], "project:Дружба", filter?.node ?? null)`.

`TaskService`, an argument added (optional, last):
- `screen(date, filter?)` — `screen("2026-11-12", "project:Стиль")`.
- `drop / landing / dropPreview(tasks, to, day, filter?)`.
- `createInPlace / createWithId(text, priority, place, repeat, labels, project, filter?)`.
- `projectsScreen(node?)` — `projectsScreen("project:Стиль")`: its by project view whatever the device chose.
- `dropInProjects / projectsDropPreview(cards, place, node?)`.

`DayService.stepFunnel(from, shift)` — `stepFunnel({ mode: "inbox", date }, -1)` → null.

What each frontend changes:
- The ribbon/wheel walk `FUNNEL_PLACES` and `stepFunnel` (Done → Inbox on, null back); `funnelPlaceShowing` instead of `placeShowing`; the quick entry's `shown` is `viewEntryLists(view.mode, spot)` and its `look.filter` is `funnelView().filter`.
- Read `funnelView(wide)` with the screen, pass `filter?.node` to `screen`/`drop`/`dropPreview`/`landing`; by project mode reads `projectsScreen(filter.node)` and passes the node to `dropInProjects`/`projectsDropPreview`.
- Panel row tap → `pickProjectNode`; cross → `clearProjectFilter`; projects button → `setProjectsPanel(!panel.open)`; view menu → `setViewMode`; a funnel card on a row → `dropTasksOnProject`; hover stays `hoverProjectNode`.
- The note's block: `projectNoteView(path, wide)`, `setNoteViewMode`, its node as the filter everywhere.
- When both have moved, the deprecated names go (decision 3); nothing breaks before that.
