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
3. **Every task stays in `TODOs Tasks.md`.** One file, as now: the lane, order, sections, the morning rules and the
   iPhone app work unchanged. A project's tasks are lines of this file like any other.
4. **A project is a note tagged `#project`**, anywhere in the vault (Max hardly uses folders); the tag counts in the
   note's properties or in its text. The note holds free text: why, thoughts, observations. The project's name is the
   note's name.
5. **A task belongs to a project by a link to its note** at the end of the line: `- [ ] Сходить на языковой обмен
   [[Окружение в новой стране]]`. A wikilink, so Obsidian keeps it right when the note is renamed. One project per task;
   a subtask or a description belongs to its parent's project.
6. **A project's step is never «the whole project in Soon».** Each task of a project moves through the lane on its own;
   untaken ones wait in Backlog.
7. **Project mark on a card**: a folder icon in the caption colour at the right of the card, in the date's place and of
   its width; the card's height does not change. A tap on the icon opens the project note, a tap on the rest of the card
   opens the menu as always. The project's name is in the task menu («Project») and, on the Mac, in a tooltip on hover.
   Board: `docs/design/canvas/Proj2V1.dc.html`.
8. **No new screen. Grouping by project is a way to show a list**, the same everywhere it is on: the list shows project
   groups (each the section header with two additions: it folds — a chevron, a tap on the title, the fold kept on the
   device, folded it shows how many tasks it holds — and an arrow button beside the title opens the project note), then
   «No project», always last. Inside a group, the project's tasks without a section, then its sections in the file's
   order. Off, the list is as today, project tasks with the mark. Projects never go inside sections. Board:
   `docs/design/canvas/Proj1.dc.html`. Backlog and Soon have it (on by default in Backlog, off in Soon,
   switched per list and kept on the device); Inbox, Now and the day columns never group by project. Any overview of projects later (projects without a next
   step) is a view of these groups, never a screen of its own.
   - **The file does not change.** A section is one `### Name` for every project: with grouping on, «Дальний бэклог»
     shows inside each project that has tasks in it, and inside «No project»; off, it is one section with all of them.
   - **Moving a task** in the grouped view: the line goes under the target section (or into the list's part without a
     section) right before the visible task it was dropped before, or right after the last visible task of that project
     there; with none, at the section's end. Into another project's group — the link changes; into «No project» — the link
     goes. Subtasks go with their parent and are always in its project.
   - **Section actions in the grouped view touch only that project's part.** Rename inside «Окружение» moves Окружение's
     tasks into a section with the new name (an existing one or a new heading); the other projects keep theirs. Remove
     section takes only Окружение's tasks out of it. Sections are reordered only with grouping off. An empty section is not
     made inside a project: the section button's field inside a project group writes the task straight into the new
     section, so the section is born with a task of the project.
9. **A task is put into a project from the plugin.** The task menu has «Project»: picking a project writes its link on
   the line, «No project» takes it off; the task keeps its place in the lane. Board:
   `docs/design/canvas/Proj3Flow.dc.html` (approved). A project group has no plus of its own: the plus at the bottom
   right, taken to a project group (the way it is taken to any place), writes the new task in Backlog with that project's
   link.
10. **Done stays in the file's Done**, with its link: a project's history is its done tasks with the link.

Rejected on the way: tasks written in the project notes, read from many files. It broke manual order (two files have no
common «above»), sections shared across files and the one-file iPhone app; moving a taken task into the file and back
fixed that but made lines travel between files. One file wins.

## How it is used

1. **Start a project.** A new note «Окружение в новой стране» with `#project`. Write freely: why, thoughts, observations.
2. **Give it steps.** Take the plus to the project's group in Backlog and write the steps; or, at an Inbox review, the
   task menu → «Project» → «Окружение…».
3. **Take a step.** Drag it from the group to Soon, Now, a day or the calendar, as any Backlog task. Its card has the
   project mark; a tap on the mark opens the note.
4. **Done.** The task leaves the screen and goes to Done with its link.

## Open (technical, for the backend)

- Where the switch of grouping is: board.
- The project note's live block: what it holds, how it looks, the order rule (proposed: a move or a new task goes next
  to the visible neighbour, as in the grouped view).

## Ideas for later

Approved by Max as directions, to be designed one by one after the core.

1. **Live block in the project note.** Under the free text: what is in work now (Now, Soon with dates) and what is done.
   The note becomes the project's control panel.
2. **Projects without a next step.** Once a week the plugin lists the active projects with nothing in the lane: a soft
   «nothing moves on friends, take a step?», never a red «overdue». Keeps long projects from dying quietly in Backlog.
3. **Project status in frontmatter**: active, paused, someday. A paused or someday project stays out of the weekly list.
4. **Agent.** «Look at the friends project and suggest a step for this week»: Claude reads the note and the diary and puts
   one task in Soon, linked to the project. Belongs in `docs/plugin/agents.md` once projects exist.
5. **Sections fold too**, like project groups in Backlog: the same chevron and tap on the title.
