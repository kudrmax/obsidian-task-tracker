# Layers T1: the last small decisions of src/ui

The final review of `src/ui` found twelve small decisions still made in the view. Each moves behind `contracts.ts`,
so the Swift frontend draws the same answers. What the user sees and what the file gets stay the same.

| # | Was in the UI | Now |
|---|---|---|
| 1 | `ListDrop.drop` built `list` / `group` / `nest` | The list answers `DropTo { kind: "place", column, place: ListPlace \| null }`; `drops.readDrop` reads it by `columnSections(column, day)` inside `TaskWrites.drop` (and `QuickEntry.openAtDrop`). The old kinds stay for the door. |
| 2 | `TaskMenu.writeRepeat`: write on close if `!sameRule`; Remove at once | `RepeatPage` (application): `change` holds, `remove` holds none, `close` writes `repeatPageEnd(own, held)`. Door: `repeatPage.end`. Quick bar unchanged (the session holds its rule). |
| 3 | counter tap `setCollapsed(key, !item.collapsed)` | `TaskService.toggleCollapsed(key)` |
| 4 | Reminder page from `REMINDER_KINDS`, `kind === item.reminder` | `TaskMenuModel.reminders: { kind, checked }[]` (empty without the Reminder row); names stay in the UI |
| 5 | `state.repeatDay ?? today()` | the bar draws the repeat panel only with a state, from `state.repeatDay` |
| 6 | FullScreen: never write an untouched editor; replace on an external change only unfocused with no write pending | `DescriptionDraft` (application) with pure `descriptionOpen/Typed/Save/Read`; the host keeps the debounce. Door: `description.*`. |
| 7 | resize refused when `!item.slot` | `TaskItem.can.resize` |
| 8 | snap steps and clamp in `ui/drag/snap.ts`, `zoomLevels.stepFor`, `LAYOUT.snapSteps` | `application/snapGrid.ts`; `TaskService.snap(minute, hourPx)`; the UI passes its `hourPx` |
| 9 | Day starts at 0–23, the recolour no-change check, "Fill in the client id" | `SettingsForm.dayStartHours`, `SettingsForm.googleClientReady`, `SettingsService.typedColour(of, index, text, shades)` |
| 10 | `main.ts` painted colours from raw `StoredSettings` | `ScreenSettingsImpl` (priorities, labels) and `ViewSettingsStore` (card size, paint) |
| 11 | `QuickField` tinted itself from its own `parseTitle` | only the session's `marks.tint`, which is null for a section's name |
| 12 | `tests/uiDecides.test.ts` | also watches `switch (x.status)`, `.includes(x.list)`, `!item.open`, `{ list, … } = item`; the one new hit (FullScreen draws a closed subtask) is baselined as drawing |

Behaviour kept exactly: a repeat page re-opened in the same menu keeps the change it held; a colour code left
unchanged or invalid shows the colour's code again without a redraw; a drop with no gap is the column's end.
