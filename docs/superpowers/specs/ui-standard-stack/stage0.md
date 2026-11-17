# Stage 0: the standard stack checked in our environment

The spike behind [`2026-11-16-ui-standard-stack.md`](../2026-11-16-ui-standard-stack.md): a throwaway screen on the fixed stack, run in a test Obsidian (1.15.1) before any feature is built. Checked on 2026-11-17.

## What was run

- **Code:** `spike/` on branch `ui-stack-spike`, its own esbuild entry (`spike/build.mjs`), a separate plugin `task-calendar-spike`. It never touches the real `main.js`. The checks that produced every number below are in `spike/checks/` (CDP over port 9445, `suite.sh` runs the drag, timeline, menu and editor checks on one window).
- **Data:** a generated tasks file of 302 tasks in the format of `docs/plugin/file.md` (Inbox 70, Now 46 with sections and subtasks, 10 slotted later today, Soon 70 with dates and a section, Backlog 80, Done 30). Read and written through the real `TaskService`, composed by `obsidian/compose.ts` (`createServices`). The screen mounts 239 list cards and 10 timeline blocks.
- **Screen:** a Zustand store per screen over `TaskService`, a ribbon of three places (Inbox | Backlog | Soon columns; day list, divider, timeline; an empty third place), one Floating UI menu, Obsidian's editor (`obsidian/ui/markdown/EmbeddedEditor.ts`) in one component.
- **Versions:** react 19.3.1, zustand 5.1.0, motion 14.14.0, @dnd-kit/core 6.3.1, @dnd-kit/sortable 10.0.0, @dnd-kit/modifiers 9.0.0, @use-gesture/react 10.3.1, @floating-ui/react 0.27.20; for the comparison @dnd-kit/react 0.5.3.
- **Where:** a test Obsidian with its own profile and scratch vault, driven over CDP in the background: desktop window 1280×820 and a pop-out 1100×760, phone view 390×844 with `app.emulateMobile(true)` and CDP touch input; light and dark. iOS: Mobile Safari in the iPhone 16 Pro simulator (iOS 26.3), a standalone page of the same drag list.
- **Measuring:** frame samplers in the page record every card's box and opacity on each `requestAnimationFrame` (a "jump" is a card going back the way it came, a "double" is two visible copies of one card); long tasks come from CDP traces (`RunTask` on the renderer's main thread); `Emulation.setCPUThrottlingRate` 4 stands in for the phone.

## Results

| # | Blocker | Result | Evidence | Numbers |
|---|---|---|---|---|
| 1 | Card animation + drag together | **PASS** (classic dnd-kit) | Frame samples `stage0/main-b1-*.json`, `stage0/popout-b1-*.json`; file lines after each drop | Within a column: siblings glide 33 px in ~18 frames, 0 reversals, 0 doubles; the overlay flies to the slot, the card shows there in the same frame the overlay goes. Inbox→Soon: target siblings glide, 0 doubles at the drop, written to the gap aimed at. A move by command (no drag): the card glides across (x 56→876 over ~40 frames), siblings in both columns glide, 0 reversals. |
| 2 | Selective re-render | **PASS** | Render counters in `spike/Screen.tsx` (`b2-rerender.mjs`) | Priority of one task changed: 1 render of that card's face, 0 of any other card, column or block. Longest task 5.1 ms (1×), 11.0 ms (4×). |
| 3 | Performance, ~240 cards, 4× CPU | **FAIL** in the first round; after the second round only the lift misses (see «Performance, second round») | CDP traces (`b3-perf.mjs`, `b3-alt.mjs`), CPU profiles (`prof-dragstart.mjs`) | See «Performance» below: drag start 50–60 ms at 1×, 113–163 ms at 4×; drop 16–24 ms at 1×, 71–112 ms at 4×; first render 31 ms at 1×, 113 ms at 4×. Drag frames stay under 16 ms except where a card crosses columns. |
| 4 | Timeline: snap, resize, pinch | **PASS** | `b4-drop.mjs`, `b4-resize.mjs`, `b4-pinch.mjs`; `stage0/popout-b4-pinched.png`, `stage0/phone-timeline-pinched.png` | Block moved: overlay top at release 507.09 px, block after the write 507.09 px. List card to the grid: 450.99 → 451.09 px, written `📌 21:30`. Resize by the handle +56 px: 20:55-21:25 → 20:55-22:30, height held 88.7 px = height after the write. Pinch: ctrl+wheel (trackpad) 56 → 145 px an hour; two-finger touch 56 → 182. |
| 5 | Ribbon swipe, one place | **PASS** desktop (trackpad) and phone (touch) | `b5-gesture.mjs`, `b5-path.mjs`, `b10-phone.mjs` | From the first swipe after a reload: 15 % flick → 1 place, again → 2, back → 1; slow 30 % → stays; slow 60 % → next; 150 % fast flick → exactly 1 place. Furthest the ribbon goes during a gesture: 1.07 places. Touch: same results. |
| 6 | Divider drag | **PASS** | `b6-divider.mjs`, `b10-pinch.mjs`; `stage0/b6-divider.png` | Width follows the pointer every frame (220→419 in 10 px steps), stops at its bound (1116 px), touch drag −40 px → −39 px. |
| 7 | Menu on Floating UI | **PASS** | `b7-menu.mjs`; `stage0/main-b7-menu-open.png`, `stage0/popout-b7-menu-open.png` | Opens on click, closes on Escape, on an outside click and after an item; the item runs (first Inbox task to Soon). Floating element in the view's own document. |
| 8 | Obsidian's editor in a component | **PASS** | `b8-editor.mjs`; `stage0/main-b8-editor-suggest.png` | Typed «Купить молоко [[»: text arrives (key events and IME-style insertText), `[[` opens Obsidian's note search, 20 parent re-renders while typing, editor mounted once. |
| 9 | Pop-out window | **PASS** | `TARGET=popout suite.sh`; `stage0/popout-*.png`, `stage0/popout-b1-*.json` | Every check of 1, 4, 5, 6, 7, 8 run again in a fresh pop-out with the same results (numbers above within 1 px). |
| 10 | Phone: Obsidian mobile emulation | **PASS** | `b10-phone.mjs`, `b10-pinch.mjs`; `stage0/phone-*.png` | Long press: no drag at 150 ms, drag at 400 ms (delay 250 ms, tolerance 5 px), lands in Soon at the aimed index. A quick move before the delay: no drag. A vertical swipe scrolls the column 700 px, no drag, no ribbon move. Ribbon swipes as in 5. |
| 11 | iOS WebKit long-press drag | **PASS** (Mobile Safari, not Obsidian's WKWebView) | Simulator screenshots `stage0/ios-*.png` | Long press 600 ms then drag: drag starts, task-2 dropped on task-7, list scrollTop 0, page scrollY 0, selection empty, no `contextmenu`. Held 1.5 s mid-list: drag starts, no callout, no selection, no scroll. A normal swipe scrolls the list to 444 px, no drag. |
| 12 | Bundle and load time | **PASS** (measured; no budget was set) | `size.mjs`, `b12-load.mjs` | Spike `main.js` 688 KB minified, 224 KB gzip, of it react-dom 205 KB, motion 145 KB, core 168 KB, @dnd-kit 47 KB, @use-gesture 28 KB, floating-ui 37 KB. (The real `main.js` is 2.59 MB with the agent SDK.) `enablePlugin` 16–23 ms, `onload` 0.2–0.4 ms, first read 1 ms, opening the view with 249 cards 42–48 ms. |

## Performance

CDP traces, the longest main-thread task of each step (ms). Classic = `@dnd-kit/core` + `sortable` as the spec fixes it; 239 cards mounted.

| Step | 1× | 4× | Over 16 ms because |
|---|---|---|---|
| First render of the view | 31 | 113 | React mounts 249 cards with `useSortable` + Motion each |
| Drag start, within a column | 55–60 | 136–163 | Every `useSortable` card re-renders on `DndContext`'s change (~30 ms), droppables are measured with their scroll ancestors (~12 ms) |
| Drag frame within a column | ≤ 13.8 | ≤ 29 | 4 of 708 frames over 16 at 4× |
| Drag frame crossing into another column | 37 | 91–119 | two columns re-render to move the placeholder |
| Drop | 16–24 | 71–112 | the drop's commit re-renders the two columns so Motion can measure them |
| A write by command (one task to another column) | 23–28 | 71 | both columns re-render so every card that moves can glide |
| One task's priority changed | 5.1 | 11.0 | — (blocker 2) |

What was tried, by the libraries' own documented means:

- **@dnd-kit/react 0.5.3** (the new dnd-kit line, `DragDropProvider`, `useSortable` with `group`, `move()` in `onDragOver`), the same three columns (203 cards): drag start 21–29 ms (1×), 43–63 ms (4×); drop 6.5–8 ms (1×), 19–20 ms (4×); frames under 16 except 3 of 2678. About 2–3× cheaper than classic, but its drag start is still over budget (its own per-droppable observers and signals, profile in `prof-dragstart.mjs`), and in this integration it **jumps**: siblings show at the new place for one frame, back, then glide (35 px reversals in `stage0/alt-b1-*.json`), and the dragged card jumps 36 px at the drop. It is also pre-1.0.
- **Fewer mounted cards** (what TanStack Virtual would keep: 25 per column), measured as a proxy, not as a virtualized list: classic drag start 32–36 ms (1×), 67–72 ms (4×), drop 9–13 ms (1×), 38–53 ms (4×); @dnd-kit/react drag start 18–26 ms (1×), 27–42 ms (4×), drop 5 ms (1×), 12–33 ms (4×). Drag start keeps a fixed cost that mounting fewer cards does not remove.

Nothing here was worked around: no hand-written drag, animation or measuring.

## Integration findings (standard usage, needed for a PASS above)

These are how the libraries are documented to be used; the real build must do the same.

1. **`DragOverlay` goes in a portal to the view's own `document.body`.** Inside Obsidian's view the overlay was drawn 40 px below the pointer (an ancestor makes `position: fixed` relative to it), and dnd-kit measures the overlay for collisions, so the first drag in a fresh pop-out dropped into the wrong column. The portal fixed both. (dnd-kit's docs recommend the portal for this case.)
2. **The dragged card has Motion's layout off** (`layout={!isDragging}`, no `layoutId`, no exit animation while dragging); without it the placeholder showed two or three copies crossfading between columns during a drag.
3. **Motion layout runs on reads, not on the drag's own reorder** (`layoutDependency` = the column's order as read from the file). On the drop commit dnd-kit's transforms and Motion's layout would otherwise move the same cards twice.
4. **`SortableContext items` must keep its identity between renders** (no `[...ids]`), or dnd-kit turns its sorting transition off and siblings jump instead of gliding.
5. **Collision: pointer-first on the time grid, closest corners for the lists** (dnd-kit's documented composition). `closestCorners` alone never chose the 24-hour grid.
6. **Snap to the grid with a dnd-kit `Modifier` over the droppable's rect**, not `createSnapModifier`: the latter snaps the drag's delta, so a card from a list landed between grid lines (12 px off the line the core then wrote).
7. **Timeline minutes are the core's**: `TaskService.shownSpan` / `dropSpan` count from the day's start (`dayStartHour`), and a past start today rides the now line. Drawing slots by clock minutes put drops five hours off.
8. **Touches stay the screen's.** On the phone Obsidian opens its side drawer on a sideways swipe; the screen's root stops `touchstart/move/end` from reaching Obsidian, as today's `CalendarScreen` does.
9. **`touch-action: pan-y` on every vertical scroller inside the ribbon.** `touch-action` only intersects up to the nearest scroll container, so cards inside a column allowed a native sideways pan, which cancelled the ribbon's pointer stream.
10. **The ribbon's gesture is bounded with @use-gesture's own `bounds` + `rubberband`** to one place either way of where it began; without it a long trackpad flick showed 1.5 places before springing back to one.
11. **@use-gesture's `window` option and Floating UI's `FloatingPortal root`** are given the view's own window and element, so a pop-out uses its own document.
12. **CSS scroll-snap as the ribbon (the spec's «Phone vs desktop» row) was tried and is worse**: with `scroll-snap-stop: always` trackpad flicks of 15 % did not move it at all, and it cannot use `rules.swipeLanding`. @use-gesture with the core's landing behaves as the core says.

## Not checked

- **Obsidian on a real iPhone** (WKWebView inside Obsidian's app). The iOS check ran in Mobile Safari on the simulator; Obsidian's own WebView settings (and its drawer gestures) were only emulated on the desktop.
- **A real virtualized list** (TanStack Virtual with sortable and Motion): only the mounted-card proxy above.
- **Keyboard sorting** and **auto-scroll while dragging across a long list**: auto-scroll was seen working (the timeline scrolled under a block held near its edge), not measured.
- **Real trackpad momentum**: the desktop swipes used `Input.synthesizeScrollGesture` (phased wheel events with fling); plain synthetic wheel events without phases do not move a scroll-snap ribbon and gave no flick speed to @use-gesture.

## Performance, second round

The same 302 tasks, the same steps, each run with a freshly generated file. The longest main-thread task of each step (CDP trace), medians of the runs, the range after it; 1× is the Mac, 4× its CPU throttled. Runs: `stage0/round2-runs.jsonl` (`spike/checks/b13-round2.mjs`, `round2-runs.sh`).

What changed, all documented practice:

- **Thin sortable wrapper around a memoized row.** A `Row` (`React.memo`, Motion's element) holds a `SortableCard` (`useSortable` and its transform only) around the memoized face. The column builds its rows and hands them as `children` to the parts that follow the drag (`DropArea` with `useDroppable`, `SortableContext`), so a drag re-renders those and the thin wrappers, never the rows. The overlay's card and «is this row lifted» come from the store (`dragging`), so the lift re-renders one row. The pages are memoized, `items` keep their identity.
- **TanStack Virtual** (3.14.26) per column, the documented fixed-size list (33 px rows, overscan 3), all ids in the `SortableContext`, the mounted rows rendered inside one translated block, Motion's layout on the mounted rows only. 92 rows mounted instead of 249 cards. A row scrolled into view does not animate in; a task new in the last read does (the store keeps the ids it added).
- **Motion:** `layout="position"`, `layoutDependency` = the column's order as read, layout and `layoutId` off for the lifted row.
- **Measuring:** dnd-kit's default `WhileDragging`, `BeforeDragging` and `Always` compared.

| Step | Classic, WhileDragging 1× (9 runs) | 4× (6) | Classic, BeforeDragging 1× (3) | 4× (2) | @dnd-kit/react 1× (3) | 4× (2) |
|---|---|---|---|---|---|---|
| First render | 10.4 (9.0–17.6) | 37.2 | 11.0 | 37.0 | 18.8 (16.1–19.4) | 35.7 |
| Lift, within a column | **28.5** (19.6–32.9) | 59.8 | **16.8** (16.4–20.9) | 37.9 | **17.7** (16.5–18.9) | 28.4 |
| Drag frame, within | 4.2 | 8.0 | 4.6 | 11.0 | 8.0 | 9.4 |
| Drop, within | 5.4 | 25.0 | 9.7 | 42.5 | 5.8 | 7.6 |
| Lift, then crossing into Soon | **23.3** (18.6–28.8) | 53.2 | **22.1** (19.8–23.3) | 43.5 | 14.9 (12.3–16.8) | 30.8 |
| Frame crossing columns | **16.0** (11.8–18.8) | 51.6 | **17.8** (14.0–18.9) | 54.5 | 12.2 (11.1–12.2) | 22.0 |
| Drop into Soon | 4.6 | 23.5 | 8.4 | 42.5 | 5.9 | 12.9 |
| A move by command | 7.6 | 23.7 | 11.7 | 33.8 | 5.0 | 14.9 |

Bold: over 16 ms at 1×. `Always` (3 runs before the final overscan): lift 29.6, drop 10.8, command 10.3 at 1×, no better than the default.

What renders at the lift (classic, counters in `spike/Screen.tsx`): 1 row, 1 face, 0 columns, 12 drop areas, 371 thin wrappers (92 mounted wrappers × 4 commits dnd-kit makes as it activates, measures and finds the first «over»). At the drop: 47 rows (the mounted rows of the two columns, so Motion can measure them), 253 wrappers, 4 columns.

Where the lift's time goes (CPU profile, `prof-dragstart.mjs`, unminified build): classic, about 6 ms in dnd-kit measuring every droppable with its scroll ancestors (`Rect` → `getScrollableAncestors`, not configurable), about 10 ms in the wrappers' four renders, about 3 ms in collision detection; @dnd-kit/react, the sensor's activation and one `PositionObserver`/`FrameObserver` per droppable (about 4 ms), its signals (about 5 ms), forced layout reads (`getBoundingClientRect`, `getComputedStyle`), and React about 2 ms. Mounting fewer cards did not remove it: with only the shown place mounted (69 rows) the classic lift was 13.5–25.8 ms.

**@dnd-kit/react 0.5.3, wired by its guide** (`DragDropProvider`, `useSortable` with `index`/`group`, `move()` in `onDragOver`, each column a `useDroppable` with `CollisionPriority.Low`, virtualized the same way). The jump of the first round was Motion's `layoutId` on rows dnd-kit moves: with Motion removed the rows sort smoothly; with `layoutId` (even with layout off during the drag, which re-rendered all 76 rows at the lift) siblings jumped 35 px for one frame. With Motion's `layout` kept and no `layoutId` the within-column drag is smooth (`spike/AltScreen.tsx`, `altQuiet`) and the lift re-renders one row; the numbers above are that wiring. Two things remain: a **drag across columns still jumps** (siblings show at the new place for a frame, go back, then glide, 35 px, with or without Motion), and without `layoutId` a card moved to another column by a command fades out and in instead of gliding.

**Blockers 1 and 4 with the final classic configuration** (virtualized, wrappers, WhileDragging), main window and a fresh pop-out (`stage0/final-*.json`, `stage0/final-popout-*.json`): within a column 0 reversals, 0 doubles; Inbox→Soon lands at the aimed gap, 0 reversals; a move by command glides in both columns; timeline move overlay 493.09 px → block 493.09 px; list card to the grid 408.99 → 409.09 px; resize held 88.7 px = after. Menu and editor pass as before. The phone emulation was not re-run on this configuration.

### What still misses, and why

Only **the lift**: the one long task when a card is picked up. At 1× it is 16.4–20.9 ms with classic `BeforeDragging`, 19.6–32.9 ms with classic `WhileDragging`, 16.5–18.9 ms with @dnd-kit/react; at 4× 28–60 ms. It is each library's own activation (measuring every drop target, re-rendering every sortable in classic; creating an observer per drop target in the new line), which no documented option turns off, and it does not shrink with fewer mounted cards. Classic's frame crossing columns (median 16–18 ms, the two columns re-render and dnd-kit measures again) is the other step at the edge. Every other step is under 16 ms at 1× in every configuration; at 4× the drops and commands of classic `WhileDragging` are 23–25 ms, the new line's 8–15 ms.

### Recommended configuration

Classic dnd-kit (`@dnd-kit/core` + `sortable`), `MeasuringStrategy.WhileDragging` (the default; `BeforeDragging` brings the lift within a column down to 16.4–20.9 ms but nearly doubles drops and commands at 4×, 42 ms against 25), TanStack Virtual per column with all ids in the `SortableContext`, thin `useSortable` wrappers inside memoized Motion rows, the lifted id and the overlay's card from the store, `DragOverlay` in a portal, Motion `layout="position"` with `layoutDependency` = the order as read and `layoutId` off for the lifted row. It passes blockers 1 and 4 without a jump, including drags across columns and moves by command, and everything but the lift (and, at its edge, the frame crossing columns) is under 16 ms on the Mac. @dnd-kit/react is faster at the lift and across columns but still over 16 ms at the lift and jumps across columns, and it is pre-1.0. Meeting 16 ms at the lift would need a drag library whose activation does not touch every drop target, which neither dnd-kit line offers.

## Must a library be swapped?

Updated by the second round: no swap is recommended; the classic line, virtualized as above, is the configuration to build on, and the lift is the one step over 16 ms. The first-round answer follows.

Not for correctness: React, Zustand, Motion, @use-gesture, Floating UI and classic dnd-kit do everything in 1, 2, 4–11 with standard usage. The one failure is the 16 ms budget (3): classic dnd-kit's drag start and drop with ~240 mounted cards cost 50–60 ms and 16–24 ms on the Mac, 3× more at 4× throttling. @dnd-kit/react is 2–3× cheaper but jumps and is pre-1.0; mounting fewer cards helps the drop but not the drag start. Deciding it is the lead's: keep classic dnd-kit and accept a long task at the start of a drag and on drops (the budget then holds for frames, taps and typing), or spend a further spike on @dnd-kit/react's integration with Motion and on TanStack Virtual.
