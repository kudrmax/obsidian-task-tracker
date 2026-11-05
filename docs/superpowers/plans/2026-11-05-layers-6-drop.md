# Блок 6 «Смысл drop'а» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Что значит бросок карточки — таблица spec §5.1 «откуда → куда → какая операция», правила вложенности (уровни, родитель, `before`) и правила приёма (кто куда ложится) — отвечает `application`. UI меряет зазоры, ловит палец, рисует линию и уровень и описывает жест: откуда, куда, какой день. Одна карточка и несколько идут одним вызовом `tasks.drop`. Поведение, вид, `data.json` и запись в файл — те же: каждый бросок, одиночный и групповой, из каждой колонки в каждую цель, секции, вложение, слот таймлайна и обратно, пишет то же, что сейчас; подсветка зон, линия места и уровень — те же. Плюс (новая задача) берёт смысл места из того же правила, что и карточка.

**Architecture:** Типы броска — в `contracts.ts`: `DropColumn`, `DropFrom`, `DropOrigin`, `DropTo`, `DroppedTask`, `TaskService.drop`. Таблица §5.1 и правила приёма — `application/drops.ts` (чистые функции; `runDrop` вызывает у сервиса ту же одиночную операцию, что и сейчас, а для нескольких — `applyAll`). Правила вложенности — `application/nesting.ts`. Контракты отдают UI `acceptsDrop`, `placesInGap` и функции вложенности, как уже отдают `samePlace`. В `ui/drag` остаются геометрия (`placeAt` по пикселям, гистерезис, уровень от середины списка), подсветка и линия.

**Tech Stack:** TypeScript, vitest + happy-dom, esbuild, Obsidian (тестовый, CDP).

**Spec:** `docs/superpowers/specs/2026-11-05-layers-6-drop-design.md`, обзор `2026-11-05-layers-overview.md`.

## Что в спеке уже не так (сверено с master 3b480f2, после блока 5)

- **`drop(keys, from, …)` с одним `from` не годится для нескольких.** Выбранные карточки несут каждая свою колонку (`CarriedTask.from`): ⌘-клик берёт карточки из дня, Soon и Inbox сразу, и `dropChange` считает операцию для каждой по её колонке. Поэтому `drop(tasks: readonly DroppedTask[], to, day)`, где `DroppedTask = { key, from }`. Шаг `TaskChange` `{ kind: "drop" }` не нужен: `drop` сам принимает несколько задач, и `BulkController.dropSteps`/`dropChange` уходят целиком, а не превращаются в шаг.
- **Одна карточка — та же одиночная операция, что сейчас, а не `applyAll`.** Сейчас одиночный бросок зовёт `setSlot`, `clearSlot`, `moveToGroup`, `nest`, `moveBefore`, `moveToList`, `moveToSoon`, `moveToEnd`, а групповой — `applyAll` с шагами. `applyAll` не знает `setSlot`/`clearSlot` и по-своему пропускает подзадачи и повторные ключи, поэтому `runDrop` сохраняет развилку: одна задача — одиночный метод сервиса, несколько — `applyAll` с теми же операциями (слот и снятие слота для нескольких пропускаются, как в `dropChange`; на таймлайн несколько и так не ложатся). Таблица одна — `dropMove(from, to, day)`.
- **Форма `DropTo`.** `listBefore` становится `{ kind: "list", column, before }`; `column` — любая из четырёх колонок (`DropColumn`), не только `"left" | EndList`: колонка дня — тоже `"list"`. `clearSlot` остаётся: сейчас его не производит ни одна цель (тесты `DragSession`/`DragController` берут его как заглушку), но это строка таблицы, и `clearSlot(key)` она пишет как сейчас.
- **«Чужая карточка в список без секций — в конец».** Список без секций — только колонка прошедшего дня (Soon, Inbox и Backlog показывают секции всегда). UI спрашивает `placesInGap(column, from, grouped)` — где показать линию (в зазоре или в конце); правило живёт в `application` рядом с таблицей, а сама таблица `"list"` переносится дословно и `before` не переписывает: проверка в сервисе поменяла бы запись для бросков, которых UI не собирает (с таймлайна или чужой колонки в список с `before`), а характеризующие тесты держат таблицу как есть. В конец кладёт `before: null`, который UI ставит по `placesInGap`, — как сейчас.
- **`accepts(from, to, count)` → `acceptsDrop(target, origins)`.** Приём зависит от колонки-цели и колонок всех несомых задач: Inbox и Backlog берут из Inbox, Backlog, Soon и плюс; Soon — всё, кроме таймлайна; день — всё; таймлайн — не больше одной. `ListDrop.takes` уже проверяет каждую несомую по её колонке — эта проверка и есть `origins.every`. `ListDrop` получает правило от вида (`(origins) => acceptsDrop(column, origins)`), `TimelineDrop` спрашивает его сам; `undatedTakes` и проверка `carriesMany` в `TimelineDrop.hitTest` уходят.
- **Подзадача выбранной задачи.** `BulkController.carried` выкидывает выбранную карточку, лежащую в поддереве другой выбранной: это не политика броска, а то, что показывает поднятая стопка (свёрнутые и пунктирные места) и решает, одна ли карточка несётся (кольцо отмены, таймлайн). Фильтр остаётся в UI; `applyAll` и так пропускает подзадачу переносимой задачи.
- **Правила вложенности целиком, а не `levelsAt(above, below)`.** Сейчас `levelRange(cards, index, group)`, `fitLevel`, `shiftLevel`, `resultOf`, `gapOf` в `ui/drag/listPlace.ts` работают с индексами карточек и секцией зазора, без пикселей; быстрый ввод (`QuickEntry`, `QuickEntryController`) зовёт те же функции. Они переезжают в `application/nesting.ts` с прежней формой: `resultOf` → `placeOfGap`, `gapOf` → `gapOfPlace`, `PlaceResult` → `ListPlace`; `LevelCard`, `ListCard`, `GapPlace` — туда же. В `listPlace.ts` остаются `placeAt` (палец, середины карточек, заголовки, гистерезис), `sameGap`, `PlacedCard`, `PlacedHead`. Плюс и карточка по-прежнему одна механика: оба берут уровень от середины списка (`ListDrop.levelAt`) и смысл места из `placeOfGap`.
- **Строки стража.** Ни одна строка `ALLOWED` не про drop (`settings.ts`, `ports.ts`); вычёркивать, вероятно, нечего — проверяется тестом стража.
- **Недостижимое.** Сейчас бросок с таймлайна с несомыми карточками шёл бы одиночным (`dropSteps` отдаёт null для `timeline`), но карточка таймлайна никогда не несёт других (`attachBlock` не спрашивает `carried`). Вид передаёт в `drop` то, что несёт жест; для достижимых бросков это то же.
- **Демо.** `DemoTaskService.drop` — тот же `runDrop` над своими методами (групповой `applyAll` у демо ничего не делает, как и сейчас).

## Global Constraints

- Рефакторинг: ни вида, ни записи в файл, ни `data.json`, ни поведения не меняется. `docs/plugin/` не меняется.
- Сначала характеризующие тесты таблицы §5.1 против текущего кода (все пары «откуда/куда», по одному и группой, с текстом файла после броска), потом перенос; ожидания не меняются.
- Перенос правила = перенос его тестов: `resultOf`/уровни/`gapOf` из `tests/ui/listPlace.test.ts` → `tests/application/nesting.test.ts`; `dropSteps` из `tests/ui/BulkActions.test.ts` → таблица в `tests/application/drops.test.ts`; в UI остаются тесты, что вид спрашивает правило. Ни одно ожидание не ослабляется и не пропускается.
- Контракты только добавляют: `DropColumn`, `DropFrom`, `DropOrigin`, `DropTo`, `DroppedTask`, `TaskService.drop`, функции `acceptsDrop`, `placesInGap`, `levelRange`, `fitLevel`, `shiftLevel`, `placeOfGap`, `gapOfPlace` и их типы; `drop` — и в `tests/fakes/DemoTaskService.ts`.
- `ALLOWED` в страже — ровно оставшиеся нарушения.
- Стиль соседнего кода: табы, короткие английские doc-комментарии.
- `npm test`, `npm run build:demo`, `npm run build` (последней) зелёные; `phone/task-calendar-phone.js` пересобирается и коммитится, если изменился.

---

### Task 1: Характеризующие тесты броска

**Files:**
- Create: `tests/application/drops.test.ts`

- [x] Файл с Inbox (секция), Now (секции, подзадачи, задача на слоте), Soon (с датой и без, секция), Backlog; сегодня T, позже D, раньше P. Одиночные броски — дословная копия таблицы `applyDrop` поверх `TaskServiceImpl`; групповые — настоящий `BulkController.dropSteps` и `applyAll`. Каждый случай сверяет текст файла после броска (inline-снимок с текущего кода).
- [x] Одиночные: день, Soon, Inbox, Backlog, таймлайн → слот; таймлайн → день (сегодня и другой день), секция, вложение; день → день (прошедший, `before` и конец), Soon/Inbox/Backlog → день прошедший и сегодня; каждая колонка → секция Now, Soon с датой и без, Inbox, Backlog; каждая колонка → вложение; `"list"` Soon/Inbox своей карточкой с `before` и без, день → Soon в конец; `clearSlot`; подзадача → секция.
- [x] Групповые: день + Soon → день прошедший; день + Soon + Inbox → секция Now; два → вложение; Soon + Inbox → Backlog; день + Soon → Soon в конец; задача со своей подзадачей → секция.
- [x] `npm test` — PASS. Commit.

### Task 2: Правила вложенности в `application`

**Files:**
- Create: `src/application/nesting.ts`, `tests/application/nesting.test.ts`
- Modify: `src/application/contracts.ts`, `src/ui/drag/listPlace.ts`, `src/ui/drag/ListDrop.ts`, `src/ui/TaskList.ts`, `src/ui/quick/QuickEntry.ts`, `src/ui/quick/QuickEntryController.ts`, `tests/ui/listPlace.test.ts`

```ts
// application/nesting.ts
export interface LevelCard { readonly level: number; readonly group: GroupName }
export interface ListCard extends LevelCard { readonly key: TaskKey }
export interface GapPlace { readonly kind: "gap"; readonly index: number; readonly level: number; readonly group: GroupName }
export type ListPlace = { kind: "task"; group; before } | { kind: "subtask"; parent; before };
export function levelRange(cards, index, group): { min; max };
export function fitLevel(cards, place): GapPlace;
export function shiftLevel(cards, place, delta): GapPlace | null;
export function placeOfGap(cards, place): ListPlace;   // was resultOf
export function gapOfPlace(cards, place): GapPlace;    // was gapOf
```

- [x] Функции и типы переезжают как есть; контракты их отдают. UI импортирует из контрактов; `listPlace.ts` оставляет геометрию.
- [x] Тесты `resultOf`, «the level a place may take», «the gap a result means» → `tests/application/nesting.test.ts` (те же карточки, те же ожидания); в `listPlace.test.ts` остаются `placeAt`, гистерезис, секции (они зовут `placeOfGap` из контрактов, как и `ListDrop`).
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 3: Таблица §5.1 и приём в `application`, `tasks.drop`

**Files:**
- Create: `src/application/drops.ts`
- Modify: `src/application/contracts.ts`, `src/application/TaskServiceImpl.ts`, `tests/fakes/DemoTaskService.ts`, `tests/application/drops.test.ts`

```ts
// contracts.ts
export type DropColumn = "left" | "soon" | "inbox" | "backlog";
export type DropFrom = DropColumn | "timeline";
export type DropOrigin = DropFrom | "new";
export type DropTo =
	| { readonly kind: "slot"; readonly slot: Slot }
	| { readonly kind: "clearSlot" }
	| { readonly kind: "list"; readonly column: DropColumn; readonly before: TaskKey | null }
	| { readonly kind: "group"; readonly list: GroupedList; readonly date: LocalDate | null; readonly group: GroupName; readonly before: TaskKey | null }
	| { readonly kind: "nest"; readonly parent: TaskKey; readonly before: TaskKey | null };
export interface DroppedTask { readonly key: TaskKey; readonly from: DropFrom }
interface TaskService { drop(tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): Promise<void> }
// application/drops.ts
export function acceptsDrop(target: DropColumn | "timeline", origins: readonly DropOrigin[]): boolean;
export function placesInGap(column: DropColumn, from: DropOrigin, grouped: boolean): boolean;
export function runDrop(service: TaskService, tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): Promise<void>;
```

- [x] `dropMove(from, to, day)` — таблица `applyDrop` дословно (слот, снятие слота, секция, вложение, с таймлайна на список, колонка дня, `before`, из дня в Soon, в конец); `runDrop`: одна задача — одиночный метод, несколько — `applyAll` с операциями, кроме слота и снятия слота.
- [x] `TaskServiceImpl.drop` и `DemoTaskService.drop` — `runDrop(this, …)`.
- [x] Характеризующие тесты бегут через `svc.drop` (копия таблицы и `dropSteps` из теста уходят), ожидания те же. Тесты `acceptsDrop` (каждая цель × каждая колонка, несколько на таймлайн, плюс) и `placesInGap`.
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 4: UI описывает жест

**Files:**
- Modify: `src/ui/drag/DropTarget.ts`, `src/ui/drag/ListDrop.ts`, `src/ui/drag/TimelineDrop.ts`, `src/ui/TaskCalendarView.ts`, `src/ui/BulkController.ts`, `src/ui/quick/QuickEntryController.ts`, `tests/ui/ListDrop.test.ts`, `tests/ui/BulkActions.test.ts`, `tests/ui/QuickEntryController.test.ts`

- [x] `DropResult` = `DropTo`, `ListColumn`/`TaskOrigin`/`DragOrigin` = `DropColumn`/`DropFrom`/`DropOrigin`; `originsOf(drag)`, `droppedTasks(drag)`.
- [x] `ListDrop`: `accepts(origins)`, `placesInGap` вместо `placesAnywhere`, `"list"` вместо `"listBefore"`. `TimelineDrop.hitTest` — `acceptsDrop("timeline", originsOf(drag))`. Вид: `undatedTakes` уходит, колонки получают `acceptsDrop`.
- [x] `applyDrop` — `bulk.dropping(drag)` (выбор отпускается, как в `dropSteps`) и один `tasks.drop(droppedTasks(drag), result, selectedDate)`. `dropSteps`/`dropChange` удалены; тест UI — несколько несомых отпускают выбор, одна — нет.
- [x] `grep -rnE "moveToList|moveToSoon|moveToEnd|moveBefore|clearSlot|nest\(" src/ui` — только меню и быстрый ввод (не бросок); страж — `ALLOWED` по факту.
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 5: Сборки, проверка в тестовом Obsidian, ход работы

- [x] `npm test`, `npm run build:demo`, `npm run build` — PASS; `phone/task-calendar-phone.js` — без изменений или закоммичен.
- [x] Тестовый Obsidian (порт 9371, свой профиль и vault в scratchpad; `basePath` — свой vault): сборка ветки в `.obsidian/plugins/task-calendar/`, плагин перезагружен; Mac и телефон (390×844, `app.emulateMobile(true)`), светлая и тёмная: Soon → день, день → таймлайн и обратно, карточка на другую подзадачей, карточка в зазор секции; на Mac две выбранные Soon → день. Файл после каждого броска; ошибок плагина в консоли нет; файл задач восстановлен.
- [x] Строка 6 в «Ход работы» обзора: план, реализация, проверка — готово. Commit.
