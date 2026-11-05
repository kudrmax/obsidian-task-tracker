# Блок 7 «Секции списка» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Какие секции предлагает меню задачи (одиночное и групповое), как список раскладывается по секциям и показывает ли заголовки, что значит «в секцию X» — отвечает `application`. В виде остаётся только то, что про DOM: в какой колонке стоит карточка и показывает ли эта колонка секции. Поведение, вид, `data.json` и запись в файл — те же: меню секций предлагает те же имена в том же порядке, «в секцию X» (одна задача и несколько) пишет то же, новая секция, переименование, удаление, заголовки и зазоры не меняются.

**Architecture:** Новые типы и правила — `application/sections.ts`, отдаются через `contracts.ts` (как `acceptsDrop` в блоке 6): `listView(items, sections)` — группы и заголовки списка; `sectionChoice(tasks, offer)` — выбор секций для одной или нескольких задач. Имена секций по спискам считает сервис при чтении экрана: `TaskService.sectionOffer(date)` читается в `DayData` вместе с четырьмя списками. Запись — `TaskService.toSection(keys, name)`: одна задача — тот же одиночный вызов, что сейчас (`moveToGroup`/`createGroup`), несколько — `applyAll` с теми же шагами.

**Tech Stack:** TypeScript, vitest + happy-dom, esbuild, Obsidian (тестовый, CDP).

**Spec:** `docs/superpowers/specs/2026-11-05-layers-7-sections-design.md`, обзор `2026-11-05-layers-overview.md`, секции — `2026-10-31-sections-design.md`.

## Что в спеке уже не так (сверено с master 4a3fdab, после блока 6)

- **«Это то же множество» — неверно.** Вид собирает имена из того, что загрузил: `dayView(selectedDate).list`, `soonWithoutDateView`, `inboxView`, `backlogView`. Это не весь файл: задача Now на сегодняшнем таймлайне не стоит в колонке дня, а задача Soon с датой видна только в колонке своего дня. Секция Now, где только задача на слоте сегодня, и секция Soon, где только задачи с датой другого дня, сейчас в меню не предлагаются (кроме заготовок). Порядок — порядок первого появления в этой склейке (колонка позднего дня идёт раньше Soon без даты), а не порядок секций в файле. Подсчёт «по файлу» поменял бы меню, поэтому сервис считает по тем же выборкам для того же дня: `sectionOffer(date)` — `dayList(date)`, Soon без даты, Inbox, Backlog из одного документа. Характеризующие тесты держат оба случая.
- **`sectionChoices(keys): Promise<…>` не годится для меню.** `showMenu` открывает меню синхронно (долгое нажатие на телефоне держит палец, `lifted` вешает копию сразу); ожидание чтения файла перед открытием поменяло бы жест. Поэтому имена приходят заранее, вместе со списками (`DayData.sections`, тот же `Promise.all`, тот же документ), а выбор для задач — чистая функция `sectionChoice(tasks, offer)` в `application`: подзадача, задача Done, задачи разных списков — `null`; `current` — секция первой. Заготовки и имя «No section» сервис берёт из настроек при чтении; смена заготовок или имени перечитывает задачи (`readsAnew`), так что меню видит новые как сейчас.
- **«Та же секция — ничего» остаётся в `TaskMenu`.** Сейчас одиночное меню не пишет при выборе своей секции, а групповое меню пишет (`createGroup` каждой — задачи встают в конец секции), и новая секция с именем своей секции тоже пишет. `toSection` в сервисе пропуска не делает, иначе поменялись бы групповое меню и «новая секция»; пропуск — выбор строки меню, он остаётся в `TaskMenu`. Новая секция из меню идёт тем же `toSection([key], name)`: это ровно тот `createGroup` с тем же списком и датой.
- **`ListView` не поле списков, а правило над тем, что колонка рисует.** Колонка убирает из списка карточку, которая ждёт имени новой секции (`unnamed`), а `DayPeek` рисует свой день; секция, где осталась только эта карточка, сейчас пропадает вместе с заголовком, а последний заголовок — со всеми. Готовые группы от сервиса пришлось бы снова фильтровать в виде тем же правилом. Поэтому `listView(items, sections)` — функция `application`, `TaskList` зовёт её над своими задачами: `sections` — показывает ли колонка секции (`DayColumn.sections` и колонки Inbox/Soon/Backlog), `showsHeaders` — есть ли хоть одна секция. Без секций — одна группа «вне секций» со всеми задачами, даже пустая, как сейчас `groupsOf`.
- **«Список без заголовков пишет `group: null`»** уходит в группы: карточка берёт секцию той группы, в которой нарисована (`cardOf` по группе, не по `withHeaders`). Без заголовков группа одна, `null`; с заголовками группа карточки — её `item.group`. То же значение.
- **`listGroups.ts` раскладывает готовые группы:** остаются `listGaps`, `gapPlace`, `GapPlace`, `ListGap`; `ListGroup` — тип из контрактов; `listGroups` и `showsHeaders` уходят в `listView`.
- **`GroupNameField`: обрезка имени** — поведение поля ввода (Enter отдаёт `trim`), а `createGroup` и `renameGroup` обрезают сами. Не трогаем.
- **Строки стража.** Вид по-прежнему читает настройки (`ports.ts`, `settings.ts`) ради другого; строк про секции в `ALLOWED` нет — вычёркивать, вероятно, нечего, проверяется тестом стража.
- **Демо.** `DemoTaskService.sectionOffer` — заготовки `DEFAULT_SETTINGS` в каждом списке (у демо нет секций, меню демо предлагает заготовки, как сейчас); `toSection` ничего не делает, как `createGroup` демо.

## Global Constraints

- Рефакторинг: ни вида, ни записи в файл, ни `data.json`, ни поведения не меняется. `docs/plugin/` не меняется.
- Сначала характеризующие тесты против текущего кода: дословная копия `sectionChoice`/`sectionsHome`/`bulkSections`/`toSection` вида поверх настоящих `TaskServiceImpl`; потом перенос; ожидания не меняются.
- Перенос правила = перенос его тестов: `listGroups`/`showsHeaders` из `tests/ui/listGroups.test.ts` → `tests/application/sections.test.ts` (через `listView`); зазоры остаются в UI.
- Контракты только добавляют: `SectionChoice` (переезжает из `ui/menu/SectionChooser.ts`), `SectionOffer`, `ListGroup`, `ListView`, `listView`, `sectionChoice`, `TaskService.sectionOffer`, `TaskService.toSection`; оба метода — и в `tests/fakes/DemoTaskService.ts`.
- `ALLOWED` в страже — ровно оставшиеся нарушения.
- Стиль соседнего кода: табы, короткие английские doc-комментарии.
- `npm test`, `npm run build:demo`, `npm run build` (последней) зелёные; `phone/task-calendar-phone.js` — только если его требуют `tests/phone`.

---

### Task 1: Характеризующие тесты секций

**Files:**
- Create: `tests/application/sections.test.ts`

- [ ] Файл: Inbox (вне секций и секция), Now (подзадача, секции, секция только с задачей на сегодняшнем слоте, две задачи в одной секции), Soon (без даты, с датой позднего дня D, секция только с задачами дня D, секция-заготовка), Backlog (секция), Done. Заготовки с пробелами, пустой и именем «No section».
- [ ] Выбор: задача Now сегодня, задача в секции, Soon без даты на сегодня и на день D (секция дня D первой), задача Soon с датой D, Inbox, Backlog, подзадача, задача Done — `null`; групповой: две Now (`current` первой, `shared`), две в одной секции, Soon с датой и без на D, Inbox + Soon и задача со своей подзадачей — `null`.
- [ ] Запись: одна — в существующую, в «No section», в заготовку, где только задача на слоте, в новую заготовку и новое имя, имя «No section» строкой (новая секция), своя секция (новая секция с тем же именем), Soon с датой — дата остаётся, Inbox, Backlog; несколько — в секцию, в свою общую секцию, в «No section» Soon с датой, новую заготовку в Inbox, новое имя.
- [ ] `npm test` — PASS. Commit.

### Task 2: Группы списка в `application`

**Files:**
- Create: `src/application/sections.ts`
- Modify: `src/application/contracts.ts`, `src/ui/listGroups.ts`, `src/ui/TaskList.ts`, `src/ui/drag/GroupDrag.ts`, `src/ui/TaskCalendarView.ts`, `tests/ui/listGroups.test.ts`, `tests/application/sections.test.ts`

```ts
// application/sections.ts
export interface ListGroup { readonly name: GroupName; readonly items: readonly TaskItem[] }
export interface ListView { readonly showsHeaders: boolean; readonly groups: readonly ListGroup[] }
/** A list that shows sections: its tasks by section, where each first shows; one that shows none: one run outside any. */
export function listView(items: readonly TaskItem[], sections: boolean): ListView;
```

- [ ] `TaskList` берёт группы и заголовки из `listView`; карточка — секцию своей группы. `listGroups.ts` — только зазоры.
- [ ] Тесты `listGroups`/`showsHeaders` → `listView` в `tests/application/sections.test.ts`, те же ожидания; плюс список без секций — одна группа, и пустой тоже.
- [ ] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 3: Выбор секций и `toSection` в `application`

**Files:**
- Modify: `src/application/sections.ts`, `src/application/contracts.ts`, `src/application/TaskServiceImpl.ts`, `tests/fakes/DemoTaskService.ts`, `tests/application/sections.test.ts`

```ts
// contracts.ts
export interface SectionChoice { readonly names: readonly string[]; readonly current: GroupName; readonly ungrouped: string }
/** The sections each list offers on a day: those its tasks on the screen stand in, in the order they show, then the presets it lacks. */
export interface SectionOffer { readonly lists: Readonly<Record<GroupedList, readonly string[]>>; readonly ungrouped: string }
interface TaskService {
	sectionOffer(date: LocalDate): Promise<SectionOffer>;
	/** Into section `name` of each task's list (null: outside any), a task of Soon keeping its due date; one task as `moveToGroup`/`createGroup`, several as one `applyAll`. */
	toSection(keys: readonly TaskKey[], name: GroupName): Promise<void>;
}
// application/sections.ts
export function sectionChoice(tasks: readonly TaskItem[], offer: SectionOffer): SectionChoice | null;
```

- [ ] `sectionOffer`: `dayList(date)`, Soon без даты, Inbox, Backlog одного документа; для каждого списка — секции его задач в порядке появления, потом заготовки (обрезанные), без повторов, пустых и «No section».
- [ ] `toSection`: задача по ключу из файла (устаревший ключ — `StaleTaskError`), список — её, дата — её срок для Soon.
- [ ] Демо: `sectionOffer` — заготовки по умолчанию, `toSection` — ничего.
- [ ] Характеризующие тесты бегут через `sectionOffer` + `sectionChoice` и `svc.toSection` (копия вида уходит), ожидания те же.
- [ ] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 4: Вид спрашивает сервис

**Files:**
- Modify: `src/ui/DayData.ts`, `src/ui/TaskCalendarView.ts`, `src/ui/BulkController.ts`, `src/ui/menu/SectionChooser.ts`, `tests/ui/BulkActions.test.ts`, `tests/ui/DayData.test.ts`

- [ ] `DayData` читает `sectionOffer(date)` вместе со списками, отдаёт `sections`.
- [ ] Вид: `sectionChoice`, `bulkSections` с `change`, правило дат Soon и список/дата в `sectionsHome` уходят; остаётся `sectionColumn(card)` — колонка карточки, если она показывает секции. Меню: `sectionChoice([item], data.sections)`; «в секцию» и новая секция — `tasks.toSection([item.key], name)`. Групповое: все карточки в колонках с секциями → `sectionChoice(items, …)`, `shared` — по задачам; запись — `toSection(keys, name)`.
- [ ] `BulkSections` — `{ choice, shared }`; `BulkController` отдаёт `toSection(keys, name)` и отпускает выбор, как сейчас.
- [ ] `SectionChoice` — тип из контрактов.
- [ ] `grep -nE "createGroup|moveToGroup|presets|dueDate" src/ui/TaskCalendarView.ts` — секций больше нет; страж — `ALLOWED` по факту.
- [ ] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 5: Сборки, проверка в тестовом Obsidian, ход работы

- [ ] `npm test`, `npm run build:demo`, `npm run build` — PASS.
- [ ] Тестовый Obsidian (порт 9371, свой профиль и vault в scratchpad; `basePath` — свой vault): сборка ветки, плагин перезагружен; Mac и телефон (390×844, `app.emulateMobile(true)`), светлая и тёмная: меню задачи → секция (те же имена), в секцию, новая секция из меню; на Mac две выбранные → групповое «в секцию»; переименование и удаление секции из её заголовка. Файл после каждого; ошибок плагина в консоли нет; файл задач восстановлен.
- [ ] Строка 7 в «Ход работы» обзора. Commit.
