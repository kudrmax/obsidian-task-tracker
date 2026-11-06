# Plan: layers3-r3-lists

Spec: `docs/superpowers/specs/2026-11-06-layers3-r3-lists-design.md`. TDD: each step a failing test in tests/application
or tests/domain first, then the move, then the UI follows the answer.

1. `ListRow`, `ListGroup.rows`, `ListGroup.empty` in sections.ts; TaskList draws them; trash ui/listGroups.ts and its test.
2. `cardDue` in application; TaskCard draws it.
3. `TaskService.reveal`; the view calls it.
4. `sameSlot` to domain; Timeline asks `isToday` (relation) and draws slotted as given; DayEvents `allDay`/`timed`;
   SearchWindow's trim goes; `SourceStatus.updatedDay`; `listName(SectionKey)`.
5. `DropTo` `time`, `TaskService.dropSpan`; TimelineDrop gives the start; the new-slot field takes the answered span.
6. `GROUPED_LISTS`; deterministic order in calendarChoice.
7. Widen uiDecides; baseline the drawing hits with a comment.
8. docs/plugin for the visible changes; merge origin/master; full suite and build; check in the test Obsidian.
