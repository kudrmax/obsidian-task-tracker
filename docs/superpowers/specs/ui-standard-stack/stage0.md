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

## Drop flicker

**What Max saw:** on release the dropped card vanished for a moment, flickered and appeared again «from scratch». The frame checks of the first rounds tracked positions only and treated «no visible copy» as normal, so they passed it.

**Reproduced** (`spike/checks/b14-flicker.mjs`, every frame from release to +900 ms: the card's mounted copies, the opacity of every ancestor, `visibility`, scale, the overlay, plus a CDP screencast): within a column 31 frames and Inbox→Soon 30 frames after release with neither the card nor the overlay visible (`stage0/flicker/vis-before-*.json`).

**Causes, verified one by one:**

1. **The overlay's card followed the store.** dnd-kit keeps the `DragOverlay`'s last children through its drop animation and hides the source card meanwhile (its default `sideEffects`). The overlay's child read the lifted id from the store, which the drop clears at once, so it rendered nothing: no overlay and a hidden card for the whole drop animation (~250 ms), then the card «appeared». Fix: the overlay's card gets its id as a prop (`<DragOverlay>{active ? <Lifted active={active} /> : null}</DragOverlay>`, dnd-kit's documented shape).
2. **Drops on the timeline flew back.** The overlay's drop animation runs to the source node, which for a list card is the list row, while the block appears on the grid: two cards, one flying back. Fix: no drop animation over the grid (`dropAnimation={null}`, documented), and the block is drawn at once where the core's `dropSpan` puts it, until the write's read arrives (`landed` in the store; the row leaves the list in the same commit).
3. **A card moved by a command left a ghost.** With Motion's shared `layoutId` the old and the new row crossfaded (opacity dipped to ~0.8 each); with crossfade off the exiting row faded out at the old place. Fix: `layoutCrossfade={false}` and the exit decided when the row leaves (AnimatePresence's `custom`): a task still on the screen has moved, its old row goes at once; only a task gone from the screen fades.

**After** (`stage0/flicker/vis-final-*.json`, main window and phone emulation): 0 faulty frames for a drop within a column, Inbox→Soon, onto the timeline and a move by command; the check now also fails on two visible copies apart and on a card faded or scaled once the overlay is gone.

## Timeline, second round

**What Max saw:** dragging a block teleports with a flicker, a highlight covers the whole calendar during a drag, zoom doesn't keep the time under the pointer, a card let go over 09:00 doesn't land at 09:00, a block dragged back to a list disappears or comes back, short blocks cut their title in half. The earlier checks compared two numbers from the spike's own pixel-to-minute math, so a wrong conversion agreed with itself, and they never zoomed or scrolled first.

**New checks, from what a user sees** (`spike/checks/`):

- `tl-record.mjs` + `tl-analyze.mjs`: screencasts of slow and fast block drags, a list card onto the grid and back off, a resize, ctrl+wheel zoom over 07:00, 12:00 and the top edge, and a trackpad pinch (`Input.synthesizePinchGesture`), sampled every frame: the overlay against the pointer one frame earlier, the selection, blocks that vanish, and the zoom anchor (the time under the pointer, in px at the current zoom). Contact sheets in `stage0/timeline/*-frames.jpg`; I looked at them before and after.
- `tl-oracle.mjs`: the user's truth, independent of the code under test. The pointer is put on a visible hour label's line («23:00», «1:00», «2:00») after zooming (1×, ~2×, ~3.2×, ~0.7×) and scrolling; after release the tasks file must have that time, the block's top must sit on that label's line within 1 px, and the card must be visible every frame. List cards and blocks.
- `tl-sequences.mjs`: Max-like sequences, three fast rounds: a block out onto the day list, a list card onto the grid and back off onto the list, a block let go outside any target, a list card onto the grid fast; each ends with the file and the screen compared.

**What the frames showed before, and the causes:**

| Seen | Cause | Fix (standard usage) |
|---|---|---|
| The whole calendar tinted during any drag over it | the spike's own `.is-over` style on the 24-hour grid | removed; a landing preview (dashed block at the core's `dropSpan` of the snapped minute) shows where it will land |
| The block moves in 14 px jumps, «teleports» | `createSnapModifier`-style snapping of the overlay to grid lines | the overlay follows the pointer every pixel; the snap is the landing's (preview, then the write) |
| A card let go over 23:00 lands at 22:45 (one step early), at every zoom | the overlay's top is the time, but the person aims with the pointer, which sits below the card's top by the grab offset; and the modifier that would align them was on `DragOverlay`, which moves only the picture, not the collision rect dnd-kit reports | a modifier on `DndContext` (`modifiers`, documented: it moves the collision rect too) puts the overlay's top at the pointer over the grid, built as dnd-kit's own `snapCenterToCursor` |
| A block let go above the timeline (outside) still lands, at some early hour | the droppable was the 24-hour grid, whose rect reaches far above and below the visible part | the droppable is the visible scroller; the minute is read from the grid's place at that moment (`data.minuteAt`) |
| A block dragged onto the day list lands in Soon, on the other place | `closestCorners` over a block's overlay as wide as the timeline picked cards of the offscreen place | collision is pointer-first: the grid, else the card under the pointer, else the nearest card of the column under the pointer, else nothing (dnd-kit's documented composition) |
| A block dragged back to a list «disappears, maybe comes back» | the spike never handled timeline→list; the drop was treated as a cancel | the drop writes through `TaskService.drop` from `timeline` with the list place, and the row stands there at once |
| Zoom: the time under the pointer drifts 51–1176 px | the hour height changed without the scroll position | pointer-anchored zoom: the minute under the pointer is fixed for the whole gesture (use-gesture's `memo`) and `scrollTop` is set in a layout effect, before the frame is painted |
| The block jumps back to its old place after a drop, then glides | Motion `layout` on the block animated the optimistic move | layout off for a block that was just let go |
| Short blocks cut the title in half | 14 px minimum height with 6 px padding and a 13 px line | one line, ellipsis, 18 px minimum |
| Resizing steps in 14 px | the held span was the snapped one | the edge follows the pointer; the snap is the release's |
| On the phone view drops landed elsewhere | the ribbon got scrolled sideways (`overflow: hidden` lets focus scroll it) and the host missed the phone layout's resize | `overflow: clip` (with `min-height: 0`) on the ribbon; the host follows its element with a `ResizeObserver` |

**After:**

| Check | Before | After |
|---|---|---|
| Oracle, 7 drops at 4 zooms, main window | the file one step early in all 7, block 9–15 px above the line | 7/7: file = the aimed hour, block top on the line (0.0 px), 0 invisible frames |
| Oracle, pop-out | — | 7/7 |
| Oracle, phone emulation | — | 7/7 |
| Sequences, 12 steps | 7/12 (block to the list landed in Soon; outside drops wrote a time) | 12/12 main window, 12/12 pop-out, 12/12 phone |
| Block drag, overlay vs pointer one frame earlier, on the grid | median 7.8–9 px, max 14.5 (snapping) | median 0.4–1 px, p95 0.8–1 px; one shift of the grab offset (≤ 13 px) when the card's top moves to the pointer as it enters the grid |
| Zoom anchor drift (ctrl+wheel at 07:00, 12:00, top edge; pinch) | 51–1176 px | 0.88, 0.30, 0.56, 0.55 px |
| Selection during drags | 0 | 0 |
| Drop visibility (within, Inbox→Soon, timeline, command), desktop and phone | 30–31 frames with nothing visible | 0 faulty frames |
| Resize | steps of 14 px | the edge follows the pointer (constant 3 px offset), 5 px settle to the line at release |

Blockers 1 and 4 re-run on this build: drags within a column and Inbox→Soon 0 reversals, 0 doubles, written to the aimed gap; a move by command glides; menu and editor pass. Performance on this build (`stage0/round3-final-perf.jsonl`, classic WhileDragging, 3 runs at 1×, 2 at 4×): first render 10.3, lift 27.8 (24.9–29.1), drag frame 3.9, drop 5.1, lift then crossing 29.4, frame crossing 15.8 (15.3–16.0), drop into Soon 4.7, command 11.6 ms at 1×; at 4× 36, 52.5, 7.2, 24.2, 49.2, 40.0, 19.7, 25.7. The lift stays the one step over 16 ms, as in the second round.

**Still open, not fixed here:** overlapping blocks are drawn on top of each other (the spike has no stacking; the core's `stackTasks` exists for it); a past time today rides the now line by the core's rule, so blocks generated earlier in the evening gather there, and a drop onto a past time glides to the now line after the write; the overlay of a block dragged over a list keeps the timeline's width; the one grab-offset shift as a card enters the grid.

## Round four: Max's trial and his recorded input

Max tried the build; the drag motion itself was right, six things were not. Checked in my own test Obsidian (port 9446, its window moved off screen so it never takes his input or focus) and against his real input, recorded as `spike/recordings/max-2026-11-17.json`. Evidence: `stage0/round4/`.

| Max's report | What the frames and the checks showed | Cause | Fix |
|---|---|---|---|
| A drop on a past time «teleports» | the block went to the now line, which the spike did not draw; on the past drops it jumped there in one frame | no now line; the block's Motion `layout` was off while it waited for its read, so the move to the now line was not animated | the red now line from the core's `DayService.openAt` (moves every 15 s); the block's layout keyed on its slot as read, so the optimistic landing does not animate and the read's move to the now line glides |
| Blocks flicker when put on the calendar | the overlay (a list card's look and width, at the pointer) became a full-width purple block in one frame | the overlay kept the list card's look over the grid | over the grid the overlay is drawn as the block: the timeline's column, its width, its height for the landing's span; a modifier on `DndContext` puts it in the block column |
| The release is long and shows two cards: one shrinks, another spawns | at the drop the overlay was drawn in Obsidian's 16 px text, the card in the screen's 13 px, so the card «shrank» into another; the drop animation took 250 ms | the overlay is portalled to `body`, outside the screen's styles; dnd-kit's default drop animation | the overlay carries the screen's type (`DragOverlay className`); the drop animation is 180 ms, `cubic-bezier(0.2, 0, 0, 1)`, translation only; the row keeps its `layoutId` through the drag |
| Ribbon swipes on his trackpad: slow, stall, sometimes no arrival, sometimes a jump | replaying his recording on the old build: the ribbon followed the momentum tail up to 1276 px away, changed place twice in six swipes and landed at the end of each tail (~1 s) | @use-gesture's wheel ends a gesture only when the deltas stop, so the momentum tail was part of it, and a swipe started inside the previous tail merged with it | see below |
| Past hours were never tested | — | — | the oracle now also drops on past hours (17:00–20:00 at 21:47) |
| His drags | — | — | replayed from the recording (below) |

**The ribbon on a real trackpad.** The DOM's wheel events carry no finger phase. `wheel-gestures` (Embla's library) was evaluated offline on his six swipes (`spike/checks/wg-offline.mjs`): it found the finger lift in one of them, ~850 ms late, and merged the two swipes that ran into each other; it fails his 120 Hz deltas (its momentum test needs a faster decay than macOS gives per merged pair). `lethargy` (`spike/checks/leth-offline.mjs`) marks his finger strokes and the tails apart, the change up to ~100 ms after the real lift, and sees each reversed swipe as a new stroke. The ribbon now runs on Lethargy (@use-gesture still delivers the events): a stroke draws the ribbon (bounded to one place), the first inertial delta (or 120 ms without deltas) is the lift, the core's `swipeLanding` decides from the stroke's distance and its speed over the last 50 ms, a critically damped spring lands it, and the tail moves nothing. A same-direction stroke within 250 ms of a decision is taken as that stroke's own (Lethargy marks one or two early deltas of a stroke inertial; no hand swipes twice the same way that fast). Vertical scrolls and pinches never touch the ribbon.

**Recorded input as a permanent check.** `spike/checks/replay-all.sh` replays every `spike/recordings/*.json` over CDP at its own timestamps and positions (wheel deltas, pointer moves and presses) and fails on: a swipe that does not step exactly one place its way, a sequence different from the recording's `.expect.json`, the ribbon leaving its place without a decision, a stall, and any drop whose card is not visible in every frame. His drags are anchored on this screen's nearest card or block (his screen held other tasks), keeping his path, speed and timing.

**Results:**

| Check | Before | After |
|---|---|---|
| His six trackpad swipes | 2 place changes, the ribbon up to 1276 px off its place, landing at the end of each tail | 6/6 one place each its way (`[-1, 1, -1, -1, -1, 1]` = expected), decided after 1–25 of the stroke's deltas (up to ~200 ms after it began; the finger phases last ~100–120 ms), settled 300–360 ms after the decision, 0 frames off place without a decision, 0 stalls; his vertical scrolls and pinch moved nothing |
| His drags (9 of 21 anchored inside the window) | — | 0 drop faults |
| Oracle, 7 future + 4 past drops at 4 zooms, desktop | past hours untested | 11/11: the file has the aimed time; future: the block's top on the hour line; past: first frame on the hour line where released, then a glide with no reversal to the now line (within 1 px) |
| Oracle, phone emulation | — | 11/11 |
| Sequences in and out of the timeline | — | 12/12 desktop, 12/12 phone |
| Drop handover, lists (within, Inbox→Soon, a cancel) | overlay 250 ms, larger type than the card | overlay gone at 196–205 ms, one size the whole way, the card at the overlay's last rect (dx = dy = dw = dh = 0) at full opacity in the frame the overlay goes, 0 faulty frames; desktop and phone |
| Drop onto the grid | list card's look → block | the overlay is the block (same x, width, height); the block appears at the snapped line in the frame the overlay goes |
| Blockers 1 and 4, timeline frames, zoom anchor | — | as in the second timeline round (0 reversals, drift ≤ 0.9 px) |

Performance on this build (`stage0/round4/perf.jsonl`, 3 runs at 1×, 2 at 4×), ms at 1× / 4×: first render 9.9 / 41.4, lift 25.1 / 71.9, drag frame 4.8 / 8.3, drop 4.9 / 27.1, lift then crossing 18.9 / 61.5, frame crossing columns 15.0 (14.1–18.4) / 54.8, drop into Soon 4.7 / 26.1, command 11.7 / 30.5.

**Still not achieved, plainly:**
- On a drop onto the grid the overlay follows the pointer and the block lands on the snapped line: a shift of up to half a grid step (7 px at 56 px an hour, 2–3 px zoomed in) in the frame of the drop. Removing it would need the overlay's drop animation aimed at the block, which dnd-kit aims at the dragged source (the list row); I did not write a custom drop animation.
- The swipe decision comes up to ~100 ms after the real finger lift (Lethargy's averaging window), not at it; estimated from the number of deltas each decision used, not measured against the trackpad.
- The lift still costs 25 ms at 1×.
- Overlapping blocks are not stacked; a block dragged over a list keeps the timeline's width.
- The pop-out was not re-checked this round: opening one would put a window on Max's screen.

## Round five: the ribbon as in the plugin, Embla against Lethargy

**The ribbon** is now the plugin's (`docs/plugin/screen.md`, «Лента колонок»): Inbox over Backlog, Soon, the day list, the timeline; two columns in the window; three places. At Inbox–Soon and Soon–Now the two columns split the window in half; at Now–calendar the divider sets the day list against the timeline; between Soon–Now and Now–calendar the day list's width follows the ribbon (from half the window to the divider's width), as `RibbonColumns` says. Screenshots: `stage0/round5/r5-*-p{0,1,2}.png`.

Two ribbons, switched by the commands «Ribbon: Embla» (default) and «Ribbon: Lethargy»:

- **A, Embla Carousel** 8.6 with `embla-carousel-wheel-gestures` 8.1, as their docs set one step per swipe: `align: "start"`, `containScroll: "trimSnaps"`, `skipSnaps: false`, `duration: 20`, the wheel plugin with `forceWheelAxis: "x"`; touch by Embla's own drag. Embla decides where a swipe lands (its release force); **the core's `swipeLanding` cannot be plugged in** (Embla has no hook for the landing; `watchDrag` only says whether a drag may start). A mouse drag is the cards', not the ribbon's (`watchDrag` refuses trusted mouse events and lets the plugin's synthetic ones through).
- **B, @use-gesture + Lethargy + `swipeLanding`**, as in round four, on the new places; its spring stiffened to settle in about 240 ms.

Measured by replaying Max's six recorded swipes (`spike/recordings/max-2026-11-17.json`) and two synthetic held drags at an even pace (`spike/recordings/synthetic-held-drags.json`: 401 px back, then 133 px on, the fingers stopping and lifting without a fling). The Electron input recording carries no deltas, so it cannot be replayed. Times are from the stroke's largest delta in its first 250 ms (the estimated lift of a flick) or from its last delta (the stop of a held drag) to the decision and to the ribbon standing on its place. Full output: `stage0/round5/round5-ribbon.txt`.

| | A: Embla + wheel-gestures | B: Lethargy + `swipeLanding` |
|---|---|---|
| Max's six swipes, places reached | 1 → 0 → 1, then nothing: **2 of the 5 place changes**; the swipe begun inside the previous one's tail and the later ones were swallowed | 1 → 0 → 1 → 0 → 1: **all 5** (the 6th is at the end of the row) |
| Flick: decision after the lift | 62–438 ms, and only for the two it saw | 93–270 ms (two decided 35–61 ms before my lift estimate) |
| Flick: ribbon on its place after the lift | **1.3–3.1 s** (it follows the whole momentum tail, then animates) | 95–441 ms |
| Settle animation after the decision | 1.25–2.65 s | 0–241 ms (the ribbon is often already there, having followed the stroke) |
| Held drag 401 px: decision / on its place after the stop | 157 / 162 ms | the decision came **658 ms before the stop**, while the fingers were still moving (Lethargy took an uneven slow drag for momentum); on its place 418 ms before the stop |
| Held drag 133 px (springs back) | back 893 ms after the stop | back 46 ms after the stop, but decided 295 ms before it |
| Tail moving the ribbon after it settled | 0 frames | 0 frames |
| Stalls | 0 | 0 |
| Phone emulation, touch: flick, flick, slow 20 %, slow 70 % back, flick back | 1, 2, 2, 1, 0 (one earlier run: 0 for the slow 70 %, two places at once) | 1, 2, 2, 1, 0 |
| Phone: vertical scroll in Inbox and Soon | scrolls 133–161 px, the ribbon stays | scrolls 161–172 px, the ribbon stays |
| Phone: long-press drag of a card | **crashed the screen** (React «maximum update depth»): Embla had taken the touch at the press and moved the ribbon under the sortable lists, dnd-kit re-sorted without end. Fixed: at the lift Embla is re-initialised with `watchDrag: false` and back after the drop; now the card lands in Soon, no error | lands in Soon, no error |

What the frames show (`stage0/round5/*-swipes-frames.jpg`): with Embla the ribbon creeps along with the momentum for a second or more and stops between places for many frames before it lands; with Lethargy it reaches each place in a few frames and stands still.

**Still not achieved, plainly:**
- Embla fails his trackpad: it waits for the momentum to end (the plugin's wheel-gestures library does not see his macOS momentum start, as found in round four) and misses a swipe that starts in the previous one's tail. Its held-drag release (157 ms after the stop) is the one thing it does well.
- Lethargy settles flicks quickly but decides a slow, uneven held drag while the fingers are still moving; the ribbon then stops following them.
- Neither tells the finger lift at the moment it happens: on the Mac no API gives it (the coordinator's Electron measurement), so both infer it from the deltas.
- A drag whose view is torn down mid-way (the crash above) left the store's lifted id set, which blocked every later swipe until it was cleared; the real build must clear it when the screen unmounts.

## Must a library be swapped?

Updated by the second round: no swap is recommended; the classic line, virtualized as above, is the configuration to build on, and the lift is the one step over 16 ms. The first-round answer follows.

Not for correctness: React, Zustand, Motion, @use-gesture, Floating UI and classic dnd-kit do everything in 1, 2, 4–11 with standard usage. The one failure is the 16 ms budget (3): classic dnd-kit's drag start and drop with ~240 mounted cards cost 50–60 ms and 16–24 ms on the Mac, 3× more at 4× throttling. @dnd-kit/react is 2–3× cheaper but jumps and is pre-1.0; mounting fewer cards helps the drop but not the drag start. Deciding it is the lead's: keep classic dnd-kit and accept a long task at the start of a drag and on drops (the budget then holds for frames, taps and typing), or spend a further spike on @dnd-kit/react's integration with Motion and on TanStack Virtual.
