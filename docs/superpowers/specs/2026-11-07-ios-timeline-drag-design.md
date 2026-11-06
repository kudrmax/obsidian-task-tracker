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
- backend: `rules.zoomAfterPinch(hourPx, wholeDayPx, levels)` → `"wholeDay" | hourPx` and `rules.zoomShown(saved,
  wholeDayPx, levels)` → the hour height to open at (`"wholeDay"` → the whole day; a number clamped to `levelsFor`'s ends;
  an unreadable saved zoom → `DEFAULT_ZOOM_HOUR`, clamped). `wholeDayPx` is `null` before the timeline has a height, and
  then the smallest level stands for the whole day. The `Zoom` type (`number | "wholeDay"`) is exported from contracts;
  `obsidian/ui/viewSettings.ts` still declares its own and may switch to it.
- frontend-swift: the tab bar is a standalone `UITabBar` (iOS 26 glass) bound to the one ribbon, the plus a real
  `UIControl` beside it (the accent's interactive glass, `UIGlassEffect` tinted). A standalone tab bar draws its glass at
  most 273 pt wide for three items, inset 21 pt in its bounds: its glass is lined up with the screen's 16 pt margin, so
  the gap to the plus is wider than the board's 10 pt. TabView could not host one shared content.
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
  sleep). Rename, Add Subtask and the plus's new task are small sheets with a focused field (as Reminders names a list);
  New Section and Rename Section stay alerts with a field, as Notes names a folder.
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

