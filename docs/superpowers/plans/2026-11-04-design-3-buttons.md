# Этап 3. Кнопки и иконки — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One icon set and one button component in `src/ui/kit/`; every plugin `<button>` carries `tc-btn`, and the CSS reset, tap, press, hover and focus live on it — the picture does not change except the iPad padding and the phone tap on a menu tile.

**Architecture:** `kit/icons.ts` replaces `icons.ts`, `menu/menuIcons.ts`, `sources/sourceIcons.ts` and `tileIcon`. `kit/Button.ts` builds a `<button class="tc-btn is-<kind> is-<tone> <cls>">`; `roundShape()` gives the plus under the finger and the plus's ring the same round look without a button. Buttons outside the kit's kinds (menu rows, tiles, back row, Refresh now, picker days — stage 4 owns their API) only gain the class `tc-btn`. Every rule that gives a button padding, ground or shadow weighs at least (0,2,1) and stands after the tap answer, so Obsidian's iPad padding and phone tap (both (0,2,1)) never win.

**Tech Stack:** TypeScript, Obsidian API, vitest + happy-dom, plain CSS with `--tc-` tokens.

**Spec:** `docs/superpowers/specs/2026-11-04-design-3-buttons-design.md` (overview: `2026-11-04-design-overview.md`).

## Global Constraints

- `ui` imports `application` only; `src/settings.ts` and `src/application/contracts.ts` do not change.
- `src/ui/kit/*` imports only `../dom`, `../design` and other kit files; knows nothing of tasks or screens.
- `tests/styles.test.ts` is not loosened; new checks are added.
- Pixels, gestures, `aria-label` and `title` stay. Intended changes only: iPad padding (all buttons), phone tap on a menu tile (it went transparent), the divider's handle becomes `span[role=separator]`, the swatch becomes a real `<button>` (Enter/Space work; on the desktop it now takes the common hover layer).
- Delete with `trash`. One commit per task.

## Review Focus

1. A button whose own ground rule weighs (0,2,0) goes transparent under `.mobile-tap` — covered by the weight test in Task 3 and by `tapcheck.mjs` (made transition-proof in Task 5).
2. A ground written with the `background` shorthand at a weight above the hover rule erases the desktop hover layer — Task 3 test «the hover layer outweighs every button ground».
3. Buttons Obsidian draws inside a description (copy-code) lose our reset and look like Obsidian's own — accepted, recorded in «Итог».
4. Settings swatch as `<button>` picks up Obsidian's button look in the settings page — Task 3 kind rule at (0,2,1) and the catalog's `settings` shot.
5. Long day titles: the day title keeps its text as the button's own text (no inner span), so its clipping is unchanged.

---

### Task 1: One icon set — `kit/icons.ts`

**Files:**
- Create: `src/ui/kit/icons.ts`, `tests/ui/kit/icons.test.ts`
- Trash: `src/ui/icons.ts`, `src/ui/menu/menuIcons.ts`, `src/ui/sources/sourceIcons.ts`
- Modify: every importer (`ColumnSwitch`, `ColumnHeaders`, `UndoButton`, `TaskCard`, `quick/PlusRing`, `quick/QuickBar`, `quick/PlusButton`, `drag/PlusFloat`, `menu/MonthPicker`, `menu/MenuPanel` (drop `tileIcon`, `TileIconName` → `IconName`), `menu/TaskMenu` (`MenuIconName` → `IconName`), `sources/SourcesPopover`), `BulkController` (`"cancel"` → `"cross"`), `PlusRing` (`is-cancel` → `is-cross`), `styles.css` (`.tc-plus-ring.is-cancel` → `.is-cross`).

**Interfaces — Produces:**
- `type IconName` = union of all names: `chevronLeft chevronRight calendar inbox backlog soon now tomorrow section outdent indent description plus cross undo progress done wontdo rename delete removeDue priority removeSection subtask openFile check google work refresh`.
- `icon(name: IconName): SVGSVGElement` — `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`, one stroke `<path d>`, then, for an icon with a filled part, `<path d fill="currentColor" stroke="none">`.
- `ICONS` map exported for the test: `Record<IconName, { d: string; fill?: string }>`.

Decisions: `cancel` and `cross` → `cross`; `description`, `section`, `plus` once each (plus as the path `M12 5v14 M5 12h14`, the same lines as the two `<line>`s). `stroke-linejoin="round"` on all: the three icons that lacked it (description, plus, cross) are separate straight strokes with no joins, so nothing changes on screen. No `filled` option: the filled half belongs to the icon (In progress, Done), no caller needs it on demand.

- [ ] **Step 1: failing test** `tests/ui/kit/icons.test.ts`:
  - `it("draws every name")` — for each key of `ICONS`: `icon(name)` has `viewBox` `0 0 24 24`, `aria-hidden` `true`, first path's `d` equals `ICONS[name].d`.
  - `it("fills the filled part")` — `icon("progress")` has 2 paths, second has `fill="currentColor"`, `stroke="none"`; `icon("rename")` has 1.
  - `it("keeps every drawing once")` — `Object.values(ICONS).map(s => s.d + "|" + (s.fill ?? ""))` has no duplicates.
- [ ] **Step 2:** `npx vitest run tests/ui/kit/icons.test.ts` → FAIL (module missing).
- [ ] **Step 3:** write `kit/icons.ts`, move importers, trash the three files.
- [ ] **Step 4:** `npx tsc --noEmit && npm test` → all green.
- [ ] **Step 5:** commit «Design 3: one icon set in kit/icons».

### Task 2: The button — `kit/Button.ts`

**Files:** Create `src/ui/kit/Button.ts`, `tests/ui/kit/Button.test.ts`.

**Interfaces — Produces:**
```ts
export type ButtonKind = "round" | "icon" | "bar" | "text" | "pill" | "swatch";
export type ButtonTone = "plain" | "accent" | "quiet" | "strong" | "danger";
export interface ButtonSpec { kind; tone?; label; icon?: IconName; text?: string; title?; cls?; onPress(e: MouseEvent): void }
export class Button { static create(parent: HTMLElement, spec: ButtonSpec): Button; readonly el: HTMLButtonElement;
  setOn(on: boolean): void; setOff(off: boolean): void; setHidden(hidden: boolean): void; setText(text: string): void; setIcon(name: IconName): void }
export function roundShape(parent: HTMLElement, icon: IconName, tone: ButtonTone, cls?: string): HTMLElement;
```
Rules (decided here):
- classes `tc-btn is-<kind> is-<tone ?? "plain">` then `cls` (may hold several classes).
- visible text = `spec.text ?? (kind is text|pill ? spec.label : undefined)`. `aria-label` = `label` unless the visible text came from `label` (text/pill without `text`) — this keeps today's attributes exactly (sheet, question buttons have none; day title, place, icons have one).
- with an icon and a visible text: `svg` then `span.tc-btn-label`; without an icon the text is the button's own text. `setText` writes to that holder; `setIcon` replaces the `svg` or prepends one.
- `type="button"` is not set (today's buttons have none; nothing submits).
- `roundShape`: `div.tc-btn.is-round.is-<tone> <cls>` with the icon, appended to `parent`.

- [ ] **Step 1: failing tests** `Button.test.ts`: classes per kind and tone (`is-round is-accent tc-plus` for `{kind:"round", tone:"accent", cls:"tc-plus"}`; default tone `is-plain`); `aria-label` on an icon button, none on `{kind:"text", label:"Close"}` whose text is `Close`, both on `{kind:"text", label:"Back to today", text:"Mon"}`; icon present (`svg` first child); icon + text → `span.tc-btn-label`; `title`; click calls `onPress` once with the event; `setOn/setOff/setHidden` toggle `is-on/is-off/is-hidden`; `setText` on both holders; `setIcon` keeps one svg in first place; `roundShape` is a `div` with `tc-btn is-round is-quiet tc-plus-ring` and the icon.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run → PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** commit «Design 3: one button component in kit/Button».

### Task 3: Every button through the kit, the CSS on `.tc-btn`

One commit: the CSS switch and the tagging must land together or the reset leaves some buttons.

**Files:** `styles.css`, `tests/styles.test.ts`, `UndoButton.ts`, `quick/PlusButton.ts`, `quick/PlusRing.ts`, `drag/PlusFloat.ts`, `ColumnHeaders.ts`, `menu/MonthPicker.ts`, `quick/QuickBar.ts`, `sheet/DescriptionSheet.ts`, `menu/MenuPanel.ts`, `sources/SourcesPopover.ts`, `TaskCalendarView.ts` (Create file), `SettingsTab.ts`, their tests (`QuickBar`, `DescriptionSheet`, `PlusButton`, `UndoButton`, `TaskMenu` as needed).

Who becomes what:

| Element | Spec |
|---|---|
| plus | `round accent`, `cls tc-plus`, label `New task`; pointer listeners on `button.el`; `onPress` acts on `e.detail === 0` only, as now; `hidden` → `setHidden` |
| Undo | `round plain`, `cls tc-undo`, `setOff(!canUndo)` |
| ring | `roundShape(parent, mark, "quiet", "tc-plus-ring is-<mark>")` |
| plus under the finger | `roundShape(document.body, "plus", "accent", "tc-float-plus")` |
| day arrows | `icon quiet`, `cls tc-arrow`; one `arrow()` gone (two `Button.create` calls) |
| month arrows | `icon accent`, `cls tc-picker-arrow tc-picker-prev/next` |
| day title | `text plain`, label `Back to today`, `text ""`, `cls tc-head-title tc-day-title`; `render()` → `setText` |
| shifts | `bar plain`, `cls tc-bar-shift tc-bar-outdent/indent`, title `Move out (Shift+Tab)` … |
| flag | `bar plain`, icon `priority`, `cls tc-bar-flag`, title `Priority` |
| place | `bar plain`, icon `inbox` (replaced on first show), `text ""`, `cls tc-bar-place`, title `Place`; label span is `.tc-btn-label` (was `.tc-bar-place-label`) |
| Close/Edit, Cancel/Save | `text plain` (left) and `text strong` (right); classes `tc-sheet-cancel/submit` go |
| question | Cancel `pill plain`, confirm `pill strong` or `pill danger` with its icon, both `cls tc-menu-ask-btn` |
| Create file | `pill plain`, `cls tc-missing-btn` |
| swatch | `swatch plain`, label = colour, `data-priority`, `setOn` |
| menu rows, back row, tiles, Refresh now, picker days | `el(…, "button", "tc-btn <their classes>")` — no kind (stage 4) |

CSS (values unchanged; selectors move):
- reset `button.tc-btn {…}` (was the five-container group); tap answer `button.tc-btn.mobile-tap`; quiet `:where(button.tc-btn:hover, button.tc-btn:active)`; press `button.tc-btn:not(:disabled):active`; hover `body:not(.is-mobile) button.tc-btn:not(:disabled):hover`; focus `body:not(.is-mobile) button.tc-btn:focus-visible, button.tc-btn.is-swatch:focus-visible`, inner offset `body:not(.is-mobile) :is(.tc-panel, .tc-popover, .tc-picker) button.tc-btn:focus-visible`.
- kinds, right after: `:is(button, div).tc-btn.is-round` (size, circle, centre, padding 0), `.is-round.is-accent` (accent ground, shadow), `.is-round.is-plain` (track ground, shadow, text), `button.tc-btn.is-icon` (padding 0, circle, centre), `.is-icon.is-quiet` (ink-soft), `.is-icon.is-accent` (accent-ui), `button.tc-btn.is-bar` (padding 0, bar height and radius, centre, text colour, no shrink), `button.tc-btn.is-text` (padding 0 10, text-button radius), `.is-text.is-strong` (semibold), `button.tc-btn.is-pill` (padding 0, row height, tile radius, centre, gap 8, menu font), `.is-pill.is-plain/.is-strong/.is-danger`, `button.tc-btn.is-swatch` (+ `.is-on`).
- purpose rules keep position and their own; those that set padding/ground get `button` in the subject or more weight: `.tc-panel button.tc-menu-row`, `.tc-panel button.tc-menu-back`, `.tc-panel button.tc-menu-tile` (+ `padding: 0`), `.tc-popover button.tc-source-refresh`, `.tc-picker button.tc-day` (+ `padding: 0`), `.tc-quick-bar button.tc-bar-place`, `.task-calendar .tc-head > .tc-head-title` for the title's padding, `.tc-sheet-bar > button.tc-btn` (height, colour, size), `.task-calendar button.tc-btn.tc-missing-btn` (card height, padding 0 16, card radius and ground, body font size). `.tc-menu-ask-buttons > .tc-btn { flex: 1; min-width: 0 }`. `.tc-quick-bar.is-over button:not(.tc-bar-place) { padding: 0 }` goes (the kind does it). The two `[data-panel="place"]` place grounds use `background-color` so the hover layer stays.

- [ ] **Step 1: failing tests** in `styles.test.ts` (a small `specificity(selector)` helper: `:where` 0, `:is/:not/:has` the max of their arguments):
  - «writes every `.tc-btn` rule with `button` in the selector»;
  - «resets a button and dims it pressed only on `.tc-btn`» — the one `appearance` rule's selector is `button.tc-btn`; every `opacity: var(--tc-pressed)` selector on a button contains `.tc-btn`;
  - «answers Obsidian's iPad padding and phone tap: padding, ground and shadow of a button weigh at least (0,2,1) and stand after the tap answer» — button classes read from the code (`cls:` in `Button.create` specs and `"button", "…"` in `el` calls, plus `tc-btn` and `is-<kind>`); every rule part whose last compound holds one of them and sets `padding*`, `background*` or `box-shadow`;
  - «the hover layer outweighs every button ground set with the `background` shorthand»;
  - existing tests that name old selectors (tap answer, bottom-row shadow, divider handle, position row) updated to the new selectors.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** move the TS creators to the kit, then the CSS.
- [ ] **Step 4:** `npx tsc --noEmit && npm test` → green.
- [ ] **Step 5:** build, install in the test Obsidian, eyeball phone and Mac; commit «Design 3: every button through the kit, the reset and states on .tc-btn».

### Task 4: The audit's small things

**Files:** `Divider.ts` (+ test), `drag/FloatingCard.ts`, `Timeline.ts`, `menu/MonthPicker.ts`, `TaskCalendarView.ts`, `menu/TaskMenu.ts`, `styles.css`, `tests/styles.test.ts`.

- Divider's handle: `el(strip, "span", "tc-divider-handle")`, `role="separator"`, `aria-orientation="vertical"`, `aria-label="Resize columns"`; CSS `.task-calendar .tc-divider-handle`.
- `FloatingCard`: layers and count through `el(document.body, …)`, same order.
- `Timeline.placeTask`: `showProgressDot(card, item)`.
- `TaskCalendarView`: `part.classList.toggle("tc-hidden", missing)`; CSS `.task-calendar > .tc-hidden { display: none }`. `TaskMenu.openRename`: `this.lifted.classList.add("tc-invisible")`; CSS `.tc-invisible { visibility: hidden }`.
- `el` under its own name in `Timeline`, `MonthPicker`, `Divider` (their constructor parameter `el` renamed; the public `el` property kept).

- [ ] **Step 1: failing tests:** Divider test — the handle is a `span` with `role="separator"` and no `button` in the divider; Timeline test — an in-progress card has one `.tc-progress-dot`; a styles test «hides by the plugin's own classes» (`tc-hidden` display none, `tc-invisible` visibility hidden) and a code test: no `style.display =` / `style.visibility =` in `src/ui`, no `el as make`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** `npx tsc --noEmit && npm test` → green.
- [ ] **Step 5:** commit «Design 3: the divider's handle a separator, FloatingCard by el, hidden by classes».

### Task 5: Check, scripts, «Итог»

**Files:** `scripts/design-catalog/catalog.mjs`, `tapcheck.mjs`, `README.md` (selectors of the sheet's buttons; tap probe sets `transition: none` on the probed button — Obsidian's button transition made it read the ground before the tap and miss the transparent tile), spec «Итог», overview row 3.

- [ ] **Step 1:** `npm test`, `npm run build` green.
- [ ] **Step 2:** install; `catalog.mjs` → `cat/s3final` for phone/mac × dark/light; `diff.py cat/s3base cat/s3final`; every changed shot cropped and looked at.
- [ ] **Step 3:** `node scripts/design-catalog/tapcheck.mjs` and `TAB=1 …` — both print states only.
- [ ] **Step 4:** fill «Итог», set row 3 in the overview; commit «Design 3: catalog and probes, Итог».
