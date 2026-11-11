# Project folders

Follows `2026-11-11-projects-screen-design.md` and `2026-11-11-projects-order-design.md`. Max, 2026-11-11: some projects
exist only to group others (a common project that holds subprojects). He wants to mark such a project a folder, so no
task can be put straight into it.

## What Max gets

1. **A toggle in the project menu** — the same menu as Rename (tap the project's name over its tasks): **Folder**, on or
   off. Turning it on is possible only while the project has **no tasks of its own** (open or done; its subprojects'
   tasks don't count). With tasks of its own the row is shown disabled, with a short reason. Turning it off is always
   possible.
2. **A folder takes no task.** Nothing anywhere can give a task a folder as its project:
   - the task menu's Project page and the quick entry's project choice show the folder (so its subprojects are found
     under it) but it can't be checked;
   - a card dropped on the folder's tree row is refused (the row doesn't light; the card flies back);
   - in the Projects list, the folder's own part takes no drop and has no plus/plate; a drop elsewhere in a folder's
     screen never writes the folder; the plus let go on the folder's tasks writes nowhere it would name the folder;
   - «New project…» and the plus into the tree still create projects and subprojects inside a folder;
   - an agent or a hand edit that writes `🗂️ Folder` on a task: the core reads the task as it is (shown under the
     folder) — the folder only stops the app from doing it; the toggle can't be turned on again until that task leaves.
3. **Everything else is a project's**: rename, delete (tasks stay), attach a note, reorder and nest in the tree, its
   status computed from its subprojects.
4. **Stored in the file** in `## Projects`, a mark on the folder's line the core picks (plain text, survives a hand edit,
   ignored safely by the 0.4.189 app — `tests/phone/oldAppKeepsProjects.test.ts`). `docs/plugin/file.md` and
   `agents.md` say how.
5. **Both the plugin and the iPhone app** get the toggle and the refusals (the app through the core's models).

## Decisions

(the agents add theirs here, numbered per side)
