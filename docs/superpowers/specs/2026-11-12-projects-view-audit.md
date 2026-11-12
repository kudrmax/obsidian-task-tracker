# Projects one view (0.4.196): audits, 2026-11-12

Two independent read-only audits of master 9a910b86. They are the reason for `2026-11-12-projects-view-rework.md`. Line numbers are on that master.

## Defects Max found (in seconds)
1. All columns: a sideways trackpad scroll jerks the screen and springs back.
2. Rows: a long list's scroll fade lies on a card.
3. Switching projects: cards fly in from elsewhere.
4. Rows: short lists get huge empty gaps.
5. Rows: every row jumps when a card is lifted.
Also: picking a project switched the mode to Rows (decision 3, withdrawn); «All» meant «tasks with any project» (now: no filter).

## Plugin — structural causes
1. Modes are CSS overrides of the absolutely placed two-column ribbon (`styles.css:1632-1661`, `.is-view-*` vs `is-inbox/is-lists/is-done` of equal specificity, `showPlace()` still toggling ribbon classes in every mode, `CalendarScreen.ts:1755`). Hidden columns stay in layout, transitions and transforms.
2. Swipe doesn't know modes: `trackTo` returns `EdgeTrack` when `!ribbon` (`:749`); `Swipe.wheel` takes any `|dx|>|dy|` and `preventDefault`s (`Swipe.ts:113`) → defect 1.
3. Row heights from a one-off `scrollHeight` read right after render, while removal ghosts and FLIP transforms are live, and `scrollHeight` never reads below the current height (`FunnelRows.ts:65-81`); re-fit only on render/stack resize/drag → defect 4. On drag start `is-dragging ::after` adds a card's room in every row and `fit()` reflows (`styles.css:1651`, `CalendarScreen.ts:293`) → defect 5, and moves drop targets after the drag captured them.
4. `draw()` re-renders all eight lists with `moving = drawnRead` on every read incl. a filter change (`:1761-1779`) → FLIP from the previous project's positions; rows refit after FLIP «before» rects were taken → defect 3.
5. Row lists keep the column scroll mask but drop the column end room (`styles.css:1649, 970`) → defect 2.
6. `CalendarScreen.ts` 1814 lines, 88 private methods, 32 mode checks; every mode's DOM, drops, list lookup, divider math, classes switched inside it.
7. All-columns width math in the UI (`obsidian/ui/listWidth.ts`) — now in the core.
Predicted: quick entry at a full row's end opens clipped; a dropped card flies to a pre-shrink target then jumps; filter change within 220 ms of a delete measures ghosts; vertical scroll with sideways drift shakes All columns; a Done find in Rows/All moves the day header sideways (`styles.css:923`); entering Rows animates every card in and FLIPs hidden lists (double DOM work); phone edge strip includes `.tc-rows` so the day header tears from the timeline; note block in Rows left too tall after a drop.
Proposed: one `ModeLayout` (`mount`, `render(model, motion)`, `drops`, `listOf`, `swipeTrack|null`, `destroy`) — `RibbonLayout` (unchanged), `ColumnsLayout`, `RowsLayout`, `ByProjectLayout`; one at a time; own CSS per layout (flex/grid); Swipe only with a track; drag targets from the layout; render `motion: move|replace`; measure after motion settles (ResizeObserver per list content), heights frozen during a carry; drop room only in the hovered list.

## App — structural causes
1. Every view change (panel, pick, mode, edge hold) is `reload()` — a full file read and repaint (`BoardModel.swift:323, 425`); `BoardSnapshot.motion(from:)` compares only lists/timeline so a filter/mode change runs inside one `withAnimation(.snappy)` with the mode switch, title insert, panel close and row diffs (`:477`, `BoardScreen.swift:126`).
2. `ListController.update` animates any id change (`ListCollection.swift:338`): another filter's cards unfold in.
3. Rows heights a feedback loop: `ListHostView` reports `contentSize` (KVO + layout) into `BoardModel.listRows` keyed by column only; `StackedLists` calls the core synchronously in `body` and springs (`FunnelViews.swift:133-144`). A 160 pt `trailingRoom` stays in a list that fits; `typing` adds a card's room to all four lists.
4. Stacked scroll rules in two places (`holdStacked` vs `scrollViewDidScroll`).
5. Mode decided by string compares across files; no exhaustive per-mode switch.
6. `BoardModel` 2177 lines; the carry session is ivars + a DispatchWorkItem + chained Tasks, untested; divider and `@AppStorage("listShare")` copied.
7. Leaving Columns destroys `Ribbon` (its `@State` rebuilt, `scrollTo` inside the animated transaction on return).
8. By project reads twice unordered (`.task(id:)` and `viewCall`), drawn inside `withAnimation`; `setFunnelPlace` fired unordered from `Task.detached`.
Predicted: plus carried in Rows → stack jumps; card carried over Rows → oscillation; divider drag in Rows → heights spring and lag; Columns↔Rows → two collections write the same `listRows` → flicker; long stacked list scrolls into 160 pt blank then snaps; typing at a lower list's end stays under the keyboard; quick picks in By project show the previous node's tasks; release on a panel row while it slides in hits the wrong row; dim eats taps if `dimCloses` is true while closed.
Proposed: `FunnelPresentation` (Core, tested) — enums + exhaustive switch + context key; motion keyed on context (`.context` draws still, lists apply without animating); view-only state local and optimistic, a filter change reads only the lists; `StackedRowsLayout: Layout` (height-for-width, cached, fixed during carry/typing, no trailing room when it fits); keep `Ribbon` mounted and hidden; `CarrySession` serial tested type with injected clock; `ProjectsBoard.read` serialized; split `BoardModel` into `FunnelState`, `CarrySession`, `ListMetrics`. RibbonPaging and RibbonColumns untouched.
