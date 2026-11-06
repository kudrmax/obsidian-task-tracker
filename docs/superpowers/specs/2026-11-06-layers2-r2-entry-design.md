# R2 entry: the last entry decisions out of the UI

Final review after S1–S10 found entry rules still in `src/ui`. This moves each into `src/application`; what the user sees and what the file gets stays the same.

## What moves where

1. **Full screen typing** (`ui/full/FullScreen.ts`) ran its own small quick entry. It now drives a `QuickEntrySession` with stack spots, as a calendar menu's stack does: a new subtask is `open({ kind: "stack", parent })`, a rename (title or subtask card) is `open({ kind: "stack", parent: item.key }, item)`. Enter, blank Enter, a tap elsewhere, Escape and blank renames are the session's rules. The screen only decides where to draw (the title for the task on screen, else the card's place from `FullTree`). Renames go through `TaskService.edit` like every other rename; the session tells its view `renamed(was, now)` so the full screen keeps reading the task by its fresh key. Lines entered and not yet written now show under the field as in the stack (they did not before; nothing else changes).
2. **Quick bar** (`ui/quick/QuickBar.ts`): the session's `EntryState` reports `indents`, `markable`, `repeatable` false and `place` null while the field writes a section's name; `places` is a ready list of `PlaceChoice` tiles (the lists, then Date with the field's day). `DraftMarks.tiles` gives every level and label with `on` and `enabled`. The bar no longer reads levels or labels itself.
3. **Tint**: `DraftMarks.tint` (the priority's colour, else the first label's) for the field and the flag; `TaskItem.colors` (the priority's alone, else each label's) for cards. Both come from `application/marks.ts` (`draftMarksOf`, `markColors`), used by the service and the fakes.
4. **Section name field** (`ui/GroupNameField.ts`): `SectionNameEntry` in application says Enter gives the typed name, Escape and a tap elsewhere keep the old one (unlike a task's field), and that it ends once.
5. **Blank rule**: `TaskRules.edit` uses `isBlank` (a priority prefix alone is blank) as create and rename do. Section names keep the plain blank rule (`blankName`): a level's prefix is a fine section name. The phone door's capture (`placeNew`) is untouched.
6. **Description**: the full screen sends the description only once something was typed since the last write (UI state: it never writes an old text over a change made elsewhere); whether the same text writes anything is the service's rule, so the screen's own comparison is gone. Status → look (`is-closed`, `is-done`) is drawing and stays.

## Contract changes

- `TaskItem.colors`, `DraftMarks.tint`, `DraftMarks.tiles`, `MarkTile<T>`.
- `TaskService.edit` resolves to the task as it now stands (fresh key) or null when nothing was written.
- `EntryState.markable`, `EntryState.places: PlaceChoice[]` (was `GroupedList[]`), section-mode answers for `indents`, `repeatable`, `place`.
- `QuickEntryView.renamed?(was, now)`.
- `SectionNameEntry` (runtime re-export, listed in `CONTRACT_RUNTIME`).
- `TaskCalendarPhone` unchanged.
