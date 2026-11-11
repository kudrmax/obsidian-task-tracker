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
6. **A grey name means no open task at all** (Max, 2026-11-11: «Пусть светлее когда ВООБЩЕ нет задач, а остальное
   одинаково»). A project's row is grey only while its whole branch (it and its subprojects) has no open task: a new
   empty project, a folder whose subprojects are empty. Any open task in the branch, in any stage (Inbox, Backlog, Soon,
   Today), draws the name in full colour; there is no separate active/waiting look. Done projects go to Done as before.

## Decisions

(the agents add theirs here, numbered per side)

### Backend

1. **The mark is `🗃️` on the project's tree line**, a word of its own right after the name, before the note's link:
   `- Работа 🗃️`, `- Работа 🗃️ [[Заметка]]` (`FOLDER_MARK`). Read anywhere on the line as a word (with or without the
   variation selector, `- 🗃 Работа` too), written back in that place; a name never holds it (`cleanProjectName` takes it
   out). `ProjectNode.folder`; rename, move, nest keep it, Delete lifts the subprojects with theirs, undo restores the
   text. The 0.4.189 app reads the line as a project named «Работа 🗃️» and keeps it byte for byte through its writes
   (`oldAppKeepsProjects.test.ts`); until the app is updated it shows the mark in that project's name.
2. **The contract.** `ProjectRef.folder: boolean` (every ref: tree rows, menus, the quick entry's `projects()`);
   `MenuProjectOption.disabled` = a folder not checked on every task (a checked one, given by hand, may be taken off);
   `ProjectMenu.folder: ProjectFolderSwitch` `{ label: "Folder", on, disabled, reason }`, `reason` «Has tasks of its
   own» while disabled, else null; `ProjectsSection.takes: boolean`; `TaskService.setProjectFolder(name, folder):
   Promise<boolean>`, door `tasks.setProjectFolder(name, folder)` → boolean. One write, one step of undo.
3. **A task of its own** is a task line (not a subtask, whose `🗂️` is its parent's) naming the project, in any section,
   open or done (`hasOwnTasks`). Turning Folder on with one is refused, writing nothing (`false`); off always writes.
4. **The folder's Projects list.** By project the folder's own part is left out while empty, so the first subproject's
   header opens and the list's top is that subproject's. With a task given the folder by hand the own part shows it,
   `takes` false, `newTask` null, no plate, and an untitled part that takes nothing does not keep the next header from
   opening. The same for a folder's part under All and under a parent project. `ProjectsRow.acceptsTask` is false on a
   folder's row.
5. **The plus let go on a folder's tasks is refused**: `ProjectsView.newTask` null for a folder, and By stage every
   stage's `newTask` null (the stages still take dropped cards, which only change stage, never a project; their plate
   shows and does nothing, as Done's). Each subproject's part keeps its own plus.
6. **Writes that would give a folder refuse it**: `toggleProject` putting it on writes nothing (each task answered as it
   stands; taking it off where every task has it works); `setProject` and `dropOnProject` onto a folder write nothing;
   `newProject` with a folder's name answers the folder's ref and gives it to no task; `createInPlace`/`createWithId`
   with a folder make the task without a project; the `project` and `swapProject` steps of `applyAll` (a list grouped
   by project, the Projects list's swap) leave a task as it is; `projectsTakes` is false in a part that takes nothing
   and under a task drawn in such a part (a subtask is given its parent's projects), and `dropInProjects` writes
   nothing there. `createProject` inside a folder works.
7. **Hand edits stay hand edits.** A task carrying `🗂️ Folder` (hand, agent, a title typed with the field) is read and
   shown under the folder; the core never strips it. Nesting a task under such a task in the funnel's lists is not
   refused: the folder is that task's, as its subtasks' projects always are.
8. **Grey names** (item 6). `ProjectStatus` keeps its three values with a new meaning: `active` while the branch has an
   open task in any stage (an open task in the Done section, written by hand, doesn't count, as before); `waiting` when
   it has none and is not done (a project of it with no task yet); `done` as before. `ProjectsRow.waiting` and `muted`
   follow it, so a frontend that only reads them follows without code of its own. A folder with no task in its branch
   is grey.

### Obsidian frontend

1. **Folder is a switch row in Rename's group, right under Rename**, before the note's rows (`menuSwitch`, `.tc-menu-row.is-switch`, `role="switch"`). The switch is built from the segmented control's measures: track `--tc-seg` high with `--tc-seg-pad`, knob `--tc-seg-btn-h`, 52 px wide (`--tc-menu-switch-*`); off the dim ink, on the accent, the knob white (`--tc-on-accent`), sliding in `--tc-duration-snap`. The row stays 44 px without a reason.
2. **Disabled**: the row isn't pressed; «Folder» goes muted, the core's `reason` stands under it as a caption (`--tc-font-sub`, muted), the switch dims to `--tc-tile-off-opacity`. The reason stays readable: the row itself is not dimmed, unlike a disabled menu row.
3. **A tap slides the knob at once, then the menu closes and `setProjectFolder(name, !on)` is written** (as every pick of the menu: closed first, then written). One Undo takes it back.
4. **No folder icon on the row** (the iPhone's decision 1 has one): a plugin menu row has one mark at its end, and here it is the switch; Rename's group keeps its pencil, the note's rows their marks. Everything else of the iPhone's decision 1 is taken.
5. **A folder on the Project page and the quick entry's panel is a plain disabled row** (`MenuProjectOption.disabled` → the row's `disabled`), at the tile-off opacity, no extra icon; its subprojects stay checkable under it (= the iPhone's decision 2).
6. **The plus over a folder's tasks shows no drop line where letting go writes nothing**: already so, `TasksDrop` draws the line only where the part's `newTask` (else the list's) is given (= the iPhone's decision 3). A tap on the plus with a folder chosen does nothing, as with Done. A folder's By stage plates show and do nothing (Backend 5), as Done's.
7. **The tree draws a folder as any project**: no mark of its own on its row. What tells it is the Folder switch in its menu and the refusals; the grey name follows `muted` only.
### iPhone app

1. **Folder is a stock `Toggle` in the project menu, right under Rename**, in Rename's group (both act on the project
   itself; Note and Delete project keep their own groups). Symbol `folder`. On, iOS draws its checkmark; while the core
   says `disabled`, the row is greyed and the core's `reason` («Has tasks of its own») is the row's subtitle. A tap
   closes the menu (a menu's stock toggle does), writes `setProjectFolder(name, !on)` and reads the screen again.
2. **A folder's option on the Project page and in the quick entry's/New Task's project choice** is a stock disabled menu
   row (greyed, no tap), with no extra symbol; the menu's own grey says it can't be picked, and its subprojects keep
   their parent's name under them as before.
3. **The plus held over a folder's tasks shows no drop line** where letting go writes nothing: the line is shown only
   where the part's `newTask` (else the list's) is given, the same answer the let-go reads. So the plus over an empty
   folder's list, Done, or a folder's hand-given own part shows nothing and flies back; over a subproject's part it shows
   the line and types a task of that subproject.
4. `ProjectsSection.takes` is decoded but drives nothing yet: the app's Projects list takes no card drops between cards
   (only the tree takes a card, by `acceptsTask`), so the part's refusal is already the core's `newTask` null and
   `plate` false.
9. **«New project…» with a folder's name answers nothing to pick** (review). `newProject` answers `null` for a folder's
   name as for a blank one and writes nothing, so a frontend that picks what it answers (the quick entry's
   `entry.setProject(made.name)`, the app's New Task sheet) picks nothing; no new contract. On top, at the root:
   `QuickEntry.setProject` keeps the field's project when given a folder (unless the renamed task carries that folder
   already), `capture.project(folder)` reads as none, and `create`, `edit` and `createInPlace` leave off a folder the task
   doesn't carry (`draftProjects`): a task given one by hand keeps it through an edit.
10. **Nothing nests under a task that carries a folder**, in whatever part draws it (By stage too) and under its
    subtasks: `projectsTakes` false and `dropInProjects` writes nothing.
11. **The mark is read only outside the note's link** (`- Работа [[Мои 🗃️ заметки]]` is no folder; the link stays
    whole), and taken out with the space before it, the rest of the line as typed: `- Box  two 🗃️` is «Box  two», so a
    task's `🗂️ Box  two` still names it.
9. **«New project…» with a folder's name answers nothing to pick** (review). `newProject` answers `null` for a folder's
   name as for a blank one and writes nothing, so a frontend that picks what it answers (the quick entry's
   `entry.setProject(made.name)`, the app's New Task sheet) picks nothing; no new contract. On top, at the root:
   `QuickEntry.setProject` keeps the field's project when given a folder (unless the renamed task carries that folder
   already), `capture.project(folder)` reads as none, and `create`, `edit` and `createInPlace` leave off a folder the task
   doesn't carry (`draftProjects`): a task given one by hand keeps it through an edit.
10. **Nothing nests under a task that carries a folder**, in whatever part draws it (By stage too) and under its
    subtasks: `projectsTakes` false and `dropInProjects` writes nothing.
11. **The mark is read only outside the note's link** (`- Работа [[Мои 🗃️ заметки]]` is no folder; the link stays
    whole), and taken out with the space before it, the rest of the line as typed: `- Box  two 🗃️` is «Box  two», so a
    task's `🗂️ Box  two` still names it.
