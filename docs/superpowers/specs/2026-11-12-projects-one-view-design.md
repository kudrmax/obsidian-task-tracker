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

(agents add here what they decide on the way)

## Contract

(the backend fills this in)
