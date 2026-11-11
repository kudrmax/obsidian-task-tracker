# Projects screen: order, stages and subtasks

Follows `2026-11-11-projects-screen-design.md`. Max, 2026-11-11, after using 0.4.190–0.4.191: the Projects screen must be
where he plans globally — sorts tasks and picks what he takes now and what he doesn't. In 0.4.191 it can't: a card is
dragged only onto the tree, a task with subtasks shows «1/3» and never opens, and By stage starts with Today.

## What Max gets

1. **The task list of the Projects screen is a real list, in both modes.** A card is lifted and dropped between other
   cards exactly as in the funnel's columns (the same lift, gap, drop line, auto-scroll, several selected cards at once).
   The order he makes is the file's order, so every other column shows it.
2. **By stage moves a task between stages.** A card dropped in another stage's section goes to that list at that place:
   Soon → Today puts it into Now (as a drop on the day list does), Backlog → Soon into Soon, and so on. Its projects stay.
   A drop inside its own section only reorders.
3. **By project reorders, and may change the stage or the project.** A card dropped between cards takes its place in the
   file next to them: the stage of the card right above it (the card right below, at a section's top) and that place in
   its list. Dropped into another subproject's section, it moves from the section's project it was shown under to that
   one, as a drop on the tree row does; its other projects stay. A drop into an empty section writes like that section's
   plus.
4. **Subtasks show and work as in the funnel's columns.** An unfolded task shows its subtasks under it with the branch
   lines; a folded one shows its next open step; the fold opens and closes the same way as in the lists (same control,
   same file write). Subtasks are dragged, reordered, nested and un-nested as in the lists.
5. **By stage order is the funnel's: Inbox, Backlog, Soon, Today** (Done last, for closed tasks). By project sorts each
   section's cards in the same stage order, then the file's order inside a stage.
6. Dropping a card on a tree row still moves it to that project (unchanged), and the tree keeps its own drags.
7. **Delete project** (Max, 2026-11-11): the project menu offers Delete project, destructive, asked first with words that
   say the tasks stay. Deleting a project **never deletes, closes or moves a task**: its line leaves `## Projects`, its
   `🗂️ Name` leaves every task line that has it (a task left with none shows under No project), its subprojects move up
   a level into its place in order, an attached note's file is untouched. One undo brings it all back. Not offered for
   All, No project or Done.

The plugin comes first (Max: «плагин в приоритете»); the iPhone app follows in its own stage with the same contract.

## Contract (the core decides)

- The Projects tasks model gives what a list column needs to be dragged and dropped in: per section the gaps between its
  cards with what a drop there writes (list, group, before-key, and for By project the project swap), and subtasks as the
  lists give them (stack, fold state, levels). A frontend never computes a stage, a list or a position from neighbours.
- One service call writes a drop in the Projects list (one or many cards), and the landing is the same model read again.
- The section order and the in-section sort live in `core/application/projectsScreen.ts`.

## Decisions

(the agents add theirs here, numbered from 1)

### Backend

1. **Delete project** (Max's item 7). `tasks.deleteProject(name)`: the tree line goes, the subprojects lifted a level
   into its place in order (`ProjectTree.deleted`), the `🗂️` of that project goes from every task line, subtask and Done
   lines included (`ProjectWrites.deleteProject`); nothing else in any line changes. One write, one step of undo; a name
   the tree lacks changes nothing; the chosen node falls back to All. `ProjectMenu.delete` `{ label: "Delete project",
   title: "Delete “Name”?", message: "Its tasks stay; they just lose this project.", confirm: "Delete", cancel:
   "Cancel", destructive: true }`; the menu exists only for a project, so All, No project and Done never offer it.
2. **Every part a drop can go to shows, empty too.** By stage the four stages always (Inbox, Backlog, Soon, Today; Done
   only under Done, with cards); By project every live subproject of the node (All: every live project) and the node's
   own part. Each `ProjectsSection` says `empty`, `header` and `plate` (the No tasks plate: an empty part with a header,
   or the only part; the node's own part, empty above subprojects, draws nothing). Under Done and a done project an
   empty part is still left out, and `ProjectsView.reorders` is false there: closed tasks are not reordered. This
   replaces «an empty part left out» of the parent spec's decision 8 for live nodes.
3. **One mechanism with the lists.** The gesture is the lists' own: a part is a section (`ProjectsSection.group`, null
   for the untitled part, `PlacedHead.opens` true for every header), its `rows` (`ProjectsListRow` `{ id, item, level,
   card, drop }`) are what `ListGroup.rows` are, so `placeAt`, `placeOfDrop`, `branchOf` and `gapBranch` run unchanged.
   The write is the funnel's own moves (`moveToGroup`, `nest`) run through `applyAll`, plus a `swapProject` step. The
   call is `tasks.dropInProjects(cards, place)` with `projectsDropPreview(cards, place)` (`{ landings, view, tasks }`)
   rather than a new `DropTo`: a Projects card carries the project it is shown under (`ProjectsDrop`), which a
   `DroppedTask` (key and column) has no room for, and its landing is on the Projects screen, not the funnel's.
4. **Where a drop between cards goes, both modes:** right after the card above it in the file (before the next task of
   that card's list and section that is not being dropped, else that section's end), in that card's list and section;
   no card above: right before the card below; an empty part: where its plus writes (`newTask.place`). The dropped
   cards are neither above nor below, nor is the second card of a task shown in two parts. Today is Now and is written
   as the day list's drop writes it (`moveToGroup` to Now: dated today).
5. **The project swap** is a new `TaskChange` `swapProject` `{ from, to }`, the very rule `dropOnProject` now runs too
   (`swappedProjects`): `from` off, `to` last, the others kept. By project only, when the part's project (the node's
   for its own part, none for No project's) differs from the card's `from`. A subtask's row carries its card's `from`;
   a subtask let go between cards becomes a task with its parent's projects (as in the lists), then the swap. A nest
   place writes only the nest: a subtask has its parent's projects.
6. **By stage keeps the file's order inside a stage** (the list's order), not the order of the branch's projects.
7. **A part the screen no longer has** (or a list that takes no drop) rejects with StaleTaskError, writing nothing.
8. **The landing** prefers the part the card was dropped in when the task shows in two; a nested card lands as a
   `subtask` of its new parent.

### Obsidian frontend

1. **The gap under the untitled part.** By project the node's own part (no header) stands over the first subproject's
   header. With `PlacedHead.opens` true on that first header, `placeAt` gives the gap under the own part's last card to
   the subproject, so a card could never be dropped at the end of the own part. The plugin marks the first header as
   opening only when no card of the untitled part is drawn above it (By stage, or an own part that is empty and drawn as
   nothing); every other header opens as the contract says. The Swift frontend maps its headers the same way.
2. **The No tasks plate is tapped as a list's.** A tap on an empty part's plate opens the new task's field in the
   plate's place (the plate hidden while it is open), written where that part's plus writes (`ProjectsSection.newTask`),
   as a tap on a list's empty section does.
3. **Delete project's look.** The row stands apart at the menu's foot as its own group, in the danger colour with the
   trash icon (as a task's Delete). Tapped, the question takes the row's place in the same panel: the core's `title` on
   its own line, wrapped so the name shows whole (it is not faded, unlike a task's name), the `message` under it smaller
   in the muted colour, then `cancel` and the red `confirm` with the trash icon. Cancel gives the row back; Delete writes
   `deleteProject` and closes the menu. No Enter shortcut.
4. **Subtask rows act as the lists' subtasks.** A subtask row opens its menu from its card's column (`menuFrom` of the
   card it belongs to), folds with its counter, and is lifted, nested and un-nested when its card may be dropped
   (`canDrop`); a lifted task carries its subtasks' rows folded under its dashed place.
5. **Several cards on the Projects screen.** ⌘-click, Shift-click (a run of the Projects list's own cards) and Select
   tasks pick Projects cards as list cards; a lifted picked card carries the others as a stack. Each carried card gives
   its own row's `drop` (the card it was picked on), both to `dropInProjects` and to a drop on the tree's row
   (`dropOnProject`), which now takes the whole stack too.
6. **Where the float lands.** The float lands on the card `projectsDropPreview` names for the card under the finger
   (`landings[0]`, read before the write), drawn after the write; that card stays hidden until the float is down.
