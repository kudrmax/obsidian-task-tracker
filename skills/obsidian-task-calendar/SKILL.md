---
name: obsidian-task-calendar
description: Reads Max's tasks from his Obsidian plugin Task Calendar as JSON, in the plugin's own product words, with the read-only program next to this file. Use for ANY question about Max's tasks, plans, days, week, Inbox, Soon, Backlog, projects or what he is doing — «проанализируй мой день», «что у меня сегодня / завтра / на следующей неделе», «разбери бэклог по проекту X», «что в инбоксе», «какие задачи в процессе», «что повторяется», «найди задачу про …». Never parse `TODOs Tasks.md` yourself to read tasks, and don't use the Obsidian CLI for them.
---

# Max's tasks: `obsidian-task-calendar.mjs`

A read-only program over the plugin's own core, kept here in the vault's `.claude/skills/obsidian-task-calendar/`: the
same lists, days and places Max sees on his screen. It finds the vault it sits in by itself and never changes anything.
The plugin's release puts the current version here; never edit or copy it.

Run it with Node from the vault's root folder; it prints one JSON object (`--pretty` for indented):

```bash
node .claude/skills/obsidian-task-calendar/obsidian-task-calendar.mjs today
```

From another folder, give the program's full path. Start with `help` once if unsure: it lists the commands, the words,
Max's priority levels and labels.

## Commands

| Request | Command |
|---|---|
| «мой день», «что сегодня» | `today` |
| a day | `day tomorrow` (or `YYYY-MM-DD`, `+3`, `-1`) |
| «эта / следующая неделя» | `week this` / `week next`; `week <date> --days N` |
| Soon, Inbox, Backlog | `soon` / `inbox` / `backlog` |
| everything open, to filter yourself | `all` |
| projects | `projects` |
| a project | `project <name>` (`--no-subprojects`, `--done` for its history) |
| search | `search <text>` |
| one task whole | `task <ref>` |

`--project <name>` (or `--no-project`) filters `today`, `day`, `week`, `soon`, `inbox`, `backlog`, `all` exactly like
choosing the project in the plugin's panel. An unknown name answers `unknownProject` with `candidates`: ask Max or take
the obvious one.

## Speak Max's words

Every task has `place`: where Max sees it, never where the file stores it.

- `inbox` — Inbox: not decided when. `backlog` — someday.
- `soon` — the Soon column: not today, no date.
- `today` — today's list or timeline.
- `day` + `date` — a later day. Max sees it **only in that day's column, never in Soon**. Say «на четверг», «на 21
  ноября», never «в Soon», even though the file keeps it under `## Soon`.
- `done` — Done.

- A date is the day Max plans to do it, not a deadline. Nothing is ever overdue: undone tasks move to today by
  themselves. Don't say «просрочено».
- The day starts at `dayStart` (usually 05:00): at 2 a.m. «today» is still yesterday's date. `time.startsAt` is the
  real moment of a slot.
- A day is `list` + `timeline` (tasks on a time); no task is in both. `events` are meetings, read only. A task due one
  day and on another day's timeline shows on both days.
- A past day has no tasks (`past: true`): the file keeps no completion dates. Don't conclude Max did nothing.
- `calendars.alert` not `none`: some calendar is old or broken; an empty day then means «unknown», not «free».
- A folded task (`collapsed`) shows Max only `nextStep` on its card; its `subtasks` are the whole plan, the step marked
  `next: true`. Talk about the next step first.
- `status`: `open`, `inProgress` (a dot on the card), `done`, `wontDo`.
- A description line starting «Контекст:» is what Max himself wrote about the task: trust it over a guess from the title.
- Order inside a list is Max's own; don't re-sort and don't present a sort as his.
- Never quote `ref`s, file sections or JSON field names to Max.
