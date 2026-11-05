# Блок 3 «Приоритет в тексте задачи» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** как префикс приоритета читается из текста, какие уровни годятся и что такое «пустой ввод» — одно правило в `domain/Priority.ts`. UI спрашивает `TaskService` (`priorityLevels`, `parseTitle`, `isBlank`, `withPriority`) и берёт `PriorityLevel`/`PriorityColor`/`PRIORITY_COLORS` из контрактов. Поведение, вид, `data.json` и формат файла — те же, кроме выравнивания из спеки: поле узнаёт префикс так же, как файл (`p1⇥x`, `p1  x`).

**Architecture:** `priorityOfText`, `isBlankTitle`, `withPriority` в `domain/Priority.ts`; `TaskLine.priorityOf` идёт через `priorityOfText`. `TaskServiceImpl` отвечает на четыре новых вызова из уровней настроек (`usableLevels`) и отсекает пустой ввод при созданиях через `isBlankTitle`. `QuickField` получает `parseTitle`, `QuickEntry` — `isBlank`, `QuickEntryController` — всё из `deps.tasks`; `QuickBar`, меню и массовые действия получают уже годные уровни из `priorityLevels()`.

**Tech Stack:** TypeScript, vitest + happy-dom, esbuild, Obsidian (тестовый, CDP).

**Spec:** `docs/superpowers/specs/2026-11-05-layers-3-priority-design.md`, обзор `2026-11-05-layers-overview.md`.

## Что в спеке уже не так (сверено с master 4ac50bc, после блока 2)

- **Строки сдвинулись:** `levelOfText` — `QuickField.ts:39–41`, в `QuickEntryController.ts` — `levelOf` `:599`, `choosePriority` `:605`, `openField` `:665`; `blank` — `QuickEntry.ts:384`. `usableLevels` в `TaskCalendarView.ts` (`:190` массовые действия, `:919` меню задачи), `QuickEntryController.ts` (`:179`, `:600`, `:608`, `:665`), `QuickBar.ts:227`. Смысл тот же.
- **`p1 ` подсвечивается сразу.** Файл читает текст уже обрезанным, поэтому `FIRST_WORD_RE = /^(\S+)\s+(\S.*)$/` и `/^(\S+)\s+(.*)$/` для файла дают одно и то же. Поле же видит `p1 ` до того, как набран текст, и сейчас красит его (`docs/plugin/tasks.md`: «Префикс `p1 ` в начале текста сразу ставит приоритет»). `priorityOfText` берёт вторую форму: для файла ничего не меняется, `p1 ` в поле — уровень `p1` и пустой текст, то есть пусто, как и было.
- **«Строка из одного префикса» — `p1 `, а не `p1`.** UI сейчас отсекает только префикс с пробелом; `p1` без пробела пишется задачей «p1» без уровня (так её читает и файл). `isBlankTitle` = текст после префикса пуст: `p1 ` и `p1⇥` — пусто, `p1` — задача. Так спека и выходит верной: через UI в сервис пустое и сейчас не доходит.
- **Создания в сервисе:** `createInList`, `createInSoon`, `createAtTime`, `createInPlace`, `create`, `createSubtask` идут через `isBlankTitle`. `edit` и `rename` — не создания: у них остаётся `trim() === ""`, как и у имён секций.
- **Строки стража.** Только `PriorityLevel`/`PriorityColor`/`PRIORITY_COLORS`/`usableLevels` из `settings.ts` берут 9 файлов: `BulkController.ts`, `TaskCard.ts`, `menu/BulkMenu.ts`, `menu/MenuPanel.ts`, `menu/TaskMenu.ts`, `priorityLevels.ts`, `quick/QuickBar.ts`, `quick/QuickEntry.ts`, `quick/QuickField.ts` — их строки вычёркиваются (21 → 12). `QuickEntryController.ts` ещё берёт `RightMode`, `TaskCalendarView.ts` — `RightMode`, `TaskCalendarSettings` и др.: их строки остаются до блока 10, хотя `usableLevels` из них уходит. `priorityLevels.ts` (правки уровней во вкладке настроек) берёт только типы и цвета — его строка вычёркивается; сама вкладка остаётся.
- **Тестов фильтра уровней в UI нет** (`usableLevels` покрыт в `tests/domain/Priority.test.ts`). Тесты разбора префикса в `tests/ui/QuickField.test.ts` и пустого ввода в `tests/ui/QuickEntry.test.ts` остаются как тесты того, что UI берёт ответ у сервиса (их фейки отвечают доменными функциями); само правило получает тесты в `tests/domain/Priority.test.ts` и `tests/application/TaskServiceImpl.test.ts`.

## Global Constraints

- Рефакторинг: ни вида, ни записи в файл, ни `data.json` не меняется; поведение — только выравнивание из спеки. `docs/plugin/` не меняется (`p1 ` по-прежнему сразу ставит приоритет).
- Перенос правила = перенос его тестов; ни одно ожидание не ослабляется и не пропускается.
- Контракты только добавляют: реэкспорт `PriorityLevel`, `PriorityColor`, `PRIORITY_COLORS` и четыре метода `TaskService`; они же в `tests/fakes/DemoTaskService.ts`.
- `ALLOWED` в страже — ровно оставшиеся нарушения.
- Стиль соседнего кода: табы, короткие английские doc-комментарии.
- `npm test`, `npm run build:demo`, `npm run build` (последней) зелёные; проверка в тестовом Obsidian (телефон и Mac, светлая и тёмная).

---

### Task 1: Правило в домене

**Files:**
- Modify: `src/domain/Priority.ts`, `src/domain/TaskLine.ts`, `tests/domain/Priority.test.ts`

**Interfaces:**
```ts
export function priorityOfText(text: string, prefixes: readonly string[]): { priority: string | null; text: string };
export function isBlankTitle(text: string, prefixes: readonly string[]): boolean;
export function withPriority(text: string, prefix: string | null, prefixes: readonly string[]): string;
```
`priorityOfText`: первое слово — префикс, за ним пробельные символы; текст — всё после них. `isBlankTitle`: текст без префикса пуст после `trim`. `withPriority`: префикс текста снят, `prefix` (если есть) — первым через пробел.

- [ ] Тесты: `p1 x`, `p1⇥x`, `p1  x` → `p1`/`x`; `p1 ` → `p1`/пусто; `p1`, `p1x`, `x`, ` p1 x`, `p3 x` (не уровень) → без уровня, текст как был; пусто: `""`, `"  "`, `p1 `, `p1⇥`, но не `p1`, `p1 x`; `withPriority`: заменяет `p1 x` → `p2 x`, снимает (`null`) → `x`, ставит на текст без префикса.
- [ ] `TaskLine.priorityOf` → `priorityOfText(text, markers.priorities ?? [])`; тесты `TaskLine` без изменений.
- [ ] `npm test` — PASS. Commit `Priority prefix in a text is one domain rule: the level, the text after it, blank, another level in its place`.

### Task 2: Сервис отвечает про уровни и текст

**Files:**
- Modify: `src/application/contracts.ts`, `src/application/TaskServiceImpl.ts`, `tests/fakes/DemoTaskService.ts`, `tests/application/TaskServiceImpl.test.ts`

- [ ] `contracts.ts`: `export type { PriorityColor, PriorityLevel }`, `export { PRIORITY_COLORS }` из `domain/Priority`; в `TaskService` — `priorityLevels()`, `parseTitle(text)`, `isBlank(text)`, `withPriority(text, prefix)` с doc-комментариями из спеки.
- [ ] `TaskServiceImpl`: четыре метода над `usableLevels(settings.priorities)`; создания отсекают пустое через `isBlankTitle`.
- [ ] `DemoTaskService`: те же методы над `usableLevels(DEFAULT_SETTINGS.priorities)` через доменные функции.
- [ ] Тесты сервиса: годные уровни (одно слово, первый из двух одинаковых, порядок настроек); `parseTitle` даёт уровень с цветом; `isBlank`; `withPriority`; `createInPlace("p1 ")` и `create({ text: "p1 " })` ничего не пишут, `createInPlace("p1")` пишет задачу «p1».
- [ ] **Табличный тест** (спека): для `"p1 x"`, `"p1\tx"`, `"p1  x"`, `"p1 "`, `"p1"`, `"p1x"`, `"x"` — то, что отвечает поле (`parseTitle`, `isBlank`), совпадает с тем, что окажется в файле: `createInPlace(s, null, …)` и чтение обратно (`dayView`) дают тот же уровень и текст, а пустое не пишется.
- [ ] `npm test` — PASS. Commit `The task service answers the usable levels, a typed title's level and text, blank, and a level in its place; creating skips a prefix alone`.

### Task 3: UI спрашивает сервис

**Files:**
- Modify: `src/ui/quick/QuickField.ts`, `src/ui/quick/QuickEntry.ts`, `src/ui/quick/QuickEntryController.ts`, `src/ui/quick/QuickBar.ts`, `src/ui/TaskCalendarView.ts`, `src/ui/BulkController.ts`, `src/ui/TaskCard.ts`, `src/ui/menu/BulkMenu.ts`, `src/ui/menu/MenuPanel.ts`, `src/ui/menu/TaskMenu.ts`, `src/ui/priorityLevels.ts`, тесты UI с этими опциями, `tests/architecture.test.ts`

- [ ] `QuickField`: `levels` → `parseTitle: TaskService["parseTitle"]`; `levelOfText` удалён.
- [ ] `QuickEntry`: `deps.levels` → `deps.isBlank: TaskService["isBlank"]`; свой `blank` спрашивает его.
- [ ] `QuickEntryController`: `deps.levels` удалён; `deps.tasks` — ещё `priorityLevels`, `parseTitle`, `isBlank`, `withPriority`; `levelOf` — выбранный уровень из `priorityLevels()`, иначе `parseTitle(text).priority`; выбор в панели — `withPriority(text, null)`, если набран префикс.
- [ ] `QuickBar`: уровни из deps уже годные, свой `usableLevels` уходит. `TaskCalendarView`: массовые действия и меню задачи — `tasks.priorityLevels()`.
- [ ] Импорты `PriorityLevel`/`PriorityColor`/`PRIORITY_COLORS` в UI (кроме `SettingsTab.ts`, `TaskCalendarView.ts`, `QuickEntryController.ts` для прочих настроек) — из контрактов.
- [ ] Фейки тестов UI отвечают доменными функциями (тот же ответ, что у сервиса); ожидания не меняются.
- [ ] Страж: вычеркнуть 9 строк. `grep -rn "levelOfText\|usableLevels\|startsWith(\`" src/ui` — пусто.
- [ ] `npm test`, `npx tsc --noEmit` — PASS. Commit `The quick field, the bar and the menus ask the task service for the levels and the prefix; priority types come from the contracts`.

### Task 4: Сборки, проверка в тестовом Obsidian, ход работы

- [ ] `npm test`, `npm run build:demo`, `npm run build` — PASS.
- [ ] Тестовый Obsidian (порт 9367, свой профиль и vault в scratchpad; `basePath` — свой vault): сборка ветки в `.obsidian/plugins/task-calendar/`, плагин перезагружен; Mac и телефон (390×844, `app.emulateMobile(true)`), светлая и тёмная: `p1 Тест` в быстром вводе красит поле, выбор уровня в панели снимает набранный префикс и ставит выбранный, после Enter строка в файле — `- [ ] p1 Тест` / с выбранным уровнем; ошибок плагина в консоли нет.
- [ ] Строка 3 в «Ход работы» обзора: план, реализация, проверка — готово. Commit `Layers overview: block 3 planned, done and checked in Obsidian`.
