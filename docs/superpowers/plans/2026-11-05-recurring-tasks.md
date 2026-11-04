# Recurring Tasks (#27) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A task with a `🔁` field: after Done or Won’t do, one copy with the next date takes its place; the repeat is set from the quick-entry bar, the desktop capsule and the task menu; Stop ends it.

**Architecture:** `Repeat` is a pure domain value (parse, format, `next`). It is a field of `Task` sliced from the line like the due date. The copy is made by one normalization rule, so Done, Won’t do from the menu and a `[x]` typed in Markdown take the same path and the same single write (one undo step). The UI reads a plain `RepeatRule` from `contracts.ts` and draws one repeat panel used by the bar, the capsule and the menu.

**Tech Stack:** TypeScript, Obsidian API, vitest, esbuild.

**Spec:** `docs/superpowers/specs/2026-11-04-recurring-tasks-design.md`; look: `docs/design/README.md`, section «Повторы», boards `docs/design/canvas/Repeat27*.dc.html`.

## Global Constraints

- Branch `recurring`, worktree `obsidian-task-tracker-recurring`. `ui` imports `application` only; `contracts.ts` and `settings.ts` change in this branch only.
- Line field: emoji from settings `repeatMarker`, default `🔁`; grammar exactly as spec §3.1 (`every [N] days|weeks on Mon, Wed|months on the 5th` `[from YYYY-MM-DD]` / `… when done`; `every 1 week` is written `every week`; `from` only when N > 1 and kind is schedule).
- Unparseable repeat text stays part of the task text, the line is written back byte for byte.
- The copy never has a slot or time; subtasks reset to `[ ]` without their own due dates and slots.
- Weeks start on Monday. A month day past the month’s end falls on its last day.
- `styles.css`: every value through a `--tc-…` token in the `body {}` block (and its light twin only for colours); `tests/styles.test.ts` and `DESIGN` in `src/ui/design.ts` must stay green.
- UI copy in English, as in the boards: «Repeat», «Schedule», «After done», «Every», «days/weeks/months», «Mon…Sun», «On the 5th», «Remove repeat», «Stop», «Stop “name”?», «Cancel».
- No timeline mark: the boards draw the mark in the list only (my call, spec §4.3 updated in Task 1).
- Before calling the work done: `npm test`, `npm run build`, `npx tsc --noEmit` green; visual check in the test Obsidian (port 9333), phone 390×844 with `app.emulateMobile(true)` and desktop, dark and light. Never `~/Obsidian`.

## Review Focus

1. A repeat field written by hand before the due date (`Зал 🔁 every week on Mon 📅 2026-11-09`) — must parse and write back unchanged (Task 2 test `parses a repeat before the due date`).
2. Done twice on two devices / normalize run twice — the second run must not make a second copy (Task 3 test `is idempotent`).
3. A recurring task inside a Now section «Morning» — its copy goes to Soon’s «Morning», then on its day into Now’s «Morning» (Task 3 test `keeps the section name`).
4. A Done on a subtask that has a repeat written by hand — subtasks never repeat: no copy, field left as is (Task 3 test `ignores a subtask's repeat`).
5. Quick entry with repeat set, then Enter — the new task is written with the field and, being scheduled, gets its first date (Task 4 test `createInPlace with a schedule gives the first day`).

---

### Task 1: `Repeat` domain value

**Files:**
- Create: `src/domain/Repeat.ts`
- Test: `tests/domain/Repeat.test.ts`
- Modify: `docs/superpowers/specs/2026-11-04-recurring-tasks-design.md` §4.3 (mark in the list only)

**Interfaces:**
- Produces:
  ```ts
  export type RepeatUnit = "day" | "week" | "month";
  /** 0 = Monday … 6 = Sunday. */
  export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
  export interface RepeatRule {           // plain data; contracts re-exports it
    readonly kind: "schedule" | "afterDone";
    readonly every: number;               // ≥ 1
    readonly unit: RepeatUnit;
    readonly days: readonly Weekday[];    // schedule + week only, sorted, non-empty; else []
    readonly dayOfMonth: number | null;   // schedule + month only, 1…31; else null
    readonly from: LocalDate | null;      // schedule with every > 1 only; else null
  }
  export class Repeat {
    static parse(text: string): Repeat | null;     // text after the emoji
    static of(rule: RepeatRule): Repeat;
    readonly rule: RepeatRule;
    format(): string;                               // inverse of parse
    /** Spec §3.2: strictly after max(today, taskDate); afterDone: today + N. */
    next(taskDate: LocalDate | null, today: LocalDate): LocalDate;
    /** Spec §3.5: first matching day ≥ today for a schedule, null for afterDone. */
    first(today: LocalDate): LocalDate | null;
    /** The same rule anchored: `from` set to `date` when every > 1, else unchanged. */
    anchoredAt(date: LocalDate): Repeat;
  }
  ```

- [ ] **Step 1: Write the failing tests**

```ts
const cases = [
  "every week on Mon, Wed, Fri",
  "every 3 weeks on Fri from 2026-11-06",
  "every month on the 5th",
  "every 2 months on the 31st from 2026-10-31",
  "every 3 days from 2026-11-04",
  "every day",
  "every 3 weeks when done",
  "every month when done",
];
it.each(cases)("round-trips %s", (t) => expect(Repeat.parse(t)!.format()).toBe(t));
it.each(["every", "every 0 days", "every week on Funday", "every month on the 32nd", "every 2 weeks on Fri", "weekly", "every week on Fri from 2026-11-06"])
  ("rejects %s", (t) => expect(Repeat.parse(t)).toBeNull());
it("ordinals", () => expect(["1st","2nd","3rd","4th","11th","12th","13th","21st","22nd","23rd","31st"].every((o) => Repeat.parse(`every month on the ${o}`))).toBe(true));
it("weekly picks the next chosen day", () => expect(Repeat.parse("every week on Mon, Wed, Fri")!.next("2026-11-05", "2026-11-05")).toBe("2026-11-06"));
it("every 3 weeks keeps its anchor", () => expect(Repeat.parse("every 3 weeks on Fri from 2026-11-06")!.next("2026-11-06", "2026-11-06")).toBe("2026-11-27"));
it("anchor far in the past", () => expect(Repeat.parse("every 3 days from 2020-01-01")!.next(null, "2026-11-05")).toBe("2026-11-07"));
it("31st falls on the 30th", () => expect(Repeat.parse("every month on the 31st")!.next("2026-10-31", "2026-10-31")).toBe("2026-11-30"));
it("february", () => expect(Repeat.parse("every month on the 30th")!.next("2027-01-30", "2027-01-30")).toBe("2027-02-28"));
it("over the year", () => expect(Repeat.parse("every week on Mon")!.next("2026-12-28", "2026-12-28")).toBe("2027-01-04"));
it("early done counts from the due date", () => expect(Repeat.parse("every week on Mon")!.next("2026-11-09", "2026-11-08")).toBe("2026-11-16"));
it("after done counts from today", () => expect(Repeat.parse("every 3 weeks when done")!.next("2026-11-01", "2026-11-05")).toBe("2026-11-26"));
it("after done months clamp", () => expect(Repeat.parse("every month when done")!.next(null, "2027-01-31")).toBe("2027-02-28"));
it("first: schedule today or later", () => expect(Repeat.parse("every week on Thu")!.first("2026-11-05")).toBe("2026-11-05"));
it("first: after done has none", () => expect(Repeat.parse("every week when done")!.first("2026-11-05")).toBeNull());
it("anchoredAt sets from only for N > 1", () => {
  expect(Repeat.parse("every 2 weeks on Fri from 2026-01-02")!.anchoredAt("2026-11-06").format()).toBe("every 2 weeks on Fri from 2026-11-06");
  expect(Repeat.parse("every week on Fri")!.anchoredAt("2026-11-06").format()).toBe("every week on Fri");
});
```

- [ ] **Step 2: Run** `npx vitest run tests/domain/Repeat.test.ts` — FAIL, module not found.
- [ ] **Step 3: Implement `src/domain/Repeat.ts`.** Date arithmetic through the helpers in `src/domain/LocalDate.ts` (add `addDays`, `addMonths(date, n)` with last-day clamp, `weekdayOf` there if missing, with their own tests in `tests/domain/LocalDate.test.ts`). `next` for a schedule walks candidates from the anchor (`from`, else the task date, else today) by whole cycles, never day by day over years: jump `k = floor(diff / cycle)` first.
- [ ] **Step 4: Run** the test file — PASS. Run `npx vitest run tests/domain` — PASS.
- [ ] **Step 5: Spec** §4.3: replace «в списке и на таймлайне» with «в списке; на таймлайне метки нет — доски её не рисуют».
- [ ] **Step 6: Commit** `Recurring tasks: the Repeat rule — parse, write, next date`.

### Task 2: The field in the line, the task and the settings

**Files:**
- Modify: `src/domain/Task.ts` (`repeat: Repeat | null`), `src/domain/TaskLine.ts` (`Markers.repeat?: string`, slicer, `formatTaskLine`), `src/domain/operations.ts:9` (`newTask` default `repeat: null`), `src/settings.ts` (`repeatMarker: string`, default `"🔁"`), `src/application/TaskServiceImpl.ts` (`parse` passes `repeat: settings.repeatMarker`; `readingOf` includes it), `src/ui/SettingsTab.ts` (a text field «Repeat marker» next to the due-date and slot markers, same pattern)
- Test: `tests/domain/TaskLine.test.ts`, `tests/infrastructure/PluginSettings.test.ts`

**Interfaces:**
- Consumes: `Repeat.parse`, `Repeat.format` (Task 1).
- Produces: `Task.repeat: Repeat | null`; `Markers.repeat?: string`; `TaskCalendarSettings.repeatMarker`.

- [ ] **Step 1: Failing tests** in `TaskLine.test.ts` with markers `{ dueDate: "📅", slot: "⏰", repeat: "🔁" }`:
  - `parses a repeat after the due date`: `- [ ] Зал 📅 2026-11-09 🔁 every week on Mon, Wed, Fri` → text `Зал`, due `2026-11-09`, `repeat.format()` = `every week on Mon, Wed, Fri`.
  - `parses a repeat before the due date`: `- [ ] Зал 🔁 every week on Mon 📅 2026-11-09` → same fields; `formatTaskLine` of an unchanged task writes the line back byte for byte (TaskDocument keeps the raw line for untouched tasks; assert through `TaskDocument.parse(...).serialize()`).
  - `keeps an unknown repeat as text`: `- [ ] Зал 🔁 weekly` → text `Зал 🔁 weekly`, repeat null.
  - `writes the field last`: a task with due and repeat formats as `… 📅 2026-11-09 🔁 every week on Mon`.
  - all six spec §3.1 lines round-trip through parse → format.
  - `PluginSettings.test.ts`: missing `repeatMarker` loads as `🔁`.
- [ ] **Step 2: Run** `npx vitest run tests/domain/TaskLine.test.ts` — FAIL.
- [ ] **Step 3: Implement.** In `FieldSlicer`, a third regex `(?:^|\s+)<marker>\s+(.+?)$` tried after slot and due in the same loop; a match whose capture `Repeat.parse` rejects ends the loop (like an invalid date). The slicer cache key includes the repeat marker. `formatTaskLine` appends ` <marker> <rule>` after due and slot. Fix every `Task` literal the compiler then flags (tests, `tests/fakes`).
- [ ] **Step 4: Run** `npx tsc --noEmit && npx vitest run` — PASS.
- [ ] **Step 5: Commit** `Recurring tasks: the 🔁 field in the task line`.

### Task 3: The copy — normalization rule and operations

**Files:**
- Create: `src/domain/recurrence.ts`
- Modify: `src/domain/normalize.ts:160` (rule runs right before `closedToDone`), `src/domain/TaskDocument.ts` (`freshChildren`), `src/domain/operations.ts` (`setRepeat`, `stop`)
- Test: `tests/domain/recurrence.test.ts`, `tests/domain/normalize.test.ts`, `tests/domain/operations.test.ts`

**Interfaces:**
- Consumes: `Task.repeat`, `Repeat.next/first/anchoredAt`.
- Produces:
  ```ts
  // recurrence.ts
  /** Spec §3.3: a closed top-level task with a repeat in Inbox/Backlog/Now/Soon loses its field; its copy goes to the end of Soon, in the section of the same name. */
  export function recurClosed(doc: TaskDocument, today: LocalDate, boundary: DayBoundary): TaskDocument;
  // TaskDocument
  /** The entry's child lines with every subtask `[ ]` and without its due date and slot; description lines as they are. */
  freshChildren(entry: TaskEntry): readonly string[];
  // operations.ts
  /** Spec §3.5: sets or replaces the rule; a schedule on an undated task gives it `first(today)` and anchors there; on a dated task anchors at its due date. */
  export function setRepeat(doc: TaskDocument, entry: TaskEntry, rule: RepeatRule | null, today: LocalDate): TaskDocument;
  /** Spec §3.4 Stop: the field goes, the task is done; no copy. */
  export function stop(doc: TaskDocument, entry: TaskEntry): TaskDocument;
  ```

- [ ] **Step 1: Failing tests** (`recurrence.test.ts` builds documents from Markdown with the five sections, today `2026-11-05`):
  - `done makes one copy in Soon`: Now `- [x] Зал 🔁 every week on Mon, Wed, Fri` → after `normalize`: Done has `- [x] Зал` (no field); Soon ends with `- [ ] Зал 📅 2026-11-06 🔁 every week on Mon, Wed, Fri`.
  - `won't do makes the copy too`: `[-]` → Done `- [-] Зал`, the same copy.
  - `after done counts from today`: `- [x] Постричься 📅 2026-11-01 🔁 every 3 weeks when done` → copy due `2026-11-26`.
  - `keeps the section name`: Now `### Morning` holding the closed task → Soon gets `### Morning` with the copy; with today moved to the copy’s day, `normalize` puts it in Now’s `### Morning`.
  - `copy keeps priority, description, subtasks reset`: task with a priority prefix, a description line and subtasks `[x] A 📅 2026-11-03` and `[/] B ⏰ 2026-11-05 10:00` → copy children `- [ ] A`, `- [ ] B`, the description line unchanged; Done keeps the original children.
  - `is idempotent`: `normalize(normalize(doc)) === normalize(doc)` (same serialize).
  - `ignores a subtask's repeat`: a closed subtask with a field → no copy, field stays.
  - `ignores Done`: a `[x]` task with a field already in Done → untouched.
  - operations: `setRepeat on an undated Inbox task` with schedule Thu → due `2026-11-05`, normalize moves it to Now; `setRepeat afterDone on an undated task` → no due date, stays in Inbox; `setRepeat on a dated task` with `every 2 weeks` → field `from <its due>`; `setRepeat null` removes the field; `stop` → `[x]`, no field, after normalize no copy.
- [ ] **Step 2: Run** `npx vitest run tests/domain` — FAIL.
- [ ] **Step 3: Implement.** `recurClosed` loops like the other rules (find one, rewrite, again): take the copy’s `next(dateOf(task), today)` where `dateOf` = due, else `boundary.dayOfSlot(slot)`, else null; replace the original with `repeat: null`; insert `newTask` with text, priority, children `freshChildren`, `dueDate: next`, `repeat` unchanged at `{ endOf: i }` of Soon’s group named like the original’s (`addGroup("soon", name, groups.length)` when missing; `null` group → `"end"` of No section). The rule needs the Soon section; without it, skip.
- [ ] **Step 4: Run** `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `Recurring tasks: Done and Won't do leave the next copy`.

### Task 4: Contracts and the service

**Files:**
- Modify: `src/application/contracts.ts`, `src/domain/queries.ts:56` (`toItem`), `src/application/TaskServiceImpl.ts`, `src/domain/operations.ts` (`createInPlace`, `placeTask` take the repeat), `tests/fakes/DemoTaskService.ts`
- Test: `tests/application/TaskServiceImpl.test.ts`

**Interfaces:**
- Consumes: `setRepeat`, `stop` (Task 3).
- Produces in `contracts.ts`:
  ```ts
  export type { RepeatRule, RepeatUnit, Weekday } from "../domain/Repeat";
  TaskItem.repeat: RepeatRule | null;
  TaskDraft.repeat?: RepeatRule | null;          // undefined: unchanged
  TaskService.createInPlace(text, priority, place, repeat?: RepeatRule | null): Promise<void>;
  TaskService.setRepeat(key: TaskKey, rule: RepeatRule | null): Promise<void>;   // null removes
  TaskService.stop(key: TaskKey): Promise<void>;
  ```
  (No separate `removeRepeat`: `setRepeat(key, null)`; spec §5 updated in this task.)

- [ ] **Step 1: Failing tests** in `TaskServiceImpl.test.ts` (existing in-memory store and history fakes):
  - `setStatus done on a recurring task is one write and one undo step`: after `setStatus(done)` the file has the Done line and the copy; `undo()` restores the file before both.
  - `stop closes without a copy`.
  - `setRepeat writes the field`; `setRepeat null removes it`.
  - `createInPlace with a schedule gives the first day` (list place in Inbox, rule weekly Thu) → the task is in Now with due today and the field.
  - `dayView items carry the rule`: `item.repeat` deep-equals the parsed rule.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**; every mutating call goes through `mutate` as now. `DemoTaskService` gets the same methods on its in-memory model. **Step 4: Run** `npx tsc --noEmit && npx vitest run` — PASS.
- [ ] **Step 5: Commit** `Recurring tasks: repeat in the task service`.

### Task 5: The repeat panel and its label

**Files:**
- Create: `src/ui/repeat/RepeatPanel.ts`, `src/ui/repeat/repeatLabel.ts`
- Modify: `src/ui/kit/icons.ts` (`repeat`, `stop`, `removeRepeat` paths from README «Повторы»), `styles.css`, `src/ui/design.ts` if a size is read in code
- Test: `tests/ui/RepeatPanel.test.ts`, `tests/ui/repeatLabel.test.ts`

**Interfaces:**
- Consumes: `RepeatRule` from contracts.
- Produces:
  ```ts
  export interface RepeatPanelOptions {
    readonly rule: RepeatRule | null;
    /** The day new rules start from: the task's due date, else today (weekday and month day defaults). */
    readonly day: LocalDate;
    readonly onChange: (rule: RepeatRule) => void;   // every tap, applied at once
    readonly onRemove: (() => void) | null;          // null: no Remove repeat row
  }
  export function repeatPanel(parent: HTMLElement, opts: RepeatPanelOptions): void;
  /** The menu row's value: weeks → null (the row draws the M…S letters), else "Every 3 days", "On the 5th", "Every 2 months on the 5th", "Every 3 weeks after done". */
  export function repeatValue(rule: RepeatRule): string | null;
  ```
- Defaults when `rule` is null: schedule, every 1, week, `days = [weekday of day]`. Switching to months sets `dayOfMonth` = day of `day`; − is disabled at 1; the last chosen weekday can’t be unticked.

- [ ] **Step 1: Failing tests:** rendering with `rule: null` shows Schedule selected, `1`, weeks, the weekday of `day` pressed; tapping + calls `onChange` with `every: 2`; tapping Wed adds it, sorted; tapping the only pressed day does nothing; tapping months shows «On the 5th» for `day 2026-11-05` and hides the week row; After done hides both rows; Remove repeat is present only with `onRemove`. `repeatValue` cases as in the signature comment.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** with the segmented-switch and button kit already used by panels (`Button`, the `tc-seg` look); sizes, colours and radii per README «Повторы», new values as `--tc-repeat-…` tokens. **Step 4: Run** `npx vitest run tests/ui tests/styles.test.ts` — PASS.
- [ ] **Step 5: Commit** `Recurring tasks: the repeat panel`.

### Task 6: Menu — Stop tile, its question, the Repeat row

**Files:**
- Modify: `src/ui/menu/TaskMenu.ts` (`statusTiles`, `editRows`, `MenuActions`, `showMenu`, `askGroup`, new `showRepeat`), `src/ui/menu/MenuPanel.ts` (a row value of weekday letters), `src/ui/TaskCalendarView.ts` (the actions: `setRepeat`, `stop`), `styles.css`
- Test: `tests/ui/TaskMenu.test.ts`

**Interfaces:**
- Consumes: `repeatPanel`, `repeatValue` (Task 5); `TaskService.setRepeat/stop` (Task 4).
- Produces: `MenuActions.setRepeat(rule: RepeatRule | null): Promise<void>`, `MenuActions.stop(): Promise<void>`; `StatusTileId` gains `"stop"`; `EditRowId` gains `"repeat"`; `Asking` gains `"stop"`.

- [ ] **Step 1: Failing tests:** `statusTiles` of a recurring item → Done, In progress, Won’t do, Stop (one row: `is-status` group has 4 tiles in one row); of a plain item → 3. Stop asks «Stop “Зал”?» with Cancel and Stop, the confirm calls `actions.stop`; Enter confirms. `editRows` has Repeat after Add description (or Rename when there is a description) for a top-level open task, none for a subtask (`parentText !== null`) or a done task; weekly rule renders seven letters `M T W T F S S` with the chosen ones `.is-on`. Tapping Repeat replaces the panel with `repeatPanel` (back to the menu as Pick a date does); a change calls `actions.setRepeat` and the menu stays.
- [ ] **Step 2–4:** run (FAIL), implement, run `npx vitest run` (PASS). Status tiles of four: same tile class, the row lays four out evenly (CSS grid of `--tc-status-cols`), labels 13 px fit at 300 wide per the board.
- [ ] **Step 5: Commit** `Recurring tasks: Stop and Repeat in the task menu`.

### Task 7: Quick entry — the bar button and the capsule

**Files:**
- Modify: `src/ui/quick/QuickBar.ts` (`QuickBarState.repeat: RepeatRule | null`, `repeatable: boolean`, `PanelKind` gains `"repeat"`, button between flag and place), `src/ui/quick/QuickEntry.ts` / `QuickEntryController.ts` (entry state carries the rule; `createInPlace(text, priority, place, repeat)`; Rename passes it in `TaskDraft.repeat`), `styles.css`
- Test: `tests/ui/QuickBar.test.ts`, `tests/ui/QuickEntryController.test.ts`

**Interfaces:**
- Consumes: `repeatPanel` (Task 5); `createInPlace(..., repeat)`, `TaskDraft.repeat` (Task 4).
- Produces: `QuickBarDeps.onRepeat(rule: RepeatRule | null): void`.

- [ ] **Step 1: Failing tests:** the bar shows `.tc-bar-repeat` between `.tc-bar-flag` and `.tc-bar-place`; hidden when `repeatable` is false (subtask field, calendar field); `.is-set` with a rule; tap opens the repeat panel above the bar (same `Panel.inside` as priority), a change calls `onRepeat` and keeps it open; Remove repeat clears. Controller: typing a task, choosing weekly Thu, Enter → `createInPlace` called with the rule; Rename of a recurring task opens with its rule set and saves it through `edit` with `repeat`.
- [ ] **Step 2–4:** run (FAIL), implement, run `npx vitest run` (PASS). The desktop capsule is the same `QuickBar` in its `is-desk` mode: verify the button appears there in the existing desk tests.
- [ ] **Step 5: Commit** `Recurring tasks: the repeat button in the bar and the capsule`.

### Task 8: The mark on the card

**Files:**
- Modify: `src/ui/TaskCard.ts:40-44`, `styles.css` (`.tc-due-top`, `.tc-due-repeat`, tokens `--tc-due-repeat-size: 10px`, `--tc-due-repeat-gap: 2px`, stroke 2.8)
- Test: `tests/ui/TaskCard.test.ts` (create if absent)

- [ ] **Step 1: Failing tests:** a recurring item due `2026-11-05` shown on another day → `.tc-due` has `.tc-due-top` holding `.tc-due-day` «5» then `.tc-due-repeat` (svg), and `.tc-due-mon` under it; a recurring item due on the shown day → `.tc-due` with only `.tc-due-repeat`; a plain item → as before (no `.tc-due-top` change in markup the timeline lift relies on: keep `.tc-lifted.is-whole .tc-due` margin rule working).
- [ ] **Step 2–4:** run (FAIL), implement, run `npx vitest run` (PASS). The icon takes the card’s meta colour (priority cards: the level’s meta).
- [ ] **Step 5: Commit** `Recurring tasks: the repeat mark beside the day`.

### Task 9: Check in the test Obsidian and the docs

- [ ] **Step 1:** `npm test && npx tsc --noEmit && npm run build` — all green.
- [ ] **Step 2:** Copy `main.js`, `manifest.json`, `styles.css` into the test vault’s `.obsidian/plugins/task-calendar/` (instance on port 9333, reuse it), reload the plugin.
- [ ] **Step 3:** Phone (390×844, `app.emulateMobile(true)`), dark and light: set weekly Mon/Wed/Fri from the bar, Enter; the card shows the mark; Done → the copy appears with the next day; Won’t do → copy; Stop asks, closes, no copy; menu Repeat row letters; panel months «On the …»; After done. Screenshots through CDP compared with `Repeat27Mark2`, `Repeat27PanelAll`, `Repeat27Menu`.
- [ ] **Step 4:** Desktop window, dark and light: the capsule button and panel against `Repeat27Desk`.
- [ ] **Step 5:** Fix what differs, back to Step 1. Commit `Recurring tasks: fixes from the visual check`.
