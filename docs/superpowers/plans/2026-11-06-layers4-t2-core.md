# layers4 t2-core plan

1. Tests first: Call without settings writes; strict plainJson refuses a Date/undefined; coverage derived from contracts.ts; interfaceMethods parser on generics and function properties; door `fetched`; Intl guard; TZ projects with an offset check.
2. Remove the dead Google API and workCalendars (contracts, services, door, tests, docs).
3. QuickEntrySession repeat; CalendarDay.isPast in the door; `fetched` in the context.
4. `color: string | null`; fallback in ui/eventColors.ts.
5. `screen.settings` in the door, DOOR_COVERAGE, door.md.
6. Full suite, build, swift test in ../task-calendar-ios with the bundle, restore.
