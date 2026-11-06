# Layers 2, S3: quick entry rules in application

## Why

The quick-add rules (spec §4.2–4.9) lived in `src/ui/quick/QuickEntry.ts`, `QuickEntryController.ts` and `QuickBar.ts`. The Swift frontend would have had to write them again.

## What moves

`src/application/QuickEntrySession.ts`, exported from `contracts.ts` (`QuickEntrySession`, `EntrySpot`, `EntryState`, `PendingText`, `PlaceMove`, `QuickEntryTasks`, `QuickEntryView`, `WriteLine`). It owns:

- Enter (rename saved and a new line under it, a level deeper when its subtasks show; blank rename cancels; blank Enter outdents, else closes; a slot takes one task; the next line drops priority, labels and repeat), a tap elsewhere = Enter, Escape.
- The shifts, the section switch (not in a rename, slot or stack, only where the column shows sections; a section goes to the top level).
- What the bar shows: `marks`, `place` (none for a subtask, slot or stack; a rename keeps its own until a place is chosen), `places` (Inbox, Backlog, Soon, Now), `repeatable` (not in a slot), `indents`, `repeatDay` (the field's day, else today).
- The bar's taps: `togglePriority` (a typed prefix gives way, a second tap takes it off), `toggleLabel`, `choosePlace` (the same place changes nothing; answers the column and the day the day column must open).
- Where a field opens: `openFromPlus` (day column, Inbox while the window shows Inbox), `openAtEnd` (last section, top level), `openIn`, `openSlot`, `openAtDrop` (a drop result to a place), `subtaskSpot`, `renameSpot`; a task is looked for in the columns the window shows first.
- The column-to-place mapping (`placeOf`), the optimistic lines waiting under the cards, the renamed task's key after writes.

The UI keeps: drawing, focus, the keyboard glide, menus, the wheel, and the write queue (`WriteQueue`, passed in as a `WriteLine`).

## What stays the same

Everything the user sees and every line written. The QuickEntry tests move to `tests/application/QuickEntrySession.test.ts` unchanged in meaning; the controller tests pass unchanged. QuickBar now only reports taps (a tile's prefix, a label's name, a placement); the session decides.
