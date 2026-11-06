# Projects

Status: planned with Max; nothing is built yet.

## Why

The plugin works for small tasks. Anything big (be happy, build a circle of friends after moving to a new country) gets lost:
a line in Backlog that means nothing, sections that live one day, and no place for the notes and thoughts that come before
an action. A project is not a list of tasks and is never taken into work as a whole: some of its steps wait for months, some
are being done now, a small one is done at once, a multi-step one goes to Soon, and they are spread over time differently.

## Decided

1. **There are tasks and projects, nothing else.** No areas, goals or other levels. «Be happy» is a project like any other.
2. **No nesting in the plugin.** Projects are flat: a task belongs to the project whose note it is written in. If Max
   thinks of one project as part of another and links their notes, that is his notes' business; the plugin ignores it.
3. **A project is a note in the vault.** The note holds free text (why, thoughts, observations) and the project's tasks,
   written right in the note.
4. **The plugin reads tasks from project notes too**, not only from `TODOs Tasks.md` (as the Tasks plugin does). This
   changes the principle «everything the plugin knows is in one file»: open questions below.
5. **A project's step is never «the whole project in Soon».** Each task of a project moves through the lane on its own,
   or stays in the note untaken.
6. **Project mark on a card**: a folder icon in the caption colour at the right of the card, in the date's place and of
   its width; the card's height does not change. A tap on the icon opens the project note, a tap on the rest of the card
   opens the menu as always. The project's name is in the task menu («Project») and, on the Mac, in a tooltip on hover.
   Board: `docs/design/canvas/Proj2V1.dc.html`.
7. **A project note has the same sections as `TODOs Tasks.md`**: Inbox, Now, Soon, Backlog, Done, with the same
   meaning and the same rules, reused one to one (the morning rules, sections inside them, subtasks, descriptions). A
   project task's place in the lane is the section it stands in, exactly as in the file; no new field. The Backlog column
   shows each project's Backlog as its group; a project's Inbox, Now and Soon tasks are in those columns with the mark.
8. **A project task never leaves its note.** Moved through the lane, it moves between the note's sections; done, it goes
   to the note's Done and leaves the screen like any done task: the note keeps the project's history. The general Done of
   `TODOs Tasks.md` holds only tasks of that file.
9. **A project note is a note tagged `#project`**, anywhere in the vault (Max hardly uses folders). The tag counts in the
   note's properties or in its text; the project's name is the note's name.
10. **No new screen: Backlog is the projects' view.** Backlog is grouped by project, one group per project note; the
    Backlog tasks of `TODOs Tasks.md` are one more group, «No project», always last. A group is the section header with
    two additions: it folds (a chevron; a tap on the title folds or unfolds it, the fold is kept on the device; folded, it
    shows how many untaken tasks it holds) and an arrow button beside the title opens the project note. Board:
    `docs/design/canvas/Proj1.dc.html`.
    Any overview of projects later (projects without a next step) is a view of this Backlog, never a screen of its own.
11. **A task is put into a project from the plugin.** The task menu has «Project»: picking a project moves the line from
    `TODOs Tasks.md` into the same section of that project's note (Inbox to Inbox, Now to Now…), keeping its
    place in the lane; «No project» moves it back into the file. A project group has no plus of its own: the plus at the bottom right,
    taken to a project group (the way it is taken to any place), writes the new task into that project's note.
    Everything inside a project group is that project's: tasks, their subtasks and descriptions.
12. **A lane section is any H2 with its name, anywhere in the note**: `## Inbox`, `## Now`, `## Soon`, `## Backlog`,
    `## Done`, in any order, between Max's own headings, under an H1 of his or not. It lasts to the next heading of level
    1 or 2. A checkbox outside these sections is a plain checklist the plugin never reads. A section the plugin needs and
    the note lacks is added at the note's end when it first writes there.
13. **«No project» keeps the file's Backlog as it is**: its sections show inside the group as they do in Backlog today.
14. **Sections are shared by name across files.** «Evening» on the screen is one section for every file: a project task
    dragged into it is written under `### Evening` in its note's section, and shows in the same «Evening» as the tasks of
    `TODOs Tasks.md`, with the mark. The section rules are reused as they are, per file: a section emptied in a file goes
    from that file.

## How it is used

1. **Start a project.** A new note «Окружение в новой стране» with `#project`. Write freely: why, thoughts, observations;
   the steps go into its Backlog section.
2. **See it in the plugin.** The Backlog column shows a group «Окружение в новой стране» beside the other projects and
   «No project».
3. **Take a step.** Drag it from the group to Soon, Now, a day or the calendar, as any Backlog task: the line moves to that
   section of the note. Its card has the project mark; a tap on the mark opens the note.
4. **A thought on the run.** Into Inbox as always; the task menu → «Project» → «Окружение…» moves it into the note's
   Inbox. Or the plus taken to the project's group writes it straight into the project.
5. **Done.** The task leaves the screen and goes to the note's Done: the project's history.

The task menu's «Project»: board `docs/design/canvas/Proj3Flow.dc.html` (approved).

## Open (technical, for the backend)

- How the iPhone app reads tasks spread over many files.
- Order inside a column or section when its tasks come from several files (being decided with Max).

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
