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
   board's own drag carries the card (decision 17), and no row moves under the finger: the line
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
6. **frontend-swift, changed 11-09 (own drag, timing kept): the day arrows are spring-loaded.** A card held over ‹ or ›
   turns the day after 1.25 s, as the system's spring loading did on master (measured there: 1.25 s from the card
   reaching the arrow), with the selection tick (`SpringZones`, the one dwell of the drag); once per stay over the
   arrow, as on master; the carry goes on and lands in the day now shown, the place under the still finger read anew as
   the day lands.
7. **frontend-swift, kept as on master (lead: don't change what Max is used to): cards, calendar blocks and section
   headers lift after the system drag's own time, 0.33 s** (measured on master: the lift began 0.326 s after the touch,
   whatever the setting); the settings' Long Press Delay stays the calendar's empty-space press's. The plus lifts at
   once, as before.
8. **frontend-swift, changed 11-09: a card carried out of its list keeps its dashed place there** until the carry
   ends, as the plugin's; the picked tasks carried with it fold away under it.
9. **frontend-swift, changed 11-09: a section carried shows its room**, a dashed card's room before the header it would
   go before (`.tc-group-drop`), its own header and tasks not drawn while its floating copy is carried. Let go it goes
   there (`tasks.moveGroup`), drawn at once where it was let go until the read after the write; let go where it can't
   land, the copy flies home and the section's tasks show again once it is down.
10. **frontend-swift, changed 11-09 (own drag): a long press recognized while the last copy still settles sets that
    copy down at once** (its card shows in its place) and lifts the new card: the next card lifts the moment the finger
    asks. A press is recognized only after the delay, by when the copy has all but landed.
11. **frontend-swift: a card let go on the all-day strip over the calendar goes to the day with no time**: the core has
    no `DropTo` for a day without a time, so it is the drop on the day list's title (`ScreenView.titleDrops.day`): the
    end of the day's part without a section, its project kept. The day's title lights while the card is over the strip.
12. **frontend-swift: a refused or unchanged drop flies the copy back to where the card was lifted** (its row in its own
    list, or its place on the calendar), never the system's default fade.
13. **frontend-swift, changed 11-09 (own drag): a list or the calendar scrolls at its top and visible bottom edge (the
    tab bar's top) under a carry**, faster the nearer the edge, 48 pt deep, up to 9 pt a frame; the place or minute is
    read anew as the rows pass under the still finger. One display link (`EdgeScroll`), running only while the finger is
    at an edge: a still finger gives no move to drive the scroll.
14. **frontend-swift, changed 11-09 (own drag): the drop lands in one animation, and the carry ends when its copy is
    down.** Every let-go is a drop: into its place, or home where nothing takes it (the bars, the cancel target), so the
    copy always flies. The core's `dropPreview` screen is applied to every list and to the calendar inside the copy's own
    flight (a spring with no bounce fitted to 0.35 s): the rows open and close and the calendar's blocks move as the copy
    flies, and the copy's target is the card's frame in that new layout (on the calendar, the block of the stack the
    calendar draws). The card the copy lands as is hidden until then; in the flight's completion it shows (set on the view
    itself), the carry ends and the copy goes, in one frame. Select Tasks ends after the drop.
15. **frontend-swift, changed 11-09 (lead: the system's standard preview): a card's menu.** A card that shows its whole
    title is lifted itself. A cut title: the menu's preview (`UIContextMenuConfiguration(previewProvider:)`) is the card
    laid out with its whole title at the width the core gives (`rules.wholeWidth`), drawn as on the board (inside the
    menu the system's grounds are its raised level's: the card took the menu's white); the highlight and dismissal
    previews are the card itself, so the system morphs the card into the whole title and back, no app copies. The system
    places the preview (no longer `rules.grownStart`). A label set from the open menu redraws the card, the menu's rows
    and the preview in place (the whole-title one cross-fades to the new look); Select Text lifts the title exactly where
    the preview stood. The whole-title preview is laid out by its title, as a card (a tall calendar block's too, not a tall
    box). Rename runs as it is chosen: the card turns into its field in its own row as the preview lands on it (the list
    draws a row turning into its field at once, never cross-faded, and no hold waits for the preview). A row the menu's choice removes (Done, Won't Do, Delete) closes once the
    preview is home, heard from an animation of the app's run inside the menu's going (the animator's own completion
    comes most of a second later). The private trigger that opens the menu on a tap (`_presentMenuAtLocation:`) stays: it
    presents this configuration with the standard morph.
16. **frontend-swift (motion-polish): list rows come and go as a folder's**: a row coming slides out from under the
    row above, a row going slides back under it; nothing fades in place under moving rows.
17. **Lead, 11-09: the board's own drag replaces the system's drag session** (the system drew its copy above every
    window, over the line; kept its copy over the row about a second after landing; held a collection's updates during
    its drop animation). One controller (`DragController`) with one state machine (`CarryFlow` in `apple/Core`: idle →
    lifted → carrying → landing → idle, every step naming its carry), fed by a long press on a card, a calendar block or
    a section header and by the plus's pan; every move is routed by `BoardRoute`; the copy and the purple line are the
    app's, in one layer over the window, the line over the copy. frontend-swift, as built: the copy is the thing lifted
    drawn as it stood (picked tasks: the stack; a section: the floating section), opaque; it rises a little (×1.04) with a
    soft shadow in 0.25 s, as the system lifts a view.
18. **frontend-swift: a card's copy landing at another width or height (a subtask's level, the calendar, a block into a
    list) keeps its text still**: the copy is clipped to the card's shape, its look and the look of the card where it
    lands both drawn from the top-left corner, the one fading into the other; nothing is stretched or doubled.
19. **frontend-swift: a dropped subtask's branch comes with its place and fades in (0.12 s) as its row comes to rest**,
    never travelling with a row that moves there under the copy.
20. **frontend-swift: on the calendar a block lying over another's body is drawn over it**, the deeper the higher, the
    selected one over all: a block dropped onto a long task's time was hidden whole under it (the core lists the blocks
    in its own order). In a narrow calendar a deep block is narrow (its left is the core's overlay inset per level) but
    seen. For the Obsidian frontend too (the plugin's blocks follow the DOM's order).
21. **frontend-swift: picked tasks carried as a stack land as the lead card's copy; the others come in with the rows** in
    the drop's motion.
22. **frontend-swift, changed 11-09 (was decision 9's «shown once it is down»): a section let go where it lands comes in
    with its tasks in the drop's motion**: the tasks unfold as the floating section flies to its header and turns into it;
    the header itself shows in the frame the copy goes. Let go where it can't land, the copy flies home and the tasks show
    once it is down.
23. **frontend-swift: a project group's fold moves in the rows' own time**: the chevron turns, the folded count fades in
    or out and the note's arrow slides beside it as the rows fold (they turned and jumped in one frame).
24. **frontend-swift: a menu tile that can't be pressed shows so** (`labels.disabled`, `levels.disabled`: a task with a
    priority carries no labels, one with labels no priority): its coloured icon at the plugin's
    `--tc-tile-off-opacity` (0.35), its title greyed by the system, and a tap on it does nothing, as the plugin's
    disabled tile.

