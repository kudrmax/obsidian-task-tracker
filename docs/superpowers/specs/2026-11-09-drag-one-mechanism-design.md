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

### iPhone (frontend-swift): the stock iOS mechanism

Max, 2026-11-09: «хочу, чтобы это просто красиво, стандартно работало… в других приложениях нет проблем». The app
re-implemented the plugin's web drag (its own line, its own hit-testing, its own landing animation, a SwiftUI `VStack` of
UIKit cells measured by hand) on top of iOS, and every iOS detail it fought (async rendering, view identity, gesture
arbitration) came back as a bug. Reminders, Things and Todoist on iOS use the system's own list drag. So does this app:

- **Each list column is a `UICollectionView`** (compositional list layout, a diffable data source keyed by the core's
  `TaskItem.id` and the section's id), its cells the existing card views (`UIHostingConfiguration` or the existing
  `CardControl`). Section headers, the empty plate, project headers and subtask branches are items or supplementary
  views of that one collection, drawn from the core's list as now. The column scrolls itself; no hand-kept geometry.
- **Lift, carry, drop are UIKit's** (`UICollectionViewDragDelegate` / `UICollectionViewDropDelegate`, `UIDropInteraction`
  on the timeline): the system lifts the card, shows the copy under the finger, scrolls at the edges, opens the gap
  where it will go (rows part, the standard iOS look — Decision 1 changed), animates the drop into it and moves cards
  between columns. The app only turns the proposed index path (and the finger's x for the subtask level) into the
  core's place: `placeAt`/`placeOfDrop` as now, and writes with `tasks.drop`.
- **At the drop** the controller asks `tasks.dropPreview` and applies its screen to every collection as one diffable
  snapshot, so headers and plates come and go in the same animation the system drops the card in; the real read after
  the write applies with no visible change.
- **The calendar** keeps its own `UIDropInteraction`; its target is the snapped minute as now. Lifting a timeline block
  into a list uses the same drag items.
- Everything the old mechanism needed for itself goes: `BoardDrop`'s place registry and edge scrolling, `ListGeometry` /
  `rest(...)`, `settling`, `leaves`, `afterLeaving`, `GapSpace`, `DropSpace`, `CarryLife`/`CarryEnd` refereeing, the
  private `_presentMenuAtLocation:` and the long-press delay patching where the system's drag gives the same. What
  stays custom must be named in the report with why iOS has no stock way.
- The day turn while carrying: the system's drag session survives the collection's reload; the day's collection applies
  the new day's snapshot and the session's proposals follow.
- Menus stay `UIContextMenuInteraction` on the same cells (the system arbitrates the long press between menu and drag).

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

1. **Lead, changed again 11-09 (Max rejected the system's gap): the target is the plugin's purple drop line.** The
   system's drag session carries the card, but no row moves under the finger (the drop proposal asks no gap): the line
   with its dot stands at the left edge of the level the place picks, drawn over everything, the carried copy too.
   The place is the core's `rules.placeAt` over the rows as they stand, the level `rules.levelAt` from the finger's `x`.
2. **Lead, changed 11-09: the home place is the carried card's dashed place** where it was lifted from (`is-waiting`);
   held over its own place, the line stands at it, and a drop there writes nothing.
3. **Lead, changed 11-09 (was «no target over the bars»): over the bars the target is the nearest place of the column
   under the finger.** Where no list or calendar takes the drop (the top bar, the tab bar, the divider's handle, the gaps
   round them), one board-level drop interaction routes it, through the same routing as the plus, to the column under
   the finger's `x`: above a list its first place, over the tab bar its last place in sight (the end of a short list), on
   the calendar the minute at its visible top or bottom edge; the list opens the room there and the drop lands there.
4. **Lead, changed 11-09 (Max rejected the ring): a subtask's place is the same line one level in.** No task lights,
   rings or takes a drop «onto» it; only an empty section's plate and a column's title light, as before.
5. **frontend-swift: the calendar's line marks the carried card's top edge** (the minute is read where the card's top
   stands, the finger's hold on the card known from the lift), so the line shows at the card's edge, not under it.
6. **frontend-swift: the day arrows are spring-loaded.** A card held over ‹ or › turns the day (the system's spring
   loading, as Files' folders); the carry goes on and lands in the day now shown.
7. **frontend-swift: cards and section headers lift after the system's long press.** The settings' Long Press Delay is
   kept for the calendar's empty-space press only (the system's list drag has no public delay).
8. **frontend-swift, changed 11-09: a card carried out of its list keeps its dashed place there** until the carry
   ends, as the plugin's; the picked tasks carried with it fold away under it.
9. **frontend-swift, changed 11-09: a section carried shows its room**, a dashed card's room before the header it would
   go before (`.tc-group-drop`), its own header and tasks not drawn while its floating copy is carried. Let go it goes
   there (`tasks.moveGroup`), drawn at once where it was let go until the read after the write; let go where it can't
   land, the copy flies home and the section's tasks show again once it is down.
10. **frontend-swift: a press that starts during the system's drop animation (about 0.4 s) is not taken by iOS**; a
    card lifts at once once the dropped one has landed.
11. **frontend-swift: a card let go on the all-day strip over the calendar goes to the day with no time**: the core has
    no `DropTo` for a day without a time, so it is the drop on the day list's title (`ScreenView.titleDrops.day`): the
    end of the day's part without a section, its project kept. The day's title lights while the card is over the strip.
12. **frontend-swift: a refused or unchanged drop flies the copy back to where the card was lifted** (its row in its own
    list, or its place on the calendar), never the system's default fade.
13. **frontend-swift: the calendar scrolls at its top and visible bottom edge under a carry**, as the lists do under the
    system's drag, faster the nearer the edge; the minute is read anew as the grid passes under the finger.
14. **frontend-swift (motion-polish): the drop lands in one drawing.** The core's `dropPreview` screen, the carried
    tasks in their new rows (all the picked ones), is drawn in the same pass the copy is let go; Select Tasks ends after
    it. A carry ends once its copy is down (the drag side's end, or the system's flight time after the drop side's).
15. **frontend-swift (motion-polish): a card's menu grows from the card and lands back in it as one view**: one copy
    over the card, grown with the menu to the whole title (`rules.wholeWidth`, `rules.grownStart`) and shrunk back,
    then faded into the row; a row the menu's choice removes closes once the copy is home.
16. **frontend-swift (motion-polish): list rows come and go as a folder's**: a row coming slides out from under the
    row above, a row going slides back under it; nothing fades in place under moving rows.
