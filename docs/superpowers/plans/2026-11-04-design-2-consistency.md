# Этап 2. Один визуальный язык — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** одна тень у нижнего ряда, одно окно для меню и источников, ровные края экрана описания, одинаковые нажатие, наведение и фокус у всех кнопок; заодно — фон кнопок больше не пропадает при наведении и нажатии.

**Architecture:** правки токенов и нескольких правил в `styles.css` поверх этапа 1, одно изменение порядка анимации окна источников (только CSS — классы `is-shown`/`is-closing` ставит общий `Overlay`), README и доски обновляются значениями. Каждое видимое изменение подтверждается парой снимков каталога; всё, что не в списке, должно остаться `same`.

**Tech Stack:** CSS, vitest (`tests/styles.test.ts`), каталог `scripts/design-catalog/`.

**Spec:** `docs/superpowers/specs/2026-11-04-design-2-consistency-design.md` (+ обзор, аудит).

## Global Constraints

- Ветка `design-2-consistency` от master с влитым этапом 1.
- Светлая тема задаёт только цвета (`body.theme-light`); никаких фильтров яркости в ней.
- Тени: тёмная `--tc-shadow-control: 0 6px 16px rgba(0, 0, 0, 0.5), 0 0 0 0.5px rgba(255, 255, 255, 0.1)`; светлая `0 6px 16px rgba(0, 0, 0, 0.12), 0 0 0 0.5px rgba(0, 0, 0, 0.1)`.
- Окно источников: фон и тень панели, появление как у `.tc-panel` (200 мс `--tc-duration-menu`, масштаб `--tc-menu-scale`, сдвиг `--tc-menu-rise` к колёсику, точка роста — середина низа), закрытие за `--tc-duration-collapse`, отступ строк 16, зазор до колёсика 12, толщина иконки обновления 1.8.
- Наведение — только `@media (hover: hover)` и `body:not(.is-mobile)`; слой `background-image: linear-gradient(var(--tc-hover), var(--tc-hover))`.
- Фокус — `outline`, не `box-shadow`.
- Полоса быстрого ввода на телефоне — без тени (решение Макса от 03.11).
- Не трогать: зазоры над нижним рядом и под заголовками (`tight-gaps`), «место» на десктопе (5), ширины меню раздела и меню выбранных задач, капсулу времени.

## Review Focus

1. Ручка разделителя видна при нажатии и во время тяги (раньше исчезала) — снимок `active-handle`.
2. Наведение на плитку с заливкой уровня и на выбранный день не стирает заливку — снимки `hover-tile-on`, `hover-day`.
3. Плюс на телефоне не получает ни наведения, ни кольца фокуса после тапа.
4. Кольцо фокуса не обрезается в окнах с `overflow: hidden` и не съедает тень нижнего ряда — снимки `focus-row`, `focus-seg`.
5. Копия колёсика над подложкой источников — с той же тенью, на том же месте, без сдвига.

---

### Task 1: Каталог — новые состояния

**Files:** Modify: `scripts/design-catalog/catalog.mjs`, `scripts/design-catalog/README.md`

- [ ] **Step 1:** добавить в `states` (на Mac, если не сказано иное): `active-handle` (обе платформы: `force` `.tc-divider-handle` → `active`), `hover-tile-on` (меню задачи с уровнем: перед этим `setPriority` у карточки — или найти карточку с приоритетом в эталоне; если такой нет, добавить строку с приоритетом в `scripts/design-catalog/tasks.md` в конец раздела, где она не сдвинет остальные снимки, и переснять эталон), `hover-day` (выбор даты, `force` `.tc-picker .tc-day.is-selected` → `hover`), `focus-row` (`.tc-panel .tc-menu-row` → `focus`,`focus-visible`), `focus-seg` (`.tc-seg` → `focus`,`focus-visible`), `hover-sheet` (экран описания, `.tc-sheet-cancel` → `hover`). Строка в README.
- [ ] **Step 2:** снять эталон master этими состояниями: `…/scratchpad/cat/base2` (как в README каталога).
- [ ] **Step 3: Commit** `"Design catalog: pressed handle, hover over filled buttons, keyboard focus"`

### Task 2: Нейтрализатор наведения не трогает наши фоны (баг)

**Files:** Modify: `styles.css`; Test: `tests/styles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("quiets Obsidian's hover on our buttons without touching their own ground", () => {
	const quiet = sheet.rules.filter((d) => d.property === "background" && /:hover|:active/.test(d.selector) && d.value === "transparent");
	expect(quiet.length).toBeGreaterThan(0);
	for (const d of quiet) expect(d.selector.split(",").every((s) => s.trim().startsWith(":where("))).toBe(true);
});
```

- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** переписать нейтрализатор как `:where(.task-calendar, .tc-panel, .tc-picker, .tc-popover, .tc-quick-bar) :where(button:hover, button:active) { background: transparent; box-shadow: none; }` — если каталог на Mac или телефоне показывает серый фон Obsidian на `hover-row`/`active-row`/`active-tile`, поднять специфичность так: `:where(...) button:is(:hover, :active)` (0,1,1) и поставить правило ВЫШЕ всех правил кнопок с фоном. Убрать заплатку `.tc-bar-place, .tc-bar-place:hover, .tc-bar-place:active` до одного селектора `.task-calendar .tc-quick-bar .tc-bar-place`.
- [ ] **Step 4:** `npm test` PASS; каталог против `base2`: `active-handle`, `active-tile` и все места, где кнопка с фоном была под наведением/нажатием, — изменились (фон на месте), всё остальное `same`. Посмотреть пары.
- [ ] **Step 5: Commit** `"A button keeps its own ground under the pointer: Obsidian's hover is quieted at zero weight"`

### Task 3: Одна тень нижнего ряда

**Files:** Modify: `styles.css`; Test: `tests/styles.test.ts`

- [ ] **Step 1: Write the failing tests** — «тени только из токенов» и «нижний ряд с одной тенью» по спеке, раздел 6 (ринги вида `inset? 0 0 0 var(--tc-…) var(--tc-…)` допустимы; `.tc-seg`, `.tc-plus`, `.tc-undo`, `.tc-float-plus`, капсула `.tc-quick-bar.is-desk::before` — все `box-shadow: var(--tc-shadow-control)`).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** токены: `--tc-shadow-control` (обе темы), `--tc-float-shadow` → `--tc-shadow-lift`, `--tc-panel-shadow` → `--tc-shadow-panel`; удалить `--tc-plus-shadow`, `--tc-desk-bar-shadow`; `.tc-seg` получает `box-shadow: var(--tc-shadow-control)`; плюс, плюс под пальцем, отмена, капсула — тоже.
- [ ] **Step 4:** `npm test` PASS; каталог: меняется нижний ряд во всех снимках, где он виден, и капсула в `quick` на Mac; больше ничего. Посмотреть пары нижнего ряда крупно (телефон и Mac, обе темы): тень у колёсика есть, у всех трёх одинаковая.
- [ ] **Step 5: Commit** `"One shadow for the bottom row: the wheel gets it, the plus, Undo and the desktop capsule share it"`

### Task 4: Окно источников как меню

**Files:** Modify: `styles.css`

- [ ] **Step 1:** `.tc-popover`: фон `--tc-panel-bg`, тень `--tc-shadow-panel`; удалить `--tc-popover-bg`, `--tc-popover-shadow`; появление: `opacity: 0; transform-origin: 50% 100%; transform: translate3d(0, var(--tc-menu-rise), 0) scale(var(--tc-menu-scale)); transition: opacity var(--tc-duration-menu) var(--tc-ease-out), transform var(--tc-duration-menu) var(--tc-ease-out)`; `.is-shown` → `opacity: 1; transform: none`; `.is-closing` → `transition-duration: var(--tc-duration-collapse)`; отступ строк и «Refresh now» → `--tc-space-16`; `--tc-popover-gap` → `var(--tc-space-12)`; `--tc-stroke-refresh` → `var(--tc-stroke-1-8)`.
- [ ] **Step 2:** `npm test` PASS; каталог: меняется только `sources` (обе платформы, обе темы). Открыть окно в тестовом Obsidian руками и посмотреть появление и закрытие (два-три кадра через `Page.captureScreenshot` с интервалом 50 мс).
- [ ] **Step 3: Commit** `"The sources window is a menu window: its ground, shadow, entrance, row padding and gap"`

### Task 5: Края экрана описания

**Files:** Modify: `styles.css`

- [ ] **Step 1:** у `.tc-sheet-bar` отступ `0 var(--tc-space-10)` вместо `--tc-space-8`, чтобы текст кнопок (свой отступ 10) стоял на 20 = `--tc-sheet-side`.
- [ ] **Step 2:** каталог: меняется только `sheet`; на снимке левый край «Close» и правый край «Edit» на одной вертикали с заголовком (измерить по пикселям).
- [ ] **Step 3: Commit** `"The description screen's buttons line up with its title"`

### Task 6: Нажатие, наведение, фокус

**Files:** Modify: `styles.css`

**Interfaces:** Produces: `--tc-hover` (переименованный `--tc-desk-bar-hover`, обе темы), `--tc-focus-ring: 2px solid var(--tc-accent)` (толщину — токеном `--tc-focus-w: 2px`), `--tc-focus-offset: 2px`.

- [ ] **Step 1:** нажатие — одно правило `:is(.task-calendar, .tc-panel, .tc-picker, .tc-popover, .tc-quick-bar) button:not(.tc-divider-handle):active, .tc-swatch:active { opacity: var(--tc-pressed); }` вместо поимённого списка (проверить, что `.tc-day-title` — кнопка; если нет, оставить его селектор отдельно).
- [ ] **Step 2:** наведение — `@media (hover: hover) { body:not(.is-mobile) :is(.task-calendar, .tc-panel, .tc-picker, .tc-popover, .tc-quick-bar) button:not(.tc-divider-handle):hover { background-image: linear-gradient(var(--tc-hover), var(--tc-hover)); } }`; правила капсулы с `--tc-desk-bar-hover` удалить, если новое их покрывает (каталог `quick` на Mac не должен поменяться).
- [ ] **Step 3:** фокус — `body:not(.is-mobile) :is(...) button:focus-visible, body:not(.is-mobile) .tc-seg:focus-visible, .tc-swatch:focus-visible { outline: var(--tc-focus-ring); outline-offset: var(--tc-focus-offset); }`; внутри `.tc-panel`, `.tc-popover`, `.tc-picker` — `outline-offset: calc(-1 * var(--tc-focus-offset))`; у `.tc-seg` убрать `outline: none`.
- [ ] **Step 4:** каталог: меняются только `hover-*`, `focus-*`, `active-*` снимки (и `undo`, если там кнопка под нажатием — проверить); посмотреть каждую пару крупно. Телефонные снимки, кроме `active-row`/`active-handle`, — `same`.
- [ ] **Step 5: Commit** `"Every button presses, hovers and takes keyboard focus the same way"`

### Task 6b: «Место» над размытием не теряет отступы (баг из этапа 1)

**Files:** Modify: `styles.css`

- [ ] **Step 1:** `.tc-quick-bar.is-over button { padding: 0 }` перебивает отступы `.tc-quick-bar .tc-bar-place` (12/10): над размытием кнопка «место» стоит без них. Сузить правило до кнопок без своих отступов (`:not(.tc-bar-place)`) или поднять специфичность правила места — так, чтобы у «места» были одни и те же отступы и над размытием, и без него.
- [ ] **Step 2:** проверить снимком полосы над размытием (быстрый ввод из меню задачи → «Rename» или «Add subtask» на телефоне): отступы места как в `quick`.
- [ ] **Step 3: Commit** `"The place button keeps its padding over the blur"`

### Task 7: README и доски

**Files:** Modify: `docs/design/README.md`, доски в `docs/design/canvas/`

- [ ] **Step 1:** README — разделы из спеки («README и доски»), со старым значением и датой 04.11 в тексте решения, как принято в README.
- [ ] **Step 2:** доски: `grep -l "plusShadow\|0.97\|rgba(138, *92, *245\|0.45)" docs/design/canvas/*.dc.html` — в каждой заменить значения на новые (тень нижнего ряда, окно источников); у трека колёсика в `Screen.dc.html` и `ScreenLight.dc.html` — та же тень, что у плюса. Не перерисовывать доски, только значения.
- [ ] **Step 3:** отрендерить изменённые доски локально (как в памяти «look-at-boards-before-showing»: dc-runtime как support.js) и посмотреть, что поменялось только это.
- [ ] **Step 4: Commit** `"Design: the bottom row's one shadow, the sources window as a menu, hover and focus"`

### Task 8: Итог

- [ ] **Step 1:** `npm test`, `npm run build` — зелёное; полный каталог против `base2`: список изменившихся снимков совпадает с ожидаемым по задачам 2–6.
- [ ] **Step 2:** собрать лист «до/после» (ffmpeg hstack) для: нижнего ряда (телефон тёмная и светлая, Mac светлая), `sources`, `sheet`, `hover-row`, `focus-arrow`, `active-handle` — в `…/scratchpad/stage2-before-after/`.
- [ ] **Step 3:** заполнить «Итог» спеки и строку обзора.
- [ ] **Step 4: Commit** `"Spec: stage 2 done"`
