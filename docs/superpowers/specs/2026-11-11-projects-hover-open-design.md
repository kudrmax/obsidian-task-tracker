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

### Obsidian frontend

### iPhone app
