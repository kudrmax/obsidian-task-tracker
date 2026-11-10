# Projects polish

Status: approved by Max on 2026-11-10 (the list below; he rejected hiding the folder mark inside a project's group:
without grouping he must still see a task is a project's). The bigger rethink of how projects are used is a separate
spec, drawn on boards first.

Builds on `2026-11-07-projects-design.md`; where they disagree, this one wins.

## What Max gets

1. **Project in the quick entry**, in the plugin and the app, everywhere the bar over the field stands: the field in a
   list, the field on the calendar (a slot) and Rename (the card turned into a field). A Project button with the folder
   symbol stands on the bar right after the priority's flag. Its page is the task menu's Project page: the project
   notes by name, No project last, the current one ticked, and «New project…» (point 6). The chosen project shows on the
   button as the flag shows a chosen priority (the accent). The field opened inside a project group or in a project's
   view starts with that project chosen; Max can change it. The written line gets that project's `🗂️`.
2. **The field keeps its project when Place changes it.** Today a field opened in the group «Дружба» moved by Place to
   another list writes a task without a project. The project is the field's own choice, like its labels: Place moves
   the field, the project stays; in a grouped list the field goes to the end of that project's part.
3. **Project in the app's New Task sheet** (the plus's tap): a Project row under List, a stock iOS menu with the same
   page as point 1. The sheet opened from a project's view starts with that project (today the plus there writes a
   task without it and the task vanishes from the view it was made in).
4. **The folder mark is as narrow as its symbol** and stands at the card's right edge like the description and repeat
   marks, not in a column as wide as a date. Plugin: its width is the icon's (16 px), the card's own gap to its
   neighbours; the tap target stays as large as today (it may lie over the title's faded end). App: the same, the
   glyph's width in layout, the tap target 24 pt plus 3 pt each side as before (decision 40), drawn over the title's
   end. The mark stays everywhere it is today, in grouped lists too.
5. **Grouped Soon shows every project**, as Backlog does: a project with no task in Soon has its group with «No tasks»,
   so the plus or a task can be dropped into it. (Rules for the core 5 and Backend decision 2 of the projects spec
   change accordingly.)
6. **«New project…»** on every Project page (the task menu, the bulk menu, the quick entry's button, the New Task
   sheet): it asks the name; Enter creates a note of that name at the vault's root with the project tag in its
   properties (`tags:` list, the tag without `#`), and gives the task(s) that project at once. A name a note already
   has: that note gets the tag instead (its properties' tags, the rest untouched) and it becomes the project. Empty or
   Escape: nothing. The core gives the note's path and text (or the change to an existing note's properties); the
   hosts only write the file. In the app the note is written through the vault's bookmark, coordinated, and the project
   list refreshes at once.
7. **The full screen shows the task's project**: a line under the title, the folder symbol and the project's name in
   the caption colour, as a search hit's project line; a tap on it opens the project (plugin: the note; app: the
   project's view). A subtask shows its parent's project. No project: no line.
8. **Docs**: `docs/plugin/tasks.md` (quick entry's Project, the full screen's line and its menu's Project),
   `screen.md` (Soon's empty groups, the mark), `app.md` (the New Task sheet's Project, the same), `capture.md`
   (captures and Siri get no project, as they get no label).

## Not in this round

Siri, Shortcuts and the voice capture setting a project (they set no label or priority either).

## Decisions

(The agents write here the gaps they decide.)

Backend (the core's contract):

1. **The field's project is its own choice** (`EntryField.project`, the link; null for none), like its labels: it starts
   with the project of the group the field opened in, of the project's view, or of the renamed task; Enter's next field
   keeps it (it is the place's, not the line's); Escape drops it with the field. `EntryState.project` is the button
   (`EntryProject` `{ page, lit }`): `page` the task menu's Project page, `lit` while a project is chosen.
2. **No Project button for a subtask's field** (new, renamed, or in a menu's stack) nor for a section's name: the bar has
   no Place there either, and a subtask's project is its parent's. A slot's field and a rename of a top-level task have it.
3. **A project picked in a list drawn by project** moves the field to the end of that project's part, as Place does; a
   list that draws no part of it yet (a project just made by New project…, Soon's No project without a task) leaves the
   field where it is until the list draws one: then the field goes to the end of that part, whenever it appears (the
   field's first task there drawn, the project's group showing up in any drawing; `listEntry` and `shown` move it), but
   not while a line entered at the field still waits to be drawn. A rename's field never moves: the task keeps its place
   in the lane, as with the menu's Project.
4. **The project travels as the task's own**, `createInPlace`'s and `createWithId`'s sixth argument (`project`), apart
   from `NewTaskPlace.project`, which then only places the task. So Place to an ungrouped list keeps the list's end (no
   jump after the project's last task there) and still writes the project. A subtask's place takes none (the entry hands
   five arguments there). A rename writes it through `TaskDraft.project` (only when it changed).
5. **«New project…» is `MenuProject.newLabel`** on every Project page, in every model that has one (task menu, bulk
   menu, quick entry, New Task sheet). The plugin calls `TaskService.newProject(name, keys)` (the note through the
   `NoteFiles` port, then `setProject` in one more write; `keys` empty for the field, which then takes the answered
   `link` by `setProject`); the app asks `notes.newProject(name, notes)` and `notes.projectText(text)`, writes the note
   and calls `tasks.setProject`.
6. **The note's name** is the typed name trimmed, without what a file name or a link may not hold
   (`\ / : * ? " < > | # ^ [ ]`) and leading dots; nothing left: nothing written. «The same name» is a markdown note of
   that name, case aside, the one nearest the vault's root when several; its link is the one Obsidian would write.
7. **The tag goes into the properties' `tags` without `#`**: appended to a list, into a `[a, b]` flow list, a plain value
   turned into a list, `tags:` added as the last property, or properties made first for a note without them. A note that
   has the tag already (properties or text) is left untouched.
8. **Grouped Soon** gets a group for every project note, as Backlog; **No project's** group there keeps its rule (only
   with a task or an empty section): an empty Soon still offers the title drop and the projects' plates.
9. **The New Task sheet** asks `capture.project(chosen)` for its row (the same `EntryProject` as the bar), starts with
   `ScreenView.project?.link` of the view it was opened from, and writes by `capture.add(list, typed, recording, tag,
   project)`: last in the list, the project on the line.
10. **The full screen's line** is `FullTree.project` (a subtask's: its parent's); a tap opens `note` in the plugin (while
    `canOpenNote`), `tasks.screen(date, link)` in the app.
11. **Point 4 (the narrow mark)** needs nothing of the core.

Swift (the iPhone app):

18. **Swift: «New project…» asks by a stock alert**, as New Section does: «New Project», the field «Name», Cancel and
    Create (Create off while the name is empty), the note «A note of this name becomes the project.», no autocorrection (a name is written as typed). The row stands last
    on every Project page in its own group with the plus, as New Section… on the Section page. Cancel changes nothing; from
    the quick entry's button the field keeps its text and takes the keyboard back after the alert (the plugin's 14 in the
    iOS way: a system menu can't hold a field, so the name is asked over it).
19. **Swift: the New Task sheet's Project row** is a card row under the list's picker: the folder and «Project» on the
    left, the value with the up-down chevrons on the right (the stock menu picker), in the accent while a project is
    chosen and the secondary colour for No project. The sheet keeps the project for the next task after Add, as it keeps
    the list.
20. **Swift: the New Task sheet opens from the screen on top**: over a project's view it is that view's sheet, so it
    starts with that project (before, the main screen under the view answered the plus and the sheet had none).
21. **Swift: the full screen's project line** is the parent line's look (subheadline, secondary, the folder), one line cut
    at its end (the plugin's 15). A tap opens the project's view; on a full screen opened inside that project's own view it
    goes back to the view. A project whose note can't be opened takes no tap, as the card's mark.
22. **Swift: the narrow mark** is the glyph's own width in the row; its button keeps decision 40's 24 + 3 + 3 = 30 pt,
    centred on the glyph, over the title's faded end.
23. **Swift: after «New project…» from the quick entry the lists are read again before the field takes the project**, so
    in a list grouped by project the field moves to the new project's (empty) group at once.
24. **Swift: a card's open menu follows only its own screen's drawings.** A card of the main screen under a project's
    view drew the same task with the folder mark, and the open menu's card in the view took that drawing (the mark showed
    in the project's own view while its menu was open).
25. **Swift: the note New project… writes is a project at once.** The app knows it from `notes.newProject` and puts it in
    the project list itself; no scan of the vault is waited for (a first scan of thousands of notes takes tens of
    seconds). The note stays in the list until a scan has listed its path, so a scan begun before the write never takes
    it away.
