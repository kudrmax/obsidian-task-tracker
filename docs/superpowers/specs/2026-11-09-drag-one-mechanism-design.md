# Drag: one mechanism (iPhone)

## Why

Max, 2026-11-09, three screen recordings of the iPhone app: the app crashes after a drop; a carried card over the list
shows no purple line; after a drop the list jumps, a section header pops, a dashed place lingers under the dropped card;
paging days while carrying behaves oddly; bugs fixed before come back. «Перетаскивание — суперстандартная операция…
найти корень, а не залатать».

Since 2026-11-01 about 200 commits touched the iPhone drag and its motion. Each fixed one ordering of events and broke
another. This spec replaces the patched pieces with one mechanism, the industry's standard one.

## Found before this spec (lead)

- **The crash** (`FoldAway.body` trapping on SwiftUI's `AsyncRenderer` thread, 5 reports pulled from the phone) is the
  build on the phone, installed at 10:04, ten minutes before the fix (`nonisolated` body, 65531141) was merged. Checked
  in the machine code of both Release builds: the isolation check sits in `FoldAway`'s witness in the old one and is gone
  from master. Master is now on the phone. The recordings were made on that old build.
- **The purple line is drawn under the carried copy.** The line marks the gap nearest the copy's middle, so it always
  lies within half a card of the copy, and the copy, drawn above it, hides all of it but a few points at the left
  (simulator, master: `rec/holds.png`). On the phone this reads as «no marker».
- **«Nowhere» exists by construction**: `BoardDrop.place(at:)` answers the first registered rect containing the finger,
  or nil, and nil cancels the proposal. Uncovered: the 4 pt between a column's title and its list, the band above the
  titles, the gap between Inbox and Backlog, the timeline's all-day strip, the divider.

## Root causes (review of `apple/App/Board`, `apple/Core/Sources/Core/Motion.swift`)

- **D1. Hit-testing reads a hand-kept cache of row frames.** Rows report frames through `onGeometryChange` into
  `BoardModel.geometry`; `rest(...)` drops every report while `settling` is set, a missing frame reads as `.zero`
  (`shape.cards[id] ?? .zero`), a turned day has no frames until SwiftUI reports them. `afterLeaving` patches the lag by
  hand. The target is recomputed only when the finger moves, not when the layout under a still finger changes.
- **D2. The target can be nil over a column** (above), and inside a list the line is deliberately absent in two cases
  (`stays`, `lights`) with nothing else marking the target.
- **D3. The screen after a drop is guessed in pieces, then replaced.** At let-go Swift builds its own picture (home row
  folding via `leaves`, a `GapSpace` room, offsets); section headers coming or going, the empty plate and branches are not
  in it. When the read arrives the whole list animates to the real picture: headers pop, rows jump, the plate folds
  away under the card.
- **D4. Carry state is ~20 flags in four owners** (`BoardModel`: `carry`, `released`, `gap`, `settling`, `landing`,
  `sectionSlot`, `litTitle`, `hovered`, `placedByDrop`, `arrival`, `touchdown`, `landsInFold`, `dropReads`; `BoardDrop`:
  `current`, `flights`…; `CardControl`: `token`, `left`, `lifting`, `home`, `flyingHome`, `endAfterFlight`…;
  `CarryLife`/`CarryEnd`), and a carry ends on 3–4 asynchronous signals in any order. This is the regression engine.
- **D5. A day turn swaps the data under a live carry**: `landTurn` replaces the snapshot and frames, `DropSpace` is
  re-keyed by `.id(day)` while a copy may fly inside it.

## What Max sees when it is done

1. Wherever the finger is while carrying a task, exactly one target is shown: a purple line in a list (between, before,
   after cards, or indented as a subtask), a lit column title, or the time line on the calendar. The target snaps to the
   nearest valid place; there is no position over the board with nothing shown. Over the bars (the top buttons, the tab
   bar) the target is the nearest place of the column under the finger, never nothing.
2. The purple line is always visible: drawn above the carried card, from its level's left edge across the column.
3. A task carried back over its own place shows the line at its dashed place, not nothing.
4. On let-go the rows open the room where the task will be, sections and headers appear or disappear at that same
   moment in the same animation, and the copy flies into the room. When the file is written nothing else moves.
5. Paging days while carrying: the target follows the day now shown, the copy stays under the finger, a drop lands in the
   day it was dropped on.
6. No crash, no frozen card, a task can be picked up again the moment the previous one landed.
7. Everything above in light and dark.

## The mechanism

### Core (backend): the screen after a drop, before the write

`tasks.landing` already tries the drop over the file and reads the screen of `day` over the result. Add the screen it
reads: `tasks.dropPreview(tasks, to, day, project?)` → `{ landings: DropLanding[], screen: ScreenView, tasks: string }`
— the same operation and read as `tasks.landing`, answering also the whole next screen and the text it was read from,
writing nothing. The screen is exactly what the next read after `tasks.drop` with the same arguments draws (ids
included), checked by a test for every drop case of `drops.test.ts`. Documented in `docs/door.md`. `tasks.landing` stays.

### iPhone (frontend-swift)

- **One owner, one state machine.** A `CarryController` (or one type of that role) owns a carry from lift to rest:
  `idle → lifted → over(target) → dropped(preview) → idle`. It owns the token, the target and the preview. UIKit's drag
  and drop callbacks, the card's long press, the plus and the calendar press only feed it events; it emits the one
  outcome. `settling`, `leaves`, `afterLeaving`, `released`, `placedByDrop`, `hovered`, `CarryLife`/`CarryEnd`'s
  refereeing and the flags in `CardControl` that duplicate it go away. The end of a carry is one event: the copy landed.
- **One resolver, never nil.** `TargetResolver.resolve(point) -> Target` (a pure type, unit-tested): the board's columns
  tile its width (the divider splits between its neighbours, the title and the list of a column are one place with two
  zones), so every point over the board belongs to one column; inside a list it picks the nearest slot (the core's
  `placeAt`, as now); over a column's title the title; over the calendar the snapped minute. Points above or below a
  column clamp to its first or last slot. The plus uses the same resolver.
- **Live geometry.** The resolver reads row frames from the layout as it stands at the moment it is asked (one
  `onGeometryChange` per list producing the whole array, or the views' own frames), never a cache that ignores updates;
  it is asked on every move and again whenever the layout or the snapshot changes under a still finger (scroll, day turn,
  redraw).
- **Drawn once at let-go.** At the drop the controller asks `tasks.dropPreview`, builds the next `BoardSnapshot` from its
  screen and draws it at once, one animation: the room opens, headers and plates come and go, the copy flies to the
  task's frame in that drawing. The real read after `tasks.drop` then draws with motion `still` when it equals the
  preview (the normal case), `change` when the file changed meanwhile.
- **Day turns while carrying** re-resolve the target against the new day; no view that may hold the copy is keyed by
  `.id(day)`.
- **The line above the copy** (z-order), and a line at the dashed place when the target is the home place.
- **FoldAway and any transition stay free of main-actor code**: no closure handed to a SwiftUI builder inside a
  `Transition` or `ViewModifier` body that SwiftUI may run on its async renderer.

### Out of scope

The Obsidian plugin's drag (Max reported the iPhone); `tasks.dropPreview` is there for it when it needs it. No change to
what a drop writes.

## Checks

- Unit: `TargetResolver` over synthetic frames (every point of a board grid resolves; the gaps listed above; empty
  section; subtask indent; home place), the controller's transitions (every order of drop-session end, copy landed,
  read drawn ends the carry once).
- Core: `dropPreview` equals the next read for every drop case.
- Simulator (lead, frontend-swift): a DEBUG-only log of the resolved target, a sweep over the whole board while carrying
  (no nil), a drop reordering a section, a drop emptying a section and filling another (header appears/disappears in the
  same animation), a drop into a subtask, a drop on a title, a drop on the calendar, a carry across a day turn, a drop
  immediately followed by a new lift, all with screenshots; light and dark.

## Decisions

1. **Lead: the line is drawn above the carried copy**, as Notion's and Linear's drop indicators: the copy hides it
   otherwise, and the design's «no row moves while the finger does» stays.
2. **Lead: the home place shows the line too**, at the dashed place, so the target is never «nothing».
