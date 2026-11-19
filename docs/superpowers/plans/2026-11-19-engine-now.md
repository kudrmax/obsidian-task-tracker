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

## Open problems, in order

1. **Tasks stuck together on the calendar.** A card lying on another card doesn't read as separate. Rejected: hairline ring, tight shadow, tone of the upper card, wide shade all round (it erased the card's edge on the ground). In work: a shade only on the card underneath, only where another card lies on it (Decision 60, rewritten).
2. **The engine feels jerky** (Max): the swipes turn too much, headers and sections jump, animations unpleasant. In work: a read-only frame audit of every interaction on every step, ranked. Then fixes one at a time, each to the stand.
3. **Swipes, step by step on stage 0's pager.** What to do with `ui-ribbon` is decided after the audit: its pieces come in one per step, each shown to Max.
4. Tasks covering event titles on the calendar: Max's question, parked.
