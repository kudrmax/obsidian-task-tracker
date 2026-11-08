# Task Calendar — plugin vs iPhone app: functional differences

Read on master 4b74f0bf. Sources: docs/plugin/*.md, obsidian/ui, core/application, apple/App, apple/Core/Sources.
Paths: P = obsidian/ui, A = apple/App/Board, C = apple/Core/Sources/Core.
Severity: MISSING (feature absent), WRONG (behaves differently / bug), LOOK (only appearance).
Fix: CORE (the rule/data must come from core/application or the door first), SWIFT (Swift alone).
KNOWN = already named by the lead.

## 0. Bugs found on the way (most severe first)

| # | What | Where | Sev | Fix |
|---|---|---|---|---|
| 0.1 | Repeat sheet breaks on any rule without a detail. Core's `RepeatDraft.detail` is `null` for After done and for unit Days (`core/domain/RepeatDraft.ts:59-62`); Swift decodes it as non-optional `String` (`C/BoardModels.swift:404`). Verified: JSONDecoder throws `valueNotFound`. Result: opening Repeat on a task with `every 3 days` or `… when done` shows an empty sheet; tapping After Done or picking Days does nothing (`A/BoardSheets.swift:190,199` swallow it with `try?`). The quick entry's repeat sheet has the same fault. | C/BoardModels.swift:404 | WRONG (bug) | SWIFT |
| 0.2 | Monthly day never shown: app tests `draft.detail == "dayOfMonth"`, core sends `"monthDay"`. | A/BoardSheets.swift:169 | WRONG (bug) | SWIFT |
| 0.3 | No clock while open: no minute tick, no day rollover. The now line stays where it was at the last read, an overdue task does not ride the now line, and at Day starts at the screen keeps yesterday as Today. Returning to the app only re-reads when the tasks file or settings text changed (`A/BoardModel.swift:237-246`, `A/BoardScreen.swift:57-66`), so the next morning the app can show yesterday's Now/Today until something writes the file. Plugin: every minute, plus `onDayChange` → normalize (docs/door.md `days.*`, file.md «Что плагин делает сам»). | A/BoardModel.swift:237; A/TimelineColumn.swift:263 | WRONG | SWIFT (core already has `days.today`, `tasks.normalize`) |
| 0.4 | Calendar file changes do not redraw: `reloadIfChanged` compares only tasks text and settings, so a fresh `calendar/google.json` or `iphone.json` arriving by Sync is not shown until the tasks file changes. | A/BoardModel.swift:245 | WRONG | SWIFT |
| 0.5 | Pick a Date on an undated task cannot pick today: the sheet opens on today and only a change of the selected day writes (`opened` == today). | A/BoardSheets.swift:66-75 | WRONG (bug) | SWIFT |
| 0.6 | «Description» in the full screen's own «⋯» menu pushes the same task's full screen again (`model.fullScreen.append(item)` from inside it). | A/TaskMenu.swift:97 | WRONG (bug) | SWIFT |
| 0.7 | Calendar sources are read once per app run (`calendarSources` cached forever): a changed Work calendar file path in settings is not followed. | C/TaskBoard.swift:171-176 | WRONG | SWIFT |

## 1. Card rendering

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 1.1 KNOWN | Links in titles drawn as links: `[[note]]`, `[[note\|alias]]`, `[text](url)`, bare `https://` show their word in the accent (file.md «Строка задачи»; P/TaskTitle.ts). | Raw text `Text(card.item.text)` (A/TaskCapsule.swift:28). | MISSING | CORE (title pieces: text/link/target) + SWIFT |
| 1.2 | Tap on a link in a title opens the note / address (P/TaskTitle.ts «The link a tap landed on»). | absent | MISSING | CORE + SWIFT |
| 1.3 KNOWN | Several labels: stripes or blend of up to 4 colours (screen.md «Карточка»; settings.md Several labels; P/TaskCard.ts:106 markColours). | Only the first colour (`colors.first`, C/BoardSnapshot.swift:347,374). | MISSING | CORE (labelPaint is a view setting in P/viewSettings.ts, not in the door) + SWIFT |
| 1.4 KNOWN | Label names with `_` shown as spaces. | Fixed on branch ios-labels (not on master: menu titles still `tile.mark.title`, A/TaskMenu.swift:60). | WRONG | in progress |
| 1.5 | Project folder icon on every card of a project task (lists, groups, timeline, subtasks), in the date's place (screen.md «Карточка»; P/TaskCard.ts:73). | absent; `TaskItem.project` not even decoded (C/BoardModels.swift:57-95); door context has no `projects` (C/TaskBoard.swift:156). | MISSING | CORE (project notes for the context) + SWIFT |
| 1.6 | Tap on the folder icon opens the project note; in Select mode it selects. | absent | MISSING | SWIFT (after 1.5) |
| 1.7 | Card height (28–40) and gap (0–10) from Settings → Cards. | Fixed 35 / 2 (A/Paint.swift:46-48). | WRONG | CORE (cardHeight/cardGap live in P/viewSettings.ts, not the door) + SWIFT |
| 1.8 | A long title shows whole in the menu and under the finger (card grows, P/wholeCard.ts, P/menu/LiftedMenu.ts). | The menu/drag preview is the same faded capsule (A/CardButton.swift:190-238). | MISSING | SWIFT |
| 1.9 | Search result rows are real cards (priority colour, due, counter, marks). | Plain grey capsule with title only (A/SearchScreen.swift:48-65). | LOOK | SWIFT |
| 1.10 | Full screen subtasks are list cards with priority/label colours and due (FullScreen uses TaskList). | `shades: nil, due: nil` — subtasks always grey, no date (A/TaskFullScreen.swift:160). | WRONG | SWIFT |
| 1.11 | Found card ring stays until the next touch anywhere. | Cleared only by touching a card or lifting one (A/ListColumn.swift:532, A/BoardModel.swift:608). | WRONG (minor) | SWIFT |
| — | In parity: title fade, due corner (core `rules.cardDue`), repeat mark, counter over description mark, in-progress dot, priority/one-label fill, collapsed peek, branch lines, timeline stack corner. | | | |

## 2. Task menu

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 2.1 KNOWN | Project row in every menu (single and bulk): projects A–Z, No project, check on current; subtask row disabled; value on the right (tasks.md «Меню задачи» 4; core `menu.project`). | absent (A/TaskMenu.swift:88-107 has no `project`; MenuProject not decoded). | MISSING | CORE (project notes in context) + SWIFT |
| 2.2 | Labels: menu stays open after a label tap, card re-colours live, to set another. | Label rows not `keepsOpen` → menu closes each time (A/TaskMenu.swift:59-61). Same in bulk «More» (MenuNodes). | WRONG | SWIFT |
| 2.3 | Description start shown over the card in the menu; tap opens full screen, tap on a link opens it (tasks.md, P/menu/DescriptionPeek.ts). | absent | MISSING | SWIFT (markdown rendering) |
| 2.4 | Timeline card with subtasks: its open subtasks between card and menu; tap a subtask → its menu (tasks.md). | absent | MISSING | SWIFT |
| 2.5 | Add subtask on a timeline card: stack under the lifted copy, field there (P/menu/TaskMenu.ts:272). | Opens the full screen instead (A/QuickEntryHost.swift:155-161; app.md documents it). | WRONG | SWIFT (or a spec decision) |
| 2.6 | Repeat row shows the current rule on the right ("Every 3 days", weekday letters). | «Repeat…» without value (A/TaskMenu.swift:99). | LOOK/MISSING info | CORE (words are built in P/repeat/repeatLabel.ts — move to core) + SWIFT |
| 2.7 | Repeat page writes once when the menu closes; there is no discard. | Sheet: ✕ discards, only ✓ writes (A/BoardSheets.swift:181-185). | WRONG | SWIFT (core `repeatPage.end` already) |
| 2.8 | Pick a date page marks today/the due date; Remove due date at the bottom. | In parity (DateSheet). See bug 0.5. | — | — |
| 2.9 | Section page lists in a project group the group's sections. | Grouping forced off, so always the whole list's (C/TaskBoard.swift:167-169). | WRONG (follows 5.x) | CORE context + SWIFT |
| 2.10 | Rename / New section inline. | Alerts with a text field (A/BoardSheets.swift:22; A/ListColumn.swift:382). | LOOK | — |
| — | In parity: groups order from core, statuses (Done, In progress/Stop progress, Won't do, Stop), confirmations, priorities, moves, Reminder page, Add subtask (lists), Open full screen, Open in Obsidian, Delete. | | | |

## 3. Lists & sections

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 3.1 | Tap on a section header opens its menu (Rename / Remove section); long press lifts it. | Tap does nothing; the menu is a long-press context menu sharing the long press with the lift (A/ListColumn.swift:374-381). | WRONG | SWIFT |
| 3.2 | Rename section: the name edits in place. | Alert. | LOOK | — |
| 3.3 | Done column left of Inbox, opened by search, its cards open the menu (screen.md «Колонка Done»). | absent: `screen.done` decoded and never drawn (C/BoardModels.swift:149); reveal of a Done hit goes nowhere (A/BoardModel.swift:403-411). | MISSING | SWIFT |
| 3.4 | Ribbon position remembered on the device. | Always opens on Today (`var place = .today`, A/BoardModel.swift:117). | WRONG | SWIFT |
| 3.5 | Wheel tap on an icon already in the window does not move; otherwise nearest position showing it. | Tab always goes to its fixed place (A/BoardModel.swift:126). | WRONG (minor) | SWIFT |
| 3.6 | Screen swipe: follows the finger and settles on the nearest place (may pass one). | Exactly one place per swipe (A/BoardScreen.swift:488-507; app.md says so). | WRONG (minor) | SWIFT |
| 3.7 KNOWN | Section row icon/look. | | LOOK | SWIFT |
| — | In parity: Inbox over Backlog halves, Soon undated only, day column (core), sections, No section header, No tasks plates + tap to type, empty sections, section lift/reorder, divider + remembered width, soft edges, subtask fold by counter. | | | |

## 4. Projects

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 4.1 | Backlog grouped by project by default, Soon optionally: header per project with chevron, fold (count when folded, remembered), arrow opening the note, A–Z, No project last, empty project groups in Backlog with «No tasks» (screen.md «Группы проектов»). | absent: grouping forced off (`ungrouped`, C/TaskBoard.swift:156,169); `screen.projects` not decoded. Max's Backlog looks different on the two. | MISSING | CORE (project notes for the context; the core already groups) + SWIFT |
| 4.2 | Tap on the Backlog / Soon title → menu with Group by project ✓. | absent | MISSING | SWIFT (core `tasks.setGrouping`, `grouping` handed back) |
| 4.3 | Drop into another project's group sets `🗂️`; drop on a folded group header → end of group; plus into a group writes the project. | absent (no groups) | MISSING | SWIFT |
| 4.4 | Section rename/remove inside a project group touch only that project's tasks. | absent | MISSING | SWIFT |
| 4.5 | Project view inside the project note (Obsidian block). | No project view in the app at all. | MISSING (needs a product decision) | CORE (project notes) + SWIFT |
| 4.6 | Bulk menu Project for all picked. | absent | MISSING | SWIFT (after 2.1) |

## 5. Drag & drop

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 5.1 | Drop on a column title (Inbox, Soon, Backlog, day header): end of its part without a section, project kept; title lights up (tasks.md table; core `screen.titleDrops`). | absent: only `list.*` and `timeline` places (A/BoardModel.swift:759-763,904); `titleDrops` not decoded. | MISSING | SWIFT |
| 5.2 | Auto-scroll of a list or the timeline when the finger nears its edge. | absent (A/BoardDrop.swift has no scrolling). | MISSING | SWIFT |
| 5.3 | Stretch a timeline task by its two dots (resize, `item.can.resize`, `tasks.snap`). | absent (app.md «Пока не умеет»). | MISSING | SWIFT |
| 5.4 | Select mode: long press on a picked card carries all picked as a stack (core `tasks.carried`). | absent: picked cards are plain capsules, no drag (A/ListColumn.swift:524-526). | MISSING | SWIFT |
| 5.5 | Long press delay from Settings (250 ms default). | System drag delay; calendar press hard-coded 0.25 s (A/TimelineColumn.swift:439); `longPressMs` decoded but unused. | WRONG | SWIFT |
| — | In parity: list gaps/levels/heads via core, drop line, waiting place, cancel target, list→calendar, calendar→calendar, calendar→list, plus drop in a gap / on the calendar, long press on empty calendar, section lift. | | | |

## 6. Quick entry / capture

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 6.1 | Tap on the plus: field at the end of the day column (Inbox–Soon position: end of Inbox). | Opens the capture sheet (text/voice, default Inbox) (A/BoardScreen.swift:75, CaptureRouter.openTyping). In Today a tap therefore lands in Inbox, not Now. | WRONG | SWIFT (or spec decision) |
| 6.2 | `[[` opens note search in the field. | absent (plain UITextField). | MISSING | CORE (note list) + SWIFT |
| 6.3 | Plus into a project group / in a project view writes the project. | absent (no groups). | MISSING | SWIFT |
| 6.4 | Place button shows a picked day as «5 Nov» (core date words). | Formatted by Swift in the device locale (A/QuickEntryHost.swift:949): «Nov 5» on an en-US phone. | LOOK (decision in UI) | CORE words or reuse `rules.dueLabel` |
| — | In parity: Enter/next field, empty Enter outdents/ends, tap elsewhere saves, `p1 ` prefix, section button, indent/outdent, flag with levels and labels (labels keep the menu open here), repeat, place, Date…, subtask/calendar forms of the bar, Rename in place, Add subtask in place, plate tap. | | | |

## 7. Timeline & calendars

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 7.1 | Tap on an event → menu «Open in Calendar» (calendars.md «Меню события»). | Events take no taps (A/TimelineColumn.swift:145-154). | MISSING | SWIFT |
| 7.2 | Now line moves every minute; an unfinished overdue task rides it. | Static between reads (see 0.3). | WRONG | SWIFT |
| 7.3 | Sources window shows a source's error text (not logged in, file missing, no answer in N s, failure). | `problem` decoded and never shown (A/CalendarsView.swift:21-35). | MISSING | SWIFT (better: CORE gives the words — both frontends build them, P/sources/sourceText.ts and CalendarsView.words) |
| 7.4 | Calendars shown grouped by account under headers. | Flat list, account as a footnote. | LOOK | — |
| 7.5 | Google Calendar API fetched by the plugin; Google settings (login, client id/secret, refresh interval). | App only reads `google.json` (`fetched: []`, C/TaskBoard.swift:156). | by design (calendars.md) — list only | — |
| — | In parity: hours from Day starts at, grid labels by zoom, events with overlap levels, past events grey, all-day rows, task stack and corner, pinch zoom with levels and memory, snap step, open on now / scroll-to hour, orange stale mark, Refresh now, shown/hidden calendars. | | | |

## 8. Day navigation

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 8.1 | The day turns over on its own at Day starts at. | No (0.3). | WRONG | SWIFT |
| — | In parity (merged today): arrows, title tap to Today, swipe past Today by `days.stepScreen`, header and hours stand, day slides. | | | |

## 9. Search

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 9.1 | Found by project name: line with the project's name under the title, match highlighted (`SearchHit.project`). | Field not decoded, line absent (C/BoardModels.swift:426-430). | MISSING | SWIFT |
| 9.2 | Tap on a Done hit opens the Done column with the card ringed. | Nothing happens (3.3). | MISSING | SWIFT |
| 9.3 | The found card is scrolled into view (P/FoundCard.ts) in its list or the timeline. | Ribbon/day change only; no scroll to the card (A/BoardModel.swift:400-417). | MISSING | SWIFT |
| 9.4 | Folded project group with a hit unfolds (`grouping` from `tasks.reveal`). | n/a until 4.1. | MISSING | SWIFT |
| 9.5 | Rows as cards. | 1.9. | LOOK | SWIFT |

## 10. Select tasks (bulk)

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 10.1 | Long press carries all picked. | absent (5.4). | MISSING | SWIFT |
| 10.2 | Bulk Project row. | absent (2.1). | MISSING | SWIFT |
| 10.3 | Bulk labels keep the menu and selection for the next label. | Selection kept, menu closes (2.2). | WRONG | SWIFT |
| — | In parity: circles, calendar cards not pickable, statuses, priorities, labels, moves, Remove due date, Section, Delete N without asking, any action ends the mode. | | | |

## 11. Full screen

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 11.1 | Circle left of each subtask ticks it done in place (filled, crossed out), tap again reopens. | absent (A/TaskFullScreen.swift:159-165). | MISSING | SWIFT |
| 11.2 | Over a subtask's title: its parent task; tap goes one level up (`TaskItem.parentText`). | Shows the list name; `parentText` not decoded (A/TaskFullScreen.swift:28). | MISSING | SWIFT |
| 11.3 | Close from any depth back to the main screen. | Back goes one level per tap. | WRONG | SWIFT |
| 11.4 | Task gone (done, moved, deleted here or elsewhere) → one level up, else closes. | Stays on the stale task. | MISSING | SWIFT |
| 11.5 | Description in Obsidian's editor: links, images, markup rendered, links tappable. | Plain `TextEditor` with raw markdown. | MISSING | SWIFT |
| 11.6 | Add description opens with the cursor in the description; Done button hides the keyboard while typing it. | Same page as Open full screen, no focus; no Done for the description. | WRONG | SWIFT |
| 11.7 | Bottom row has the undo button. | No undo on the page. | MISSING | SWIFT |
| 11.8 | Subtasks coloured as cards. | 1.10. | WRONG | SWIFT |

## 12. Settings

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 12.1 KNOWN | Several labels: Stripes / Blend. | absent | MISSING | CORE + SWIFT |
| 12.2 | Cards: height, gap. | absent | MISSING | CORE + SWIFT |
| 12.3 | Long press delay. | absent (and ignored, 5.5) | MISSING | SWIFT |
| 12.4 | Zoom levels. | absent (read, not editable) | MISSING | SWIFT |
| 12.5 | Markers: due, slot, alarm, Live Activity, no-reminder, repeat, collapsed. | absent | MISSING | SWIFT |
| 12.6 | Project tag (+ hint about auto-updating links). | absent | MISSING | SWIFT |
| 12.7 | Work calendar file path, Scriptable script Copy. | absent | MISSING | SWIFT |
| 12.8 | Google Calendar account/client/refresh. | absent (by design?) | MISSING | — |
| 12.9 | Colour: six preset circles, rainbow picker, hex field; sample card with dot and time. | System ColorPicker only; sample is a name pill. | LOOK | — |
| — | In parity: priorities (name, colour, order, delete, add), labels (+ tag), presets, No section, list headings, Day starts at, Scroll to hour, Stale after, tasks file path. | | | |

## 13. Undo

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 13.1 | Undo also on the full screen. | 11.7. | MISSING | SWIFT |
| — | In parity: one step per action, disabled when empty, history in memory, «Can't undo» from core. (⌘⇧Z redo is Mac-only.) | | | |

## 14. Reminders / notifications

Nothing missing on the app side: the plugin only writes the markers and the Reminder row (in both). App-only: the reminders themselves.

## 15. Sync / other

| # | Plugin | App | Sev | Fix |
|---|---|---|---|---|
| 15.1 | Reads again on any change and every minute (0.3, 0.4). | Only tasks/settings text change. | WRONG | SWIFT |
| 15.2 | Rules decided in Swift that the core should give (reviewer rule 1): list width bounds copied from P/viewSettings.ts (A/BoardScreen.swift:304-305), source status words (A/CalendarsView.swift:110-119, also in P/sources/sourceText.ts), the place's date words (A/QuickEntryHost.swift:949), repeat unit words (A/BoardSheets.swift:217), «calendar cards cannot be picked» (A/BoardModel.swift:560), tab → place mapping. | | WRONG (architecture) | CORE |

## 16. The other way: what the app does that the plugin doesn't (behaviour only)

1. Plus tap opens a capture sheet (text + voice) instead of an inline field (6.1).
2. Select All in Select mode (A/BoardScreen.swift:176).
3. Select mode bottom bar acts directly: Done, Priority, Move without opening the bulk menu.
4. Repeat sheet ✕ discards changes (2.7).
5. Full screen back is one level at a time (11.3); Add subtask of a timeline-only task opens the full screen (2.5).
6. Section header long press opens a context menu (3.1).
7. Each swipe moves exactly one place (3.6); a tab always goes to its fixed place (3.5).
8. Sync button (Obsidian Sync round trip), problem banner that re-reads on tap.
9. App-only by platform (no plugin counterpart, fine): reminders/alarms/Live Activity, lock-screen widget, Siri/Shortcuts Add Task, voice notes, iPhone calendar export, signing plate, vault folder picker, Recording tag.
