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
