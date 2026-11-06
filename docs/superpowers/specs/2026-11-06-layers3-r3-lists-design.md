# Layers 3, R3: lists, cards, reveal, timeline — the last decisions out of the UI

The final review after S1–S10 found decisions still made in `src/ui`. Each moves to `application`/`domain` behind
`contracts.ts`, so the Swift frontend only draws. What the user sees and what the file gets stays the same, except where
noted.

## What moves where

1. **List rows.** `ListGroup` gains `rows: readonly ListRow[]` (`{ item, level }`: each task, then its open subtasks a
   level deeper unless collapsed) and `empty` (a section with no task: the No tasks plate). Built in
   `application/sections.ts`. `TaskList` draws `group.rows`; `comingCards` reads them; `ui/listGroups.ts` goes
   (`listGaps`/`gapPlace` were dead copies of `application/nesting`, `isEmptyGroup` restated `ListSection.empty`).
2. **The due corner of a card.** `cardDue(item, day)` (application, re-exported) answers what the card's corner shows:
   the due date unless it is the column's day, and whether the repeat icon stands there; null when nothing does.
   `TaskCard` draws the answer.
3. **Reveal.** `TaskService.reveal(item) → TaskScreen`: a found subtask's tasks unfold, then the screen it shows on.
   The view maps the screen to its places (PLACE_OF_LIST stays: screens are the frontend's).
4. **Today on the timeline.** The now line and the opening scroll ask `DayService.relation(date) === "today"`.
   `sameSlot` moves to `domain/Task.ts` and is re-exported. The timeline draws `DayView.slotted` as given.
   `DayEvents` carries `allDay` and `timed` beside `events`; the all-day rows and the timeline draw them.
   `SearchWindow` no longer trims the query: the service finds nothing for spaces; "No tasks found" shows once
   anything is typed. `SourceStatus.updatedDay: DayRelation | null`: how the last update's day stands to today, by the
   day's start hour (the wording stays in the UI). `listName` takes any `SectionKey`: the Done header and the search
   group headers ask it.
5. **Timeline drop.** `DropTo` `{ kind: "time", start }` replaces `{ kind: "slot", slot }`: the drop gives the snapped
   start minute of the shown day; the service clamps it into the day and derives the duration (a card from the
   timeline keeps its own, one from a list or the plus gets none). `TaskService.dropSpan(item, from, start)` answers the
   same span for the line under the finger.
6. **Backend.** `GROUPED_LISTS` in `domain/Lists.ts` replaces three copies of the grouped-list order. The calendar
   chooser orders titles and accounts by a fixed comparison (lower case, then code points), not `localeCompare`
   without a locale, so Electron and JavaScriptCore agree.
7. **Guard.** `tests/uiDecides.test.ts` also trips on `.status ===/!==`, `.isSubtask`, `.dueDate ===/!==` and
   `=== …today()` checks.

## Behaviour changes

- A source updated after midnight but before the day's start hour reads «today» (it is the plugin's today), where it
  read «yesterday» by the wall clock.
- A search of only spaces shows «No tasks found» instead of an empty window.
- A reveal whose unfolding finds the task changed reports it and stops, instead of moving the screen to a stale place.
