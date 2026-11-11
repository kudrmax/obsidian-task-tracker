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

### Backend

1. **One list type.** `EntryList` (`DropColumn | "projects"`, `core/application/screenPlaces.ts`) is every list the field
   can stand in; `ENTRY_LISTS` is built from a `Record<EntryList, true>`, so a list added to the type must be added there
   or the core does not compile, and `find`/`holder` walk `look.shown()` then the rest of `ENTRY_LISTS` (the hardcoded
   `ALL_COLUMNS` is gone). `EntrySpot` `list`, `EntryLook`, `PlaceMove`, the jobs and `QuickEntrySession` take an
   `EntryList`. `rules.shownEntryLists(place)` is what `look.shown` is: `["projects"]` on Projects, `SHOWN_LISTS`
   elsewhere (`SHOWN_LISTS` and `shownLists` keep their meaning for the funnel).
2. **The Projects list's look comes from the core.** `rules.projectsEntryLook(view)` → `{ cards, sections, parts }`:
   every row of every part as a `ListCard` (`key`, `id`, `level`, `group` = the part's `ProjectsSection.group`), the
   parts' groups in order, and each part's `EntryPart` `{ group, newTask, plus }`. The frontend hands these in as the
   look of list `"projects"` (`EntryLook.parts`, new and optional; on the wire `look.parts.projects`) and builds nothing.
3. **A new task in the Projects list is written where its part writes, placed by the file when it is written.**
   `NewTaskPlace` gets `{ kind: "projects", group, before, placement? }` (`ProjectsPlace`); `createInPlace`/
   `createWithId` read the Projects screen as the file stands at the write (`projectsNewPlace`): the list is the part's
   `newTask` list (By project Inbox; By stage the stage's, Today = Now dated today), or the bar's chosen place; the task
   goes right after the nearest card of that list above the field in the part (before the next task of that card's
   section in the file), else right before the nearest one below, else at the list's end. So By stage the card lands
   exactly where it was typed; By project it lands among the part's Inbox cards (the part sorts by stage), the field
   staying where it is. The project is the field's own (`createInPlace`'s sixth argument), which a new task's field
   starts with from its part (`newTask.project`); a subtask's place is the lists' `subtask` place, no project. A part the
   screen lacks, or Done's (no `newTask`), rejects with StaleTaskError. The frontends' job runners need no change: the
   call is still `createInPlace`.
4. **The bar's place does not turn the Projects screen.** `choosePlace` on a field in the Projects list keeps the field
   where it stands, keeps the chosen `Placement` on the field (`EntryField.placement`, carried by every line Enter
   queues, `EntryLine.placement`) and answers `{ column: "projects", day: null }`; `placeShowing("projects", any)` is
   `"projects"`. A rename moved this way is written with that placement. `state.place` shows the part's place until one
   is chosen.
5. **The plus tapped on Projects** (`openFromPlus`) types at the end of the part marked `plus`: the part that writes the
   screen's own `ProjectsView.newTask` (a project's own part; No project's part; By stage Inbox), else the first part
   that writes one (All By project: the first project's part). `openAt(column, listPlace)` (new) is the plus let go at a
   place of a list; `openIn("projects", group)` the No tasks plate.
6. **A task shown in two parts** (By project, two projects) is renamed in the first part that shows it; both its cards
   hide while the field is open, as a renamed task's card hides in every list.
7. **The core's audit of screen turns.** The only core rules that send the screen to a funnel place are `placeShowing`
   (the entry's place move, fixed by 4 and by every spot now being the Projects list while it shows), `stepScreen` (a
   swipe or an arrow: Max's own move) and `screenOf`/`reveal` (a search pick: the found task's place, which the search
   asks for). Menu moves, undo and drops in the Projects list decide no screen in the core (`dropInProjects` lands on
   the Projects screen); any turn there is a frontend's path to remove. The search pick is left as it is.
8. **The plugin still compiles unchanged in behaviour:** `QuickEntryController`'s look answers no cards for
   `"projects"` (a type-only adaptation), so the plugin must now wire the Projects list in (its look from
   `projectsEntryLook`, `shown` from `shownEntryLists`, `listEntry("projects")` drawn in `ProjectTasks`, `coming` for
   it, the plate and the plus through `openIn`/`openAt`/`openFromPlus` instead of `askTaskText`).
9. **Whether the plus opens anything is the core's** (the plugin's Obsidian decision 4, moved into the core). On a screen
   whose shown list writes by parts (the Projects list) with no part marked `plus` (Done; a folder once folders land),
   `openFromPlus()` opens nothing, never the hidden Inbox, and answers `false`; `true` when a field opened. The ready
   answer before the tap is `plusOpens()` (`QuickEntrySession.plusOpens()`, door `entry.plusOpens(session, look)` →
   `value`), the same rule; off Projects it is always true. A frontend reads it instead of looking at `EntryPart.plus`.

### iPhone app

1. **The app's Projects list is the core's list, one mechanism with the funnel's.** `QuickEntryHost` hands the Projects
   list in as list `projects` (`look.cards/sections/parts.projects` from `rules.projectsEntryLook`, `shown` from
   `rules.shownEntryLists`) and keeps every list's field by the core's list name (`EntryList`), so the funnel columns and
   the Projects list go through the same `listEntry`, pending lines, heirs, jobs and `shown`/`coming`. A job written on
   Projects reads the Projects screen with the board and draws both in the job's one transaction, so a typed line becomes
   its card in place. Before, Rename and Add Subtask from a Projects card opened the field in a hidden funnel column
   (nothing showed), and the plate and the plus let go there asked the name in an alert and wrote it to the end of Inbox.
2. **The app's Projects list draws the core's `rows`**: the cards with their open subtasks under them, the branch lines
   as a list's, so the field's place (an index among the look's cards, which are the rows) is the place drawn, and a
   subtask can be renamed or typed under its card there. Before, the app drew `cards` only (no subtasks).
3. **The plus tapped on Projects types in place** (`openFromPlus`, after `plusOpens`; under Done it does nothing, the
   plus staying as it is). Elsewhere the plus still opens the app's new-task screen (text or voice), which the app has
   in place of the plugin's plus-at-the-end; the widget and the Action button still open that screen on Projects too.
4. **The plus let go above every part** opens the field before the first card of the first part (`openAt` with that
   card's key); let go in a part, at the part's end; a part that writes no task (Done) takes nothing and the plus flies
   home, as before.
5. **A rename's new title shows on a Projects card by the task's id** (`renamedTexts[item.id]`): a Projects card is
   drawn per part, its own id is not the task's.
6. **Audit of the app's screen turns:** the only paths that move the ribbon are a tab tap or a swipe (Max's own), the
   search's pick (`tasks.reveal`, left as it is, as the core's Decision 7), a card's folder mark (opens Projects), and the
   entry's place move (`choosePlace`), which on Projects answers `projects` and turns nothing. Menu moves, Undo and drops
   write and read again; none moves the ribbon.
