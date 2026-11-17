# Feature list for the UI on the standard stack

Companion to [`2026-11-16-ui-standard-stack.md`](2026-11-16-ui-standard-stack.md). Every behaviour the user sees or does in the plugin today, which the rebuilt UI must keep. One feature per line. Sources: `docs/plugin/*.md` (by page and section) and, for what the docs don't say, the current code (marked "(code only)"). "(check)" marks an item whose user visibility is not certain. Where phone and desktop differ, the line says so. "Mac" and "desktop" mean the same here.

## Opening and hosts

- F1. A ribbon icon (calendar) "Task Calendar" opens the view. [`obsidian/main.ts`] (code only)
- F2. Command "Open Task Calendar" opens the view; an already open view is revealed rather than a second one made. [`docs/plugin/screen.md` intro; `obsidian/main.ts`]
- F3. The view can be open in several tabs at once; a change made in one shows at once in the others. [`docs/plugin/screen.md` intro]
- F4. The link `obsidian://task-calendar-open` (a tap on a reminder on the phone) opens the view. [`obsidian/main.ts`] (code only)
- F5. The view works in Obsidian's pop-out windows with the same card size and colours as in the main window. [`obsidian/main.ts`, `obsidian/ui/windowDocuments.ts`] (code only)
- F6. With no tasks file, the view shows "No tasks file at <path>" and a "Create file" button that creates it. [`obsidian/ui/CalendarScreen.ts`] (code only)
- F7. The screen follows outside changes of the tasks file (hand edits, Sync, agents) at once. [`docs/plugin/README.md` Задача; `docs/plugin/file.md`]
- F8. A new plugin release that Sync or BRAT brought reloads the plugin by itself, a few seconds after the files land or when returning to Obsidian. [`docs/plugin/settings.md` Обновления плагина]
- F9. Swipes from the screen edges inside the view belong to the view (Obsidian's side panels don't open from them); while a gesture runs, the page doesn't scroll or pinch-zoom. [`obsidian/ui/CalendarScreen.ts`] (code only)

## Main screen: view modes

- F10. One view mode per screen, kept on the device; default Two columns (on the phone named Columns). [`docs/plugin/screen.md` Режимы вида]
- F11. View button: a round button (like the plus) wearing the current mode's icon; a tap opens the "View" list with a check at the current mode. [`docs/plugin/screen.md` Режимы вида]
- F12. Modes: Two columns / Columns (everywhere), All columns (desktop only), Rows (everywhere), By project (everywhere). [`docs/plugin/screen.md` Режимы вида]
- F13. View menu: under the modes, a separate "Subprojects" row with a check, only while a project or folder with subprojects is chosen; a tap toggles it and closes the menu; kept on the device, shared with the note block. [`docs/plugin/screen.md` Режимы вида]
- F14. Subprojects off: subprojects' tasks leave every list, row, the timeline and By project, which keeps only the project's own part; a folder without the check is empty. [`docs/plugin/screen.md` Режимы вида]
- F15. Choosing or clearing a project never changes the mode, and the mode never changes the project. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F16. All columns (desktop): Inbox over Backlog, Soon, the day list and the timeline side by side, nothing slides; the three lists are equally wide; the divider sets the lists against the timeline, all four equal at the middle; the width is shared with Two columns. [`docs/plugin/screen.md` Режимы вида]
- F17. Rows: Inbox, Backlog, Soon and the day list stacked, each under a small label (Inbox, Backlog, Soon, the day's name), the timeline on the right behind the divider with the day's title over it. [`docs/plugin/screen.md` Режимы вида]
- F18. Rows: while all fit, each list is as tall as its tasks; long lists share the rest and scroll each by itself, each ending on a whole card with an empty strip under it (no card peeking); rows end above the bottom row of buttons. [`docs/plugin/screen.md` Режимы вида]
- F19. Rows: while a card or the plus is carried, row heights stay; room for one more card opens only at the end of the list under the finger, inside its scroll. [`docs/plugin/screen.md` Режимы вида]
- F20. Rows: a new task field grows its list while all fit; with no room, its list grows once just enough to show the field (and, on desktop, the capsule under it), taken from the tallest other list, and scrolls to the field. [`docs/plugin/screen.md` Режимы вида]
- F21. Rows: a card that arrives, leaves or returns by Undo grows and shifts the rows along with its own motion. [`docs/plugin/screen.md` Режимы вида]
- F22. Rows: the day changes only by the arrows over the timeline; a screen swipe doesn't turn days. [`docs/plugin/screen.md` Режимы вида]
- F23. Another project, mode, cleared filter or Subprojects toggle redraws the screen in place: no card flies in or slides apart. Only changes in the same view move (added, moved, removed card, Undo). [`docs/plugin/screen.md` Режимы вида]

## Ribbon, wheel and screen swipe (Two columns)

- F24. The screen is a window two columns wide over a strip of four: Inbox over Backlog, Soon, the day list, the day's timeline; three positions: Inbox–Soon, Soon–Now, Now–calendar. [`docs/plugin/screen.md` Лента колонок]
- F25. At Inbox–Soon and Soon–Now the columns split the screen in half; at Now–calendar the divider sets the widths. [`docs/plugin/screen.md` Лента колонок]
- F26. The window's position is kept on the device (not synced). [`docs/plugin/screen.md` Лента колонок]
- F27. Inbox over Backlog: one column halved, Backlog with its own header; each half scrolls by itself. [`docs/plugin/screen.md` Лента колонок]
- F28. Wheel (column switch) at the bottom centre, only in Two columns: four icons Inbox, Soon, Now, calendar; a pill shows which two columns are in the window. [`docs/plugin/screen.md` Колёсико]
- F29. Tap on an icon outside the window turns the strip to the nearest position that shows it. [`docs/plugin/screen.md` Колёсико]
- F30. The wheel turns under a finger: a quick flick moves exactly one position, a slow drag moves freely and settles on the nearest. [`docs/plugin/screen.md` Колёсико]
- F31. Wheel focused by keyboard: Left and Right arrows move it one position. [`obsidian/ui/ColumnSwitch.ts`] (code only)
- F32. Long press on the wheel while the calendar shows opens the calendar sources window. [`docs/plugin/screen.md` Колёсико; `docs/plugin/calendars.md` Окно источников]
- F33. A dot on the wheel's calendar icon: orange when a source in use is stale, red when its last refresh also failed (red wins); none when all is fine. [`docs/plugin/screen.md` Колёсико; `docs/plugin/calendars.md` Окно источников]
- F34. Screens in one row: Inbox–Soon, Soon–Now, Now–calendar (today), then the calendar of tomorrow, the day after, and on. [`docs/plugin/screen.md` Свайп по экрану и дни]
- F35. Swipe on the content (desktop: two-finger trackpad swipe) moves along that row; the screen follows the finger but never past the neighbour; released, it goes on if it passed half-way or was flicked, else comes back; one swipe is exactly one step, from the first swipe after launch. [`docs/plugin/screen.md` Свайп по экрану и дни; `CLAUDE.md` Behaviours Max had to ask for twice]
- F36. Past the row's end the screen gives a little and springs back (rubber band). [`docs/plugin/screen.md` Режимы вида; `obsidian/ui/ScreenTracks.ts`]
- F37. A tap while the screen still glides doesn't stop it with a jerk: it arrives by itself and the tap goes where it landed. [`docs/plugin/screen.md` Свайп по экрану и дни]
- F38. The swipe and wheel move the screen only in Two columns; in other modes and in the note block the screen stands, with no rubber band. [`docs/plugin/screen.md` Режимы вида]
- F39. A swipe never starts in a text field being typed in, on a divider, or while a task is on the whole screen. [`obsidian/ui/Swipe.ts`] (code only)
- F40. Column headers ride with their columns; the day column's header carries the day navigation. [`docs/plugin/screen.md` Свайп по экрану и дни; `obsidian/ui/ColumnHeaders.ts`]

## Day navigation

- F41. The day column's title reads Today, Tomorrow, Yesterday or a date, with arrows for a day back and forward on its sides. [`docs/plugin/screen.md` Свайп по экрану и дни]
- F42. A tap on the day title goes back to today (desktop tooltip/label "Back to today"). [`docs/plugin/screen.md` Свайп по экрану и дни; `obsidian/ui/DayNav.ts`]
- F43. Arrows and the title tap change the day like a swipe: in its column the day slides out and the next one slides in in 0.3 s; the header and the hour labels stand still. [`docs/plugin/screen.md` Свайп по экрану и дни]
- F44. During a swipe the neighbouring day is drawn beside: its list at the same scroll, its timeline with every hour at the same height and its all-day rows. [`obsidian/ui/DayPeek.ts`] (code only)
- F45. Back to today from a far day is one slide toward today, not a run through the days between. [`docs/plugin/screen.md` Свайп по экрану и дни]
- F46. Quick taps queue: an arrow or title tap mid-slide lets the slide finish, then turns on, with no jerk. [`docs/plugin/screen.md` Свайп по экрану и дни]
- F47. A finger swipe mid-slide catches the day where it shows (like scroll inertia); released, it finishes or returns, and queued turns are dropped. [`docs/plugin/screen.md` Свайп по экрану и дни]
- F48. The chosen day sets both the day list and the timeline. [`docs/plugin/screen.md` Свайп по экрану и дни]
- F49. In a mode with no day list (By project), the day title with its arrows stands over the timeline. [`obsidian/ui/DayNav.ts`] (code only)
- F50. When "Day starts at" changes, the screen opens today afresh; when a day ends, the lists are read anew (yesterday's unfinished tasks show in Now). [`obsidian/ui/CalendarScreen.ts`; `docs/plugin/README.md` Дни, даты и время]

## Dividers

- F51. At Now–calendar (and in All columns, Rows, By project) a divider with a handle between the lists and the timeline; dragging it or its handle sets the list width. [`docs/plugin/screen.md` Лента колонок]
- F52. Brought slowly near the window's middle, the divider glides into the middle with a light click (haptic) and glides out the same way; a fast drag passes by. [`docs/plugin/screen.md` Лента колонок; `obsidian/ui/Divider.ts`]
- F53. The list width is kept on the device; on a phone the list stays within the design's bounds, a wider window lets it grow until the timeline is as narrow as allowed. [`docs/plugin/settings.md` intro; `obsidian/ui/listWidth.ts`]
- F54. Desktop: a divider with a handle between the docked projects tree and the columns; its width is kept on the device; it snaps to the middle with a haptic like the main divider. [`docs/plugin/screen.md` Проекты: панель и фильтр; `obsidian/ui/projects/TreePanel.ts`]

## Lists, sections and empty states

- F55. Soon column shows only Soon tasks without date or time; dated Soon tasks show in their day's column. [`docs/plugin/screen.md` Лента колонок]
- F56. Day column: today shows Now without the tasks already on today's timeline; another day shows tasks due that day without those on its timeline; a past day shows what is due then, without sections. [`docs/plugin/screen.md` Лента колонок]
- F57. Order in each list is manual (file order); nothing is sorted. [`docs/plugin/README.md` Лента]
- F58. Section headers over their groups; tasks outside sections gather under the "No section" header (name from settings) when the list has sections. [`docs/plugin/tasks.md` Секции]
- F59. Sections show in Inbox, Backlog, Soon, and the day column (Now's sections today, Soon's on a future day). [`docs/plugin/tasks.md` Секции]
- F60. Empty section: header and a dashed "No tasks" plate under it; a tap on the plate opens a new task field in that section; a card held over it lights it. [`docs/plugin/tasks.md` Секции]
- F61. An empty Soon section shows in Soon and in every future day's column until a task lands in it. [`docs/plugin/tasks.md` Секции]
- F62. Tap on a section header: menu with Rename (edited in place, field as tall as the header, nothing below shifts) and Remove section. [`docs/plugin/tasks.md` Секции]
- F63. Long press on a section header (including "No section") lifts the whole section to reorder it among sections. [`docs/plugin/tasks.md` Секции]
- F64. A filtered empty list shows a "No tasks" plate; a tap on it opens a new task field in that list. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F65. Scroll edge fade: cards scrolled under a column header dissolve over about half a card instead of being cut by a line; same at the bottom while more is below, and on the timeline; a list at its very top doesn't fade at the top; the fade grows in with the scroll. [`docs/plugin/screen.md` Лента колонок; `obsidian/ui/ScrollEdges.ts`]
- F66. A scrolled list stays where it stood after any write: the card under the finger stays under it; when rows fold away at the bottom, empty room stays under the last card until scrolled up. [`docs/plugin/tasks.md` intro]
- F67. Desktop: double click on free room of a column (between or under cards) opens a new task field at the end of that column; a card or header keeps its own clicks. [`docs/plugin/tasks.md` Новая задача; `obsidian/ui/FreeRoomDoubleClick.ts`]

## Task card

- F68. A capsule with the title; a long title fades out to the right; shown whole in the menu and under the finger. [`docs/plugin/screen.md` Карточка задачи]
- F69. Due date (day and month) on the right; omitted when it is the open day's date. [`docs/plugin/screen.md` Карточка задачи]
- F70. Repeat icon by the due date; subtask counter "2/5" and description icon before the date. [`docs/plugin/screen.md` Карточка задачи]
- F71. Folder icon in caption colour for a task in a project, right edge, left of date/repeat/counter, not changing the card height; hit area a bit wider (date's width, incl. the faded end of the title). [`docs/plugin/screen.md` Карточка задачи]
- F72. Tap on the folder icon selects that project in the filter (the first of several); the rest of the card opens the menu; in Select tasks the tap picks the task. [`docs/plugin/screen.md` Карточка задачи]
- F73. Desktop: hovering the folder icon shows the project's name as a tooltip. [`docs/plugin/screen.md` Карточка задачи]
- F74. No folder icon while a project is chosen; it stays without a filter, under "No project" and "Done". [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F75. In-progress dot on the left of the card. [`docs/plugin/screen.md` Карточка задачи]
- F76. Background in the priority colour; one label colours it the same; several labels as diagonal stripes or a left-to-right blend (setting); the dot and time take the first label's colour. [`docs/plugin/screen.md` Карточка задачи; `docs/plugin/settings.md` Labels]
- F77. Links in a title (`[[note]]`, `[[note|alias]]`, `[text](url)`, bare URLs) show by their word; other markdown shows as typed. [`docs/plugin/file.md` Строка задачи]
- F78. A link in a title opens only from the card's copy in the menu (note in a new tab, address in the browser), never from the card itself. [`obsidian/ui/menu/TaskMenu.ts`] (code only)
- F79. Folded task with open subtasks: two-line card, slightly taller (44 px vs 35 px): small task title in caption colour on top, the next open step (deepest first open subtask) below; counter, folder, date, repeat, description, colours from the task; the folded edge under it. [`docs/plugin/screen.md` Карточка задачи]
- F80. Subtasks under their task, indented, with branch lines like a folder tree. [`docs/plugin/screen.md` Карточка задачи]
- F81. A folded card shows the edge of a second card peeking under it. [`docs/plugin/screen.md` Карточка задачи]
- F82. Card height and gap come from settings (Cards) and apply everywhere cards are drawn, including lifted copies. [`docs/plugin/settings.md` Cards]
- F83. Desktop: right click on a card opens the menu too; double click on a card starts Rename. [`docs/plugin/screen.md` Тема и платформы; `docs/plugin/tasks.md` Меню задачи]
- F84. Desktop: hovering the subtask counter brightens it. [`docs/plugin/tasks.md` Подзадачи]

## Timeline and calendar events

- F85. 24 hours from the day start (default 5:00) to the same hour next morning, scrollable; hour labels like `04`, `00`. [`docs/plugin/screen.md` Таймлайн; `obsidian/ui/dates.ts`]
- F86. Today opens with the now line a bit above the middle; another day opens at the "Scroll to hour" setting (default 9:00). [`docs/plugin/screen.md` Таймлайн]
- F87. Events (Google, work, iPhone calendars): coloured read-only blocks; overlapping ones lie over each other shifted right; past events fade; an event crossing the day's edge is cut there. [`docs/plugin/screen.md` Таймлайн; `obsidian/ui/Timeline.ts`]
- F88. All-day events as rows over the timeline, one per event; past ones grey. [`docs/plugin/screen.md` Таймлайн; `obsidian/ui/AllDayRow.ts`]
- F89. Event colours follow the light/dark theme and update when the theme changes. [`CLAUDE.md` One design system; `obsidian/ui/CalendarScreen.ts`]
- F90. Tap on an event: a copy of the event over the blurred screen showing its whole title and a menu with one row "Open in Calendar" (iPhone: Apple Calendar at the start time; Mac: that day, searching and selecting the event). [`docs/plugin/calendars.md` Меню события; `obsidian/ui/menu/EventMenu.ts`]
- F91. Timed tasks are the same cards as in lists: no duration → normal card height; with duration → height by duration. [`docs/plugin/screen.md` Таймлайн]
- F92. Tasks standing close together stack; the start time is then shown on the right. [`docs/plugin/screen.md` Таймлайн]
- F93. A block shows the small time or duration on its right. [`obsidian/ui/Timeline.ts`] (code only) (check)
- F94. A folded task's block is named by its next step (no small title line); its subtasks aren't drawn in the block, only the counter. [`docs/plugin/screen.md` Карточка задачи; `docs/plugin/tasks.md` Подзадачи]
- F95. Now line: red, with a time capsule, only on today; moves once a minute; a minute missed while hidden or mid-gesture catches up at once. [`docs/plugin/screen.md` Таймлайн; `obsidian/ui/CalendarScreen.ts`]
- F96. An unfinished task whose time has passed rides on the now line, moving every minute (file unchanged). [`docs/plugin/screen.md` Таймлайн]
- F97. Pinch to zoom (desktop: Ctrl/Cmd + wheel or trackpad pinch); stops where released, from "whole day on screen" to the largest hour in settings; the minute under the fingers stays put; zoom kept on the device. [`docs/plugin/screen.md` Таймлайн; `obsidian/ui/PinchZoom.ts`]
- F98. Zoomed out to the whole day, the day keeps fitting when the timeline's height changes. [`obsidian/ui/CalendarScreen.ts`] (code only)
- F99. Finer hour marks appear as the zoom grows: labels on some, bare lines on the rest. [`obsidian/ui/Timeline.ts`] (code only)
- F100. Snap step for drag and resize follows the zoom: 30 min small, 15 normal, 5 large. [`docs/plugin/screen.md` Таймлайн]
- F101. Long tap on empty timeline opens a new task field at that time (with a haptic). [`docs/plugin/tasks.md` Новая задача; `obsidian/ui/drag/DragController.ts`]
- F102. Tap on a timeline task opens its menu and selects the block: two dots on its edges; a tap anywhere else lets the selection go. [`docs/plugin/tasks.md` Перетаскивание]
- F103. Resize: pulling a dot closes the menu; top dot moves the start, bottom moves the end, by the snap step; shrunk to the minimum the task loses its duration; with no duration the top dot pulls the start earlier and the old start becomes the end. [`docs/plugin/tasks.md` Перетаскивание]
- F104. While resizing, the moving edge's time shows on a pill; haptic at start and when written. [`obsidian/ui/Timeline.ts`, `obsidian/ui/drag/DragController.ts`] (code only)
- F105. An overdue task riding the now line resizes from where it is drawn: bottom dot changes only the duration (ends where released, start in file unchanged); top dot writes a new start. [`docs/plugin/tasks.md` Перетаскивание]
- F106. Long press on a timeline block doesn't scroll the timeline; the menu opens over the visible part of the block. [`docs/plugin/tasks.md` Перетаскивание]
- F107. Tap on a timeline task with subtasks shows its open subtasks between the copy and the menu; a tap on a subtask opens its menu. [`docs/plugin/tasks.md` Меню задачи]
- F108. Rename on the timeline turns the block into a field over its place (in-progress dot kept); Add subtask types into the stack under the copy. [`obsidian/ui/Timeline.ts`, `obsidian/ui/menu/TaskMenu.ts`] (code only)
- F109. Calendars refresh on opening the view, on day change, every minute (Refresh interval) and on returning to Obsidian or the tab. [`docs/plugin/calendars.md` Где лежат встречи]

## Task menu

- F110. Tap on a card (desktop: click or right click): the card stays over a dimmed blurred backdrop (with its whole title), the panel under it. [`docs/plugin/tasks.md` Меню задачи]
- F111. The title on the menu's card copy is selectable and copyable (mouse drag; long press and handles on the phone; Cmd+C / Copy); the menu stays open. [`docs/plugin/tasks.md` Меню задачи]
- F112. Status tiles: Done, In progress (Stop progress when in progress), Won't do; plus Stop for a repeating task. [`docs/plugin/tasks.md` Меню задачи]
- F113. Priority tiles, one per level: tap another sets it, tap the current removes it. [`docs/plugin/tasks.md` Меню задачи]
- F114. Label tiles (tag icon in its colour and name): tap adds, tap a set one (with a cross) removes; menu stays open; the card above recolours at once; labels dim while a priority is set and vice versa. [`docs/plugin/tasks.md` Меню задачи]
- F115. Move tiles: Today, Tomorrow, Pick a date (no tile for the task's current day); set the due date, drop the time; task goes to the end of Now or Soon. [`docs/plugin/tasks.md` Меню задачи]
- F116. Pick a date: month grid (six weeks from Monday) with arrows to neighbouring months, the task's day chosen; Remove due date below (not for a task due today). [`docs/plugin/tasks.md` Меню задачи; `obsidian/ui/menu/MonthPicker.ts`]
- F117. Rename: the card itself becomes the field; Enter saves and the new name shows at once, before the file is written; priority and place can change there too. [`docs/plugin/tasks.md` Меню задачи]
- F118. Reminder (timed task only): in-place list Live Activity, Notification, Alarm, Off, check at current; a pick closes the menu. [`docs/plugin/tasks.md` Меню задачи]
- F119. Add description (task without one): opens the full screen with the caret in the description. [`docs/plugin/tasks.md` Меню задачи, Описание]
- F120. Repeat row (open task or subtask) with the current rule on the right; opens the repeat panel; the rule is written once, when the menu closes. [`docs/plugin/tasks.md` Меню задачи, Повтор]
- F121. Section row (list with sections): submenu with the list's visible sections (empty ones too), the presets, the current checked, New section (task waits at the end of its column under a name field). [`docs/plugin/tasks.md` Меню задачи, Секции]
- F122. Project row in every menu: value shows the project, "Name +1" for several, or "No project"; page with the whole tree (indented, done ones too), a check on each of the task's projects; tap toggles and the page stays; "No project" clears all and closes; "New project…" last. [`docs/plugin/tasks.md` Меню задачи]
- F123. Project row on a subtask is dim and not pressable, showing the parent's projects; a folder on the page is dim and can't be checked. [`docs/plugin/tasks.md` Меню задачи]
- F124. Add subtask: a field for a new last subtask. [`docs/plugin/tasks.md` Меню задачи]
- F125. First step row (open task or subtask, in lists, By project and the timeline; not in a timeline stack, Done or full screen). [`docs/plugin/tasks.md` Меню задачи]
- F126. Open full screen (absent when already full screen); Open in Obsidian opens the tasks file in a new tab with the cursor at the task's line, the line centred. [`docs/plugin/tasks.md` Меню задачи; `obsidian/ui/CalendarScreen.ts`]
- F127. Delete removes the line with everything under it. [`docs/plugin/tasks.md` Меню задачи]
- F128. Delete, Won't do and Stop ask in place (question with Cancel and the confirming button, Delete in red); desktop: Enter confirms, Escape closes the menu. [`docs/plugin/tasks.md` Меню задачи]
- F129. Description peek: the start of the description over the card copy (a folded card: the shown step's); tap opens that task full screen; a link in it opens. [`docs/plugin/tasks.md` Меню задачи]
- F130. When the menu is taller than the window and splits over and under the card, the peek sits right of the menu over the card (or under it); on the phone it is then absent; overflowing text fades only its cut last line. [`docs/plugin/tasks.md` Меню задачи]
- F131. Menu pages (menu, Section, Project, Repeat, Pick a date, a question) grow or shrink the panel from its old size and place, each page keeping its own scroll; submenus have a back row. [`obsidian/ui/menu/PanelPages.ts`] (code only)
- F132. The menu closes first, then the action happens on the screen under it; Rename, Add description, Add subtask, First step and New section open their field within the same tap (iOS raises the keyboard). [`docs/plugin/tasks.md` intro]
- F133. Escape or a tap on the backdrop closes any menu. [`obsidian/ui/menu/Overlay.ts`]
- F134. A Done column card's tap opens the usual task menu; a Done card can't be dragged. [`docs/plugin/screen.md` Колонка Done; `obsidian/ui/CalendarScreen.ts`]

## Select tasks and bulk actions

- F135. «⋯» → Select tasks (phone and desktop): a circle slides in on each list card and the title moves aside; tap toggles a check instead of opening the menu; calendar tasks can't be picked; the wheel and swipe keep working. [`docs/plugin/tasks.md` Массовые действия]
- F136. In Select tasks, the bottom capsule becomes a cross (exit) and the picked count; the plus becomes a «⋯» circle; count and «⋯» are dim while nothing is picked. [`docs/plugin/tasks.md` Массовые действия]
- F137. Tap on «⋯» or the count opens the menu for all picked; the cross, Esc or any action ends Select tasks; a tap beside the cards keeps the selection. [`docs/plugin/tasks.md` Массовые действия]
- F138. Desktop: ⌘-click picks a card, Shift-click a run; across lists; calendar tasks excluded. [`docs/plugin/tasks.md` Массовые действия]
- F139. Desktop: a click on a picked card opens the menu for all beside it. [`docs/plugin/tasks.md` Массовые действия]
- F140. Bulk menu: "N tasks" title, status (no Stop), priority, labels, move, Section (all from one sectioned list), Project, Delete N tasks; Won't do and Delete N tasks act without a question. [`docs/plugin/tasks.md` Массовые действия]
- F141. Bulk move tiles only when some picked task can move; Remove due date leaves today's tasks due. [`docs/plugin/tasks.md` Массовые действия]
- F142. Bulk priority: a level is lit if all picked have it without labels; tap lit removes, tap other sets on all except labelled ones. [`docs/plugin/tasks.md` Массовые действия]
- F143. Bulk labels: set on all lacking it, removed from all when all have it; tasks with priority get no label; menu and selection stay for the next label. [`docs/plugin/tasks.md` Массовые действия]
- F144. Bulk Project page: check on a project all picked share; tap sets it on all or removes from all; subtasks keep the parent's projects. [`docs/plugin/tasks.md` Массовые действия]
- F145. Desktop: Esc, a click beside the cards, or any action clears the ⌘-selection; Esc during a drag cancels the drag. [`docs/plugin/tasks.md` Массовые действия]

## Drag and drop

- F146. Phone: long press (default 250 ms, setting) with a light vibration lifts a card; desktop: just drag. [`docs/plugin/tasks.md` Перетаскивание]
- F147. The card follows the finger; its place stays as a dashed outline (its subtasks fold away under it); the carried copy stretches right to show its whole title. [`docs/plugin/tasks.md` Перетаскивание; `obsidian/ui/drag/FloatingCard.ts`]
- F148. A task with subtasks is carried with them, drawn as a stack of layers under the card. [`docs/plugin/tasks.md` Перетаскивание; `obsidian/ui/drag/FloatingCard.ts`]
- F149. Several picked tasks are carried as a stack with their number on the top card's corner. [`docs/plugin/tasks.md` Массовые действия; `obsidian/ui/drag/FloatingCard.ts`]
- F150. List drop place: a bar between cards, from a dot at the level's left edge to the list's right edge; on the timeline: a line with the start time. [`docs/plugin/tasks.md` Перетаскивание; `obsidian/ui/drag/DropLine.ts`]
- F151. Level by sideways position: left of the list's middle is a top-level task; each indent step right goes one level deeper (subtask of the card above). [`docs/plugin/tasks.md` Перетаскивание]
- F152. Inbox ↔ Backlog ↔ Soon: changes section, drops date and time. [`docs/plugin/tasks.md` Перетаскивание]
- F153. Soon → today's column: into Now, due today; today → Soon: due date removed. [`docs/plugin/tasks.md` Перетаскивание]
- F154. Soon → another day's column: due that day, stays in Soon; that column → Soon: due date removed. [`docs/plugin/tasks.md` Перетаскивание]
- F155. List → timeline: time at the drop point, no duration; a Now task dropped on another day's timeline goes to Soon without today's date. [`docs/plugin/tasks.md` Перетаскивание]
- F156. Within the timeline: new time, duration kept; the start follows the carried card's top, snapped. [`docs/plugin/tasks.md` Перетаскивание; `obsidian/ui/drag/TimelineDrop.ts`]
- F157. Timeline → list: time erased, date kept, task lands where dropped. [`docs/plugin/tasks.md` Перетаскивание]
- F158. On a section header or between sections: into that section. [`docs/plugin/tasks.md` Перетаскивание]
- F159. On a column title (Inbox, Soon, Backlog, day title): into that list at the end of its unsectioned part, project unchanged; the title lights while the card is over it; the plus can't be dropped on a title. [`docs/plugin/tasks.md` Перетаскивание]
- F160. Moving to another day is by the menu only, not by dragging. [`docs/plugin/tasks.md` Перетаскивание]
- F161. Places that refuse a task show no bar; a card released there flies back (e.g. Inbox/Backlog refuse a dated or timed task, Soon a timed one). [`docs/plugin/tasks.md` Проекты]
- F162. Auto-scroll: holding near a list's or the timeline's edge scrolls it after a quarter second, faster closer to the edge; on the phone the bottom edge is above the wheel; a card carried across an edge into another list doesn't scroll it. [`docs/plugin/tasks.md` Перетаскивание; `obsidian/ui/drag/AutoScroll.ts`]
- F163. Drop animation: the drop is written first; the copy then flies to where the task actually stands (even if not where the bar showed), and only then the card appears; within one list the dashed place moves to the new spot and the copy settles in it. [`docs/plugin/tasks.md` Перетаскивание]
- F164. A task dropped into a collapsed project group: the copy flies into the group's header and fades; the group's count changes smoothly. [`docs/plugin/tasks.md` Перетаскивание]
- F165. Cancelled drag: the copy returns to the dashed place, then the card shows there. [`docs/plugin/tasks.md` Перетаскивание]
- F166. The next action never waits for a flight: another card (or the same, whose old copy gives way) can be lifted, a card under a closing menu pressed, a section moved. [`docs/plugin/tasks.md` Перетаскивание]
- F167. A redraw mid-press (a write, Undo, Enter) doesn't drop the finger. [`docs/plugin/tasks.md` Перетаскивание]
- F168. While a card is carried, the plus and the bottom capsule fade out (not vanish) and fade back. [`docs/plugin/tasks.md` Перетаскивание]
- F169. While several picked tasks are carried, the plus's place is a ring with a cross; dropped there they all go back; the stack turns see-through over it. [`obsidian/ui/quick/PlusRing.ts`] (code only)
- F170. Several picked tasks can't be dropped on the timeline; a stack dropped into a project group gets that project. [`docs/plugin/tasks.md` Массовые действия]
- F171. Haptic tick on lift, on drop, on a timeline hold, on a section or project lift. [`obsidian/ui/drag/DragController.ts`, `obsidian/ui/drag/GroupDrag.ts`, `obsidian/ui/projects/TreeLift.ts`] (code only)
- F172. Section drag: the header follows the finger over a stack of its cards, the list closes over where it was; the target gap opens smoothly between sections; released, the copy flies there, the move is written, then the section unfolds in place. [`docs/plugin/tasks.md` Секции; `obsidian/ui/drag/GroupDrag.ts`]
- F173. A card carried over the projects tree narrows to the tree's width, above the finger. [`obsidian/ui/drag/FloatingCard.ts`] (code only)

## Quick add

- F174. Plus: round button bottom right; a tap opens a field at the end of the day column (at Inbox–Soon: end of Inbox). [`docs/plugin/tasks.md` Новая задача]
- F175. Dragging the plus (it moves at once, no long press) carries it as a card; released between cards it opens a field there, level by sideways position; on the timeline a field at that time with no duration. [`docs/plugin/tasks.md` Новая задача; `obsidian/ui/quick/PlusButton.ts`]
- F176. While the plus is carried, its place is a dashed ring that lights when the card comes back; released there, nothing is created and it flies back. [`obsidian/ui/quick/PlusRing.ts`] (code only)
- F177. For the plus, the drop line grows out of a dot at the finger, runs to its place and stretches into the line; released, the plus goes to the field's start and fades. [`obsidian/ui/drag/DropLine.ts`, `obsidian/ui/drag/PlusFloat.ts`] (code only)
- F178. Enter saves and opens an empty field right under it (batch typing); typed tasks show as plain cards at their level until written. [`docs/plugin/tasks.md` Новая задача; `obsidian/ui/EntryRows.ts`]
- F179. Enter on an empty field ends typing (a subtask field first steps one level left). [`docs/plugin/tasks.md` Новая задача]
- F180. Indent: Tab/Shift+Tab on desktop, left/right buttons on the phone bar: the field becomes a subtask of the task above or back. [`docs/plugin/tasks.md` Новая задача]
- F181. A tap elsewhere saves and ends; Escape (desktop) closes without saving. [`docs/plugin/tasks.md` Новая задача]
- F182. `p1 ` prefix sets the priority at once; `[[` opens the note search as in a note; a pasted line break becomes a space. [`docs/plugin/tasks.md` Новая задача; `obsidian/ui/quick/MarkdownTitleField.ts`]
- F183. Section button (first in the bar; desktop also ⌥Tab) toggles the field to a new section's name ("Section name"); Enter puts the header at the field: tasks below in the group go into it; at the bottom it's empty; a subtask field moves to top level after all subtasks; only in lists with sections. [`docs/plugin/tasks.md` Новая задача]
- F184. Phone bar over the keyboard: section, indent buttons, priority flag, project (folder), repeat, place; on a narrow phone round buttons shrink to their height, the place button keeps its width; only the section button while naming a section. [`docs/plugin/tasks.md` Новая задача]
- F185. Desktop: two capsules under the field: section button at the field's left, task buttons at its right (hidden while naming a section); placed above the field when no room below; an open panel hangs away from the field. [`docs/plugin/tasks.md` Новая задача; `obsidian/ui/quick/barPlacement.ts`]
- F186. Flag panel: priority level tiles, label tiles under them; a level sets and closes; a label toggles and stays; priority dims labels and vice versa; typing `p1 ` dims chosen labels, erasing it brings them back; the flag and the field take the priority's or first label's colour. [`docs/plugin/tasks.md` Новая задача]
- F187. Project button: whole tree, subprojects indented, "No project" last, check at the chosen, "New project…" at the bottom; a pick closes; chosen project fills the folder in accent; the next field after Enter keeps it; folders dim; no button on a subtask or a section-name field. [`docs/plugin/tasks.md` Новая задача]
- F188. Place button: Inbox, Backlog, Soon, Now or Date (pick a day); the field moves to the end of that list or day, the wheel turns if needed; in By project the field stays and the task is written to that list; names from Section headings settings, a day as "5 Nov", long names fade. [`docs/plugin/tasks.md` Новая задача]
- F189. A subtask field has no place or project button, but has repeat; a timeline field has flag and project. [`docs/plugin/tasks.md` Новая задача]
- F190. What the new task gets by place: Inbox/Backlog/Soon no date; Now today's date; another day its date (Now if not later than today, else Soon); timeline adds the time. [`docs/plugin/tasks.md` Новая задача]
- F191. Under a chosen project a new task gets that project; not under "All" or "No project". [`docs/plugin/tasks.md` Проекты]
- F192. While a field is open, the projects button can't be pressed. [`obsidian/ui/quick/QuickEntryController.ts`] (code only)
- F193. The list keeps the field in sight as it moves, unless the hand scrolled just now. [`obsidian/ui/quick/QuickEntryController.ts`] (code only) (check)
- F194. Line-changing editor keys (⌘L checkbox, lists, headings, quotes, moving lines) do nothing in the title and description fields; a stray `- [ ]` pasted at the start is stripped on write; bold, italic, links stay. [`docs/plugin/screen.md` Клавиши в полях]

## Subtasks, folding and First step

- F195. The counter on a parent counts done direct subtasks. [`docs/plugin/tasks.md` Подзадачи]
- F196. Tap (desktop: click) on the counter folds subtasks away (the second card's edge peeks under) or shows them; haptic tick; elsewhere on the card the menu opens. [`docs/plugin/tasks.md` Подзадачи; `obsidian/ui/CalendarScreen.ts`]
- F197. A folded task unfolds by itself when a subtask is added and when search leads to its subtask. [`docs/plugin/tasks.md` Подзадачи]
- F198. On a folded card, Done, In progress, Won't do and the description peek act on the shown step; Done brings the next step onto the card; everything else acts on the whole task. [`docs/plugin/screen.md` Карточка задачи]
- F199. First step: the menu closes and in the same tap the task folds: subtasks slide under the card, the folded edge shows even with none; the card gets an accent ring, small title on top, the second line an empty field with caret (keyboard up on iPhone). [`docs/plugin/tasks.md` Подзадачи]
- F200. First step: Enter (or a tap elsewhere with text) writes the step as the first subtask and folds the task on it; Escape, empty tap or empty Enter writes nothing and the card returns, subtasks sliding back; no next field; `p1 ` sets the step's priority. [`docs/plugin/tasks.md` Подзадачи]
- F201. First step on a timeline block makes its single line the field; the block grows down for long text; after Enter it's named by the new step. [`docs/plugin/tasks.md` Подзадачи]

## Repeat panel

- F202. Switch Schedule / After done; Every N with − and +; unit days / weeks / months. [`docs/plugin/tasks.md` Повтор]
- F203. Weekly schedule: weekday letters (at least one); monthly: the day of month; Remove repeat (when a rule exists). [`docs/plugin/tasks.md` Повтор]
- F204. A new rule opens as Schedule, weekly, on the task's weekday (month: same day number), from its date, else its timeline day, else today; in the quick field, from the place's day. [`docs/plugin/tasks.md` Повтор]

## Projects: panel, tree, filter

- F205. Folder button top left opens and closes the projects panel; filled while open; open/closed kept on the device. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F206. Desktop: the panel docks left, the columns shift right; it slides in and out with the columns moving in one motion; big "Projects" over the tree; stays until closed by the button; a tap on a project only chooses it. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F207. Phone: the panel slides in from the left over the columns, the rest dims; a tap on a project chooses it and closes the panel; a tap on the dim closes without choosing. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F208. Without a filter the folder button stands in the column header row left of the first header; with a filter, over the columns in one row with the big project name and a cross that clears it. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F209. The chosen project filters every column, row and the timeline (with subprojects while Subprojects is on); events aren't filtered; choice kept on the device. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F210. Tree: "All" on top (filled while nothing is chosen; tap clears the filter), projects in their order, "No project", then "Done" (done projects, opened by a tap). [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F211. Top-level project: full-width tile; subprojects: text rows indented per level, a thin line along an open branch. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F212. Collapsed branch: an edge peeks under a tile; a row shows an ellipsis on the right. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F213. Tap chooses; tap on the chosen folds/unfolds its branch; chosen filled light (dark in light theme), no outline; choice and folding kept on the device. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F214. Grey name: no open tasks in the project or its subprojects; done projects move under "Done" and come back with a new task. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F215. Long press on a project lifts it (haptic): the row follows the finger, a line shows where it lands; a sideways move right nests it under the project above, left takes it out a level; done projects don't lift. [`docs/plugin/screen.md` Проекты: панель и фильтр; `obsidian/ui/projects/TreeLift.ts`]
- F216. Project menu (tap on the chosen project's name over the tasks; none for All, No project, Done): Rename in the header (Enter saves, Escape cancels, another project's name refused). [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F217. Folder switch right under Rename: turns the project into a folder; dim and not pressable with "Has tasks of its own" under it when it has own tasks; tap moves the switch and closes the menu. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F218. Attach note…: a vault note search like Quick switcher; with a note: the note's name (opens in a new tab) and Detach. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F219. Delete project at the bottom in red: asks in place "Delete "Name"?" with a line that tasks stay, Cancel and red Delete; the choice goes to "All". [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F220. New project…: an in-place "Project name" field with a back arrow; Enter creates it at the tree's top level and gives it to the task(s)/field; an existing name (any case) is reused; empty, Escape or tap elsewhere creates nothing (Escape returns to the list). [`docs/plugin/tasks.md` Новый проект]
- F221. A card dragged onto a tree row (phone after the long press): the row fills in the drop colour; released, the project it was shown under is swapped for the row's; "No project" removes it; All, Done and folders don't light and the card flies back. [`docs/plugin/tasks.md` Проекты]
- F222. Panel closed: a card held at the screen's left edge slides the panel out for the carry. [`docs/plugin/tasks.md` Проекты]
- F223. A card held 0.6 s over a live project's row (or "No project") chooses it, filtering the screen in the same mode and unfolding its branch; the card stays in hand; moving on to another row opens that one. [`docs/plugin/tasks.md` Проекты]
- F224. Holding over an already chosen project or folder only unfolds its branch; All, Done, done projects and folders don't open. [`docs/plugin/tasks.md` Проекты]
- F225. Released nowhere (or Escape) after opening projects: the filter returns to the one at the lift and the card flies back. [`docs/plugin/tasks.md` Проекты]
- F226. Plus dropped in the tree (panel open): a line between rows, its indent (by how far right) picks top-level or subproject; released: "Project name" field there; Enter creates and chooses it. [`docs/plugin/tasks.md` Проекты]
- F227. A card dropped at the end of a section under a filter lands right after the last visible task of that section. [`docs/plugin/tasks.md` Проекты]
- F228. A folder can't take a task anywhere: dim on project pages, no highlight in the tree, the plus outside its subprojects writes nothing. [`docs/plugin/screen.md` Папка]

## By project mode

- F229. Chosen project's tasks in parts: its own tasks first without a header, then a section per subproject (any depth, tree order); right of it the timeline behind the divider. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F230. Without a filter / under All: all open tasks by top-level project, "No project" last; under "No project": its one part. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F231. Within a part tasks go by funnel (Inbox, Backlog, Soon, Now), file order inside each. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F232. Stage mark on the right of a card: tray (Inbox), box (Backlog), hourglass (Soon), sun (Now), or the date for a Soon task on another day. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F233. Every live subproject has a section, even empty (header and "No tasks" plate; tap opens a field there); the project's own empty part above subprojects isn't drawn; no tasks at all: one "No tasks" plate. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F234. "Done" and a done project always show this way whatever the mode; the view button keeps showing the chosen mode. [`docs/plugin/screen.md` Проекты: панель и фильтр]
- F235. A real list: tap opens the menu, counter folds, drag with dashed place and level by sideways position, picked tasks carried as a stack, auto-scroll at the edge; the order made is the file's. [`docs/plugin/tasks.md` Проекты]
- F236. Dropped into another subproject's section: the project it stood under changes to that one, others kept; into an empty part only the project changes; in Done and done projects tasks don't reorder. [`docs/plugin/tasks.md` Проекты]
- F237. New task here goes where its part writes (Inbox with the part's project); the field stays where it stood; the plus tap opens a field at the end of the chosen project's part (no filter: "No project" part); in Done and a folder the plus does nothing. [`docs/plugin/tasks.md` Проекты]
- F238. Nothing (typing, menu, Undo, drop) changes the mode or the chosen project. [`docs/plugin/tasks.md` Проекты]

## Full screen task

- F239. Opens from Open full screen, a tap on the description peek, or Add description; shows the title, all subtasks as a tree, the description below; no columns, wheel or calendar. [`docs/plugin/tasks.md` Задача на весь экран]
- F240. Subtasks always unfolded here; a tap on a counter opens the menu; folding in the file unchanged. [`docs/plugin/tasks.md` Задача на весь экран]
- F241. A circle left of each subtask ticks it done (filled, title struck, stays in place) or reopens it; counters update at once. [`docs/plugin/tasks.md` Задача на весь экран]
- F242. A tap on a subtask opens its menu, whose Open full screen goes a level in; over a subtask's title its parent task, tap goes a level up. [`docs/plugin/tasks.md` Задача на весь экран]
- F243. Under the title: the first project (folder icon and name in caption colour; a subtask's from its parent); tap chooses that project in the filter; none without a project. [`docs/plugin/tasks.md` Задача на весь экран; `obsidian/ui/full/FullScreen.ts`]
- F244. Description is Obsidian's own editor (links, images, markdown render as in a note, phone toolbar over the keyboard); written by itself after a pause in typing; empty removes it; Done top right while typing hides the keyboard. [`docs/plugin/tasks.md` Описание, Задача на весь экран]
- F245. Bottom row: Undo, «⋯» (the task's own menu), plus (new last subtask, behaves like quick add). [`docs/plugin/tasks.md` Задача на весь экран]
- F246. Rename from «⋯» makes the title the field (Enter/tap elsewhere saves, Escape cancels, empty changes nothing); a subtask's Rename edits its card. [`docs/plugin/tasks.md` Задача на весь экран]
- F247. Close top left (desktop: Escape when nothing is typed and no menu is open) returns to the main screen from any depth. [`docs/plugin/tasks.md` Задача на весь экран; `obsidian/ui/full/FullScreen.ts`]
- F248. If the task leaves its place (done, moved, deleted, here or elsewhere), the screen falls back a level, or closes. [`docs/plugin/tasks.md` Задача на весь экран]
- F249. Desktop: content in a centred column like a note's text. [`docs/plugin/tasks.md` Задача на весь экран]

## Search and the Done column

- F250. Search opens from «⋯» → Search; desktop also Cmd+F while focus is in the calendar (or in the note block). [`docs/plugin/tasks.md` Поиск; `obsidian/ui/ProjectBlocks.ts`]
- F251. Phone: field over the keyboard ("Search tasks"), results above it, Cancel closes; desktop: a panel top centre over the dimmed view, arrows move the selected row (stopping at the ends), Enter opens, Esc or a click outside closes. [`docs/plugin/tasks.md` Поиск; `obsidian/ui/search/SearchWindow.ts`]
- F252. Results grouped by section; title matches first, then description-only; found pieces highlighted; a description line with its icon, or a project-name line, under the title. [`docs/plugin/tasks.md` Поиск]
- F253. Empty field shows nothing; a query with no hits shows "No tasks found". [`docs/plugin/tasks.md` Поиск]
- F254. Under a chosen project each result shows its tree path ("Дружба › iPhone") small over the title. [`docs/plugin/tasks.md` Проекты; `obsidian/ui/search/searchRows.ts`]
- F255. Picking a result takes the screen to the task (Inbox/Backlog → Inbox–Soon, undated Soon → Soon–Now, dated/Now → its day beside the calendar, Done → Done column); a subtask goes where its task stands; a folded parent unfolds; a filter hiding it is cleared. [`docs/plugin/tasks.md` Поиск; `docs/plugin/screen.md` Колонка Done]
- F256. The found card wears a ring and is scrolled whole into sight (list or timeline, smoothly) until the screen is touched. [`docs/plugin/tasks.md` Поиск; `obsidian/ui/FoundCard.ts`]
- F257. Done column left of Inbox, reachable only through search; the wheel pill then narrows to Inbox alone; a swipe or the wheel leaves to Inbox and Done goes until the next search. [`docs/plugin/screen.md` Колонка Done]
- F258. A found Done task in a mode other than Two columns opens full screen. [`docs/plugin/screen.md` Колонка Done]

## Bottom row, «⋯» and the assistant

- F259. Bottom left: a capsule with Undo and «⋯»; bottom right: the plus. [`docs/plugin/screen.md` Колёсико]
- F260. Phone: the view button and wheel sit together between the capsule and the plus (wheel slightly right); in other modes the view button alone in the wheel's place. [`docs/plugin/screen.md` Режимы вида]
- F261. «⋯» menu over the capsule: Search, Select tasks and, on desktop with a model available, Best task (sparkle icon). [`docs/plugin/screen.md` Колёсико; `docs/plugin/assistant.md` Best task]
- F262. Best task: the menu closes, «⋯» turns into a small spinning ring; the plugin stays usable meanwhile. [`docs/plugin/assistant.md` Best task]
- F263. While running, «⋯» shows Stop (with the ring) in place of Best task; Stop cancels and shows nothing; if the answer arrives while the menu is open, the row turns back into Best task. [`docs/plugin/assistant.md` Best task]
- F264. Answer popup in the window's middle: small "Best task" title, the chosen task's card drawn as in the list (folded step under the task title, subtask under its parent's title), a notice line if the label couldn't be set or moved, the explanation as markdown, Close; Close, Esc or a click outside close; it arrives even if the view was closed. [`docs/plugin/assistant.md` Best task, Метка на выбранной задаче]
- F265. Errors in the same popup: "Couldn't find the best task" and one sentence what to do; "Today and Soon have no open tasks." with nothing to ask. [`docs/plugin/assistant.md` Когда что-то не так, Из чего выбирает Claude]
- F266. No Best task row on the phone or when no model is served. [`docs/plugin/assistant.md` На iPhone; `docs/plugin/settings.md` More → Assistant]

## Undo and notices

- F267. Undo button bottom left: undoes the last action, repeatedly up to 100 steps; dim when there is nothing to undo. [`docs/plugin/tasks.md` Отмена]
- F268. Desktop: Cmd+Z and Cmd+Shift+Z (redo) while focus is in the view, not in a field; in a field they undo/redo that field's typing only (search, section name). [`docs/plugin/tasks.md` Отмена; `docs/plugin/screen.md` Клавиши в полях]
- F269. Every action is one undo step (Done with repeat too); hand edits, Sync and morning moves aren't undone; history is lost on restart. [`docs/plugin/tasks.md` Отмена]
- F270. Notice "Can't undo: the tasks file changed" (and "Can't redo: …") when those lines changed since; the step is dropped. [`docs/plugin/tasks.md` Отмена; `obsidian/ui/CalendarScreen.ts`]
- F271. Notice "The task changed in the file; the view was refreshed" when an action hits a task changed meanwhile; "Tasks file not found: <path>" when the file is missing on write. [`docs/plugin/file.md` last section; `obsidian/ui/failureText.ts`]
- F272. Notices "Google Calendar: logged in" / "Google Calendar: <error>" after the Google login link returns; "Scriptable script copied" after Copy. [`obsidian/main.ts`, `obsidian/ui/SettingsTab.ts`] (code only)

## Calendar sources window

- F273. One row per file: Google Calendar, iPhone calendars, Work calendar, with when it updated ("Updated today", "Exported from iPhone") and the time; states "not logged in", "file missing", "file unreadable", "no answer in 15 s". [`docs/plugin/calendars.md` Окно источников]
- F274. Row tones: plain (grey time), orange time (stale), orange time with red text (last refresh failed); a grey error line under a fresh row's name when a retry failed but the file is still fresh. [`docs/plugin/calendars.md` Окно источников]
- F275. Unused files under "Not in use", fully grey. [`docs/plugin/calendars.md` Окно источников]
- F276. Refresh now at the bottom: asks Google again and refreshes the phone's calendars (on iPhone it briefly opens the Tasks app, or Shortcuts with the Scriptable export). [`docs/plugin/calendars.md` Окно источников]
- F277. The window opens over the wheel, a copy of the wheel staying over the backdrop, the panel centred on it. [`obsidian/ui/sources/SourcesPopover.ts`] (code only)

## Note block (project note)

- F278. At the end of a note attached to a project, a frame with that project's view: default Rows, By project via its view button; no tree, calendar or cross. [`docs/plugin/screen.md` Блок в заметке проекта]
- F279. Bottom of the frame: Undo, view button and plus. [`docs/plugin/screen.md` Блок в заметке проекта]
- F280. The frame is as tall as its tasks, the note scrolls; a very long one scrolls inside. [`docs/plugin/screen.md` Блок в заметке проекта]
- F281. The block's mode is kept on the device, one for all notes; its Subprojects row is the same setting as the main screen's. [`docs/plugin/screen.md` Блок в заметке проекта]
- F282. Shown in Reading view and Live Preview, never written into the note; no block in a note without a project. [`docs/plugin/screen.md` Блок в заметке проекта]
- F283. While focus is in the block, Cmd+Z, Cmd+Shift+Z and Cmd+F are the block's (not the note's); clicks inside don't put the note into editing. [`obsidian/ui/ProjectBlocks.ts`] (code only)
- F284. The block redraws when the note switches between Reading and Live Preview or its content is replaced. [`obsidian/ui/ViewWatch.ts`] (code only) (check)

## Phone only

- F285. Everything by finger: tap is the menu, long press is drag. [`docs/plugin/screen.md` Тема и платформы]
- F286. The input bar rides up and down with the keyboard in its own timing; while the keyboard is up, Obsidian's navigation room under the view is used. [`obsidian/ui/Keyboard.ts`] (code only)
- F287. The projects panel is an overlay with a dim (F207); search covers the view (F251); no description peek beside a split menu (F130). [`docs/plugin/screen.md`, `docs/plugin/tasks.md`]
- F288. Light vibration on drag lift and other haptic ticks (F52, F146, F171, F196). [`docs/plugin/tasks.md` Перетаскивание; `obsidian/ui/haptics.ts`]

## Desktop only

- F289. Click opens the menu, right click too, dragging starts at once; double click on free room adds a task; double click on a card renames it. [`docs/plugin/screen.md` Тема и платформы; `docs/plugin/tasks.md`]
- F290. ⌘-click / Shift-click multi-pick (F138–F145). [`docs/plugin/tasks.md` Массовые действия]
- F291. All columns mode; docked projects panel with its own divider. [`docs/plugin/screen.md` Режимы вида, Проекты]
- F292. Two-finger trackpad swipe moves the strip and days; Ctrl/Cmd + wheel or pinch zooms the timeline. [`docs/plugin/screen.md` Свайп по экрану и дни, Таймлайн]
- F293. The bottom row stays above Obsidian's status bar while the bar shows. [`obsidian/ui/StatusBarRoom.ts`] (code only)

## Theme

- F294. Dark and light themes follow Obsidian's; no setting of its own; the design's own palette, not Obsidian's theme colours (except accent and ground). [`docs/plugin/screen.md` Тема и платформы; `CLAUDE.md` One design system]

## Motion (seen across the screen)

- F295. A card stays the same card through any change: it changes in place, glides to its new place, or fades and folds away while neighbours close or open the gap; never two copies of one task on screen. [`docs/plugin/tasks.md` intro]
- F296. A new card grows in; a removed card fades, then folds. [`obsidian/ui/motion/KeyedRows.ts`, `obsidian/ui/layouts/RowsLayout.ts`]
- F297. Menus, the backdrop, the card copy and the description peek fade in and out together; the panel grows out from the pressed card. [`obsidian/ui/menu/Overlay.ts`, `obsidian/ui/menu/LiftedMenu.ts`] (code only)
- F298. A renamed task shows its new text on every card at once (list, timeline, menu stack, full screen) until the write is drawn. [`docs/plugin/tasks.md` Меню задачи; `obsidian/ui/RenamedTexts.ts`]
- F299. Timeline cards that change place or size glide there (a grid step's snap while stretched). [`obsidian/ui/Timeline.ts`] (code only)
- F300. Settings rows dragged by their grip: the row follows, others slide aside, released it glides in. [`docs/plugin/settings.md` Priorities]

## Settings (Obsidian's own settings UI)

- F301. Main tab: Priorities, Labels, Sections, Cards; More: four rows with a chevron (Calendars, Day and timeline, Tasks file — its row shows the file path, Assistant), each opening its own page; closing the page returns, closing settings closes it. [`docs/plugin/settings.md` intro; `obsidian/ui/SettingsTab.ts`]
- F302. Priority rows: grip, prefix, six colour circles (shaded as the card will be), a rainbow circle opening the system picker (live preview, saved on close), a hex code field (with or without #; saved on blur/Enter, invalid reverts; a preset's code picks the preset), a preview card ("Call mom", dot, time), a bin. [`docs/plugin/settings.md` Priorities; `obsidian/ui/SettingsTab.ts`]
- F303. "Add priority" adds a level. [`obsidian/ui/SettingsTab.ts`] (code only)
- F304. Label rows as priority rows with a name (spaces allowed); "Add label" adds `Label_<n>` in the first free colour; Several labels: Stripes / Blend. [`docs/plugin/settings.md` Labels]
- F305. Sections: Presets reorderable by grip, "Add preset", a bin ("Delete preset") per row; No section name. [`docs/plugin/settings.md` Sections; `obsidian/ui/SettingsTab.ts`]
- F306. Cards: height (28–40) and gap (0–10); applied live to every card. [`docs/plugin/settings.md` Cards]
- F307. Calendars page: Calendars shown (by account, toggle each), Google Calendar (Account with Log in/Log out, Client id, Client secret, Refresh interval), Work calendar (File path, Scriptable script → Copy), All sources → Stale after. [`docs/plugin/settings.md` More → Calendars]
- F308. Day and timeline page: Day starts at, Scroll to hour, Long press delay, Zoom levels. [`docs/plugin/settings.md` More → Day and timeline]
- F309. Tasks file page: File path, Section headings (Inbox, Now, Soon, Backlog, Done), line markers (due, slot, alarm, Live Activity, no-reminder, repeat, collapsed, label tag); names here name the column headers and place tiles. [`docs/plugin/settings.md` More → Tasks file]
- F310. Assistant page: Model, Model (Claude), Path to claude with the found path or "Not found" under it, Timeout (10–600, invalid reverts), Prompts → Best task with Reset to default, Label (None or a label); on iPhone "Claude works in Obsidian on the Mac." and only Timeout, prompts and Label. [`docs/plugin/settings.md` More → Assistant]
