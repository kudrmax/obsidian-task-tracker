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

## Open (being planned now)

- How a project note is recognised (folder, frontmatter, tag).
- How the lane is written on a project task's line (technical, decided by the backend).
- Where the plugin shows projects: a screen of projects inside the plugin or only the notes.
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
