# Plan: layers2 S3

1. `QuickEntrySession` in application from `ui/quick/QuickEntry.ts`, plus the controller's placement, place button, priority choice, open spots, find, drop mapping and the bar's toggles, places, repeat day. Export from contracts; `CONTRACT_RUNTIME` gets `QuickEntrySession`.
2. Controller builds the session over the view (cards, sections, sectioned, day, today, mode, fresh, onChange) and a `WriteQueue`; QuickBar's state is a `Pick` of `EntryState` and its callbacks report taps.
3. Tests: QuickEntry tests to `tests/application`, new tests for each moved rule; `WriteQueue` tests to `tests/ui/WriteQueue.test.ts`; QuickBar tests follow the report-only taps.
4. `tests/uiDecides.test.ts`: QuickEntry.ts and QuickEntryController.ts lines go (0 hits).
5. Merge origin/master, full suite and build, check in the test Obsidian (phone and desktop, light and dark).
