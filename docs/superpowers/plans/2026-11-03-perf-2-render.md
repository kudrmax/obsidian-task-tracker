# Блок 2 «Перерисовывать только то, что изменилось» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** события, минута, колонки и разделитель больше не пересобирают списки задач; одинаковые данные не перерисовывают ничего; дата в заголовке меняется сразу; таймлайн нарисован до первой загрузки.

**Architecture:** `DayData` сообщает, какая часть изменилась, и молчит, если данные те же. Вид делит `render()` на три части (каркас, задачи, события) и откладывает их через маленький класс `ScreenParts`, пока жест держит экран. Минутный тик двигает только линию «сейчас» (`Timeline.tickNow`). Решение «что делать при смене настроек» — чистая функция.

**Tech Stack:** TypeScript, vitest + happy-dom, Obsidian API.

**Spec:** `docs/superpowers/specs/2026-11-03-perf-2-render-design.md`

## Global Constraints

- Вид и анимации не меняются ни на пиксель.
- Таймлайн рисует задачи и события вместе (общая раскладка) — часть «задачи» и часть «события» обе перерисовывают таймлайн; списки — только «задачи».
- `src/settings.ts` и `src/application/contracts.ts` не меняются.
- Стиль кода как в соседних файлах; комментарии короткие, английские, только где нужны.
- `npm test`, `npm run build` (собирает и `scriptable/`; сгенерированный бандл коммитится вместе с изменениями `src/domain`, если они будут).

## Review Focus

1. Жест держит экран (перетаскивание) и в это время приходят и задачи, и события: после отпускания перерисованы обе части, ничего не потеряно.
2. Смена дня во время ожидания данных: заголовок показывает новую дату, а пришедшие позже данные старого дня не рисуются поверх (сейчас `DayData` берёт `date()` в момент запроса — проверить, что порядок применения не меняется).
3. Вкладка скрыта несколько часов через полночь (граница дня): при возвращении — один тик с нормализацией и перезагрузкой, заголовок «Today» указывает на новый день.
4. Быстрый ввод открыт: после частичной перерисовки (только события) поле ввода остаётся на месте и в фокусе (`quick.rendered()` зовётся после любой части, которая трогает списки или таймлайн).
5. Файл задач пропал (`missing`) и вернулся: плашка и колонки переключаются при части «задачи», события в это время не рисуются.

---

### Task 1: `DayData` говорит, что изменилось, и молчит о том же самом

**Files:**
- Modify: `src/ui/DayData.ts`
- Test: `tests/ui/DayData.test.ts`

**Interfaces:**
- Produces: `export type DayPart = "tasks" | "events";` и в `DayDataDeps` — `readonly onUpdate: (part: DayPart) => void;`.
- Применение задач: если новое `TasksState` равно текущему по содержимому (`JSON.stringify` обоих) — состояние не меняется и `onUpdate` не зовётся. То же для событий (`DayEvents`). `showCached` при смене дня, если кеш даёт другие события, тоже сообщает `"events"` при следующем применении — как сейчас, через `show`.

- [ ] **Step 1: Тесты** (существующие тесты перевести на `onUpdate: (part) => updates.push(part)`; ожидания по числу обновлений сохранить, где данные действительно меняются):
  - `"tells the tasks changed and not the events"`: изменение файла → `updates` = `["tasks"]`.
  - `"stays silent when the tasks read are the same"`: два `data.tasks()` подряд без изменения файла → одно обновление (первое), второе — нет.
  - `"stays silent when a poll brings the same events"`: два `data.calendars()` с тем же ответом → одно `"events"`.
  - `"tells the events changed when a poll brings new ones"`.
- [ ] **Step 2:** `npx vitest run tests/ui/DayData.test.ts` — FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** PASS; `npx tsc --noEmit` покажет место в `TaskCalendarView` — временно `onUpdate: () => this.render()` (Task 2 заменит).
- [ ] **Step 5:** Commit `Day data: tells which part changed, and nothing when it is the same`.

### Task 2: Три части экрана

**Files:**
- Create: `src/ui/ScreenParts.ts`
- Modify: `src/ui/TaskCalendarView.ts`, `src/ui/TaskSelection.ts`, `src/ui/ColumnHeaders.ts` (если `render` заголовка требует), `src/ui/quick/QuickEntryController.ts` (только тип `render`, если нужно)
- Test: `tests/ui/ScreenParts.test.ts`, `tests/ui/BulkActions.test.ts` или новый `tests/ui/TaskSelection.test.ts`

**Interfaces:**
- Produces: `export type ScreenPart = "frame" | "tasks" | "events";`
- `export class ScreenParts { constructor(deps: { busy: () => boolean; draw: (parts: ReadonlySet<ScreenPart>) => void }); request(...parts: ScreenPart[]): void; flush(): void }` — `request` при `busy()` копит части, иначе сразу зовёт `draw` с ними; `flush` (на `arbiter.onIdle`) рисует накопленное одним вызовом и очищает. Пустой набор — ничего.
- В виде: `render()` остаётся и значит `parts.request("frame", "tasks", "events")` (для мест, где перерисовывается всё: имя секции, `css-change`, быстрый ввод `deps.render`). Новый приватный `draw(parts)`:
  - `frame` → `fitListWidth`, `headers.render`, `switcher.render`, `showMode`.
  - `tasks` → `bulk.selection.forgetDrawn()`, три `TaskList.render`, плашка `missing` и видимость колонок, `timeline.render()`, прокрутка к дню (тот же блок `scrolledFor`, что сейчас).
  - `events` → `renderAllDayRows`, `timeline.render()` (один раз, если в наборе и `tasks`).
  - после любой части, кроме одного `frame`, — `quick?.rendered()`; после одного `frame` — тоже `quick?.rendered()` (поле стоит в колонке, ширина которой могла поменяться).
- `DayData.onUpdate` → `parts.request(part)`.
- `css-change` → `parts.request("events")` (цвета событий считаются в коде; карточки задач — токенами CSS).
- `setMode`: после `showMode(mode)` — `parts.request("frame")`; `settings.update({ rightMode })` больше не ждётся перед этим и не зовёт `render()` (`void` с обработкой ошибки как у соседних `void`-вызовов).
- Отпускание разделителя: `parts.request("frame")` вместо `render()`.
- `select(date)`: сразу `headers?.render()`, затем как сейчас `data.selectDay()`.
- `onOpen`: перед `await this.data.load()` — `this.render()` (пустые списки, сетка часов с подписями, прокрутка к сейчас).
- `TaskSelection.forgetDrawn(): void` — очищает `latest` (карточки, нарисованные заново, добавятся в `attach`); `picked` и `anchor` не трогает.

- [ ] **Step 1: Тесты**
  - `ScreenParts`: не занят → `request("events")` сразу рисует `{"events"}`; занят → `request("tasks")`, `request("events")`, `request("tasks")` ничего не рисуют, `flush()` рисует `{"tasks","events"}` один раз; повторный `flush()` — ничего.
  - `TaskSelection`: после `forgetDrawn()` и 100 циклов «нарисовать 3 карточки с новыми ключами» размер внутренней карты ≤ 3 (через публичный метод, который уже отдаёт карточку по ключу, или новый `drawnCount` только если без него не проверить); выбранная задача, нарисованная заново, остаётся выбранной.
- [ ] **Step 2:** запустить — FAIL.
- [ ] **Step 3:** Реализовать `ScreenParts`, `forgetDrawn`, переписать `render`/`draw` и места вызова в виде, как в Interfaces.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `View: the frame, the tasks and the events are drawn apart; a gesture holds them all`.

### Task 3: Минута

**Files:**
- Modify: `src/ui/Timeline.ts`, `src/ui/TaskCalendarView.ts`
- Test: `tests/ui/Timeline.test.ts`

**Interfaces:**
- Produces: `Timeline.tickNow(): void` — если линия «сейчас» есть: текст пилюли = `formatTime(minutesOf(now()))`, затем `layout()` (двигает линию, задачи, догоняющие её, и прячет подписи часов под пилюлей). Элементы задач и событий не пересоздаются.
- В виде: `tick()`:
  - `document.hidden` или вид не на экране (`!this.contentEl.isShown()`) → `this.ticked = false` (флаг «пропущена минута») и выход.
  - если день по границе (`today()`) не равен последнему виденному (`this.shownToday`) → `shownToday = today()`, `await deps.tasks.normalize()`, `parts.request("frame")`, `void data.tasks()` (перезагрузка задач — даже если `normalize` ничего не записал).
  - иначе → `timeline.tickNow()`.
- `visibilitychange` на видимость и `onResize` (вид снова показан): если минута была пропущена — `tick()` сразу.
- `normalize()` больше не зовётся каждую минуту.

- [ ] **Step 1: Тесты** (`Timeline`):
  - `"moves the now line and the pill's time without drawing the items again"`: после `render()` взять ссылки на элементы задач и событий, сдвинуть `now` на 7 минут, `tickNow()` → те же узлы, текст пилюли новый, `--tc-y` линии изменился.
  - `"a task that passed the now line follows it on the tick"`: открытая задача со слотом раньше `now` стоит на линии; после сдвига `now` — снова на линии.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать `tickNow` и `tick` в виде.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `The minute moves the now line only; the day's change normalizes and reloads; a hidden view waits`.

### Task 4: Что делать при смене настроек

**Files:**
- Create: `src/ui/settingsEffect.ts`
- Modify: `src/ui/TaskCalendarView.ts` (`onSettings`)
- Test: `tests/ui/settingsEffect.test.ts`

**Interfaces:**
- Produces: `export interface SettingsEffect { readonly restack: boolean; readonly reload: boolean; readonly newDay: boolean }` и `export function settingsEffect(before: TaskCalendarSettings, after: TaskCalendarSettings): SettingsEffect`:
  - `restack` — изменились `cardHeight` или `cardGap`;
  - `reload` — изменились `tasksFile`, `sections` (любое имя), `dueDateMarker`, `slotMarker`, `groups.ungrouped`, `groups.presets` или уровни приоритетов (то, что сейчас проверяет `sameLevels`);
  - `newDay` — изменился `dayStartHour`.
- Вид хранит снимок прошлых настроек (`this.seen`), в `onSettings` считает эффект, обновляет снимок и делает: `restack` → `timeline.layoutTasks()`; `reload` → `void data.tasks()`; `newDay` → текущая ветка с `select(today())`.

- [ ] **Step 1: Тесты** — по одному на каждое поле каждого флага (true), и `"nothing for the divider, the zoom or the column shown"` → все false для `listShare`, `zoom`, `rightMode`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать и подключить.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `Settings: the card size restacks, the file and its names reload, nothing else redraws`.

### Task 5: Удержание на удалённой карточке и наблюдатель размера

**Files:**
- Modify: `src/ui/drag/LongPress.ts` (`fire`), `src/ui/Timeline.ts`, `src/ui/TaskCalendarView.ts` (`onClose`)
- Test: `tests/ui/LongPress.test.ts`, `tests/ui/Timeline.test.ts`

**Interfaces:**
- `LongPress.fire`: если `!this.el.isConnected` — `end()` и выход, без `onStart`/`onLongTap`.
- `Timeline.destroy(): void` — `disconnect()` своего `ResizeObserver`; вид зовёт его в `onClose`.

- [ ] **Step 1: Тесты**: `"a press on a card drawn away meanwhile starts nothing"` (нажать, удалить элемент из DOM, промотать таймеры на `longPressMs`) → `onStart` не вызван; `"stops watching its size once destroyed"` (подменить `ResizeObserver` в тесте шпионом) → `disconnect` вызван.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` PASS, `npm run build` OK.
- [ ] **Step 5:** Commit `A press on a card a redraw took away starts nothing; the timeline stops watching its size on close`.

### Task 6: Проверка (ведущий)

- [ ] Тестовый Obsidian, файл на ~1000 строк, счётчики вызовов `TaskList.render` и `renderAllDayRows` (обёртки в консоли): опрос календаря с теми же событиями — 0 перерисовок; новый ответ событий — списки 0; минута — списки 0; переключение колонок — списки 0; разделитель — списки 0; действие с задачей — одна перерисовка списков (эхо — 0).
- [ ] Замер «действие до экрана» тем же `measure.js`, что в блоке 1, при CPU ×6.
- [ ] Визуально, телефон и Mac, светлая и тёмная: слайд колонок без рывка; открытие — таймлайн сразу на сейчас; стрелки дня — дата сразу; быстрый ввод открыт во время опроса — поле на месте; две вкладки календаря рядом — действие в одной видно в другой.
- [ ] Итог в спеку, строка в таблицу обзора.
