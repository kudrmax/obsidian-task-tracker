# The entry field on the Projects screen

Max, 2026-11-11: «Rename для задач не работает в проектах… Это значит у тебя задачи нахардкожены. Чини корень проблемы».

## The root

The quick entry (the field a card becomes on Rename, a new task's field, a subtask's field) can stand only in the
funnel's lists: `EntrySpot` `{ kind: "list", column: DropColumn }`, `QuickEntry.find`/`holder`/`renameSpot` look only in
`DropColumn` cards, and the plugin wires an entry into each funnel column by hand (`entryIn("day" | "inbox" | …)`). The
Projects list is not a place the field knows, so Rename from a Projects card opens the field in a hidden funnel column:
nothing shows, and the first key typed turns the screen to that funnel column (Max: «визуально ничего не происходит, а
потом, когда начинаешь печатать, он перекидывает на обычные виды»). The Projects plate's new task takes a path of its own.

## What Max gets

1. On the Projects screen, every entry works where the card is, as in the lists: Rename turns the card itself into the
   field with its text (both modes, subtasks too); Enter writes the new title, Escape/blank cancels; Add Subtask opens
   the field under the card; a tap on a No tasks plate and the plus let go in the list open the new task's field there,
   written where that part writes (its project, its stage), Enter keeps typing the next one as in the lists.
2. One mechanism: the entry knows «a list» abstractly — the funnel's columns and the Projects list are both lists it can
   stand in, found by the card's key where the screen shows it (the Projects list first when the Projects screen is
   shown). No per-screen copy of the field, no hardcoded list of columns where a new list would be forgotten again.
3. **Nothing done on the Projects screen ever turns the screen to the funnel** (Max: «это относится ко всем абсолютно
   действиям. Не нужно вот это перекидывание»): rename, Add Subtask, typing, a menu's moves (Today, Tomorrow, Pick a
   date, Section, Project, status, priority, labels, repeat, description), undo, a drop — the screen stays on Projects,
   on the same node and mode, and the changed card is shown there. Audit every path that turns or scrolls the screen
   to a task's column (the field's turning, «show the landing», reveal-after-write) and make the Projects screen a
   place they respect.
4. The iPhone app gets the same through the core (its Projects page: Rename and the plate/plus entry where the card is),
   or, if the app's entry is built otherwise, the lead records what it does.

## Decisions

(per side, numbered)
