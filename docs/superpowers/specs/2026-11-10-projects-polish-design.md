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
