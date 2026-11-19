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

«Обычное листание колонок, как везде… как фотки в галерее. Я могу остановить палец на середине, но оно в итоге долистнется или не долистнется… что пальцем по экрану, что пальцем по трекпаду — абсолютно одно и то же действие.» So: one behaviour for the finger on the phone and two fingers on the trackpad — the columns follow the fingers 1:1, can be held mid-way, and on release settle to the nearest place or one place on by the swipe's speed (never two); the same feel at any speed. Round six's «trackpad as a pager, no in-between states» is withdrawn; Max now rates the stand's pager as not for production. Built in slices, each shown to Max: first the three stops as plain columns with this behaviour, nothing else — **slice 1 approved by Max on 2026-11-19 («Норм!»)**, branch `ui-ribbon-follow` (Decision 64). Next slice: the days past the calendar (on into tomorrow, back to today) with the same gesture.

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
