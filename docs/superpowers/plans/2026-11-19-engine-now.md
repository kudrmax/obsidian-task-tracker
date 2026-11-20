# The engine, now (lead's plan, 2026-11-19)

Spec: [`../specs/2026-11-18-ui-engine.md`](../specs/2026-11-18-ui-engine.md). What was tried and why: [`../specs/ui-standard-stack/stage0.md`](../specs/ui-standard-stack/stage0.md). The lead reads both before proposing an approach or answering «is X done»; every agent brief links them.

## Rules of the work (Max)

- One small step at a time; each step goes to Max's stand and waits for his word before the next. Never a whole feature at once.
- Agents build and check; the lead briefs, reads reports, talks product with Max.
- A step is on the stand only after a check in the test Obsidian (phone and desktop, light and dark).

## Where things are

| Branch | What | State |
|---|---|---|
| `ui-calendar` | E3, the calendar, with Max's fixes (zoom at the pointer, the day's bounds, the all-day band, events not covering each other's titles, the opaque dashed place, event title hits, focus ring) | on Max's stand at 1aa5093f (flat cards) |
| `ui-ribbon` | E2 work in progress: the ribbon's columns, day slide, Undo, built in one piece by an agent; merged with the calendar; the all-day clip fixed | saved, not on the stand; Max: too many wrong details, built at once |

The ribbon on the stand («The whole screen») is stage 0's pager (round six, ~95 % on Max's swipes). CSS scroll-snap, Embla and Lethargy failed in stage 0 (stage0.md, item 12 and «The ribbon on a real trackpad»).

## Max's decision on the ribbon (2026-11-19, supersedes stage 0 round six)

«Обычное листание колонок, как везде… как фотки в галерее. Я могу остановить палец на середине, но оно в итоге долистнется или не долистнется… что пальцем по экрану, что пальцем по трекпаду — абсолютно одно и то же действие.» So: one behaviour for the finger on the phone and two fingers on the trackpad — the columns follow the fingers 1:1, can be held mid-way, and on release settle to the nearest place or one place on by the swipe's speed (never two); the same feel at any speed. Round six's «trackpad as a pager, no in-between states» is withdrawn; Max now rates the stand's pager as not for production. Built in slices, each shown to Max: first the three stops as plain columns with this behaviour, nothing else — **slice 1 approved by Max on 2026-11-19 («Норм!»)**, branch `ui-ribbon-follow` (Decision 64). Slice 2 (the days past the calendar) is committed (bbd55fac), not shown. **Paused by Max (2026-11-19 evening):** «с листанием есть критичные проблемы… вернёмся позже» — ask him for them first when he comes back.

## Open problems, in order

1. **Tasks stuck together on the calendar.** A card lying on another card doesn't read as separate. Rejected: hairline ring, tight shadow, tone of the upper card, wide shade all round (it erased the card's edge on the ground). In work: a shade only on the card underneath, only where another card lies on it (Decision 60, rewritten).
2. **The engine feels jerky** (Max): the swipes turn too much, headers and sections jump, animations unpleasant. The frame audit (scratchpad `jank/`, 192 runs) ranked them; fixed one at a time, each to the stand, in this order:
   1. A quick drop: rows still parting snap the rest of the way in one frame — headers and cards jump 22–37 px. Fixed as Decision 61 and **reverted** the same day (ebc3befd): Max hadn't reported it, and the rework made dragging worse (the place lagged behind the pointer in its own column). An audit item is not a bug until Max confirms it is what he sees.
   2. A carried card leaving a list: the gap shuts at once.
   3. Phone: turning the day at the calendar swings the ribbon the wrong way; every flick hitches at release.
   4. Lifting a task with subtasks: rows below jump 148 px; at the drop the subtasks pop in over other cards.
   5. Hold and let go without moving: the plate pops into the card.
   6. The calendar's blocks wiggle while a card passes over a stack.
   7. Zoom across the stacking threshold: blocks change width 18 px in one frame.
   8. Phone: long frames (41–116 ms) while carrying onto the calendar.
   Clean: slow drags, cancel, resize, new task by press, scrolling, desktop trackpad strokes; no double triggers.
3. **Swipes, step by step on stage 0's pager.** What to do with `ui-ribbon` is decided after the audit: its pieces come in one per step, each shown to Max.
4. Tasks covering event titles on the calendar: Max's question, parked.

## In work while Max is away (2026-11-19 evening)

- E4, the task menu and the new-task field, carried over from the plugin and the design exactly, in slices on branch `ui-menu` (from `ui-ribbon-follow`), each its own commit for Max to review later; not deployed to his stand.

## Max's review of the stand (2026-11-20)

Screenshots in [`2026-11-20-review/`](2026-11-20-review/). Max's screenshots still show «Description»: taken before 290bf71a (Notes) reached his stand.

| # | Max's remark | Kind | State |
|---|---|---|---|
| 1 | The menu splits in pieces around the task's title (`1-menu-gaps.png`); he wants one piece. Then: what if it doesn't fit the phone's screen — what do apps usually do | decided by Max: iOS-style — title on top, the menu one piece under it, the block moves up when there's no room, the menu scrolls inside when taller than the screen; animations must be beautiful | **accepted** by Max |
| 2 | Between two groups three stripes: grey, black, grey (`2-menu-dividers.png`, `3-divider-closeup.png`). One grey stripe, no black | fix | **accepted** by Max |
| 3 | Subtask leaves the Edit row and stands in one row with First step: both make a subtask | fix (core's layout, then engine) | **accepted** by Max |
| 4 | Tasks lying on each other on the calendar | — | **accepted** |
| 5 | Drop between calendar and list jerks: the card grows part way, stops (red mark in `5-drop-stops-short.png`), then finishes. Both ways. Reported about five times | bug, root cause | **accepted** by Max |
| 6 | «Переезд» carried to the calendar turns into «Упаковать книги» | bug: mocks or real | **accepted** by Max |
| 7 | Dashed place filled only on the calendar | — | **accepted** |
| 8 | Double click: the menu flashes, then rename. Single and double click must be told apart; double click with the menu open must rename too | fix | double click removed by Max for now (Decision 123); **open** |
| 9a | Inline notes in the menu: Enter closes, Shift+Enter adds a strange indent (like spaces); no proper new line | fix | **accepted** by Max |
| 9b | Notes look different in three places (menu inline, full screen, the field); one look, variants shown to Max before building | discuss, variants as boards | **next**: variants as pictures, a new line in notes on the phone included |
