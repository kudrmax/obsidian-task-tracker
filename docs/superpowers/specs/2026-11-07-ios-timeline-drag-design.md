# iPhone app: the timeline as the plugin's, dragging as the design's

Max's three findings on the iPhone app after `ab2d2a0` (the main screen of `apple/`), all to fix in this branch
(`ios-timeline-drag`, worktree `.worktrees/ios-timeline-drag`):

1. Dragging does not follow the design board «3 — Перетаскивание» (`https://claude.ai/artifact/TW5RCK9KbJcq68BkY4G2om`,
   page «Главный экран», file `project/Drag.dc.html`).
2. The timeline ignores the plugin's rules: past events, titles, zoom, the grid's labels.
3. Dragging a task to make it a subtask shows nothing, and a drop lands about a second after the finger is lifted.

The plugin is the reference for every behaviour: `docs/plugin/screen.md` («Таймлайн», «Карточка задачи»),
`docs/plugin/tasks.md` («Перетаскивание»), `docs/plugin/calendars.md`, and the code in `obsidian/ui/Timeline.ts`,
`obsidian/ui/timelineLayout.ts`, `styles.css` (`.tc-event…`, `.tc-hour-label…`).

## What Max sees

### Dragging (board «3 — Перетаскивание», its notes 1–5)

- A long press lifts the card: a little larger, a shadow, a light haptic (the system's drag lift is right).
- **The card leaves its place at once.** No dimmed copy, no placeholder where it stood: the rows under it move up, the
  column has no hole. (Now the app keeps the card at 35% opacity in place: wrong.)
- Where it will land, the rows part by one card's height (now right in the app; keep it).
- **Level, as in the plugin:** left of the list's middle a task, each indent step right of it one level deeper
  (a subtask). The level is what the core allows there (`rules.gapAt` already fits it: `fitLevel`). The gap shows that
  level while the finger moves: it is drawn indented to it, with the subtask branch line of that level, so a subtask
  drop is visible before it is let go. Moving right snaps to the next level the core allows.
- On the calendar: the line at the start time in the accent with its time (now right; keep it).
- **The plus becomes the cancel target** while anything is carried: in the plus's place and size, a glass circle with
  a cross (`xmark`). Held over it: the circle turns solid (label colour, cross in the ground's colour) and grows to
  1.18×. Let go over it: the card flies back to where it was taken from, same column and row, nothing is written. Let go
  over no target: it flies back too. Any drop already made is undone by the undo button.
- **The drop lands at once.** The card must stand in its new place in the same instant the finger lets go, not a
  second later (see «Why a drop takes a second»).

### The timeline (as `obsidian/ui/Timeline.ts`)

- **Past events are grey**, not a paler colour: the ground lifted 1.5% towards the text (light theme 1.2%), the bar
  and the title the ground mixed 12.5% towards the text (light 10%) — `--tc-event-past-*` in `styles.css`. All-day
  rows the same.
- **An event shows its title only**, never its time range. The title sticks to the top of the visible part of its
  block while the block is scrolled partly out of view (`.tc-event-body { position: sticky; top: 0 }`).
- **Tiny events** (block shorter than 24 px, `tinyItemHeight`) take the tiny font and no top padding.
- **Zoom by pinch**: from the whole day on screen to the settings' largest hour (`zoomLevels` in `data.json`,
  default 28, 56, 112, 224 px an hour). The pinch keeps the minute under the fingers in place. The zoom is the device's
  own (not synced); it opens at the zoom last left, the whole day staying the whole day when the screen's height changes.
  The snap step of a drag follows the zoom (`tasks.snap` with the current hour's height).
- **The grid follows the zoom**: finer labels (`:15`, `:30`, `:05`) and unlabelled lines appear as the hour grows
  (`gridAt` and the plugin's `divide`). Labels near the now pill hide, as in the plugin.
- Task cards on the timeline: already stacked by the core (`rules.stackTasks`) with the start or the duration on the
  right; at every zoom the stack is laid out at the current hour's height.

### Why a drop takes a second

`Vault.read()` (`apple/Core/Sources/Core/Vault.swift`, `settledRead`) waits `settle` (1 s) when the tasks file changed
less than a second ago, in case another app is still writing it. Right after the app's own write the screen's re-read
always hits that wait. The app must not wait for its own write: a read of a file whose text is exactly what this app just
wrote needs no settling.

### Switching between Inbox, Soon and Today (Max's finding 4, screen recording)

Now each tab of the `TabView` holds its own copy of the ribbon: a tap on a tab first cuts to the other copy, then its
ribbon slides; mid-swipe the day column's width animates from half to the divider's width, so the columns reflow while
they move. It reads as broken.

- **One ribbon, columns standing side by side as if just off the screen**, every column a fixed width the whole time.
  A swipe is the plainest paging scroll: the content follows the finger, let go it settles on the nearest place with
  the system's deceleration. No width animates during a swipe.
- Widths: the day list is the divider's width `d` (half the screen until the divider is moved, within 110…280 pt);
  Soon is `W − d`, Inbox over Backlog is `d`, the timeline is `W − d`. The three places are then at offsets `0`, `d` and
  `W`; at every place two columns fill the screen exactly.
- **The tab bar only says where the ribbon stands** and moves it: a tap on a tab scrolls the one ribbon there with the
  system's scroll animation; a swipe moves the selection along. There is one copy of the screen, never a cut.
  The native tab bar stays (Liquid Glass): if SwiftUI's `TabView` cannot host one shared content, use a standalone
  `UITabBar` (UIKit, iOS 26 glass) bound to the ribbon's place, with the plus beside it as now — check the glass and
  the layout on the simulator against the iOS 26 tab bar.

### Feeling like an iOS app, not the plugin (Max's finding 5)

Max: the app feels like the Obsidian plugin — sticky, delayed, animations that are not iOS's. iOS apps are light and
immediate: every touch answers in the same frame, every change is one system animation, nothing waits.

- **Nothing waits for the file.** A tap, a drop, a day change shows its result at once. The app's own writes never
  hit the settle wait (above); the day before and after the shown one are read ahead, so ‹ › and a tap on Today show
  the day in the same frame.
- **Changing the day** (‹ ›, Today): the day list and the timeline change together, in one motion — a horizontal slide
  in the arrow's direction, as Calendar slides days; the column title changes with them. No staggered parts, no fade
  after a pause.
- **The lift and the shadows are the system's.** A lifted card uses the system's drag lift and preview as they are —
  no extra scale or custom shadow of ours (the plugin's `0 14px 34px` shadow is the plugin's, not iOS's).
- **Task capsules stay the plugin's shape and metrics** (Max's own rule: every task list in the apps is the plugin's
  capsules), but behave as iOS controls: a touch highlights the capsule at once (the system's highlight on press, as a
  `UIButton`'s), a menu grows from it with the system's animation, nothing on them animates that iOS would not.
- **The plus, carried and brought back:** it is a real element that moves. Taken, the plus itself follows the finger
  (the system drag of the plus's own view, the accent circle with the plus); let go on the cancel target or on no
  target, it flies back to its place (the system's cancel animation), never dissolves. Let go between cards, the gap
  shows the level it lands at as for a card (a subtask when right of the middle), so a new subtask can be made by the
  plus too.
- **Animations:** only system ones — `UIView`/SwiftUI springs with the system's defaults (`.snappy`/`.smooth`,
  `UISpringTimingParameters`), the system's drag, menu, sheet and scroll animations. No opacity fades of whole lists, no
  `.animation(value:)` on whole lists that re-animates everything on every read.

### The task's menu on a long press (Max's findings 6 and 7, screen recording)

Max asked plainly: **the task's menu opens on a long press**, and a long press then a move drags the task. It works so in
other apps (his friend's app, Files, Mail, Apple Podcasts' library with its manual order: long press opens the menu, drag reorders): it is the system's own behaviour when a view has both a
`UIContextMenuInteraction` and a `UIDragInteraction` — the long press lifts the card and shows the menu; moving the
finger while it is lifted turns the lift into the drag. The app now opens the menu on a tap, through a hidden
`UIButton` laid over the card and pressed from code: the menu grows from that hidden button instead of the card, and
when it closes a ghost of the card's text with a dashed outline stays behind. That is a hack and goes.

- The card: one `UIContextMenuInteraction` (the menu, the card itself as the lifted preview with its capsule shape, the
  same preview for the dismissal so it settles back with no ghost) and one `UIDragInteraction` on the same view. No
  hidden buttons, no `performPrimaryAction`, no tap gesture that opens a menu.
- A tap on a card: nothing opens (iOS lists open on a tap only what a tap means; the menu is the long press). Record
  this in «Decisions» for the lead to confirm with Max.
- The same for the cards on the timeline and the subtasks of the full screen.
- The subtask counter keeps its tap (fold), as its own small control.

**No hacks anywhere in the app.** Go through all of `apple/App` and `apple/Core` and take out what works around the
system instead of using it, for example: views laid over cards to catch touches (`overlay { Color.clear… }` while
carrying), sleeps before showing a sheet after a menu (`Task.sleep(350 ms)` — use the menu's own completion or
`UIContextMenuInteraction`'s `willEnd` animator), a timeout that clears a stuck carry flag, a holder class remembering the
last minute because the hover ends before the drop, polling the file every 2 s where a file presenter
(`NSFilePresenter`) or the scene's phase tells of a change, alerts used as text fields where a system sheet or an inline
field is the iOS way. Each one replaced by the system's way, or kept with a one-line reason in «Decisions».

### Typing tasks in place, the plugin's quick entry (Max's finding 10 — a blocker)

The app now asks a new task's title (plus dropped, Add Subtask) and a rename in a small sheet with a field. Max: a
blocker, never in production. The plugin writes a task **right where it will stand**: a field opens in the list at the
task's place, as if filling in the markdown file itself; **Enter saves it and opens the next empty field right under
it**, so a batch is typed in a row; the bar over the keyboard turns the field into a subtask of the task above and back,
and more. All of it must come over, exactly: `docs/plugin/tasks.md` «Новая задача: быстрый ввод» is the behaviour
(every row of its tables and lists), the board «5 — Новая задача» (`project/NewTask.dc.html`, `project/KeyBar.dc.html`)
is the look on the phone, and the core already holds every rule of it: the door's `entry.*` (`docs/door.md`, «entry.*:
the quick entry» — the session, the look, `openAtDrop`, `openSlot`, `subtaskSpot`, `renameSpot`, `open`, `type`,
`setPriority`/`togglePriority`, `setLabels`/`toggleLabel`, `setRepeat`, `indent(±1)`, `toggleSection`, `enter`, `blur`,
`escape`, `choosePlace`, `listEntry`, and the jobs: `entry.call` → `tasks.<method>` → `entry.shown`/`unshown` →
`entry.done`). The plugin's frontend is the reference for driving it: `obsidian/ui/quick/QuickEntryController.ts`,
`QuickBar.ts`, `MarkdownTitleField.ts`.

- **Where the field opens:** the plus dropped between cards (at the level the drop shows), on the calendar (that time,
  only the flag on its bar), Add Subtask (last subtask), Rename (over the card, its text in the field), a tap on a «No
  tasks» plate (that section). A tap on the plus itself keeps opening the voice/typing capture sheet (Max's earlier
  decision for the phone), unless Max says otherwise.
- **The field** is the capsule at the task's place, no frame, the accent cursor, the list scrolled so it stays above the
  keyboard; the rows below it part for it. A `p1 ` prefix sets the priority as typed, the field tinted.
- **Enter** writes (a job) and opens the next empty field right under the written task at once — the written card
  appears in its place the moment the file has it, the field never jumps. Enter on an empty field ends (a subtask's
  first steps one level left). A tap elsewhere saves and ends. The top bar's «⋯» becomes the accent check that ends
  typing (board note 5); undo stays.
- **The bar over the keyboard** (board «5», `KeyBar.dc.html`): left the section button and the outdent/indent pair, right
  the priority flag, repeat and the place menu (Inbox, Backlog, Soon, Today, Date…), as glass groups of iOS 26
  (`UIToolbar`/keyboard accessory or `.toolbar(placement: .keyboard)` with glass); the tab bar hides while typing. What
  each shows and allows is the session's state (`EntryState`): a subtask has no place button, a calendar field only the
  flag, the section field only the section button.
- **Sheets for titles go**: Rename, Add Subtask and the plus's drop use the field in place; New Section uses the
  section field (the section button) where it applies.

**Quality bar.** This branch is reviewed as a release of an App Store app: before reporting, the Swift agent goes
through every gesture and screen on the simulator itself — swipes between the places, taps on the tabs, the day arrows,
a tap and a long press on a card, a drag inside a list, to a subtask, to another column, to the calendar, onto the cancel
target and back, the plus the same ways, the menu and its sheets, light and dark — and fixes what is slow, jumpy or not
iOS before the lead sees it.

### A card's corner (Max's finding 8, screenshot)

On a timeline stack card «Позвонить маме» the repeat icon overlapped the start time «17 / 30»: the corner was a fixed
24 pt column holding the list card's due date, the repeat mark and the stacked start all at once. As in the plugin
(`renderMeta`, `fillMeta`, `.tc-due…`, `.tc-meta`, `.tc-block-meta`):

- A list card's corner is the due day over its month, the repeat mark beside the day (or the repeat mark alone); the
  counter over the notes mark stands before it as its own column. A timeline card's corner is only the stack's two
  small lines (its start when stacked, its duration when shorter): no due date and no repeat mark there.
- No column has a fixed width text can overflow: each is at least the plugin's width (24, 22, 14) and grows with what
  it holds; the title fades out before them.

## What the contract gives (backend)

Already started in this worktree (uncommitted, check and finish): `core/application/timelineZoom.ts` — `ZoomLevel`,
`DEFAULT_ZOOM_LEVELS`, `DEFAULT_ZOOM_HOUR`, `parseZoomLevels`, `formatZoomLevels`, `levelsFor(wholeDayPx, levels)`,
`gridAt(hourPx, measures)`, `gridMarks(grid, dayHours)`; re-exported from `contracts.ts`; `obsidian/ui` already reads
them from there (`viewSettings.ts`, `zoomLevels.ts`, `timelineLayout.ts`). `tests/architecture.test.ts` fails until the
new runtime values are listed and offered through the door.

To add:

- Through the door (`rules.*`): `levelsFor`, `gridAt`, `gridMarks`, `parseZoomLevels`; constants `DEFAULT_ZOOM_LEVELS`,
  `DEFAULT_ZOOM_HOUR` in `rules.constants`.
- The settings' zoom levels: a door call that answers the levels of `context.settings` (`zoomLevels` in `data.json`,
  the defaults when it has none or they don't read), so Swift never parses `data.json`.
- Past events' paint: `pastEventPaint(ground, text, theme)` (or the like) answering `{ bg, bar, text }` as hex, by the
  shares above, so the plugin's tokens and the app's colours are the same numbers in one place; the plugin keeps its
  CSS tokens, the numbers' source named in a comment.
- Whatever else the Swift side finds it would have to compute: tiny-event threshold stays a frontend measure
  (`LAYOUT.tinyItemHeight` / Swift `CardMetrics`), the grid measures are passed in like `TimelineInsets`.
- Tests for each, `docs/door.md` updated, `core/task-calendar-phone.js` rebuilt.

## The Swift side (frontend-swift)

Files: `apple/App/Board/` (`CardButton.swift`, `ListColumn.swift`, `TimelineColumn.swift`, `PlusButton.swift`,
`BoardModel.swift`, `BoardScreen.swift`), `apple/Core/Sources/Core/` (`BoardSnapshot.swift`, `TaskBoard.swift`,
`Vault.swift`).

- Dragging: hide the lifted card's row while carried (collapsed, the rows close up); no alpha copy. The gap shows the
  core's level as the finger moves (call `rules.gapAt` while hovering — it is pure and fast through `board.rule`),
  indented with its branch line. The plus turns into the cancel circle while `model.carrying`; a drop interaction on it
  answers `.cancel` so the system flies the card back; hover state grows and fills it. On a cancelled or targetless
  drop the row reappears where it was.
- The drop shows at once: either skip the settle wait for the app's own write (preferred, in `TaskBoard`/`Vault`), and
  keep the re-read as small as it can be; measure the time from drop to the new snapshot and report it.
- Timeline: grey past events and all-day rows from the core's paint, titles only, sticky titles, tiny events, pinch zoom
  between `levelsFor`'s ends with the minute under the fingers kept, the zoom kept on the device (`UserDefaults`,
  `wholeDay` or an hour's height), the grid from `gridAt`/`gridMarks` with minor labels, labels hidden next to the now
  pill, `tasks.snap` and `stackTasks` with the current hour's height.
- Check on the simulator (iPhone 16 Pro, the scratch vault in the app's container — see the lead's notes below), light and
  dark, with screenshots; `npm run test:apple` and a simulator build green.

Lead's notes for the simulator: the app's debug build takes `--vault <folder>` (see `TaskCalendarApp.swift`); a scratch
vault with tasks and `calendar/iphone.json` sits in the app's data container under `Documents/Vault`. Cyrillic is typed
into the simulator by `printf '…' | LANG=en_US.UTF-8 xcrun simctl pbcopy <udid>` and the system Paste.

## Review fixes (branch `ios-review-fixes`, after the first install on the phone)

The final review of `ios-timeline-drag` (merged as bbcd27b) found these. Each is fixed at its cause.

**Core (backend first).** Swift wrote quick-entry decisions itself; they move into the core and come through the door,
and the plugin reads the same functions instead of its own tables:

- R6a. The spots for a rename and for a subtask: Swift built `{kind:"stack", parent}` itself (`QuickEntryHost.swift`
  ~157–164). It asks the core (`renameSpot`, `subtaskSpot`, and a spot for the task's full screen).
- R6b. Which lists a place shows and which place shows a column: Swift repeats the plugin's `SHOWN_LISTS` and
  `modeShowing` (`QuickEntryHost.swift` `shown`, `turn`). One table in the core, through the door; the plugin reads it.
- R6c. Where the field and the waiting lines stand among a task's subtasks on the full screen: Swift works it out
  (`TaskFullScreen.swift` `stackRows`). The core answers it as `listEntry` does for lists (`stackEntry`).

**Swift.**

- R1. The app's own write makes the file watch read again, and that read can draw the written card before
  `entry.shown`: the card and its waiting line show together and the field jumps. The watch does not answer the app's
  own writes, and no watch read redraws while quick-entry jobs run.
- R2. When the read after a quick-entry write fails, neither `shown` nor `unshown` is called and a ghost line stays.
  Every job ends in one of them (door.md step 3).
- R3. When `entry.call` and `entry.done` both throw, the job loop hands out the same job forever on the main thread. A
  job that failed is dropped and the loop stops; the app never hangs.
- R4. «Date…» in the bar: the day goes through `tasks.placementOfDay` before `choosePlace`, as the plugin
  (`QuickBar.ts`), so today is `now` and the field stays where it is.
- R7. The entry ends only when the columns actually turn to another place, not when a horizontal swipe starts.
- R8. A read while a card is carried does not end the carry (the arrow's background read, `reveal`).
- R9. List names are read again when the settings change.
- The loss of typed text Max saw: the field must keep the keyboard when it moves to another row or list (no
  `removeFromSuperview` that drops the first responder, no keys lost while it moves, no `blur` from a stale
  `textFieldDidEndEditing`). Check by typing fast across Enter, a move to another list, a plate and a rename.

**Max's findings on the phone (Swift).**

- M1. The plus is dragged at once: no hold before it lifts (a tap still opens the capture sheet).
- M2. The plus flying back after a cancelled or targetless drag still dissolves and grows. It flies back to its place
  as one piece, the way the system returns a cancelled drag preview, and lands in its slot.
- M3. A card flickers for a moment when its drag starts (screen recording). The lift is one smooth system lift, no
  frame where the row and its preview both show or both vanish.
- M4. While dragging it is unclear whether the drop makes a task or a subtask. The gap shows the level the drop will
  write, indented with its branch line as in the plugin, and moves between levels with an animation as the finger
  crosses the level's line.
- M5. The Soon column is as narrow as the calendar. The columns' widths are the plugin's (the ribbon's `d, W−d`
  pattern applies to which column, check `obsidian/ui` and the board), Soon is not tied to the calendar's width.
- M6. A swipe can fly through every place at once. Paging goes one place per swipe, as in the plugin.
- M7. A subtask being dragged keeps its vertical branch line hanging. The carried subtask shows no stray line: the
  branch closes up as the row leaves, and the gap draws the line it will join.

- M8. The task's menu scrolls by a few points: it must fit without scrolling for a card anywhere on the screen
  (top, middle, bottom of a column and of the calendar, a task with every option offered). As stock iOS menus do:
  the most used actions as one row of medium icon buttons at the top (`preferredElementSize = .medium`, as Notes and
  Files), the rest as rows; rarely used ones may go one level down into a submenu, never deeper. Nothing is removed.

- M9. A scrolled list's cards are cut by a hard line under its title (Inbox, Backlog, Soon, the day: screenshot,
  a card's sliver under «Backlog»). Every scrolling list and the calendar fade out softly at the edge they scroll
  under instead: a short vertical fade (the height of about half a card), shown only while content is actually
  under that edge, so a list at its top shows no fade. In the app: iOS 26's own soft scroll-edge effect where it
  applies, otherwise a gradient mask of the same kind. In the plugin the same, as a `mask-image` from a new `--tc-…`
  token, so both look alike (frontend-obsidian, both platforms).

**Docs (frontend-obsidian).** R5: `docs/plugin/app.md` still describes the New Task / Rename / Add Subtask sheets. It
describes the quick entry in place as the app now has it (the field in the list, Enter, empty Enter, what ends typing,
«⋯» as the check, the bar over the keyboard and its smaller forms, `p1 `, the long press on the empty calendar, «No
tasks», rename in place, subtasks on the full screen) and its check steps.

## Decisions

(Each agent adds here what it decided on a gap, one line each.)

- backend: the settings' zoom levels come through a new door space, `timeline.zoomLevels()` (no arguments, over
  `context.settings`): `[{ hourPx }]`, only the height kept; the defaults when `data.json` is missing, has no
  `zoomLevels`, or any level's `hourPx` isn't a positive finite number (all or nothing, as the plugin's own text field
  writes all or nothing). The pure reader is `zoomLevelsOf(saved)` in `timelineZoom.ts`, core-only (not in contracts).
- backend: `rules.pastEventPaint(ground, text, theme)` answers `{ bg, bar, text }` in `#RRGGBB` (`bar` = `text`, both the
  12.5% / 10% mix), channels rounded as `Math.round`; `#RGB` reads too. `styles.css` keeps its tokens, the shares are
  named in a comment beside `PAST_SHARES` in `paints.ts`.
- backend: `rules.formatZoomLevels` is offered too (the plugin's settings field uses it; the app may show the levels the
  same way).
- frontend-obsidian: the plugin draws the grid's minor lines and labels from `gridMarks` and takes `Grid` from contracts;
  past events keep their CSS tokens, a comment by them names `PAST_SHARES`. The plugin's pinch
  bounds, the zoom a released pinch saves and the zoom it opens at come from `levelsFor`, `zoomAfterPinch` and
  `zoomShown` (`wholeDayPx` null until the timeline is measured); `viewSettings.ts` re-exports the core's `Zoom`.
- backend: `rules.zoomAfterPinch(hourPx, wholeDayPx, levels)` → `"wholeDay" | hourPx` and `rules.zoomShown(saved,
  wholeDayPx, levels)` → the hour height to open at (`"wholeDay"` → the whole day; a number clamped to `levelsFor`'s ends;
  an unreadable saved zoom → `DEFAULT_ZOOM_HOUR`, clamped). `wholeDayPx` is `null` before the timeline has a height, and
  then the smallest level stands for the whole day. The `Zoom` type (`number | "wholeDay"`) is exported from contracts;
  `obsidian/ui/viewSettings.ts` still declares its own and may switch to it.
- frontend-swift (finding 9, replaces the standalone `UITabBar`): the bottom bar is a real `UITabBarController` (three
  `UITab`s and a `UISearchTab`) laid over the one ribbon, its tabs empty pass-through placeholders, so iOS lays out the
  bar and its round search slot itself (same height, centre line and gap as the first build's TabView). The plus is our
  draggable control placed on the search slot's own frame as the bar laid it out (the bar's square subview), the same
  size; the search tab is never selected (`shouldSelectTab` refuses it). A tap on a tab moves the ribbon.
- frontend-swift: the day list and the calendar slide as one unit when the day changes (`.push` from the arrow's side,
  `.smooth`); SwiftUI's clip does not hold the UIKit-backed columns apart during a transition, so they move together as
  the day they are. The day before and after are read ahead (`days.step` + a snapshot each) and shown in the same frame;
  the screen is read anew underneath.
- frontend-swift: every drop goes through one UIKit `UIDropInteraction` on the window (`BoardDrop`); the lists and the
  calendar register as places with their frames. So a dropped card's preview flies into the gap or onto the line's time
  (`previewForDropping`), a cancelled or targetless carry flies home (`previewForCancelling` to where it was lifted), and
  the cancel target (the plus's own `UIDropInteraction`, proposing `.cancel`) takes over cleanly from the places. SwiftUI's
  `onDrop` is gone (it offered no drop preview and kept hovering over the plus).
- frontend-swift: a card is a `UIControl` with a `UIContextMenuInteraction` (preview and dismissal preview = the card's
  content in its capsule) and a `UIDragInteraction`; a tap only highlights it (an overlay outside the preview, so a lifted
  card never carries the dim) and clears the search ring. The subtask counter is its own `UIButton` laid exactly where the
  capsule draws the counter (the capsule reports that frame). **For the lead to confirm with Max: a tap on a card opens
  nothing; the menu is the long press.**
- frontend-swift: menu rows that open a sheet or a page run in the context menu's `willEnd` animator's completion (no
  sleep). ~~Rename, Add Subtask and the plus's new task are small sheets with a focused field~~ (superseded by finding 10:
  they type in place, see «frontend-swift (quick entry)» below); New Section and Rename Section stay alerts with a field,
  as Notes names a folder.
- frontend-swift: the tasks file is watched by an `NSFilePresenter` (`Vault.watchTasksFile`) while the scene is active,
  and read again when the scene comes back; no polling. The app's own reads and writes are coordinated as that presenter
  (else every read after a write waited ~0.5 s for the system to message it), and the app's own write tells the watch
  itself, so a reminder's button in the app's process still redraws the screen.
- frontend-swift: a read finding exactly the text this app last wrote skips the settle wait. Drop to the card in its
  new place, measured on the simulator: 48–69 ms (write 16–27 ms, the screen's read ~35–50 ms), the drop preview's flight
  covering it.
- frontend-swift: a carried card's rows (with its subtasks) collapse to no height and stay in the hierarchy (their drag
  interaction must outlive the carry); the gap is drawn at the core's level with that level's branch line; a gap that
  would land in an empty section takes the place of its «No tasks» plate.
- frontend-swift: the zoom is kept in `UserDefaults` (`timelineZoom`: `wholeDay` or the hour's height, as
  `rules.zoomAfterPinch` answers) and opened by `rules.zoomShown` at the column's visible height; the pinch is the scroll
  view's `MagnifyGesture`, the minute under the fingers kept by scrolling to it every frame. The stack is re-laid by
  `rules.stackTasks` (with `rules.stackCorner`) once per hour height, the grid by `rules.gridAt`/`rules.gridMarks` with
  the plugin's measures (divisions 5, 15, 30; label gap 40; ticks 5 min / 16 pt).
- frontend-swift: kept waits, each the system's way for its job: the full screen's description saves 1 s after the last
  keystroke (the door leaves the debounce to the host), search reads 150 ms after the last keystroke, `Vault`'s settle
  wait for another app's write, the recorder's meter timer.

- backend (round 2): the list drop's finger rules are in the core, `core/application/listDrop.ts`: `rules.levelAt(x, { left,
  width }, indent)`, `rules.carriedMiddle(y, grabPx, cardHeight)` and the plugin's whole `placeAt` (gap by the cards'
  middles, headers, the open room's shift and the hysteresis), moved as it is so the plugin keeps its behaviour exactly;
  `obsidian/ui/drag/listPlace.ts` is now a copy and should become a re-export of `placeAt`/`PlacedCard`/`PlacedHead` from
  contracts (frontend-obsidian), with `ListDrop.levelAt`/`cardY` calling the core's.
- backend (round 2): branch lines answer `{ last, through }`, richer than mid/last: `rules.branchOf(levels, index)` is the
  plugin's `linesOf` (a row's), `rules.gapBranch(cards, gap)` the open gap's as a row of its level before `cards[gap.index]`;
  `null` at level 0. `last: false` is the Swift `.mid`. The plugin's `TaskList.linesOf` and Swift's `BoardSnapshot.branch`
  / `TaskFullScreen.branch` / `ListColumn`'s gap branch can all switch to them.
- backend (round 2): `rules.labelHidesNearNow(y, nowY, lift, pillHeight)` in `timelineZoom.ts`; `nowY` `null` stands for
  a day that is not today, so the host doesn't decide that part either.
- frontend-swift (round 2): a carry ends on its drag session's end (the window's drop interaction and the card's own drag
  both tell it), and a drop's carry ends when its write and read are done, whatever the reads did or threw; a read asked
  while one runs makes that one read once more and is waited for, a drop's read drawn with no animation.
- frontend-swift (round 2): the pure rules run on a second JavaScriptCore context of their own (`TaskBoard(pure:)`), so a
  gap, a snap or a label asked in the same frame never waits for a read on another thread. Per pinch frame: the zoom's
  range is asked once per column height; the grid once per whole hour height and its lines once per grid (bounded
  caches); the stack is laid out anew off the main thread, the last one scaled to the pinch's height until it lands;
  `rules.labelHidesNearNow` is asked only for labels within two pill-lifts of the now line, the rest show.
- frontend-swift (round 2): a list's drop uses the core's `levelAt`, `carriedMiddle` (the finger's offset in the card taken
  as the drag begins) and `placeAt` (rest frames, headers, the open room's shift, hysteresis 6); branches are
  `branchOf` / `gapBranch`, drawn with the `through` lines of tasks further up. A carry knows its card, task and column
  from where the card is drawn. The drop places hold the model weakly; the file watch follows the settings' tasks file.
- frontend-swift (round 2): the ribbon pages by view alignment with no limit per swipe: it settles on the place the
  swipe's speed reaches, so one fast swipe goes from Today to Inbox.
- frontend-swift (quick entry): the app drives the core's `entry.*` as `QuickEntryController` does; the calls run on the
  pure rules' context over the settings as last read (`TaskBoard.entry`), so a keystroke never waits for a read. The jobs
  run one at a time: `entry.call` → `tasks.<method>` → the file read again → `entry.shown`/`unshown` drawn in the same
  transaction as the new screen → `entry.done`. Nothing of the door was missing.
- frontend-swift (quick entry): the field is one `UITextField` moved into whichever row, calendar spot or title holds it,
  so the keyboard never drops between the lines of a batch; the bar is its `inputAccessoryView`, held at a fixed 60 pt
  (a holder view with that intrinsic height) so the keyboard and the lists never move when the bar's buttons change. Its
  groups are SwiftUI `glassEffect` capsules in a `GlassEffectContainer` over a fade into the ground, as the board.
- frontend-swift (quick entry): Enter is drawn with no animation (the text stays where it was typed and the next field
  is right under it in the same frame); indent, the section button and a place chosen move with `.snappy`.
- frontend-swift (quick entry): where the field opens: the plus dropped in a list (the drop's level) or on the calendar,
  a long press on the calendar's empty space (`UILongPressGestureRecognizer`, 0.25 s, the landing line follows the finger
  and the field opens at its time on release, the plugin's row «Долгий тап по пустому месту календаря»), Add Subtask,
  Rename, a tap on a «No tasks» plate. A tap on the plus keeps the capture sheet.
- frontend-swift (quick entry): a tap elsewhere is a window tap recognizer that never cancels the touch: the touch does
  its own work first, and the entry ends unless that work opened another field. A swipe of the ribbon, the day arrows,
  Today and Back from the full screen end it the same way (blur, the text kept). The keyboard going away ends it too,
  except while the field waits off screen for another day's list or a sheet of the bar holds it.
- frontend-swift (quick entry): the flag is a system menu (levels close it, labels toggle with the menu kept open,
  disabled tiles as `EntryState` says); the place is a system menu of the lists by `tasks.listName` and Date…, a
  medium-detent graphical date sheet whose check calls `choosePlace`; another day waits for the queued writes, shows that
  day and calls `moveToEnd`. Repeat opens the task menu's repeat sheet, its rule held by the session (`setRepeat`).
- frontend-swift (quick entry): while the field stands in a list every row's branch is asked again (`rules.branchOf`
  over the levels with the field in, cached per list of levels), so the card above the field keeps its line down to it.
- frontend-swift (quick entry): the full screen types in its own stack (spot `stack`): its plus and a subtask's Add
  Subtask open the field after the subtasks, Rename turns the title into the field in the title's own type (nothing
  moves) or a subtask's card into the field; its top buttons give way to the check while typing; its own menu has no Open
  Full Screen.
- frontend-swift (quick entry): the section field is the header's type (15 pt semibold) in the text colour with the
  placeholder «Section name». The task menu's Section › New Section… stays an alert: it names a section to move that task
  into, not a header at the field's place.
- frontend-obsidian (M9): the fade covers the plugin's lists and the timeline (`ScrollEdges`: `is-under-top`, `is-under-bottom`,
  masks `--tc-fade-scroll-top/bottom/both` over `--tc-scroll-fade` = half a card); both edges are followed, so Inbox over
  Backlog fades at its bottom too. Under the foot's own fade the bottom mask is hidden anyway. The full screen and search
  results keep their edges (not named in M9). An event cut by the timeline's top keeps its title just below the fade
  (`top: var(--tc-scroll-fade)` while `is-under-top`), so it reads whole instead of half faded.
