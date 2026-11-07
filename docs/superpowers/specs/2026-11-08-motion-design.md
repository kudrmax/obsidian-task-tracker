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

## Done when

- The cases in `2026-11-08-motion-audit/` re-measured with the same samplers show no jump (no one-frame move above 2 px
  that is not a transition, no node recreated for a task that stayed, no double copy) on the desktop, the phone view and
  the simulator, light and dark.
- `npm test`, `npm run build`, `npm run test:apple` green; `tests/architecture.test.ts`, `tests/uiDecides.test.ts` and
  `tests/styles.test.ts` untouched in strictness.
- `docs/plugin/` updated where a behaviour Max sees changed.
