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

The plugin comes first (Max: «плагин в приоритете»); the iPhone app follows in its own stage with the same contract.

## Contract (the core decides)

- The Projects tasks model gives what a list column needs to be dragged and dropped in: per section the gaps between its
  cards with what a drop there writes (list, group, before-key, and for By project the project swap), and subtasks as the
  lists give them (stack, fold state, levels). A frontend never computes a stage, a list or a position from neighbours.
- One service call writes a drop in the Projects list (one or many cards), and the landing is the same model read again.
- The section order and the in-section sort live in `core/application/projectsScreen.ts`.

## Decisions

(the agents add theirs here, numbered from 1)
