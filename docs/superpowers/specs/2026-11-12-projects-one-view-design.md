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
5. Modes: no filter → Two columns («Columns» on a narrow screen), All columns (wide only), Rows. A node → the same plus By project, except No project (one part, nothing to split). Done and a done project → By project alone (rows would be four empty lists: their tasks are closed). ~~Default: Two columns without a filter, Rows with one.~~ (withdrawn by 49) A kept mode not offered now falls back to the default.
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
    over the calendar. ~~While the plus is carried or a task is typed every list keeps a card's room more.~~ (withdrawn by 52) The day turns by
    the arrows there (the ribbon's day swipe is the two columns' own).
18. An empty list shows the «No tasks» plate (a tap types a task there) under a filter (the filter's `emptyLabel`) and in
    Rows; in two columns without a filter an empty list stays as before.
19. Search: a find the filter hides clears the filter before it is shown; a done find outside two columns opens on its own
    page (the Done column stands only in the ribbon).
20. A card or the plus held within 24 pt of the screen's left edge the core's pause (`PROJECTS_HOVER_MS`, as the plugin's `EdgeReveal`) brings the panel out for that carry; a row lights and
    takes the card (`dropTasksOnProject` for a funnel card, `dropOnProject` for a By project card), and a held card over
    a row the core's pause opens it (the carry's `carryAt`, which decides the pause).
21. By project draws the core's `projectsScreen(node)` parts without the old segment (By stage is Rows now), the calendar
    beside it behind the divider.

Applied in the app (2026-11-12, round 3): 39 (the carry is the core's session: `startCarry` at the lift, `carryAt` on
each move and after its wait, `carryOnNode` on a row, `endCarry` nowhere/dropped/naming, `endProjectName`; the app keeps no
lifted filter, edge timer, hover timer or panel of its own), 40 (the place is the core's: `firstPlace` at launch,
`setFunnelPlace` as the ribbon settles, the old `ribbonPlace` number handed once), 41 (`ribbon`, `searchPaths`), 33/37
(`plates`), 36 (`filterHides`), 38 (`firstView`). 28/34: the app reads every day through the filtered `screen`.

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
35. The deprecated place names are gone from `contracts.ts` (decision 3 carried out); their door names (`days.stepScreen`, `rules.placeShowing`, `rules.shownLists`, `rules.shownEntryLists`) still answer as thin mappings onto the funnel's rules, as CLAUDE.md binds the door, and no frontend calls them.
36. Whether the filter hides a find is the core's (`filterHides(item, filter)`, a subtask by its task), so decision 19's «clears the filter» is one call each frontend asks.
37. Decision 18's plate is the core's: `ViewChoice.plates` per list (words or null), the same rule in the main screen and the note's block.
38. `firstView(wide, note)` is the view drawn before `funnelView`/`projectNoteView` answers, so no frontend keeps its own fallback mode.
39. (Root cause, Max 11-12: «architecture allowing bugs») The carry to a project is one session in the core: `startCarry` records what is carried and the filter at the lift; `carryAt({ edge, node }, nowMs)` decides the edge's reveal and a row's unfold/open after `PROJECTS_HOVER_MS` by the host's clock and answers how long to wait; `carryOnNode` moves every carried task under the lift's filter; `endCarry("nowhere")` puts the lift's filter back, `"dropped"` keeps it, `"naming"` keeps the panel out until `endProjectName`. The plus held over a row only unfolds it. The panel's reasons (button, carry, naming) are the core's (`ProjectsPanel.reason`).
40. The place the screen stands at is kept by the core (`setFunnelPlace`, `FunnelView.place`, `firstPlace`); `funnelPlaceOf` reads anything a device kept before: Projects and the app's -1 → Inbox, the app's 0/1/2, nothing → Today.
41. `ViewChoice.ribbon` is the one rule for swiping, turning to a list's place and the Done column; `FunnelView.searchPaths` says a search shows project paths. Both frontends computed these from the mode and the filter.
42. A carry never outlives its gesture: one left in the saved state (the app killed mid-drag) is dropped as the screen loads (`firstPlace`, the main `firstView`, a new service), as let go nowhere: no panel, the lift's filter back.
43. (Root cause, the app kept Select Tasks after a drop on a row) Ending Select Tasks after a drop is one rule, `endsSelection(end)`: a carry ended `dropped`, by any path, ends it; `nowhere` and `naming` keep it.
44. The plus is the view's (`FunnelView.plus`): by project, a tap types in place and the node's list takes the held plus only while the panel is closed; elsewhere a tap opens the frontend's New Task and the funnel's lists take it; the tree takes it while the panel shows.
45. `ProjectsPanel.dimCloses`, `ViewChoice.source` and `FunnelView.topRow` carry the dim's tap, the read a mode draws from and the narrow screen's top row, which each frontend decided.
46. The rows mode's heights are one rule, `stackedRows(wanted, room, least)` (the app's `StackedRows` ported, its tests with it): a list shorter than an even share keeps its height, the rest share evenly, none under its title and a card. Both frontends call it; the Swift type goes.
47. The old Projects screen's calls with no caller left the services: `tapProjectNode`, `unfoldProjectNode`, `hoverProjectNode`, `setProjectsMode`, and By stage (`ProjectsView.mode`/`modes`; `ProjectsCard.over`, gone once no frontend read it). Their door names still answer as thin mappings (decision 35).
48. The projects button can't be pressed while the quick entry's field is open (the app's rule, now both frontends'): `EntryState.locksPanel`.

View rework (backend, 2026-11-12, plan `2026-11-12-projects-view-rework.md`):

49. **Max's (11-12): one view mode.** `ProjectsScreenState.view` is the screen's one mode, changed only by `setViewMode`; a pick, a clear or a carry's filter never changes it. Its default is Two columns with a filter or without (Rows in a note's block, which keeps `noteView`). `filteredView` is gone: an old state that has it reads with `view` as the mode, and the next `setViewMode` drops it. Decision 5's default by filter and the Max spec's decision 3 are withdrawn. **Max's (11-12): mode and project are independent:** every mode is offered under every filter and none (By project included; a note's block Rows and By project), so a pick or a clear never changes what the button shows. Only All columns on a narrow screen is not offered (the device, not the filter): there the default stands.
50. `ViewChoice.layout` (`viewLayout`): the columns in order with their lists, titles and width kinds, `swipe` `pages | none`, the divider and the rows' stack (`scrolls` false in a note's block). Widths are numbers only for still layouts (`layoutWidths`, `layoutShareAt`); the ribbon's columns stay with its own guarded rule (`RibbonColumns`, the plugin's ribbon). All columns' widths moved into the core (`allColumnsWidths`, `allColumnsShare`, `allColumnsDividerAt`, `allColumnsWidthAt`, the divider's width an argument); `obsidian/ui/listWidth.ts` keeps thin wrappers until the plugin switches.
51. The rows' heights from measured lists (`stackedLists(lists, room, fade)`): a list that scrolls ends at a card's bottom plus the fade, never with the fade on a card; what that frees goes a card at a time to the list it lets show one more. `stackedRows` stays for the door.
53. **Max's (11-12): All is all tasks, no filter.** The All row is lit whenever no project, No project or Done is chosen; a tap on it (`pickProjectNode("all")`, `selectProjectNode("all")`) clears the filter (a narrow panel closes); no title or cross without a real node. `screen(date, "all")`, a drop or a write under `"all"`, and an old kept `selected: "all"` read as no filter. The old «tasks with any project» view is gone.
54. By project under no filter (and so under All): every open task by its top project (a task in each top project whose branch names it, shown by the first of its projects there; a top folder's part holds its subprojects' tasks and takes nothing), then «No project» last; the plus types in No project's part. Under No project its one part; under a project as before. Done and a done project are nodes with their own content: their done list by project in whichever mode is chosen. `ViewChoice.chosen` is the mode the button shows and checks (and `icon`); `ViewChoice.mode` is what is drawn: the chosen one, by project under Done or a done project (`wheel`, `ribbon`, `source`, `layout`, `plus` follow it).
52. `ViewChoice.context` (`viewContext`): the filter and the mode (a note's block: the mode) as a string; another context is drawn still, the same one changed animates. The screen's own reads (`screen`, `projectsScreen`) carry no context: the frontend pairs them with the view they were asked for. Decision 17's card of room more in every list while carrying or typing is withdrawn: no core rule ever had it (the app's `StackedLists` added it); rows never reflow during a carry, the drop room is the hovered list's alone.

Swift frontend, the view rework (2026-11-12):

55. A pick (a panel row, All) closes the panel at once; the filter's title and its lists are drawn together, still, once the lists are read for it: no frame shows the new title over the old filter's cards. A view change alone (the panel, the mode) draws over the lists already read, no file read waited on.
56. A mode or filter whose view reads By project's list (`FunnelPresentation.source`) has that list read before the view is drawn, and both show in one drawing: the screen stays on the old view a moment rather than drawing an empty column first.
57. Rows: the stack ends above the tab bar's resting row (the view button and the plus), never where the bar passes while it slides away. A carry holds the heights (until the carried copy is down, so the card lands on its drop line); the drop room is the hovered list's alone, inside its own scroll. While a task is typed (the plugin's 59–63, applied 11-12): while every list fits, the typed list grows with the field and its typed lines, the rows below sliding; when the lists share the room it keeps its height and scrolls the field into view. Once typing ends the field's room stands until the written card is measured in, so the list never closes and opens again. A list that shrinks waits for its leaving card to fade (0.2 s), then slides; one that grows slides with its cards. While a task is typed in a list the keyboard covers, the stack rises just enough to bring that list's bottom to the keyboard's top, its top never above the stack's.
58. Outside Columns the ribbon stays mounted, hidden and off the screen: its lists draw nothing and take no carry until it shows, then draw the screen still, where it stood.

View rework (Obsidian frontend, 2026-11-12):

59. Rows while a task is typed: while every list fits, the list grows with the field (the row slides with it); when the lists share the room, the list keeps its height and scrolls the field into view, no other row moves. Only a carry holds the heights still (decision 52's «frozen during typing» narrowed: freezing a fitting list hid its own cards behind its label).
60. Rows' heights are measured at the shape the lists move to (a card growing in at its full height, a card folding away as gone) and slide with that motion; a row that shrinks waits the fade of the leaving card (`duration-collapse`) and then folds with it. Letting go of a carried card ends the hold at once, so the row grows with the card that lands.
61. Another context (decision 52) is drawn with no CSS transition for that frame: a section header's margin, a card's height, a row's height take their new values in place.
62. The drop room in rows is one card's height at the end of the hovered list, inside its own scroll (`.is-drop-room`); no row changes height during a carry.
63. The still layouts (all columns, rows, by project, a note's block) attach no swipe at all: a sideways trackpad scroll or a finger does nothing there, no rubber band.
64. The docked panel (desktop) slides in and out (`duration-slide`, `ease-in-out`), and every column, the controls under them and the filter's name move and take their new widths with it as one motion; rows keep their heights. Nothing slides on the first drawing.
65. A held card that opens another node (`carryAt`) draws that node's lists at once, still, during the carry, so the card is let go among the tasks it sees; let go nowhere, the lift's lists are drawn back before the copy flies home.
66. A drag whose place fails under the finger or at the drop ends as a cancelled one: said once, the copy flies back, the lift's filter put back; a view closed mid-drag ends it at once, nothing left on the page.
67. Rows: every row takes its new height in the same motion as the cards that grow in, slide or fold away, no row waiting for another; a card landing in a row is read where it comes to rest. (Replaces 60's «a row that shrinks waits».)
68. Rows: a list that scrolls shows whole cards; the fade's room under its last whole card stays empty, the next card cut away there (Max's defect 2), the cut giving way near the list's end. The list a task is typed in is not cut.
69. Rows while typing: on the desktop the field keeps the capsule's room under it, wherever it stands in the list; on the phone the list keeps the room over the bar at its end. When the lists share the room, the field's list is made tall enough for the field and that room, once, from the tallest of the others. (Narrows 59.)
70. A list scrolls under a carried card only once the card is held at its edge a moment (250 ms), in every list: a card carried across a list's edge leaves it as it was.
71. The rows end at the bottom row (the controls), and the screen's foot fade lies only past the rows' column.

Applied from the Swift frontend: 17 (rows: each list as tall as its cards while all fit, the long ones share the rest and scroll inside, a card's room more while a card or the plus is carried or a task typed; the day by the arrows), 18 (the «No tasks» plate in an empty list under a filter and in rows), 19 (a find the filter hides clears it; a done find outside two columns opens on the whole screen), 20 (the left edge for a card and the plus), 21 (by project without a segment). 13, 15 and 16 are the app's own chrome: the plugin keeps the boards' top-left button and its own icons.

## Contract

All in `core/application/contracts.ts`; the door is `docs/door.md`, «Projects as one view with the funnel».

Types:
- `ViewMode = "twoColumns" | "allColumns" | "rows" | "byProject"`.
- `ViewModeOption { mode, label, icon, checked }`; `ViewChoice { mode, modes, icon, wheel, rows }` (`rows`: `["inbox","backlog","soon","day"]` in rows, else `[]`).
- `ProjectFilter { node, title, menu, clearable, project, emptyLabel }`.
- `ProjectsPanel { rows, open, docked, missing }`.
- `FunnelView { filter: ProjectFilter | null, view: ViewChoice, panel: ProjectsPanel | null }`.
- `ProjectsScreenState` adds `panelOpen?`, `view?` (the one mode, decision 49), `noteView?`; `selected` absent = no filter.
- `ViewChoice` adds `chosen`, `layout: ViewLayout` and `context: string` (decisions 50, 52, 54); `viewLayout`, `layoutWidths`, `layoutShareAt`, `stackedLists`, `viewContext`, `allColumns*` (decisions 50–52).
- `ProjectsPlace` adds `node?` (whose by project list).
- `FunnelPlace = "inbox" | "soon" | "calendar"`, `FunnelSpot` (+ `"done"`), `FunnelAt { mode, date }`; `FUNNEL_PLACES`, `stepFunnel`, `funnelPlaceShowing`, `viewEntryLists(mode, spot)`, `ROW_LISTS`, `VIEW_WORDS`.
- `EntryLook.filter?(): { node, project } | null` (the quick entry).

`TaskService`, new:
- `funnelView(wide)` — `await tasks.funnelView(true)` → `{ filter: null, view: { mode: "twoColumns", wheel: true, … }, panel: { open: false, docked: true, rows } }`.
- `projectNoteView(path, wide)` — `projectNoteView("Заметки/Стиль.md", true)` → `{ filter: { node: "project:Стиль", clearable: false, … }, view: { mode: "rows" }, panel: null }`; null for a note of no project.
- `pickProjectNode(node, wide)` — a tap on a panel row; `pickProjectNode("project:Стиль", false)` chooses and closes the panel.
- `clearProjectFilter()` — the cross.
- `setProjectsPanel(open)` — the projects button.
- `setViewMode(mode)` — `setViewMode("rows")`, the screen's one mode, filter or none (decision 49).
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
