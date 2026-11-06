# R2 entry: plan

1. Contracts: `TaskItem.colors`, `DraftMarks.tint/tiles`, `edit` answers the task, `PlaceChoice`, `markable`, `QuickEntryView.renamed`, `SectionNameEntry`.
2. `application/marks.ts`: `draftMarksOf`, `markColors`; service, `toItem` and fakes use them. Tests: tiles, tint, colors.
3. `TaskRules.edit`: `isBlank`, tracks where the task went (`EntryTags`); service returns the item. Tests: answer, blank prefix.
4. `QuickEntrySession`: section-mode answers, place tiles, `renamed` after an edit. Tests.
5. `SectionNameEntry` + `GroupNameField` on it. Tests.
6. UI: QuickBar draws state only; controller and TaskCard read `tint`/`colors`; FullScreen on a `QuickEntrySession` (stack spots), description sent only when typed.
7. Tests and build green; docs/plugin full-screen lines; check in the test Obsidian (phone, desktop, light, dark): quick add on the main screen, bar in section mode, full screen title rename / Escape / blur / subtask entry / blank Enter.
