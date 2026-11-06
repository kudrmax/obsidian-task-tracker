# Layers 3, R4: one door for every frontend

## Why

The Swift frontend (`../task-calendar-ios`) calls the plugin's core through JavaScriptCore, synchronously
(`PhoneCore.swift`: `invokeMethod`, the result read at once). Until now the door offered seven phone jobs; the ~70
methods of the services, the reads of TaskServiceImpl (async only) and the ~36 pure helpers the TS UI calls were out of
its reach, much of the contract could not cross as data (Dates, closures, classes), quick entry was tied to the TS
window's column pairs, and the app copied rules (the tasks file's default, the iPhone calendar file, `oneLine`).

## What moves where

- **`TaskReads`** (new, sync): every read TaskServiceImpl answered, over a `Snapshot` (the file normalized for today) or
  over the settings and the clock alone. **`TaskWrites`** (new, sync): every write as a `Write<R>`, the operation
  (`TaskRules`) and the answer it gives over the document before and after; writes that look first (toggles, rename,
  resize, toSection, a drop on a time, renameGroup) take a snapshot. **`TaskServiceImpl`** is the async shell: store,
  the cached reading, listeners, the undo history. One implementation of every read and write.
- `drops.ts`: `dropMoves`, the pure meaning of a drop; `runDrop` and `DropService` go.
- **`CalendarDay`** (new, sync): a day's events, the sources' statuses, the known calendars, which are hidden, the
  phone's one-time carry-over, over files already read. `CalendarServiceImpl` reads and fetches around it.
- **`QuickEntry`** (new, sync): every rule of the quick entry over `EntrySession`, plain data (the field, the runs by id,
  the queued jobs); its writes are jobs (`call` → the service call, `shown`, `unshown`, `done`). **`QuickEntrySession`**
  keeps its API and runs the jobs on the write line. The view no longer says a `RightMode`: `EntryLook.shown()` gives the
  lists on screen in order (the look-in order and the plus follow from it). `RightMode` moves to `src/ui/viewSettings.ts`,
  the window's own; `SHOWN_LISTS` (ui/screens.ts) maps a place to its lists. `DropColumn` stays: it names the product's
  lists (the day's list, Soon, Inbox, Backlog), not a layout.
- `SectionNameEntry` over the pure `sectionNameEnd`.
- `settings.*`: SettingsServiceImpl itself over the `data.json` handed in, through a store that applies each update at
  once; a write answers the new `data.json`, unknown keys kept. `bindClientSecret` (an Obsidian text field) is the host's.
- **`UndoSteps`** (new, sync): the steps as patches, `UndoState` as plain data (`TextPatch.hunks` / `TextPatch.of`);
  `UndoHistory` keeps one while the plugin runs.
- `tasksFilePath(settings)` (documentText.ts): the setting, none for a blank one; compose.ts reads the file by it.
  `phoneCalendarText` (calendarFile.ts): the iPhone app's calendar file from its plain lists.
- **The door**: `TaskCalendarPhone.call(method, argsJson, contextJson)` (`PhoneCalls.ts`), and `methods`, `tasksFile`,
  `iphoneCalendarFile`, `iphoneCalendarText`, `oneLine`. The seven old functions stay as they were. Reference:
  `docs/door.md`.

## Wire

Context: the tasks text (or null), `data.json`, `nowMs`, the calendar files' texts, the undo state. Answer: `{ ok,
result, tasks?, step?, history?, settings? }` or `{ ok: false, error: { code } }` (`staleTask`, `tasksFileMissing`,
`unknownMethod`, `badArguments`, `failed`). Times in epoch ms, dates `YYYY-MM-DD`. Subscriptions, polling, fetching,
the minute's check of the day and the order of the quick entry's jobs are the host's; "cached vs fresh" is two calls of
`calendars.events`.

## What stays exactly as it was

The TS UI's behaviour and the file it writes; the seven phone functions (`tests/phone/answers.test.ts`, snapshot
unchanged). One difference inside: `TaskServiceImpl.screen` reads the file once for every list, not seven times, so
the lists always agree (its read-count test says so).

## Guards

- `tests/application/PhoneCalls.test.ts`: every `tasks.*` call answers as TaskServiceImpl does over the same text and
  writes the same file; every `settings.*` call answers and writes as SettingsServiceImpl does; the door covers every
  method of TaskService, DayService, CalendarService, UndoService and SettingsService but the host's own (listed); every door method's answer survives a JSON round trip unchanged (`toStrictEqual`).
- `tests/architecture.test.ts`: the phone imports only contracts.ts and the door; every runtime value contracts.ts hands
  the UI has its door method (`DOOR_OF_RUNTIME`).
- `tests/phone/build.test.ts`: the bundle's functions, `call` and the new ones, with nothing of the host.

## The flaky answers test

`tests/phone/answers.test.ts` took ~1 s alone and 5–6 s under load. Without dropping a case: a reminder's action reads
the file once (`TaskRules.changeOf`), a document rebuilt during normalizing reads each line once (`parseTaskLine` keeps
the lines it read per set of markers), and `isValidLocalDate`/`daysInMonth` count without a Date. ~0.3 s alone, ~0.6 s
with every core busy. No timeout raised.
