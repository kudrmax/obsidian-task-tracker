# obsidian-task-calendar: the tasks for an agent, in product words

Status: lead's spec, 2026-11-18, after two reviews (core, agent's side). Read only. The Mac (any agent session on it);
no screen, no Obsidian needed.

## Why

Max asks agents «разбери мой сегодняшний день», «что у меня на следующей неделе», «что в бэклоге по проекту X». Today an
agent reads `TODOs Tasks.md` and redoes what the core does: which tasks are today, what the Soon column holds, which
subtask is a folded task's next step. It gets it wrong where the file and the product differ, the main case: a task
dated three days ahead lies in the file's `## Soon`, but it is **not** in Max's Soon (the Soon column shows only tasks
without a date); it is a task of that day.

So agents get a command line program that answers in JSON, in the words of the screen, computed by the very core the
plugin and the iPhone app draw from. A change to how the core shows a list (Backlog, Soon, a day, a project) reaches the
program with no change in it.

## The one rule: no second copy of any logic

- The program is a **frontend**, like `obsidian/` and `apple/`: it turns argv into calls and prints answers. It decides
  nothing.
- Every answer is built in `core/application` from **the same reads the screens use**. The new agent module only maps
  their results into the JSON shape below: it never filters, sorts, groups, dates or places tasks itself.
- A read a screen today builds in its own code moves into `application` as a service read, and **the screens switch to
  it in the same feature**: one copy, used by the plugin, the app and the program. That is part of this work, not a
  side effect (below, «Core changes»).
- Guards keep it so (Tests).

## What an agent sees

`obsidian-task-calendar <command> [options]`. Every answer is one JSON object on stdout, exit code 0. A failure is
`{ "error": { "code", "message", "candidates"? } }` on stdout, exit code 1. Codes: `tasksFileMissing`,
`unknownCommand`, `badArgument`, `unknownProject` (with `candidates`: the closest project names), `staleTask`,
`unknownTask`.

Common options:

- `--vault <path>`: the vault, `~/Obsidian` by default. The tasks file and calendars are found from the plugin's
  `data.json` there, as the plugin finds them; without `data.json`, the plugin's defaults (as the plugin itself runs).
- `--project <name>` on `today`, `day`, `week`, `soon`, `inbox`, `backlog`, `all`: the screen's project filter, exactly
  as a project chosen in the panel, subprojects included; `--no-subprojects`: the Subprojects tick off (no-op for a
  project without subprojects). `--no-project`: the panel's «No project». The name is matched as the core matches
  project names; an unknown one is `unknownProject`, never an unfiltered answer.
- `--pretty`: indented JSON (default: one line).

### Commands

| # | Command | Answers |
|---|---|---|
| 1 | `today` | the day as Max sees it at Now–calendar: the day's list in its sections, the timeline, the day's meetings |
| 2 | `day <date>` | the same for one day; `<date>`: `YYYY-MM-DD`, `today`, `tomorrow`, `yesterday`, `+N`, `-N` |
| 3 | `week [this \| next \| <date>] [--days N]` | `day` for each day: `this` / `next` = Monday to Sunday of this / next week; a date = N days from it (7 by default); nothing = 7 days from today |
| 4 | `soon` | the Soon column in its sections |
| 5 | `inbox` | Inbox in its sections |
| 6 | `backlog` | Backlog in its sections |
| 7 | `all` | every open task exactly once, flat, in funnel order: Inbox, Backlog, Soon, today, then later days by date |
| 8 | `projects` | the whole tree: every project with its path, folder or not, status, attached note |
| 9 | `project <name> [--no-subprojects] [--done]` | the project «By project»: its own tasks, then a part per subproject, each task with its place; `--done`: also its history, the closed tasks |
| 10 | `search <text>` | the plugin's search, Done included as in the plugin, best first |
| 11 | `task <ref>` | one task whole: description, every subtask at every depth (closed ones too), where it is stored |
| — | `help` | the commands, the words below, and Max's priority levels and labels in their order, with what the Skip label and the Best task label mean |

### Words

Every task carries `place`, where Max sees it, never the file's section:

| `place` | Meaning |
|---|---|
| `inbox` | Inbox |
| `backlog` | Backlog |
| `soon` | the Soon column: no date |
| `today` | today's list or timeline (the file's Now; the screen's header says Today) |
| `day` | a later day, given in `date`: Max sees it only in that day's column, **never in Soon**; say «на четверг», not «в Soon» |
| `done` | Done (in `search`, `task`, `project --done`) |

`today` is the one word for today everywhere, the search groups included. `help` and the skill say the `day` line in
these words.

Status: `open`, `inProgress`, `done`, `wontDo` (the core's `todo`, `inProgress`, `done`, `cancelled`).

### A task

```json
{
  "ref": "opaque token",
  "title": "Написать отчёт",
  "status": "inProgress",
  "place": "today",
  "date": "2026-11-18",
  "due": "2026-11-20",
  "time": { "start": "14:00", "end": "15:30", "startsAt": "2026-11-18T14:00", "durationMin": 90, "passed": false },
  "reminder": "lockScreen | notification | alarm | none",
  "section": "Evening",
  "projects": ["Отчёты"],
  "priority": { "name": "p1", "rank": 1 },
  "labels": ["home"],
  "repeat": "Every 3 days after done",
  "description": "markdown",
  "progress": { "done": 1, "total": 3 },
  "collapsed": true,
  "nextStep": { "ref": "…", "title": "Собрать цифры", "path": ["Подготовить отчёт", "Собрать цифры"] },
  "subtasks": [ { "…the same shape, without place, date, projects": "", "next": true } ]
}
```

- A field without a value is left out.
- `ref`: an opaque token (the task's key, encoded) for `task <ref>`; never contains a list's name. Resolved by the core's
  `find`: a task that moved is still found while its line is unique; not found: `staleTask`; not a token: `unknownTask`.
  Refs go stale when the file or the day changes: read again.
- `date`: **the day Max sees the task on** (always for `today` and `day`). `due`: the due date, only when it differs.
  A date is a plan, not a deadline; nothing is overdue.
- `time`: the slot. `startsAt` is the full moment, so a slot past midnight (the day runs from the start hour, 5:00, to
  5:00 next morning) is never put on the wrong night. `passed`: the task rides the now line, as the core judges it
  (an open task of today whose start has passed).
- `reminder`: only with `time`.
- `projects`: on tasks only; a subtask belongs to its task's.
- `priority.rank`: 1 is the highest, in the settings' order.
- `repeat`: the screen's words for the rule.
- `collapsed` + `nextStep`: a folded task and the step its card shows, at any depth (`path`: the titles down to it).
  Max sees the card, and its timeline block, as the step, with the task's title small above; Done closes the step.
  `subtasks` still lists the open subtasks, the step marked `next: true`, so the plan is whole and nothing is counted
  twice. `progress`: the card's counter.
- `subtasks`: open ones, nested; in `task`, all of them with their status.

### Answers

- **A list** (`soon`, `inbox`, `backlog`): `{ "list": "soon", "sections": [ { "name": "Morning" | null, "tasks": [...] } ] }`.
  Sections in the order the column draws them; an empty section stays, with `tasks: []` (Max made it ahead).
- **A day**:
  ```json
  {
    "date": "2026-11-18", "weekday": "Wednesday", "relation": "today | tomorrow | yesterday | past | future",
    "dayStart": "05:00", "now": "2026-11-18T13:05",
    "list": { "sections": [ ... ] },
    "timeline": [ task, ... ],
    "events": { "allDay": [ { "title", "calendar" } ], "timed": [ { "title", "start", "end", "startsAt", "endsAt", "calendar", "passed" } ] },
    "calendars": { "alert": "none | old | broken", "sources": [ { "source": "google | iphone | work", "tone": "plain | old | broken | spare", "words": "…" } ] }
  }
  ```
  The day is `list` + `timeline`; no task is in both. `list` is the day's column, `timeline` the tasks on a time in the
  core's order (by start). `now` only for today. `calendars` as the sources window gives it, unfiltered; the program
  never calls Google, so `google` may read old where the running plugin would have refreshed it. A source that doesn't
  reach the day means «unknown», not «free».
  A **past day** has `"past": true`, no `list` and no `timeline`, and a `note`: what wasn't done moved to today, and the
  file keeps no date of completion. Its events stay.
- **`week`**: `{ "days": [ day, ... ] }`.
- **`all`**: `{ "tasks": [ ... ] }`, every open task once.
- **`projects`**: `{ "projects": [ { "name", "path", "depth", "folder", "status": "active | waiting | done", "note"? } ], "noProject": { "openTasks": bool } }`
  in the tree's order, done projects last, nothing folded away.
- **`project`**: `{ "project": { "name", "folder", "status" }, "parts": [ { "kind": "own | subproject | done", "title"?, "path", "tasks": [...] } ] }`;
  in a part the tasks in By project's order (Inbox, Backlog, Soon, today, later days; file order inside). A done project:
  its closed tasks. A folder with `--no-subprojects` is empty by design; `folder: true` says why.
- **`search`**: `{ "query", "groups": [ { "list": "inbox | backlog | soon | today | done", "tasks": [...] } ] }`. A group is
  the list the task is stored in; each task's `place` says where Max sees it.
- **`task`**: `{ "task": task, "stored": { "section": "Soon", "line": "- [ ] … 📅 …" } }`. `stored` is for editing the
  file by `docs/plugin/agents.md`'s recipes only, never what to tell Max.

An empty tasks file is no error: every list is empty.

## Core changes (one copy for all three frontends)

The reviews found reads the screens build in their own code. Each becomes a core read, and the screens move to it:

1. **A column's sections.** Today `columnSections` → `screen.sections[list]` → `listView` is chained in Obsidian
   (`ui/layouts/FunnelLists.ts`, `ui/TaskList.ts`, `ui/CalendarScreen.ts`, `ui/DayPeek.ts`) and again in Swift
   (`apple/Core/.../BoardSnapshot.swift`). New: one read giving a column's grouped list (Inbox, Backlog, Soon, a day's
   list) with the filter, in `listView`'s order, empty sections in it. Obsidian and Swift use it; so does the program.
2. **A task's place.** New: one read `placeOf(item)` giving Inbox, Backlog, Soon, today, a day with its date, or Done,
   agreeing with By project's stage mark (`stageMark`), which then uses it.
3. **A slot after midnight** (a bug, today on every screen): `dayOfTask` takes a slot's calendar date, while the
   timeline places a slot by the day boundary (`dayOfSlot`). A task at 00:30 on the night after the 18th stands on the
   18th's timeline but `screenOf` says the 19th (where search and «find» open it). `dayOfTask` follows the boundary.
4. **Riding the now line.** The timeline's slotted tasks come with `ridesNow` from the core (today it is worked out only
   inside the drop landing); `passed` is that.
5. **A project by name.** New: `projectNodeNamed(name)`: the node, or null for a name the tree lacks; the program's
   `unknownProject`.
6. **Every open task once**, in funnel order, with the filter: a new read for `all`.
7. **Weeks and dates for the program**: `DayService` gives a week's days (this, next) and parses `+N` etc. through its
   existing `step`, so no date logic is written in the agent module.

`soon`, `inbox`, `backlog` with a filter read through the filtered screen read, never the unfiltered `*View` reads.

## How it is built

- **Core** (`core/application/agent/`, `backend`): `AgentReads`, one method per command, returning the wire types
  (`agentWire.ts`). It imports `contracts.ts` only. Composed in `composeCore` as `core.agent`. New reads go into
  `contracts.ts` (added; nothing existing changes shape).
- **Frontend** (`agent/`, new top-level folder like `obsidian/`, owner `backend`): two layers, like Obsidian's
  `compose.ts` + `infrastructure`:
  - `agent/nodePorts.ts`, `agent/compose.ts`: the ports over Node's `fs`: the tasks file, `data.json` (`settingsFrom`,
    as `obsidian/settingsFile.ts`), the calendar files (`calendarPath`, `readCalendarFile`), the clock, Node timers
    (`Timers` wants numbers), memory for the device's Projects state (`subprojects` as asked, `doneOpen: true`,
    nothing folded), a `Projects` port that is never ready (no notes here, so the old project move never runs from the
    program), no feeds, `isPhone: false`. These may import those core modules.
  - `agent/main.ts`: argv → `core.agent` → stdout. Imports `contracts.ts` only.
  - `agent/build.mjs` (esbuild, like `core/build.mjs`) builds `agent/obsidian-task-calendar.mjs` with
    `#!/usr/bin/env node`, committed; `npm run build` runs it.
  - Calendar reads: in a fresh process the cache is empty, so the program awaits the fresh read.
- **Read only, for sure**: the tasks file port never touches the disk. `screen`, `projectsScreen` tidy first
  (`normalize` → `write`): the port's `write` applies the change to the text in memory only, so later reads in the run
  see the file as the plugin would, and the disk stays. `create` throws; the settings port's `update` throws;
  `setShown` is never called. Nothing subscribes, so no ticker or timer keeps the process alive.
- **Install**: `~/.local/bin/obsidian-task-calendar` is a symlink to the main clone's `agent/obsidian-task-calendar.mjs`
  (`~/.local/bin` is on PATH). The main clone is on master, so a merge is the install; no plugin release is needed for
  it. The release script is not touched.
- **For agents**: a skill `~/.claude/skills/obsidian-task-calendar/SKILL.md` (the home config repo; read
  `~/.github/CLAUDE.md` first): for any question about Max's tasks, days, projects; the commands; the `place` words;
  never parse the file to read. `docs/plugin/agents.md` «Как читать» points to the program, the file recipes stay for
  writes. `docs/plugin/README.md`: «Для агента» names it, and the «Слова» row for Soon says a dated Soon task is seen
  only on its day. `CLAUDE.md` lists `agent/` as a frontend (owner `backend`; no visual check, it has no screen).

## Tests

- `tests/agent/answers.test.ts`: a fixture (tasks in every place, a task dated three days ahead in `## Soon`, an empty
  section, a folded task with a deep step, subtasks, a repeat, labels and a priority, a task with two projects,
  projects with a subproject, a folder and a done project, a slot that has started, a slot at 00:30 after midnight, a
  slot on a day other than its due date) with a fixed clock and settings: each command's answer. Must hold: the dated
  Soon task is in `day` of its date and in no `soon`; `today` at 02:00 is yesterday's date; the 00:30 slot is on the
  previous day's timeline with `startsAt` the next date; a past day is `past` with no tasks; the two-project task is
  once in `all`; no ref holds a list's name; `project --done` holds the history; an unknown project is
  `unknownProject`.
- `tests/agent/readOnly.test.ts`: a file that needs normalizing: every command leaves the tasks file and `data.json`
  byte for byte.
- `tests/agent/sameAsScreen.test.ts`: for the fixture, each list's sections and tasks equal the new column read, which
  the Obsidian screen and the app use (and their own tests check), and each task's `place` equals `placeOf`.
- `tests/architecture.test.ts`: `agent/` added to the guarded sources; `core/application/agent/` and `agent/main.ts`
  import `contracts.ts` only; `agent/nodePorts.ts`, `agent/compose.ts` as `obsidian/compose.ts`. `tests/uiDecides.test.ts`
  extended to `agent/` and `core/application/agent/`.
- `tests/agent/build.test.ts`: the committed `agent/obsidian-task-calendar.mjs` is the build of the current source.
- The core changes keep the plugin and the app as they are, but for the bug in 3: their own tests, `npm run
  test:apple`, and a look at the screen in the test Obsidian (phone and desktop) and in the simulator, because both
  frontends now take their column lists from the new read.
- By hand before merging: every command against a scratch vault with a copy of Max's tasks, settings and calendars,
  checked against the plugin's screen on the same vault in the test Obsidian.

## Not now

- Writing (add, done, move): a later step, through the same `TaskService` writes.
- An MCP wrapper over `AgentReads`.
- Done history by date (the file keeps no date of completion).

## Decisions

(Filled in while building: each gap a builder decides, in one line.)

Backend (2026-11-18):

1. The column read is `TaskService.columnView(screen, column)` → `ColumnList` (`listView`'s `{ showsHeaders, groups }` plus `sections`, `columnSections`' answer): it reads a screen the frontend already has (`ColumnSource`, a `screen(date, filter)` or `firstStepScreen` answer), so it carries that screen's filter and reads no file. Door: `tasks.columnView`.
2. `placeOf(item)` is `Promise<TaskPlace>` (`{ kind: inbox | backlog | soon | done }` or `{ kind: today | day, date }`): it reads the file for a subtask's task, as `screenOf` does. One rule, `placeOfTask`, gives it and By project's stage mark.
3. A task stands on its slot's day before its due date (`dayOfTask`'s order): a task due on the 20th with a slot on the 22nd is placed on the 22nd, its `due` the 20th. By project's stage mark now shows such a task's slot day (it showed the due date). The screen still shows it in the 20th's list and on the 22nd's timeline.
4. `dayOfTask` takes the day's boundary and every caller passes it (`TaskItem.day`, `screenOf`, `reveal`, `placeOf`, the menus' Today/Tomorrow, `itemsAt`, which passed none).
5. `ridesNow(item, day)` is sync on `TaskService` (`TimelineSpans.ridesNow`); `landing`'s `ridesNow` is the same rule. Neither frontend works it out today, so neither needs to switch.
6. `projectNodeNamed(name)` → `{ node, candidates }`: the candidates are the names the search's match finds, best first, then names a typo apart (≤ 2 letters, or a quarter of a long name, `lettersApart`), at most five. It came out of the hand check: «Окружение в Сербб» found nothing by the search's match.
7. `openTasks(filter?)` → `{ item, place }[]`, so `all` reads places once.
8. `--done` reads a new `projectHistory(node)`: a live project's closed tasks By project (own, then subprojects), parts of kind `done`. A done project's screen already shows its closed tasks, so `projectHistory` is empty for it and its parts stay `own` / `subproject`; `project.status` says `done`.
9. A folder with `--no-subprojects` still shows its branch: the core keeps a folder's branch with Subprojects off (`projectSections`), as the screen does. The spec's «empty by design» line is not what the screen does, so the program follows the screen.
10. `DayService` gained `week(this | next)`, `days(from, count)`, `dayNamed(text)`, `weekday(date)` and `side(date)` (past, today, future: the program's `relation` for a day that is none of today, tomorrow, yesterday). Door: `days.*`.
11. `rules.repeatSentence(rule)`: `repeat` in words for every rule, a weekly schedule too (`Every week on Mon, Wed`), where the screen draws the week's letters.
12. `ref` is the task key `[section, index, path, raw]` as JSON, its UTF-8 bytes in hex: no list's name can show in it. The id is left out (it lives one run). `task <ref>` resolves it with `find(key, "")`.
13. A task's fields with no value are left out: none, false, an empty text or list (`collapsed` shows only when true, `next` only on the step); `time.passed` always shows. Subtasks carry no `section` (their task's).
14. `reminder`: the core's `live` is `lockScreen`. `labels` are the labels' titles as the screen writes them (`Not_now` → `Not now`).
15. `calendars.sources[].words` is the sources window's line (`SourceWords.sub`), plus `updated`, the time it shows, when there is one. With no feeds in the program, Google's row reads its file (`Updated today`, `file missing`), never «not logged in».
16. An empty tasks file answers `sections: []` for a list (the column draws nothing), `tasks: []` for `all`.
17. Every command but `help` answers `tasksFileMissing` without the tasks file; an error the program doesn't expect is code `failed`.
18. `projects[].depth` is the tree's depth (`path.length - 1`): a done project at the tree's top is 0, where the panel draws it one step under the Done tile.
19. Options: `--project` / `--no-project` only on today, day, week, soon, inbox, backlog, all; `--no-subprojects` with `--project` or on `project`; `--days` (1 to 62) only on `week`; `--done` only on `project`; anything else is `badArgument`. `project` and `search` take every word that follows as the name or the query. No command is `help`.
20. `time.passed` of a task in `all`, `search`, `project` is judged on its place's day; on a day's timeline, on that day.
21. `help`'s labels for the assistant come from the Assistant page's option rows (Best task's Label and Skip label), each with the label chosen and what it means.

Obsidian frontend (2026-11-18):

22. Every list the plugin draws in sections takes the core's `columnView` whole: `TaskList` draws one `ListView` (`list()`), never items plus `grouped`/`sections`; a list that shows no sections (Done, a task's subtasks on the whole screen) draws `listView(items, false)`. A column reads its sections from the screen it draws (that screen's day), not from the day selected while the next one loads, so the headers always belong to the cards under them. Before the first read the column draws the selected day's empty list. `tests/uiDecides.test.ts` trips on `columnSections(` or a `listView(` with sections in the frontends.
23. The card waiting for its section's name (a new section being named) is left out of the screen handed to `columnView`, as it was left out of the items before.
