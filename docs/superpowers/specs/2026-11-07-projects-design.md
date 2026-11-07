# Projects

Status: planned with Max; nothing is built yet.

## Why

The plugin works for small tasks. Anything big (be happy, build a circle of friends after moving to a new country) gets lost:
a line in Backlog that means nothing, sections that live one day, and no place for the notes and thoughts that come before
an action. A project is not a list of tasks and is never taken into work as a whole: some of its steps wait for months, some
are being done now, a small one is done at once, a multi-step one goes to Soon, and they are spread over time differently.

## Decided

1. **There are tasks and projects, nothing else.** No areas, goals or other levels. «Be happy» is a project like any other.
2. **No nesting in the plugin.** Projects are flat. If Max thinks of one project as part of another and links their
   notes, that is his notes' business; the plugin ignores it.
3. **Every task stays in `TODOs Tasks.md`.** One file, as now: the lane, order, sections and the morning rules work
   unchanged. A project's tasks are lines of this file like any other.
4. **A project is a note with the project tag** (a setting, «Project tag», `#project` by default), anywhere in the vault (Max hardly uses folders); the tag counts in the
   note's properties or in its text. The note holds free text: why, thoughts, observations. The project's name is the
   note's name.
5. **A task's project is a field of the line, `🗂️` with a link to the note**, like `📅` and `⏰`:
   `- [ ] Сходить на языковой обмен 🗂️ [[Окружение в новой стране]] 📅 2026-11-12`. A field, so it never is part of the
   task's title; a wikilink, so Obsidian keeps it right when the note is renamed. One project per task; a subtask or a
   description belongs to its parent's project.
6. **A project's step is never «the whole project in Soon».** Each task of a project moves through the lane on its own;
   untaken ones wait in Inbox or Backlog.
7. **Project mark on a card**: a folder icon in the caption colour at the right of the card, in the date's place and of
   its width (left of the date, repeat or counter when the card shows them); the card's height does not change. A tap on the icon opens the project note, a tap on the rest of the card
   opens the menu as always. The project's name is in the task menu («Project») and, on the Mac, in a tooltip on hover.
   Board: `docs/design/canvas/Proj2V1.dc.html`.
8. **No new screen. Grouping by project is a way to show a list**, the same everywhere it is on: the list shows project
   groups (each the section header with two additions: it folds — a chevron, a tap on the title, the fold kept on the
   device, folded it shows how many tasks it holds — and an arrow button beside the title opens the project note), then
   «No project», always last. Inside a group, the project's tasks without a section, then its sections in the file's
   order. Off, the list is as today, project tasks with the mark. Projects never go inside sections. Board:
   `docs/design/canvas/Proj1.dc.html`. Backlog and Soon have it (on by default in Backlog, off in Soon,
   switched per list and kept on the device: a tap on the column's title, «Backlog» or «Soon», opens
   its menu with one row, Group by project, with a check; board `docs/design/canvas/Proj5V1.dc.html`); Inbox, Now and the day columns never group by project. Any overview of projects later (projects without a next
   step) is a view of these groups, never a screen of its own.
   - **The file does not change.** A section is one `### Name` for every project: with grouping on, «Дальний бэклог»
     shows inside each project that has tasks in it, and inside «No project»; off, it is one section with all of them.
   - **Moving a task** in the grouped view: the line goes under the target section (or into the list's part without a
     section) right before the visible task it was dropped before, or right after the last visible task of that project
     there; with none, at the end of that section (or of the part without a section). Into another project's group — the
     `🗂️` changes; into «No project» — it goes. Subtasks go with their parent and are always in its project.
   - **Section actions in the grouped view touch only that project's part.** Rename inside «Окружение» moves Окружение's
     tasks into a section with the new name (an existing one or a new heading); the other projects keep theirs. Remove
     section takes only Окружение's tasks out of it. Sections are reordered only with grouping off. An empty section is not
     made inside a project: the section button's field inside a project group writes the task straight into the new
     section, so the section is born with a task of the project.
9. **A task is put into a project from the plugin.** The task menu has «Project»: picking a project writes its `🗂️` on
   the line, «No project» takes it off; the task keeps its place in the lane. Board:
   `docs/design/canvas/Proj3Flow.dc.html` (approved). A project group has no plus of its own: the plus at the bottom
   right, taken to a project group (the way it is taken to any place), writes the new task into that list (Backlog or
   Soon) at the drop place, with that project's `🗂️`.
10. **Done stays in the file's Done**, with its `🗂️`: a project's history is its done tasks.
11. **The project note shows the plugin's screen, filtered to the project** (the live block, in the first version). The
    same columns, the wheel and every gesture as the main screen, so Max thinks the same way in the project and in the
    plugin; only that project's tasks, without the project mark (the whole block is the project), with «No tasks» where a
    column is empty. Everything done in it writes `TODOs Tasks.md` by the visible-neighbour rule, in every column of the
    block (Inbox, Now, a day, Soon, Backlog): a moved or new task goes right before the visible task it was dropped before,
    or right after the last visible one; with none, where the main screen would put it. A new task gets the project's
    `🗂️`. Board: `docs/design/canvas/Proj4V2.dc.html` (chosen over the lanes-as-a-list variant).
    The block appears by itself at the end of every project note, as Obsidian's backlinks-in-document do: only shown,
    nothing is written into the note.

Rejected on the way: tasks written in the project notes, read from many files. It broke manual order (two files have no
common «above»), sections shared across files and the one-file iPhone app; moving a taken task into the file and back
fixed that but made lines travel between files. One file wins.

## How it is used

1. **Start a project.** A new note «Окружение в новой стране» with `#project`. Write freely: why, thoughts, observations.
2. **Give it steps.** Take the plus to the project's group in Backlog and write the steps; or, at an Inbox review, the
   task menu → «Project» → «Окружение…».
3. **Take a step.** Drag it from the group to Soon, Now, a day or the calendar, as any Backlog task. Its card has the
   project mark; a tap on the mark opens the note.
4. **Done.** The task leaves the screen and goes to Done with its `🗂️`.

## Rules for the core

Decided by the lead after the spec review; the core owns every one, the frontends only draw what it gives.

1. **The field.** `🗂️ [[Note]]`: the plugin writes it after the labels, before the other fields. It is the task's
   project whatever the note is: the tag only decides which notes the «Project» menu offers and which get an empty group
   in Backlog. A note deleted or untagged keeps its tasks' project by name; its group's arrow is off (`canOpenNote`).
   The tag counts in properties (`tags`) or as a tag in the body, exactly the setting's tag, not its nested children.
2. **Title and search.** The field is not part of `title`, as no field is: reminders, Live Activities, alarms,
   «Delete …?» and the card show the title alone. Search also finds a task by its project's name. Repeat, copy, moves and
   every edit keep the field.
3. **Subtasks.** A subtask's project is its parent's; a `🗂️` written on a subtask line is ignored while it has a parent.
   A subtask that leaves its parent (moved to another column, the calendar, a repeat copy without parent) gets the
   parent's `🗂️` on its line. A task dropped under a parent of another project loses its own. «Project» in a subtask's
   menu is disabled, showing the parent's project.
4. **Who knows the projects.** A port `Projects` gives the core the list of project notes (name, note path, link text);
   the Obsidian infrastructure fills it from the metadata cache; the door's context may carry `projects` (the app passes
   none for now: a task's project comes from its own field). Link text is the shortest one Obsidian would write.
5. **Groups.** The core gives each groupable list as a ready model: groups in order (projects by name, «No project»
   last), each with title, project, folded, count, `canOpenNote`, and its sections. Count: open top-level tasks of that
   group in that list. In Backlog every project has a group, an empty one with «No tasks» (a new project shows at once and
   the plus can be dropped in it); in Soon only projects with tasks there have a group. Defaults (Backlog on, Soon off),
   which lists can group (`TaskList.canGroupByProject`) and the fold state store are the core's, as `ScreenBehaviour`.
6. **«No section» inside a group.** Inside a project group and inside «No project», the tasks without a section stand
   first without a header, as decision 8 says; the «No section» header appears only with grouping off, as today.
7. **Empty sections with grouping on** show inside «No project» only; a tap on their «No tasks» writes a task without a
   project. A section header lifted with a long press with grouping on does not lift (`can.reorderSection` false).
8. **Section actions inside a group.** Rename to a new name puts the new heading where the old one stood, the project's
   tasks moved under it; the section button inside a group asks the name, then the first task (Escape after the name
   drops both); tasks of the project below the field do not move. The task menu's Section in a grouped list offers the
   sections of the task's group. A drop on a section header inside another project's group changes the project too.
9. **Folded group**: a drop on its title puts the task at the group's end; search opening a task in a folded group
   unfolds it; Select tasks does not select inside folded groups.
10. **Mass actions** get «Project» (all selected get the project; subtasks follow their parents). A stack dropped into a
    group: all get its project.
11. **The mark and the card.** The folder icon stands in the date's place when the card shows no date; with a date, a
    repeat or a counter, it stands left of them, the same width. It is on subtasks too (their parent's project), off
    inside the project note's block, on in grouped lists as well. In Select tasks a tap on it selects, like the card.
12. **`📁` in the file stays «subtasks folded»; the project is `🗂️`.** docs/plugin says so plainly.
13. **Rename of a project note.** The `🗂️` link follows through Obsidian's «Automatically update internal links»; the plugin checks it at
    start and says so in settings when it is off. Obsidian's rewrite of the tasks file is an outside change: undo across
    it says «Can't undo: the tasks file changed», as today. docs/plugin names both.

## The iPhone app

A big refactor of the app is under way; for now it gets only what keeps it from breaking, and nothing may break. Every
action the app does on a project task — drag in a list and between columns, onto and off the timeline, reschedule, edit
the title, priority, labels, sections, subtasks, repeat, done, won't do, delete, undo — keeps the `🗂️` field on the line,
and its title shows without it. The app writes lines only through the core, so this is the core's: the backend agent adds
door tests that run each of those actions on a line with `🗂️` and check the field is still there, and the Swift tests
(`npm run test:apple`) get the same check on a fixture with a project task. Quick entry writes without a project.
Grouping, the mark and «Project» come to the app later, as a feature of its own.

## The block in the note

Other plugins put their own block at the end of a note; the block is built the same way, in Reading and Live Preview,
on the desktop and the phone. Proposed by the lead, to be checked on the boards: the block's height is the phone screen's,
with its own scroll inside; its own wheel position, day and divider, kept per note; calendar events on its timeline, as on
the main screen; Cmd+Z and Cmd+F act on the block only when the focus is in it.

## Contract

Written by the backend agent from these rules before the frontends start: the `project` field and `can.setProject` on
`TaskItem`, the grouped list model, the project picker's menu model, the drop targets of groups, `ProjectsService`
(list, set project, open-note target), the settings field «Project tag», the door's `projects`. `contracts.ts` and
`settings.ts` change with the whole team, in this feature's branch. The same branch updates docs/plugin: `🗂️` in
file.md, the groups and the mark in screen.md, «Project» and the moves in tasks.md, «Project tag» in settings.md, the
project block, and agents.md (how an agent reads and writes a task's project).

## Decisions

(The frontends write here the gaps they decide.)

Backend (the core's contract):

1. **The field is read anywhere on the line**, like a label: `🗂️ [[Note]]` (with or without the emoji's variation
   selector) is taken out of the text wherever it stands, so no title ever holds it; the core writes it after the labels,
   before `📁` and the other fields. An alias or a heading of the link is dropped (`[[P|p]]` reads as `P`). A plain
   `[[Note]]` without the marker stays text.
2. **One project by name**: a task's project is the link's note name, case aside, as Obsidian resolves a link; a project
   note (from `Projects`) gives it its path and its shortest link. A task's link to an untagged note keeps the name and
   gets no arrow (`canOpenNote` false); its group in Backlog shows only while it has tasks there.
3. **Subtasks**: a task put under another always loses its own field (its parent's counts); a subtask leaving its parent
   (a move, the timeline, a repeat copy) gets the parent's on its line. The search finds a task by its project's name,
   not its subtasks (they show under it).
4. **The places carry the project's part** (`zone`: the link, null for No project) on cards, gaps, `ListPlace`, `DropTo`
   `group`, `NewTaskPlace` and the headers a finger passes; a plain list carries none. A drop or a new task in a part
   with no task to stand before goes right after the last task of that project the column shows in that section, else
   to the section's end. The same rule serves the project's view (every card there carries the project).
5. **A section named in a project's part** (the section button inside a project group, or in a project's view) asks the
   name, then the first task, and writes both in one call (`NewTaskPlace.section`): the heading right after the group
   the field stood in, or the task into that section when the list has it (after the project's last task there). The
   field closes after that first task. Escape, or an empty Enter, after the name writes nothing. No project's part
   follows the same rule (an empty section is made only with grouping off).
6. **Section actions in a group** (`renameGroup`/`removeGroup` with `menu.project`): rename to a new name puts the new
   heading right before the old one with the project's tasks under it; to a name the list has, the tasks join its end;
   the old section left empty goes. Remove takes the project's tasks to the end of No section.
7. **The Project row** is `TaskMenuModel.project` in every menu, one task's and the bulk menu's (not a `MenuEditId`):
   drawn right after Section, or where Section would stand. A subtask's row is disabled and shows its parent's project.
8. **Grouping state** lives on the device as `GroupingState` (`on` per list, `folded` keys per list): the Obsidian
   frontend keeps it through the `GroupingStore` port (its local storage), the door hands it back in `grouping`. Folded
   key: the project's name lowercased, `""` for No project. A found task in a folded group unfolds it (`reveal`).
9. **The project's view** is `tasks.screen(date, project)`: the same lists filtered to the project, empty sections and
   grouping left out, the mark off (`ProjectRef.mark`). A drop in a column without sections (a past day) keeps the
   main screen's rule.
10. **The setting** `projectTag` (`#project`) is stored with its `#`; a note is a project when it has exactly that tag,
    case aside, in properties or text (`projectNotesOf` reads the notes' tags: the Obsidian infrastructure gives each
    note's `getAllTags` with its name, path and `fileToLinktext`). `data.json` gains the key.

iPhone app (the minimum that keeps it from breaking):

11. **The app reads the new fields by leaving them out**: its `Decodable` models (`TaskItem`, `ListGroup`, `GroupMenu`,
    `TaskMenuModel`, `SearchHit`, `ScreenView`, `SettingsForm`) take the keys they know and skip the rest, so
    `TaskItem.project`, `can.setProject`, `ListGroup.header`/`reorder`, `menu.project`, `TaskMenuModel.project`,
    `SearchHit.project`, `ScreenView.projects`/`project` and `projectTag` change nothing it draws; a task goes back to the
    door as it was read (`TaskItem.json`), field and all. Its drops carry no `project` (its cards and headers have no
    zone), so a task keeps its project wherever it is dragged.
12. **The app asks for every list ungrouped**: each call of the main screen hands in `grouping`
    `{ on: { backlog: false, soon: false } }` (`TaskBoard.ungrouped`). Without it the door groups Backlog by default and
    its `screen.offer` gains `projects`, which cut a Backlog card's Section menu (and the bulk menu) to its project
    group's sections. The app draws no groups yet, so its lists and menus stay as before projects; a `grouping` in an
    answer (`tasks.reveal`) is dropped. When the app's groups come, it keeps `grouping` per device as the Obsidian
    frontend does (decision 8).

Obsidian frontend:

13. **The block's place** is where Obsidian puts its own backlinks in the document: in Live Preview right after the
    editor's content (`.cm-sizer`, after `.cm-contentContainer`), in Reading view first in the note's footer
    (`.mod-footer`). One block per Markdown view, moved between the two as the view's mode changes, made when the view
    shows a project note (`projectNotes()` by path) and gone when it does not. Nothing is written into the note.
14. **The block's frame**: a hairline frame with 14 px corners, a paragraph's gap under the note's text (Obsidian's
    `--p-spacing`; Max rejected the board's 44 px plus Live Preview's room past the note's end, which the block now rises
    over), its titles' row 8 px under the top line and its cards 8 px under the titles, its wheel 12 px over the bottom
    line (board Proj4V2), its foot clear of Obsidian's status bar and the phone's navigation at the note's end; as tall as
    the columns in its window need (the taller column's cards and its foot), at least the board's block (321 px) and at
    most `min(640px, 78vh)` (a phone's screen less Obsidian's bars); its lists scroll inside only past that. While the
    calendar is in the window the block is at its tallest (a whole day). It fits again a frame after anything in it
    changes (tasks, the wheel, a field opened), never during a drag. Obsidian's navigation, status bar and keyboard take no
    room from its foot.
15. **The block's foot** holds the wheel and the plus; the undo capsule (Undo, ⋯) stays out, as the board shows. Undo is
    Cmd+Z while the focus is in the block (a tap or click on the block gives it the focus), or the main screen's button.
16. **The block opens at Inbox and Soon** (the board's position); its wheel, divider and zoom are kept per note on the
    device (Obsidian's local storage), its day in memory.
17. **An empty column of the block** shows the dashed No tasks plate of an empty section; a tap on it opens the field at
    the column's end.
18. **A project group's title fades** at its end only when the header cuts it (the board fades only long names); the count
    and the arrow follow the whole title right after it.
19. **Group by project**: a tap on the row switches it and closes the menu, as a pick in Section does.
20. **A task found by its project's name** shows the name, the found part lit, on the line under its title where a
    description's line would stand.
21. **Project on a subtask** is drawn as a dimmed row that can't be pressed (the tiles' off look), its value the parent's
    project. In the bulk menu Project stands right after Section in one group.
22. **The mark on the timeline**: the block's card shows the folder too, after its title and before its time; a tap on it
    opens the note.
23. **Automatically update internal links off**: the Project tag field's description says to turn it on; nothing else
    warns.
24. **«No section» in the block's Backlog** stays as on the main screen (the lead's call: the block thinks like the
    plugin); board Proj4V2 drew it without.
25. **The project note's block behaves as one project group everywhere** (the lead's call): every card, header, plate and
    place in `screen(date, project)` carries the project's zone (`ScreenView.projects`: each list one untitled group,
    `titled` false; `now` is the day column's); section actions there touch only that project's tasks (`menu.project`),
    sections there are not reordered (`reorder` false); the section button there asks the name, then the first task, as
    inside a group (`createSection` with a zoned place writes nothing).
26. **Search opened from the block searches only that project's tasks** (the lead's call): `search(query, project)`.
27. **Inbox and Backlog in the block stack by their cards**, as the board draws them (Inbox's plate, the line, Backlog
    under it), not half and half as on the main screen; at the block's tallest Inbox keeps its cards up to half the column
    and Backlog scrolls in the rest. While the calendar is in the window the block is at its tallest.
28. **The block's place follows its note**: a rename or move of the note (or of its folder) carries the stored wheel,
    divider and zoom to the new path, and the open block stays; a deleted note's place is dropped.
29. **The block follows the view's mode however it changes** (a button, a command, `setState`): it watches its view's
    page, not only Obsidian's layout events.
30. **In a popout window** the screen and the block listen to their own window (keys, presses, visibility, theme), their
    menus and lifted cards open there, and the card size and the priority and label colours are put on every window.
31. **The block's lists end one short step under their last card** (20 px over the wheel's row), not the main screen's
    64 px fade: a block sized to its cards has nothing under the wheel to fade, and the board draws it so.
32. **A task's fields take Obsidian's line commands and do nothing** (the lead's call, after Cmd+L wrote
    `- [ ] - [ ] **word**[]()`): the hotkeys of the commands that change what a line is (checkbox, lists, headings, quote,
    callout, code, math, table, rule, line swap, list indent) are taken in the title's and the description's own editor
    keymap and in their scope, everywhere the fields stand. The core strips a list, checkbox, heading or quote marker from
    a title's start on every write (`taskTitle`); inline marks stay. The Swift app's title field writes through the same
    core, so the guard reaches it too.
33. **Cmd+Z and Cmd+Shift+Z in a plain field** (search, a section's name) undo and redo the field's own text and go no
    further, so the app's Edit menu never hears them.

## Ideas for later

Approved by Max as directions, to be designed one by one after the core.

1. **Projects without a next step.** Once a week the plugin lists the active projects with nothing in the lane: a soft
   «nothing moves on friends, take a step?», never a red «overdue». Keeps long projects from dying quietly in Backlog.
2. **Project status in frontmatter**: active, paused, someday. A paused or someday project stays out of the weekly list.
3. **Agent.** «Look at the friends project and suggest a step for this week»: Claude reads the note and the diary and puts
   one task in Soon, linked to the project. Belongs in `docs/plugin/agents.md` once projects exist.
4. **Sections fold too**, like project groups in Backlog: the same chevron and tap on the title.
