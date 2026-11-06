# The door: `globalThis.TaskCalendarPhone`

`phone/task-calendar-phone.js` is the plugin's core built for JavaScriptCore. A host (the iOS app) evaluates it once
and calls the functions of `globalThis.TaskCalendarPhone` synchronously (`JSValue.invokeMethod`). Every rule of the
task manager lives behind this door: a host draws, reads and writes its files, and asks the door for everything else.
The door keeps nothing between calls; what must last (the undo steps, a quick entry being typed) the door hands back
to the host as plain JSON, and the host hands it in again.

Built from `src/phone/main.ts` → `src/application/PhoneDoor.ts` (the functions) and `src/application/PhoneCalls.ts`
(`call`). TypeScript types named below are in `src/application/contracts.ts` unless said otherwise.

## The functions

| Function | Arguments | Answer |
|---|---|---|
| `call(method, argsJson, contextJson)` | a method name, its arguments as a JSON list, the context as JSON | the answer as JSON (below) |
| `methods()` | — | every method `call` answers, `space.name` |
| `tasksFile(settingsJson)` | `data.json`'s text, `""` for the defaults | the tasks file's path from the vault folder; `null` for a blank setting (no tasks file: say so) |
| `iphoneCalendarFile()` | — | `"calendar/iphone.json"`: where the app writes the phone's calendars |
| `iphoneCalendarText(exportJson)` | `PhoneExport` as JSON (below) | that file's text, in the format every calendar writer uses |
| `oneLine(text)` | a title | the title on one line: a line break reads as one space |
| `reminders`, `complete`, `silence`, `snooze`, `capture`, `calendarFiles`, `meetings` | as before | as before, byte for byte (kept for the app as it is): each is a wrapper over its method of `call` (below); a blank title and a task gone answer `{ changed: false, reason: "stale" }`, any other error throws |

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

**Answer** (`DoorAnswer`):

```
{ "ok": true, "result": …, "tasks"?: "<new text>", "step"?: true, "history"?: {…}, "settings"?: "<new data.json>" }
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
- `staleTask`: a task or section the call names is no longer there as read: read again (`tasks.screen`) and redraw.
  `tasksFileMissing`: the call needs the tasks file; `tasks.createFile` answers the text of a new one. `blank`: a task to
  write has no title (`capture.add`).

## Methods

### `tasks.*`: `TaskService`

Every method of `TaskService` but `onChange`, by its name and with its arguments: `tasks.screen(date)`,
`tasks.search(query)`, `tasks.menu(item, from, screen)`, `tasks.drop(tasks, to, day)`, `tasks.createInPlace(text,
priority, place, repeat?, labels?)`, … (83 methods; `methods()` lists them). The answers are those of the plugin's
TaskServiceImpl over the same text, as `tests/application/PhoneCalls.test.ts` checks method by method.

- Reads take a `TaskItem`, a `TaskKey` and the like as the door gave them; a key names a task as read.
- `tasks.screen(date)` with no tasks file answers the empty screen with `missing: true`.
- `tasks.createFile()` answers the new file's text in `tasks`; with a file already there it fails.
- `tasks.drop(tasks, to, day)` answers the dropped tasks' keys as the file now has them: the screen settles the card on
  its task where it stands. A drop in a list column is `{ kind: "place", column, place }`: the `ListPlace` its gap means
  (`rules.placeOfDrop`), or `null` at the end of a column that places nothing in a gap (`rules.placesInGap`). The door
  reads it by whose sections the column shows on `day`; the host never builds `list`, `group` or `nest` itself.
- `tasks.toggleCollapsed(key)`: a tap on a card's subtask counter (offered while `item.can.fold`).
- `tasks.snap(minute, hourPx, tolerancePx)`: the minute a drag, a drop or a stretch on the timeline stands at, the
  timeline drawn `hourPx` points an hour: the finest of 5, 15, 30 and 60 minutes a finger moves at least `tolerancePx`
  for, the host's own touch tolerance in the same points (the plugin passes 9). A resize is offered while `item.can.resize`.
- Subscriptions are the host's: it watches the files and calls again after a change.

### `days.*`: `DayService`

`today()`, `relation(date)`, `step(date, days)`, `boundary()` (`{ startHour }`), `openAt(date)`: where the day's
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
  `updatedAtMs`), `stale`. A file left out is `fileMissing`, a broken one `failed`. "Cached" and "fresh" are two calls
  of it: the host calls it with the files it has, and again once it has fetched or read them anew. Fetching and
  polling (`keepFresh`) are the host's.
- `known()`: every calendar the files list, and whether it is shown.
- `setShown(account, title, shown)`: answers the new `data.json` in `settings`.
- `files()`: the calendars' files by path from the vault folder, Google's, the phone's and the work file, in that order.
- `meetings(fromMs, toMs)`: the timed events of the calendars shown that overlap `from`–`to`, `{ title, startMs, endMs }`,
  over the files in `context.calendars` (a file missing or broken adds none), by the same reading as `events`: the old
  choice of calendars is carried over the same way, answering the new `data.json` in `settings` once.
- A status's `updatedDate` is the calendar date of `updatedAtMs` by the clock: the date shown for an update before
  yesterday (`updatedDay` "other").
- `isPast(event)`: by `event.endMs`, as CalendarDay greys an event (over once its end has come); `past` on each event is the same.
- An event's `color` is `null` when its calendar's file gives none: the frontend draws the source's own colour.

### `reminders.*`: the phone's reminders

Over `context.tasks` (`tasksFileMissing` without it), at `context.nowMs`:

- `list()`: the open tasks on a time that remind, until their day ends, by start: `WireReminder` `{ id, title, body,
  kind, date, startMs, dayEndMs }`. `id` is the task's line as read; `body` its time (`10:00`, `10:00–11:00`); `dayEndMs`
  the next day's start by the clock and `dayStartHour`.
- `complete(id)`, `silence(id)` (it stays on its time and no longer reminds), `snooze(id, minutes)`: the new text in
  `tasks`, a step of the history; `staleTask` when no reminding task has that line. A reminder still shown after its day
  ended is found in the file as it is, before today's tidying erased its slot.

### `capture.add(list, title)`: a task typed or spoken on the phone

Written last in `list` (`rules.constants().LISTS`), as the plugin's quick entry puts it, on one line; in Now with
today's date. A blank title answers `blank`. A title that is only a priority prefix (`p1`) is written as the task's
text: the phone's capture writes what it was told, unlike the plugin's quick entry, which writes nothing for it.

### `settings.*`: `SettingsService`

The settings screen, every read and write but one, answered by the plugin's own SettingsServiceImpl over
`context.settings`: `form()` (`SettingsForm`, the fields as the screen shows them), `setTasksFile(path)`,
`setSection(key, name)`, `setMarker(marker, text)`, `setCount(field, text)`, `setDayStartHour(hour)`,
`renameLevel(index, prefix)`, `recolourLevel(index, color)`, `removeLevel(index)`, `addLevel()`, `moveLevel(from, to)`,
`setLabelTag(tag)`, `renameLabel(index, title)`, `recolourLabel(index, color)`, `removeLabel(index)`, `addLabel()`,
`moveLabel(from, to)`, `colourOf(text, shades)` (the preset a typed code is, by the shades the host draws presets in),
`renamePreset(index, name)`, `removePreset(index)`, `addPreset()`, `movePreset(from, to)`, `setUngrouped(name)`,
`setGoogleClientId(id)`, `setWorkCalendarFile(path)`, `typedColour(of, index, text, shades)` (a colour code typed for a
level or a label and left: the colour to write, `null` for no colour or the one it has). `form()` also answers
`dayStartHours` (what Day starts at offers), `googleClientReady` (Log in has a client id to go with), and
`sectionOrder` and `markerOrder`: the sections' names and the line markers the screen edits, in its order (the words
for each are the host's).

A write answers the new `data.json` in `settings` (every key the plugin's settings do not name, such as a device's own,
kept); a value the service refuses (a count that is no number of zero or more, a label tag of two words) answers none.
Each check is made against the settings handed in, so one edit never undoes the one before it as long as the host hands
in the `data.json` the last answer gave. `bindClientSecret` is the host's: it binds an Obsidian text field to Google's
client secret, which the phone does not edit.

### `screenSettings.get()`: what a screen reads of the settings

`ScreenSettings`: the tasks file, the sections' names, the name over tasks outside a section, the priority levels and the
labels, when a touch becomes a drag (`longPressMs`) and the hour another day opens at (`scrollToHour`). Every frontend's
screen behaves by them alike. `onChange` is the host's: it watches `data.json`.

### `history.*`: undo

The steps live with the host. Every write that is a step answers `history`; hand it in again in the next context.
`undo()` and `redo()` take the last step back or do it again over `context.tasks` and answer `"done"` (with `tasks`),
`"nothing"` or `"conflict"` (its lines were edited since: the step is dropped, the file stays), with the new `history`.
`canUndo()`, `canRedo()`. The plugin keeps 100 steps; a new step clears the steps to do again.

### `entry.*`: the quick entry

Typing tasks in place, every rule of it (`src/application/QuickEntry.ts`). Each call is
`entry.<method>(session, look, ...args)`:

- `session`: the `EntrySession` the last answer gave, `null` to start.
- `look` (`WireLook`): the screen as it stands: `cards` of each list shown (`{ day?, soon?, inbox?, backlog? }`, each a
  list of `ListCard` `{ key, level, group }` in drawing order: `rules.listView`'s rows), `sections` each draws, which
  are `sectioned`, the `day` the day list shows, and `shown`: the lists on screen in their order (a task is looked for
  there first; the plus opens in the day list while it shows, else in Inbox). The layout is the frontend's.

The answer's `result` is `{ session, state, changes, jobs, value }`: the session to hand in next; the field's
`EntryState` (null: closed); each change on the way (`{ state, drawnNext }`); the jobs this call queued; the method's own
answer (`choosePlace`'s `PlaceMove`, `openAtDrop`'s boolean, …).

Methods: `openAtEnd(column)`, `openFromPlus()`, `openIn(column, group)`, `openSlot(slot)`, `openAtDrop(column,
dropTo)`, `subtaskSpot(parent)`, `renameSpot(item, inStack)`, `open(spot, renaming?)`, `type(text)`,
`setPriority(prefix)`, `togglePriority(prefix)`, `setLabels(names)`, `toggleLabel(name)`, `setRepeat(rule)`,
`indent(1 | -1)`, `toggleSection()`, `enter()`, `blur()`, `escape()`, `choosePlace(placement)`, `moveToEnd(column)`,
`placeOf(column, listPlace)`, `state()`, `renaming()`, `listEntry(column, drawn?)`.

`listEntry` answers what a list draws for the field: `{ place, pending, section, at }`, `at` where among the cards and
sections the list is about to draw (`drawn`: `{ cards, sections }`, the look's when left out) the field stands:
`{ kind: "top" }` before the first header, `{ kind: "in", section, card, keepsPlate }` in the section at that index
before the card at that index (the section's end for a place outside its cards), its No tasks plate kept only when
`keepsPlate`, or `{ kind: "end" }` after everything.

**Writes are jobs.** Enter queues a job and opens the next field at once. The host runs the session's jobs one at a time,
in order, each once its lists show every write before it:

1. Wait until the lists are drawn from the file as of the last write.
2. `entry.call(session, look, jobId)` → `value`: `{ method: "createInPlace" | "edit" | "createSection", args }` or null.
   Call `tasks.<method>` with those `args` and write the text it answers.
3. For `createInPlace`: read the file again and, right before drawing it, `entry.shown(session, look, jobId, key,
   coming)`: `key` is what `createInPlace` answered, `coming` the cards each list is about to draw. The line stops
   waiting under the cards in that drawing. If the write failed, `entry.unshown(session, look, jobId)` instead.
   For `createSection`: read and draw the lists again.
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
`listView`, `sectionChoice`, `cardDue`, `textParts`, `oneLine`, `sameLevels`, `labelTitle`, `sameLabels`,
`isPresetColor`, `usableColor` (a colour a level or a label may be drawn in: a preset or `#RRGGBB`), `acceptsDrop`,
`placesInGap`; `constants()` gives `REMINDER_KINDS`, `MINUTES_PER_DAY`,
`DESCRIPTION_TEMPLATE`, `PRIORITY_COLORS` and `LISTS` (the lists a task is written into: Inbox, Backlog, Now, Soon). `tests/architecture.test.ts` fails when contracts.ts hands the UI a runtime
value the door does not offer.

## What the door leaves to the host

`DOOR_COVERAGE` in `src/application/PhoneCalls.ts` names every interface of `contracts.ts` with a method: the space the door
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
(`src/domain/IsoMoment.ts`), field by field (`tests/architecture.test.ts`). `tests/application/PhoneDoor.daylight.test.ts`
crosses New York's changes of the clocks (2026-03-08, 2026-11-01): a day ends at its next start by the clock.

## What the iOS app no longer needs of its own

- `Vault.defaultTasksFile` and `Vault.tasksFile(in:)`: `tasksFile(settingsJson)` (a blank setting is no file, as in the plugin).
- `CalendarExport.path` and `CalendarExport.text(...)`: `iphoneCalendarFile()` and `iphoneCalendarText(...)`.
  `CalendarExport.adds` compares parsed files and keeps working.
- The old functions: `call` answers each (`reminders.*`, `capture.add`, `calendars.files`, `calendars.meetings`) with
  error codes, strict JSON and the old calendar choice carried over.
- `TaskCapture.oneLine`: `capture` writes the title on one line already; `oneLine` where the app shows it before.
- `CaptureList`'s cases: `rules.constants().LISTS`, the lists `capture` takes.
