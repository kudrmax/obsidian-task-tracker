# Блок 9 «Меню и границы слота» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Что делает In progress / Stop progress (одной задаче и группе), по какому кругу идёт напоминание, у какой задачи оно есть, с чего начинается описание и что значит одинокий маркер, какой у задачи чистый заголовок, сколько минут в дне, как слот держится внутри дня и как событие обрезается краями дня — отвечает домен; UI берёт это через контракты и держит подписи и жесты. Поведение то же: меню задачи и групповое меню показывают те же строки и переключают так же, лист описания, перетаскивание и растягивание на таймлайне и обрезка событий не меняются, запись в файл та же.

**Architecture:** Правила статуса и напоминания — чистые функции в `domain/Task.ts` (`nextProgress`, `nextReminder`, `canRemind`), контракты их отдают; `TaskItem.can.remind` и `TaskItem.title` считает `toItem`. Описание: `DESCRIPTION_TEMPLATE` — в `domain/description.ts`, `TaskDocument.setDescription` сам считает одинокий маркер пустым. Длина дня — `MINUTES_PER_DAY` в `domain/LocalDate.ts`, одна на весь код; `clampSlot` (слот целиком внутри дня, длина сохраняется) и `DayBoundary.clipToDay` (событие обрезано краями дня) — в `domain/DayBoundary.ts`.

**Tech Stack:** TypeScript, vitest + happy-dom, esbuild, Obsidian (тестовый, CDP).

**Spec:** `docs/superpowers/specs/2026-11-05-layers-9-menu-slot-design.md`, обзор `2026-11-05-layers-overview.md`.

## Что в спеке уже не так (сверено с master f3a89cc, после блока 8)

- **`progressTile` нет.** Статус в меню задачи считают `statusTiles` (подпись) и `showMenu` (`nextStatus`), в групповом — `bulkProgress` (подпись и статус). Правило одно: `nextProgress(statuses)` — `todo`, если все в работе, иначе `inProgress`; для одной задачи — `[item.status]`. Подписи («In progress» / «Stop progress») остаются в UI и выводятся из ответа правила. Тест правила — в `tests/domain`, тесты подписей — в UI.
- **`REMINDER_KINDS` UI не нужен.** UI держит только подписи (`Record<ReminderKind, string>`), порядок ему не нужен: круг — `nextReminder(kind)` из контрактов. Порядок остаётся в домене (`REMINDER_KINDS`) и в контракты не выходит.
- **`can.remind`.** «Напоминание есть только у задачи со слотом» — `canRemind(slot)` в домене, `TaskItem.can.remind` считает `toItem`; меню показывает строку Reminder по нему. Новое поле — в `DemoTaskService`, `tests/fakes/itemOnDay.ts` (считает его так же, из `slot`) и фикстурах с явным `can`.
- **`DESCRIPTION_TEMPLATE` UI нужен:** лист ставит его в пустой редактор (Add description). Константа — в домене, контракты её отдают. Одинокий маркер (`DESCRIPTION_TEMPLATE.trim()` после `trim()`) — нет описания: правило в `TaskDocument.setDescription`, сервис и демо получают текст как есть; `keptDescription` уходит. Путь «лист → файл» пишет то же: сейчас лист отдаёт `""` вместо одинокого маркера, после — сервис сам читает его как `""`. Прямой вызов `setDescription(key, "- ")` раньше записал бы строку `- `; таких вызовов, кроме листа, нет.
- **`plainText(item.text)` → `TaskItem.title`.** Считает `toItem` (и демо); `onDay` выводит его из `text`, если не дан. После этого UI `plainText` не зовёт, и контракты перестают его отдавать (`textParts` и `TextPart` остаются: их зовёт `TaskTitle`, и для незаписанного текста тоже).
- **`TaskTitle.textParts`** — сделано в блоке 1, не трогается.
- **`clampSlot(start, end, minMinutes)` → `clampSlot(start, end)`.** Наименьшая длина — доменная: `DayBoundary.clamp` при записи слота держит те же 5 минут (`SLOT_STEP` в `operations.ts`), а `LAYOUT.minSlotMinutes` (5) — её копия в UI. Константа становится одной (`MIN_SLOT_MINUTES` в `DayBoundary.ts`, её берут `operations.ts` и `clampSlot`), `LAYOUT.minSlotMinutes` уходит. `clampSlot` сдвигает слот целиком (длина сохраняется), как `TimelineDrop.show`: `start = min(MINUTES_PER_DAY − (длина ?? MIN_SLOT_MINUTES), max(0, start))`. Это не `DayBoundary.clamp` (тот режет конец) — поэтому отдельная функция над минутами дня.
- **Растягивание (`DragController.beginResize`) `clampSlot` не берёт.** Там тянется один край: конец — `min(MINUTES_PER_DAY, max(start, at))`, начало — `max(0, …)`; длина не сохраняется, наименьшей длины нет (её заменяет порог в пикселях `stretchedSpan`). Берёт только `MINUTES_PER_DAY` из контрактов. «Нет длительности» после `stretchedSpan` уже приводится доменом при записи (`placeOnTimeline` → `DayBoundary.clamp`), и вызов `clampSlot` в UI ничего бы не поменял — не добавляется.
- **`snapMinutes`** держит снап в пределах `[0, MINUTES_PER_DAY]` — это жест, остаётся в UI с длиной дня из контрактов.
- **Длина дня записана не дважды, а семь раз:** `DAY_MINUTES` в `DayBoundary.ts`, `TaskLine.ts`, `PhoneReminderService.ts`, `1440` в `LocalDate.parseHHMM`, `MINUTES_PER_DAY` в `ui/dates.ts`, `LAYOUT.minutesPerDay`, плюс `DESIGN.dayHours` (24). Все, кроме `DESIGN.dayHours`, берут `MINUTES_PER_DAY` из `domain/LocalDate.ts` (UI — из контрактов). `DESIGN.dayHours` и токен `--tc-day-hours` остаются (их сверяет `styles.test.ts`); новый тест держит `DESIGN.dayHours × 60 = MINUTES_PER_DAY`. `phone/task-calendar-phone.js` пересобирается, если `tests/phone` этого потребуют.
- **Страж.** Строк про меню и слот в `ALLOWED` нет; вычёркивать, вероятно, нечего — проверяется тестом стража.

## Global Constraints

- Рефакторинг: ни вида, ни записи в файл, ни `data.json`, ни поведения не меняется. `docs/plugin/` не меняется.
- Сначала характеризующие тесты там, где правило переезжает без тестов (сдвиг слота у конца дня при броске, обрезка события краями дня), потом перенос; ожидания не меняются.
- Перенос правила = перенос его тестов: `nextReminder`, «Stop progress, только если все в работе», `keptDescription` → `tests/domain`; в UI остаются тесты подписей и того, что UI спрашивает правило.
- Контракты добавляют `MINUTES_PER_DAY`, `clampSlot`, `nextProgress`, `nextReminder`, `DESCRIPTION_TEMPLATE`, `TaskItem.can.remind`, `TaskItem.title`, `DayBoundary.clipToDay`; убирают `plainText` (его больше никто в UI не зовёт); `setDescription` сам читает одинокий маркер как пустое.
- `DESIGN`/CSS-токены не меняются, `tests/styles.test.ts` не ослабляется.
- Стиль соседнего кода: табы, короткие английские doc-комментарии.
- `npm test`, `npm run build:demo`, `npm run build` (последней) зелёные.

---

### Task 1: Характеризующие тесты границ дня

**Files:**
- Create: `tests/ui/TimelineDrop.test.ts`
- Modify: `tests/ui/Timeline.test.ts`

- [x] `TimelineDrop` над фейковым таймлайном (`minutesAt`, `viewBox`, `showDrop`, `slotAt`, `el`): бросок задачи с длиной 60 у конца дня — начало `1380`, конец `1440`; новая задача без длины у конца — `1435`; выше начала дня — `0`; снап по шагу.
- [x] `Timeline`: событие, начатое до дня и кончающееся после, — от `0` до `1440`; с днём от 4 часов — то же по его краям; событие внутри дня — как есть.
- [x] `npm test` — PASS. Commit.

### Task 2: Длина дня — одна, в домене

**Files:**
- Modify: `src/domain/LocalDate.ts`, `src/domain/DayBoundary.ts`, `src/domain/TaskLine.ts`, `src/application/PhoneReminderService.ts`, `src/application/contracts.ts`, `src/ui/dates.ts`, `src/ui/design.ts`, `src/ui/drag/snap.ts`, `src/ui/drag/DragController.ts`, `src/ui/drag/TimelineDrop.ts`, `src/ui/Timeline.ts`, `tests/ui/Timeline.test.ts` (или рядом)

```ts
// domain/LocalDate.ts
/** Minutes in a day: the timeline's length, and the latest a time of day reads. */
export const MINUTES_PER_DAY = 1440;
```

- [x] Все `DAY_MINUTES`/`1440`/`LAYOUT.minutesPerDay`/`MINUTES_PER_DAY` в `ui/dates.ts` → `MINUTES_PER_DAY`; `LAYOUT.minutesPerDay` уходит.
- [x] Тест: `DESIGN.dayHours * 60 === MINUTES_PER_DAY`.
- [x] `npm test`, `npx tsc --noEmit` — PASS; `phone` пересобран, если `tests/phone` красный. Commit.

### Task 3: Слот внутри дня и событие по краям дня

**Files:**
- Modify: `src/domain/DayBoundary.ts`, `src/domain/operations.ts`, `src/application/contracts.ts`, `src/ui/drag/TimelineDrop.ts`, `src/ui/Timeline.ts`, `src/ui/design.ts`, `tests/domain/DayBoundary.test.ts`

```ts
// domain/DayBoundary.ts
/** The fewest minutes a slot lasts, and a task at a time keeps before the day ends. */
export const MIN_SLOT_MINUTES = 5;
/** A slot moved, as long as it is, to lie within the day: one without a duration starts MIN_SLOT_MINUTES before it ends at the latest. */
export function clampSlot(start: number, end: number | null): Span;
class DayBoundary {
	/** Minutes from the start of `day` to `start` and `end`, cut at the day's edges. */
	clipToDay(day: LocalDate, start: Date, end: Date): { start: number; end: number };
}
```

- [x] `clampSlot` — та же формула, что в `TimelineDrop.show`; `MIN_SLOT_MINUTES` заменяет `SLOT_STEP` в `operations.ts` и `LAYOUT.minSlotMinutes`.
- [x] Тесты в `tests/domain/DayBoundary.test.ts`: длина сохраняется у конца, без длины — `1435`, до начала — `0`; `clipToDay` — оба края, день от 4 часов, событие внутри.
- [x] `TimelineDrop.show` — `clampSlot`, `Timeline.eventSpan` — `boundary.clipToDay`. Характеризующие тесты задачи 1 — без изменений.
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 4: Статус и напоминание — правила домена

**Files:**
- Modify: `src/domain/Task.ts`, `src/application/contracts.ts`, `src/application/taskItems.ts`, `src/ui/menu/TaskMenu.ts`, `src/ui/menu/BulkMenu.ts`, `tests/fakes/DemoTaskService.ts`, `tests/fakes/itemOnDay.ts`, фикстуры `TaskItem` с явным `can`, `tests/ui/TaskMenu.test.ts`, `tests/ui/BulkActions.test.ts`, `tests/application/taskItems.test.ts`
- Create: `tests/domain/Task.test.ts` (или в существующий тест домена)

```ts
// domain/Task.ts
/** In progress for any task not yet in progress; for tasks all in progress, back to todo. */
export function nextProgress(statuses: readonly TaskStatus[]): TaskStatus;
/** The kinds a reminder goes round: notification, alarm, off. */
export const REMINDER_KINDS: readonly ReminderKind[];
export function nextReminder(kind: ReminderKind): ReminderKind;
/** Only a task on a time reminds. */
export function canRemind(slot: Slot | null): boolean;
// contracts.ts
readonly can: { readonly postpone: boolean; readonly removeDue: boolean; readonly remind: boolean };
```

- [x] Тесты домена: `nextProgress` — одна в работе → `todo`, todo → `inProgress`, группа: все в работе → `todo`, не все → `inProgress`; круг напоминания; `canRemind`.
- [x] `TaskMenu`: `statusTiles` и плитка progress — по `nextProgress([item.status])`; строка Reminder — по `item.can.remind`, тап — `nextReminder` из контрактов; `REMINDER_ORDER` и свой `nextReminder` уходят. `BulkMenu.bulkProgress` — по `nextProgress(items.map(status))`, подпись из ответа.
- [x] `toItem`, демо, `onDay` — `can.remind`; `taskItems.test` — поле в ожиданиях. UI-тест: строка Reminder идёт за `can.remind`, а не за слотом.
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 5: Чистый заголовок — `TaskItem.title`

**Files:**
- Modify: `src/application/contracts.ts`, `src/application/taskItems.ts`, `src/ui/menu/TaskMenu.ts`, `tests/fakes/DemoTaskService.ts`, `tests/fakes/itemOnDay.ts`, фикстуры `TaskItem`, `tests/application/taskItems.test.ts`, `tests/ui/TaskMenu.test.ts`

- [x] `TaskItem.title` — `plainText(text)`; вопрос Delete / Won’t do / Stop берёт `item.title`. Контракты больше не отдают `plainText`.
- [x] Тест `toItem`: заголовок задачи со ссылками — слова ссылок; UI-тест: вопрос показывает `item.title`.
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 6: Описание — шаблон и одинокий маркер в домене

**Files:**
- Modify: `src/domain/description.ts`, `src/domain/TaskDocument.ts`, `src/application/contracts.ts`, `src/ui/sheet/DescriptionSheet.ts`, `tests/fakes/DemoTaskService.ts`, `tests/ui/DescriptionSheet.test.ts`, `tests/domain/description.test.ts`, `tests/application/TaskServiceImpl.test.ts`

```ts
// domain/description.ts
/** A new description starts as one empty point; the point alone is no description. */
export const DESCRIPTION_TEMPLATE = "- ";
```

- [x] `TaskDocument.setDescription`: текст, который после `trim()` — `DESCRIPTION_TEMPLATE.trim()`, — пустой (описание уходит, у задачи без него ничего не пишется). Тесты `keptDescription` → `tests/domain/description.test.ts`; тест сервиса: `"- "` и `"  -  \n"` убирают описание, `"- a"` пишется.
- [x] Лист: `DESCRIPTION_TEMPLATE` в пустой редактор, `onSave` получает текст как есть; `keptDescription` удалён; тест листа: одинокий маркер уходит в `onSave` как есть.
- [x] Демо: одинокий маркер — нет описания, как в сервисе.
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 7: Страж, сборки, проверка в тестовом Obsidian, ход работы

- [x] `grep -n "1440\|minutesPerDay\|REMINDER_ORDER\|keptDescription\|plainText" src/ui` — пусто; страж — `ALLOWED` по факту.
- [x] `npm test`, `npm run build:demo`, `npm run build` — PASS.
- [x] Тестовый Obsidian: сборка ветки, перезагрузка, `setBackgroundThrottling(false)`. Mac и телефон (390×844, `app.emulateMobile(true)`), светлая и тёмная: In progress / Stop progress одной задаче и (Mac) двум выбранным; строка Reminder у задачи со слотом идёт по кругу, у задачи без слота её нет; описание — открыть, написать, очистить (одинокий `-` — нет описания); растянуть блок до конца дня и бросить блок у конца дня. Файл после каждого шага; ошибок плагина в консоли нет; файл задач восстановлен.
- [x] Строка 9 в «Ход работы» обзора. Commit.

## Итог проверки (05.11)

Тестовый Obsidian (порт 9473, профиль `profile-4`, свой vault; день начинается в 5:00), Mac и телефон (390×844, `app.emulateMobile(true)`), светлая и тёмная. In progress / Stop progress одной задаче — `[/]` и обратно `[ ]`; на Mac две выбранные: In progress → обе `[/]`, Stop progress → обе `[ ]`, одна в работе и одна нет → плитка In progress, обе `[/]`. Reminder у задачи со слотом: Notification → Alarm (🚨) → Off (🔕) → Notification (⏰); у задачи без слота строки нет. Add description: редактор с `- `, запись — `\t- …` под задачей; чтение, Edit, одинокий `-`, Save — описание ушло, строки Add description снова в меню. Растягивание конца блока за край дня — `21:00-05:00` (конец дня в 5:00); блок 19:00–20:00, брошенный у конца дня, — `04:00-05:00` следующей даты, длина та же. Ошибок плагина в консоли нет; файл задач восстановлен.

