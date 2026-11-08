# Motion: nothing jumps

## Why

Max: «куча мелких недоработок» in the animations, in the plugin and in the iPhone app. Three agents tapped, dragged
and swiped through every control frame by frame (desktop, phone view and the simulator). Their reports with numbers,
frames and file:line are in `2026-11-08-motion-audit/` (`plugin-main.md`, `plugin-menus.md`, `ios.md`). This spec turns
them into the root causes and what each frontend does about them. A fix is a change of the mechanism that causes a whole
class of jumps, never a number tuned for one case.

## What Max sees when it is done

- After any action (done, won't do, delete, a date, a priority, a section, a project, rename, fold, undo, a new task, a
  drop) the card that changed stays the same card on screen: it changes in place, or slides to its new place, or fades
  and folds away; the cards around it slide to close or open the gap. Nothing blinks, nothing jumps a row in one frame,
  two copies of a task are never seen at once, texts never overlap.
- A scrolled list stays where it was after a write; the card under the finger stays under it.
- A menu closes first, then what was picked happens on the screen under it. A menu page change (Section, Project,
  Repeat, Pick a date, Delete's question, back) grows or shrinks the panel smoothly; the panel's scroll is kept per page.
- Every part of one overlay (backdrop, panel, lifted card copy, its subtasks, the capsule and wheel copies, the shade)
  appears and leaves together, on one curve and one duration. One window replacing another (⋯ → Search) keeps one
  backdrop. Nothing that floats disappears in one frame (quick bar panels, search on the phone, the input bar on the
  desktop). The phone and the desktop behave the same.
- A drag ends where the task lands: the copy flies to the task's real new place and the place in the list is released
  only once it is there. A cancelled drag shows one task, never two. A section drag lands like a task drag.
- Modes slide in: select mode's circles, the capsule swap, an inserted row (rename field, place mark, quick entry row).
  The rename field has the height of the head it replaces.
- Snapping moves are smooth and follow one rule per gesture: block resize steps glide like the drop line; a tap during a
  swipe's settle continues from where it is; the lifted copy's width changes smoothly; the divider's magnet glides;
  settings rows follow the finger.
- iPhone: the same list moves as above with native animations; a pinch keeps the minute under the fingers; turning the
  day keeps the zoom; select mode slides in; Capture's «Added to …» fades in without the field jumping; a long press on a
  section header lifts it without flashing its context menu.

## Root causes and fixes

### R1. A task has no identity that survives a write (core)

`TaskKey` names a task as read: section, index, path and its raw line. Any write that changes the line (priority,
label, status, date, time, repeat, rename, fold marker 📁, a move) gives it a new key, so both frontends see a different
task: the plugin rebuilds every node, the iPhone app gives SwiftUI a new id (`BoardSnapshot.swift` `Painter.identity` =
list|raw) and the view is recreated; the menu preview flies to a view that no longer exists.

Fix (backend): every `TaskItem` (subtasks too) gets `id: string`, an identity that stays the same for the same task for
the life of the service: across every write the service makes to it (whatever changes in its line or wherever it moves:
list, section, group, parent, calendar), across a re-read of an unchanged file and an external edit that leaves the line
in place. A task created by the service gets a new id that its returned item already carries. A task removed loses its
id; a task added by someone else gets a new one. The same id is in every place the task is shown: the list, the
timeline block, search results, the day peek. Exposed through the door (`TaskCalendarPhone`) on every task the apps
read, and on the results of writes that return a task. `keyId` stays what it is (the key as read); views key by `id`.

### R2. The plugin rebuilds the whole DOM on every write (Obsidian)

`TaskList.draw` (`TaskList.ts:172`), `Timeline` (`:296`) and `CalendarScreen.draw` throw away and recreate every card
and block of every list. CSS transitions on `.tc-card`, `.tc-group-chevron`, `.is-folded` never run, nothing has an
enter or leave motion, and 44–54 nodes are recreated per write in lists the action did not touch.

Fix: one renderer that reconciles by `id`: keeps a node per task, updates it in place, moves it with FLIP, plays enter
(height and opacity from 0) and leave (opacity, then height to 0) motions; group heads and the empty-place row the same
way by their keys. Lists, the timeline's blocks, select mode and folding all draw through it. Durations and curves come
from the motion tokens only.

### R3. Scroll anchoring and programmatic scrolls jump (Obsidian)

A scrolled list jumps ±68 px after a write (Chrome's scroll anchoring on replaced nodes; `.tc-list` has no
`overflow-anchor`). `QuickEntryController.bringIntoSight` sets `scrollTop` in one step; `DragController.hold` opens the
menu through `scrollIntoColumn` and scrolls the timeline under a held finger, so a drag then starts from a moved block
and flies 260 px off the finger.

Fix: the plugin's scroll containers own their position (`overflow-anchor: none`, R2 keeps the nodes); every scroll the
plugin makes goes through one smooth scroll; no scroll happens under a finger that is still down: a hold scrolls into
view only when the menu actually opens after the finger lifts, or not at all.

### R4. A pick runs while its menu is still closing (Obsidian)

`Picks.pick` (`kit/Panel.ts:17-18`) closes the menu and runs the action in the same tick; the write redraws the list
10–15 ms later under the 150 ms fade, so the lifted copy fades over a card that already moved into its place.

Fix: a pick runs once the overlay's close has finished (the close resolves a promise; the action waits for it), the way
iOS runs a menu action after its dismissal. One place, every menu (task, block, bulk, section, column, ⋯).

### R5. Menu pages swap with no motion (Obsidian)

Page changes go through `clear`, a rebuild and `placePanel`; the panel has no transition of size, side or scroll
(`TaskMenu.ts:342-537`, `MenuPanel.ts:214-236`, `DescriptionPeek.ts`). Add subtask in a block's menu drops the panel in
one frame (`TaskMenu.giveToField`).

Fix: the menu panel animates between its sizes and places on any content change (measure, then transition height and
position), keeps each page's scroll, and the description peek fades instead of `hidden`. Giving the menu over to a field
closes it through the overlay's close.

### R6. Overlay parts are not one motion (Obsidian)

The backdrop opens in 150 ms, the panel, popover and peek in 200 ms; the lifted copy, the subtasks stack, the capsule
and wheel copies and `.tc-level`'s shade have a closing transition only (`styles.css:1098`). Each window has its own
`Overlay` (`MoreMenu.ts:23`, `SearchWindow.ts:45`), so ⋯ → Search fades two blurred backdrops at once. Quick bar panels
(`QuickBar.closePanel`), the phone's search and the desktop's input bar leave by `remove()`, `hidden` or a class with no
transition.

Fix: one overlay motion: every part of an overlay opens and closes through the overlay with one pair of tokens (open,
close) and one curve; a window that replaces another takes over the open overlay and its backdrop; nothing floating is
removed except through that close. The phone and the desktop use the same path. The overlay's document is the one its
source element lives in (`ownerDocument`), not `activeDocument`.

### R7. A gesture's end releases the place before the copy lands (both)

Obsidian: `DragSession.ts:66-68` calls `onReturn()` before `flyTo`, so a cancelled drag shows the task twice for ~200 ms;
`GroupDrag.ts:84-93` removes the copy and the mark and unfolds before the write, three jumps in a row. iPhone: where the
preview lands is guessed from geometry before the write (`landingRect`, `gapRect`, `landOnCalendar`); the drag's end is
not tied to the drop animation; a drop on the past part of the calendar leaves a ghost on the line for 1.1 s; a section
drag reorders in one frame and flashes Rename/Remove (`.contextMenu` and `.onDrag` on one header); the plus between cards
flies home while the field opens and draws over the input bar.

Fix: one end of a drag on each platform: write, then fly the copy to the place the task actually took (found by `id`
in the new state), then release the place, in that order; cancel flies to the origin and only then shows the card. The
section drag uses the same end. iPhone: one owner of the drag state; the drop's end waits for the drop animation
(`UIDragInteraction`/`UIDropInteraction` completions); the header's lift does not show its context menu; the plus that
opens a field becomes the field's place instead of flying home.

### R8. Modes and inserted rows switch by display or padding (both)

Obsidian: select mode's circles, the +21 px title shift and the capsule swap happen in one frame while the old capsule's
copy still fades; the plus and capsule vanish during a drag; the place mark, the quick entry row and the rename slot
(taller than the head it replaces, `CalendarScreen.renameInPlace`) enter in one frame. iPhone: select mode swaps the
card's view type (`CardButton` ↔ `TaskCapsule`) under implicit `.animation`s at the screen root
(`BoardScreen.swift:34-35`); the quick entry field and the snapshot render in different transactions (an empty capsule
for 6 frames, rows +17 pt then −6 pt); Capture's «Added to …» shortens the field by 36 pt in one frame.

Fix: modes and inserted rows enter and leave through R2's renderer (Obsidian) or one explicit transaction (iPhone): the
card keeps one view whose parts slide; no implicit `.animation` at the root; the field and the state it writes arrive in
one transaction. The rename slot has the head's height.

### R9. One gesture, two snapping rules (Obsidian)

The column switch steps `padding` and `gap` mid-slide (`styles.css:854`, `0s linear var(--tc-slide-flip)`), so the day
column's cards move 8 px in a frame. Block resize steps by 14 px while the drop line glides in 120 ms. A tap during a
swipe's settle puts the screen in place at once (~150 px). The lifted copy's width changes in one frame. The divider's
magnet jumps 9–10 px. `RowReorder.drag` moves a row 178 px when the finger crosses a neighbour's middle and re-inserts it
on every move.

Fix: every snap glides with the snap token; padding and gap transition with the slide; a tap during a settle continues
the settle from its current offset; settings rows are dragged by the same drag as task rows (a copy that follows the
finger and a gap that slides).

### R10. iPhone list without insert, remove and move motion

The board is a `VStack`/`ForEach` of UIKit cards with no insert or remove transitions, the whole snapshot swapped under
one `withAnimation(.snappy)` (`BoardModel.swift:206-223`): a removed row is overlapped by the next one, a new one shows
under a sliding one, counts and subtask branches switch in a step.

Fix: with R1's `id`, every row, head, count and branch is identified by its id and has explicit insert, remove and move
transitions in one transaction per snapshot.

### R11. iPhone timeline

A pinch does not keep the minute under the fingers (≈21:38 became ≈19:33): zoom and scroll go in one transaction and the
scroll is clamped by the old content height (`TimelineColumn.swift:263-274`). `.id(snapshot.day)` recreates the timeline
with its `@State`, so a day turn resets the zoom.

Fix: the scroll offset is computed for the new height after it is laid out, anchored on the pinch's minute; the
timeline keeps its state across days.

### R13. iPhone: the motion of a redraw is chosen by who asked for the read (iPhone)

`instantNext` is one flag for every read and concurrent reads merge (`BoardModel.swift:165-202`): after Sync an instant
`reload()` and an animated return-to-front read race, so the Mac's changes either slide or jump; search, the day turn
and Undo read instantly over a pushed state. A section's id is its name, so renaming a section recreates its head.

Fix: how a redraw moves follows from the difference between the two snapshots (R10), never from a flag of the call;
reads are not merged into a different motion. Section heads are identified by a key that survives a rename (the core
gives one if it is missing).

### R14. iPhone: a page's data arrives after its first frame

The task screen reads its subtasks and list name in `.task` after the push (subtasks appear a frame or two late, the
title moves by the caption's height); search swaps its results whole after 150 ms; the tab bar hides and returns in one
frame because `model.fullScreen.isEmpty` is not among the animated values (`BoardScreen.swift:28-35`). The plus on the
× changes its icon with its own `bounce 0.2` spring while the system flies it home.

Fix: a pushed page gets its data before it is pushed; search results change through the list's id-based transitions;
every condition that changes the layout is animated by the transaction that changes it; one spring per moving thing.

### R12. Found along the way

- Obsidian, phone: the autoscroll zone at the list's bottom lies under Obsidian's bottom bar; it must sit above it.
- iPhone: the day arrows ‹ › take no tap (F2 in `ios.md`); the day column's width changes during the Soon→Today swipe
  when the divider is moved (F4). Branch `ios-day-turn` (and `plugin-day-arrows` for the plugin's day slide) work on the
  arrows; this branch does not touch them unless they are merged first.

## Decisions

1. **Backend, R1: identity is the line's own tag.** Every line of a `TaskDocument` carries a tag; every edit of the
   document (insert, rewrite, move, nest, split, merge, normalize) keeps the tag of each line it keeps or rewrites and
   gives a fresh one to a line it makes. A task's `id` is its line's tag, so a write's identity follows from what the
   write did, never from comparing texts. Lines under a rewritten task keep theirs where they stay or are edited in
   place (an ordered diff inside that one task).
2. **Backend, R1: `TaskIdentity` keeps the ids between texts** (`core/application/TaskIdentity.ts`): the headings and task
   lines of the last text with their ids. A text the service did not write (an edit elsewhere) is matched to it by an
   ordered diff of headings and task lines (place and line): a line left in place keeps its id, and so does a changed
   block with as many task lines on each side (a line edited in place); anything else is new. Twins are never guessed:
   a write knows them by tag, an edit elsewhere keeps the one its diff leaves in place.
3. **Backend, R1: undo carries ids.** Each undo step keeps the ids of the lines it changed (`Hunk.removedIds`,
   `addedIds`); undo gives a line back the id it had, redo the id it got. The service and the history share one
   `TaskIdentity` (`composeCore`).
4. **Backend, R1: ids last as long as their service**, not across restarts; the door has no state, so the host keeps
   `ids` (`TaskIdState`) from each answer and hands it back, as it does `history`. Without it every call gives new ids.
5. **Backend, R1: a creation answers what it answered.** `createInPlace` still answers the new task's key, now exactly
   the line it made (by tag; before, of two twins side by side the first was given). The new task's id is on it in the
   next read. `tasks.drop` answers the dropped tasks' keys by tag too.
6. **Backend, R1: a repeating task closed keeps its id** (it goes to Done); its next copy is a new task with a new id.
7. **Backend, R13: sections have ids the same way.** A section's id is its heading line's tag, kept by the identity like
   a task's: `ListSection.id` and `ListGroup.id`, the same through rename, move, writes to its tasks and undo; No section
   is `"none"` in every list. `ProjectGroup.key` (the project's name) already names a project's group; no write renames
   a project, so it needs no other key.
8. **Backend, R7: where a drop lands, asked before the write.** `TaskService.landing(tasks, to, day, project?)`
   (`tasks.landing` through the door) answers a `DropLanding` per task: a timeline block at its shown `span` (with
   `ridesNow` for a past time of today and every block of the day for the stack), a card of a column with its section
   and index, a subtask under its parent, or away. It writes nothing: it tries the drop's own operation over the file as
   read and reads the screen of `day` over the result with the screen's own code, so it is the write's answer by
   construction; a test checks it against the place after the real drop for every drop case of `drops.test.ts`. It is a
   `tasks.*` method, not `rules.*`, because it needs the tasks file.
9. **iPhone, R1: the board keeps `ids` as it keeps `history`** (`TaskBoard`): handed in with every call made over the
   tasks file, kept from every answer over it; a call over no file (a menu, a pure rule, the quick entry's lane) neither
   sends nor keeps them. An answer over files read before the board's last write never replaces that write's ids (a
   count of writes stamped on the files read); the file and that count are read together, and a write puts its text and
   its ids in together, so no read ever pairs the new text with the ids from before it. `TaskItem.id`, `ListSection.id` and `ListGroup.id` are the core's; a card,
   a timeline block, a header and its plate are keyed by them (`Painter.identity` is gone).
10. **iPhone, R10/R13: one drawing, one transaction, its motion from the difference** (`BoardSnapshot.motion(from:)`):
   `still` (the first drawing, or nothing drawn differs: no animation), `turn` (another day: the day part pushes in from
   the day's side), `change` (the system's snappy spring). Every read goes through it (a drop, Sync, a return to the app,
   Undo, search, the day arrows, the quick entry's writes), never a flag of the call. A row that comes or goes in a list
   folds open or shut from its top while it fades (`FoldAway`): its visible part shrinks as fast as the rows below close
   the gap, so they never draw over it.
11. **iPhone, R7: one end of a carry** (`CarryEnd`, owned by `BoardModel`), **the copy flies to where the core puts the
    task.** At the drop the app asks `rules.placeOfDrop` and `tasks.landing` (decision 8) before the write, over the
    text the screen is drawn from, on the pure rules' context (no file read, no wait for a background read, in the
    frame of the drop), and the copy flies straight there: a list's room is opened before the landing's index in its section (or
    under its parent, for a subtask), a timeline block at the box `rules.stackTasks` gives with the landing's `slotted`
    spans (on the now line when `ridesNow`); away: the system's own drop. A drop the core places nowhere new
    (`placeOfDrop` null) flies into its dashed place and writes nothing. Swift no longer guesses the place from the
    gap or the line (`landingRect`, `returnsHome` and the line's rect are gone). A carry ends when its copy has landed
    (the drop animation's completion, a cancel's flight home, the plus's flight home; the session's end only after
    them) and, when the drop writes, when the first read made after the write is drawn: that read puts the dropped card
    in its new place, still hidden, and takes away the room, the drop line and the section mark in the drawing's own
    transaction. At the end the card shows; only if the read differs from the landing does it glide from where the copy
    came down (a guard, not the path). A cancel's card shows in the frame its copy lands.
12. **iPhone, R7: a section's header opens its menu on a tap**, as a card does (Rename, Remove Section, as the core offers
    them); a long press only lifts it. No context menu on a header, so the lift never flashes one. A section dropped
    flies to the mark that showed its slot.
13. **iPhone, R7: the plus let go on a place opens the field in the same frame** (the place is asked of the core's pure
    rules synchronously) and its copy grows into the field's place there and fades; it flies home only from no place or
    the cancel target, and its carry (the × on the slot) ends once it is home. The slot's +/× changes with the system's
    symbol replace, the rest of its look on one spring without bounce.
14. **iPhone, R8: Rename gives the card's row to the field**: the field's row takes the renamed card's id, so the rows
    around it do not move. Select Tasks keeps the same card (`CardButton`) in both modes: the circle slides in beside it,
    a tap on the card or the circle picks it; the calendar's cards dim and take no touch. Selection starts and ends in
    one explicit transaction.
15. **iPhone, R8/R14: no `.animation` at the screen's root.** The tab bar's presence is one condition (not Select Tasks,
    no page pushed, no field open) with its own scoped animation; everything else moves in the transaction that changes
    it. The quick entry draws the screen, the field and the job's end in one transaction, moving by the same
    `motion(from:)` as any drawing (a line written elsewhere in the list slides the rows).
16. **iPhone, R14: a task's page is read before its push** (`TaskBoard.page`, one reading of the files off the main
    thread: the task as the file has it, its subtasks, its list's name, the menus, the description as the editor opens
    it); its later refreshes animate. A second tap while the page is read pushes nothing more. Search
    results change by their tasks' ids, with their groups' names, in one transaction.
17. **iPhone, R11: the timeline's zoom and height are the screen's** (`TimelineZoom`), so a day turned keeps the zoom; the
    new day's timeline starts scrolled where the core opens it from its first frame. A pinch sets its scroll again once
    the content has its new height (never cut short by the old one); the core's restacked blocks glide in (0.2 s).
18. **iPhone, F4: the ribbon's widths are the 2026-11-07 spec's**: Inbox over Backlog and the day list the divider's
    width `d`, Soon and the calendar `W − d`, places at 0, `d`, `W`. No width changes during a swipe.
19. **iPhone, F1: Capture's «Added to …» stands at the bottom of the empty field**, fading in and out; the field keeps its
    height.
20. **Obsidian, R2: one renderer by key** (`obsidian/ui/motion/KeyedRows.ts`, `Motion.ts`). A list's rows are keyed
   `task:<TaskItem.id>`, `head:[zone, ListGroup.id]`, `project:<ProjectGroup.key>`, `plate:[zone, ListGroup.id]`, the
   field's row `entry`, a text typed and not written `unwritten:<n>`. A kept row is filled anew in place; a new row grows
   from no height (`--tc-duration-collapse`); a gone row fades, then folds (twice that); a moved row slides from where it
   stood and takes its new width (a new level) on the way; one curve, `--tc-ease-out`. A row's listeners hang on an
   `AbortSignal` the next drawing aborts. A row holding the focus never moves in the page; anything else in the column (the
   drop line, a section's mark) stays where it stands. The first drawing after the tasks are read and another day are
   drawn at once. The timeline's blocks and events are kept the same way by id; a block moves by its top, left and height,
   a new one fades in, a gone one fades out. A project's chevron is kept, so it turns.
21. **Obsidian, R2: a written text stays its card.** The id `createWithId` answers for each text the field writes is
   handed to the lists (`TaskList.adopt`); the card drawn for the task of that id takes over the typed text's row (an
   heir key), so the text becomes the task without a blink, whatever was written since. No counting, no keys: a task that
   comes from Sync meanwhile never takes the row.
22. **Obsidian, R3: a scrolled list holds its place** (`ScrollHold`, `--tc-list-hold` under the last row): while rows
   fold away at its end it keeps a screen of room for twice the collapse time, then only what its scroll needs, and gives
   it back as the finger scrolls up. Without it the content under the finger was pulled down by the shrinking end.
23. **Obsidian, R4: a pick that opens a field acts inside the tap** (`Picks.pickNow`: Rename, Add description, Add
   subtask, New section, a section's Rename): iOS raises the keyboard only for a field focused by the tap itself. Every
   other pick waits for the overlay's close (`Overlay.afterClose`). The picks are the overlay's own (`Overlay.picks`, one
   set for every window over it, which `Panel.over` takes); ⋯ → Search is a pick that hands the sheet off
   (`Picks.handOff`). What the repeat page holds is written after the close by the same `afterClose`, and a search result
   moves the screen once the search has closed.
24. **Obsidian, R6: the overlay's motion.** Every part opens on `--tc-duration-menu` and closes on
   `--tc-duration-collapse`, curve `--tc-ease-out`: sheet, panel, popover, peek, lifted copy, menu stack, the capsule and
   wheel copies, the field row over the blur, and the level's shadow, which fades in from `--tc-level-shadow-off`. ⋯ →
   Search hands its sheet over (`Overlay.handOver`). On the phone the search covers the view itself, so it stands in the
   view (`Overlay.addIn`) and lets the handed sheet fade away under it (`dropSheet`) as it fades in with a rise.
25. **Obsidian, R5: a menu's pages** (`PanelPages`): another page, or the same changed, morphs the panel and the part
   split over the card from their old boxes to the new ones on `--tc-duration-menu`; each page (menu, sections, projects,
   reminders, repeat, picker) keeps its scroll; Delete's question scrolls into view smoothly. The description's peek
   fades away and back (`is-away`). The bulk menu and the column menus use the same pages.
26. **Obsidian, R7: one end of a drag** (`DragSession`, for a card, the plus and a section alike): the drop is written and drawn, the copy flies to the card the
   task stands on now (found by id, `ArrivingCard.dropping` from before the write; where a moving card will rest is read
   without stopping it, `restingRect`), and only then is the place released (`onReturn` after landing). Dropped in its
   own list, the card is the same node: its dashed place slides to the new place and the copy lands in it. A cancel flies
   back to the dashed place first and shows the card after. The plugin writes before it flies (a few ms) rather than
   asking `tasks.landing` first: the place it flies to is the real one by construction, as decision 11's.
27. **Obsidian, R7: a section lands as a card does**, through the same `DragSession` (the slots between the sections are
   its one target). The landing place is a row the list draws (`TaskList.showLanding`, ordered by `KeyedRows` like every
   row): over the slot's header while the finger moves, right after the section once the move is written and the list
   drawn, so the section's header stands where it will open. The copy lands on that header, found by the section's id
   (`ListGroup.id`, which a move keeps: decision 7) in the list as drawn, never by its name (sections of one name stand in
   several projects), and only then does the section unfold as the place folds; the screen stays the drag's until then.
   A cancel flies back to the header first. The mark opens and closes between the sections
   as the finger moves. Tap opens the menu, a long press only lifts (as decision 12).
28. **Obsidian, R7: the plus let go on a place lands in the field opened there**, scaled to the field's height, and
   fades (as decision 13); let go on nothing, or cancelled, it flies home to the plus, as a cancelled card does.
29. **Obsidian, R8: Rename's field row stands in for the card** in the same frame both ways (as decision 14): it does not
   grow in, it goes at once when the card comes back, and a list's field row keeps a card's height when its field goes.
30. **Obsidian, R8: modes slide.** Select mode's circle opens from no width at the card's start and the title slides over
   with the padding; the foot's controls (plus, Undo + ⋯, the select capsule and button, the switch while typing) fade
   and shrink to `--tc-menu-scale` instead of `display: none`; the desktop's quick bar and section capsule fade in and
   out; the quick bar's panels fade out; a stack's new field row grows in.
31. **Obsidian, R9: snaps glide.** The column's padding and gap slide with the strip (`--tc-slide-flip` is gone); the
   divider's magnet glides in and out on `--tc-duration-snap` (`SnapGlide`); a stretched block glides by grid steps on
   the same token, as the drop line; the lifted copy takes its width from the card's in a card's flight; a settings row
   follows the finger, the others slide aside on the snap token and it is written once it has landed.
32. **Obsidian, R9: a tap during a swipe's settle lets the screen run on** to its place from where it is; the tap goes to
   what it hit. A new swipe still starts from the screen put in place.
33. **Obsidian, R3: a held block opens its menu without scrolling** its column under the finger (over what shows of it).
   Every scroll the plugin makes is one (`scrollSmoothly`, on `ScrollGlide`) and ends exactly once, saying how: it got
   there, its content ended short, another scroll took over, it was called off, or a finger or a wheel took the scroller
   (it yields at once). A menu waiting for its column opens on every end but a finger's, which closes it; a sheet not yet
   shown, or closing, takes no tap.
34. **Obsidian, R12: a list's edge for scrolling itself is the top of the switch's row**, not the list's box, which runs
   under the foot and Obsidian's bar.
35. **Backend, R1 fix: ids are kept for the file as read, tidied for today.** A host may keep a file the door tidied only
    in memory; before this fix the ids described the tidied text and the next call matched the untidied one against it,
    so every task tidying moves got a new id on each read. Now a text is matched by its own reading: parsed with each
    line tagged by its line, then tidied, which carries those tags wherever it moves the lines; the reading is matched to
    the kept ids (also a reading), and the text's lines get the ids their tags found. The file read raw or tidied gives
    the same ids. The plugin's service did not show it (its tidying is a real write), and reads the same way now.
36. **Backend, R1: a task made is named by its id too.** `createInPlace`'s key names the new task only as the file stands
    right after its write; a write before the screen draws moves it. Added, nothing changed: `TaskService.createWithId`
    (`tasks.createWithId` through the door), the same arguments and write as `createInPlace`, answering `CreatedTask`
    `{ key, id }` or null; `ListCard.id` (optional): a card given its task's id is found by it; `QuickEntry.shown` takes
    the `CreatedTask` too, and then finds the typed task's card by id. `createInPlace` and `entry.shown` with a key
    answer as before. To use it, a frontend calls `createWithId` where it calls `createInPlace` for a typed task, gives
    its cards `id: item.id`, and hands the `CreatedTask` to `shown` (the plugin: `QuickEntryController.telling` and
    `TaskList`'s cards; `QuickEntrySession` switches with it).
37. **iPhone, decision 36 applied: a task typed is made by `tasks.createWithId`** (the quick entry's `createInPlace` job),
    and `entry.shown` gets its `{ key, id }` with the drawn cards carrying their ids, so the field's line becomes the
    card found by id even when another write (Sync, a reminder's button, a drop) moved its key before the drawing.
38. **iPhone, R10: a row folds by its own height** (`FoldAway`): the row's layout height goes to and from nothing with its
    content cut at the bottom, so the rows below move by exactly what shows of it, one row or a block (a section unfolding
    after its drop, subtasks folding), and the list's gap after it folds with it (a margin down to minus the gap, as the
    plugin's `Motion` margins). At rest nothing of a row is cut. The cut is a shape, never a view builder: SwiftUI
    runs a transition off the main thread, where a main-actor closure traps (Done on a subtask crashed the app).
39. **iPhone, R10: what one row holds changes in place.** A list's row folds when it comes or goes; its content changing
    (a card and the rename field that takes its id, decision 14) is drawn in the same frame, as the plugin's decision 29.
40. **iPhone, R1/R8: the quick entry's rows keep their keys** (`QuickEntryHost.lineKeys`, `heirs`). Enter makes the
    field's row the typed line's and opens a new row for the field under it, the rows below sliding (no longer a line
    break in one frame); the card made from a typed line takes that line's row by the id `createWithId` answered, as the
    plugin's decision 21, so the text becomes the card with no second copy.
41. **iPhone, R7: a card's menu preview flies home inside the card, over its neighbours.** The card's wrapper is raised
    over the cards after it from the menu's opening until the dismissal's animator completes; the preview stays the
    card's own, so it follows the card wherever the pick moves it.
42. **iPhone, R7: the drop's end belongs to the drop.** The card's own drag session ends a carry only when cancelled
    (its copy is home); the screen's drop session ends one only when a place took the drop, or for a section, whose lift
    has no end of its own. The drawing that writes a drop puts the dropped card in its new place without a slide
    (`placedByDrop`): its copy flies there. A drop nothing of the board took ends the carry when the card's session ends,
    as a carry let go on no place: every carry ends exactly once. What is carried is of a type only the app's process
    knows, so no text field takes a card or a section as text.
43. **iPhone, R7: a section's copy folds shut onto the room it opens** as it lands (the drop preview's target scales it
    to a line): the system keeps a drop's copy on screen until its animator ends, and a section's copy does not look like
    its header.
44. **iPhone, R11: a pinch's minute is held until the content has its zoom's height**, the zoom the core settles on is
    drawn as the fingers lift, and the timeline keeps the offset it scrolled to itself: scrolled during a change of the
    content's height, the scroll view reports the offset from before it.
45. **iPhone, R11: a reading's stack at the zoom shown is the core's from its first frame.** A reading drawn at another
    zoom than its own (any write, Sync, a day turned) has its blocks laid out by the core in the drawing's own
    transaction; the scaled guess, which drew a block a frame taller, is left to the pinch, which asks on every frame.
46. **Backend, R8: a rename entered shows its new text before the write is drawn.** The entry tells every rename entered
    and not yet written, as it tells a new task's text (`pending`): `PendingRename` `{ id, key, text, title }` (the task's
    `TaskItem.id`, its key as read at the open, its new `text` and `title` as the item will read), in
    `QuickEntry.renamed` (`QuickEntrySession.renamed`), in `EntryState.renamed` while the field is open, and through the
    door in every `entry.*` answer's `renamed`, the field open or closed. A frontend draws the card with that id under
    its new `text` until the job is `done` (the card draws `TaskItem.text`, so the same field shows no change when the
    write is drawn; `title` is the plain form for questions). Added only: nothing existing changed.
47. **Obsidian, as decisions 40, 43 and 46.** Enter: the line typed takes the field's place in the same frame (a new
    typed row stands in, it does not grow) and the field's row opens anew under it (`RowsDrawing.regrow`), the rows below
    sliding; a row grows from and folds to nothing past its own `min-height`. A section's copy lands folding shut from its
    top onto the line its section opens from. A card or block of a task in `QuickEntrySession.renamed` draws that entry's
    text until the write is drawn, so Enter in Rename never shows the old title (`TaskList`/`Timeline` `renamed`).
48. **iPhone, R4/R5: a menu asks on its own page.** Won't Do, Stop and Delete open a page of the same menu (a
    submenu: the question over its answer), as the plugin's menu does; as there, only Delete is red, its row and its
    answer. No dialog is presented after the
    menu, which iOS holds until the menu's dismissal has ended (a second). The bulk bar's Done, outside a menu, keeps
    its dialog.
49. **iPhone, R8: a field takes the keyboard in the gesture that opens it, before the drawing that opens its row.**
    Taking the keyboard reloads its views and holds the main thread (a third of a second on the simulator); done inside
    the opening drawing it swallowed the row's opening, and the plus's copy faded over nothing. Focused first (from where
    the field waits, parked in the window), whatever is typed goes into the field, and the row opens on a free main
    thread.
    The new field's row itself opens with the keyboard's own rise (`keyboardWillShow`, at once when the keyboard stands,
    after 0.4 s at most): UIKit reloads the keyboard's views on a later turn, and a row opened before that stood still
    midway. A renamed card's row is the field's at once. Measured in the app's log: the main thread was taken by
    UIKit's `UIKeyboardSceneDelegate setInputViews` (the keyboard and the field's bar, its accessory, put in place) for
    0.3 s, and the keyboard's will-show notice is posted from inside that work; the row now opens on the turn after the
    notice, so its first frame and every frame after it come on time. The bar is built once with the field, never anew.
50. **iPhone, R7: the slot is the cancel target while a finger holds a carry**, and for the plus until its own copy is
    home (it flies into the slot); a card's copy flies to its own place, so the slot is the plus again as it is let go,
    not when the system's drop animator ends a second later.
52. **iPhone, merging the day turn of master (0.4.179): one way a day turns, the plugin's.** Two mechanisms met: this
    branch's `.turn` (the whole day part, list and calendar, pushed in by a SwiftUI transition keyed by the day) and
    master's `DayTurn` (header and hours stand, each column slides its own day through `DayLane` over 300 ms with the
    pager's ease, the swipe past Today led by `days.stepScreen`). Master's is kept: it is the plugin's, it follows the
    finger, and it keeps the columns and their state (the timeline's scroll and zoom, decision 17) instead of drawing
    them anew. Every day change goes through it: the arrows, the swipe, Today, a found task on another day and the
    bar's Date… (`go(toDay:)`); `motion(from:)` still names `.turn`, which `draw` now draws still, the day having come in
    by its own slide. The rows inside the sliding day keep this branch's keys, `FoldAway` and heirs; the widths stay
    decision 18's. The day swipe's pan makes the ribbon's own pan wait for it; a lift takes the touch before
    that pan has seen it move, so it stayed waiting the whole carry, and with the ribbon's pan held so a dropped
    section's rows came in at their old place under the rows below. The moment a carry starts (`carryBegins`) the day
    pan fails, and the ribbon's pan stops waiting.

## Done when

- The cases in `2026-11-08-motion-audit/` re-measured with the same samplers show no jump (no one-frame move above 2 px
  that is not a transition, no node recreated for a task that stayed, no double copy) on the desktop, the phone view and
  the simulator, light and dark.
- `npm test`, `npm run build`, `npm run test:apple` green; `tests/architecture.test.ts`, `tests/uiDecides.test.ts` and
  `tests/styles.test.ts` untouched in strictness.
- `docs/plugin/` updated where a behaviour Max sees changed.
