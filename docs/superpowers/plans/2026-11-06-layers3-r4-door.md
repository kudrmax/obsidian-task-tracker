# Layers 3, R4: one door for every frontend — plan

Spec: `docs/superpowers/specs/2026-11-06-layers3-r4-door-design.md`.

1. `TaskReads` (sync reads over a snapshot of the normalized file) and `TaskWrites` (each write as an operation plus the
   answer it gives once it ran); `TaskServiceImpl` becomes the shell over them, the store, the cache, the listeners and
   the history. The whole TaskService suite stays green unchanged.
2. `calendarDay.ts`: a day's events, the sources' statuses and the known calendars from files read, synchronous;
   `CalendarServiceImpl` builds its answers with it.
3. Quick entry: `QuickEntry` (sync core, its state plain data, its writes as jobs) and `QuickEntrySession` (the async
   shell: the write line, the lists' freshness). The view says which columns it shows (`shown()`), not a `RightMode`;
   `RightMode` leaves application for ui. `SectionNameEntry` over a pure `sectionNameEnd`.
4. The door: `TaskCalendarPhone.call(method, argsJson, contextJson)` over every TaskService, DayService, CalendarService
   method a frontend needs, history by patches of texts, the pure rules, the quick entry and section-name sessions as
   JSON state; `tasksFile`, `iphoneCalendarText`, `oneLine` for what Swift copies today.
5. Guards: every door answer survives a JSON round-trip; the phone imports contracts and the door only; the door lists
   every method of the services it covers.
6. The answers test fast: one read of the file per reminder action, `isValidLocalDate` without a Date.
7. Docs: the spec and `docs/door.md` for the Swift side. Build, full suite, the iOS app's tests against the new bundle.
