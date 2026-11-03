# Design 4: Panels and Submenus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One panel, one lifted copy, one submenu of each kind: the menus are built from shared objects instead of copies, with not one pixel or behaviour changed.

**Architecture:** `dom.pinTo` places an element in a rectangle. `kit/Panel` is the window's behaviour (root class, place, pick once, replace), `kit/LiftedCopy` the copy over the blur. `menu/SectionChooser` and `menu/DatePage` are the submenus `TaskMenu` and `BulkMenu` share. `menuRow` takes typed fields instead of a class string. `kit/Grips` builds the timeline's two grips.

**Tech Stack:** TypeScript, Obsidian API, vitest + happy-dom, esbuild.

**Spec:** `docs/superpowers/specs/2026-11-04-design-4-panels-design.md`

## Global Constraints

- Pixels do not change: the catalog (`scripts/design-catalog/`) before (`cat/s4base`) and after (`cat/s4final`) matches pixel for pixel, all four views.
- Behaviour does not change: opening, closing, Escape, tap away, picking, «close, then act», above/below placement, animations, long press, drag of lifted copies, keyboard, bulk menu, quick bar panels. One intended change from the spec: a second pick while a menu closes does nothing.
- Classes on every element stay as they are: CSS does not change.
- `ui` imports `application` only; `src/settings.ts`, `src/application/contracts.ts` unchanged. `tests/styles.test.ts` not loosened.
- DOM order of the parts over the overlay stays: it decides stacking (`tc-level` holds the parts on one depth; `GroupMenu` and `SourcesPopover` parts are not on the level).
- One commit per task; `npm test` green before each.

## Review Focus

- Double tap on a menu row during the close fade: the action runs once (Task 3 test `pick runs once`).
- `BulkMenu` reads every card's rect before it lifts any (existing test `measures every picked card before it lifts any` must stay green: `LiftedCopy` takes a rect read beforehand).
- QuickBar's panel lives in the bar, not the overlay, and closes on a press outside (existing `QuickBar.test.ts`).
- `TaskMenu` split panel (`upper`) and `keepAbove` on asking: placement unchanged (existing `MenuPanel.test.ts`, `TaskMenu.test.ts`).
- «Remove due date» only when some task has a due date other than today (Task 4 tests for both callers).

---

### Task 1: `pinTo`

**Files:** Modify `src/ui/dom.ts`, `src/ui/menu/GroupMenu.ts`, `src/ui/menu/BulkMenu.ts`, `src/ui/sources/SourcesPopover.ts`, `src/ui/menu/TaskMenu.ts`, `src/ui/menu/LiftedMenu.ts`. Test: `tests/ui/dom.test.ts` (create).

**Interfaces — Produces:** `pinTo(target: HTMLElement, rect: DOMRect, size?: { width?: boolean; height?: boolean }): void` — sets `left`/`top`, and `width`/`height` when asked.

- [ ] Test: `pinTo` sets left/top only by default; with `{ width: true, height: true }` also width/height; with `{ width: true }` width only.
- [ ] Run, see it fail (no export).
- [ ] Implement; replace the hand-written copies: `GroupMenu` copy (size both), `BulkMenu.lift` (both), `SourcesPopover` copy (none), `TaskMenu.stackUnder` (rect `copy.left, copy.bottom`, width), `TaskMenu.openRename` (rect of the copy, width; `raise` sets top as before), `LiftedMenu.liftWhole` (none). `FloatingCard` moves by transform, not left/top: it stays (recorded in Итог).
- [ ] `npm test` green; commit.

### Task 2: Typed menu row

**Files:** Modify `src/ui/menu/MenuPanel.ts`, `TaskMenu.ts`, `BulkMenu.ts`, `EventMenu.ts`, `src/ui/sources/SourcesPopover.ts`, `src/ui/quick/QuickBar.ts`. Test: `tests/ui/MenuPanel.test.ts`, `tests/ui/TaskMenu.test.ts` (import `tileRows` from `MenuPanel`).

**Interfaces — Produces:**
```ts
type MenuRowRoot = "tc-menu-row" | "tc-menu-back" | "tc-source-refresh";
interface MenuRowSpec { label; value?; icon?; danger?; onPick;
  root?: MenuRowRoot;           // default tc-menu-row
  size?: "row" | "tall"; apart?: boolean; choice?: boolean; quiet?: boolean; add?: boolean;
  iconSide?: "end" | "start";   // start: icon, then the label as a text node (back row, Refresh now)
  cls?: string;                 // purpose class, e.g. tc-picker-remove
}
menuRow(parent, spec): HTMLButtonElement
backRow(parent, title, onBack)  // menuRow { root: "tc-menu-back", iconSide: "start", icon: "chevronLeft" }
tileRows<T>(tiles): T[][]       // moved from TaskMenu
```
Classes: `tc-btn <root> [is-tall] [is-apart] [is-choice] [is-quiet] [is-add] [cls]`, `is-danger` when danger — exactly the strings used now.

- [ ] Tests: a tall apart add row has class `tc-btn tc-menu-row is-tall is-apart is-add` and children `span.tc-menu-label`, `svg`; a choice quiet row `tc-btn tc-menu-row is-choice is-quiet`; the back row `tc-btn tc-menu-back`, children `svg` then text; a `tc-source-refresh` row the same shape.
- [ ] Run, fail.
- [ ] Implement; callers move from class strings to fields; «Refresh now» built by `menuRow`.
- [ ] `npm test` green; commit.

### Task 3: `Panel` and `LiftedCopy`

**Files:** Create `src/ui/kit/Panel.ts`, `src/ui/kit/LiftedCopy.ts`. Modify `GroupMenu.ts`, `SourcesPopover.ts`, `DescriptionPeek.ts`, `LiftedMenu.ts`, `TaskMenu.ts`, `EventMenu.ts`, `BulkMenu.ts`, `QuickBar.ts`. Test: `tests/ui/kit/Panel.test.ts`, `tests/ui/kit/LiftedCopy.test.ts`.

**Interfaces — Produces:**
```ts
type PanelRoot = "tc-panel" | "tc-popover" | "tc-desc-peek";
class Picks { constructor(close: () => void); pick(then: () => void | Promise<void>): () => void } // closes once, then acts; later picks do nothing
interface PanelSpec { root: PanelRoot; cls?: string; picks: Picks; place?: (panel: HTMLElement) => void }
class Panel {
  static over(overlay: Overlay, spec: PanelSpec, onLevel = true): Panel // laid over the sheet, shown and closed with it
  static inside(parent: HTMLElement, spec: PanelSpec): Panel             // the quick bar's: in its holder
  readonly el: HTMLElement;
  show(): void;        // inside: lays it out shrunk, then is-shown; over: the overlay shows it
  place(): void;
  pick(then): () => void;
  replace(build: (el: HTMLElement) => void): void; // clear, build, place
}
class LiftedCopy {
  static over(overlay: Overlay, copy: HTMLElement, onLevel: boolean): LiftedCopy
  readonly el: HTMLElement; rect: DOMRect;
  pin(rect: DOMRect, size?: { width?: boolean; height?: boolean }): this
}
```
A menu with several panels (`TaskMenu`: panel and upper) shares one `Picks`. `BulkMenu` does not extend `LiftedMenu`.

- [ ] Tests: `Picks`: close then action, in that order; a second pick (same or another) does nothing. `Panel.over` puts `tc-panel is-menu is-task` in `.tc-level`; `onLevel=false` straight in body; `replace` clears, builds, calls `place`; `Panel.inside` + `show` sets `is-shown`. `LiftedCopy.pin` sets left/top (and size) and keeps `rect`; it goes when the overlay closes.
- [ ] Run, fail.
- [ ] Implement and migrate: `GroupMenu` (copy `tc-lifted is-head` and panel off the level), `SourcesPopover` (`tc-seg-copy`, `tc-popover`, off the level), `DescriptionPeek` (`tc-desc-peek` on the level), `LiftedMenu` (`lifted` a `LiftedCopy`, `addPanel` a `Panel`, `pick` from its `Picks`), `TaskMenu`/`EventMenu`, `BulkMenu` (`tc-panel is-task is-bulk`, `LiftedCopy` per card, `Picks`), `QuickBar` (`Panel.inside(bar, tc-panel tc-quick-panel is-above)`, `Picks` per opened panel closing it).
- [ ] `npm test` green; commit.

### Task 4: `SectionChooser`, `DatePage`

**Files:** Create `src/ui/menu/SectionChooser.ts`, `src/ui/menu/DatePage.ts`. Modify `TaskMenu.ts`, `BulkMenu.ts`, `QuickBar.ts`. Test: `tests/ui/SectionChooser.test.ts`, `tests/ui/DatePage.test.ts`, `tests/ui/menuCopies.test.ts`.

**Interfaces — Produces:**
```ts
interface SectionChooserSpec { choice: SectionChoice; checked: (name: GroupName) => boolean; onBack(): void; onPick(name: GroupName): void; onNew?: () => void }
function sectionChooser(panel: HTMLElement, spec: SectionChooserSpec): void // back row «Section», group of is-choice rows (ungrouped is-quiet), «New section» (tall apart add) when onNew
interface DatePageSpec { today: LocalDate; selected: LocalDate | null; month?: LocalDate; onPick(date): void; onRemove?: () => void }
function datePage(panel: HTMLElement, spec: DatePageSpec): MonthPicker // adds is-picker; MonthPicker; «Remove due date» row (tc-picker-remove) when onRemove
```
`QuickBar` keeps building only `MonthPicker` with its own «today → Now».

- [ ] Tests: rows, checks and classes of both; «New section» only with `onNew`; «Remove due date» only with `onRemove`; picks call back. Copy test: in `src/ui` (comments stripped) the literal `"Remove due date"` appears once, `backRow(` with `"Section"` only in `SectionChooser.ts`, `new MonthPicker(` only in `DatePage.ts` and `QuickBar.ts`.
- [ ] Run, fail.
- [ ] Implement; `TaskMenu.showSections/showPicker` and `BulkMenu.showSections/showPicker` call them.
- [ ] `npm test` green; commit.

### Task 5: `Grips`

**Files:** Create `src/ui/kit/Grips.ts`. Modify `src/ui/Timeline.ts`, `src/ui/drag/DragController.ts`. Test: `tests/ui/kit/Grips.test.ts`.

**Interfaces — Produces:** `Grips.attach(parent: HTMLElement, onGrip: (edge: "start" | "end", e: PointerEvent) => boolean): void` — two `span.tc-grip.is-start/.is-end`; a primary left press goes to `onGrip`; when it answers true the press is stopped and its default prevented.

- [ ] Tests: two grips in order; a primary press calls `onGrip` with the edge and is stopped when taken; a non-primary or right press is not passed on; an untaken press propagates.
- [ ] Run, fail; implement; both callers on it; `npm test` green; commit.

### Task 6: Catalog, probes, Итог

- [ ] `npm run build`, install into the test Obsidian, run the four catalog views into `cat/s4final`, `diff.py cat/s4base cat/s4final`; re-run once for noise; crop and look at every real difference.
- [ ] `tapcheck.mjs` and `TAB=1 tapcheck.mjs` print only state headers.
- [ ] Fill the spec's «Итог», set row 4 of «Ход работы» in the overview; commit.
