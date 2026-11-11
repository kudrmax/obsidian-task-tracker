# Results

Status: approved by Max on 2026-11-11 (his own design, in his words below; the two small points marked «Max: всё так»
were confirmed). Built overnight without questions: every gap is decided by the agents and written under «Decisions».

The research behind it: https://claude.ai/artifact/P3muQM2rNQQHQ7YP2LgRTp. In short: Max's tasks file is chaotic
because a new task is born alone, while what it belongs to hides as a subtask of some task, in another column or in
another project. A result is how he groups the steps of one multi-step outcome, and how he adds a step to it quickly.

## The idea, in Max's words

A result **is a task**. A special one, which Max reads as a multi-step result, but a task: everything that applies to a
task applies to it (a project, a section, a priority, labels, a date, a repeat, moving, the calendar, search, the full
screen, undo, multi-select). No new logic beyond the three points below.

1. **The mark.** «Make result» in the task's menu turns a task into a result. In the file it is a mark at the start of
   the line, like a priority's prefix; the mark is a setting. A result moves through the funnel **whole**, with its
   subtasks: all of it in Soon, or in Backlog, or in Today.
2. **How it is drawn.** A result's subtasks are folded by default. Its card shows, on top and small, the result's own
   title, and as the card's title its **first open subtask**: the step to do next. Unfolded (a tap on the counter, as
   for any task with subtasks), it shows all its subtasks as a plain parent does; they can be reordered, added, done.
3. **Adding to a result.** «Add to result» in the task's menu, like Project: a page with every open result, a search
   field over them, and «New result…» to make one right there. The task becomes the result's last subtask.

## What Max gets

1. **Make result / Make task.** In the menu of every open task and subtask (subtask is just an indent): «Make result»;
   on a result the same row reads «Make task» and takes the mark off. Making a result folds it (`📁`) when it has open
   subtasks. Making a task leaves the fold as it is.
2. **The file.** The mark is the line's first word, before a priority's prefix: `- [ ] 🎯 p1 Компания в Белграде 📁
   🗂️ [[Окружение в Сербии]]`. The default mark is `🎯`. A task whose text starts with the mark (a whole word followed
   by a space) is a result wherever it lies, Done included. The mark never shows in a title: not on a card, in the menu,
   in search, on the calendar, in the full screen, in a reminder, nor in Rename's field.
3. **The setting.** «Result mark» on the settings page where the priorities are: a one-word text, `🎯` by default.
   Changing it changes only what is read as a result from then on; existing lines are not rewritten (as with a
   priority's prefix). An empty or multi-word value is not used (the previous stays), as with priorities.
4. **The folded result's card** (in every list and on a day's list): above the title, one small line in the caption
   colour, a target symbol and the result's title (like the full screen's parent line). The card's title is the
   result's first open subtask, in order, at any depth that is folded with it: the first open direct subtask, and if
   that one has open subtasks of its own, its first open one, and so on. The card keeps the result's own marks (counter
   `2/5`, project folder, date, repeat, description) and the result's priority colour and labels. The card is as tall as
   a card with a parent line (it does not grow further).
5. **Taps on the folded result's card.** A tap on the small result line opens **the result's** menu. A tap anywhere
   else opens **the shown step's** menu: Done there closes the step, and the next open step becomes the card's title
   (Max: всё так). The counter's tap unfolds it, as for any task. Multi-select selects the result, as a tap selects a
   task. Dragging the card moves the whole result.
6. **No open steps.** A result whose subtasks are all done (or that has none) is drawn as an ordinary card with its own
   title; Done in its menu closes the result (Max: всё так). It stays a result (the mark stays), so the next added step
   shows again on top.
7. **Unfolded result.** A plain parent card with the result's title in semibold (the only mark that it is a result),
   its subtasks below as today. Folding it again shows the step on top.
8. **The calendar.** A result on the calendar is a block like any task's; the block's title is the shown step (point 4),
   or the result's own title when it has no open step; the menu on the calendar is the shown step's, with the result's
   open subtasks above it as today. The result line is not drawn in a block (no room).
9. **Add to result.** A row in the menu of every open task and subtask, results included, next to Project; on the right,
   the nearest result the task is a step of, or nothing. The page leaves out the task itself and the results inside it. It opens, in place of the menu, a page: a search field on top
   (typing filters the results by title, case-insensitive), then every open result in the file in file order (Inbox,
   Now, Soon, Backlog), each with the symbol of its place (the column icon) and its project's name as a small line
   when it has one, a tick on the result the task is in; «New result…» last, apart. Choosing a result moves the task
   (with its subtasks) to the end of that result's subtasks: it leaves its own place and goes where the result is.
   Choosing the ticked one does nothing.
10. **New result…** asks the name (a field like New project…). Enter writes a new result at the task's place, with the
    task's project, and the task (with its subtasks) as its only subtask, folded. Empty or Escape: nothing.
11. **Multi-select.** The bulk menu gets «Add to result» too: the chosen tasks go, in their file order, to the end of the
    chosen result's subtasks (subtasks of chosen tasks travel with their parents and are not moved twice); «New
    result…» makes one at the first chosen task's place and moves all of them into it.
12. **Undo**: each of these is one step.
13. **The app** (apple/): the same card, the same taps, the same menu rows and page (stock iOS: a searchable list), the
    same setting, all from the core through the door.
14. **Docs**: `docs/plugin/file.md` (the mark), `tasks.md` (the menu rows, Add to result, the card's taps), `screen.md`
    (the result's card), `settings.md` (Result mark), `app.md` (the same in the app), `agents.md` (how an agent writes a
    result and adds a step).

## Not in this round

- A Result button in the quick entry's bar. A step is added to a result through the menu, or by the plus inside the
  unfolded result (a subtask, as today).
- Siri, Shortcuts, captures making results.

## For the agents

- The core decides everything (`docs/door.md`, «The UI decides nothing»): which tasks are results, the shown step, the
  two tap targets' keys, the menu rows and the page, the write of each action. Both frontends only draw and turn taps
  into calls. `core/settings.ts` and `contracts.ts` change in this feature; the door only grows.
- Plugin visual check (phone view and desktop, dark and light) in the test Obsidian; the app in a simulator taken with
  `~/.claude/bin/ios-sim take` and given back with `release`; never attach a debugger to the app.
- Boards: the card is the canvas's two-line card (Drag4 in the projects canvas): an 11 px caption line with an 11 px
  target symbol over the 15 px title, the card 44 px tall.

## Decisions

(The agents write here the gaps they decide.)

### Backend

1. **Reading the mark.** A result's mark is the line's first word followed by whitespace, before a priority's prefix.
   `🎯Компания` (no space), `p1 🎯 Компания` and a line of the mark alone are not results; the mark stays their text.
2. **Typing the mark.** The mark typed first in any title (the quick entry, Rename, the task sheet, New result…'s name)
   makes a result and never stays in the text, as the file would read that line anyway. A rename never takes a result's
   mark off (only Make task does). A title of the mark alone, or of the mark and a priority's prefix, is blank: nothing is
   written (`isBlank`).
3. **The setting.** `resultMark` in `data.json` (after `projectTag`), `🎯` when missing or not text. `setResultMark`
   writes it trimmed only when it is one word that is no usable priority's prefix; otherwise the saved one stays. A saved
   mark that later equals a level's prefix (the level renamed) reads no results until it is changed: one word can't mean
   both.
4. **Semibold.** A result drawn with its own title is semibold: unfolded, and also with no open step (point 6), so a
   result stays recognisable whenever its card doesn't show a step. A closed result shows its own title, never a step.
5. **When a step shows.** Only an open result shows a step. A list's card is two-line only while the result is folded;
   the timeline's block shows the step folded or not (it has no unfolded state). The full screen draws every row with
   its own title.
6. **The menu rows.** They are not new `MenuEditId`s but `TaskMenuModel.result.rows`, drawn right after Project:
   `addToResult` («Add to result»), then `toggle` («Make result» / «Make task»). Adding them to `edits` would break every
   frontend's exhaustive map of edit rows before it draws them. The bulk menu offers Add to result alone (point 11 names
   no Make result there), and only when every picked task is open; a closed task's menu has neither row.
7. **The page.** Results in true file order (by line), which is Inbox, Now, Soon, Backlog in Max's file. It offers open
   results that are subtasks too (a result is a task wherever it lies), never one in Done. The search matches the query,
   trimmed, as a part of the plain title, case and accents aside (`ё` is `е`). The tick: the nearest result every chosen
   task is a step of. The core gives the words: «Search results», «New result…», «Result name».
8. **Add to result.** The moved task keeps its own due date, slot, repeat, priority and labels; its own project field is
   dropped (a subtask's project is the result's), as a drop onto a parent does. A task under another chosen one goes
   along with it; a task already a step of that result (its nearest), the result itself and a task holding it stay. A
   key that names no open result any more is stale (the page was read before the file changed).
9. **New result….** Written right before the first chosen task in file order, in its section (for a subtask, among the
   same parent's subtasks); it takes that task's project and its due date (so it stays on the same day and list), no
   slot, repeat or labels; a priority's prefix typed first in the name is its priority. It answers the new result's key
   and id (`CreatedTask`).
10. **Folding on adding.** Add to result and New result… fold the result (its next step on top). Add subtask, the plus
    inside an unfolded result and a drop onto a result keep today's rule (a folded parent unfolds so the new subtask is
    seen); so «the next added step shows again on top» (point 6) is Add to result's.
11. **Repeat.** A repeating result's next copy keeps the mark.
12. **One line outside the core.** `obsidian/settingsFile.ts`'s key order gained `resultMark`, so `data.json` stays
    written byte for byte in its order (`tests/settingsFile.test.ts`).
13. **Rename of a hidden step.** A folded result's step has no card of its own; it carries `drawnOn` (its result's key
    and slot). `renameSpot` puts the field in the result card's place in a list (the deepest card holding the step),
    else over the result's block on the timeline. The entry's `renaming` then carries that card's key and id with the
    step's text, so the result's card or block hides exactly as a renamed card does, with no code of either frontend's;
    the write (`edit`) names the step. Enter writes the step and closes the field (a new line under it would be another
    hidden step).
14. **Add subtask on a hidden step.** `subtaskSpot` answers a list spot carrying `unfold` (the step's key); `open` turns
    it into an `unfoldAbove` job, run like any entry job, and once the lists draw the result unfolded the field stands
    last among the step's subtasks (the field closes if the write failed and the step is still hidden). A step with no
    card holding it (a result only on the timeline) gets the stack, as any task only on the calendar.
15. **New result… on a task with only a time** takes the slot's day as its due date (`dayOf`), so it stays on that day.
16. **No usable mark** (the setting a level's prefix): no result rows in any menu; `setResult(…, true)` and `newResult`
    write nothing.
17. **A search hit's card** is the task's own title (semibold for a result), never its step.
18. **What the frontends ask for the result fields:** `tasks.isBlank(name)` for New result…'s Create button, and
    `SettingsForm.defaultResultMark` (`🎯`) for the Result mark field's placeholder.

### Obsidian

1. **The two-line card's height.** The card height is a setting (28–40 px), so the folded result's card is that height
   plus its small line's 9 px: 44 px at the default 35 px. It stays a capsule (corners half its height) wherever it is
   drawn: in a list, as the menu's copy over the blur, and as the card under the finger (its stack layers too).
2. **The small line.** 11 px type at 13 px line height in the caption colour (`--tc-muted`; the level's meta tint on a
   coloured card, like the date), the target symbol as tall as the line's type, 4 px before the title, the title fading
   out at the end as the card's does. The step's title under it is the card's usual 15 px at 18 px line height; the two
   lines are centred in the card. The counter, project mark, description mark and date stay centred on the whole card.
3. **The two tap targets.** The result's target is the small line across the whole title column, from the card's top
   edge down to the line's bottom; everything else (the step's title, the padding, the right marks) is the step's, the
   counter and the project mark keeping their own taps. On the Mac a right click follows the same two targets, and a
   double click renames the task whose menu the first click opened.
4. **The step's menu keeps the card.** The copy over the blur is the result's two-line card as it stands in the list,
   never the step's own card, so nothing jumps; a label set in the step's menu doesn't repaint that copy.
5. **The timeline.** A tap, a held finger and a right click on a result's block all open the shown step's menu; the stack
   under the copy holds the result's open subtasks (the step among them). The block's title is regular weight, never
   semibold (a block has no room for marks); the block's grips still stretch the result.
6. **Search.** A found result shows its own title, on one line and semibold, never its step: the search picks out the
   words it found in that title.
7. **The rows' icons.** Add to result: Lucide `target` (the card's symbol). Make result and Make task: Lucide `goal`, the
   same both ways, as In progress and Stop progress share theirs.
8. **A long value on a row.** A row's value too long for its row (a long result's or project's name) now gives way and
   fades out at its end; the row's own word always stays whole. This changes Project's row too, which could overlap
   before.
9. **The Add to result page.** Its back row is titled by `MenuResult.label`. The search field is the search window's
   field on a tile's ground, in its own group. On the Mac the caret is in it at once and Enter takes the first result
   shown; on the phone a tap on it raises the keyboard (focusing it at once would cover the list). Each option: the
   column's icon in the caption colour, the title, the project's name small under it, the accent tick. A query that
   finds nothing leaves only «New result…», with no empty-state words. A tap on the ticked result closes the menu
   (the core writes nothing). Typing narrows the page in place, the panel growing or shrinking to it.
10. **New result….** Its page is New project…'s: back row «New result», the name field ringed in the accent with
    `namePlaceholder`; Escape or the back row returns to the results.
11. **Result mark** stands in the Priorities group, right under Add priority, as a text row with its description.
12. **The bulk menu.** Add to result stands in the edit group after Project (when the core offers it) and opens the same
    page and New result… as one task's menu.

### Swift

1. **The two-line card's height.** The card height is a setting, so a folded result's card is that height plus 9 pt
   (44 at the default 35), as the plugin's (Obsidian 1). Everything that stands a card in a list reads it per card
   (`BoardCard.listHeight`): the list's row, the places a drop reads, the carried card's middle, its branch line, the
   selection circle, the stack under the finger. On the timeline a block is never two lines.
2. **The small line.** SF Symbol `scope` (the card's target) at 11 pt semibold and the result's title at 11 pt on a
   13 pt line, in the card's meta colour (the caption colour, or the level's tint on a coloured card), fading at its end
   as a title does; the two lines are centred in the card, the counter, folder and date centred on the whole card.
3. **The two tap targets.** The result's menu: the small line across the whole title column, from the card's top edge
   to just under the line (Obsidian 3). Anything else (the step's title, the padding, the right side) opens the step's
   menu; the counter, the folder and a title's link keep their own taps. The menu's copy is the result's two-line card
   as it stands (Obsidian 4).
4. **The step's menu** is the core's `tasks.menu` for `card.step`, asked from the card's own column (a list's, or
   `timeline`), precomputed with the screen as every card's menu is; it offers Add Subtask, no Section (a subtask).
5. **The timeline.** A tap on a result's block opens the shown step's menu with the result's open subtasks stacked over
   it (Obsidian 5); the block's title is regular weight, never semibold. A long press stays the drag, as for any block.
6. **Own titles.** Every card draws the core's `TaskItem.card` (`CardFace(item.card)`): the full screen's and a search's
   items carry their own title, semibold for a result, never a step (backend 17); Done's a closed result's own title.
7. **The rows' symbols.** Add to result: `scope` (the card's). Make result: `target`; Make task: `circle.dashed`. The
   row words are the core's (`MenuResult.label`, `toggle.label`), Add to result's value its subtitle, which the system
   menu truncates at its end.
8. **The Add to result page** is a sheet (medium, then large), as Pick a Date is: a `NavigationStack` titled
   `MenuResult.label`, the system search field always shown under the title with the core's placeholder, an inset
   list of the core's options (the column's SF Symbol in the secondary colour: Inbox `tray`, Now `sun.max`, Soon
   `hourglass`, Backlog `archivebox`, read aloud as the list's name from `tasks.listName`; the title on up to two lines;
   the project as a folder and its name in footnote under it; the accent tick), and «New result…» with a plus in a
   section of its own. Typing asks the core again (`tasks.resultPage`) after 120 ms. A query that finds nothing leaves
   «New result…» alone, no empty-state words (Obsidian 9). A pick closes the sheet and writes `tasks.addToResult`, the
   ticked one too (the core writes nothing).
9. **New result…** asks as New project… does: an alert «New Result» with a field (the core's `namePlaceholder`),
   Cancel and Create (Create off while the core's `tasks.isBlank(name)` says so: empty, the mark alone, a priority's prefix alone; backend 18); Create closes the page and writes `tasks.newResult`.
10. **Result mark** is its own group right under Priorities on the Settings sheet (a text row «Result Mark», the core's `defaultResultMark`
    as its placeholder, saved on Return and on leaving, as Project Tag is; a mark the core refuses puts the saved one
    back), with a footer saying what it does and that existing lines aren't rewritten. iOS groups unlike rows apart, so
    it is not a row inside the Priorities list (Obsidian 11 puts it in the plugin's Priorities group).
11. **The bulk menu** draws `result.rows` after Project as one task's menu does; its Add to result opens the same page.
12. **A hidden step's rename** (backend 13). The field stands in the result card's place as the core says; once
    entered and until written, the two-line card's title draws the step's pending text (`renamed` by the step's id) and
    its small line the result's own (by the result's id); a block draws the step's. Add Subtask on a step (backend 14)
    runs the core's `unfoldAbove` job as any entry job: written, the lists read again, the field under the step.
13. **A nested folded result in the calendar's stack** follows the two taps (Obsidian's `cardMenuTask`): its row is its
    step, titled by the step with the result's title under it, and opens the step's menu, which starts with the result's
    own row (`scope`), opening the result's menu. A menu row can't hold two targets, so the result's is the first row of
    the step's page.
