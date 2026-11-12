# Projects one view: the view layer redone

Why: 0.4.196 shipped the view modes as overrides of the two-column ribbon (plugin: `is-view-*` CSS over absolutely placed columns, 32 mode checks in a 1814-line `CalendarScreen`; app: every view change a full read inside one animated transaction, row heights a feedback loop through global state). Max found five defects in seconds; two independent audits (2026-11-12) traced them and eight more to that structure. Behaviour Max approved does not change, except one decision below. This is a rebuild of how it is made, to production quality.

## What Max sees afterwards (the bar)

- The view mode is one choice, changed only by the view button; picking or clearing a project never changes it (Max, 2026-11-12: «независимое решение»; decision 3 of the one-view spec is withdrawn).
- Nothing moves that the user didn't move: no swipe or rubber-band where there are no pages (All columns, Rows, By project, the note block); no row jumps when a card or the plus is lifted, carried or let go; no cards flying or overlapping when the project, the mode or the filter changes — the screen redraws in place.
- Rows: each stage as tall as its cards while they fit; a list that has to scroll shows whole cards, its fade never lies on a card; no empty gaps; typing a task at a list's end keeps the field in view.
- A dropped card lands where its drop line was, without a jump.
- Same on desktop and phone, light and dark, plugin and app.

## How it is built

### Core (backend)
- One view mode in the device state (`view`), `filteredView` and the default-by-filter rule removed; the note block keeps its own.
- `ViewLayout` from the core for the current mode: the columns in order (list, title, width share), `swipe: "pages" | "none"`, the row-stack parameters (`least` so a scrolling list ends under a whole card plus the fade), All-columns widths next to `listWidths` (moved out of `obsidian/ui/listWidth.ts`).
- A context key (filter node + mode) on every read, so a frontend knows a read is «another context» (draw still) vs «the same context, changed» (animate moves).

### Plugin (frontend-obsidian)
- One `ModeLayout` interface (`mount`, `render(model, motion)`, `drops`, `listOf`, `swipeTrack | null`, `destroy`) with `RibbonLayout` (today's two columns, unchanged), `ColumnsLayout`, `RowsLayout`, `ByProjectLayout`. `CalendarScreen` holds exactly one; switching mode destroys and mounts. No `is-view-*` overrides on the ribbon's DOM; each layout its own CSS block (flex/grid), tokens only.
- Swipe attached only when the layout has a swipe track; drag targets from `layout.drops()`.
- Motion contract: a render carries `move | replace`; another context = `replace` (no FLIP). Row heights measured from content after motion settles (one ResizeObserver per list), frozen during a carry; drop room only in the hovered list, never a global `is-dragging` room.
- `CalendarScreen` split so it orchestrates, not builds every mode.

### App (frontend-swift)
- `FunnelPresentation` (apple/Core, tested): the core's view decoded into enums with one exhaustive switch per decision, and the context key.
- Motion keyed on context: another context draws still (one container crossfade at most); lists apply without animating differences.
- View-only changes (panel open, pick, mode) don't wait on a full file read; a filter change reads only the lists.
- `StackedRowsLayout: Layout` measuring height-for-width per list, `stackedRows` from the core, heights fixed during a carry or typing; no 160 pt trailing room in a list that fits.
- The ribbon stays mounted (hidden) outside Columns; RibbonPaging and RibbonColumns untouched.
- `CarrySession` its own tested type (serial, injected clock); `ProjectsBoard.read` serialized; setFunnelPlace writes ordered; BoardModel split (`FunnelState`, `CarrySession`, `ListMetrics`).

## QA before any release (written matrix, fresh agents told to break it)

Data: a copy of Max's real `TODOs Tasks.md` in the test vault / simulator vault.
Matrix: modes (Two columns, All columns, Rows, By project, note block) × actions (trackpad sideways and vertical scroll, finger swipe, scroll a long list to its end, lift / carry over each list / drop / cancel a card, carry the plus, type at a list's end, pick each project in turn quickly, clear the filter, open/close the panel, change mode, drag the divider, search a hidden find, undo) × platforms (plugin desktop, plugin phone view, app) × light/dark. Transitions checked frame by frame (CDP screencast / simulator recording), not only still screenshots. Every finding fixed at its cause; the whole matrix run again until it finds nothing. Only then merge, release, install.

## Order

1. Backend: the core changes above (tests first).
2. Plugin and app at once, each in its own worktree from the backend's branch.
3. Reviewer on the diffs; then QA agents (plugin, app) on the matrix; fix; repeat QA.
4. Merge, release, BRAT install, iPhone installer.
