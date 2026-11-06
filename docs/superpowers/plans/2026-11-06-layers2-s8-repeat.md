# Plan: layers2 S8 repeat

1. Domain tests: `repeatParts`, `Repeat.anchored`, `problemWith` public (tests/domain/Repeat.test.ts); `repeatDay`, `repeatDraft`, `editRepeat` (tests/domain/RepeatDraft.test.ts). Implement.
2. Application: `TaskItem.repeatDay` in `toItem` (boundary passed in), tests/application/taskItems.test.ts; `QuickEntrySession` uses `repeatDay`. Contract re-exports + CONTRACT_RUNTIME.
3. UI: RepeatPanel takes `draft`, uses `editRepeat`; repeatLabel from `repeatParts`; TaskMenu repeat lines and QuickBar renderRepeat. Update UI tests; fixtures' `onDay` fills `repeatDay`.
4. Lower TaskMenu.ts in tests/uiDecides.test.ts. docs/plugin/tasks.md: the new rule's defaults.
5. npm test, npm run build; test Obsidian (port 9561): menu and quick bar, phone and desktop, light and dark.
6. Merge origin/master, test, build, commit, push branch.
