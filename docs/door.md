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
| `reminders`, `complete`, `silence`, `snooze`, `capture`, `calendarFiles`, `meetings` | as before | as before (kept for the app as it is) |

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
| `settings` | `data.json`'s text; `""` for the defaults |
| `nowMs` | the moment of the call; the day, today and everything by the clock follow from it and `dayStartHour` |
| `calendars` | `{ google?, iphone?, work? }`: each calendar file's text, `null` or left out for none (`calendarFiles` says where they are) |
| `history` | the undo steps as the last answer gave them; left out before the first |

**Answer** (`DoorAnswer`):

```
{ "ok": true, "result": …, "tasks"?: "<new text>", "step"?: true, "history"?: {…}, "settings"?: "<new data.json>" }
{ "ok": false, "error": { "code": "staleTask" | "tasksFileMissing" | "unknownMethod" | "badArguments" | "failed", "message": "…" } }
```

- `result` is the method's answer, `null` for none. It is plain JSON: no `Date`, no function, no class, no field set to
  `undefined`; what the host parses is exactly what the core answered (`tests/application/PhoneCalls.test.ts` checks
  every method).
- `tasks`: the call changed the file. The host writes this text, only if the file still holds the text it handed in;
  otherwise it reads the file again and calls again. A read can change the file too: `tasks.screen` and `tasks.lineOf`
  tidy it for today first (yesterday's slots go, closed tasks go to Done), as the plugin does.
- `step`: the write is an action undo takes back; tidying is none. With it comes `history`.
- `settings`: the call changed the settings (a calendar shown or hidden; the phone carrying the old choice of calendars
  over, once). The host writes this text as `data.json`; every key it does not know is kept.
- `staleTask`: a task or section the call names is no longer there as read: read again (`tasks.screen`) and redraw.
  `tasksFileMissing`: the call needs the tasks file; `tasks.createFile` answers the text of a new one.

## Methods

### `tasks.*`: `TaskService`

Every method of `TaskService` but `onChange`, by its name and with its arguments: `tasks.screen(date)`,
`tasks.search(query)`, `tasks.menu(item, from, screen)`, `tasks.drop(tasks, to, day)`, `tasks.createInPlace(text,
priority, place, repeat?, labels?)`, … (81 methods; `methods()` lists them). The answers are those of the plugin's
TaskServiceImpl over the same text, as `tests/application/PhoneCalls.test.ts` checks method by method.

- Reads take a `TaskItem`, a `TaskKey` and the like as the door gave them; a key names a task as read.
- `tasks.screen(date)` with no tasks file answers the empty screen with `missing: true`.
- `tasks.createFile()` answers the new file's text in `tasks`; with a file already there it fails.
- Subscriptions are the host's: it watches the files and calls again after a change.

### `days.*`: `DayService`

`today()`, `relation(date)`, `step(date, days)`, `boundary()` (`{ startHour }`). `onDayChange` and `catchUp` are the
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
- `isPast(event)`: by `event.endMs`.

### `settings.*`: `SettingsService`

The settings screen, every read and write but one, answered by the plugin's own SettingsServiceImpl over
`context.settings`: `form()` (`SettingsForm`, the fields as the screen shows them), `setTasksFile(path)`,
`setSection(key, name)`, `setMarker(marker, text)`, `setCount(field, text)`, `setDayStartHour(hour)`,
`renameLevel(index, prefix)`, `recolourLevel(index, color)`, `removeLevel(index)`, `addLevel()`, `moveLevel(from, to)`,
`setLabelTag(tag)`, `renameLabel(index, title)`, `recolourLabel(index, color)`, `removeLabel(index)`, `addLabel()`,
`moveLabel(from, to)`, `colourOf(text, shades)` (the preset a typed code is, by the shades the host draws presets in),
`renamePreset(index, name)`, `removePreset(index)`, `addPreset()`, `movePreset(from, to)`, `setUngrouped(name)`,
`setGoogleClientId(id)`, `setWorkCalendarFile(path)`, `setWorkCalendars(text)`.

A write answers the new `data.json` in `settings` (every key the plugin's settings do not name, such as a device's own,
kept); a value the service refuses (a count that is no number of zero or more, a label tag of two words) answers none.
Each check is made against the settings handed in, so one edit never undoes the one before it as long as the host hands
in the `data.json` the last answer gave. `bindClientSecret` is the host's: it binds an Obsidian text field to Google's
client secret, which the phone does not edit.

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
`placeOf(column, listPlace)`, `state()`, `renaming()`, `listEntry(column)`.

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

### `rules.*`: the pure rules

What the plugin's UI calls itself, by the names in `contracts.ts`: `nextProgress`, `sameSlot`, `sameRule`,
`repeatParts`, `repeatDraft`, `editRepeat`, `samePlacement`, `keyId`, `sameLine`, `samePlace`, `sameTaskTree`,
`fitLevel`, `gapOfPlace`, `levelRange`, `placeOfGap`, `shiftLevel`, `gapAt`, `groupPlaceOf`, `placeOfDrop`, `sameGap`,
`listView`, `sectionChoice`, `cardDue`, `textParts`, `oneLine`, `sameLevels`, `labelTitle`, `sameLabels`,
`isPresetColor`, `acceptsDrop`, `placesInGap`; `constants()` gives `REMINDER_KINDS`, `MINUTES_PER_DAY`,
`DESCRIPTION_TEMPLATE`, `PRIORITY_COLORS` and `LISTS` (the lists a task is written into: Inbox, Backlog, Now, Soon). `tests/architecture.test.ts` fails when contracts.ts hands the UI a runtime
value the door does not offer.

## What the iOS app no longer needs of its own

- `Vault.defaultTasksFile` and `Vault.tasksFile(in:)`: `tasksFile(settingsJson)` (a blank setting is no file, as in the plugin).
- `CalendarExport.path` and `CalendarExport.text(...)`: `iphoneCalendarFile()` and `iphoneCalendarText(...)`.
  `CalendarExport.adds` compares parsed files and keeps working.
- `TaskCapture.oneLine`: `capture` writes the title on one line already; `oneLine` where the app shows it before.
- `CaptureList`'s cases: `rules.constants().LISTS`, the lists `capture` takes.
