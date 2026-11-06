# Layers 2, S8: the repeat rules in one home

## Why
The repeat panel (`src/ui/repeat/RepeatPanel.ts`) decided which kinds and units are offered, the defaults of a new rule,
how a rule is built and when a tap changes nothing (every ≥ 1, at least one weekday) — a copy of `Repeat.problemWith`.
The task menu took the defaults' day as `item.dueDate ?? today`, the quick bar as the place's day or today, while
`setRepeat` anchors a rule at the task's due date, else its slot's day. `repeatLabel.ts` copied the domain's `ordinal`.
A Swift frontend would have to write all of it again.

## What moves where
- `src/domain/Repeat.ts`
  - `problemWith` becomes public: the one answer to «may this rule be written».
  - `Repeat.anchored(rule, date)`: a schedule of every few units counts from `date` (used by `anchoredAt`, `operations.anchoredRepeat`, the draft).
  - `repeatParts(rule)`: the wording's parts the file grammar is written with — `every` («every 3 weeks»), `on`
    («on Mon, Wed», «on the 5th»; null for days and after done), `days` (a weekly schedule's weekdays, else null),
    `afterDone`. `format()` is built from them; `ordinal` stays private, used once.
- `src/domain/RepeatDraft.ts` (new, pure)
  - `repeatDay(taskDay, today)`: the day a new rule is drawn from — the task's day, else today.
  - `repeatDraft(day, rule | null)`: the panel's state: the kinds and units offered, kind, every, unit, the weekdays and
    month day kept while another unit shows, `detail` (`weekdays` | `monthDay` | null), `can.fewer`, and `rule` (from: null; application anchors it).
    A new rule: Schedule, every 1 week, on the day's weekday; month day = the day's.
  - `editRepeat(draft, change)`: the draft after a tap, or null when the tap changes nothing: the chosen segment again,
    a weekday outside a weekly schedule, or a rule `problemWith` refuses once anchored at the draft's day (every 0, no weekday).
- `src/application/contracts.ts`: `TaskItem.repeatDay` (the day `setRepeat` anchors at, else today: `dayOf(task, boundary) ?? today`);
  runtime re-exports `repeatDraft`, `editRepeat`, `repeatParts`; types `RepeatDraft`, `RepeatChange`, `RepeatKind`, `RepeatParts`.
- `QuickEntrySession.state.repeatDay` uses the same `repeatDay`.
- UI: the panel takes a `draft`, sends each tap to `editRepeat` and draws the answer; the menu passes
  `repeatDraft(item.repeatDay, item.repeat)`, the quick bar `repeatDraft(state.repeatDay, state.repeat)`.
  `repeatLabel` composes the menu row's words from `repeatParts`; the Repeat row's weekday letters come from `parts.days`.

## Behaves exactly as before
Every tap, default, label and written rule — except one fix: a task with a slot and no due date now gets its slot day's
weekday and month day as defaults (before: today's), the day `setRepeat` anchors the rule at.
