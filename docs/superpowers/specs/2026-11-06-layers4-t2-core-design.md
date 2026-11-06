# layers4 t2-core: the backend's last loose ends

A refactor of the core behind the door; what Max sees and what the files get stay the same, except the dead API removed.

## What moves or goes

1. **One rule for shown calendars.** `hiddenCalendars` (CalendarDay.shownChange) is the only rule. `GoogleAccount.listCalendars/setShown/isShown`,
   `CalendarOption`, the `GoogleCalendarList` port and `GoogleCalendarApi.listCalendars` go: no screen calls them. `google.calendarIds`
   stays in the settings, read only by the migration. `SettingsForm.workCalendars` and `SettingsService.setWorkCalendars` go (the
   tab never showed them; `workCalendarTitles` is read only by the migration). The door loses `settings.setWorkCalendars`.
2. **Door completeness.** `DOOR_COVERAGE` in PhoneCalls.ts names, for every interface of contracts.ts with a method, the door's
   space and the methods left to the host, or why the whole interface is the host's. The test derives the interfaces from
   contracts.ts; `interfaceMethods` reads methods, generic methods and properties of a function type. ScreenSettingsStore's
   `get` is offered as `screen.settings`. GoogleAccount and WorkCalendarSetup are host-owned (network and browser; Scriptable
   and Shortcuts).
3. QuickEntrySession passes the call's `repeat` as QuickEntry gave it (already null for a slot).
4. `DoorContext.fetched` names the sources the host fetches itself (`["google"]` when left out); `calendars.isPast` and
   `WireEvent.past` are CalendarDay.isPast.
5. `Call` keeps the settings text it read (`""` when the context has none): a write without `settings` in the context works.
6. `plainJson(value)` serializes the answer; strict, it throws on a Date, an undefined field, a function, a class instance or a
   number JSON cannot hold. `callDoorJson(..., strict)`; the tests call it strict.
7. Time zone: device local time stays the rule. The door's and the phone's answer tests also run under TZ=Asia/Novosibirsk and
   TZ=America/New_York (vitest projects); the core guard bans `Intl`, `localeCompare` and `toLocale…`.
8. `CalendarEvent.color` is `string | null`: the file reader and the Google feed leave a missing colour null; `src/ui/eventColors.ts`
   picks the per-source fallback (the same blues as before). `ScreenBehaviour` stays shared: a phone frontend's drag and day
   opening read it (offered through `screen.settings`).

## Must stay the same

Every TaskCalendarPhone legacy function's answers (answers.test.ts unchanged); every door answer but the removed method and the
new `color: null` for an event whose file gives none; the drawn colours of events.
