# Task Description Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A task's lines without a checkbox are its description: a mark on the card, the start of it over the task menu, a screen to read it and Obsidian's own editor to change it.

**Architecture:** The domain tells a task's description lines from its subtasks' lines and rewrites them as one block under the task. The service exposes it as Markdown on `TaskItem` and takes it back through `setDescription`. The UI draws it only through an injected `MarkdownSurface` (render and edit), so menu and screen stay testable; the Obsidian implementation of that surface lives in one file the view imports.

**Tech Stack:** TypeScript, Obsidian API (`MarkdownRenderer`, internal embeddable editor), vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-11-01-task-description-design.md`, design `docs/design/README.md` § «Описание задачи», boards `docs/design/canvas/Desc*.dc.html`.

## Global Constraints

- `ui` imports `application` only; `obsidian` is imported only by `TaskCalendarView.ts`, `SettingsTab.ts` and the new `src/ui/markdown/ObsidianMarkdown.ts`.
- Every value in a `styles.css` rule is a `--tc-…` token defined in the `body { … }` block; `tests/styles.test.ts` stays green, `DESIGN` in `src/ui/design.ts` agrees with the CSS.
- Description text gets no plugin font, line height, colour or spacing: only Obsidian's `markdown-rendered` styles; the menu panel sets its size to 15 px (`--tc-font-desc-panel`).
- A description never holds a blank line (a blank line ends a task in the file).
- Every mutating call goes through `mutate` and checks `key.raw` (StaleTaskError).

## Review Focus

- A description line deeper than a subtask belongs to that subtask, not to the task: `descriptionOf(task)` leaves it out, `descriptionOf(subtask)` has it.
- A task line nested under a description bullet is a subtask; rewriting the description keeps it, with its own lines, in order.
- Save with the text unchanged writes nothing (the interleaved layout stays as Max wrote it).
- Spaces vs tabs: the file's indent step for subtasks is reused, relative indents of the edited Markdown are kept.
- Markdown with blank lines or trailing spaces only: blank lines are dropped; an all-blank description removes it.

---

### Task 1: Description in the domain

**Files:**
- Modify: `src/domain/TaskDocument.ts`, `src/domain/operations.ts`, `src/domain/queries.ts`
- Create: `src/domain/description.ts`
- Test: `tests/domain/description.test.ts`

**Interfaces:**
- Produces: `descriptionLines(entry: TaskEntry): readonly string[]` (raw lines, file order, subtasks' blocks left out); `descriptionMarkdown(entry: TaskEntry): string | null` (those lines with their common leading indent removed, joined by `\n`; null when none); `TaskDocument.setDescription(entry: TaskEntry, markdown: string): TaskDocument`; `ops.setDescription(doc, entry, markdown)`; `toItem` fills `description`.

- [ ] **Step 1: Write the failing tests** in `tests/domain/description.test.ts` with the spec's example (`- [ ] Задача 1` / `\t- Описание её` / `\t- Ещё её описание` / `\t- [ ] Задача 2 (подзадача)` / `\t\t- Описание подзадачи` / `\t- Снова описание задачи 1`):
  - `descriptionMarkdown(task1)` is `"- Описание её\n- Ещё её описание\n- Снова описание задачи 1"`; of the subtask `"- Описание подзадачи"`; a task without nested lines → `null`.
  - nested description keeps its relative indent: `\t- Багаж` / `\t\t- чемодан` → `"- Багаж\n\t- чемодан"`.
  - `setDescription(task1, "- Новое\n\t- глубже")` gives the lines `- [ ] Задача 1`, `\t- Новое`, `\t\t- глубже`, `\t- [ ] Задача 2 (подзадача)`, `\t\t- Описание подзадачи` and nothing else of the task.
  - the same markdown as now → the same document object (`toBe`).
  - `""` and `"\n  \n"` remove all description lines, the subtasks stay.
  - a task without subtasks in a file indented by 4 spaces elsewhere takes the file's step (`    - x`); with no step in the file, a tab.
  - blank lines inside the markdown are dropped.
- [ ] **Step 2: Run** `npx vitest run tests/domain/description.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement.** `description.ts` walks `entry.task.children`, skipping each subtask's `raw` line plus `subtask.task.children.length` lines after it. `TaskDocument.setDescription` builds new children = the markdown's non-blank lines each prefixed with `childIndent(entry)`, then every subtask's block (`[sub.raw, ...sub.task.children]`) in order; it returns `this` when `descriptionMarkdown(entry)` already equals the trimmed-blank-lines markdown (or both empty), else `replace(entry, { ...entry.task, children })`. `toItem` sets `description: descriptionMarkdown(entry)`.
- [ ] **Step 4: Run** the new tests and `npx vitest run tests/domain` — PASS.
- [ ] **Step 5: Commit** «A task's lines without a checkbox are its description».

### Task 2: Description in the contract and the service

**Files:**
- Modify: `src/application/contracts.ts`, `src/application/TaskServiceImpl.ts`, `tests/fakes/DemoTaskService.ts`
- Test: `tests/application/TaskServiceImpl.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `TaskItem.description: string | null`; `TaskService.setDescription(key: TaskKey, markdown: string): Promise<void>`.

- [ ] **Step 1: Failing tests:** `dayView` item of a task with a description line has `description: "- note"`; `setDescription(key, "- a\n- b")` writes them under the task; a stale key rejects with `StaleTaskError`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `setDescription` through `mutate` + `ops.setDescription`; the demo service keeps a description per task.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** «The service reads and writes a task's description».

### Task 3: The mark on the card

**Files:**
- Modify: `src/ui/TaskCard.ts`, `src/ui/Timeline.ts`, `src/ui/icons.ts` (or `menu/menuIcons.ts` if the icon set lives there), `styles.css`, `src/ui/design.ts` if a measure is shared
- Test: `tests/ui/TaskCard.test.ts`, `tests/styles.test.ts` (unchanged, must pass)

**Interfaces:**
- Produces: `renderMeta(card: HTMLElement, item: TaskItem): void` replacing `renderProgress` (Timeline calls it): a `span.tc-meta` holding `span.tc-count` and/or `svg.tc-desc-mark`; nothing when the item has neither; `.tc-meta.is-pair` when both.

- [ ] **Step 1: Failing tests:** a card with progress and description has `.tc-meta` with `.tc-count` («1/4») then `.tc-desc-mark`, class `is-pair`; only description → mark alone, no `is-pair`; neither → no `.tc-meta`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Icon path `M4 6h16 M4 12h16 M4 18h10`, stroke 2.8. Tokens: `--tc-desc-mark: 13px`, `--tc-desc-mark-pair: 11px`, `--tc-meta-gap: 2px`, `--tc-meta-min: 22px`; `.tc-meta` is a column, centred, `color: var(--tc-muted)`, `min-width: var(--tc-meta-min)`; the count keeps its look, its line height `13px` (`--tc-leading-count`) inside a pair.
- [ ] **Step 4: Run** `npx vitest run` — PASS.
- [ ] **Step 5: Commit** «The description mark stands under the subtask count».

### Task 4: The start of the description over the menu, Add description

**Files:**
- Create: `src/ui/markdown/MarkdownSurface.ts`
- Modify: `src/ui/menu/TaskMenu.ts`, `styles.css`
- Test: `tests/ui/TaskMenu.test.ts`

**Interfaces:**
- Produces: `interface MarkdownSurface { render(el: HTMLElement, markdown: string): void; edit(el: HTMLElement, markdown: string, opts: { onSubmit(): void; onCancel(): void }): MarkdownEditing; }`, `interface MarkdownEditing { readonly value: string; focus(): void; destroy(): void; }`. `TaskMenuContext.markdown?: MarkdownSurface`; `MenuActions.openDescription(edit: boolean): void`; `EditRowId` gains `"description"`; `editRows(item)` puts «Add description» (icon `description`) after Rename only when `item.description === null`.

- [ ] **Step 1: Failing tests:** `editRows` of an item without description: Rename, Add description, Due date, Add subtask; with one: Rename, Due date, Add subtask. Opening the menu on an item with a description adds an overlay part `.tc-desc-panel` (rendered through a fake surface that records the markdown) placed with its bottom 10 px over the copy; a click on it closes the menu and calls `openDescription(false)`; a click on an `a` inside does not call it; Add description calls `openDescription(true)`; the panel closes with the overlay.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** The panel is `overlay.add(div.tc-desc-panel > div.tc-desc-text.markdown-rendered)`; bottom = window height − (copy top − `--tc-desc-gap` 10px); max height `--tc-desc-panel-max` 214px with a bottom fade mask of `--tc-desc-fade` 40px when it overflows (`is-cut`); when the room above the copy is under three lines (`3 × 1.5 × 15px`), it stands under the menu panel instead (`is-below`, placed after `place()`). Panel look: `--tc-panel-bg`, `--tc-radius-panel`, `--tc-panel-shadow`, width `--tc-desc-panel-w` 300px, padding `10px 14px 10px 6px` as tokens; text `font-size: var(--tc-font-desc-panel)`.
- [ ] **Step 4: Run** `npx vitest run` — PASS.
- [ ] **Step 5: Commit** «The start of a task's description over its menu».

### Task 5: The description screen

**Files:**
- Create: `src/ui/sheet/DescriptionSheet.ts`
- Modify: `styles.css`
- Test: `tests/ui/DescriptionSheet.test.ts`

**Interfaces:**
- Consumes: `MarkdownSurface` (Task 4), the `tc-sheet` / `tc-sheet-bar` look of `TaskSheet`.
- Produces: `DescriptionSheet.open(root: HTMLElement, opts: { title: string; markdown: string | null; editing: boolean; surface: MarkdownSurface; onSave(markdown: string): Promise<void>; }): DescriptionSheet`.

- [ ] **Step 1: Failing tests:** reading: bar `Close` / `Edit`, title, the surface's render called with the markdown; Edit switches to `Cancel` / `Save` and calls `edit` with the markdown; Save calls `onSave` with the editor's value and closes; Cancel closes without `onSave`; a click on the text (not a link) starts editing; `editing: true` with `markdown: null` opens straight in editing with `""`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Title 22/28 bold (`--tc-font-desc-title`, `--tc-leading-desc-title`), gap 12 (`--tc-desc-gap-title`), body scrolls; the editor fills the rest; the keyboard room reuses the sheet's `--tc-keyboard` property as `TaskSheet` does.
- [ ] **Step 4: Run** `npx vitest run` — PASS.
- [ ] **Step 5: Commit** «A task's description on a screen of its own».

### Task 6: Obsidian's markdown and the wiring

**Files:**
- Create: `src/ui/markdown/ObsidianMarkdown.ts`
- Modify: `src/ui/TaskCalendarView.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5.
- Produces: `class ObsidianMarkdown implements MarkdownSurface` (`constructor(app: App, component: Component, sourcePath: () => string)`).

- [ ] **Step 1: Implement `render`** with `MarkdownRenderer.render(app, markdown, el, sourcePath(), component)`, `el.addClass("markdown-rendered")`; clicks on `a.internal-link` → `app.workspace.openLinkText(href, sourcePath())`.
- [ ] **Step 2: Implement `edit`** with Obsidian's embeddable editor: the constructor taken from `app.embedRegistry.embedByExtension.md({ app, containerEl }, null, "")` after `showEditor()` (prototype of its `editMode`), Live Preview on, value set, Enter is a new line (no submit), `destroy` unloads it. When that path is missing, a plain `textarea.tc-desc-plain` with the same value.
- [ ] **Step 3: Wire** in `showMenu`: `markdown: this.markdown`, `openDescription: (edit) => DescriptionSheet.open(this.contentEl, { title: item.text, markdown: item.description, editing: edit, surface: this.markdown, onSave: (md) => this.act(() => tasks.setDescription(item.key, md)) })`.
- [ ] **Step 4: Run** `npm run build` and `npx vitest run` — PASS.
- [ ] **Step 5: Try it in the test Obsidian** (phone 390×844 and desktop, dark and light): the mark, the panel over the menu, the screen, editing a nested list, a link, Save writes the file as the spec says, Cancel does not; compare with the boards.
- [ ] **Step 6: Commit** «Obsidian draws and edits the description».
