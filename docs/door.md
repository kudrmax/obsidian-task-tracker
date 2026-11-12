# The door: `globalThis.TaskCalendarPhone`

`core/task-calendar-phone.js` is the plugin's core built for JavaScriptCore. A host (the Apple apps in `apple/`) evaluates it once
and calls the functions of `globalThis.TaskCalendarPhone` synchronously (`JSValue.invokeMethod`). Every rule of the
task manager lives behind this door: a host draws, reads and writes its files, and asks the door for everything else.
The door keeps nothing between calls; what must last (the undo steps, a quick entry being typed) the door hands back
to the host as plain JSON, and the host hands it in again.

Built from `core/phone/main.ts` → `core/application/PhoneDoor.ts` (the functions) and `core/application/PhoneCalls.ts`
(`call`). TypeScript types named below are in `core/application/contracts.ts` unless said otherwise.

## The functions

| Function | Arguments | Answer |
|---|---|---|
| `call(method, argsJson, contextJson)` | a method name, its arguments as a JSON list, the context as JSON | the answer as JSON (below) |
| `methods()` | — | every method `call` answers, `space.name` |
| `tasksFile(settingsJson)` | `data.json`'s text, `""` for the defaults | the tasks file's path from the vault folder; `null` for a blank setting (no tasks file: say so) |
| `settingsFile()` | — | `".obsidian/plugins/task-calendar/data.json"`: where the plugin's settings are, the text a context's `settings` is |
| `iphoneCalendarFile()` | — | `"calendar/iphone.json"`: where the app writes the phone's calendars |
| `iphoneCalendarText(exportJson)` | `PhoneExport` as JSON (below) | that file's text, in the format every calendar writer uses |
| `iphoneCalendarAdds(newText, oldText, nowMs)` | the export `iphoneCalendarText` wrote now, the file as it is (`null`: none), the moment | whether to write it: always, but for the same calendars and events written less than 10 minutes ago (a file missing or unreadable is written over) |
| `oneLine(text)` | a title | the title on one line: a line break reads as one space |
| `reminders`, `complete`, `silence`, `snooze`, `capture`, `calendarFiles`, `meetings` | as before | as before, byte for byte, for installs of the app from before `call`; the app calls `call` alone now. Each is a wrapper over its method of `call` (below); a blank title and a task gone answer `{ changed: false, reason: "stale" }`, any other error throws |

`tasksFile` follows the plugin: the setting as saved, `TODOs Tasks.md` when `data.json` has none, no file for a blank
one. The app's own default for a blank setting goes.

`PhoneExport`: `{ calendars: [{ title, calendarId, account, color?, sourceId? }], events: [{ id, title, startMs, endMs,
allDay, calendarId }], fromMs, toMs, exportedAtMs, device, validUntilMs? }`. An event is written with its calendar's
title, account and colour, found by `calendarId` (the first calendar of an id).

## `call`

```
call("tasks.setStatus", "[{\"section\":\"now\",\"index\":0,\"path\":[],\"raw\":\"- [ ] A\"}, \"done\"]", context)
```

**Arguments** are the TypeScript method's, in order, as JSON. Optional trailing arguments may be left out; `null` is
`null` (for `priority`, `before`, `repeat`, `rule`: none). Dates are `YYYY-MM-DD` strings (`LocalDate`), minutes of a day
are numbers, every moment is epoch milliseconds (`…Ms`).

**Context** (`DoorContext`):

| Field | |
|---|---|
| `tasks` | the tasks file's text; `null` when there is no file |
| `settings` | `data.json`'s text; `""` or left out for the defaults |
| `nowMs` | the moment of the call; the day, today and everything by the clock follow from it and `dayStartHour` |
| `calendars` | `{ google?, iphone?, work? }`: each calendar file's text, `null` or left out for none (`calendarFiles` says where they are) |
| `fetched` | the calendar sources the host fetches itself (a status names no device for them); `["google"]` when left out |
| `history` | the undo steps as the last answer gave them; left out before the first |
| `projects` | the notes that had the project tag, `ProjectNote` `{ name, path, link }`, as `rules.projectNotes` answers them over the vault's notes: read only by the one move to projects (at the first read of a file without `## Projects`, and whenever old `🗂️ [[…]]` fields appear: see «Projects»). The door takes them as complete. Left out: none |
| `projectsScreen` | `ProjectsScreenState`, what this device keeps of the Projects screen (the node chosen, the segment, the folded branches), as the last answer gave it; left out: All chosen, By project, nothing folded |
| `ids` | `TaskIdState`, who the tasks and sections are, as the last answer gave it; left out before the first (every task and section then gets a new id) |

**Answer** (`DoorAnswer`):

```
{ "ok": true, "result": …, "tasks"?: "<new text>", "step"?: true, "history"?: {…}, "settings"?: "<new data.json>", "projectsScreen"?: {…}, "ids"?: {…} }
{ "ok": false, "error": { "code": "staleTask" | "tasksFileMissing" | "blank" | "unknownMethod" | "badArguments" | "failed", "message": "…" } }
```

- `result` is the method's answer, `null` for none. It is plain JSON: no `Date`, no function, no class, no field set to
  `undefined`; what the host parses is exactly what the core answered (`tests/application/PhoneCalls.test.ts` checks
  every method, through `callDoorJson` strict: a `Date`, an `undefined` field, a class's instance or a number JSON cannot
  hold in an answer fails it).
- `tasks`: the call changed the file. The host writes this text, only if the file still holds the text it handed in;
  otherwise it reads the file again and calls again. A read can change the file too: `tasks.screen` and `tasks.lineOf`
  tidy it for today first (yesterday's slots go, closed tasks go to Done), as the plugin does.
- `step`: the write is an action undo takes back; tidying is none. With it comes `history`.
- `settings`: the call changed the settings (a calendar shown or hidden; the phone carrying the old choice of calendars
  over, once). The host writes this text as `data.json`; every key it does not know is kept.
- `projectsScreen`: the call changed what this device keeps of the Projects screen (`tasks.pickProjectNode`,
  `tasks.selectProjectNode`, `tasks.startCarry`, `tasks.carryAt`, `tasks.createProject`,
  `tasks.renameProject`). The host keeps it on
  the device, never synced, and hands it in again.
- `ids`: who the tasks and sections are after the call (`TaskIdState` in `core/application/TaskIdentity.ts`: the
  headings and task lines of the file as read, tidied for today, with their ids, and where new ids go on from). The ids
  are the same whether the host hands in the file as the door tidied it or as it still is on disk. It comes whenever it changed: after a write, an
  undo or redo, and a read of a text other than the one it was for. The host keeps it as it is, in memory (never synced,
  never parsed), and hands it in as `ids` with the next call; a host that leaves it out still gets ids, new ones each call.
- `staleTask`: a task or section the call names is no longer there as read: read again (`tasks.screen`) and redraw.
  `tasksFileMissing`: the call needs the tasks file; `tasks.createFile` answers the text of a new one. `blank`: a task to
  write has no title (`capture.add`).

## Methods

### `tasks.*`: `TaskService`

Every method of `TaskService` but `onChange`, by its name and with its arguments: `tasks.screen(date)`,
`tasks.search(query)`, `tasks.menu(item, from, screen)` (its `groups`: the order the menu is drawn in, the plugin's), `tasks.drop(tasks, to, day)`, `tasks.createInPlace(text,
priority, place, repeat?, labels?)`, … (87 methods; `methods()` lists them). The answers are those of the plugin's
TaskServiceImpl over the same text, as `tests/application/PhoneCalls.test.ts` checks method by method.

- Reads take a `TaskItem`, a `TaskKey` and the like as the door gave them; a key names a task as read. Every key the door
  gives carries `id`, its task's `TaskItem.id`: while the host hands `ids` back, a call finds the task by it wherever
  writes since moved it (a Done just before, a task added above), when the task's line is still the key's or one the
  door's own writes or undo rewrote it into (`ids.held`). A line changed elsewhere keeps its id (the card changes in
  place) but makes a key read before `staleTask`: draw again and use the fresh key. A removed task's key is `staleTask`
  too. A key without `id`, one handed in without `ids`, or one another reading gave, is found by its place and line.
- What counts as the same task is the core's: `TaskItem.id` (below, «Ids»), the same through every write while the host
  hands `ids` back, so a task whose line a write changed is found again by it. A host compares ids, never a key's
  fields. Keys a call answers alone (`tasks.carried`) are the keys of the items handed in, as read: a host finds each
  item by its key.
- `TaskItem.colors`: at most `MOST_CARD_COLORS` (4) colours, the first labels' in the settings' order; a host paints
  every one it is given.
- `tasks.screen(date)` with no tasks file answers the empty screen with `missing: true`.
- `tasks.createFile()` answers the new file's text in `tasks`; with a file already there it fails.
- `tasks.placementTitle(placement)`: the quick entry's place button's words for its `place`: the list's name as the
  settings head it, a day as `5 Nov` (`{ kind: "date", date: "2026-11-05" }` → `"5 Nov"`), never the device's locale.
- A menu's `repeat` (`RepeatRow` `{ value, days }`): the Repeat row's value on the right, ready: `"Every 3 days"`,
  `"On the 5th"`, `"Every 2 months on the 5th"`, `"Every 3 weeks after done"`; for a weekly schedule `value` is empty and
  `days` the weekdays (0 Monday) the row lights among the week's letters (`REPEAT_WORDS.weekdays[i].letter`); empty and
  null for no rule and in the bulk menu.
- `tasks.createInPlace(text, priority, place, repeat?, labels?, project?)` and `tasks.createWithId(…, project?)`:
  `project` is the task's own project (its name, `null` for none); a subtask's place takes none. The quick entry's
  `entry.call` hands it as the sixth argument for a task of the top level: `["Meet", null, { kind: "list", list: "soon",
  group: null, before: null }, null, [], "Дружба"]` writes `- [ ] Meet 🗂️ Дружба` last in Soon.
- `tasks.createWithId(text, priority, place, repeat?, labels?)`: `tasks.createInPlace`, answering `CreatedTask`
  `{ key, id }` (null when nothing was created) instead of the key alone. The key names the new task as the file stands
  right after this write; the id names it whatever is written before the screen draws it. `tasks.createInPlace` answers
  the key as before. `entry.shown(session, look, job, created, coming)` takes either: with a `CreatedTask`, and the
  `coming` cards (`ListCard`) carrying `id`, the typed task's card is found by its id.
- `tasks.drop(tasks, to, day)` answers the dropped tasks' keys as the file now has them: the screen settles the card on
  its task where it stands. A drop in a list column is `{ kind: "place", column, place }`: the `ListPlace` its gap means
  (`rules.placeOfDrop`), or `null` at the end of a column that places nothing in a gap (`rules.placesInGap`). The door
  reads it by whose sections the column shows on `day`; the host never builds `list`, `group` or `nest` itself.
  A drop on a column's title is `screen.titleDrops[column]` (`day`, `soon`, `inbox`, `backlog`) handed back as it is:
  `{ kind: "title", list, date }` puts each task at the end of the list's part without a section, its projects kept, e.g.
  `tasks.drop([{ key, from: "soon" }], screen.titleDrops.backlog, day)`.
- `tasks.landing(tasks, to, day)`: where `tasks.drop` with the same arguments would leave each task, in
  their order, writing nothing (no `tasks` in the answer): the drop's own operation tried over the file, the screen of
  `day` read over the result by the screen's own code. Ask it at the moment of the drop, before `tasks.drop`, and fly
  the copy there. Each answer is a `DropLanding` with the task's `id` and `item` (the task as the next screen reads it):
  - `{ kind: "timeline", span, ridesNow, slotted }`: a block of the day's timeline at `span` (minutes from the start of
    the day, as `tasks.shownSpan` gives them); `ridesNow`, a past time of today: the block rides the now line; `slotted`,
    every block of the day after the drop (`{ id, span }`, in the screen's order) to lay the stack out with
    `rules.stackTasks` and find the card's box.
  - `{ kind: "list", column, group, index }`: a card of `column` (`day`, `soon`, `inbox`, `backlog`, `done`), in
    section `group`, `index` among that section's cards there in the file's order.
  - `{ kind: "subtask", parent, index }`: under the task `parent` (its id), `index` among its open subtasks.
  - `{ kind: "away" }`: not on this screen (another day).
  It needs the tasks file, so it is a `tasks.*` method; `rules.*` are the rules that need no file.
- `tasks.dropPreview(tasks, to, day)`: `tasks.landing` with the whole next screen, writing nothing (no `tasks`,
  `history` or `ids` in the answer): `{ landings, screen, tasks }`. `landings` are `tasks.landing`'s with the same
  arguments; `screen` is the `ScreenView` that `tasks.screen(day)` reads after `tasks.drop` with the same
  arguments and the same `ids` and `history` handed in, every task with the id it will have; `tasks` is the file's text
  as the drop leaves it, the text that screen is read from (the file as it is, tidied for today, when the drop writes
  nothing). Ask it at the moment of the drop and draw the next screen at once: everything else a screen is built from
  (`tasks.columnSections`, `tasks.shownSpan`, `tasks.menu`, `calendars.events`, `rules.*`) reads no tasks file, so it
  is asked as for any screen, with `tasks` standing for the file. Then `tasks.drop`; the next read equals the preview
  unless the file changed meanwhile. Don't keep the `ids` an answer gives over `tasks` before the drop is written.
  Example: `tasks.dropPreview([{ key, from: "soon" }], { kind: "list", column: "day", before: null }, "2026-11-09")`.
- `tasks.toggleCollapsed(key)`: a tap on a card's subtask counter (offered while `item.can.fold`).
- `tasks.snap(minute, hourPx, tolerancePx)`: the minute a drag, a drop or a stretch on the timeline stands at, the
  timeline drawn `hourPx` points an hour: the finest of 5, 15, 30 and 60 minutes a finger moves at least `tolerancePx`
  for, the host's own touch tolerance in the same points (the plugin passes 9). A resize is offered while `item.can.resize`.
- Subscriptions are the host's: it watches the files and calls again after a change.

#### Projects

Projects live in the tasks file. `## Projects` (after Inbox) is a nested list of plain names: indent is nesting, the
order of lines the manual order, `[[note]]` after a name only when a note is attached. A task names its projects with
one `🗂️ Name` field each, right after its title (before its labels and other fields); a name runs to the next field's
mark. A subtask's projects are its parent's. The old `🗂️ [[Note]]` reads as `Note`. A project a task names that the tree
lacks shows at the tree's end and is written into it on the next write. Every write keeps the fields, and no title holds
them. The move to projects is part of tidying: any read of a file that still awaits it (an old `🗂️ [[…]]` field or a
`🎯` line anywhere, or no `## Projects` while there is something to put in it) answers the moved text in `tasks`, with no
`step`, before any action: the old fields are written plain, `🎯` goes off the lines, and the notes of `context.projects`
are attached: all of them, as top-level projects (a project of that name gets the note), to a file without a tree; to a
file whose tree holds a note already, only those an old field names, never a note a tree line holds already. In the plugin the move waits until
the `Projects` port says its notes are complete (`ready()`). Every `## Projects` of the file (Sync may merge two) reads
as one tree, the first name winning, and is written back as one under the first heading.

- `TaskItem.project` (the first, or `null`) and `TaskItem.projects`: `ProjectRef` `{ name, path, note,
  canOpenNote, mark, folder }`; `name` is what every call takes, `path` the names from the top
  of the tree («Дружба», «iPhone»), `note` the attached note's link, `mark` the card's folder icon (off on the Projects
  screen), `folder` a folder (`🗃️` on its tree line: it only holds subprojects, no task is given it). `item.can.setProject`
  is false on a subtask.
- **Folders.** `tasks.setProjectFolder(name, folder)` → `true` when it wrote: the project menu's Folder switch,
  `ProjectMenu.folder` `{ label: "Folder", on, disabled, reason }`; a tap writes `setProjectFolder(name, !on)`. Turning it
  on is refused (`false`, nothing written) while the project has a task of its own, open or done (its subprojects' tasks
  don't count): then `disabled` is true and `reason` «Has tasks of its own». Off is always taken. One step of undo.
  `tasks.setProjectFolder("Работа", true)` turns `- Работа` into `- Работа 🗃️`. A folder takes no task anywhere: its
  Project page option (`MenuProjectOption.disabled`, true while the folder is not checked; a folder a task carries by
  hand is checked and may be taken off), the quick entry's project page alike, its tree row (`acceptsTask` false), its
  own part (`ProjectsSection.takes` false, `newTask` null, no plate; an empty one is left out, so the first subproject's
  header opens), its stages By stage and the view's `newTask` (null); `rules.projectsTakes` is false in a part that
  takes nothing and under a task of it. `tasks.toggleProject` putting a folder on, `tasks.setProject`,
  `tasks.dropOnProject` onto a folder write nothing; `tasks.newProject` with a folder's name answers `null` and writes
  nothing, so «New project…» in the quick entry or the New Task sheet picks nothing; `tasks.createInPlace`, `tasks.create`
  and `tasks.edit` leave off a folder the task doesn't carry already; `entry.setProject(folder)` leaves the field's
  project as it was (unless the renamed task carries that folder), and `capture.project(folder)` reads as none. A task given a folder by hand is read and shown as it is.
- **Grey names.** `ProjectsRow.status` is `active` while the project's branch (it and its subprojects) has an open task
  in any stage, `waiting` (`waiting` and `muted` true: the name grey) while it has none and a project of it has no task
  yet, `done` when every task of the branch is closed.
- `tasks.projectsScreen()`: `ProjectsView` `{ rows, selected, mode, modes, title, menu, sections, newTask, emptyLabel,
  missing, reorders }`. `rows`: the tree top to bottom, each `ProjectsRow` `{ node, kind, title, depth, tile, waiting, status,
  selected, hasBranch, folded, project, acceptsTask, canLift, unfoldsOnHover }`: All, the active and waiting projects (a
  folded branch left out), No project, Done and, once tapped open, the done projects. `node` is `"all"`, `"none"`,
  `"done"` or `"project:<name>"` (`rules.projectNodeOf(name)`). `status` is computed: `active` (an open task of its
  branch, in any stage), `waiting` (no open task in its branch, and a project of it with no task yet; `waiting` and
  `muted` draw the name grey), `done` (every task of its branch closed, every subproject
  done). `sections`: the chosen node's tasks, `ProjectsSection` `{ key, group, title, header, opens, takes, empty, plate,
  path, depth, cards, rows, newTask }` (`takes`: a card may be dropped in it, false only in a folder's own part); By project the node's own first (`title` null), then each subproject's at any depth, each
  in stage order (Inbox, Backlog, Soon, Today), then the file's; By stage Inbox, Backlog, Soon, Today (Done last, only
  under Done). Where cards can be dropped (`reorders`: every node but Done and a done project) every part a drop can go
  to shows, empty too (`empty`; `plate`: the No tasks plate, under an empty part with a header or the only part; the
  node's own part, empty under subprojects, draws nothing). `rows`: what a list column draws, `ProjectsListRow`
  `{ id, item, level, card, drop }`: each card (level 0, `card` its `ProjectsCard`), then its open subtasks a level
  deeper unless folded (`item.collapsed`; the folded card shows its next step); branch lines by `rules.branchOf` over
  the levels; the fold is `tasks.toggleCollapsed(item.key)` as in the lists. `group` is the part as the list's drop
  machinery knows it (`ListCard.group`, `PlacedHead.group`): null for the untitled part, else `key`; `opens` is its
  header's `PlacedHead.opens`, passed through: false while the untitled part stands above it, so the gap under the own
  part's last card (and, the own part empty, the place above the first header) is the own part's. Each `ProjectsCard` `{ id, item, stage, over, from, drop, menuFrom, canDrop }`: `id`
  unique per drawn card (a task of two parts is two cards: key a card by it, never by `item.id`), `drop` what
  `tasks.dropOnProject` takes for that very card, `canDrop` an open task (a closed one under Done stays); `stage` (By
  project) `{ kind: "today" | "soon" | "inbox" | "backlog" | "done" }` or `{ kind: "date", date, label }`; `over` (By
  stage) the subproject the card stands in; `from` the project it is shown under; `menuFrom` what `tasks.menu` takes.
  `menu`: `ProjectMenu` `{ project, renameLabel, noteLabel, note, attachLabel, detachLabel, folder, delete }` for a project,
  `null` for All, No project, Done. `delete`: `{ label, title, message, confirm, cancel, destructive }`, «Delete
  project», asked as «Delete “Дружба”?» / «Its tasks stay; they just lose this project.» before
  `tasks.deleteProject(name)`.
- `tasks.deleteProject(name)`: the project's tree line goes, its subprojects lifted a level into its place in order,
  and its `🗂️ Name` field goes from every task line that has it (Done and subtask lines too). No task is removed, closed
  or moved; one left without a project shows under No project; an attached note's file is untouched. One step of undo.
  `tasks.deleteProject("Дружба")` turns `- [ ] Встретиться 🗂️ Дружба 🗂️ Спорт` into `- [ ] Встретиться 🗂️ Спорт`.
- `tasks.dropInProjects(cards, place)`: cards dropped in the Projects list, each its row's `drop`; `place` the
  `ListPlace` the list's own machinery gives (`rules.placeAt` over the rows as `PlacedCard`s with `group` and the
  headers, then `rules.placeOfDrop`, null: nothing to write). A place under a task nests there as in the lists. Between
  cards, the card above says where (the card below at a part's top, or when the card above's stage would refuse the
  cards): a card already in that card's stage only moves among its list's tasks, right after it (before it), nothing on
  its line changed (a time, a date, a reminder stay); a card from another stage moves as a drop on that stage's column
  writes it (Today: into Now, dated today; Soon from Today: undated). An empty part: By stage the end of that stage's
  list, as the column; By project nothing moves. By project the part's project then takes the place of the card's
  `from` in the line's order, the others stay. Where a stage's column would refuse a card (`rules.acceptsDrop`: Inbox
  and Backlog no dated or timed task, Soon no timed one) the place takes no drop: `rules.projectsTakes(view, cards,
  place)` is false, the host shows no drop line and lets go of nothing, and `dropInProjects` writes nothing. One write;
  answers the tasks' keys as the file now has them; `staleTask` for a part the screen no longer has.
  `tasks.dropInProjects([card.drop], { kind: "task", group: "today", before: null })` puts a Soon card into Now.
  A card lifted on another node, then carried into the list a held card opened (`tasks.hoverProjectNode`), is judged by
  its drop's `lifted` (`{ id, list, origin }`, filled by the core; the host passes `drop` back as it got it at the lift)
  in `projectsTakes`, and as the file has it in `dropInProjects`. By project the part's project takes `from`'s place as
  for any card; By stage the chosen node's project takes `from`'s place (No project: `from` goes; All: projects stay),
  while a card the list shows keeps today's rule (projects stay). A card the list does not show and whose drop has no
  `lifted` is `staleTask`. Lifted on Q, dropped By stage in P's Soon: `- [ ] Back Q 🗂️ Q` becomes a Soon line `- [ ] Back
  Q 🗂️ P`.
- `tasks.projectsDropPreview(cards, place)`: the same, writing nothing: `{ landings, view, tasks }`, `view` the
  `ProjectsView` the drop leaves (equal to the next `projectsScreen`), each landing `{ kind: "card", id, item, card,
  section, index }` (the part it was dropped in first), `{ kind: "subtask", id, item, parent, index }` or
  `{ kind: "away", id, item: null }`.
- A tap on a row is `tasks.pickProjectNode(node, wide)`; a held card's pause over a row is the carry's
  (`tasks.carryAt`): its branch unfolds if `unfoldsOnHover`, and it is chosen if `opensOnHover` (a live project or No
  project, not the chosen row; never All, Done or a done project). `ProjectsRow.muted`: the name drawn grey (a waiting or done project, No project, Done). `tasks.selectProjectNode(node)`: chosen, the branches above it opened (a search hit's path, a card's
  folder). Each answers `projectsScreen`. `ProjectsView` has no `mode`/`modes` any more (By stage went: it is the rows
  mode); `ProjectsCard.over` is gone.
- `tasks.createProject(name, { parent, before })`: the plus let go in the tree; answers the `ProjectRef` (chosen at
  once), `null` for a blank name or one the tree has. `tasks.moveProject(name, place)`: a project lifted and let go.
  The place comes from `rules.projectsGap(rows, gap, depth, lifted?)` → `{ place, depth }` (`gap` before row `gap`, the
  depth from the finger's shift, kept within `rules.projectsLevels(rows, gap, lifted?)` → `{ min, max }`).
  `rules.projectsGap(view.rows, 4, 2)` → `{ place: { parent: "Где знакомиться", before: null }, depth: 2 }`.
  `rules.projectsDrop(rows, gap, shift, lifted?)` takes the finger's sideways way `shift` (px or pt) since the lift: a
  step per `PROJECTS_INDENT` (12) from the lifted project's own depth (the plus: the row above the gap's), so a lifted
  project keeps its depth until the finger shifts. A held card waits `PROJECTS_HOVER_MS` (600) over a row before
  `tasks.hoverProjectNode` (`unfoldsOnHover`, `opensOnHover`). Both constants are in `rules.constants`.
  `tasks.isBlankProjectName(name)`: the Create button of New project… is off for it (`createProject` writes nothing then).
- `tasks.renameProject(from, to)`: the tree's line and every task's field; `false` for a blank name or another
  project's. `tasks.setProjectNote(name, link | null)`: attach or detach a note (the app only detaches: it can't list
  notes). `projects.noteUrl(link, vault)` → `"obsidian://open?vault=…&file=…"`, what a tap on the attached note opens.
- `tasks.dropOnProject(cards, row.node)`, each card's `drop` (`ProjectsDrop` `{ key, from, lifted }`): cards let go on a row
  (`acceptsTask`): each card's `from` gives way to the row's project (No project: taken off), the others and the place in
  the funnel stay. `tasks.dropOnProject([{ key, from: "Где знакомиться" }], "project:Small talk")` turns `🗂️ Где
  знакомиться 🗂️ Дружба` into `🗂️ Small talk 🗂️ Дружба`: the new project takes the old one's place in the line (one
  the task has already: the old one only goes), so the first project changes only when the old one was first.
- The plus let go on the tasks writes `tasks.createInPlace(text, priority, newTask.place, null, [], newTask.project)`
  with the section's `newTask` (By project: Inbox with that subproject; By stage: that stage's list with the node's
  project), or the view's `newTask` outside any section.
- A menu's `project` (`MenuProject` `{ current, options, none, noneLabel, value, disabled, newLabel }`) is the Project
  row's page, several checks: `options` the whole tree, each `{ project, checked, depth, disabled }` (`disabled`: a folder a pick would give the tasks); a pick writes
  `tasks.toggleProject(keys, name)` (on for all, off for all when all have it; answers each task as it then stands, as
  `tasks.toggleLabel`), No project `tasks.setProject(keys, null)`,
  «New project…» `tasks.newProject(name, keys)` (a project at the tree's top, checked; answers its `ProjectRef`, or
  `null`, writing nothing, for a blank name or a folder's: an answer is always a project to pick).
  `value`: «Дружба», «Дружба +1», «No project», or empty when the tasks differ. The same in the bulk menu. A menu reads
  no tasks file: its `MenuScreen` carries `projects`, the `screen.projectTree` of the screen it is opened over (the
  tree's projects in its order), and the page offers exactly those. `tasks.menu(item, "inbox", { today, day, offer:
  screen.offer, projects: screen.projectTree })` over the settings alone lists the whole tree. Left out, the door takes
  the tree of `tasks` when it is handed in (none without), the plugin of the file it read last.
- `tasks.setProject(keys, name | null)`: the tasks' projects become that one alone. `tasks.projects()`: the tree's
  projects in its order (the quick entry's Project button and `capture.project`).
- `tasks.search(query)`: finds a task by any of its projects' names; each `SearchHit` carries `projectPath`, the task's first project's path, `null` for none.
- `tasks.fullTree(item).project`: the task's first project; a tap opens the Projects screen on it
  (`tasks.selectProjectNode(rules.projectNodeOf(name))`).

#### Projects as one view with the funnel (2026-11-12)

The tree is a panel over the funnel, no place of the ribbon: its chosen node filters every list. Everything below only
adds to the calls above; the old ones answer as before.

- `tasks.funnelView(wide)` → `FunnelView` `{ filter, view, panel }`: `filter` `null` or `ProjectFilter` `{ node, title,
  menu, clearable, project, emptyLabel }` (the chosen node: its name big over the tasks, the project menu, the cross, the
  project a task typed under it gets, «No tasks»); `view` `ViewChoice` `{ mode, modes, icon, wheel, rows }` (the mode
  `"twoColumns" | "allColumns" | "rows" | "byProject"`, the view button's menu `[{ mode, label, icon, checked }]`, the
  button's Lucide icon, `wheel` true in two columns alone, `rows` `["inbox", "backlog", "soon", "day"]` in rows); `panel`
  `{ rows, open, docked, missing }` (the tree's `ProjectsRow`s, the filter's row `selected`, none without one; `docked`
  is `wide`). `wide`: the host's screen is wide (desktop): only then is All columns offered, and Two columns is named
  «Columns» on a narrow one. Example: `tasks.funnelView(false)` → `{ filter: null, view: { mode: "twoColumns", wheel:
  true, … }, panel: { open: false, docked: false, … } }`.
- `tasks.screen(date, filter?)`: `filter` the `ProjectFilter.node` (null or left out: none): every list, the timeline and
  Done only the node's tasks, a subtask with its task. Example: `tasks.screen("2026-11-12", "project:Стиль")`.
- `tasks.drop(tasks, to, day, filter?)`, `tasks.landing(…, filter?)`, `tasks.dropPreview(…, filter?)`,
  `tasks.createInPlace(text, priority, place, repeat, labels, project, filter?)`, `tasks.createWithId(…, filter?)`: under
  a filter a drop or a new task at a section's end (`before: null`) goes right after the last task of that section the
  filter shows; the preview reads the filtered screen. Example: `tasks.drop([{ key, from: "soon" }], { kind: "place",
  column: "inbox", place: { kind: "task", group: null, before: null } }, "2026-11-12", "project:Стиль")`.
- `tasks.pickProjectNode(node, wide)`: a tap on a panel row (`tapProjectNode`; on a narrow screen a tap that chose a
  node also closes the panel). `tasks.clearProjectFilter()`: the cross. `tasks.setProjectsPanel(open)`: the projects
  button. `tasks.setViewMode(mode)`: a pick in the view button's menu, the screen's one mode (2026-11-12: no longer kept
  apart with and without a filter; a pick or a clear never changes it).
  `tasks.setNoteViewMode(mode)`: the same in a note's block. Each answers `projectsScreen`.
- `tasks.dropTasksOnProject(keys, to, filter)`: funnel cards let go on a panel row; the project each is shown by under
  `filter` gives way to the row's (no filter, All: its first project). Example: `tasks.dropTasksOnProject([key],
  "project:Дружба", "project:Стиль")`.
- `tasks.projectsScreen(node?)`: with `node`, that node's tasks by project whatever the device chose (the by project
  mode). `tasks.dropInProjects(cards, place, node?)`, `tasks.projectsDropPreview(cards, place, node?)` read that list;
  `NewTaskPlace` `{ kind: "projects", …, node? }` too.
- `tasks.projectNoteView(path, wide)`: the block at the end of a project's note (`path` from the vault's folder):
  `FunnelView` with the note's project as `filter` (`clearable` false), `panel` null, modes Rows and By project, Rows
  first; null for a note no project has. Example: `tasks.projectNoteView("Заметки/Стиль.md", true)`.
- `ProjectsScreenState` gains `panelOpen`, `view`, `noteView`; `selected` left out now means no filter (the old Projects
  screen still shows All for it). `filteredView` is gone (2026-11-12): an old state that has it reads as before with
  `view` the one mode, and the next `setViewMode` drops it.
- `days.stepFunnel({ mode, date }, shift)`: the swipe on the funnel without Projects (`"inbox" | "soon" | "calendar" |
  "done"`): null back from Inbox and from Done, Done on to Inbox. `rules.funnelPlaceShowing(column, spot)`,
  `rules.viewEntryLists(mode, spot)` (the quick entry's `look.shown`: two columns the place's lists, rows and all columns
  all four, by project `["projects"]`). `rules.constants` adds `FUNNEL_PLACES`, `ROW_LISTS`, `VIEW_WORDS`.
- The quick entry's `look` adds `filter`: `{ node, project }` from `funnelView().filter` (or null): a new task's field
  starts with `project`, and its `createInPlace` call carries `node` as the filter (or as `node` of a Projects place).
- `ViewChoice.emptyLabel` («No tasks»): an empty list's words in every view, with a filter or without.
  `ViewChoice.plates` `{ inbox, backlog, soon, day }`: each list's No tasks plate while it draws no card, its words under
  a filter and in rows, null in two and all columns without a filter.
- `tasks.firstView(wide, note)` → `ViewChoice`: the view before the first read, from the device's state alone (its kept
  mode; a node chosen counts as a filter; `note` the note's block). Example: `tasks.firstView(false, false)` → `{ mode:
  "twoColumns", wheel: true, … }`.
- `tasks.filterHides(item, filter)` → boolean: the filter hides that task (a search's find, a subtask by its task, a
  timeline or Done task): true → `tasks.clearProjectFilter()` before showing it. Example: `tasks.filterHides(hit.item,
  "project:Стиль")` → `true`.
- `tasks.dayView(date, filter?)`: `tasks.screen(date, filter).day`.
- **The carry to a project is the core's.** The frontend reports the finger, the core keeps the session in
  `ProjectsScreenState.carry` (the app hands it back as any `projectsScreen`):
  - `tasks.startCarry({ keys, cards?, plus? }, wide)` at the lift (a funnel's cards by their keys, a by project list's by
    `ProjectsCard.drop`, or the plus); the core records the filter it is lifted under. A section or a project lifted in
    the tree starts none.
  - `tasks.carryAt({ edge, node }, nowMs)` → `{ wait }` on every move (and again after `wait` ms while the finger stays):
    `edge` the finger is within the left edge, `node` the panel row under it. After `PROJECTS_HOVER_MS` at a narrow
    screen's edge the panel comes out (`panel.reason` `"carry"`); over a row as long, it unfolds and a card opens it (the
    plus only unfolds). Example: `tasks.carryAt({ edge: true, node: null }, 1000)` → `{ wait: 600 }`.
  - `tasks.carryOnNode(node)`: let go on a row: every carried task to that project (by project cards by their drops,
    funnel cards under the lift's filter), the carry ends.
  - `tasks.endCarry("nowhere" | "dropped" | "naming")`: let go nowhere or cancelled puts the lift's filter back (none
    included); dropped in a list keeps the screen; the plus let go in the tree keeps the panel out (`reason` `"naming"`)
    until `tasks.endProjectName()`.
  - A carry never outlives its gesture: `tasks.firstPlace()` and the main screen's `tasks.firstView(wide, false)` (the
    app's first asks; the plugin's service as it is made) drop a carry or a name left in the state, as let go nowhere:
    no panel, the lift's filter back.
  - `ProjectsPanel.open` is now true for any reason, `ProjectsPanel.reason` `"button" | "carry" | "naming" | null` says
    which.
- **The place is the core's:** `tasks.setFunnelPlace(place)` keeps where the screen stands (anything: an old
  `"projects"`, the app's old `ribbonPlace` numbers, read by `rules.funnelPlaceOf`: Projects and -1 → Inbox, 0 Inbox, 1
  Soon, 2 Today, nothing → Today); `FunnelView.place` and `tasks.firstPlace()` (synchronous) read it.
- `ViewChoice.ribbon`: the screen is the ribbon (two columns, never a note): it swipes, a field moved to a list turns it to
  that list's place, and Done stands left of Inbox; elsewhere a done find opens on its own page.
- `rules.endsSelection(end)`: a carry that ended `"dropped"` (a list, the calendar, a row by `carryOnNode`, the by
  project list) ends Select Tasks; `"nowhere"` and `"naming"` keep it. Example: `rules.endsSelection("dropped")` → true.
- `FunnelView.plus` `{ tap, list, tree }`: a tap `"inPlace"` (by project: the field at its plus part) or `"newTask"` (the
  frontend's New Task); held, let go in `"funnel"`'s lists, `"projects"` (the node's by project list, panel closed) or
  none, and in the tree while the panel shows.
- `ProjectsPanel.dimCloses`: a tap on the dim closes it (over the lists, opened by the button).
- `ViewChoice.source`: `"screen"`, or `"projectsScreen"` (by project reads `tasks.projectsScreen(filter.node)` too).
- `FunnelView.topRow`: the top row stands (wide always; narrow with a filter or a mode but two columns; never a note).
- `FunnelView.searchPaths`: a search opened over the view shows each find's project path (a filter is chosen).
- A card let go on the project it already has (`dropOnProject`, `dropTasksOnProject`, a by project list) leaves its line
  as it is.
- Gone from `contracts.ts` (2026-11-12, both frontends moved): `SCREEN_PLACES`, `ScreenPlace`, `ScreenSpot`, `ScreenAt`,
  `stepScreen`, `placeShowing`, `shownLists`, `shownEntryLists`, and `TaskService`'s `tapProjectNode`,
  `unfoldProjectNode`, `hoverProjectNode`, `setProjectsMode`; `SHOWN_LISTS` has no `projects` entry. **Their door names
  still answer** (CLAUDE.md: the door keeps its functions' names), as thin mappings no frontend here calls:
  `days.stepScreen` (`days.stepFunnel`, the old Projects place as Done: nothing back, Inbox on), `rules.placeShowing`
  (`funnelPlaceShowing`, Projects as Inbox; a `projects` column stays where it is), `rules.shownLists(place)`
  (`SHOWN_LISTS`, `[]` for Projects), `rules.shownEntryLists(place)` (`["projects"]` for Projects),
  `tasks.tapProjectNode` (`pickProjectNode` on a wide screen), `tasks.unfoldProjectNode`, `tasks.hoverProjectNode` (the
  pause `carryAt` acts on), `tasks.setProjectsMode` (answers, keeps nothing).
- `rules.stackedRows(wanted, room, least)` → heights: the rows mode's lists, each as tall as it wants while all fit; else
  a list shorter than an even share keeps its height and the others share the rest; none under `least`. Example:
  `rules.stackedRows([900, 70, 400, 70], 600, 70)` → `[230, 70, 230, 70]`.
- `EntryState.locksPanel` (the quick entry's state, `entry.*`): true while a field is open; the projects button can't be
  pressed then.

#### The view rework (2026-11-12): one mode, layouts, contexts

- **One view mode.** `tasks.setViewMode(mode)` alone changes it; `pickProjectNode`, `clearProjectFilter`, a carry's
  filter never do. Every mode is offered under every filter and none (`twoColumns`, `allColumns` on a wide screen,
  `rows`, `byProject`; a note's block `rows`, `byProject`). Its default is Two columns (Rows in a note's block,
  `setNoteViewMode` its own); All columns kept on a narrow screen shows as the default.
- `ViewChoice.chosen`: the mode the button shows and checks (`icon` is its). `ViewChoice.mode`: what is drawn, the chosen
  one, but By project under Done and a done project (their done list, in any mode chosen); `wheel`, `ribbon`, `source`,
  `rows`, `layout`, `FunnelView.plus` follow `mode`. Example: Rows chosen, Done picked → `{ mode: "byProject", chosen:
  "rows", icon: "rows-3" }`.
- **All is no filter** (Max, 2026-11-12): the panel's All row is `selected` whenever nothing else is chosen;
  `tasks.pickProjectNode("all", wide)` and `tasks.selectProjectNode("all")` clear the filter (`FunnelView.filter` null, no
  title, no cross; a narrow panel closes). `"all"` passed as a filter anywhere (`screen`, `drop`, `createInPlace`, …)
  and an old kept `selected: "all"` mean no filter.
- `tasks.projectsScreen()` with no filter (or `"all"`): every open task by its top project, then a «No project» part
  last (key `"none"`); the plus types there. Under `"none"` its one part; under a project its own and its subprojects'.
- `ViewChoice.layout` `ViewLayout` `{ mode, columns, swipe, divider, stack }`: the columns left to right, each `{ id,
  lists, width }` (`id` `"inbox" | "soon" | "day" | "timeline" | "rows" | "projects"`; `lists` `[{ list, title }]`, top
  to bottom, `title` the list's name, null for the day's list (it draws the day's own title) and the by project list;
  `width` `"half" | "list" | "rest"`); `swipe` `"pages"` (two columns, the ribbon) or `"none"` (no swipe, no
  rubber-band); `divider` before the timeline (false in a note's block, which has no timeline); `stack` in rows `{ lists,
  scrolls }` (`scrolls` false in a note's block: the lists grow with their cards). Two columns: Inbox (Inbox over
  Backlog) half, Soon half, the day `list`, the timeline `rest`. All columns: Inbox, Soon, the day `list`, the timeline.
  Rows: `rows` then the timeline. By project: `projects` then the timeline. Also `rules.viewLayout(mode, note, titles)`
  (`titles` `{ inbox, backlog, soon, day }`).
- `rules.layoutWidths(layout, share, viewWidth, dividerWidth)` → `{ widths, divider }` for a still layout: each column's
  width, and the divider as `ListWidths` (`width` where it stands from the left, `min`, `max`, `center`; hand it to
  `rules.dividerAt` as it is); null for two columns (the ribbon's own rule sets them by its place). Example:
  `rules.layoutWidths(rowsLayout, 0.3, 804, 16)` → `{ widths: [236.4, 551.6], divider: { width: 236.4, min: 110, max:
  678, center: 394 } }`. `rules.layoutShareAt(layout, at, viewWidth, dividerWidth)` → the share a divider let go at `at`
  saves (null without a divider or in two columns): `rules.layoutShareAt(rowsLayout, 300, 804, 16)` → `0.3807`.
- `rules.allColumnsWidths(share, viewWidth, dividerWidth)` → `ListWidths` of one of all columns' three lists;
  `rules.allColumnsShare(width, viewWidth, dividerWidth)`, `rules.allColumnsDividerAt(width, dividerWidth)`,
  `rules.allColumnsWidthAt(at, dividerWidth)`. Example: `rules.allColumnsWidths(0.5, 804, 16)` → `{ width: 189, min:
  110, max: 215.33, center: 189 }`.
- `rules.stackedLists(lists, room, fade)` → heights: the rows' lists measured, each `{ wanted, stops }` (its whole
  height, and the bottom of each card from its top, the title in). All that fit keep `wanted`; else `stackedRows`' shares,
  a list that scrolls ending at a card's bottom plus `fade` (the fade never lies on a card), what that frees going a card
  at a time to the list it lets show one more; none under its first card and the fade (or its plate). Example:
  `rules.stackedLists([{ wanted: 380, stops: [90, 160, 230, 300, 370] }, { wanted: 90, stops: [] }], 300, 20)` → `[180,
  90]`. `rules.stackedRows` still answers.
- `ViewChoice.context` (also `rules.viewContext(node, mode, note)`): the filter and the mode a view is read in, a string
  to compare: a read whose context differs from the one drawn is drawn still in place; the same context changed animates.
  A note's block's context is its mode alone. Example: `rules.viewContext("project:Стиль", "rows", false)` →
  `'["screen","project:Стиль","rows"]'`.
- No rule gives a list a card's room more while a card or the plus is carried or a task typed: rows never reflow during
  a carry; the room to drop in is the hovered list's, drawn by the frontend.

#### A folded task's next step

Every task with an open subtask, at any depth, drawn folded shows its next open subtask: `TaskItem.card` `{ text,
title, over, step }` has the step's title in `text`, the task's own in `over`, the step's `TaskItem` in
`step` (a tap on `over` opens the task's menu, anywhere else the step's); `TaskItem.block` `{ text, title, step }` the
same on the timeline; `TaskItem.drawnOn` `{ key, slot }` on such a step (the folded task's key and slot), where the
quick entry renames it.

#### Results went

`🎯`, Make result / Make task, Add to result and New result… went, with their calls and fields (the move takes `🎯`
off the lines). So did grouping by project in the lists, a project's own view and the project parts of places, the
Project tag and Result mark settings, and the notes «New project…» once wrote (`notes.newProject`, `notes.projectText`).

#### Ids: who a task or a section is

- `TaskItem.id` (every task and subtask, wherever it is shown: `tasks.screen`'s lists, the timeline, `tasks.search`'s
  hits, a found task, the items a write answers such as `tasks.rename`, `tasks.edit`, `tasks.setLabels`): the same for
  the same task across calls while the host hands `ids` back, through every write the door makes to it (status,
  priority, labels, date, time, repeat, rename, fold, description, a move to another list, section, project or parent,
  the timeline and back, several at once), through `history.undo`/`redo`, and through an edit elsewhere that leaves its
  line in place (or edits that one line in place). A task made gets a new id; a removed task's id is gone; a task added
  elsewhere gets a new one. A view keys its card by `id`; `key` stays what an action names (the task as read).
- `ListSection.id` (`tasks.screen`'s `sections`, `tasks.listSections`) and `ListGroup.id` (a column's groups): who a
  section is, the same through `tasks.renameGroup`, `tasks.moveGroup`, the writes to its tasks and undo; a section made
  gets a new one; No section's is `"none"` in every list. A header is keyed by it, never by its name.
- A project is named by its name (`ProjectsRow.node`, `"project:<name>"`); `tasks.renameProject` carries the device's
  `projectsScreen` over to the new name.
- Twins (two identical lines) are two tasks with two ids: the door knows which line a write made of which.

### `days.*`: `DayService`

`today()`, `relation(date)`, `step(date, days)`, `stepFunnel({mode, date}, shift)` (the funnel's walk, see «Projects as one view») (where a swipe or a day arrow leads: `{mode, date}` or null past the row's ends;
Projects first: back from Inbox and Soon, or from Done, to `{ mode: "projects" }`, on from Projects to Inbox, null back
from Projects; `rules.swipeLanding` still makes one swipe one step), `boundary()` (`{ startHour }`), `openAt(date)`: where the day's
timeline opens, minutes from the day's start: `{ kind: "now", minute }` for today (the now line, which the plugin holds
at half the height), `{ kind: "hour", minute }` for another day (the settings' `scrollToHour`, at the top). `onDayChange` and `catchUp` are the
host's: it checks the clock (once a minute while a screen is open), and when `days.today` answers another day it calls
`tasks.normalize` and draws the day anew.

### `boundary.*`: where a day begins

`DayBoundary`'s rules under the settings' `dayStartHour`, times in epoch ms: `startHour()`, `dayOf(ms)`,
`dayOfSlot(slot)`, `offsetOf(day, ms)`, `clipToDay(day, startMs, endMs)`, `spanOf(slot, day)`, `slotAt(day, start, end)`,
`hourAt(index)`, `offsetOfHour(hour)`, `clamp(slot, stepMinutes)`. The timeline places slots, events and now by them.

### `calendars.*`: `CalendarService`

- `events(date)`: the day's events from the files in `context.calendars`, as `WireDayEvents`: `events`, `allDay`,
  `timed` (each event with `startMs`, `endMs` and `past`, over at the call's moment), `statuses` (each with
  `updatedAtMs`, `used` and `tone`), `stale`, `alert`, `words`. A file left out is `fileMissing`; one that is not JSON or not a calendar file's shape `unreadable`. "Cached" and "fresh" are two calls
  of it: the host calls it with the files it has, and again once it has fetched or read them anew. Fetching and
  polling (`keepFresh`) are the host's.
- `known()`: every calendar the files list, and whether it is shown.
- `setShown(account, title, shown)`: answers the new `data.json` in `settings`.
- `files()`: the calendars' files by path from the vault folder, Google's, the phone's and the work file, in that order.
- `sources()`: the same files as `{ source, path }`: `source` is the key `context.calendars` takes the file's text under.
- `meetings(fromMs, toMs)`: the timed events of the calendars shown that overlap `from`–`to`, `{ title, startMs, endMs }`,
  over the files in `context.calendars` (a file missing or broken adds none), by the same reading as `events`: the old
  choice of calendars is carried over the same way, answering the new `data.json` in `settings` once.
- A status's `updatedDate` is the calendar date of `updatedAtMs` by the clock: the date shown for an update before
  yesterday (`updatedDay` "other").
- `isPast(event)`: by `event.endMs`, as CalendarDay greys an event (over once its end has come); `past` on each event is the same.
- Each status's `words` (`SourceWords`) is its row in the sources window, worded: `name` (`Google Calendar`, `iPhone
  calendars`, `Work calendar`), `short`, `sub` (`Updated today`, `Exported from iPhone`, `Not updated yet`, or the
  problem: `not logged in`, `file missing`, `file unreadable`, `no answer in 15 s`, a failure's own text on one
  line of at most 40 characters, a server's answer quoted after it left out: `Google API 500`) and `time` (`14:19`, `Yesterday
  08:02`, `3 Oct 08:02`, empty with no update). Google's problem is `loggedOut` (`not
  logged in`) whenever the shared settings keep no Google token, whatever its file: there is no file to miss then.
- A status's `used`: a calendar shown on the day is taken from its file. Its `tone` is the row's code, drawn as it
  comes: `plain` (in use and fresh, a failed last try too), `old` (in use, older than Stale after: time orange),
  `broken` (old and its last try failed: the problem line red), `spare` (nothing on the day comes from it, whatever its
  age or error: under «Not in use», grey). `statuses` come in the window's order: in use first, then spare, each in
  Google, iPhone, Work order. The day's `alert` is the badge: `none`, `old` (orange) or `broken` (red), the worst
  `tone` in use. `stale` (the day's, equal to `alert != "none"`, and each status's) stays for older callers.
- The marks' words are ready, never typed by the app: each status's `words.alert` (`Out of date` for `old`, `Refresh
  failed` for `broken`, empty otherwise: what its mark says to VoiceOver), and the day's `words`: `alert` (the badge's,
  by the same rule from `alert`), `notInUse` (`Not in use`, the heading of the spare rows) and `notInUseNote` (`The
  timeline takes a calendar from these only when the files above go out of date.`, their section's footer).
- An event's `color` is `null` when its calendar's file gives none: the frontend draws the source's own colour.

### `reminders.*`: the phone's reminders

Over `context.tasks` (`tasksFileMissing` without it), at `context.nowMs`:

- `list()`: the open tasks on a time that remind, until their day ends, by start: `WireReminder` `{ id, title, body,
  kind, date, startMs, dayEndMs }`. `id` is the task's line as read; `body` its time (`10:00`, `10:00–11:00`); `dayEndMs`
  the next day's start by the clock and `dayStartHour`.
- `complete(id)`, `silence(id)` (it stays on its time and no longer reminds), `snooze(id, minutes)`: the new text in
  `tasks`, a step of the history; `staleTask` when no reminding task has that line. A reminder still shown after its day
  ended is found in the file as it is, before today's tidying erased its slot.

### `capture.*`: a task typed or spoken on the phone

`add(list, typed, recording?, tag?, project?)`: written last in `list` (`rules.constants().LISTS`), as the plugin's quick entry
puts it, on one line; in Now with today's date. The title is the words typed, then `[[recording]]` (the recording's file
name as the host saved it, `null` for none), then the tag (as typed in the app's settings, with or without its `#`;
blank for none), which goes only with a recording. No words and no recording answer `blank`. A title that is only a
priority prefix (`p1`) is written as the task's text: the phone's capture writes what it was told, unlike the plugin's
quick entry, which writes nothing for it. `project`, the sheet's Project (its name; null or left out: none),
goes on the line as `🗂️ Name`, the task still last in its list: `add("inbox", "Call Anna", null, "", "Дружба")` →
`- [ ] Call Anna 🗂️ Дружба`.

`project(chosen)`: the sheet's Project row for the project chosen (`link`, null for none; a folder reads as none, and
`add` leaves a folder off), `EntryProject`
`{ page, lit }`: `page` the task menu's Project page (`MenuProject`, «New project…» last), `lit` whether one is chosen.
The sheet starts with none; a pick on the page is the new `chosen`. `project("Дружба")` → `{ lit: true, page: { current: { name: "Дружба", … },
value: "Дружба", … } }`.

`lists()`: the lists a new task goes into, `{ list, name }`, `name` the heading's name by the settings, in the order the
phone's new task screen offers them: Inbox, Now, Soon, Backlog. The first is where a task told to Siri goes.

### `settings.*`: `SettingsService`

The settings screen, every read and write but one, answered by the plugin's own SettingsServiceImpl over
`context.settings`: `form()` (`SettingsForm`, the fields as the screen shows them), `setTasksFile(path)`,
`setSection(key, name)`, `setMarker(marker, text)`, `setCount(field, text)`, `setDayStartHour(hour)`,
`renameLevel(index, prefix)`, `recolourLevel(index, color)`, `removeLevel(index)`, `addLevel()`, `moveLevel(from, to)`,
`setLabelTag(tag)`, `setLabelPaint(paint)` (how a card of several labels is painted: one of the form's `labelPaints`,
`"stripes"` or `"blend"`; anything else writes nothing), `setCardHeight(px)` and `setCardGap(px)` (Cards: written rounded
while within the form's `cardHeights` `{ min: 28, max: 40 }` and `cardGaps` `{ min: 0, max: 10 }`, else nothing), `setZoomLevels(text)` (Zoom
levels as typed, the hour's heights: `"40, 80"` writes `[{ hourPx: 40 }, { hourPx: 80 }]`, the old `"28:60, 56:30"` reads
too; text that is no list of positive whole numbers writes nothing), `renameLabel(index, title)`, `recolourLabel(index, color)`, `removeLabel(index)`, `addLabel()`,
`moveLabel(from, to)`, `colourOf(text, shades)` (the preset a typed code is, by the shades the host draws presets in),
`renamePreset(index, name)`, `removePreset(index)`, `addPreset()`, `movePreset(from, to)`, `setUngrouped(name)`,
`setGoogleClientId(id)`, `setWorkCalendarFile(path)`, `typedColour(of, index, text, shades)` (a colour code typed for a
level or a label and left: the colour to write, `null` for no colour or the one it has). `form()` also answers
`dayStartHours` (what Day starts at offers), `labelPaint` and `labelPaints` (Several labels: the paint saved, and the
paints offered in order, `["stripes", "blend"]`), `cardHeight`, `cardGap`, `cardHeights` and `cardGaps` (Cards: the
sizes saved and the bounds the sliders move within), `zoomLevels` (Zoom levels as the field shows them, `"28, 56, 112,
224"`), `googleClientReady` (Log in has a client id to go with), `googleLoggedIn` (Google is logged in: the shared
settings keep its token; the app's Account row shows it), and
`sectionOrder` and `markerOrder`: the sections' names and the line markers the screen edits, in its order (the words
for each are the host's).

A write answers the new `data.json` in `settings` (every key the plugin's settings do not name, such as a device's own,
kept); a value the service refuses (a count that is no number of zero or more, a label tag of two words) answers none.
Each check is made against the settings handed in, so one edit never undoes the one before it as long as the host hands
in the `data.json` the last answer gave. `bindClientSecret` is the host's: it binds an Obsidian text field to Google's
client secret, which the phone does not edit.

### `screenSettings.get()`: what a screen reads of the settings

`ScreenSettings`: the tasks file, the sections' names, the name over tasks outside a section, the priority levels and the
labels, how a card of several labels is painted (`labelPaint`: `"blend"`, one colour flowing into the next, or
`"stripes"`, the default and what any other saved value reads as), a card's height and the gap between two cards
(`cardHeight`, `cardGap`, points on the phone: a list's cards, a stack on the timeline, a lifted card; 35 and 2 unless
set), when a touch becomes a drag (`longPressMs`, the long press on a card and on the empty timeline alike) and the
hour another day opens at (`scrollToHour`), and the zoom's levels (`zoomLevels`, `[{ hourPx }]`, as
`timeline.zoomLevels()` answers them). Every frontend's screen behaves by them alike. `labelPaint`, `cardHeight`, `cardGap` and `zoomLevels` live in
`data.json` and travel with the vault: the plugin's settings tab and the app read and write the same key. `onChange` is the host's: it watches `data.json`.

### `timeline.zoomLevels()`: the zoom's levels

The hour's heights a pinch settles on, `[{ hourPx }]`, as `data.json` keeps them under `zoomLevels`; `DEFAULT_ZOOM_LEVELS`
when it keeps none or one doesn't read (a height not a positive number). They are shared settings: the plugin's settings
tab and the app write them through `settings.setZoomLevels(text)`; the host hands them to `rules.levelsFor` with its
screen's whole-day height.

### `notes.*`: the vault's notes, for a host without Obsidian

The plugin reads the notes through Obsidian; an app reads the vault's files itself and asks these. Paths are from the
vault folder (`Projects/Alpha.md`); caret offsets count UTF-16 code units, as `NSString` and `UITextField` do.

- The notes that were projects are asked of the pure rules, `rules.noteTags(text)` and `rules.projectNotes(notes,
  tag)` (below), and handed in as `context.projects` only for the one move to projects; a project is a name of the
  tasks file now, its note attached by its link (`ProjectRef.note`).
- `linkQuery(text, caret)`: the `[[` the caret stands in, typed and not closed before it, on its line: `{ query, from,
  to }` (`to` past a `]]` right after the caret), `null` for none: show the note list while it answers one.
  `linkQuery("Call [[Alp", 10)` → `{ query: "Alp", from: 5, to: 10 }`.
- `suggest(query, notes, limit?)`: the files that `[[query` offers, best first, at most `limit` (20): the name as typed,
  a name starting with it, holding it, a path holding it, a path holding each word; the shorter name first, then A–Z;
  all of them A–Z for nothing typed. `notes` is every file of the vault `{ path }` (attachments too); each answer is
  `{ name, path, link }`.
- `insert(text, at, link)`: the title with `[[link]]` in place of `at` (the `linkQuery` answer), and the caret after it:
  `{ text, caret }`.
- `open(target, notes)`: the file a note link in a title opens (`textParts`' `target`): by its path, else its name, as
  Obsidian resolves it, a heading after `#` left aside; `{ name, path, link }`, `null` for none.

### `history.*`: undo

The steps live with the host. Every write that is a step answers `history`; hand it in again in the next context.
`undo()` and `redo()` take the last step back or do it again over `context.tasks` and answer `"done"` (with `tasks`),
`"nothing"` or `"conflict"` (its lines were edited since: the step is dropped, the file stays), with the new `history`.
`canUndo()`, `canRedo()`. The plugin keeps 100 steps; a new step clears the steps to do again.

### `entry.*`: the quick entry

Typing tasks in place, every rule of it (`core/application/QuickEntry.ts`). Each call is
`entry.<method>(session, look, ...args)`:

- `session`: the `EntrySession` the last answer gave, `null` to start.
- `look` (`WireLook`): the screen as it stands: `cards` of each list shown (`{ day?, soon?, inbox?, backlog?, projects? }`,
  each a list of `ListCard` `{ key, level, group }` in drawing order: `rules.listView`'s rows), `sections` each draws,
  which are `sectioned`, the `day` the day list shows, `shown`: the lists on screen in their order
  (`rules.viewEntryLists(mode, spot)`: a task is looked for there first; the plus opens in the day list while it shows, else
  in Inbox, and in the by project view in the part its plus writes), and `parts`: `{ projects? }`, the parts of a list
  that decides itself what a new task in it writes. The layout is the frontend's.
- **The Projects screen's list is a list the field stands in** (`"projects"`, an `EntryList` like a funnel's column):
  while the Projects screen shows, `look.shown` is `["projects"]` and `cards.projects`, `sections.projects` and
  `parts.projects` are `rules.projectsEntryLook(view)`'s `cards`, `sections` and `parts` for the view shown (`null`: no
  view, all empty). A part (`EntryPart` `{ group, newTask, plus }`) is a `ProjectsSection`: its `group`, its `newTask`,
  and `plus` on the one part a tap on the plus types in (the one writing the screen's own `ProjectsView.newTask`, else
  the first that writes one, as under All; none when `ProjectsView.newTask` is null: a folder, Done). Where the plus
  may be let go in the list is `rules.projectsPlusTakes(view, listPlace)`: true only where a new task may be written,
  a gap of a part with a `newTask`, or under a task a card may be nested under (a part that takes cards, a task carrying
  no folder, a node whose list takes drops); elsewhere the host shows no drop line and opens no field. Example: a
  folder's own part, `projectsPlusTakes(view, { kind: "task", group: null, before: null })` → `false`. Rename, Add Subtask, the No tasks plate (`openIn("projects", section.group)`), the plus
  let go in the list (`openAt("projects", listPlace)`, the `ListPlace` of the drop) and Enter's next field then all stand
  in the Projects list, never in a funnel column; a new task's field starts with its part's project and the bar's place
  shows where its part writes. A task written there is `createInPlace` with a `NewTaskPlace` `{ kind: "projects", group,
  before, placement? }`, which the service reads off the screen as the file then stands. A place chosen in the bar keeps
  the field where it stands (`choosePlace` → `{ column: "projects", day: null }`: the screen does not turn) and the task is written there instead. `coming` for `entry.shown` carries
  `projects` too. Example: `rules.projectsEntryLook(view)` → `{ cards: [{ key, id, level: 0, group: null }, …],
  sections: [null, "project:Sub"], parts: [{ group: null, newTask: { place: { kind: "list", list: "inbox", group:
  null, before: null }, project: "P" }, plus: true }, …] }`.

The answer's `result` is `{ session, state, changes, jobs, value, renamed }`: the session to hand in next; the field's
`EntryState` (null: closed); each change on the way (`{ state, drawnNext }`); the jobs this call queued; the method's own
answer (`choosePlace`'s `PlaceMove`, `openAtDrop`'s boolean, …); and `renamed`, every rename entered and not yet
written (`PendingRename` `{ id, key, text, title }`: the task's `TaskItem.id`, its key as read at the open, and the
`text` and `title` its card shows until the write is drawn), the field open or closed. `EntryState.renamed` holds the
same while the field is open. A card whose `id` is in `renamed` draws `title` in place of its own; the entry drops it
once its job is `done`.

Methods: `openAtEnd(column)`, `openFromPlus()`, `openIn(column, group)`, `openAt(column, listPlace)` (the plus let go
at a place of a list: the field of a new task there), `plusOpens()` (whether a tap on the plus opens a field: `false` on
the Projects screen when no part is marked `plus`, as under Done; ask it before the tap and draw no field, or treat the
tap as doing nothing, when false; `openFromPlus()` answers the same boolean as its `value` and opens nothing then), `openSlot(slot)`, `openAtDrop(column, dropTo)`, `subtaskSpot(parent)`, `renameSpot(item, inStack)`, `stackSpot(parent)`, `open(spot, renaming?)`, `type(text)`,
`setPriority(prefix)`, `togglePriority(prefix)`, `setLabels(names)`, `toggleLabel(name)`, `setRepeat(rule)`, `setProject(link)`,
`indent(1 | -1)`, `toggleSection()`, `enter()`, `blur()`, `escape()`, `choosePlace(placement)`, `moveToEnd(column)`,
`placeOf(column, listPlace, placement?)`, `state()`, `renaming()`, `listEntry(column, drawn?)`, `stackEntry(task)`.

Where a field opens: `subtaskSpot(parent)` for Add Subtask from a list or the calendar (a `"stack"` spot means the task
shows in no list: open its full screen and the field last in its stack there), `renameSpot(item, inStack)` for Rename
(null: nowhere), and on a task's full screen `stackSpot(parent)` for both. A folded result's step has no card of its
own (`TaskItem.drawnOn` names its result's): `renameSpot(step, false)` stands in the result card's place in a list, else
over the result's block on the timeline, and `state.renaming` then carries that card's `key` and `id` (the step's text,
its write the step's), so the result's card or block hides as a renamed card does; Enter writes the step and closes the
field. `subtaskSpot(step.key)` answers a list spot with `unfold` (the step's key): hand it to `open` as it is; the field
queues an `unfoldAbove` job first and, once the lists draw the result unfolded, stands last among the step's subtasks.
Without a card holding it, the spot is `"stack"` as for any task. For the rest: `open(stackSpot(key))` types a new subtask
last under `key`, `open(stackSpot(item.key), item)` renames `item` there (the page's own task in its title). Example:
`entry.stackSpot(session, look, { section: "now", index: 0, path: [1], raw: "\t- [ ] Pack" })` → `value`
`{ kind: "stack", parent: { … } }`.

**The Project button** stands on the bar right after the priority's flag: `EntryState.project`, `EntryProject`
`{ page, lit }` (`page` the task menu's Project page, `MenuProject`, its last row «New project…»; `lit`: a project is
chosen), null where there is none (a subtask's field, new or renamed, and a section's name). The field's project is one
name, its own choice: it starts with the renamed task's first project, else none; Enter's next field keeps it. A pick is
`setProject(name | null)`. The project goes with the task as `createInPlace`'s sixth argument, a rename's in the
`edit`'s draft (`TaskDraft.project`: the task's projects become that one; left out when the button was not touched, so
a task of several keeps them). Example: `entry.setProject(session, look, "Дружба")` → `state.project`
`{ lit: true, page: { value: "Дружба", newLabel: "New project…", … } }`.

`listEntry` answers what a list draws for the field: `{ place, pending, section, at }`, `at` where among the cards and
sections the list is about to draw (`drawn`: `{ cards, sections }`, the look's when left out) the field stands:
`{ kind: "top" }` before the first header, `{ kind: "in", section, card, keepsPlate }` in the section at that index
before the card at that index (the section's end for a place outside its cards), its No tasks plate kept only when
`keepsPlate`, or `{ kind: "end" }` after everything.

`stackEntry(task)` answers the same for a task's full screen, among the rows of `tasks.fullTree(task)`: `{ at, pending }`,
`at` one of `{ kind: "title" }` (the task itself renamed: its title is the field), `{ kind: "row", index, level }` (the
subtask at row `index` renamed: the field takes its row) or `{ kind: "new", index, level }` (a new subtask: the field
before row `index`, `rows.length` after them all, at `level`, the `pending` texts right above it at that level); null
when the field stands anywhere but the stack of `task` or one of its subtasks. Example: the field typing under row 0
`Pack` (level 0, two subtasks) after `Charger` was entered → `{ at: { kind: "new", index: 3, level: 1 },
pending: [{ text: "Charger", level: 1 }] }`.

**Writes are jobs.** Enter queues a job and opens the next field at once. The host runs the session's jobs one at a time,
in order, each once its lists show every write before it:

1. Wait until the lists are drawn from the file as of the last write.
2. `entry.call(session, look, jobId)` → `value`: `{ method: "createInPlace" | "edit" | "createSection" | "unfoldAbove", args }` or null.
   Call `tasks.<method>` with those `args` and write the text it answers.
3. For `createInPlace`: read the file again and, right before drawing it, `entry.shown(session, look, jobId, key,
   coming)`: `key` is what `createInPlace` answered, `coming` the cards each list is about to draw. The line stops
   waiting under the cards in that drawing. If the write failed, `entry.unshown(session, look, jobId)` instead.
   For `createSection` and `unfoldAbove`: read and draw the lists again.
4. `entry.done(session, look, jobId)`, whatever happened.

After a rename's `edit`, the task as it now stands is its answer (the plugin keeps it open on the full screen).

### `sectionName.end(ended, event, text)`

A section's name typed in place: `event` is `"enter"`, `"escape"` or `"blur"`. Answers `{ ended: true, end?: { name } }`:
Enter gives the name as typed (`tasks.renameGroup` or `tasks.createSection` trim it), Escape and a tap elsewhere give
`null` (the old name stays); once ended, nothing more (`end` missing).

### `repeatPage.end(own, held)`

A task menu's repeat page writes once, as the menu closes: `held` is what the page holds (`null` untouched, `{ rule }`
after a change, `{ rule: null }` after Remove repeat), `own` the task's rule. Answers `{ rule }` to write with
`tasks.setRepeat`, or `null` for nothing (back to the task's own rule, or untouched). The quick entry's panel writes
nothing: its session holds the rule.

### `description.*`: the full screen's description editor

The host keeps `state` (`{ file, typed }`) between calls and debounces the typing itself:
`open(description)` → `{ state, text }` (the text to edit, the template for none); `typed(state)` → `state`;
`save(state)` → `{ state, write }` (write what the editor holds now with `tasks.setDescription` only when `write`: an
editor left untouched never writes an old text back); `read(state, description, { focused, pending })` after the file
was read again → `{ state, replace }` (the text to put in the editor, or `null` to keep it: a change made elsewhere
replaces it only while it has no focus and no write waits).

### `rules.*`: the pure rules

What the plugin's UI calls itself, by the names in `contracts.ts`: `nextProgress`, `sameSlot`, `sameRule`,
`repeatParts`, `repeatDraft`, `editRepeat`, `samePlacement`, `keyId`, `sameLine`, `samePlace`, `sameTaskTree`,
`fitLevel`, `gapOfPlace`, `levelRange`, `placeOfGap`, `shiftLevel`, `gapAt`, `groupPlaceOf`, `placeOfDrop`, `sameGap`,
`listView`, `sectionChoice`, `cardDue`, `textParts` (a title in pieces, as every frontend draws it: `{ kind: "text", text }`
as typed, `{ kind: "note", label, target }` for `[[target]]`, `[[target|label]]` and a markdown link to a note, `{ kind:
"url", label, target }` for `[label](https://…)` and a bare address; a link's `label` is drawn in the accent and a tap on
it opens `target`: a url as it is, a note by `notes.open(target, notes)`, the file the link resolves to; code spans,
escapes and embeds stay text), `oneLine`, `sameLevels`, `labelTitle`, `sameLabels`,
`isPresetColor`, `usableColor` (a colour a level or a label may be drawn in: a preset or `#RRGGBB`), `acceptsDrop`,
`placesInGap`, `canPick(from)` (Select tasks picks a card drawn at `from`, a `MenuFrom`: a list column's, never the
timeline's, Done's, a stack's or the full screen's), `repeatValue(rule)` (the Repeat row's words, `null` for weeks on a
schedule), `onTheDay(rule)` (`"On the 5th"` under a monthly schedule's unit, empty for any other), `dayMonth(date)`
(`"5 Nov"`), `listWidths(share, viewWidth, dividerWidth)` (the list column beside the calendar, every number in points:
`{ width, min, max, center }`: the width drawn for the saved share of the columns' width, `viewWidth` less the divider's
own `dividerWidth`, within the design's bounds on a phone and growing on a wider window, the bounds a drag of the divider
moves within, and the width that centres it; `listWidths(0.5, 390, 16)` → `{ width: 187, min: 110, max: 280, center:
187 }`), `listShareOf(width, viewWidth, dividerWidth)` (the share a divider let go at `width` saves),
`dividerAt(wanted, widths, speed)` (where the dragged divider stands: `widths` a `listWidths` answer, `speed` the
finger's in points or px per ms; brought within `DIVIDER_SNAP.distance` of the middle slower than
`DIVIDER_SNAP.slowSpeed` it holds to `center`, else it stands at `wanted` rounded, within `min` and `max`; answers
`{ width, snapped }`, and a host gives a tap of haptics as `snapped` turns on; `dividerAt(190, { width: 187, min: 110,
max: 280, center: 187 }, 0.01)` → `{ width: 187, snapped: true }`), `keyId(key)` (a string naming the task as read, its line included); the paints every frontend draws alike: `shadesOf(color, theme)` (a level's or a label's `ink`, a card's
`fill`, its date and dot's `meta`), `inkOf`, `contrast`, `eventHex(event)`, `bgAlphaFor(source)`, `eventColors(hex,
bgAlpha, theme)` (an event's `bg`, `bar`, `text`); `dayTitle(date, relation, today)` (`Today`, `Tue, 3 Nov`) and
`dueLabel(date)` (a card's corner: `{ day, month }`); `eventLevels(spans)` (how deep each event lies over the others); `stackTasks(tasks, events, hourPx, card, insets)` (each task card's top, height and left edge on the timeline: they never share the width), `overlayLeft(level, insets)`, `eventLeft(level, insets)`, `stackCorner(box, slotStart, span)` (what a stack card shows on the right: its start when stacked, its duration when shorter than one; null for neither), `timeParts`, `durationParts`; a past event's paint: `pastEventPaint(ground, text, theme)` (`{ bg, bar, text }` as
`#RRGGBB`: the screen's ground mixed towards its text, 1.5% and 12.5% dark, 1.2% and 10% light, as the plugin's
`--tc-event-past-*` tokens); the timeline's zoom: `parseZoomLevels(text)` (`"28, 56"` → `[{ hourPx: 28 }, { hourPx: 56 }]`,
`null` for a text that doesn't read), `formatZoomLevels(levels)`, `levelsFor(wholeDayPx, levels)` (the levels a pinch
moves between at this screen's height, the whole day first), `gridAt(hourPx, measures)` (`measures`:
`{ divisions, labelGap, tickMinutes, tickGap }`, the frontend's own; answers `{ labels, lines }`, minutes),
`gridMarks(grid, dayHours)` (every line between the hours: `{ minute, label }`, `minute` from the day's start, `label`
`":30"` or `null`), `zoomAfterPinch(hourPx, wholeDayPx, levels)` (where a pinch let go at `hourPx` settles:
`"wholeDay"` at or under the whole day's height, else `hourPx`; save it as the device's zoom), `zoomShown(saved,
wholeDayPx, levels)` (the hour height a saved zoom opens at: `"wholeDay"` → the whole day's height, a number kept
between the whole day and the largest level, anything else `DEFAULT_ZOOM_HOUR` kept the same way). In both
`wholeDayPx` is `null` while the timeline has no height yet: the smallest level stands for the whole day;
`labelHidesNearNow(y, nowY, lift, pillHeight)` (whether a grid label at `y` hides under the now pill: closer than its
`lift` and half the pill; `nowY` `null` on a day with no now line; the lifts and the pill's height are the frontend's);
a drop in a list: `levelAt(x, { left, width }, indent)` (the fractional level the finger's `x` asks for: 0 at the list's
middle, one more per `indent` right of it, below zero left of it), `carriedMiddle(y, grabPx, cardHeight)` (where a
carried card's middle stands: a card is placed by it, a new task by the finger's `y`), `placeAt(cards, y, level, shift,
room, heads, held, hysteresis)` (the `GapPlace` under the finger: `cards` `[{ level, group, top, height }]` as they stand
without the lifted ones, `shift` how far the open gap `room` pushes the cards after it, `heads` the section headers
`[{ group, firstCard, top, height }]`, `held` the place shown now and `hysteresis` how far past its edge the finger must go
to leave it; `room`, `held` may be `null`, `heads` `[]`, `hysteresis` `0`; above the first header the place is in No
section, unless No section's header stands lower: then it is the first header's section, where the screen draws it); the branch lines: `branchOf(levels, index)`
(the row's `{ last, through }`: `last` its line bends in, `through[k]` the line of level `k + 1` goes on past it; `null`
for a task) and `gapBranch(cards, gap)` (the same for an open gap, as a row of its level before `cards[gap.index]`);
the vault's project notes for a host without Obsidian's metadata: `noteTags(text)` (a note's tags as Obsidian reads them,
each with its `#`: the properties' `tags` or `tag`, as a list, `[a, b]` or bare words, then the text's `#tags` outside
fenced and inline code; `"---\ntags: [project]\n---\n#more"` → `["#project", "#more"]`) and `projectNotes(notes, tag)`
(`notes` every markdown note of the vault `[{ path, text }]`, or `{ path, tags }` with tags `noteTags` gave before, or
`{ path }` alone for a note only counted for its name; `tag` the settings' project tag; answers `ProjectNote[]`
`{ name, path, link }` of the notes with exactly that tag, case aside, a nested child tag not it, by name; `link` the name,
the path without `.md` when another note has that name: `[{ path: "Work/Plan.md", text: "#project" }, { path:
"Home/Plan.md" }]` → `[{ name: "Plan", path: "Work/Plan.md", link: "Work/Plan" }]`; the context's `projects`);
the funnel's places: `funnelPlaceShowing(column, spot)` (the place a list is shown from: `spot` itself when it shows
`column`, Done as Inbox, else the nearest place that does; `funnelPlaceShowing("day", "inbox")` → `"soon"`; a place is
`"inbox"`, `"soon"` or `"calendar"`, the app's Today); `viewEntryLists(mode, spot)` (the quick entry's `look.shown`);
the copy of a pressed card that shows its whole title, in points or px: `wholeWidth(card, room)` (`card`
`{ width, titleWidth, textWidth, fade }`: the card's width, its title's box, the title's text measured on one line, the
fade at the title's end; `room` `{ width, margin }`: the window and the margin a copy keeps from its edges) answers
`null` while the title shows whole (the card itself is lifted), else `{ width, cut }`: the copy grown right by what the
title lacks, never wider than the window less both margins nor narrower than the card, and `cut` when the title still
doesn't fit at that width (it then wraps and the copy grows down, as tall as the wrapped title measures);
`wholeWidth({ width: 170, titleWidth: 140, textWidth: 200, fade: 16 }, { width: 390, margin: 10 })` →
`{ width: 230, cut: false }`. `grownStart(start, size, grown, room, margin)` (one axis: where the copy of a card at
`start` of `size`, grown to `grown`, starts in a window of `room` with `margin`: where the card did, pulled back only as
far as it takes to end inside the margin, or at the card's own end if that is further, never past the near margin;
`grownStart(200, 180, 230, 390, 10)` → `150`);
`constants()` gives `REMINDER_KINDS`, `MINUTES_PER_DAY`,
`DESCRIPTION_TEMPLATE`, `PRIORITY_COLORS`, `EVENT_BG_ALPHA`, `LISTS` (the lists a task is written into: Inbox, Backlog, Now, Soon),
`DEFAULT_ZOOM_LEVELS` and `DEFAULT_ZOOM_HOUR` (the zoom a timeline opens at before a pinch settled on another),
`CARD_HEIGHTS`, `CARD_GAPS` and `DEFAULT_CARD_SIZE` (the Cards bounds and defaults), `LIST_WIDTHS` (`{ min: 110,
max: 280 }`), `DIVIDER_SNAP` (`{ distance: 8, slowSpeed: 0.08 }`), `MOST_CARD_COLORS` (4), `REPEAT_WORDS` (the repeat page's words: `kinds` `{ schedule: "Schedule", afterDone: "After done" }`,
`every` `"Every"`, `units` `{ day: "days", week: "weeks", month: "months" }`, `weekdays` Monday first `{ short: "Mon",
name: "Monday", letter: "M" }`, `remove` `"Remove repeat"`),
`NO_DAY_EVENTS` (a day before any calendar file was read, as `calendars.events` answers it: no events, no statuses, `alert` `"none"`, its `words`),
`FUNNEL_PLACES` (`["inbox", "soon", "calendar"]`, left to right) and `SHOWN_LISTS` (the funnel's lists each place
shows, in its order: `{ inbox: ["inbox", "backlog", "soon"], soon: ["soon", "day"], calendar: ["day"] }`), `ROW_LISTS`
(`["inbox", "backlog", "soon", "day"]`), `VIEW_WORDS` (the view modes' words). `tests/architecture.test.ts` fails when contracts.ts hands the UI a runtime
value the door does not offer.

## What the door leaves to the host

`DOOR_COVERAGE` in `core/application/PhoneCalls.ts` names every interface of `contracts.ts` with a method: the space the door
answers it in and the methods the host keeps (subscriptions, the clock, fetching and polling, binding a text field), or
why the host owns it whole. `tests/application/PhoneCalls.test.ts` reads the interfaces from `contracts.ts` and fails on
one the table misses.

`listView`'s groups carry `menu`: what a section's header menu offers (`{ section, rename, remove }`), null for the
tasks outside any section. A task's and the bulk menu's `remove` is null when Delete is not offered; the plugin's
Open full screen and Open in Obsidian are its own rows, outside the model.

`DOOR_COVERAGE`'s `own` names a space's methods beside its interface's: `calendars.files` and `calendars.meetings`.

- `GoogleAccount` (`isLoggedIn`, `login`, `logout`): the login is a browser's consent and a token fetched over the network;
  the door makes no request.
- `WorkCalendarSetup` (`scriptableLoader`, `export`): the Scriptable script and the Shortcuts export are the Obsidian
  plugin's fallback on the iPhone; an app writes `calendar/iphone.json` itself (`iphoneCalendarText`).
- `DayEventsAsk`, `PolledScreen`, `CalendarPoll`, `SecretField`: the halves of `events`' fetch, `keepFresh` and
  `bindClientSecret`, which are the host's.

## Time

The core reads the device's local time: a day, an hour and a slot are the clock's readings where the device is. The door's
and the phone's answer tests run also under `TZ=Asia/Novosibirsk` and `TZ=America/New_York` (`vitest.config.mts`), and the
core uses nothing of the locale (`Intl`, `localeCompare`, `toLocale…`) nor reads a date from text the engine's own way
(`Date.parse`, `new Date(text)`, `toString`, `toDateString`): a calendar file's times go through `isoMoment`
(`core/domain/IsoMoment.ts`), field by field (`tests/architecture.test.ts`). `tests/application/PhoneDoor.daylight.test.ts`
crosses New York's changes of the clocks (2026-03-08, 2026-11-01): a day ends at its next start by the clock.

## The iOS app

Every rule the app needs it asks of the door; its own Swift keeps only what the plugin has no part of: the reminders'
plan on the phone (`RepeatPlan`, `CardPlan`, `AfterEvent`), files by bookmark, where Obsidian puts an attachment
(`AttachmentFolder`, from the vault's `.obsidian/app.json`) and the name Obsidian's recorder gives a recording. Its tests
(`apple/Core/Tests`) run the door in JavaScriptCore: the reads that rely on a lookbehind (`tasks.search`) and on reading
dates field by field (`calendars.events`), a write and `history.undo`, and New York's changes of the clocks in a
JavaScriptCore of its own set to that zone (`osascript -l JavaScript`: a process reads its zone once).

### What it no longer needs of its own

- `Vault.defaultTasksFile` and `Vault.tasksFile(in:)`: `tasksFile(settingsJson)` (a blank setting is no file, as in the plugin).
- `CalendarExport.path`, `CalendarExport.text(...)` and `CalendarExport.adds`: `iphoneCalendarFile()`,
  `iphoneCalendarText(...)` and `iphoneCalendarAdds(...)`.
- `Vault.settingsPath`: `settingsFile()`.
- `NoteTags.of(text)`: `rules.noteTags(text)`; the notes that were projects, for the one move: `rules.projectNotes(notes, tag)`.
- The task's title from the words, the recording and the tag, and what is blank: `capture.add`.
- The old functions: the app calls `reminders.*`, `capture.add`, `calendars.sources`, `calendars.meetings` through
  `call`, by their error codes (`staleTask`, `blank`).
- `TaskCapture.oneLine`: `capture` writes the title on one line already; `oneLine` where the app shows it before.
- `CaptureList`'s cases and their titles: `capture.lists()`, by the headings' names.
- `CardControl.grownStart` and the width a pressed card's copy grows to: `rules.wholeWidth` and `rules.grownStart`.
- A card's fixed 35 and 2 points: `screenSettings.get()`'s `cardHeight` and `cardGap`; the list's width bounds
  (`BoardScreen.minList`, `maxList`): `rules.listWidths`.
- The Repeat row's and the repeat page's words (`BoardSheets.unit`, the weekday letters): the menu's `repeat` and
  `REPEAT_WORDS`; the sources' words (`CalendarsView.name`, `words`): each status's `words`; the place button's date
  formatted in the device's locale: `tasks.placementTitle`; «calendar cards cannot be picked»: `rules.canPick`.

### The bridge in `apple/Core`

`TaskBoard` hands in with every call the device's Projects screen (a `DeviceText`: `UserDefaultsText` in the app, kept as
each answer's `projectsScreen` gives it). Its own calls: `titleParts(text)`, `noteToOpen(target)`, `linkQuery(in:caret:)`, `suggestNotes(query)`, `insertLink(note, in:at:)`
(`notes.*` over `Vault.vaultFiles()`, every file of the vault, listed again by `refreshNotes()`), `screenSettings()`,
`listWidths(share:viewWidth:dividerWidth:)`, `repeatWords()`. The answers decode as `ProjectRef`, `ProjectNote`,
`ProjectsView`, `MenuProject`, `RepeatRow`, `SourceWords`, `ScreenSettings`, `SizeBounds`, `TextPart`,
`LinkQuery`, `LinkInsert`, `ListWidths`, `RepeatWords` (`BoardModels.swift`, `NoteModels.swift`, `Projects.swift`).
