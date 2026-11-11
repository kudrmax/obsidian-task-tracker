# Projects screen: a held card opens the project it waits over

Follows `2026-11-11-projects-screen-design.md` and `2026-11-11-projects-order-design.md`. Max, 2026-11-11: «Я переношу
задачу из проекта 1 в 2, навожусь на 2, через какое-то время открывается справа проект 2». He thought it already worked.

## What Max gets

1. Carrying a task card from the Projects list (either mode, one card or several picked), he holds it over another
   project's row in the tree. After the same pause that unfolds a folded branch today, that row becomes the chosen one:
   the right side shows its tasks in the mode he had (By project / By stage), and a folded branch of it opens in the tree.
   The card stays in his finger.
2. He lets it go at a precise place among the opened project's tasks — between two cards, into a subproject's part, into
   a stage — and it is written exactly as a drop in that list is written today (`dropInProjects`, refused where
   `projectsTakes` refuses), plus it joins the opened project: the project it was carried from gives way to it.
3. He can hover on: from project 2 to project 3, or back to project 1. Each hovered row opens in turn.
4. Letting go on a tree row still does what it does today (`dropOnProject`), whatever is open on the right.
5. After the drop the screen stays on the opened project, the card landing where he let it go.
6. Letting go nowhere (or Escape) changes nothing in the file and brings the screen back to the node he lifted the card
   on, the card flying home.

## Decisions

1. **One delay for both.** A held card waits `PROJECTS_HOVER_MS` (600 ms, unchanged) over a row; then the row does what
   its row model says, in one core call: `tasks.hoverProjectNode(node)` unfolds its branch if folded
   (`unfoldsOnHover`) and chooses it if it opens (`opensOnHover`). No unfold-then-open in two steps: Max waits once.
2. **Which rows open: `ProjectsRow.opensOnHover`.** A live project's row (active or waiting) and No project, when not
   already chosen. Not All (it takes no task), not Done and not a done project (their list reorders nothing, so there
   is nothing to let go into). The rule is «the row takes a task, its list takes drops, it is not chosen», so a project
   folder (branch `project-folders`: takes no task) never opens once both are on master.
3. **`drop.from` keeps its meaning.** The project the card was shown under where it was lifted. The carried cards' drops
   are read at the lift, before any hover changes the screen.
4. **A card the opened list does not show** (lifted on another node) is judged and written from the file, not from the
   view: the core knows its stage without its card on screen. By project the part's project takes `from`'s place, as
   today. By stage the chosen node's project takes `from`'s place (No project: `from` goes), so the task ends up in the
   project he opened; a card the view does show keeps today's By stage rule (projects stay).
5. **Landing**: stay on the opened project; the float lands on the card `projectsDropPreview` names.
6. **A drag let go nowhere returns to the node the card was lifted on** (`selectProjectNode`), so a cancelled carry
   leaves the screen as it was.
7. **The iPhone app**: its Projects list takes no card yet (the app's stage of «Projects order»), so a project opened
   under a held card would show tasks the card cannot be let go among. The app gets the hover open together with its
   in-list drop, from the same contract (`opensOnHover`, `hoverProjectNode`); until then its spring-loaded unfold stays
   as is. The Swift row decodes the new field so the contract is mirrored.

(the agents add theirs below)

### Backend

1. **`ProjectsRow.opensOnHover: boolean`**: `acceptsTask && !selected && <the node's list takes drops>`, the last the same
   rule as `ProjectsView.reorders` (one function, `nodeReorders`: every node but Done and a done project), so a future
   folder row (`acceptsTask` false) never opens and a row opens exactly when its list would take the card. False without
   a tasks file.
2. **`TaskService.hoverProjectNode(node)`**, door `tasks.hoverProjectNode(node)` (answers `projectsScreen`): reads the
   tree as drawn and applies that row's own `unfoldsOnHover` and `opensOnHover` (`hovered` in `projectsScreen.ts`), no
   second copy of the rules. Choosing goes through `selected`, so the branches above open as for search. A node with no
   row (gone) leaves the screen as it is. `unfoldProjectNode` and `selectProjectNode` keep their meaning.
3. **A card the opened list does not show is judged by `ProjectsDrop.lifted?: { id, list, origin }`** (`ProjectsLifted`),
   filled by the core on every `ProjectsCard.drop` and `ProjectsListRow.drop` at the lift; a frontend keeps the drops it
   read at the lift (decision 3) and passes them back unchanged. `projectsTakes` stays sync and pure: a card the view
   shows is judged from the view, as before; one it does not from `lifted`. `dropInProjects`/`projectsDropPreview`
   judge and write such a card from the file (its entry by key), `lifted` only saying the frontend did lift it. The field
   is optional so `dropOnProject` and hand-made `{ key, from }` drops stay valid; a card the view lacks and whose drop has
   no `lifted` is still `StaleTaskError`.
4. **`origin` of a closed task is null**: it is dragged from no column of the funnel, so a stage refuses it (before, the
   list's name `"done"` was passed to `acceptsDrop` by a cast). A reorderable list never shows a closed task, so nothing
   Max sees changes.
5. **Writing By stage** (spec decision 4): a card the view does not show gets the chosen node's project in `from`'s place
   (No project chosen: `from` goes; All: projects stay); a card it shows keeps the projects. By project unchanged (the
   part's project). Subtask places (`kind: "subtask"`) unchanged: they nest by key.

### Obsidian frontend

1. **One timer, the row's fields.** `TreeDrop` starts the `PROJECTS_HOVER_MS` wait over a row with `unfoldsOnHover ||
   opensOnHover` and then calls `tasks.hoverProjectNode(node)` only; the whole screen (tree and tasks) is read and drawn
   again while the card stays carried. The plus never waits over a row (as before). The wait fires once per row: the card
   has to leave the row and come back to fire it again (2 → 3 → 1 each open in turn).
2. **The carried cards' drops and the node they were lifted on are read at the lift** (`ProjectsCarry`, called by the
   drag before any target reads it), from the lifted card's own row (no longer «the row pressed last») and the picked
   cards' rows; every later `projectsTakes`, `projectsDropPreview`, `dropInProjects` and `dropOnProject` gets exactly those.
3. **A carried card stays in the page while another node is drawn**: its row (and its folded subtasks, and picked cards)
   is kept by the list out of sight (`tc-hidden`), in no list a drop reads, so the finger's pointer keeps its element
   (iOS sends a finger's moves to the element it touched) and the dashed gap is gone from the opened list. Drawn again on
   the node it was lifted on, it is the same element, still the dashed place, so the copy flies home onto it. Once the
   drag is over, the next drawing drops it.
4. **Going back before flying back**: let go nowhere, on a place that refuses, or Escape, the screen is put back first
   (`selectProjectNode(start)` and a redraw), then the copy flies to its card. Branches a hover unfolded stay unfolded
   (choosing never folds), as an unfold under a held card always did. A release while a hover's choice is still being
   drawn waits for it, then goes back.
5. **The row stays filled** under a still finger after the redraw the hover caused (the fill is drawn again on the new tree).
6. **A hover's choice is not a write**: no tasks file re-read for it (as `act` would), only the Projects screen; a
   failure is shown as any failure and never stops the drag.
7. **Docs**: `docs/plugin/tasks.md` («Экран Projects») tells the hover; `docs/plugin/app.md` is left as it is (the app's
   tree keeps its unfold until its in-list drop, decision 7).

### iPhone app

1. **The contract mirrored, nothing drawn yet** (decision 7): `ProjectsRow` decodes `opensOnHover` (required, as the core
   always sends it), and `TaskBoard.hoverProjectNode(_:)` sits next to `unfoldProjectNode(_:)`, calling
   `tasks.hoverProjectNode`. No view calls it in this branch: the spring-loaded unfold in `ProjectsPage.hover` keeps
   `unfoldsOnHover` → `unfoldProjectNode`, so a held card never changes the chosen node until the app's list takes cards.
2. **`ProjectsCard.drop` stays an opaque `JSONValue`**: the core's `lifted` rides in it untouched and goes back to
   `tasks.dropOnProject` as it came; Swift reads none of its fields.
