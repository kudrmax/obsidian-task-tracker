# Projects

Status: brainstorm. The core is being planned with Max; nothing is built yet.

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
6. **Project mark on a card.** A task from a project shows which project it belongs to; a tap opens the project note.
7. **An untaken project task is in Backlog.** Whatever is written in a project note and not taken yet is the project's
   backlog, so the plugin shows it in Backlog, grouped by project. Taking it is the same
   move as for any Backlog task: to Soon, Now, a day or the calendar.
8. **A project task never leaves its note.** Taken, moved or done, its line stays in the project note; the plugin writes
   where it is in the lane on that line. Done, it stays in the note as `- [x]` and leaves the screen like any done task:
   the note keeps the project's history. The general Done of `TODOs Tasks.md` holds only tasks of that file.
9. **A project note is a note tagged `#project`**, anywhere in the vault (Max hardly uses folders). The tag counts in the
   note's properties or in its text; the project's name is the note's name.
10. **No new screen: Backlog is the projects' view.** Backlog is grouped by project, one group per project note; the
    Backlog tasks of `TODOs Tasks.md` are one more group, «No project». A tap on a group's title opens the project note.
    Any overview of projects later (projects without a next step) is a view of this Backlog, never a screen of its own.
11. **A task is put into a project from the plugin.** The task menu has «Project»: picking a project moves the line from
    `TODOs Tasks.md` into that project's note (the end of its `## Tasks`), keeping where it is in the
    lane; «No project» moves it back into the file. The plus on a project group's title in Backlog writes a new task
    straight into that note.
12. **Project tasks live under `## Tasks`.** Only checkboxes in the note's `## Tasks` section (down to the next heading of
    the same or a higher level) are project tasks; every other checkbox is a plain checklist the plugin never reads. A new
    or moved-in task is written at the end of that section; a note without one gets it at its end on the first write.
13. **The lane on a project task's line** uses the existing fields: nothing — Backlog; `📅` — a day, today's date — Now;
    `⏰` (or `🚨`, `📌`, `🔕`) — the calendar. Soon without a date is `🔜` at the end of the line, like the other fields.

## How it is used

1. **Start a project.** A new note «Окружение в новой стране» with `#project`. Write freely: why, thoughts, observations,
   and, under `## Tasks`, the steps that come to mind (`- [ ] Сходить на языковой обмен`).
2. **See it in the plugin.** Backlog shows a group «Окружение в новой стране» with those steps, beside the other projects
   and «No project».
3. **Take a step.** Drag «Сходить на языковой обмен» from its group to Soon, Now, a day or the calendar, as any Backlog
   task. On its card the project mark says where it comes from; a tap on the mark opens the note.
4. **A thought on the run.** Into Inbox as always; at the next review, the task menu → «Project» → «Окружение…»: the task
   moves into the note.
5. **Done.** The task leaves the screen; in the note it stays as `- [x]`, the project's history.

## Open (being planned now)

- How the sections of `TODOs Tasks.md`'s Backlog sit inside the «No project» group.
- How Backlog grouped by project looks, and the project mark on a card: boards, phone and desktop, dark and light.
- What the project mark on a card looks like, on the phone and the desktop.
- How the iPhone app reads tasks spread over many files.

## Ideas for later

Approved by Max as directions, to be designed one by one after the core.

1. **Live block in the project note.** Under the free text: what is in work now (Now, Soon with dates) and what is done.
   The note becomes the project's control panel.
2. **Projects without a next step.** Once a week the plugin lists the active projects with nothing in the lane: a soft
   «nothing moves on friends, take a step?», never a red «overdue». Keeps long projects from dying quietly in Backlog.
3. **Project status in frontmatter**: active, paused, someday. A paused or someday project stays out of the weekly list.
4. **Agent.** «Look at the friends project and suggest a step for this week»: Claude reads the note and the diary and puts
   one task in Soon, linked to the project. Belongs in `docs/plugin/agents.md` once projects exist.
