# Priorities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A task can carry a priority level: a prefix word at the start of its text (`- [ ] p1 Позвонить в банк`) that tints its card with the level's colour; it is set from the task menu and the task screen, and the levels are edited in settings.

**Architecture:** The domain reads the prefix off the text like the due date and slot fields (only prefixes from settings count) and writes it back first. The application maps a prefix to its level (`PriorityLevel`: prefix + colour) for the UI. The UI marks a tinted element with `data-priority="<colour>"`; styles.css turns that into the colour tokens.

**Tech Stack:** TypeScript, Obsidian API, vitest.

**Spec:** `docs/design/README.md`, section «Приоритеты» (wins), `docs/superpowers/specs/2026-10-30-task-calendar-design.md` §4.2 «Приоритет»; boards `docs/design/canvas/ScreenPriority*.dc.html`, `ScreenSheetPriority.dc.html`, `PrioritySettings.dc.html`.

## Global Constraints

- Colours: fixed set `red, orange, yellow, green, teal, blue`; values are the README table, tokens `--tc-priority-<colour>` (dot) and `--tc-priority-<colour>-card` (card) in `body`, light values in `body.theme-light`.
- Defaults: `[{ prefix: "p1", color: "red" }, { prefix: "p2", color: "orange" }]`.
- No sorting by priority anywhere.
- `ui` imports `application` (and `src/settings.ts` for types), never `domain`.
- styles.css component rules read only `var(--tc-…)`; `npm test` includes tests/styles.test.ts.
- A prefix counts only when non-empty and without whitespace; a line that is only the prefix is plain text.

## Review Focus

- A level removed from settings: its prefix stays in the text as a word and the line is written back unchanged.
- Rename on the task screen of a prioritised task: the prefix must survive Save (the title shows no prefix).
- A task already carrying a prefix, set to another level from the menu: one prefix, not two (`p2 X`, not `p2 p1 X`).
- Two levels with the same prefix: the first one wins, no crash.
- A line edited by hand to `- [ ] p1` alone: text "p1", no priority.

---

### Task 1: Domain reads and writes the prefix

**Files:**
- Modify: `src/domain/Task.ts`, `src/domain/TaskLine.ts`, `src/domain/operations.ts`, `src/domain/queries.ts`
- Test: `tests/domain/TaskLine.test.ts`, `tests/domain/operations.test.ts`, `tests/domain/queries.test.ts`, `tests/domain/TaskDocument.test.ts` (Markers constant only)

**Interfaces:**
- Produces: `Task.priority: string | null` (the prefix); `Markers.priorities: readonly string[]`; `ops.setPriority(doc, entry, priority: string | null): TaskDocument`; `placeTask` takes `draft.priority`; `toItem(entry, levelOf: (prefix: string) => PriorityLevel | null): TaskItem`.

- [ ] **Step 1: Failing tests** — `M = { dueDate: "📅", slot: "⏰", priorities: ["p1", "p2"] }`.
  - `parseTaskLine("- [ ] p1 Позвонить 📅 2026-11-03", M).task` → `{ priority: "p1", text: "Позвонить", dueDate: "2026-11-03" }`; `formatTaskLine` of it gives the line back.
  - `"- [ ] p3 X"` → `{ priority: null, text: "p3 X" }`; `"- [ ] p1"` → `{ priority: null, text: "p1" }`; `"- [ ] p1X"` → priority null.
  - `setPriority` on `p1 X` with `"p2"` serialises `- [ ] p2 X`; with `null` → `- [ ] X`.
  - `placeTask` with `draft.priority: "p1"` creates `- [ ] p1 X`; editing a `p1` task with `priority: "p1"` and new text keeps one prefix.
  - `toItem` returns the level the lookup gives, `null` without a prefix.
- [ ] **Step 2:** `npm test -- tests/domain` → the new tests fail.
- [ ] **Step 3: Implement.** `FieldSlicer` (or a step after it) splits the first word off the remaining text when it is in `markers.priorities` and is followed by whitespace and more text. `formatTaskLine` writes `${priority} ${text}`. `newTask` defaults `priority: null`. `TaskDraft.priority` is added in Task 2's contract change: do that contract line here so it compiles.
- [ ] **Step 4:** `npm test -- tests/domain` → pass.
- [ ] **Step 5: Commit** «Domain: a priority prefix in front of a task's text».

### Task 2: Settings, contracts, service

**Files:**
- Modify: `src/settings.ts`, `src/application/contracts.ts`, `src/application/TaskServiceImpl.ts`, `tests/fakes/DemoTaskService.ts`
- Test: `tests/settings.test.ts`, `tests/application/TaskServiceImpl.test.ts`

**Interfaces:**
- Produces (settings.ts): `type PriorityColor = "red" | "orange" | "yellow" | "green" | "teal" | "blue"`, `PRIORITY_COLORS: readonly PriorityColor[]` in that order, `interface PriorityLevel { prefix: string; color: PriorityColor }`, `TaskCalendarSettings.priorities: readonly PriorityLevel[]`, `usablePrefix(prefix: string): boolean` (non-empty, no whitespace).
- Produces (contracts.ts): `TaskItem.priority: PriorityLevel | null`, `TaskDraft.priority: string | null`, `TaskService.setPriority(key: TaskKey, priority: string | null): Promise<void>`.

- [ ] **Step 1: Failing tests** — `settingsFrom({})` has the two default levels; `settingsFrom({ priorities: [] })` keeps `[]`. Service: file `- [ ] p1 A`, `dayView` item has `priority: { prefix: "p1", color: "red" }`, `text: "A"`; `setPriority(key, "p2")` writes `- [ ] p2 A`; with `priorities: []` in settings the item text is `p1 A`, priority null; duplicate prefixes: the first level wins.
- [ ] **Step 2:** run → fail.
- [ ] **Step 3: Implement.** Parse markers get `settings.priorities.map(l => l.prefix).filter(usablePrefix)`; `toItem` gets a lookup over `settings.priorities` (first match). `DemoTaskService` gains `setPriority` and `priority: null` on its items.
- [ ] **Step 4:** `npm test` and `npx tsc --noEmit` → green.
- [ ] **Step 5: Commit** «Priority levels in settings, priority on items, setPriority».

### Task 3: Tinted cards

**Files:**
- Modify: `styles.css`, `src/ui/TaskCard.ts`, `src/ui/Timeline.ts` (`placeTask`)
- Test: `tests/ui/TaskCard.test.ts`, `tests/ui/Timeline.test.ts`

**Interfaces:**
- Produces: `markPriority(node: HTMLElement, level: PriorityLevel | null): void` in `src/ui/TaskCard.ts` — sets or removes `data-priority`. `fillCard` calls it on the card it fills (list card, float, lifted copy); `Timeline.placeTask` on `.tc-block-card`.

- [ ] **Step 1: Failing tests** — a card for an item with `{ prefix: "p1", color: "red" }` has `dataset.priority === "red"`; without priority no attribute; the timeline block card the same.
- [ ] **Step 2:** run → fail.
- [ ] **Step 3: Implement.** Tokens per the README table in `body` and `body.theme-light`. One rule per colour sets `--tc-priority-fill` and `--tc-priority-ink` from its tokens on `[data-priority="<colour>"]`; `.tc-card[data-priority], .tc-block-card[data-priority], .tc-float[data-priority], .tc-lifted[data-priority]` take `background: var(--tc-priority-fill)`; `.tc-priority-dot` (used in Tasks 4–6) takes `background: var(--tc-priority-ink)`.
- [ ] **Step 4:** `npm test` → green, styles test included.
- [ ] **Step 5: Commit** «A task's card takes its priority's tint».

### Task 4: Menu row and submenu

**Files:**
- Modify: `src/ui/menu/TaskMenu.ts`, `src/ui/menu/MenuPanel.ts`, `src/ui/menu/menuIcons.ts`, `src/ui/TaskCalendarView.ts` (`showMenu`), `styles.css`
- Test: `tests/ui/TaskMenu.test.ts`, `tests/ui/MenuPanel.test.ts`

**Interfaces:**
- Consumes: `markPriority`, `PriorityLevel`, `TaskService.setPriority`.
- Produces: `MenuRowId` gains `"priority"`; `menuRows(item)` puts `priority` between `due` and `rename`, value = prefix; `MenuRowSpec.dot?: PriorityColor` drawn as `.tc-priority-dot` before the value; `MenuIconName` gains `priority` (flag `M5.5 21V4 M5.5 4.5h11.5l-2.5 4.75 2.5 4.75H5.5`) and `check` (`M5 12.5l5 5 9-10.5`); `TaskMenuContext.levels: readonly PriorityLevel[]`; `MenuActions.setPriority(prefix: string | null): Promise<void>`.

- [ ] **Step 1: Failing tests** — `menuRows` second group is `due, priority, rename`, priority value `"p1"` for a p1 item and `""` without; submenu: back row «Priority», one row per level in order, the current one with a check, «Remove priority» only when the item has one; picking `p2` calls `setPriority("p2")`.
- [ ] **Step 2:** run → fail.
- [ ] **Step 3: Implement** `showPriority()` like `showDue()`; sizes per README (dot 10 in rows, 12 in the submenu; check 20, stroke 2.4, accent). The view passes `this.settings.priorities` and `setPriority`.
- [ ] **Step 4:** `npm test` → green.
- [ ] **Step 5: Commit** «Priority in the task menu».

### Task 5: Pills on the task screen

**Files:**
- Create: `src/ui/sheet/PriorityPills.ts`
- Modify: `src/ui/sheet/sheetState.ts`, `src/ui/sheet/TaskSheet.ts`, `src/ui/TaskCalendarView.ts` (`newTaskSheet`, `editSheet`), `styles.css`
- Test: `tests/ui/sheetState.test.ts`

**Interfaces:**
- Produces: `SheetState.priority: string | null`; `initialState(placement, priority)`; `pickPriority(state, prefix | null): SheetState`; `draftOf` carries `priority`; `TaskSheetOptions.levels: readonly PriorityLevel[]`; `class PriorityPills { constructor(parent, levels, onPick: (prefix: string | null) => void); render(state: SheetState): void }` — hidden while `state.pickerOpen`.

- [ ] **Step 1: Failing tests** — `draftOf` after `pickPriority(s, "p1")` has `priority: "p1"`; `initialState(placement, "p2").priority === "p2"`; picking a day keeps the priority.
- [ ] **Step 2:** run → fail.
- [ ] **Step 3: Implement.** Pills under the tiles (and the time row); sizes per README. `.tc-pill` taps keep the keyboard (add to `refocus`'s skip list). The edit sheet starts from `item.priority?.prefix ?? null`; the new sheet from `null`.
- [ ] **Step 4:** `npm test` → green.
- [ ] **Step 5: Commit** «Priority on the task screen».

### Task 6: Settings section

**Files:**
- Modify: `src/ui/SettingsTab.ts`, `styles.css`

- [ ] **Step 1: Implement** `prioritiesGroup(el)`: heading «Priorities»; per level a `Setting` with a text control (prefix), six swatch buttons (`.tc-swatch`, `data-priority`, `.is-on` ring per README) and an extra trash button; «Add priority» adds `{ prefix: "p<n+1>", color: next unused colour or red }`; description per the board. Every change calls `plugin.update({ priorities })` and redraws.
- [ ] **Step 2:** `npm test`, `npm run build` → green.
- [ ] **Step 3: Commit** «Priority levels in settings».

### Task 7: Check in the test Obsidian, release

- [ ] **Step 1:** Build into the test vault (port 9333 instance per CLAUDE.md), phone view 390×844, both themes; compare the list, Soon, timeline, menu, submenu, task screen and settings with the boards' references (`docs/design/reference/ScreenPriority*.png`, `ScreenSheetPriority.png`, `ScreenPrioritySettings.png`).
- [ ] **Step 2:** Merge per the merge-flow (into mvp, ff master, push), bump version, `gh release create`, BRAT update in `~/Obsidian`, check version, close issue #13.
