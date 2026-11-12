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

(agents add here)

## Contract

(the backend fills this in)
