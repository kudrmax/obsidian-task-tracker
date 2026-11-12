# Subprojects in the filter — design

What Max approved: `2026-11-12-projects-subprojects-max.md` (variant B: a «Subprojects» row with the accent check in the view menu). Boards: `docs/design/canvas/projects-subprojects/BO*.dc.html` — the menu row only; the subproject label drawn on their cards is NOT approved: cards stay as today.

Built from master (0.4.196's view menu and filter), in parallel with `projects-view-rework`; whichever lands second merges the other.

## Behaviour

- The view menu (the view button) gets, as its own group under the modes, a row «Subprojects» with the accent check when on.
- On: a chosen project shows its whole branch (today). Off: only the tasks whose own project is the chosen one (a task with several projects counts if one of them is the chosen project); its subprojects' tasks are hidden in every list, the timeline, rows and by project.
- Independent: it never changes the view mode, and choosing or clearing a project never changes it (Max 11-12: controls are independent).

## Lead's decisions (Max may veto)

1. The row shows only while the chosen node is a project that has subprojects; otherwise it is absent (it would mean nothing).
2. Default on (today's behaviour). Kept per device, like the mode; never synced.
3. By project with Subprojects off shows only the project's own part.
4. The plus and quick entry under a filter keep writing the chosen project; a drop on a tree row keeps today's rule.
5. The project note's block follows the same setting.

## Core (backend)

The rule «which tasks a node shows» takes the setting; the device state keeps it; the view menu model (`ViewChoice` / the menu the view button opens) carries the row: label, checked, shown; one call to toggle it (door: added only). The frontends draw the row and call; they decide nothing.

## Decisions

- backend: a folder never gets the row and always shows its whole branch — no task can have a folder, so «its own tasks» would be an empty screen.
- backend: off also governs the writes that read the filtered screen: a drop or a typed task at a section's end goes after the last task the screen shows, and a card dropped on a tree row gives way the chosen project itself (not the first subproject it also has).
- backend: the note's block shows the row as the main screen does (its project with subprojects); it toggles the same device setting. `firstView(wide, true)` (before the note's project is known) has no row; the first `projectNoteView` brings it.
- backend (review): only subprojects the panel draws count — under a live project its done subprojects don't; under a done project all do (`ProjectsRow.hasBranch`).
- backend: the row's words come from the core (`SUBPROJECTS_WORD`, «Subprojects»); the frontends draw `ViewChoice.subprojects.label`.
- frontend-obsidian: a tap on the Subprojects row toggles it and closes the menu, as a mode's row does (the board shows only the open menu); the lists then drop or return the subprojects' tasks with the lists' usual leave and enter motion, in place.
- frontend-obsidian: Rows and a note's block follow their lists' heights to the end of that motion (they kept the taller height when tasks left: a row of empty room in Rows, a block that never shrank). Seen while checking this toggle; the app's rows and blocks should shrink the same way.
- frontend-obsidian: a new row in place (under no card: a list's first, or one after a header) waits while the rows in place still fade — whichever redraw sent them, for what is left of their fade — and grows as they fold, never over them: the No tasks plate and a list's last cards, either way, and a typed text's field and its card. A row under a card grows at once. A section header first among the rows that stay has no top margin. In Rows each row goes once, straight, to the height it rests at; a note's block follows; in Live Preview the editor's content no longer grows to the page, so the block stands right under the note's text whatever its height.
- frontend-swift: the row is text alone, no symbol: the boards draw none, the core gives no icon, and By project's symbol would repeat. Its check is the system menu's, the same as the modes' check beside it.

## Contract

- `ViewChoice.subprojects: SubprojectsOption | null` — `{ label: "Subprojects", checked: boolean }`, null unless the chosen node is a project (not a folder) with subprojects. Carried by `funnelView(wide).view`, `projectNoteView(path, wide).view` and `firstView(wide, false)`.
- `TaskService.toggleSubprojects(): Promise<void>`; door `tasks.toggleSubprojects()` (added only, answers like `setViewMode`).
- `ProjectsScreenState.subprojects?: boolean` — false when off; left out means on. Device-only, kept in the same state as the view modes.
- Reads that follow it with no new argument: `screen(date, filter)`, `dayView`, `projectsScreen(node)` (own part alone when off), `projectNoteView`, `filterHides`, `drop`/`dropPreview`/`landing`/`createInPlace` positions under a filter, `dropTasksOnProject`.
- `contracts.ts` changes: the field on `ProjectsScreenState`, `ViewChoice.subprojects`, the type `SubprojectsOption`, the method `toggleSubprojects`. `settings.ts`: unchanged.

## Scope cut (2026-11-12)

The motion changes made on the way (rows and note-block heights following their lists, the «No tasks» plate waiting for leaving cards, the editor's content height under a note's block, `readResting`; the app's two-step list drawing and `FoldingListLayout.anchor`) are taken out: that layer is rebuilt in `projects-view-rework`, and this branch must not touch it. The decisions above about that motion are withdrawn here and belong to the rework. Kept: the core rule and setting, the view menu row on both sides, and the app's reused-cell fix (a dropped plus opened no field and lost the typed text; a new field showed another task's title).
