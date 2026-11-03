# Этап 1. Токены и общие правила CSS — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** собрать `styles.css` в шкалы, общие токены и общие правила, не изменив ни одного пикселя.

**Architecture:** токены двух уровней (ступень шкалы → токен назначения), составные токены для повторяющихся значений, группы селекторов вместо скопированных блоков. TS трогается только там, где он читает переименованный токен. Каждая задача проверяется тестами и попиксельным каталогом экранов против эталона master.

**Tech Stack:** CSS custom properties, vitest (`tests/styles.test.ts`, свой парсер `Stylesheet`), esbuild, Node-скрипт каталога над CDP.

**Spec:** `docs/superpowers/specs/2026-11-04-design-1-tokens-design.md` (+ обзор `2026-11-04-design-overview.md`, находки `2026-11-04-design-audit.md`).

## Global Constraints

- Пиксели не меняются: `python3 scripts/design-catalog/diff.py <base1> <after>` печатает `0 differ` на всех 66 снимках.
- Только литералы у токенов из `DESIGN_TOKENS` (`src/ui/design.ts`): `--tc-hour`, `--tc-day-hours`, `--tc-label-lift`, `--tc-minor-lift`, `--tc-columns-top`, `--tc-timeline-top`, `--tc-divider`, `--tc-float-w`, `--tc-now-h`, `--tc-item-inset`, `--tc-item-gap`, `--tc-bar-h`, `--tc-desk-bar-gap`.
- Светлая тема (`body.theme-light`) задаёт только цвета, которые определяет тёмная, — новых имён в ней нет.
- `tests/styles.test.ts` не ослабляется; можно добавлять проверки.
- Специфичность селекторов не падает: где было `.task-calendar > button.tc-plus`, в группе остаётся оно же.
- Удалять файлы только через `trash`. Коммиты — в ветке `design-1-tokens`, с строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Группа селекторов с меньшей специфичностью, чем был отдельный селектор (кнопка теряет скругление, `height: auto` от сброса) — ловит каталог; ревьюер проверяет каждую группу на (a,b,c) против исходного.
2. Порядок правил: общее правило, поставленное ниже частного, перебивает его значение — ловит каталог.
3. Токен, слитый с другим, у которого другое значение в светлой теме — ловит каталог в light; ревьюер сверяет обе темы для каждого слияния.
4. Токен, который читает TS по имени (`tokenPx`, `getPropertyValue`), переименован в CSS, но не в коде — `grep -rn "<old name>" src tests` пустой.
5. Состояния наведения и нажатия (Obsidian красит кнопки на `:hover/:active`) — каталог снимает `hover-row`, `hover-plus`, `active-tile`, `active-row`.

## Как снимать каталог (для каждой задачи)

Тестовый Obsidian уже запущен на порту 9345 со своим хранилищем `/private/tmp/claude-501/-Users-mdmkudryashov-projects-obsidian-my-own-plugins-obsidian-task-tracker/0c3c56ae-d7ba-472c-9889-414bc7a24b09/scratchpad/vault` (проверить `app.vault.adapter.basePath` — это путь с id сессии; чужой Obsidian не трогать и не закрывать). Эталон master лежит в `…/scratchpad/cat/base1`.

```bash
S=/private/tmp/claude-501/-Users-mdmkudryashov-projects-obsidian-my-own-plugins-obsidian-task-tracker/0c3c56ae-d7ba-472c-9889-414bc7a24b09/scratchpad
npm run build && cp main.js manifest.json styles.css $S/vault/.obsidian/plugins/task-calendar/
node -e 'fetch("http://localhost:9345/json").then(r=>r.json()).then(l=>{const ws=new WebSocket(l.find(t=>t.type==="page"&&t.url.startsWith("app:")).webSocketDebuggerUrl);ws.onopen=()=>ws.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression:"(async()=>{await app.plugins.disablePlugin(\"task-calendar\");await app.plugins.enablePlugin(\"task-calendar\");return 1})()",awaitPromise:true}}));ws.onmessage=()=>ws.close()})'
trash $S/cat/after 2>/dev/null; for p in phone mac; do for t in dark light; do node scripts/design-catalog/catalog.mjs $S/cat/after $p $t; done; done
python3 scripts/design-catalog/diff.py $S/cat/base1 $S/cat/after | tail -5
```

Ожидание: последняя строка `0 differ`. Если нет — найти правило по координатам из `box`, вернуть значение; задача не закрыта, пока не `0 differ`. Прогон занимает ~5 минут.

---

### Task 1: Шкалы и токены назначения

**Files:**
- Modify: `styles.css` (блок `body { … }`)
- Test: `tests/styles.test.ts`

**Interfaces:**
- Produces: ступени `--tc-icon-xs` 10px, `--tc-icon-s` 16px, `--tc-icon-m` 18px, `--tc-icon-l` 20px, `--tc-icon-xl` 22px; `--tc-text-7 … --tc-text-22` (по одной ступени на каждый размер шрифта, что есть в файле: 7, 9, 10, 11, 12, 13, 15, 16, 17, 20, 22); `--tc-font-caption: var(--tc-text-13)`; `--tc-stroke-1-8`, `--tc-stroke-1-9`, `--tc-stroke-2`, `--tc-stroke-2-2`, `--tc-stroke-2-4`, `--tc-stroke-2-6`, `--tc-stroke-2-8`, `--tc-stroke-3-6` (значения в px); `--tc-space-20: 20px`.

- [ ] **Step 1: Write the failing test** — в `describe("styles.css keeps to its design system")`:

```ts
it("takes icon sizes, type sizes and stroke widths from their scales", () => {
	const tokens = sheet.tokens;
	const ref = (name: string, scale: RegExp) => expect(tokens.get(name), name).toMatch(scale);
	for (const name of tokens.keys()) {
		if (/^--tc-[\w-]*-(icon|flag)$/.test(name) && !/^--tc-icon-/.test(name)) ref(name, /^var\(--tc-icon-(xs|s|m|l|xl)\)$/);
		if (/^--tc-font-/.test(name) && !["--tc-font-ui", "--tc-font-inherit"].includes(name) && !/var\(--font-/.test(tokens.get(name)!)) ref(name, /^var\(--tc-(text-\d+|font-[\w-]+)\)$/);
		if (/^--tc-stroke-/.test(name) && !/^--tc-stroke-\d/.test(name)) ref(name, /^var\(--tc-stroke-\d[\d-]*\)$/);
	}
});
```

(`sheet` — экземпляр `Stylesheet`, как в соседних тестах; взять тем же способом, что они.)

- [ ] **Step 2:** `npx vitest run tests/styles.test.ts` — FAIL на первом токене иконки.
- [ ] **Step 3:** добавить ступени (раздел «Shape»/«Type»/«Spacing» по смыслу, с одной строкой комментария на шкалу) и перевести на них: 14 токенов иконок и флажков; все `--tc-font-*` размеры (слияния по спеке: `--tc-font-value`, `--tc-font-ask`, `--tc-font-desc-peek` → `var(--tc-font-body)`; `--tc-font-sub`, `--tc-font-group`, `--tc-font-menu-tile`, `--tc-font-desk-place` → `var(--tc-font-caption)`); все `--tc-stroke-*` (`--tc-stroke-desc-mark` → `var(--tc-stroke-2-8)`, где ступень `2.8px`). Отступы из спеки (`--tc-group-gap`, `--tc-menu-gap`, `--tc-section-gap`, `--tc-desc-title-gap`, `--tc-desc-top`, `--tc-picker-remove-gap`, `--tc-popover-gap`, `--tc-whole-margin`, `--tc-sheet-side`) → `var(--tc-space-N)`; `--tc-desk-bar-gap` остаётся литералом. Радиусы: `--tc-radius-seg: calc(var(--tc-seg) / 2)`, `--tc-radius-seg-btn: calc(var(--tc-seg-btn-h) / 2)`, `--tc-radius-bar-btn: calc(var(--tc-bar-btn-h) / 2)`, `--tc-radius-day: calc(var(--tc-day) / 2)`; `.tc-dot` → `--tc-radius-circle`, `--tc-radius-dot` удалить, если больше не читается. Переписать комментарии к `--tc-ink-soft`/`--tc-ink-strong` по факту использования (спека, раздел 2).
- [ ] **Step 4:** `npm test` — PASS (все, включая «uses every token» и «agrees with the measures»).
- [ ] **Step 5:** каталог → `0 differ`.
- [ ] **Step 6: Commit** `git commit -am "Tokens on scales: icon, type and stroke sizes and spacing name a step, the half-height radii are calc"`

### Task 2: Слияние дублей

**Files:**
- Modify: `styles.css`, `src/ui/drag/FloatingCard.ts:55`
- Test: `tests/styles.test.ts` (существующие)

**Interfaces:**
- Consumes: Task 1.
- Produces: удалены `--tc-float-under-1/2`, `--tc-stack-step`, `--tc-stack-inset`, `--tc-place-h`, `--tc-picker-w`, `--tc-desc-peek-w`, `--tc-menu-tile-ring`, `--tc-allday-left/right` (и их light-копии); `FloatingCard` читает `--tc-stack-step-x`.

- [ ] **Step 1:** для каждой пары из таблицы спеки (раздел 2) — сверить значения в `body` и `body.theme-light`; заменить чтения уходящего токена на оставшийся, удалить уходящий в обеих темах. `--tc-radius-time-pill` НЕ сливать.
- [ ] **Step 2:** `grep -rn -- "--tc-float-under-\|--tc-stack-step\b\|--tc-stack-step:\|--tc-stack-inset\|--tc-place-h\|--tc-picker-w\|--tc-desc-peek-w\|--tc-menu-tile-ring\|--tc-allday-left\|--tc-allday-right" styles.css src tests` — пусто.
- [ ] **Step 3:** `npm test` PASS, `npx tsc --noEmit` PASS.
- [ ] **Step 4:** каталог → `0 differ`.
- [ ] **Step 5: Commit** `"One token per concept: the stack's colours and steps, the bar button's height, the 300 width, the select ring, the timeline's insets"`

### Task 3: Составные токены

**Files:** Modify: `styles.css`

**Interfaces:**
- Produces: `--tc-ring-selected: inset 0 0 0 var(--tc-select-ring) var(--tc-accent)`; `--tc-band: var(--tc-group-gap) solid var(--tc-gap-ink)`; `--tc-rule: var(--tc-hairline-half) solid var(--tc-separator)`; по токену на каждый различный градиент маски затухания (`--tc-fade-…`, имя по месту: `--tc-fade-card-end`, …).

- [ ] **Step 1:** заменить 3 кольца выбора (правила с `inset 0 0 0 var(--tc-select-ring) var(--tc-accent)`), 7 полос, 3 разделителя, 8 пар масок (`-webkit-mask-image` и `mask-image` получают один и тот же `var(--tc-fade-…)`). Значение токена — ровно то, что стояло в правиле.
- [ ] **Step 2:** `npm test` PASS.
- [ ] **Step 3:** каталог → `0 differ`.
- [ ] **Step 4: Commit** `"Composite tokens: the select ring, the band between menu groups, the hairline rule, the fade masks"`

### Task 4: Общие правила вместо копий

**Files:**
- Modify: `styles.css`
- Test: `tests/styles.test.ts`

**Interfaces:**
- Produces: токены `--tc-column-pad-near: 0 var(--tc-space-2) 0 var(--tc-space-10)` и `--tc-column-pad-far: 0 var(--tc-space-10) 0 var(--tc-space-2)` (точная запись — как сейчас в правилах колонок, через токены).

- [ ] **Step 1: Write the failing test**

```ts
it("resets a button in one rule", () => {
	expect(sheet.rules.filter((d) => d.property === "appearance").map((d) => d.selector)).toHaveLength(1);
});
```

- [ ] **Step 2:** `npx vitest run tests/styles.test.ts` — FAIL (два `appearance`: сброс и `.tc-source-refresh`).
- [ ] **Step 3:** по спеке, раздел 4:
  - сброс кнопки — одно правило на месте `.task-calendar button` со всеми контейнерами (`.task-calendar`, `.tc-panel`, `.tc-picker`, `.tc-popover`, `.tc-quick-bar` + ` button`), с `padding: 0`; удалить отдельное правило сброса для `.tc-panel/.tc-picker/.tc-quick-bar button`, лишние `padding: 0` (их снимет каталог, если какой-то нужен) и сброс внутри `.tc-popover .tc-source-refresh` (оставить там только своё: размеры, полоса, цвет, шрифт, flex);
  - круглая кнопка — одна группа общих объявлений с селекторами `.task-calendar > button.tc-plus`, `.task-calendar > .tc-plus-ring`, `.task-calendar > button.tc-undo`, `.tc-float-plus` (точные селекторы — те, что стоят сейчас у каждой; специфичность не ниже); общая позиция нижнего ряда для первых трёх; общее SVG-правило (размер, `stroke: currentColor`), толщина — в своих правилах;
  - окно — общая группа `.tc-panel`, `.tc-popover`, `.tc-desc-peek` (радиус, `overflow`, `box-sizing`); фон и тень — общие только у `.tc-panel` и `.tc-desc-peek` (у `.tc-popover` пока свои токены — это этап 2); два правила `.tc-panel` подряд — в одно;
  - типографика заново — одна группа (селекторы по спеке), объявления `font-family`, `font-weight`, `line-height`, `color` убрать из каждого;
  - несомое под пальцем — одна группа (`.tc-float`, `.tc-float-plus`, `.tc-float-under`, `.tc-section-float`, `.tc-float-count`, — те, у кого все шесть объявлений совпадают);
  - пилюли полоски времени и броска, их строки — общее правило, цвет свой;
  - одинаковые `transition` у `.tc-card` и `.tc-group-head` — одна группа;
  - отступы колонок — два токена.
  После каждой группы смотреть, не поменялся ли порядок каскада для элементов, у которых ниже по файлу есть частные правила.
- [ ] **Step 4:** `npm test` PASS.
- [ ] **Step 5:** каталог → `0 differ`, включая `hover-*`, `active-*`, `settings`.
- [ ] **Step 6: Commit** `"One rule per kind: the button reset, the round button, the window, the type of what hangs on the body, the carried things, the time pills"`

### Task 5: Итог и релиз-готовность

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run lint` (если скрипт есть) — всё зелёное.
- [ ] **Step 2:** каталог последний раз → `0 differ`; число строк `styles.css` и число токенов до/после — в «Итог» спеки.
- [ ] **Step 3:** заполнить «Итог» спеки этапа 1 и строку этапа 1 в «Ход работы» обзора (план — готов, реализация — пройдена).
- [ ] **Step 4: Commit** `"Spec: stage 1 done, the catalog unchanged"`
